#!/usr/bin/env python3
"""외부 지도 링크 왕복 연동 PoC (specs/archive/2026-07-20-external-map-link-integration-poc.md).

파이프라인: URL Classifier -> Safe Redirect Resolver -> Provider Parser
           -> (og 메타 추출) -> TMAP POI 보완 -> results.json 기록.

표준 라이브러리만 사용. 실행: python3 link_poc.py
"""

import ipaddress
import json
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
ENV_FILE = BASE.parent / ".env"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

# ---- Safe Redirect Resolver 규칙 (문서 5.2) ----
ALLOWED_HOSTS = {
    "KAKAO": {"kko.to", "map.kakao.com", "place.map.kakao.com", "applink.map.kakao.com"},
    "NAVER": {"naver.me", "map.naver.com", "m.place.naver.com", "m.map.naver.com"},
}
MAX_REDIRECTS = 3


def load_env():
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def classify(url):
    """URL Classifier (문서 5.1)."""
    try:
        p = urllib.parse.urlparse(url)
    except ValueError:
        return None
    if p.scheme != "https":
        return None
    host = p.hostname or ""
    for provider, hosts in ALLOWED_HOSTS.items():
        if host in hosts:
            short = host in ("kko.to", "naver.me")
            return {"provider": provider, "urlType": "SHORT_SHARE" if short else "FULL",
                    "requiresRedirectResolution": short}
    return None


def host_is_safe(host):
    """사설 IP·loopback 차단."""
    try:
        infos = socket.getaddrinfo(host, 443)
    except OSError:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False
    return True


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def resolve(url, provider):
    """Safe Redirect Resolver (문서 5.2). (finalUrl, redirectCount) 반환."""
    opener = urllib.request.build_opener(_NoRedirect)
    cur = url
    for count in range(MAX_REDIRECTS + 1):
        p = urllib.parse.urlparse(cur)
        if p.scheme != "https" or p.hostname not in ALLOWED_HOSTS[provider]:
            raise ValueError(f"비허용 호스트: {p.hostname}")
        if not host_is_safe(p.hostname):
            raise ValueError(f"위험 IP 대역: {p.hostname}")
        req = urllib.request.Request(cur, headers=UA)
        try:
            with opener.open(req, timeout=15):
                return cur, count
        except urllib.error.HTTPError as e:
            loc = e.headers.get("Location")
            if e.code in (301, 302, 303, 307, 308) and loc:
                cur = urllib.parse.urljoin(cur, loc)
                continue
            raise ValueError(f"HTTP {e.code}")
    raise ValueError("리다이렉트 초과")


def parse_final(final_url, provider):
    """Provider Parser (문서 5.3). 최종 URL에서 place ID·좌표·이름 추출."""
    p = urllib.parse.urlparse(final_url)
    q = urllib.parse.parse_qs(p.query)
    out = {"placeId": None, "lat": None, "lon": None, "name": None}
    if provider == "NAVER":
        m = re.search(r"/place/(\d+)", p.path)
        if m:
            out["placeId"] = m.group(1)
    else:
        if p.hostname == "applink.map.kakao.com" and "id" in q:
            out["placeId"] = q["id"][0]
        m = re.search(r"place\.map\.kakao\.com/(\d+)", final_url)
        if m:
            out["placeId"] = m.group(1)
        # 공식 링크형: map.kakao.com/link/map/이름,위도,경도
        m = re.search(r"/link/(?:map|to)/([^,]+),([\d.]+),([\d.]+)", p.path)
        if m:
            out["name"] = urllib.parse.unquote(m.group(1))
            out["lat"], out["lon"] = float(m.group(2)), float(m.group(3))
    return out


MOBILE_UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
             "AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"}


def fetch_og_meta(url, ua=None):
    """공유용 og:title/og:description 메타만 추출 (본문 80KB 제한, 문서 5.2 '전체 다운로드 금지')."""
    req = urllib.request.Request(url, headers=ua or UA)
    with urllib.request.urlopen(req, timeout=15) as r:
        html = r.read(80000).decode("utf-8", "ignore")
    metas = dict(re.findall(
        r'<meta[^>]+property="(og:title|og:description)"[^>]+content="([^"]*)"', html))
    return metas.get("og:title"), metas.get("og:description")


def tmap_poi(name, tmap_key, region_hint=""):
    """Place Verifier (문서 5.5): TMAP POI 검색으로 좌표 복원. 상위 3개 반환."""
    kw = f"{region_hint} {name}".strip()
    url = "https://apis.openapi.sk.com/tmap/pois?" + urllib.parse.urlencode(
        {"version": 1, "searchKeyword": kw, "count": 3})
    req = urllib.request.Request(url, headers={"appKey": tmap_key, **UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        body = r.read().decode()
    js = json.loads(body) if body.strip() else {}  # 결과 없으면 빈 본문(204)
    pois = js.get("searchPoiInfo", {}).get("pois", {}).get("poi", [])
    return [{"name": p.get("name"),
             "address": " ".join(filter(None, [p.get("upperAddrName"), p.get("middleAddrName"),
                                               p.get("roadName"), p.get("firstBuildingNo")])),
             "lat": float(p.get("frontLat") or p.get("noorLat")),
             "lon": float(p.get("frontLon") or p.get("noorLon"))} for p in pois]


CASES = [
    ("NAVER-001", "https://naver.me/FPn5rEsI"),
    ("NAVER-002", "https://naver.me/G1wSPK7D"),
    ("NAVER-003", "https://naver.me/xExWjHY5"),
    ("NAVER-004", "https://naver.me/GZZuHQbS"),
    ("KAKAO-001", "https://kko.to/_jYN68pvMI"),
    ("KAKAO-002", "https://kko.to/mQOf0WgPHm"),
    ("KAKAO-003", "https://kko.to/oMkRntJW-t"),
    ("KAKAO-004", "https://kko.to/3yBg9sY4PH"),
]

# H8 검증용 악성·비허용 URL (외부 요청 없이 차단돼야 함)
BAD_URLS = [
    "http://kko.to/abc",                      # https 아님
    "https://evil.example.com/place/1",       # 비허용 도메인
    "https://localhost/place/1",              # loopback
    "https://192.168.0.1/x",                  # 사설 IP
    "not-a-url",
]


def main():
    tmap_key = load_env().get("TMAP_APP_KEY")
    results = []
    for case_id, url in CASES:
        t0 = time.time()
        rec = {"caseId": case_id, "inputUrl": url, "provider": None, "urlType": None,
               "parseSucceeded": False, "redirectCount": 0, "resolutionMethod": None,
               "fallbackApiCalls": 0, "manualConfirmationRequired": True, "notes": ""}
        try:
            cls = classify(url)
            if not cls:
                rec["notes"] = "지원하지 않는 URL"
                raise StopIteration
            rec.update(provider=cls["provider"], urlType=cls["urlType"])
            final_url, n = resolve(url, cls["provider"])
            rec["redirectCount"] = n
            rec["finalUrl"] = final_url
            parsed = parse_final(final_url, cls["provider"])
            rec["sourcePlaceId"] = parsed["placeId"]
            if parsed["lat"]:
                rec.update(resolutionMethod="URL_COORDINATE", parseSucceeded=True,
                           name=parsed["name"], lat=parsed["lat"], lon=parsed["lon"],
                           manualConfirmationRequired=False)
                raise StopIteration
            # 좌표 없음 -> og 메타에서 장소명·주소 시도
            meta_url, ua = final_url, UA
            if cls["provider"] == "KAKAO" and parsed["placeId"]:
                meta_url = f"https://place.map.kakao.com/{parsed['placeId']}"
            elif cls["provider"] == "NAVER" and parsed["placeId"]:
                # PC용 map.naver.com 은 SPA 라 메타가 없음 — 모바일 place 페이지 사용
                meta_url = f"https://m.place.naver.com/place/{parsed['placeId']}/home"
                ua = MOBILE_UA
            name, desc = fetch_og_meta(meta_url, ua)
            if name:
                # 네이버 og:title 은 "장소명 : 네이버" + 제어문자 형태
                name = re.sub(r"\s*:\s*네이버.*$", "", name).strip()
                name = re.sub(r"[\x00-\x1f]", "", name)
            time.sleep(2)
            if name and name not in ("카카오맵", "네이버 지도"):
                rec.update(name=name, address=desc, resolutionMethod="OG_META")
                if tmap_key:
                    # 카카오 desc 는 주소라 지역 힌트로 사용, 네이버 desc 는 리뷰 수라 미사용
                    hint = " ".join((desc or "").split()[:2]) if cls["provider"] == "KAKAO" else ""
                    cands = tmap_poi(name, tmap_key, hint)
                    rec["fallbackApiCalls"] = 1
                    rec["poiCandidates"] = cands
                    if cands:
                        rec.update(lat=cands[0]["lat"], lon=cands[0]["lon"],
                                   parseSucceeded=True,
                                   resolutionMethod="OG_META_PLUS_POI",
                                   manualConfirmationRequired=len(cands) > 1)
            else:
                rec["notes"] = "메타에서 장소명 획득 실패 — 사용자 확인 입력 필요"
        except StopIteration:
            pass
        except Exception as e:
            rec["notes"] = f"{type(e).__name__}: {e}"
        rec["elapsedMs"] = int((time.time() - t0) * 1000)
        results.append(rec)
        print(f"{case_id}: parse={rec['parseSucceeded']} method={rec['resolutionMethod']} "
              f"name={rec.get('name')} confirm={rec['manualConfirmationRequired']} {rec['notes']}")

    # H8: 위험 URL 차단 검증 (네트워크 요청 전 차단)
    print("\n[H8] 위험 URL 차단:")
    h8 = []
    for bad in BAD_URLS:
        blocked = classify(bad) is None
        h8.append({"url": bad, "blocked": blocked})
        print(f"  {'BLOCKED' if blocked else '!!PASSED-THROUGH!!'}: {bad}")

    out = BASE / "results.json"
    out.write_text(json.dumps({"cases": results, "h8_blocklist": h8},
                              ensure_ascii=False, indent=2))
    print(f"\n저장: {out}")


if __name__ == "__main__":
    main()
