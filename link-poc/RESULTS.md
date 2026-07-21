# 외부 지도 링크 왕복 연동 PoC 결과

- 검증일: 2026-07-20
- 대상 문서: `specs/archive/2026-07-20-external-map-link-integration-poc.md`
- 표본: 실제 공유 링크 naver.me 4건 + kko.to 4건 (팀 제공)
- 스크립트: `link_poc.py`(가져오기), `outbound_links.py`(내보내기)
- 산출물: `results.json`, `outbound_test.json`, `test-outbound.html`

## 1. 가져오기(Inbound) 결과 — 8건 중 7건 자동 등록

| 가설 | 기준 | 결과 |
|---|---|---|
| H2 카카오 단축 URL | 90%+ 자동 등록 | ✅ 4/4 (100%) |
| H3 네이버 공유 URL | 80%+ 자동 또는 1회 확인 | ✅ 4/4 장소명, 3/4 좌표 자동, 1건 확인 유도 |
| H5 좌표 없는 링크 복원 | 모호 시 자동확정 금지 | ✅ POI 복수·미검색 시 확인 화면으로 분기 |
| H8 위험 URL 차단 | 100% 차단 | ✅ 5/5 (http·비허용도메인·localhost·사설IP·비URL) |

### 확인된 실제 URL 구조 (문서 5.3 가정과 다름)

- **실 공유 링크에는 좌표·장소명이 없다.** 단축 URL은 place ID만 있는 최종 URL로 리다이렉트된다.
  - 네이버: `naver.me/xxx` → `map.naver.com/p/entry/place/{id}` (307)
  - 카카오: `kko.to/xxx` → `applink.map.kakao.com/place?id={id}` (301)
- 따라서 표준 복원 경로는 **og 메타 → TMAP POI**(`resolutionMethod: OG_META_PLUS_POI`):
  - 카카오: `place.map.kakao.com/{id}` 의 og:title(장소명)+og:description(주소)
  - 네이버: `m.place.naver.com/{id}/home` 의 og:title(장소명, **모바일 UA 필수**, 주소 없음)
- 유일 실패 NAVER-003("클로버베이킹 홍대")은 TMAP POI 미검색 → 설계대로 사용자 확인 입력으로 분기(오확정 0건).

## 2. 내보내기(Outbound) 결과 — 링크 63개 생성, 웹 링크 유효 확인

- 좌표+장소명만으로 카카오·네이버 양쪽 링크 생성 성공 → **출처와 무관하게 교차 열기 가능**(카카오 링크로 가져온 곳도 네이버로 열림).
- 웹 링크 HTTP 검증: 카카오 3종 302 정상 리다이렉트(WGS84→내부좌표 변환 확인), 네이버 2종 200.
- 앱 Scheme(`kakaomap://`, `nmap://`)은 폰 실기기 테스트 필요 → `test-outbound.html` 로 팀이 기록.

### ⚠️ 핵심 발견: 카카오 웹 길찾기는 자동차 기본

- `map.kakao.com/link/to/...` 웹 링크는 `target=car`(자동차)로 열린다. **대중교통 길찾기는 앱 Scheme `kakaomap://route?...&by=PUBLICTRANSIT` 에서만 지정 가능.**
- 결론: PC/앱미설치에서 "대중교통 길찾기"를 정확히 주려면 네이버 웹(`/directions/...transit`)이 유리하고, 카카오는 앱 설치 환경에서만 대중교통 지정이 확실하다. MVP 버튼 문구·분기 설계에 반영 필요.

## 3. MVP 판정 (문서 13장, 표본 8건 기준 잠정)

- **카카오 가져오기 MVP 포함**: 자동 100%.
- **네이버 가져오기 포함하되 "붙여넣기 → 장소 확인" 방식**: 자동 75%, 실패가 안전하게 확인 흐름으로 수렴.
- **og 메타 의존 리스크**: 페이지 구조 변경에 취약 → 장소명 직접 입력을 항상 대체 수단으로 유지(문서 13장 마지막 규칙).
- **네이버 모바일 페이지 429 주의**: 첫 요청에서 Too Many Requests 발생 → 서버는 호출 간격 제어 + place ID→이름 캐시 필수.
- **outbound 대중교통 길찾기**: 카카오 웹은 자동차 기본이므로 앱/웹 버튼 분리(문서 13장 규칙과 일치).

## 4. 남은 단계

- 5단계 실기기: `test-outbound.html` 을 Android·iOS 실기기에서 열어 앱 Scheme 동작/미설치 대체 동작 기록.
- 6단계 A/B: 후보 경로 요약(A) vs 선택 후보 Polyline 지연 표시(B) — 기존 TMAP 전체정보 응답(`api-validation/results/5_tmap_*.json`) 재사용 가능.
