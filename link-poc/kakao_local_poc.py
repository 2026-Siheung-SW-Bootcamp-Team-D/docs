#!/usr/bin/env python3
"""Kakao Local 통합 검색 PoC (기능명세서 v1.3 §16).

docs/.env 의 KAKAO_REST_KEY 로 Kakao Local 공식 REST API만 호출한다.
크롤링·장소 페이지 조회 없음. 대표 표본만 실행하는 간단 버전.

실행: python3 kakao_local_poc.py
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
ENV = BASE.parent / ".env"
KEY = next((l.split("=", 1)[1].strip() for l in ENV.read_text().splitlines()
            if l.startswith("KAKAO_REST_KEY=")), None)
H = {"Authorization": f"KakaoAK {KEY}"}


def get(path, params):
    url = "https://dapi.kakao.com" + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=H)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode()[:200]}


def kw(q, **kw_):
    return get("/v2/local/search/keyword.json", {"query": q, "size": 5, **kw_})


results = {}

# KL-01 사용자 장소명 검색 (동명/프랜차이즈 포함)
print("=== KL-01 장소명 검색 ===")
kl01 = []
for q in ["스타벅스 강남", "정왕역", "국립서울현충원", "긴자료코 부평"]:
    st, js = kw(q)
    docs = js.get("documents", [])
    top = docs[0] if docs else {}
    ok = bool(docs) and all(k in top for k in ("id", "place_name", "place_url", "x", "y"))
    print(f"  {'PASS' if ok else 'FAIL'} '{q}': {len(docs)}건, 1위={top.get('place_name')} ({top.get('category_name','')})")
    kl01.append({"q": q, "count": len(docs), "top": top.get("place_name"),
                 "x": top.get("x"), "y": top.get("y"), "fields_ok": ok})
    time.sleep(0.3)
results["KL01_keyword"] = kl01

# KL-03 도로명·지번 주소 검색
print("=== KL-03 주소 검색 ===")
kl03 = []
for q in ["서울특별시 중구 세종대로 110", "경기도 시흥시 정왕대로 233"]:
    st, js = get("/v2/local/search/address.json", {"query": q})
    docs = js.get("documents", [])
    top = docs[0] if docs else {}
    ok = bool(docs) and top.get("x") and top.get("y")
    print(f"  {'PASS' if ok else 'FAIL'} '{q}': x={top.get('x')}, y={top.get('y')}")
    kl03.append({"q": q, "x": top.get("x"), "y": top.get("y"), "ok": ok})
    time.sleep(0.3)
results["KL03_address"] = kl03

# KL-05 지방 교통 거점 수집 (충주 일대 rect + 키워드) — 최대 리스크
print("=== KL-05 지방 거점 (rect + 키워드) ===")
rect_chungju = "127.85,36.93,128.00,37.01"  # 좌하단X,Y,우상단X,Y
kl05 = []
for kwd in ["기차역", "고속버스터미널", "시외버스터미널", "환승센터", "시청", "터미널"]:
    st, js = get("/v2/local/search/keyword.json",
                 {"query": kwd, "rect": rect_chungju, "size": 15})
    docs = js.get("documents", [])
    names = [d["place_name"] for d in docs[:3]]
    print(f"  '{kwd}': {len(docs)}건 {names}")
    kl05.append({"kwd": kwd, "count": len(docs), "sample": names})
    time.sleep(0.3)
# SW8 지하철역 카테고리 (수도권 강남 일대)
st, js = get("/v2/local/search/category.json",
             {"category_group_code": "SW8", "x": "127.0276", "y": "37.4979",
              "radius": 2000, "size": 15})
sw8 = [d["place_name"] for d in js.get("documents", [])[:5]]
print(f"  SW8 지하철역(강남 2km): {len(js.get('documents', []))}건 {sw8}")
results["KL05_hub"] = {"chungju_keywords": kl05, "sw8_gangnam": sw8,
                       "sw8_count": len(js.get("documents", []))}

# KL-07 좌표→주소 역변환
print("=== KL-07 좌표→주소 ===")
st, js = get("/v2/local/geo/coord2address.json",
             {"x": "127.027619", "y": "37.497942"})
docs = js.get("documents", [])
addr = docs[0] if docs else {}
road = (addr.get("road_address") or {}).get("address_name") if addr else None
jibun = (addr.get("address") or {}).get("address_name") if addr else None
print(f"  강남역 좌표→ 도로명={road} / 지번={jibun}")
results["KL07_coord2addr"] = {"road": road, "jibun": jibun}

(BASE / "results-kakao.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
print("\n저장: results-kakao.json")
