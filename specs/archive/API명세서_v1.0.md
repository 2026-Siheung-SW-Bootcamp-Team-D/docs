# 약속 올인원 API 명세서

| 항목 | 내용 |
|---|---|
| 문서 유형 | API Specification (Internal REST + SSE) |
| 문서 버전 | 1.0 |
| 작성일 | 2026-07-21 |
| 기준 문서 | `기능명세서_v1.3.md` |
| Base URL | `https://{host}/api/v1` |
| 형식 | JSON (UTF-8), `Content-Type: application/json` |
| 시간대 | 저장·응답 모두 ISO 8601, 보드 기준 시간대는 `Asia/Seoul` |
| 좌표계 | WGS84 (`lon`=경도, `lat`=위도). 외부 응답의 `x`,`y`는 서버에서 `lon`,`lat`으로 정규화해 저장·응답한다 |

## 1. 설계 원칙

1. **외부 API 키는 서버에만 둔다.** 클라이언트는 Kakao Local·ODsay·TMAP을 직접 호출하지 않고 본 API의 프록시 엔드포인트만 사용한다. (기능명세 §8.4-1)
2. **유료 호출을 유발하는 엔드포인트를 명시한다.** §9의 외부 호출 매트릭스에 표시된 엔드포인트만 과금 대상이며, 나머지는 내부 DB만 사용한다. (BR-001, BR-002)
3. **검색은 사용자의 명시적 동작에만 호출한다.** 입력 중 자동 완성 호출을 제공하지 않는다. (§8.4-8)
4. **자동 확정을 하지 않는다.** 검색 결과는 사용자가 선택해야 `Place`가 된다. (BR-003)
5. **비회원 식별은 보드 범위 토큰으로 한다.** 전역 계정이 없으므로 모든 권한 검사는 `boardId + participantToken` 조합으로 수행한다.
6. **오래 걸리는 계산은 비동기 작업으로 분리한다.** 지역 찾기와 대중교통 평가는 202 + 작업 폴링 구조를 사용한다. (기능명세 §12)

## 2. 인증과 식별

### 2.1 토큰 종류

| 토큰 | 발급 시점 | 전달 방법 | 범위 | 서버 저장 |
|---|---|---|---|---|
| 참여 토큰 `participantToken` | 보드 생성 또는 보드 참여 | `X-Participant-Token` 헤더 | 해당 보드 1개 | 해시만 저장 (`editTokenHash`) |
| 초대 코드 `inviteCode` | 보드 생성 | 요청 본문 또는 경로 | 참여 전 보드 식별 | 평문 저장 (공개 정보) |
| 공개 토큰 `publicToken` | 코스 최초 확정 | 공개 URL 경로 | 확정 일정 읽기 전용 | 평문 저장 |

- 참여 토큰은 초대 링크에 포함하지 않는다. 초대 링크에는 `inviteCode`만 넣는다. (F02-06)
- 참여 토큰은 재발급하지 않는다. 분실 시 호스트가 해당 참여자를 비활성화하고 새로 참여시킨다. (기능명세 §3.3)
- 공개 페이지 요청에는 참여 토큰을 보내지 않는다.

### 2.2 요청 헤더

| 헤더 | 필수 | 설명 |
|---|---|---|
| `X-Participant-Token` | 인증 필요 엔드포인트 | 보드 범위 참여 토큰 |
| `Idempotency-Key` | 표에 명시된 POST | 클라이언트 생성 UUID v4. 동일 키 재요청은 최초 결과를 반환 |
| `X-Request-Id` | 선택 | 클라이언트 추적 ID. 로그에 그대로 기록 |

### 2.3 역할 판정

역할은 별도 헤더 없이 서버가 판정한다.

| 역할 | 판정 조건 |
|---|---|
| 호스트 | 토큰의 참여자 `role = HOST` |
| 참여자 | 토큰이 해당 보드에서 유효하고 `active = true` |
| 방문자 | 토큰 없음. `/public/{publicToken}` 경로만 접근 |
| 운영자 | 별도 운영 인증. MVP 범위 밖이며 `/ops/*`는 네트워크 레벨로 차단 |

## 3. 공통 규약

### 3.1 성공 응답

리소스를 그대로 반환한다. 목록은 `items`와 `page`를 포함한다.

```json
{
  "items": [],
  "page": { "cursor": "eyJpZCI6MTIzfQ", "hasNext": true, "size": 20 }
}
```

### 3.2 오류 응답

```json
{
  "error": {
    "code": "PLACE_IN_USE",
    "message": "코스에 포함된 장소예요. 먼저 코스에서 제거해 주세요.",
    "details": { "courseId": "crs_01H...", "orderIndex": 2 }
  }
}
```

- `message`는 사용자에게 그대로 노출 가능한 한국어 문구를 담는다. (기능명세 §11)
- `details`에는 개인 출발지 원문, 검색어 원문, 참여 토큰을 넣지 않는다.

### 3.3 공통 오류 코드

| HTTP | code | 발생 상황 |
|---:|---|---|
| 400 | `INVALID_ARGUMENT` | 필드 형식·길이 위반 |
| 400 | `URL_QUERY_NOT_ALLOWED` | 검색어가 URL 형태 (BR-014, 기능명세 §11) |
| 401 | `TOKEN_REQUIRED` | 참여 토큰 없음 |
| 403 | `FORBIDDEN_ROLE` | 호스트 전용 기능에 참여자가 접근 |
| 404 | `BOARD_NOT_FOUND` / `PLACE_NOT_FOUND` | 대상 없음 또는 삭제됨 |
| 404 | `INVITE_CODE_INVALID` | 잘못되었거나 만료된 초대 코드 |
| 409 | `JOB_ALREADY_RUNNING` | 동일 보드에 진행 중인 계산 작업 존재 |
| 409 | `PLACE_IN_USE` | 투표·코스가 참조 중인 장소 삭제 시도 |
| 409 | `STATE_CONFLICT` | 보드 상태에서 허용되지 않는 전이 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | 동일 키에 다른 본문 재요청 |
| 410 | `PUBLIC_LINK_INACTIVE` | 공유 종료된 공개 링크 |
| 429 | `RATE_LIMITED` | 본 API 자체 제한 |
| 502 | `EXTERNAL_RATE_LIMITED` | 외부 공급자 429. `Retry-After` 전달 |
| 502 | `EXTERNAL_UNAVAILABLE` | 외부 공급자 장애·타임아웃 |
| 503 | `QUOTA_EXCEEDED` | 일일 예산 상한 초과로 외부 호출 차단 |

### 3.4 Idempotency

`Idempotency-Key`가 필요한 엔드포인트는 §4 표에 표시한다. 서버는 `(boardId, endpoint, key)`로 24시간 저장하며, 동일 키 재요청 시 최초 응답을 그대로 반환한다. 본문이 다르면 `409 IDEMPOTENCY_KEY_REUSED`를 반환한다.

### 3.5 페이지네이션

커서 기반을 사용한다. `?cursor=&size=` (기본 20, 최대 50).

### 3.6 Rate limit

| 대상 | 제한 |
|---|---|
| 참여 토큰별 전체 | 60 req/min |
| 검색 프록시 (`*-search`, `reverse-geocode`) | 참여자당 20 req/min, 보드당 120 req/min |
| 지역 찾기 실행 | 보드당 5 req/hour |
| 댓글 등록 | 참여자당 20 req/min |

초과 시 `429 RATE_LIMITED` + `Retry-After`.

## 4. 엔드포인트 요약

`Idem` = `Idempotency-Key` 필요, `외부` = 유료 외부 API 호출 유발.

| # | Method | Path | 권한 | Idem | 외부 | 기능 ID | 우선순위 |
|---:|---|---|---|:---:|:---:|---|---:|
| 1 | POST | `/boards` | 없음 | O | - | F02-05 | P0 |
| 2 | GET | `/boards/{boardId}` | 참여자 | - | - | F05-01 | P0 |
| 3 | PATCH | `/boards/{boardId}` | 호스트 | - | - | F02-03 | P1 |
| 4 | DELETE | `/boards/{boardId}` | 호스트 | - | - | 기능명세 §12 | P1 |
| 5 | GET | `/boards/{boardId}/invite` | 참여자 | - | - | F02-06 | P0 |
| 6 | GET | `/invites/{inviteCode}` | 없음 | - | - | F01-02 | P0 |
| 7 | POST | `/boards/{boardId}/participants` | 없음 | O | - | F01-02 | P0 |
| 8 | GET | `/boards/{boardId}/participants` | 참여자 | - | - | F07-01 | P0 |
| 9 | PATCH | `/boards/{boardId}/participants/me` | 참여자 | - | - | F07-02 | P0 |
| 10 | PATCH | `/boards/{boardId}/participants/{id}` | 호스트 | - | - | 기능명세 §3.3 | P1 |
| 11 | POST | `/boards/summaries` | 없음 | - | - | F01-03 | P0 |
| 12 | GET | `/boards/{boardId}/place-search` | 참여자 | - | **O** | F03-02 | P0 |
| 13 | GET | `/boards/{boardId}/address-search` | 참여자 | - | **O** | F07-02 | P0 |
| 14 | GET | `/boards/{boardId}/reverse-geocode` | 참여자 | - | **O** | F04-04 | P0 |
| 15 | GET | `/boards/{boardId}/nearby-search` | 참여자 | - | **O** | F09-01, F09-02 | P1 |
| 16 | POST | `/boards/{boardId}/places` | 참여자 | O | - | F04-03 | P0 |
| 17 | GET | `/boards/{boardId}/places` | 참여자 | - | - | F05-02 | P0 |
| 18 | GET | `/boards/{boardId}/places/{placeId}` | 참여자 | - | - | F06-01 | P0 |
| 19 | PATCH | `/boards/{boardId}/places/{placeId}` | 제안자·호스트 | - | - | F06-06 | P1 |
| 20 | DELETE | `/boards/{boardId}/places/{placeId}` | 제안자·호스트 | - | - | F05-06 | P0 |
| 21 | GET | `/boards/{boardId}/places/{placeId}/comments` | 참여자 | - | - | F06-03 | P0 |
| 22 | POST | `/boards/{boardId}/places/{placeId}/comments` | 참여자 | - | - | F06-03 | P0 |
| 23 | PATCH | `/boards/{boardId}/comments/{commentId}` | 작성자 | - | - | F06-04 | P0 |
| 24 | DELETE | `/boards/{boardId}/comments/{commentId}` | 작성자·호스트 | - | - | F06-04 | P0 |
| 25 | PUT | `/boards/{boardId}/places/{placeId}/reaction` | 참여자 | - | - | F06-05 | P1 |
| 26 | DELETE | `/boards/{boardId}/places/{placeId}/reaction` | 참여자 | - | - | F06-05 | P1 |
| 27 | POST | `/boards/{boardId}/votes` | 호스트 | O | - | F10-02 | P0 |
| 28 | GET | `/boards/{boardId}/votes/current` | 참여자 | - | - | F10-03 | P0 |
| 29 | PUT | `/boards/{boardId}/votes/{voteId}/ballot` | 참여자 | - | - | F10-03 | P0 |
| 30 | POST | `/boards/{boardId}/votes/{voteId}/close` | 호스트 | - | - | F10-04 | P0 |
| 31 | POST | `/boards/{boardId}/area-searches` | 호스트 | O | **O** | F07-05 | P0 |
| 32 | GET | `/boards/{boardId}/area-searches/{jobId}` | 참여자 | - | - | F07-05 | P0 |
| 33 | GET | `/boards/{boardId}/area-searches/{jobId}/result` | 참여자 | - | - | F08-01~05 | P0 |
| 34 | GET | `/boards/{boardId}/course/draft` | 참여자 | - | - | F11-06 | P0 |
| 35 | PUT | `/boards/{boardId}/course/draft` | 호스트 | - | - | F11-01~06 | P0 |
| 36 | POST | `/boards/{boardId}/course/draft/confirm` | 호스트 | O | - | F12-05 | P0 |
| 37 | GET | `/boards/{boardId}/course/confirmed` | 참여자 | - | - | F13-01 | P0 |
| 38 | GET | `/boards/{boardId}/departure/me` | 참여자 | - | - | F14-01~03 | P0 |
| 39 | POST | `/boards/{boardId}/departure/me/recalculate` | 참여자 | O | **O** | F14-03 | P0 |
| 40 | GET | `/public/{publicToken}` | 없음 | - | - | F15-01~04 | P0 |
| 41 | GET | `/boards/{boardId}/events` | 참여자 | - | - | F05-07 | P1 |
| 42 | GET | `/ops/api-usage` | 운영자 | - | - | F16-01~02 | P1 |
| 43 | GET | `/ops/jobs` | 운영자 | - | - | F16-04 | P1 |

## 5. 보드와 참여자

### 5.1 POST /boards — 보드 생성

권한 없음. `Idempotency-Key` 필수.

```json
{
  "name": "주말 모임",
  "dateRange": { "start": "2026-07-25", "end": "2026-07-27" },
  "purpose": "저녁 식사",
  "budgetPerPerson": 30000,
  "hostNickname": "종민"
}
```

| 필드 | 필수 | 규칙 |
|---|:---:|---|
| `name` | O | 2~40자, 앞뒤 공백 제거 (F02-01) |
| `dateRange.start` | O | 오늘 이후 |
| `dateRange.end` | O | `start` 이후, 최대 30일 범위 (F02-02) |
| `purpose` | - | 100자 이하 |
| `budgetPerPerson` | - | 0 이상 정수 |
| `hostNickname` | O | 1~20자 |

응답 `201`:

```json
{
  "boardId": "brd_01HXXXXXXXXXXXXXXXXXXXXXXX",
  "name": "주말 모임",
  "status": "COLLECTING",
  "timezone": "Asia/Seoul",
  "inviteCode": "AB12CD",
  "inviteUrl": "https://example.app/j/AB12CD",
  "participant": {
    "participantId": "ptc_01HXXXXXXXXXXXXXXXXXXXXXXX",
    "nickname": "종민",
    "role": "HOST",
    "participantToken": "pt_9f2a..."
  }
}
```

`participantToken`은 이 응답에서만 평문으로 반환한다. 서버는 해시만 보관한다.

### 5.2 GET /invites/{inviteCode} — 초대 코드 확인

권한 없음. 참여 전 보드 존재·만료 여부만 확인한다. (F01-02)

```json
{
  "boardId": "brd_01H...",
  "name": "주말 모임",
  "status": "COLLECTING",
  "participantCount": 3,
  "joinable": true
}
```

`404 INVITE_CODE_INVALID` 시 클라이언트는 입력값을 유지하고 재시도를 허용한다. (F01-04)

### 5.3 POST /boards/{boardId}/participants — 참여

권한 없음. `Idempotency-Key` 필수.

```json
{ "inviteCode": "AB12CD", "nickname": "하늘" }
```

- 동일 닉네임을 허용하되 서버가 `avatarColor`를 배정한다. (기능명세 §3.3)
- 응답은 5.1의 `participant` 객체와 동일하며 `participantToken`을 1회 반환한다.

### 5.4 GET /boards/{boardId}/participants — 참여자 목록

참여자 권한. 출발지 상세는 본인 것만 포함한다. (F07-01, BR-010)

```json
{
  "items": [
    {
      "participantId": "ptc_01H...",
      "nickname": "종민",
      "role": "HOST",
      "avatarColor": "#4A90E2",
      "active": true,
      "origin": { "registered": true, "label": "정왕역", "lon": 126.7426, "lat": 37.3459 }
    },
    {
      "participantId": "ptc_02H...",
      "nickname": "하늘",
      "role": "MEMBER",
      "avatarColor": "#50B87A",
      "active": true,
      "origin": { "registered": true }
    }
  ]
}
```

타인의 `origin`에는 `registered`만 포함하고 `label`·좌표를 넣지 않는다.

### 5.5 PATCH /boards/{boardId}/participants/me — 내 정보·출발지 등록

```json
{
  "nickname": "종민",
  "origin": {
    "label": "정왕역",
    "lon": 126.7426,
    "lat": 37.3459,
    "source": "KAKAO_KEYWORD",
    "providerPlaceId": "26338954"
  }
}
```

`origin.source`는 `KAKAO_KEYWORD` | `KAKAO_ADDRESS` | `MANUAL_PIN`. 좌표는 필수이고 `label`·`providerPlaceId`는 선택이다.

출발지가 변경되면 해당 참여자의 출발 안내를 `STALE`로 표시한다. (BR-012 준용)

### 5.6 POST /boards/summaries — 내 보드 목록

권한 없음. 브라우저가 보관 중인 토큰 목록으로 요약을 조회한다. (F01-03)

```json
{ "tokens": [ { "boardId": "brd_01H...", "participantToken": "pt_9f2a..." } ] }
```

응답에는 보드명, 상태, 장소 수, 댓글 수, 최근 활동 시각, 내 미완료 작업만 포함한다. 유효하지 않은 토큰은 오류 없이 결과에서 제외한다.

## 6. 장소 검색 프록시

모두 GET이며 서버 캐시를 우선 사용한다. 검색어 원문은 로그·분석 이벤트에 저장하지 않는다. (기능명세 §13)

### 6.1 GET /boards/{boardId}/place-search — 키워드 검색

| 쿼리 | 필수 | 규칙 |
|---|:---:|---|
| `query` | O | 2~80자. URL 형태면 `400 URL_QUERY_NOT_ALLOWED` (BR-014) |
| `lon`, `lat` | - | 중심 좌표. `radius`와 함께 사용 |
| `radius` | - | 미터, 최대 20000 |
| `size` | - | 기본 5, 최대 15 (F03-03) |

```json
{
  "provider": "KAKAO",
  "cacheHit": false,
  "items": [
    {
      "providerPlaceId": "1234567",
      "name": "긴자료코 부평점",
      "category": "음식점 > 일식 > 돈까스,우동",
      "internalCategory": "RESTAURANT",
      "addressName": "인천 부평구 부평동 000-0",
      "roadAddressName": "인천 부평구 경원대로 0",
      "lon": 126.72065,
      "lat": 37.49079,
      "providerPlaceUrl": "https://place.map.kakao.com/1234567",
      "distanceMeters": 320
    }
  ]
}
```

- `internalCategory`는 `RESTAURANT` | `CAFE` | `PLAY` | `BAR` | `CULTURE` | `ATTRACTION` | `TRANSIT` | `ETC`로 정규화한다. (F05-03)
- 결과 0건이면 오류가 아니라 `200`에 빈 배열과 안내 문구를 담는다.

```json
{ "provider": "KAKAO", "items": [], "hint": "장소명에 지역이나 지점명을 더해 보세요." }
```

### 6.2 GET /boards/{boardId}/address-search — 주소 → 좌표

`query`에 도로명·지번 주소를 전달한다. 응답 항목은 `addressName`, `roadAddressName`, `lon`, `lat`, `addressType`.

실재하지 않는 주소는 결과 0건으로 응답한다. PoC에서 확인된 정상 동작이며 오류가 아니다.

### 6.3 GET /boards/{boardId}/reverse-geocode — 좌표 → 주소

`lon`, `lat` 필수.

```json
{ "roadAddressName": null, "addressName": "서울 강남구 역삼동 858" }
```

**도로명 주소가 `null`일 수 있다.** 클라이언트는 도로명이 없으면 지번을 표시하고, 둘 다 없어도 좌표만으로 장소를 등록할 수 있어야 한다. (PoC 실측, 기능명세 §8 좌표→주소)

### 6.4 GET /boards/{boardId}/nearby-search — 근처 탐색 (P1)

| 쿼리 | 필수 | 규칙 |
|---|:---:|---|
| `lon`, `lat` | O | 지역 중심 좌표 |
| `category` | O | `RESTAURANT` \| `CAFE` \| `PLAY` \| `BAR` \| `CULTURE` \| `ATTRACTION` |
| `radius` | - | 기본 1000. 결과 5건 미만이면 서버가 3000으로 한 단계 확대 후 재조회 (기능명세 §8.2-8) |

카테고리 매핑 (기능명세 §8.2-8·9, PoC KL-06 실측 반영):

| internalCategory | 조회 방식 |
|---|---|
| `RESTAURANT` | Kakao `FD6` |
| `CAFE` | Kakao `CE7` |
| `CULTURE` | Kakao `CT1` |
| `ATTRACTION` | Kakao `AT4` |
| `BAR` | 키워드 `술집` |
| `PLAY` | `CT1` + `AT4` + 키워드 `노래방`·`볼링장`·`PC방`. 검색어 `놀거리`는 사용하지 않는다 |

응답에 실제 적용된 반경을 반드시 포함한다.

```json
{ "appliedRadius": 3000, "expanded": true, "items": [] }
```

## 7. 장소·댓글·투표

### 7.1 POST /boards/{boardId}/places — 장소 등록

`Idempotency-Key` 필수. 검색 결과에서 사용자가 선택한 후에만 호출한다. (BR-003)

```json
{
  "name": "긴자료코 부평점",
  "lon": 126.72065,
  "lat": 37.49079,
  "addressName": "인천 부평구 부평동 000-0",
  "roadAddressName": "인천 부평구 경원대로 0",
  "internalCategory": "RESTAURANT",
  "provider": "KAKAO",
  "providerPlaceId": "1234567",
  "providerPlaceUrl": "https://place.map.kakao.com/1234567",
  "source": "SEARCH_SELECT"
}
```

| 필드 | 필수 | 비고 |
|---|:---:|---|
| `name`, `lon`, `lat` | O | 좌표는 필수 |
| `provider`, `providerPlaceId`, `providerPlaceUrl` | - | 검색 선택 시 저장, 수동 핀은 생략 |
| `source` | O | `SEARCH_SELECT` \| `MANUAL_PIN` \| `NEARBY_SELECT` |

응답 `201`은 `status: "ACTIVE"`인 `Place`를 반환한다.

**중복 병합은 하지 않는다.** 같은 장소가 여러 번 등록돼도 별개 `Place`로 저장한다. (BR-004)

### 7.2 GET /boards/{boardId}/places — 목록

| 쿼리 | 규칙 |
|---|---|
| `category` | `internalCategory` 필터 (F05-03) |
| `sort` | `RECENT`(기본) \| `COMMENTS` \| `REACTIONS` (F05-04) |
| `bbox` | `minLon,minLat,maxLon,maxLat`. 지도 범위 우선 표시 |
| `status` | 기본 `ACTIVE,SELECTED`. `ARCHIVED` 포함 시 명시 |

응답 항목에 `commentCount`, `reactionCount`, `myReaction`, `proposer{participantId,nickname,avatarColor}`, `markerLabel`을 포함한다.

### 7.3 DELETE /boards/{boardId}/places/{placeId}

제안자 본인 또는 호스트만 가능하다. (기능명세 §8.3)

- 투표 후보 또는 코스에 포함된 장소는 `409 PLACE_IN_USE`와 참조 위치를 반환한다.
- 삭제는 soft delete이며 댓글·투표 기록은 감사 로그로 보존하되 일반 조회에서 제외한다.

### 7.4 댓글

```
POST /boards/{boardId}/places/{placeId}/comments
{ "body": "여기 웨이팅 길어요" }
```

`body` 1~500자, 공백만 있는 댓글 금지. 수정·삭제는 작성자 토큰 소유권을 검사하며 삭제는 soft delete다. (F06-03, F06-04)

### 7.5 투표

개설 (호스트, `Idempotency-Key` 필수):

```json
{
  "type": "PLACE",
  "placeIds": ["plc_01H...", "plc_02H...", "plc_03H..."],
  "maxSelections": 1,
  "anonymous": false,
  "closesAt": "2026-07-25T22:00:00+09:00"
}
```

- 후보 2~10개, 진행 중 투표는 보드당 종류별 1개. 위반 시 `409 STATE_CONFLICT`. (F10-02)
- 투표 참여는 `PUT .../ballot`으로 멱등 처리한다. 마감 전에는 변경 가능. (F10-03)
- 종료 후 참여자 수정 불가. 호스트 조기 종료 또는 `closesAt` 자동 종료. (F10-04)
- **투표는 선택 기능이다.** 호스트는 투표 없이 코스 초안을 구성할 수 있다. (BR-011)

## 8. 지역 찾기·코스·출발 안내

### 8.1 POST /boards/{boardId}/area-searches — 지역 찾기 실행

호스트 전용, `Idempotency-Key` 필수, **외부 유료 호출 발생**. (BR-002, F07-05)

```json
{
  "durationMin": 45,
  "participantIds": ["ptc_01H...", "ptc_02H...", "ptc_03H..."]
}
```

| 필드 | 규칙 |
|---|---|
| `durationMin` | `30` \| `45`(기본) \| `60` (F07-04) |
| `participantIds` | 계산 대상. 출발지 미입력자를 자동 제외하지 않고 호스트가 명시한다 (F07-03) |

사전 검증 실패:

| 상황 | 응답 |
|---|---|
| 진행 중 작업 존재 | `409 JOB_ALREADY_RUNNING` + 기존 `jobId` |
| 대상 중 출발지 미등록자 포함 | `400 ORIGIN_REQUIRED` + 해당 `participantIds` |
| 대상 2명 미만 | `400 INVALID_ARGUMENT` |
| 일일 예산 초과 | `503 QUOTA_EXCEEDED` |

응답 `202`:

```json
{
  "jobId": "job_01H...",
  "status": "QUEUED",
  "estimatedExternalCalls": { "odsay": 3, "kakaoLocal": 12, "tmapTransit": 18 }
}
```

`estimatedExternalCalls`는 예상 호출량 안내에 사용한다. (F07-05)

### 8.2 GET /boards/{boardId}/area-searches/{jobId} — 진행 상태

```json
{
  "jobId": "job_01H...",
  "status": "RUNNING",
  "progress": { "phase": "TRANSIT_EVALUATION", "done": 12, "total": 18 },
  "errorCode": null
}
```

`status`는 `QUEUED` | `RUNNING` | `RETRY_WAIT` | `SUCCEEDED` | `FAILED`. (기능명세 §10.3)
`phase`는 `ISOCHRONE` → `INTERSECTION` → `HUB_COLLECTION` → `TRANSIT_EVALUATION` 순서다.

| errorCode | 의미 | 클라이언트 처리 |
|---|---|---|
| `NO_INTERSECTION` | 도달권 교집합 없음 | 다음 단계 시간(45→60분) 확대 제안 (F07-06) |
| `EXTERNAL_RATE_LIMITED` | 공급자 429 | 재시도 버튼, 지수 백오프 안내 |
| `NO_HUB_FOUND` | 교집합 내 거점 0건 | 지도에서 직접 지역 지정 유도 |

### 8.3 GET /boards/{boardId}/area-searches/{jobId}/result — 결과

```json
{
  "durationMin": 45,
  "intersection": {
    "type": "MultiPolygon",
    "coordinates": [],
    "areaKm2": 93.4,
    "usedPieces": 3
  },
  "candidates": [
    {
      "areaCandidateId": "arc_01H...",
      "name": "신도림역",
      "lon": 126.8912,
      "lat": 37.5088,
      "providerPlaceId": "8154321",
      "metrics": {
        "avgSeconds": 1920,
        "maxSeconds": 2460,
        "transferAvg": 0.7,
        "unreachableCount": 0
      },
      "reasons": ["평균이 짧음", "기존 장소가 많음"]
    }
  ],
  "boardPlaces": [
    { "placeId": "plc_01H...", "relation": "INSIDE", "distanceToCenterM": 1200 },
    { "placeId": "plc_03H...", "relation": "OUTSIDE", "distanceToCenterM": 9400 }
  ]
}
```

- `intersection`은 면적 상위 3개 조각만 포함한다. (F08-01. PoC에서 60분 교집합이 17조각으로 분리된 사례 확인)
- `candidates`는 최대 6개를 평가하고 기본 3개를 상위로 정렬해 반환한다. (F08-02, F08-03)
- `reasons`는 지표에서 계산 가능한 문구만 사용한다. 리뷰·인기도 기반 문구를 넣지 않는다. (BR-009, F08-05)
- `relation`은 `INSIDE` | `EDGE` | `OUTSIDE`. (F08-04)
- 특정 참여자의 경로가 없으면 `unreachableCount`를 올리고 전체 작업은 계속한다. (기능명세 §11)

### 8.4 PUT /boards/{boardId}/course/draft — 코스 초안 저장

호스트 전용. 전체 스톱을 한 번에 저장한다. (F11-01~06)

```json
{
  "stops": [
    { "placeId": "plc_01H...", "orderIndex": 1, "role": "FIRST_MEETING", "scheduledAt": "2026-07-26T18:00:00+09:00" },
    { "placeId": "plc_02H...", "orderIndex": 2, "role": "CAFE", "scheduledAt": "2026-07-26T19:30:00+09:00" }
  ],
  "expectedVersion": 3
}
```

| 규칙 | 위반 시 |
|---|---|
| 스톱 1~10개 | `400 INVALID_ARGUMENT` |
| `orderIndex`는 1부터 연속·중복 없음 | `400 INVALID_ARGUMENT` |
| `role = FIRST_MEETING`이 정확히 1개이며 `orderIndex = 1` | `400 FIRST_MEETING_REQUIRED` (BR-005) |
| `scheduledAt`은 이전 스톱보다 이후 | `400 SCHEDULE_ORDER_INVALID` |
| `expectedVersion` 불일치 | `409 STATE_CONFLICT` + 최신 버전 반환 (F11-06) |

응답에 서버가 계산한 구간 추정을 포함한다.

```json
{
  "version": 4,
  "legs": [
    { "fromOrder": 1, "toOrder": 2, "straightDistanceM": 280, "estimatedWalkMin": 4, "estimated": true }
  ]
}
```

`estimatedWalkMin = round(straightDistanceM / 70)`이며 항상 `estimated: true`로 표시한다. 정밀 경로가 아님을 클라이언트가 명시해야 한다. (BR-007, BR-008)

### 8.5 POST /boards/{boardId}/course/draft/confirm — 코스 확정

호스트 전용, `Idempotency-Key` 필수. (F12-05)

- 새 `Course` 버전을 생성하고 보드 상태를 `CONFIRMED`로 전이한다.
- 최초 확정 시 `publicToken`을 발급한다.
- 기존 확정 버전은 보존한다. (BR-012)
- 모든 참여자의 출발 안내를 `STALE`로 만들고 재계산 작업을 큐에 넣는다.

```json
{
  "courseId": "crs_01H...",
  "version": 2,
  "confirmedAt": "2026-07-21T14:02:00+09:00",
  "publicUrl": "https://example.app/s/pub_7c1d...",
  "departureRecalculationQueued": true
}
```

### 8.6 GET /boards/{boardId}/departure/me — 내 출발 안내

```json
{
  "status": "READY",
  "courseVersion": 2,
  "firstMeeting": { "placeId": "plc_01H...", "name": "긴자료코 부평점", "scheduledAt": "2026-07-26T18:00:00+09:00" },
  "transit": {
    "totalSeconds": 1920,
    "transferCount": 1,
    "fare": 1550,
    "totalWalkSeconds": 420
  },
  "recommendedDepartureAt": "2026-07-26T17:18:00+09:00",
  "calculatedAt": "2026-07-21T14:03:00+09:00",
  "basis": "CURRENT_TIMETABLE"
}
```

| 필드 | 설명 |
|---|---|
| `status` | `READY` \| `CALCULATING` \| `STALE` \| `UNAVAILABLE` |
| `recommendedDepartureAt` | `scheduledAt − totalSeconds − 600초` (F14-02) |
| `basis` | 항상 `CURRENT_TIMETABLE`. 클라이언트는 `현재 시간표 기준 추정`을 표시한다 (F14-03) |
| `totalWalkSeconds` | 보조 표시 전용. 추천 계산에 사용하지 않는다 (기능명세 §8) |

`status = UNAVAILABLE`은 대중교통 경로를 찾지 못한 경우이며, 화면은 외부 지도 길찾기 버튼만 제공한다. (기능명세 §11)

일정이나 출발지가 바뀌면 `STALE`이 되고 `POST .../recalculate`로만 재계산한다. 자동 폴링 재계산을 하지 않는다.

## 9. 외부 API 호출 매트릭스

| 내부 엔드포인트 | 외부 공급자 | 호출 수 | 캐시 |
|---|---|---|---|
| `GET /place-search` | Kakao Local keyword | 1 | 동일 조건 24시간 |
| `GET /address-search` | Kakao Local address | 1 | 정규화 주소 30일 |
| `GET /reverse-geocode` | Kakao Local coord2address | 1 | 좌표 격자 30일 |
| `GET /nearby-search` | Kakao Local category/keyword | 1~2 (반경 확대 시 2) | 동일 조건 24시간 |
| `POST /area-searches` | ODsay isochrone | 참여자 수 | 입력 snapshot 7일 |
| `POST /area-searches` | Kakao Local keyword/category | 폴리곤 3개 × 키워드 수 | 24시간 |
| `POST /area-searches` | TMAP Transit 요약 | 참여자 수 × 후보 수(≤6) | 좌표쌍 24시간 |
| `POST /departure/me/recalculate` | TMAP Transit 요약 | 1 | 좌표쌍 24시간 |
| 그 외 모든 엔드포인트 | 없음 | 0 | - |

호출 통제 규칙:

1. 모든 외부 호출은 작업 큐에서 간격을 두고 직렬 실행한다. TMAP Transit은 무료 요금제에서 연속 호출 시 429가 발생한 실측 사례가 있다.
2. 429는 `Retry-After`를 우선 적용하고, 없으면 지수 백오프(1s → 2s → 4s, 최대 3회)를 적용한다.
3. 일일 예산 상한 도달 시 신규 외부 호출을 차단하고 `503 QUOTA_EXCEEDED`를 반환한다. 캐시 조회는 계속 허용한다.
4. `api_usage` 로그에 공급자, 엔드포인트, 성공 여부, 지연시간, 캐시 적중 여부, 추정 비용을 기록한다. 검색어 원문과 좌표 원문은 기록하지 않는다.

## 10. 공개 공유

### GET /public/{publicToken}

인증 없음. 확정 코스만 읽기 전용으로 반환한다. (F15-01~04)

```json
{
  "boardName": "주말 모임",
  "date": "2026-07-26",
  "courseVersion": 2,
  "updatedAt": "2026-07-21T14:02:00+09:00",
  "stops": [
    {
      "orderIndex": 1,
      "role": "FIRST_MEETING",
      "name": "긴자료코 부평점",
      "roadAddressName": "인천 부평구 경원대로 0",
      "lon": 126.72065,
      "lat": 37.49079,
      "scheduledAt": "2026-07-26T18:00:00+09:00"
    }
  ],
  "legs": [ { "fromOrder": 1, "toOrder": 2, "straightDistanceM": 280, "estimatedWalkMin": 4, "estimated": true } ]
}
```

응답에서 **반드시 제외**하는 항목: 참여자 목록, 개인 출발지, 참여 토큰, 댓글 본문·작성자, 투표 상세, 내부 `boardId`. (BR-010, F15-02)

공유가 종료된 경우 `410 PUBLIC_LINK_INACTIVE`를 반환하고 일정 데이터를 포함하지 않는다.

## 11. 실시간 이벤트 (P1)

### GET /boards/{boardId}/events — SSE

`text/event-stream`. 참여 토큰으로 인증하며 해당 보드 이벤트만 전송한다. (F05-07)

```
event: place.created
data: {"placeId":"plc_01H...","proposerId":"ptc_02H...","at":"2026-07-21T14:00:00+09:00"}

event: job.progress
data: {"jobId":"job_01H...","phase":"TRANSIT_EVALUATION","done":12,"total":18}
```

| 이벤트 | 발생 |
|---|---|
| `place.created` / `place.deleted` | 장소 추가·삭제 |
| `comment.created` | 댓글 등록 |
| `vote.updated` | 투표 개설·집계 변경·종료 |
| `job.progress` / `job.completed` | 지역 찾기 작업 |
| `course.confirmed` | 코스 확정 |

클라이언트는 `Last-Event-ID`로 재연결하며 서버는 최근 5분 이벤트를 재전송한다. SSE 미지원 환경은 30초 폴링으로 대체한다.

## 12. 외부 지도 링크 생성 규칙

서버 API를 호출하지 않는다. 저장된 `name`, `lon`, `lat`으로 클라이언트 또는 서버가 링크를 생성한다. (기능명세 §8.1, BR-015)

| 동작 | URL |
|---|---|
| 카카오맵 장소 보기 | `https://map.kakao.com/link/map/{encodedName},{lat},{lon}` |
| 카카오맵 길찾기 | `https://map.kakao.com/link/to/{encodedName},{lat},{lon}` |
| 네이버지도 장소 (앱) | `nmap://place?lat={lat}&lng={lon}&name={encodedName}&appname={APP_NAME}` |
| 네이버지도 대중교통 길찾기 (앱) | `nmap://route/public?dlat={lat}&dlng={lon}&dname={encodedName}&appname={APP_NAME}` |
| 네이버지도 웹 | `https://map.naver.com/p/search/{encodedName}` |

주의:

- **카카오맵 웹 길찾기는 자동차 모드로 기본 진입한다.** 대중교통 길찾기는 네이버지도를 기본 버튼으로 제공한다. (F14-04, F14-05, PoC 실측)
- `nmap://`은 PC에서 동작하지 않으므로 웹 URL을 함께 제공한다.
- 허용 도메인은 `map.kakao.com`, `map.naver.com`으로 고정하며 사용자 입력 URL을 그대로 열지 않는다.

## 13. 상태 전이와 엔드포인트

| 전이 | 트리거 엔드포인트 |
|---|---|
| `COLLECTING → DECIDING` | `POST /votes` 또는 코스 초안 최초 저장 |
| `DECIDING → COURSE_DRAFT` | `PUT /course/draft` |
| `COURSE_DRAFT → CONFIRMED` | `POST /course/draft/confirm` |
| `CONFIRMED → COURSE_DRAFT` | `PUT /course/draft` (일정 수정) |
| `CONFIRMED → CLOSED` | `PATCH /boards/{boardId}` `{ "status": "CLOSED" }` |

허용되지 않는 전이는 `409 STATE_CONFLICT`를 반환한다.

## 14. 보안 요구사항

1. 참여 토큰은 128비트 이상 난수이며 서버에는 해시(Argon2id 또는 bcrypt)만 저장한다.
2. 개인 출발지 좌표는 저장 시 암호화하고 응답에서는 본인에게만 반환한다. (기능명세 §12)
3. 외부 지도 URL을 사용자 입력으로 받지 않으며 서버가 임의 URL을 조회하지 않는다. (BR-015)
4. 검색어는 텍스트로만 처리하고 HTML로 렌더링하지 않는다. (기능명세 §8.1)
5. 외부 API 키는 서버 환경변수·비밀 저장소에 두고 응답·로그·클라이언트 번들에 노출하지 않는다.
6. `/ops/*`는 네트워크 레벨 접근 제어를 적용하고 일반 참여 토큰으로 접근할 수 없다.
7. 보드 삭제는 30일 유예 후 개인정보·토큰을 영구 삭제한다. (기능명세 §12)

## 15. 구현 순서 매핑

기능명세 §15의 개발 순서에 맞춘 엔드포인트 그룹이다.

| 단계 | 엔드포인트 번호 |
|---:|---|
| 1 | 1~11 (보드·참여자·초대) |
| 2 | 12~14, 16~20 (검색 프록시·장소 등록) |
| 3 | 21~26, 41 (댓글·반응·실시간) |
| 4 | 27~30, 34~37 (투표·코스·번호 지도) |
| 5 | 40, §12 링크 규칙 (공개 공유·외부 지도) |
| 6 | 9, 31~33 (출발지·지역 찾기) |
| 7 | 38~39 (개인 출발 안내) |
| 8 | 15, 42~43 (근처 탐색·운영 대시보드) |

## 16. 미해결 항목

1. 운영자 인증 방식(사내 SSO / IP allowlist)을 확정해야 한다. MVP에서는 `/ops/*`를 비공개로 둔다.
2. 웹 푸시(F14-07) 구독 등록 엔드포인트는 P1에서 별도 명세로 추가한다.
3. `POST /boards/summaries`가 토큰을 본문으로 받으므로 요청 로깅에서 본문 전체를 제외해야 한다.
4. 근처 탐색의 Kakao 결과 총량 상한(`pageable_count`)은 PoC KL-06 페이지네이션 실측 후 확정한다.
