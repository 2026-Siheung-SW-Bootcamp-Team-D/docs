# 외부 API 검증 결과

- 검증일: 2026-07-20
- 실행: `python3 docs/api-validation/validate_apis.py` (원본 응답: `results/*.json`)
- 결과: **18건 전체 PASS** (전체정보 2건은 free 요금제 초당 제한 429 → 3초 간격 재시도로 통과)

## API별 결과

| API | 결과 | 확인된 내용 |
|---|---|---|
| ODsay `searchPubTransIsochrone` | ✅ 6/6 | 강남·정왕·충주 × 30/60분 모두 GeoJSON FeatureCollection 반환. 지방(충주)도 정상 |
| TMAP POI 검색 | ✅ 3/3 | 결과에 좌표(`frontLon`/`noorLon`)·카테고리 포함 → 별도 지오코딩 불필요 가정 성립 |
| TMAP 지오코딩 `fullAddrGeo` | ✅ | WGS84 좌표 반환. **실재하지 않는 주소는 400(A2C500)** → 오류 처리 필요 |
| TMAP 요약정보 `/transit/routes/sub` | ✅ 4/4 | `totalTime`, `totalWalkTime`, `transferCount`, `fare.regular.totalFare`, `pathType` 모두 존재 |
| TMAP 전체정보 `/transit/routes` | ✅ 4/4 | `legs[].mode`, `sectionTime`, `linestring` 존재. 지방권(충주→청주, 시외버스 경로)도 반환 |

## 스펙 문서에 반영할 발견 사항

1. **ODsay 도달권 응답 구조**: `result.geojson.features[]` 형태의 GeoJSON. 60분 폴리곤은 ~56KB로 커서 저장·전송 시 압축/간소화 고려.
2. **TMAP free 요금제는 THROTTLED(429) 발생** — 초당 제한이 낮음. 참여자×후보 평가(최대 30건)를 병렬 호출하면 즉시 걸리므로 **작업 큐에서 호출 간격 제어 + 429 재시도 로직 필수** (스펙 F09/7장에 추가 권장).
3. **`WALK` leg의 `steps[].linestring`은 도보 상세 경로** — 스펙대로 WALK는 그리지 않으므로 무시하면 됨. 버스/지하철 구간은 `passShape.linestring` 사용.
4. **지오코딩 실패 코드**: 주소 미존재 시 `error.code=1100`, 메시지 내 `[A2C500]` — F07 오류 안내 문구 트리거로 사용.
5. **장거리 요금 확인**: 충주→청주 totalFare 14,300원(시외버스 포함) 등 요금 필드가 지방·장거리에서도 채워짐.

## 교집합 PoC (Turf.js, `intersect_poc.js`)

| 시나리오 | 결과 | 의미 |
|---|---|---|
| 강남 60분 ∩ 정왕 60분 | 교집합 93.4km², 65ms | 정상 흐름 성립. 단 **분리 폴리곤 17개** 발생 |
| 강남 30분 ∩ 정왕 30분 | 교집합 없음 | 스펙 F10 "검색시간 한 단계 확대" 흐름 필요성 실증 |
| 강남 60분 ∩ 충주 60분 | 교집합 없음 | 스펙 F12 장거리 모드 전환 조건 실증 |

- 계산 시간 수십 ms 수준 → 서버 실시간 계산에 문제 없음.
- **스펙 F11 보완 필요**: "각 분리 폴리곤에서 최소 1개 후보 유지"는 17개 조각에는 비현실적. 면적 상위 N개(예: 3개) 또는 최소 면적 기준으로 조각을 필터링하는 규칙을 스펙에 추가해야 함.
