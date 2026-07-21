#!/usr/bin/env python3
"""외부 API 응답 검증 스크립트.

docs/.env 에서 ODSAY_API_KEY, TMAP_APP_KEY 를 읽어
기획서(feature-spec)에서 사용하기로 한 5개 API를 실제 호출하고
원본 응답을 docs/api-validation/results/ 에 저장한 뒤 요약을 출력한다.

표준 라이브러리만 사용. 실행: python3 validate_apis.py
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
RESULTS = BASE / "results"
ENV_FILE = BASE.parent / ".env"

# 테스트 좌표 (경도 x, 위도 y)
POINTS = {
    "gangnam": (127.027619, 37.497942),      # 강남역
    "bucheon": (126.783156, 37.484917),      # 부천역
    "jeongwang": (126.742616, 37.345955),    # 시흥 정왕역 인근
    "cheonan": (127.146420, 36.810050),      # 천안역 (장거리)
    "chungju": (127.926000, 36.968600),      # 충주역 (지하철 없는 중소도시)
    "cheongju": (127.437000, 36.625000),     # 청주 시외버스터미널 인근
}

SCENARIOS = [
    ("metro", "gangnam", "bucheon", "수도권: 강남역 -> 부천역"),
    ("suburb", "jeongwang", "gangnam", "경기 외곽: 정왕 -> 강남역"),
    ("long", "gangnam", "cheonan", "장거리: 강남역 -> 천안역"),
    ("rural", "chungju", "cheongju", "지방권: 충주역 -> 청주터미널"),
]


def load_env():
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def call(name, url, headers=None, body=None, method=None):
    """호출 후 원본 응답을 저장하고 (status, parsed_json) 반환."""
    req = urllib.request.Request(url, headers=headers or {}, method=method)
    if body is not None:
        req.data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    status, text = None, ""
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            status, text = r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        status, text = e.code, e.read().decode()
    except Exception as e:
        text = f"REQUEST FAILED: {e}"

    out = RESULTS / f"{name}.json"
    try:
        parsed = json.loads(text)
        out.write_text(json.dumps(parsed, ensure_ascii=False, indent=2))
    except (json.JSONDecodeError, ValueError):
        parsed = None
        out.write_text(text)
    print(f"[{status}] {name} -> {out.name} ({len(text):,} bytes)")
    return status, parsed


def check(label, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}: {label} {detail}")
    return ok


def main():
    env = load_env()
    odsay_key = env.get("ODSAY_API_KEY") or os.environ.get("ODSAY_API_KEY")
    tmap_key = env.get("TMAP_APP_KEY") or os.environ.get("TMAP_APP_KEY")
    if not odsay_key or not tmap_key:
        sys.exit(f"docs/.env 에 ODSAY_API_KEY, TMAP_APP_KEY 를 넣어주세요 ({ENV_FILE})")

    RESULTS.mkdir(exist_ok=True)
    summary = []

    # ---- 1. ODsay 도달권 (최대 리스크) ----
    print("\n=== 1. ODsay searchPubTransIsochrone ===")
    for pname in ("gangnam", "jeongwang", "chungju"):
        x, y = POINTS[pname]
        for t in (30, 60):
            url = (
                "https://api.odsay.com/v1/api/searchPubTransIsochrone?"
                + urllib.parse.urlencode(
                    {"apiKey": odsay_key, "x": x, "y": y,
                     "searchTime": t, "searchMethod": 4}
                )
            )
            status, js = call(f"1_odsay_isochrone_{pname}_{t}min", url)
            if js:
                has_err = "error" in js
                blob = json.dumps(js)
                has_poly = "olygon" in blob or "coordinates" in blob
                check(f"{pname} {t}분: 에러 없음", not has_err, str(js.get("error", "")))
                check(f"{pname} {t}분: 폴리곤 포함", has_poly)
                summary.append(("ODsay isochrone", pname, t, not has_err and has_poly))

    tmap_h = {"appKey": tmap_key, "Accept": "application/json"}

    # ---- 2. TMAP POI ----
    print("\n=== 2. TMAP POI 검색 ===")
    for kw in ("강남역", "정왕역", "부천시청"):
        url = "https://apis.openapi.sk.com/tmap/pois?" + urllib.parse.urlencode(
            {"version": 1, "searchKeyword": kw, "count": 5}
        )
        status, js = call(f"2_tmap_poi_{kw}", url, headers=tmap_h)
        if js:
            pois = (
                js.get("searchPoiInfo", {}).get("pois", {}).get("poi", [])
                if isinstance(js, dict) else []
            )
            ok = bool(pois) and all(("frontLon" in p or "noorLon" in p) for p in pois)
            check(f"'{kw}': POI {len(pois)}건 + 좌표 포함", ok)
            summary.append(("TMAP POI", kw, "-", ok))

    # ---- 3. TMAP 지오코딩 ----
    print("\n=== 3. TMAP 지오코딩 ===")
    url = "https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?" + urllib.parse.urlencode(
        {"version": 1, "fullAddr": "서울특별시 중구 세종대로 110"}
    )
    status, js = call("3_tmap_geocoding", url, headers=tmap_h)
    ok = bool(js) and "coordinateInfo" in json.dumps(js)
    check("주소 -> 좌표 변환", ok)
    summary.append(("TMAP 지오코딩", "-", "-", ok))

    # ---- 4 & 5. TMAP 대중교통 요약/전체 ----
    for num, path, label, fields in [
        (4, "/transit/routes/sub", "요약정보",
         ["totalTime", "totalWalkTime", "transferCount", "totalFare"]),
        (5, "/transit/routes", "전체정보", ["legs", "passShape", "linestring"]),
    ]:
        print(f"\n=== {num}. TMAP 대중교통 {label} ===")
        for key, start, end, desc in SCENARIOS:
            sx, sy = POINTS[start]
            ex, ey = POINTS[end]
            body = {"startX": str(sx), "startY": str(sy),
                    "endX": str(ex), "endY": str(ey), "count": 1}
            status, js = call(f"{num}_tmap_{label}_{key}",
                              f"https://apis.openapi.sk.com{path}",
                              headers=tmap_h, body=body, method="POST")
            if js:
                blob = json.dumps(js)
                missing = [f for f in fields if f not in blob]
                ok = status == 200 and not missing and "error" not in js
                check(f"{desc}: 필수 필드 존재", ok,
                      f"(누락: {missing})" if missing else "")
                summary.append((f"TMAP {label}", key, "-", ok))

    # ---- 요약 ----
    print("\n=== 최종 요약 ===")
    fails = [s for s in summary if not s[3]]
    for api, a, b, ok in summary:
        print(f"  {'PASS' if ok else 'FAIL'}  {api} ({a} {b})")
    print(f"\n총 {len(summary)}건 중 실패 {len(fails)}건. 원본 응답: {RESULTS}/")


if __name__ == "__main__":
    main()
