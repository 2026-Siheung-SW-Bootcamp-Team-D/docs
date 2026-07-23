# 후보 장소 보드 API 명세서

| 항목 | 내용 |
|---|---|
| 문서 유형 | API Specification - REST MVP |
| 문서 버전 | 1.1 |
| 작성일 | 2026-07-23 |
| 기준 문서 | `docs/superpowers/specs/2026-07-23-candidate-place-board-product-design.md` |
| Base URL | `https://{host}/api/v1` |
| 데이터 형식 | JSON, UTF-8 |
| 시간 | UTC 저장, API 응답은 ISO 8601 offset 포함 |
| 기본 시간대 | `Asia/Seoul` |
| 좌표계 | WGS84 (`lon`, `lat`) |

## 1. 목적과 범위

이 문서는 후보 장소 보드 MVP의 서버 계약을 정의한다. 핵심 목표는 여러 참여자가 후보 장소를 한 보드에 축적하고, 좋아요·댓글·현재 선택 장소를 통해 의견을 모으는 것이다.

### 1.1 MVP 포함

- 보드 생성, 조회, 수정, 초대, 참여
- 참여자 닉네임과 출발지 등록·수정
- 공급자 중립적인 장소·주소 검색
- 검색 결과, 외부 지도 기반 정보, 직접 지정 좌표로 후보 장소 추가
- 후보 장소 목록 조회와 보관 처리
- 후보 장소 좋아요 on/off
- 후보 장소 댓글 생성·목록·삭제
- 모든 참여자의 현재 선택 장소 지정·변경·해제
- 모든 참여자의 참여 코드·초대 링크 상시 조회
- ODsay + JTS + Kakao 기반 지역 제안 비동기 작업

### 1.2 canonical 범위에서 제거

- 투표 생성·집계·마감
- 코스 초안·코스 확정·버전 조회
- 모임 확정·공개 일정
- 개인 출발 안내·경로 계산
- TMAP 전수 경로 비교와 공정성 점수화

## 2. 공통 규약

### 2.1 인증

인증이 필요한 요청은 Bearer 참여 토큰을 사용한다.

```http
Authorization: Bearer ptc_01HABC....{secret}
```

- 참여 토큰은 `participantId.secret` 구조다.
- DB에는 `HMAC-SHA-256(serverPepper, secret)`만 저장한다.
- 토큰 원문은 보드 생성 또는 참여 성공 시에만 반환한다.
- 토큰을 분실하면 복구하지 않고 새 참여자로 다시 입장한다.
- 초대 코드와 공유 링크 값은 재노출이 필요하므로 원문 저장 가능하지만, 접근 로그와 에러 로그에서는 마스킹한다.

### 2.2 요청 헤더

| 헤더 | 적용 | 설명 |
|---|---|---|
| `Authorization` | 인증 필요 요청 | `Bearer {participantToken}` |
| `Content-Type` | 본문이 있는 요청 | `application/json` |
| `Accept` | 전체 | `application/json` |
| `X-Request-Id` | 선택 | UUID, 최대 36자 |

### 2.3 성공 상태 코드

| HTTP | 사용 기준 |
|---:|---|
| `200 OK` | 조회·수정 성공 |
| `201 Created` | 보드·참여자·장소·댓글·작업 생성 |
| `202 Accepted` | 장시간 처리 작업 접수 |
| `204 No Content` | 삭제 또는 토글 해제 성공 |

`201`과 `202`는 가능하면 `Location` 헤더를 반환한다.

### 2.4 오류 응답

```json
{
  "error": {
    "code": "PLACE_ARCHIVED",
    "message": "보관된 장소에는 좋아요를 남길 수 없어요.",
    "details": {
      "placeId": "plc_01J..."
    },
    "requestId": "f784bff8-2c16-4af2-a47e-a6aa35689d41"
  }
}
```

| HTTP | 코드 | 의미 |
|---:|---|---|
| 400 | `INVALID_ARGUMENT` | 형식, 길이, enum, 필수값 오류 |
| 400 | `UNSUPPORTED_PROVIDER` | 지원하지 않는 검색 공급자 |
| 400 | `URL_QUERY_NOT_ALLOWED` | 검색어가 URL 형식 |
| 401 | `AUTHENTICATION_REQUIRED` | 토큰 누락, 형식 오류, 검증 실패 |
| 403 | `FORBIDDEN` | 역할 또는 소유권 부족 |
| 404 | `RESOURCE_NOT_FOUND` | 보드, 참여자, 장소, 댓글, 작업 없음 |
| 404 | `INVITE_NOT_FOUND` | 초대 코드가 없거나 만료됨 |
| 409 | `RESOURCE_CONFLICT` | 현재 상태와 요청 충돌 |
| 409 | `PLACE_ARCHIVED` | 보관된 장소에 대한 변경 시도 |
| 409 | `PLACE_ALREADY_SELECTED` | 이미 현재 선택 장소로 지정됨 |
| 409 | `JOB_ALREADY_RUNNING` | 동일 보드에서 동등한 지역 제안 작업이 실행 중 |
| 422 | `ORIGIN_REQUIRED` | 지역 제안 대상 참여자 중 출발지 누락 |
| 422 | `INVALID_COORDINATE_RANGE` | 허용 범위 밖 좌표 |
| 429 | `RATE_LIMITED` | 요청 제한 초과 |
| 502 | `EXTERNAL_BAD_RESPONSE` | 외부 API 응답 구조 이상 |
| 503 | `EXTERNAL_UNAVAILABLE` | 외부 API 장애 또는 재시도 실패 |
| 503 | `QUOTA_EXCEEDED` | 외부 API 예산 상한 도달 |

오류 응답에는 참여 토큰 원문, 상세 출발 주소, 외부 API 키를 포함하지 않는다.

### 2.5 목록 응답

페이지 번호 기반을 사용한다.

```json
{
  "items": [],
  "page": {
    "number": 1,
    "size": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

- 기본 `page=1`
- 기본 `size=20`
- 최대 `size=50`
- 참여자 목록과 검색 후보는 페이지네이션하지 않는다.

### 2.6 캐시와 요청 제한

- 인증이 걸린 응답은 `Cache-Control: private, no-store`
- 장소 검색과 주소 검색 결과는 응답 후 폐기 가능한 단기 캐시로 취급한다.
- 지역 제안은 동일 입력 재사용을 위해 서버 캐시를 사용한다.
- 기본 rate limit:
  - 참여 토큰 전체: 60회/분
  - 장소·주소 검색: 참여자당 20회/분
  - 댓글 생성: 참여자당 20회/분
  - 장소 좋아요 토글: 참여자당 60회/분
  - 지역 제안 생성: 보드당 3회/시간
  - 초대 코드 확인: IP당 30회/분

## 3. 핵심 자원 모델

### 3.1 Board

```json
{
  "boardId": "brd_01J...",
  "name": "금요일 저녁 약속",
  "purpose": "강남에서 식사",
  "status": "OPEN",
  "creatorParticipantId": "ptc_01J...",
  "selectedPlaceId": "plc_01J...",
  "selectedByParticipantId": "ptc_01K...",
  "selectedAt": "2026-07-23T19:30:00+09:00",
  "inviteCode": "b6f8m2",
  "createdAt": "2026-07-23T19:00:00+09:00",
  "updatedAt": "2026-07-23T19:30:00+09:00"
}
```

- `status`: `OPEN`, `CLOSED`
- `selectedPlaceId`: `null` 또는 활성 후보 장소 1개
- `creatorParticipantId`는 생성 이력일 뿐 권한 판정에 사용하지 않는다.
- `selectedByParticipantId`, `selectedAt`은 마지막 선택 변경자와 시각이다.

### 3.2 Participant

```json
{
  "participantId": "ptc_01J...",
  "nickname": "민지",
  "isCreator": true,
  "origin": {
    "label": "성수역",
    "lon": 127.0557,
    "lat": 37.5446
  },
  "originSet": true,
  "joinedAt": "2026-07-23T19:02:00+09:00"
}
```

- `isCreator`는 개설자 표시용 메타데이터이며 모든 참여자의 기능 권한은 같다.
- 다른 참여자에게는 상세 출발지를 숨길 수 있다. canonical 기본값은 `originSet`만 공개하고, 본인 응답에서만 `origin` 전체를 내려준다.

### 3.3 Place

```json
{
  "placeId": "plc_01J...",
  "boardId": "brd_01J...",
  "status": "ACTIVE",
  "name": "어반소스",
  "category": "카페 > 디저트카페",
  "roadAddress": "서울 성동구 아차산로 9길 8",
  "jibunAddress": "서울 성동구 성수동2가 273-38",
  "location": {
    "lon": 127.0553,
    "lat": 37.5478
  },
  "source": {
    "sourceProvider": "KAKAO",
    "providerPlaceId": "123456789",
    "sourceUrl": "https://place.map.kakao.com/123456789",
    "inputMethod": "SEARCH_PICK"
  },
  "createdByParticipantId": "ptc_01J...",
  "likeCount": 3,
  "likedByMe": true,
  "selected": false,
  "createdAt": "2026-07-23T19:10:00+09:00",
  "archivedAt": null
}
```

- `status`: `ACTIVE`, `ARCHIVED`
- `source.sourceProvider`: `KAKAO`, `NAVER`, `EXTERNAL`, `MANUAL`
- `source.inputMethod`: `SEARCH_PICK`, `EXTERNAL_LINK`, `MANUAL_PIN`

### 3.4 Comment

```json
{
  "commentId": "cmt_01J...",
  "placeId": "plc_01J...",
  "authorParticipantId": "ptc_01J...",
  "authorNickname": "민지",
  "content": "웨이팅만 괜찮으면 여기 좋아요.",
  "createdAt": "2026-07-23T19:20:00+09:00"
}
```

## 4. 엔드포인트 목록

| # | Method | Path | 권한 | 설명 |
|---:|---|---|---|---|
| 1 | POST | `/boards` | 없음 | 보드 생성 |
| 2 | GET | `/boards/{boardId}` | 참여자 | 보드 조회 |
| 3 | PATCH | `/boards/{boardId}` | 참여자 | 보드 기본 정보 수정 |
| 4 | GET | `/boards/{boardId}/invitation` | 참여자 | 참여 코드·초대 링크 조회 |
| 5 | GET | `/invitations/{inviteCode}` | 없음 | 초대 코드 확인 |
| 6 | POST | `/invitations/{inviteCode}/participants` | 없음 | 보드 참여 |
| 7 | GET | `/boards/{boardId}/participants` | 참여자 | 참여자 목록 |
| 8 | PATCH | `/boards/{boardId}/participants/me` | 참여자 | 내 닉네임·출발지 수정 |
| 9 | GET | `/boards/{boardId}/search/places` | 참여자 | 공급자 중립 장소 검색 |
| 10 | GET | `/boards/{boardId}/search/addresses` | 참여자 | 공급자 중립 주소 검색 |
| 11 | GET | `/boards/{boardId}/search/reverse-geocode` | 참여자 | 좌표 주소 조회 |
| 12 | POST | `/boards/{boardId}/places` | 참여자 | 후보 장소 추가 |
| 13 | GET | `/boards/{boardId}/places` | 참여자 | 후보 장소 목록 조회 |
| 14 | DELETE | `/boards/{boardId}/places/{placeId}` | 참여자 | 후보 장소 보관 처리 |
| 15 | PUT | `/boards/{boardId}/places/{placeId}/likes/me` | 참여자 | 좋아요 켜기 |
| 16 | DELETE | `/boards/{boardId}/places/{placeId}/likes/me` | 참여자 | 좋아요 끄기 |
| 17 | GET | `/boards/{boardId}/places/{placeId}/comments` | 참여자 | 댓글 목록 |
| 18 | POST | `/boards/{boardId}/places/{placeId}/comments` | 참여자 | 댓글 생성 |
| 19 | DELETE | `/boards/{boardId}/places/{placeId}/comments/{commentId}` | 작성자 | 댓글 삭제 |
| 20 | PUT | `/boards/{boardId}/selected-place` | 참여자 | 현재 선택 장소 지정·변경 |
| 21 | DELETE | `/boards/{boardId}/selected-place` | 참여자 | 현재 선택 장소 해제 |
| 22 | POST | `/boards/{boardId}/area-search-jobs` | 참여자 | 지역 제안 작업 시작 |
| 23 | GET | `/boards/{boardId}/area-search-jobs/{jobId}` | 참여자 | 작업 상태·결과 조회 |

## 5. 보드·초대·참여자

### 5.1 POST /boards

보드와 개설자 참여자를 함께 생성한다. 개설자 표시는 권한 차이를 만들지 않는다.

```json
{
  "name": "금요일 저녁 약속",
  "purpose": "강남에서 식사",
  "creatorNickname": "종민"
}
```

규칙:

- `name`: 2~40자
- `purpose`: 0~100자
- `creatorNickname`: 1~20자

응답 `201 Created`:

```json
{
  "board": {
    "boardId": "brd_01J...",
    "name": "금요일 저녁 약속",
    "purpose": "강남에서 식사",
    "status": "OPEN",
    "creatorParticipantId": "ptc_01J...",
    "selectedPlaceId": null,
    "inviteCode": "b6f8m2"
  },
  "creatorParticipant": {
    "participantId": "ptc_01J...",
    "nickname": "종민",
    "isCreator": true
  },
  "tokens": {
    "participantToken": "ptc_01J....secret"
  }
}
```

### 5.2 GET /boards/{boardId}

보드 기본 정보와 현재 선택 장소 요약을 반환한다.

```json
{
  "board": {
    "boardId": "brd_01J...",
    "name": "금요일 저녁 약속",
    "purpose": "강남에서 식사",
    "status": "OPEN",
    "creatorParticipantId": "ptc_01J...",
    "selectedPlaceId": "plc_01J...",
    "selectedByParticipantId": "ptc_01K...",
    "selectedAt": "2026-07-23T19:30:00+09:00"
  },
  "selectedPlace": {
    "placeId": "plc_01J...",
    "name": "어반소스",
    "location": {
      "lon": 127.0553,
      "lat": 37.5478
    }
  }
}
```

### 5.3 PATCH /boards/{boardId}

모든 참여자가 수정할 수 있다. 보드 폐쇄는 MVP API에서 제공하지 않는다.

```json
{
  "name": "토요일 점심 약속",
  "purpose": "분위기 좋은 카페"
}
```

- 마지막으로 성공한 수정 요청이 현재 보드 정보가 된다.

### 5.4 GET /boards/{boardId}/invitation

보드에 참여한 사람은 누구나 언제든 호출할 수 있다. 보드 화면은 이 값의 확인·복사 진입점을 항상 제공한다.

```json
{
  "boardId": "brd_01J...",
  "inviteCode": "b6f8m2",
  "inviteUrl": "https://app.example.com/join/b6f8m2"
}
```

### 5.5 GET /invitations/{inviteCode}

```json
{
  "boardId": "brd_01J...",
  "boardName": "금요일 저녁 약속",
  "boardStatus": "OPEN"
}
```

### 5.6 POST /invitations/{inviteCode}/participants

```json
{
  "nickname": "민지"
}
```

응답 `201 Created`:

```json
{
  "participant": {
    "participantId": "ptc_01J...",
    "nickname": "민지",
    "isCreator": false
  },
  "tokens": {
    "participantToken": "ptc_01J....secret"
  }
}
```

### 5.7 GET /boards/{boardId}/participants

```json
{
  "items": [
    {
      "participantId": "ptc_01J...",
      "nickname": "종민",
      "isCreator": true,
      "isMe": false,
      "originSet": true
    },
    {
      "participantId": "ptc_01J...2",
      "nickname": "민지",
      "isCreator": false,
      "isMe": true,
      "originSet": true,
      "origin": {
        "label": "성수역",
        "lon": 127.0557,
        "lat": 37.5446
      }
    }
  ]
}
```

### 5.8 PATCH /boards/{boardId}/participants/me

```json
{
  "nickname": "민지",
  "origin": {
    "label": "성수역 3번 출구",
    "lon": 127.0557,
    "lat": 37.5446
  }
}
```

규칙:

- `nickname`: 1~20자
- `origin.label`: 1~80자
- `origin.lon`: -180~180
- `origin.lat`: -90~90
- 서비스 운영 범위를 대한민국으로 제한하면 추가 영역 검증 가능
- 출발지 삭제는 `"origin": null`로 처리 가능

## 6. 공급자 중립 검색

검색 결과는 후보 장소가 아니다. 사용자가 명시적으로 추가할 때만 `place`를 생성한다.

### 6.1 GET /boards/{boardId}/search/places

예시:

```http
GET /api/v1/boards/brd_01J.../search/places?q=성수 카페&provider=KAKAO
```

응답:

```json
{
  "provider": "KAKAO",
  "items": [
    {
      "providerPlaceId": "123456789",
      "name": "어반소스",
      "category": "카페 > 디저트카페",
      "roadAddress": "서울 성동구 아차산로 9길 8",
      "jibunAddress": "서울 성동구 성수동2가 273-38",
      "location": {
        "lon": 127.0553,
        "lat": 37.5478
      },
      "sourceUrl": "https://place.map.kakao.com/123456789"
    }
  ]
}
```

규칙:

- 기본 `provider=KAKAO`
- `q`: 2~60자
- URL 전체를 검색어로 보내면 `URL_QUERY_NOT_ALLOWED`
- 공급자별 응답 차이는 canonical 필드로 정규화한다.

### 6.2 GET /boards/{boardId}/search/addresses

주소 또는 역명 중심 검색이다.

```json
{
  "provider": "KAKAO",
  "items": [
    {
      "label": "서울 성동구 성수동2가 273-38",
      "roadAddress": "서울 성동구 아차산로 9길 8",
      "location": {
        "lon": 127.0553,
        "lat": 37.5478
      }
    }
  ]
}
```

### 6.3 GET /boards/{boardId}/search/reverse-geocode

```http
GET /api/v1/boards/brd_01J.../search/reverse-geocode?lon=127.0553&lat=37.5478
```

응답:

```json
{
  "label": "서울 성동구 아차산로 9길 8",
  "roadAddress": "서울 성동구 아차산로 9길 8",
  "jibunAddress": "서울 성동구 성수동2가 273-38",
  "location": {
    "lon": 127.0553,
    "lat": 37.5478
  }
}
```

## 7. 후보 장소

### 7.1 POST /boards/{boardId}/places

세 가지 입력 형태를 모두 지원한다.

```json
{
  "name": "어반소스",
  "category": "카페 > 디저트카페",
  "roadAddress": "서울 성동구 아차산로 9길 8",
  "jibunAddress": "서울 성동구 성수동2가 273-38",
  "location": {
    "lon": 127.0553,
    "lat": 37.5478
  },
  "source": {
    "sourceProvider": "KAKAO",
    "providerPlaceId": "123456789",
    "sourceUrl": "https://place.map.kakao.com/123456789",
    "inputMethod": "SEARCH_PICK"
  }
}
```

규칙:

- `name`: 1~80자
- `location`은 필수
- `source.sourceProvider`: `KAKAO`, `NAVER`, `EXTERNAL`, `MANUAL`
- `sourceUrl`은 `https`만 허용
- `EXTERNAL`은 좌표와 이름이 이미 확인된 경우만 허용
- `MANUAL`은 `providerPlaceId` 없이 저장 가능
- 같은 보드 안에서 완전 동일 좌표·이름 중복 차단 여부는 구현 선택이지만, 최소한 최근 중복 제출에 대한 충돌 방지는 권장

응답은 `Place` 전체 모델이다.

### 7.2 GET /boards/{boardId}/places

예시:

```http
GET /api/v1/boards/brd_01J.../places?status=ACTIVE&page=1&size=20
```

응답:

```json
{
  "items": [
    {
      "placeId": "plc_01J...",
      "status": "ACTIVE",
      "name": "어반소스",
      "location": {
        "lon": 127.0553,
        "lat": 37.5478
      },
      "likeCount": 3,
      "likedByMe": true,
      "selected": true,
      "createdByParticipantId": "ptc_01J..."
    }
  ],
  "page": {
    "number": 1,
    "size": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

규칙:

- `status`: `ACTIVE`, `ARCHIVED`, `ALL`
- 기본값은 `ACTIVE`
- 목록 응답은 `likeCount`, `likedByMe`, `selected`를 반드시 포함한다.

### 7.3 DELETE /boards/{boardId}/places/{placeId}

물리 삭제 대신 보관 처리한다.

- 권한: 보드 참여자
- 이미 보관된 장소를 다시 삭제해도 `204 No Content`로 멱등 처리 가능
- 선택된 장소를 보관하면 같은 트랜잭션에서 `selectedPlaceId`를 `null`로 해제한다.
- 보관된 장소에는 좋아요 추가, 댓글 생성, 선택 지정이 불가하다.

## 8. 좋아요

참여자 1명은 장소 1개에 최대 1개의 좋아요만 가진다. 서로 다른 여러 장소에는 각각 좋아요를 남길 수 있다.

### 8.1 PUT /boards/{boardId}/places/{placeId}/likes/me

- 좋아요 생성 또는 이미 존재하는 좋아요 유지
- 성공 시 `204 No Content`

### 8.2 DELETE /boards/{boardId}/places/{placeId}/likes/me

- 좋아요 제거
- 좋아요가 없어도 `204 No Content`

## 9. 댓글

### 9.1 GET /boards/{boardId}/places/{placeId}/comments

```json
{
  "items": [
    {
      "commentId": "cmt_01J...",
      "authorParticipantId": "ptc_01J...",
      "authorNickname": "민지",
      "content": "웨이팅만 괜찮으면 여기 좋아요.",
      "createdAt": "2026-07-23T19:20:00+09:00"
    }
  ],
  "page": {
    "number": 1,
    "size": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

### 9.2 POST /boards/{boardId}/places/{placeId}/comments

```json
{
  "content": "웨이팅만 괜찮으면 여기 좋아요."
}
```

규칙:

- `content`: 1~500자
- 보관된 장소에는 생성 불가

### 9.3 DELETE /boards/{boardId}/places/{placeId}/comments/{commentId}

- 권한: 댓글 작성자만 허용
- canonical 기본 동작은 소프트 삭제다.
- 성공 시 `204 No Content`

## 10. 현재 선택 장소

현재 선택 장소는 보드가 가리키는 후보 1개다. 별도 장소 종류를 만들지 않으며 모든 참여자가 변경할 수 있다.

### 10.1 PUT /boards/{boardId}/selected-place

```json
{
  "placeId": "plc_01J..."
}
```

규칙:

- 권한: 보드 참여자
- 같은 보드의 `ACTIVE` 장소만 지정 가능
- 이미 같은 장소가 같은 참여자에 의해 선택된 경우 멱등 처리한다.
- 동시 변경은 커밋 순서 기준 last-write-wins이며 `selectedByParticipantId`, `selectedAt`을 갱신한다.
- 성공 응답은 최신 `board`, `selectedPlace`, 마지막 변경자 요약을 반환한다.

### 10.2 DELETE /boards/{boardId}/selected-place

- 권한: 보드 참여자
- 이미 선택이 없어도 성공 처리하고 마지막 변경자와 시각을 갱신한다.

## 11. 지역 제안 작업

지역 제안은 장소 추천이 아니라 탐색 범위를 좁히는 fallback이다.

### 11.1 POST /boards/{boardId}/area-search-jobs

```json
{
  "travelTimeMinutes": 45
}
```

규칙:

- 권한: 보드 참여자
- 허용 값: `30`, `45`, `60`
- 계산 시작 시점의 활성 참여자와 출발지 스냅샷을 작업에 저장
- 출발지가 하나라도 없으면 `ORIGIN_REQUIRED`
- 동일한 `(boardId, participant-origin-snapshot, travelTimeMinutes)` 실행 중 작업이 있으면 재사용하거나 `JOB_ALREADY_RUNNING`

응답 `202 Accepted`:

```json
{
  "job": {
    "jobId": "asj_01J...",
    "status": "PENDING",
    "travelTimeMinutes": 45,
    "createdAt": "2026-07-23T19:40:00+09:00"
  }
}
```

### 11.2 GET /boards/{boardId}/area-search-jobs/{jobId}

```json
{
  "job": {
    "jobId": "asj_01J...",
    "status": "SUCCEEDED",
    "travelTimeMinutes": 45,
    "resultSource": "CACHE"
  },
  "suggestions": [
    {
      "suggestionId": "asg_01J...",
      "label": "건대입구역 일대",
      "center": {
        "lon": 127.0694,
        "lat": 37.5404
      },
      "boundary": {
        "type": "Polygon",
        "coordinates": [[[127.06, 37.53], [127.07, 37.53], [127.07, 37.54], [127.06, 37.53]]]
      },
      "anchors": [
        {
          "provider": "KAKAO",
          "category": "SUBWAY_STATION",
          "name": "건대입구역",
          "location": {
            "lon": 127.0694,
            "lat": 37.5404
          }
        }
      ]
    }
  ]
}
```

상태:

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`

파이프라인:

1. 참여자별 ODsay 대중교통 도달권 조회
2. JTS로 도달권 다각형 교집합 계산
3. 유효 면적 조각 추림
4. 각 조각 내부에서 Kakao 검색으로 역·상권 기준점 수집
5. 중복 제거 후 최대 3개 지역 제안 반환

제약:

- TMAP 전수 경로 API는 canonical 범위에 포함하지 않는다.
- 공통 교집합이 없으면 `SUCCEEDED`와 빈 `suggestions` 또는 도메인 메시지 반환이 가능하다.
- 지역 제안은 후보 보드에 자동 등록되지 않는다.

## 12. 외부 API, 캐시, 보안

### 12.1 외부 API 경계

- Kakao Local: 장소 검색, 주소 검색, reverse geocode, 지역 anchor 수집
- ODsay: 참여자별 대중교통 도달권 조회
- JTS: 서버 내부 geometry 연산
- canonical MVP는 외부 HTML 크롤링, 리뷰 복제, 별점 복제를 하지 않는다.

### 12.2 캐시 정책

- 검색 캐시 키: `(provider, normalizedQuery, regionBias)`
- reverse geocode 캐시 키: `(lon, lat)` 정규화 값
- area-search 캐시 키: `(participant-origin-snapshot-hash, travelTimeMinutes)`
- TTL은 운영 정책으로 분리하되, 지역 제안은 동일 세션 내 재사용이 가능할 정도로 유지한다.
- 캐시된 완료 결과가 있으면 새 작업을 만들지 않고 기존 결과를 반환할 수 있다.

### 12.3 보안 정책

- 참여 토큰 원문 비저장
- 출발지 상세 정보 저장 시 암호화
- 외부 링크는 `https`와 허용 호스트만 저장
- `javascript:`, 내부망 IP, 임의 redirect 추적 차단
- 검색어·댓글·닉네임 길이 제한과 rate limit 적용
- 다른 참여자의 상세 출발지는 본인 외 응답에서 제외
- 외부 API 에러는 공급자와 단계만 노출하고 키, raw payload, 개인식별정보는 숨김

## 13. 구현 메모

- 장소 삭제의 canonical 의미는 archive다.
- `selectedPlaceId` 갱신과 장소 archive는 같은 보드 레코드 일관성 범위에서 처리한다.
- `likeCount`는 실시간 집계 또는 저장된 카운터 어느 쪽이든 가능하지만, `likedByMe`와 함께 일관되게 내려줘야 한다.
- 검색 공급자는 현재 `KAKAO`를 기본으로 시작하되 응답 스키마는 다른 공급자 추가를 막지 않아야 한다.
