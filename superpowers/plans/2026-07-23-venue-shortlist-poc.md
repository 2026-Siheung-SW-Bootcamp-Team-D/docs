# Venue Shortlist PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the existing fair-region PoC and add Kakao venue discovery, a five-item shared shortlist, shortlist transit evaluation, map layers, and explicit external-API request explanations.

**Architecture:** Keep `runScenario()` and its `scenario.candidates` transport hubs unchanged. Add Kakao category search at the provider boundary, keep shortlist state inside each existing in-memory job, and expose venue/shortlist operations through narrowly validated HTTP endpoints. Extend the current Leaflet UI below the region results; OpenStreetMap remains the tile provider and all API credentials remain server-side.

**Tech Stack:** Node.js 18+, CommonJS, built-in `node:http`, built-in `node:test`, Turf 7, Leaflet 1.9.4, OpenStreetMap raster tiles, Kakao Local REST API, ODsay Isochrone API, TMAP Transit API.

## Global Constraints

- Do not delete or replace the existing origin search, isochrone, intersection, hub ranking, transit matrix, or prebuilt scenario flows.
- Keep `scenario.candidates` as the existing ranked transport hubs; venue results and shortlist state use separate fields.
- Support only Kakao category codes `FD6`, `CE7`, `CT1`, and `AT4` in this PoC.
- Venue search radius must be an integer from 100 through 5000 metres; the UI default is 1000 metres.
- Keyword length must be 2 through 50 Unicode characters after trimming.
- The browser never supplies the venue-search centre coordinates; the server resolves them from `jobId` and `hubId`.
- A job shortlist contains at most five unique Kakao place IDs.
- Votes are PoC-local booleans (`0` or `1`) and are not user identities.
- Transit evaluation runs only for shortlisted venues.
- Do not combine travel fairness and votes into one opaque score.
- Do not expose API key values, authentication headers, or raw provider responses.
- Keep Leaflet and OpenStreetMap; do not add Kakao Map SDK or another dependency.
- Change attribution to `© OpenStreetMap contributors`.
- Use test-driven development: failing test, observed failure, minimal implementation, passing test, then commit.

---

## File Structure

### Files to create

- `api-validation/poc-v2/src/shortlist.js` — shortlist validation, immutable shortlist operations, and shortlist transit evaluation.
- `api-validation/poc-v2/web/map-adapter.js` — Leaflet layer ownership and hub/venue/shortlist marker rendering.
- `api-validation/poc-v2/test/fixtures/kakao-category.json` — representative category-search response including phone and group code.
- `api-validation/poc-v2/test/shortlist.test.js` — shortlist rules and evaluation.
- `api-validation/poc-v2/test/providers.test.js` — request construction tests for Kakao category search.

### Files to modify

- `api-validation/poc-v2/src/contracts.js:8-21,75-80` — normalize common Kakao place fields including `categoryGroupCode` and `phone`.
- `api-validation/poc-v2/src/providers.js:8-76` — add `kakaoCategory()`.
- `api-validation/poc-v2/src/jobs.js:42-75` — attach shortlist state and operations to jobs.
- `api-validation/poc-v2/src/serve.js:11-18,45-105` — serve map adapter and add venue/shortlist endpoints.
- `api-validation/poc-v2/src/http-client.js:34-58` — add safe request-purpose and parameter-name metadata to call records.
- `api-validation/poc-v2/src/pipeline.js:54-143` — label existing external calls by purpose without changing ranking.
- `api-validation/poc-v2/web/index.html:64-118` — add venue discovery and shortlist sections.
- `api-validation/poc-v2/web/app.js:1-343` — retain application orchestration while delegating maps and wiring venue/shortlist UI.
- `api-validation/poc-v2/web/styles.css` — add responsive venue cards, shortlist, layer controls, and marker styles.
- `api-validation/poc-v2/test/contracts.test.js` — assert the extended Kakao place contract.
- `api-validation/poc-v2/test/jobs.test.js` — assert shortlist state exists on completed jobs.
- `api-validation/poc-v2/test/serve.test.js` — integration-test all new endpoints.
- `api-validation/poc-v2/test/web.test.js` — assert UI controls, safe rendering, map adapter, and attribution.
- `api-validation/poc-v2/README.md` — document execution, new flow, endpoint shapes, limits, and PoC boundaries.
- `api-validation/RESULTS_V2.md` — record live category and shortlist evaluation results.

---

### Task 1: Extend the Kakao Place Contract

**Files:**

- Create: `api-validation/poc-v2/test/fixtures/kakao-category.json`
- Modify: `api-validation/poc-v2/src/contracts.js:8-21,75-80`
- Test: `api-validation/poc-v2/test/contracts.test.js`

**Interfaces:**

- Consumes: Kakao `documents[]` response objects.
- Produces: `normalizeKakaoPlace(doc)` and `normalizeKakaoKeyword(body)`.
- Normalized place shape:

```js
{
  id: String,
  name: String,
  category: String,
  categoryGroupCode: String,
  phone: String,
  address: String,
  roadAddress: String,
  lon: Number,
  lat: Number,
  url: String,
  distanceMeters: Number | null,
}
```

- [ ] **Step 1: Add a representative category fixture**

Create `test/fixtures/kakao-category.json`:

```json
{
  "meta": {
    "total_count": 1,
    "pageable_count": 1,
    "is_end": true
  },
  "documents": [
    {
      "id": "venue-101",
      "place_name": "모두의 식탁",
      "category_name": "음식점 > 한식 > 육류,고기",
      "category_group_code": "FD6",
      "category_group_name": "음식점",
      "phone": "02-123-4567",
      "address_name": "경기 안양시 만안구 안양동 1",
      "road_address_name": "경기 안양시 만안구 만안로 1",
      "x": "126.9231",
      "y": "37.4012",
      "place_url": "https://place.map.kakao.com/venue-101",
      "distance": "320"
    }
  ]
}
```

- [ ] **Step 2: Write the failing contract tests**

Add to `test/contracts.test.js`:

```js
test("Kakao 장소는 카테고리 그룹과 전화번호를 포함해 정규화한다", () => {
  const places = normalizeKakaoKeyword(fixture("kakao-category.json"));
  assert.deepEqual(places[0], {
    id: "venue-101",
    name: "모두의 식탁",
    category: "음식점 > 한식 > 육류,고기",
    categoryGroupCode: "FD6",
    phone: "02-123-4567",
    address: "경기 안양시 만안구 안양동 1",
    roadAddress: "경기 안양시 만안구 만안로 1",
    lon: 126.9231,
    lat: 37.4012,
    url: "https://place.map.kakao.com/venue-101",
    distanceMeters: 320,
  });
});

test("Kakao 선택 필드가 없어도 안전한 빈 문자열을 반환한다", () => {
  const places = normalizeKakaoKeyword({
    documents: [{
      id: "1",
      place_name: "장소",
      x: "127",
      y: "37",
    }],
  });
  assert.equal(places[0].categoryGroupCode, "");
  assert.equal(places[0].phone, "");
  assert.equal(places[0].distanceMeters, null);
});
```

- [ ] **Step 3: Run the focused tests and observe failure**

Run:

```bash
cd api-validation
node --test poc-v2/test/contracts.test.js
```

Expected: FAIL because `categoryGroupCode` and `phone` are absent.

- [ ] **Step 4: Extract a shared Kakao place normalizer**

Replace the mapping body in `src/contracts.js` with:

```js
function normalizeKakaoPlace(doc) {
  const lon = Number(requireValue(doc.x, "documents[].x"));
  const lat = Number(requireValue(doc.y, "documents[].y"));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error("계약 위반: documents[].x/y 숫자");
  }
  return Object.freeze({
    id: String(requireValue(doc.id, "documents[].id")),
    name: String(requireValue(doc.place_name, "documents[].place_name")),
    category: String(doc.category_name || ""),
    categoryGroupCode: String(doc.category_group_code || ""),
    phone: String(doc.phone || ""),
    address: String(doc.address_name || ""),
    roadAddress: String(doc.road_address_name || ""),
    lon,
    lat,
    url: String(doc.place_url || ""),
    distanceMeters:
      doc.distance === undefined || doc.distance === ""
        ? null
        : Number(doc.distance),
  });
}

function normalizeKakaoKeyword(body) {
  if (!Array.isArray(body.documents)) {
    throw new Error("계약 위반: documents");
  }
  return body.documents.map(normalizeKakaoPlace);
}
```

Export `normalizeKakaoPlace` only if a later unit test needs it; otherwise keep it private.

- [ ] **Step 5: Run contract and full regression tests**

Run:

```bash
node --test poc-v2/test/contracts.test.js
npm test
```

Expected: focused tests PASS and all existing tests plus the two new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add api-validation/poc-v2/src/contracts.js \
  api-validation/poc-v2/test/contracts.test.js \
  api-validation/poc-v2/test/fixtures/kakao-category.json
git commit -m "장소 후보에 필요한 Kakao 필드를 계약으로 고정한다"
```

---

### Task 2: Add Safe Kakao Category Search

**Files:**

- Create: `api-validation/poc-v2/test/providers.test.js`
- Modify: `api-validation/poc-v2/src/providers.js:1-76`

**Interfaces:**

- Consumes: `client.json({ provider, url, headers })`.
- Produces:

```js
kakaoCategory({
  category,
  lon,
  lat,
  radius = 1000,
  size = 15,
}) => Promise<{ data: NormalizedPlace[], record: CallRecord }>
```

- [ ] **Step 1: Write a failing provider request test**

Create `test/providers.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { createProviders } = require("../src/providers");

test("Kakao 카테고리 검색은 거리순 장소 요청을 만든다", async () => {
  let captured;
  const providers = createProviders({
    keys: { kakao: "hidden", odsay: "hidden", tmap: "hidden" },
    client: {
      json: async (request) => {
        captured = request;
        return { body: { documents: [] }, record: { provider: "KAKAO" } };
      },
    },
  });

  await providers.kakaoCategory({
    category: "FD6",
    lon: 126.9231,
    lat: 37.4012,
    radius: 1000,
  });

  const url = new URL(captured.url);
  assert.equal(url.pathname, "/v2/local/search/category.json");
  assert.equal(url.searchParams.get("category_group_code"), "FD6");
  assert.equal(url.searchParams.get("x"), "126.9231");
  assert.equal(url.searchParams.get("y"), "37.4012");
  assert.equal(url.searchParams.get("radius"), "1000");
  assert.equal(url.searchParams.get("sort"), "distance");
  assert.equal(url.searchParams.get("size"), "15");
  assert.equal(captured.headers.Authorization, "KakaoAK hidden");
});
```

- [ ] **Step 2: Run the test and observe failure**

Run:

```bash
node --test poc-v2/test/providers.test.js
```

Expected: FAIL with `providers.kakaoCategory is not a function`.

- [ ] **Step 3: Implement the minimal provider**

Add inside `createProviders()` in `src/providers.js`:

```js
async function kakaoCategory({
  category,
  lon,
  lat,
  radius = 1000,
  size = 15,
}) {
  const url = new URL("https://dapi.kakao.com/v2/local/search/category.json");
  const params = {
    category_group_code: category,
    x: lon,
    y: lat,
    radius,
    sort: "distance",
    size,
  };
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, String(value))
  );
  const result = await client.json({
    provider: "KAKAO",
    url: url.toString(),
    headers: { Authorization: `KakaoAK ${keys.kakao}` },
  });
  return {
    data: normalizeKakaoKeyword(result.body),
    record: result.record,
  };
}
```

Return it from the frozen provider object:

```js
return Object.freeze({
  kakaoKeyword,
  kakaoCategory,
  kakaoAddress,
  odsayIsochrone,
  tmapTransit,
});
```

- [ ] **Step 4: Run provider and full tests**

Run:

```bash
node --test poc-v2/test/providers.test.js
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api-validation/poc-v2/src/providers.js \
  api-validation/poc-v2/test/providers.test.js
git commit -m "추천 지역 주변의 Kakao 장소를 카테고리로 찾는다"
```

---

### Task 3: Implement Immutable Shortlist Rules and Transit Evaluation

**Files:**

- Create: `api-validation/poc-v2/src/shortlist.js`
- Create: `api-validation/poc-v2/test/shortlist.test.js`
- Modify: `api-validation/poc-v2/src/jobs.js:42-75`
- Test: `api-validation/poc-v2/test/jobs.test.js`

**Interfaces:**

- Produces:

```js
validateVenue(place) => Venue
addVenue(shortlist, place) => Venue[]
removeVenue(shortlist, venueId) => Venue[]
toggleVote(shortlist, venueId) => Venue[]
evaluateShortlist({ participants, venues, providers, onProgress })
  => Promise<{ candidates: RankedVenue[], calls: CallRecord[] }>
```

- Extends every job with:

```js
shortlist: []
shortlistEvaluation: null
shortlistCalls: []
```

- [ ] **Step 1: Write shortlist rule tests**

Create `test/shortlist.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  addVenue,
  removeVenue,
  toggleVote,
  evaluateShortlist,
} = require("../src/shortlist");

const venue = (id) => ({
  id,
  name: `장소 ${id}`,
  category: "음식점 > 한식",
  categoryGroupCode: "FD6",
  phone: "",
  address: "경기 안양시",
  roadAddress: "",
  lon: 126.92,
  lat: 37.4,
  url: `https://place.map.kakao.com/${id}`,
  distanceMeters: 300,
});

test("공동 후보는 불변 배열로 추가·제외·투표한다", () => {
  const original = [];
  const added = addVenue(original, venue("1"));
  const voted = toggleVote(added, "1");
  const removed = removeVenue(voted, "1");
  assert.deepEqual(original, []);
  assert.equal(added[0].vote, 0);
  assert.equal(voted[0].vote, 1);
  assert.deepEqual(removed, []);
});

test("공동 후보는 중복과 5개 초과를 거부한다", () => {
  let shortlist = [];
  for (let index = 1; index <= 5; index += 1) {
    shortlist = addVenue(shortlist, venue(String(index)));
  }
  assert.throws(() => addVenue(shortlist, venue("6")), /최대 5개/);
  assert.throws(() => addVenue(shortlist, venue("1")), /이미 담긴/);
});
```

- [ ] **Step 2: Write the failing evaluation test**

Append:

```js
test("공동 후보만 참여자별 TMAP 시간으로 평가한다", async () => {
  const calls = [];
  const providers = {
    tmapTransit: async ({ start, end }) => {
      calls.push([start.id, end.id]);
      return {
        data: {
          status: "READY",
          totalSeconds: end.id === "1" ? 1800 : 2400,
          totalWalkSeconds: 300,
          transferCount: 1,
          fareAmount: 1500,
        },
        record: { provider: "TMAP", status: 200 },
      };
    },
  };
  const result = await evaluateShortlist({
    participants: [
      { id: "P1", label: "A", lon: 126.8, lat: 37.4 },
      { id: "P2", label: "B", lon: 127.0, lat: 37.5 },
    ],
    venues: [venue("1"), venue("2")],
    providers,
  });
  assert.equal(calls.length, 4);
  assert.equal(result.candidates[0].id, "1");
  assert.equal(result.candidates[0].metrics.maxSeconds, 1800);
});
```

- [ ] **Step 3: Run the tests and observe failure**

Run:

```bash
node --test poc-v2/test/shortlist.test.js
```

Expected: FAIL because `src/shortlist.js` does not exist.

- [ ] **Step 4: Implement shortlist operations**

Create `src/shortlist.js` with:

```js
const { rankCandidates } = require("./pipeline");

function validateVenue(place) {
  const lon = Number(place.lon);
  const lat = Number(place.lat);
  if (!place.id || !place.name) throw new Error("장소 ID와 이름이 필요합니다.");
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error("장소 좌표가 올바르지 않습니다.");
  }
  return Object.freeze({
    id: String(place.id),
    name: String(place.name).slice(0, 100),
    category: String(place.category || "").slice(0, 200),
    categoryGroupCode: String(place.categoryGroupCode || "").slice(0, 3),
    phone: String(place.phone || "").slice(0, 30),
    address: String(place.address || "").slice(0, 200),
    roadAddress: String(place.roadAddress || "").slice(0, 200),
    lon,
    lat,
    url: String(place.url || "").slice(0, 500),
    distanceMeters: Number.isFinite(Number(place.distanceMeters))
      ? Number(place.distanceMeters)
      : null,
    vote: Number(place.vote) === 1 ? 1 : 0,
  });
}

function addVenue(shortlist, place) {
  const venue = validateVenue(place);
  if (shortlist.some((item) => item.id === venue.id)) {
    throw new Error("이미 담긴 공동 후보입니다.");
  }
  if (shortlist.length >= 5) {
    throw new Error("공동 후보는 최대 5개까지 담을 수 있습니다.");
  }
  return [...shortlist, venue];
}

function removeVenue(shortlist, venueId) {
  return shortlist.filter((venue) => venue.id !== String(venueId));
}

function toggleVote(shortlist, venueId) {
  let found = false;
  const next = shortlist.map((venue) => {
    if (venue.id !== String(venueId)) return venue;
    found = true;
    return Object.freeze({ ...venue, vote: venue.vote === 1 ? 0 : 1 });
  });
  if (!found) throw new Error("공동 후보를 찾을 수 없습니다.");
  return next;
}

async function evaluateShortlist({
  participants,
  venues,
  providers,
  onProgress = () => {},
}) {
  const calls = [];
  const evaluated = [];
  const total = participants.length * venues.length;
  let done = 0;
  onProgress({ phase: "SHORTLIST_EVALUATION", done, total });
  for (const venue of venues) {
    const routes = [];
    for (const participant of participants) {
      const response = await providers.tmapTransit({ start: participant, end: venue });
      calls.push(response.record);
      routes.push({ participantId: participant.id, ...response.data });
      done += 1;
      onProgress({ phase: "SHORTLIST_EVALUATION", done, total });
    }
    evaluated.push({ ...venue, routes });
  }
  return { candidates: rankCandidates(evaluated), calls };
}

module.exports = {
  validateVenue,
  addVenue,
  removeVenue,
  toggleVote,
  evaluateShortlist,
};
```

- [ ] **Step 5: Extend job state through methods, not direct route mutation**

In `src/jobs.js`, initialize:

```js
shortlist: [],
shortlistEvaluation: null,
shortlistCalls: [],
```

Add job-store methods:

```js
function update(id, updater) {
  const job = jobs.get(id);
  if (!job) return null;
  const next = updater(job);
  jobs.set(id, next);
  return next;
}
```

Return `{ create, get, update }`. Endpoint code in Task 5 must use `update()` and immutable object copies.

- [ ] **Step 6: Run focused and full tests**

Run:

```bash
node --test poc-v2/test/shortlist.test.js poc-v2/test/jobs.test.js
npm test
```

Expected: all tests PASS and prior job behavior remains unchanged.

- [ ] **Step 7: Commit**

```bash
git add api-validation/poc-v2/src/shortlist.js \
  api-validation/poc-v2/src/jobs.js \
  api-validation/poc-v2/test/shortlist.test.js \
  api-validation/poc-v2/test/jobs.test.js
git commit -m "공동 후보를 안전하게 축적하고 이동시간으로 비교한다"
```

---

### Task 4: Add Venue Input Validation

**Files:**

- Create: `api-validation/poc-v2/src/venue-search.js`
- Create: `api-validation/poc-v2/test/venue-search.test.js`

**Interfaces:**

- Produces:

```js
validateVenueSearch(searchParams) => {
  jobId: String,
  hubId: String,
  category: "FD6" | "CE7" | "CT1" | "AT4" | null,
  query: String | null,
  radius: Number,
}

findHub(job, hubId) => Hub
```

- [ ] **Step 1: Write failing validation tests**

Create `test/venue-search.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateVenueSearch, findHub } = require("../src/venue-search");

test("허용된 카테고리와 반경을 정규화한다", () => {
  const params = new URLSearchParams({
    jobId: "job-1",
    hubId: "hub-1",
    category: "FD6",
    radius: "1000",
  });
  assert.deepEqual(validateVenueSearch(params), {
    jobId: "job-1",
    hubId: "hub-1",
    category: "FD6",
    query: null,
    radius: 1000,
  });
});

test("카테고리 또는 키워드 정확히 하나만 허용한다", () => {
  const both = new URLSearchParams({
    jobId: "j",
    hubId: "h",
    category: "FD6",
    query: "고기",
  });
  assert.throws(() => validateVenueSearch(both), /하나만/);
  assert.throws(
    () => validateVenueSearch(new URLSearchParams({ jobId: "j", hubId: "h" })),
    /하나만/
  );
});

test("작업 결과 안의 거점만 찾는다", () => {
  const hub = { id: "h1", lon: 127, lat: 37, name: "명학역" };
  assert.equal(findHub({ result: { candidates: [hub] } }, "h1"), hub);
  assert.throws(() => findHub({ result: { candidates: [] } }, "h1"), /거점/);
});
```

- [ ] **Step 2: Run the test and observe failure**

Run:

```bash
node --test poc-v2/test/venue-search.test.js
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement exact validation**

Create `src/venue-search.js`:

```js
const ALLOWED_CATEGORIES = Object.freeze(["FD6", "CE7", "CT1", "AT4"]);

function validateVenueSearch(searchParams) {
  const jobId = String(searchParams.get("jobId") || "").trim();
  const hubId = String(searchParams.get("hubId") || "").trim();
  const categoryValue = String(searchParams.get("category") || "").trim();
  const queryValue = String(searchParams.get("query") || "").trim();
  const radius = Number(searchParams.get("radius") || 1000);
  if (!jobId || !hubId) throw new Error("jobId와 hubId가 필요합니다.");
  if (Boolean(categoryValue) === Boolean(queryValue)) {
    throw new Error("카테고리와 키워드 중 하나만 입력하세요.");
  }
  if (categoryValue && !ALLOWED_CATEGORIES.includes(categoryValue)) {
    throw new Error("허용하지 않은 장소 카테고리입니다.");
  }
  if (queryValue && (queryValue.length < 2 || queryValue.length > 50)) {
    throw new Error("장소 검색어는 2~50자여야 합니다.");
  }
  if (!Number.isInteger(radius) || radius < 100 || radius > 5000) {
    throw new Error("장소 검색 반경은 100~5000m 정수여야 합니다.");
  }
  return Object.freeze({
    jobId,
    hubId,
    category: categoryValue || null,
    query: queryValue || null,
    radius,
  });
}

function findHub(job, hubId) {
  const hub = job?.result?.candidates?.find(
    (candidate) => String(candidate.id) === String(hubId)
  );
  if (!hub) throw new Error("선택한 교통 거점을 찾을 수 없습니다.");
  return hub;
}

module.exports = { ALLOWED_CATEGORIES, validateVenueSearch, findHub };
```

- [ ] **Step 4: Run focused and full tests**

Run:

```bash
node --test poc-v2/test/venue-search.test.js
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api-validation/poc-v2/src/venue-search.js \
  api-validation/poc-v2/test/venue-search.test.js
git commit -m "장소 검색 범위를 작업 결과와 허용된 조건으로 제한한다"
```

---

### Task 5: Expose Venue and Shortlist HTTP Endpoints

**Files:**

- Modify: `api-validation/poc-v2/src/serve.js:11-105`
- Test: `api-validation/poc-v2/test/serve.test.js`

**Interfaces:**

- Consumes:
  - `jobs.get(jobId)`
  - `jobs.update(jobId, updater)`
  - `providers.kakaoCategory()`
  - `providers.kakaoKeyword()`
  - shortlist operations from Task 3
- Produces:
  - `GET /api/venues/search`
  - `GET /api/jobs/:jobId/shortlist`
  - `POST /api/jobs/:jobId/shortlist`
  - `DELETE /api/jobs/:jobId/shortlist/:venueId`
  - `POST /api/jobs/:jobId/shortlist/:venueId/vote`
  - `POST /api/jobs/:jobId/shortlist/evaluate`

- [ ] **Step 1: Extend the integration-test provider stub**

In `test/serve.test.js`, add:

```js
kakaoCategory: async ({ category }) => ({
  data: [{
    id: "venue-1",
    name: "모두의 식탁",
    category: "음식점 > 한식",
    categoryGroupCode: category,
    phone: "02-123-4567",
    address: "경기 안양시",
    roadAddress: "",
    lon: 126.92,
    lat: 37.4,
    url: "https://place.map.kakao.com/venue-1",
    distanceMeters: 300,
  }],
  record: { provider: "KAKAO", status: 200 },
}),
```

Use a completed job fixture with `result.candidates` containing `{ id: "hub-1", lon, lat }`.

- [ ] **Step 2: Write failing endpoint tests**

Add tests that:

```js
const venues = await fetch(
  `${base}/api/venues/search?jobId=${jobId}&hubId=hub-1&category=FD6&radius=1000`
).then((response) => response.json());
assert.equal(venues.places[0].name, "모두의 식탁");

const added = await fetch(`${base}/api/jobs/${jobId}/shortlist`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(venues.places[0]),
}).then((response) => response.json());
assert.equal(added.shortlist.length, 1);

const voted = await fetch(
  `${base}/api/jobs/${jobId}/shortlist/venue-1/vote`,
  { method: "POST" }
).then((response) => response.json());
assert.equal(voted.shortlist[0].vote, 1);

const evaluated = await fetch(
  `${base}/api/jobs/${jobId}/shortlist/evaluate`,
  { method: "POST" }
).then((response) => response.json());
assert.equal(evaluated.candidates.length, 1);
```

Also assert:

- unknown job returns 404;
- unknown hub returns 404;
- invalid category/radius/query returns 400;
- sixth or duplicate venue returns 409;
- missing shortlist venue returns 404.

- [ ] **Step 3: Run integration tests and observe failure**

Run:

```bash
node --test poc-v2/test/serve.test.js
```

Expected: FAIL with 404 for the new endpoints.

- [ ] **Step 4: Add small route helpers**

Import:

```js
const {
  addVenue,
  removeVenue,
  toggleVote,
  evaluateShortlist,
} = require("./shortlist");
const { validateVenueSearch, findHub } = require("./venue-search");
```

Add:

```js
function requireJob(jobs, id) {
  const job = jobs.get(id);
  if (!job) {
    const error = new Error("작업을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }
  return job;
}
```

Change the catch response from fixed 400 to:

```js
sendJson(response, Number(error.status) || 400, { error: error.message });
```

- [ ] **Step 5: Implement venue search without accepting coordinates**

Add before static file handling:

```js
if (request.method === "GET" && url.pathname === "/api/venues/search") {
  const input = validateVenueSearch(url.searchParams);
  const job = requireJob(jobs, input.jobId);
  let hub;
  try {
    hub = findHub(job, input.hubId);
  } catch (error) {
    error.status = 404;
    throw error;
  }
  const result = input.category
    ? await providers.kakaoCategory({
        category: input.category,
        lon: hub.lon,
        lat: hub.lat,
        radius: input.radius,
      })
    : await providers.kakaoKeyword({
        query: input.query,
        lon: hub.lon,
        lat: hub.lat,
        radius: input.radius,
        size: 15,
      });
  return sendJson(response, 200, {
    hub: { id: hub.id, name: hub.name, lon: hub.lon, lat: hub.lat },
    places: result.data,
    call: result.record,
  });
}
```

- [ ] **Step 6: Implement shortlist routes through immutable `jobs.update()`**

Use regexes rooted under `/api/jobs/{uuid}/shortlist`. Each successful mutation returns:

```js
{ shortlist: updated.shortlist }
```

For conflicts, attach `error.status = 409` before rethrowing. For missing venue removal/vote, return 404. Evaluation uses:

```js
const evaluation = await evaluateShortlist({
  participants: job.result.participants,
  venues: job.shortlist,
  providers,
  onProgress: (progress) => {
    jobs.update(job.id, (current) => ({ ...current, progress }));
  },
});
const updated = jobs.update(job.id, (current) => ({
  ...current,
  shortlistEvaluation: evaluation.candidates,
  shortlistCalls: evaluation.calls,
}));
return sendJson(response, 200, {
  candidates: updated.shortlistEvaluation,
  calls: updated.shortlistCalls,
});
```

Reject an empty shortlist with 400.

- [ ] **Step 7: Run integration and full tests**

Run:

```bash
node --test poc-v2/test/serve.test.js
npm test
```

Expected: all endpoint cases and all regression tests PASS.

- [ ] **Step 8: Commit**

```bash
git add api-validation/poc-v2/src/serve.js \
  api-validation/poc-v2/test/serve.test.js
git commit -m "장소 탐색과 공동 후보 결정을 HTTP 흐름으로 연결한다"
```

---

### Task 6: Separate Leaflet Rendering Behind a Map Adapter

**Files:**

- Create: `api-validation/poc-v2/web/map-adapter.js`
- Modify: `api-validation/poc-v2/src/serve.js:11-18`
- Modify: `api-validation/poc-v2/web/index.html:8-12,117-118`
- Modify: `api-validation/poc-v2/web/app.js:1-93,318-323`
- Test: `api-validation/poc-v2/test/web.test.js`

**Interfaces:**

- Produces browser global:

```js
window.MeetingMap = {
  create(elementId),
  renderScenario(scenario),
  renderVenues(places),
  renderShortlist(places),
  focusPlace(placeId),
}
```

- [ ] **Step 1: Write failing web artifact tests**

Add to `test/web.test.js`:

```js
test("지도 렌더링은 어댑터로 분리하고 OSM 기여자를 표시한다", () => {
  const html = read("web/index.html");
  const adapter = read("web/map-adapter.js");
  assert.match(html, /map-adapter\.js/);
  assert.match(adapter, /© OpenStreetMap contributors/);
  assert.match(adapter, /renderVenues/);
  assert.match(adapter, /renderShortlist/);
});
```

- [ ] **Step 2: Run the test and observe failure**

Run:

```bash
node --test poc-v2/test/web.test.js
```

Expected: FAIL because `map-adapter.js` does not exist.

- [ ] **Step 3: Implement the adapter**

Create `web/map-adapter.js` as an IIFE. Keep separate arrays for scenario, venue, and shortlist layers:

```js
(() => {
  let map;
  let scenarioLayers = [];
  let venueLayers = [];
  let shortlistLayers = [];
  const markerByPlaceId = new Map();
  const colors = ["#2557d6", "#f39c12", "#8e44ad", "#16a085", "#d35400"];

  function clear(group) {
    group.forEach((layer) => layer.remove());
    return [];
  }

  function create(elementId) {
    map = L.map(elementId, { zoomControl: true }).setView([37.45, 126.9], 8);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
  }

  function renderVenues(places) {
    venueLayers = clear(venueLayers);
    markerByPlaceId.clear();
    places.forEach((place) => {
      const marker = L.circleMarker([place.lat, place.lon], {
        radius: 7,
        color: "#2557d6",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 3,
      }).addTo(map).bindPopup(`<strong>${escapeHtml(place.name)}</strong>`);
      markerByPlaceId.set(place.id, marker);
      venueLayers.push(marker);
    });
  }

  function renderShortlist(places) {
    shortlistLayers = clear(shortlistLayers);
    places.forEach((place) => {
      shortlistLayers.push(
        L.circleMarker([place.lat, place.lon], {
          radius: 10,
          color: "#e35353",
          fillColor: "#e35353",
          fillOpacity: .85,
          weight: 2,
        }).addTo(map).bindPopup(`<strong>공동 후보 · ${escapeHtml(place.name)}</strong>`)
      );
    });
  }

  function focusPlace(placeId) {
    const marker = markerByPlaceId.get(String(placeId));
    if (marker) {
      map.panTo(marker.getLatLng());
      marker.openPopup();
    }
  }

  window.MeetingMap = Object.freeze({
    create,
    renderScenario,
    renderVenues,
    renderShortlist,
    focusPlace,
  });
})();
```

Move the existing `renderMap()` behavior into `renderScenario()` and keep its output unchanged.

- [ ] **Step 4: Wire static serving and script order**

Add `/map-adapter.js` to `resolvePublicFile()`.

In `index.html`, load:

```html
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="/map-adapter.js"></script>
<script src="/app.js"></script>
```

In `app.js`, replace map initialization with:

```js
MeetingMap.create("map");
```

Replace `renderMap(scenario)` with:

```js
MeetingMap.renderScenario(scenario);
```

- [ ] **Step 5: Run web and full tests**

Run:

```bash
node --test poc-v2/test/web.test.js poc-v2/test/serve.test.js
npm test
```

Expected: all tests PASS and static adapter route returns JavaScript.

- [ ] **Step 6: Commit**

```bash
git add api-validation/poc-v2/web/map-adapter.js \
  api-validation/poc-v2/web/index.html \
  api-validation/poc-v2/web/app.js \
  api-validation/poc-v2/src/serve.js \
  api-validation/poc-v2/test/web.test.js \
  api-validation/poc-v2/test/serve.test.js
git commit -m "기존 지도를 보존하며 장소 레이어를 확장 가능하게 한다"
```

---

### Task 7: Build Venue Discovery and Shared Shortlist UI

**Files:**

- Modify: `api-validation/poc-v2/web/index.html:90-108`
- Modify: `api-validation/poc-v2/web/app.js:1-343`
- Modify: `api-validation/poc-v2/web/styles.css`
- Test: `api-validation/poc-v2/test/web.test.js`

**Interfaces:**

- Browser state:

```js
let activeJobId = null;
let activeScenario = null;
let activeHubId = null;
let currentVenues = [];
let currentShortlist = [];
```

- [ ] **Step 1: Add failing HTML structure tests**

Assert these IDs in `test/web.test.js`:

```js
[
  "venue-explorer",
  "hub-select",
  "venue-category-tabs",
  "venue-query",
  "search-venues",
  "venue-results",
  "shortlist",
  "evaluate-shortlist",
  "shortlist-matrix",
]
```

Also assert that `app.js` references `/api/venues/search`, `/shortlist`, and uses `escapeHtml()` for card fields.

- [ ] **Step 2: Run the test and observe failure**

Run:

```bash
node --test poc-v2/test/web.test.js
```

Expected: FAIL for missing controls.

- [ ] **Step 3: Add semantic HTML below the transit matrix**

Add:

```html
<section class="panel" id="venue-explorer" hidden>
  <div class="section-heading">
    <div>
      <p class="eyebrow dark">VENUE DISCOVERY</p>
      <h2>이 지역에서 어디로 갈까요?</h2>
      <p>공정한 지역을 선택하고 실제 약속 장소를 함께 모아보세요.</p>
    </div>
    <label>추천 지역
      <select id="hub-select"></select>
    </label>
  </div>
  <div id="venue-category-tabs" class="category-tabs" role="tablist">
    <button type="button" data-category="FD6">음식점</button>
    <button type="button" data-category="CE7">카페</button>
    <button type="button" data-category="CT1">문화시설</button>
    <button type="button" data-category="AT4">관광명소</button>
  </div>
  <div class="venue-search">
    <input id="venue-query" type="search" maxlength="50"
      placeholder="고기, 파스타, 보드게임처럼 검색">
    <button id="search-venues" type="button">직접 검색</button>
  </div>
  <p id="venue-status" aria-live="polite"></p>
  <div id="venue-results" class="venue-grid"></div>
</section>

<section class="panel" id="shortlist-panel" hidden>
  <div class="section-heading">
    <div>
      <p class="eyebrow dark">SHARED SHORTLIST</p>
      <h2>우리의 공동 후보</h2>
      <p>최대 5곳을 담고 실제 이동시간과 팀 투표를 함께 비교합니다.</p>
    </div>
    <button id="evaluate-shortlist" type="button">실제 이동시간 비교</button>
  </div>
  <div id="shortlist" class="shortlist-grid"></div>
  <div class="table-wrap"><table id="shortlist-matrix"></table></div>
</section>
```

- [ ] **Step 4: Preserve job identity for interactive results**

When `pollJob(jobId)` succeeds:

```js
activeJobId = jobId;
activeScenario = job.result;
renderVenueExplorer(job.result);
```

For prebuilt report scenarios, keep venue explorer hidden because they have no live job ID.

- [ ] **Step 5: Render hub options and category searches**

Implement:

```js
function renderVenueExplorer(scenario) {
  const explorer = document.querySelector("#venue-explorer");
  if (!activeJobId || !scenario.candidates?.length) {
    explorer.hidden = true;
    return;
  }
  explorer.hidden = false;
  const select = document.querySelector("#hub-select");
  select.innerHTML = scenario.candidates.map((hub) =>
    `<option value="${escapeHtml(hub.id)}">${hub.rank}. ${escapeHtml(hub.name)}</option>`
  ).join("");
  activeHubId = select.value;
  select.onchange = () => {
    activeHubId = select.value;
    currentVenues = [];
    MeetingMap.renderVenues([]);
    renderVenueCards();
  };
}

async function searchVenues({ category = null, query = null }) {
  if (!activeJobId || !activeHubId) throw new Error("추천 지역을 먼저 계산하세요.");
  const params = new URLSearchParams({
    jobId: activeJobId,
    hubId: activeHubId,
    radius: "1000",
  });
  if (category) params.set("category", category);
  if (query) params.set("query", query);
  const response = await fetch(`/api/venues/search?${params}`).then((value) => value.json());
  if (response.error) throw new Error(response.error);
  currentVenues = response.places;
  MeetingMap.renderVenues(currentVenues);
  renderVenueCards();
}
```

- [ ] **Step 6: Render safe venue cards and add actions**

Each card includes escaped name, category, distance, address, phone, a Kakao URL with `target="_blank"` and `rel="noopener noreferrer"`, plus an add button. Validate the URL protocol before rendering:

```js
function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "#";
  } catch {
    return "#";
  }
}
```

Card button actions call:

```js
POST /api/jobs/{activeJobId}/shortlist
```

with the selected normalized place as JSON, then update `currentShortlist`, call `MeetingMap.renderShortlist()`, and render shortlist cards.

- [ ] **Step 7: Implement shortlist remove, vote, and evaluate UI**

Use event delegation with `data-action` and `data-id`. Never interpolate unescaped provider strings into attributes; use IDs only after `encodeURIComponent()` for URLs.

Evaluation renders:

- travel fairness rank;
- votes as a separate badge;
- max and average minutes;
- participant route cells;
- unavailable routes explicitly.

- [ ] **Step 8: Add responsive styling**

Add CSS with:

```css
.category-tabs { display: flex; gap: 8px; overflow-x: auto; }
.venue-grid, .shortlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 14px;
}
.venue-card, .shortlist-card {
  border: 1px solid #dfe5f0;
  border-radius: 18px;
  padding: 16px;
  background: #fff;
}
@media (max-width: 640px) {
  .venue-grid, .shortlist-grid { grid-template-columns: 1fr; }
  .venue-search { display: grid; grid-template-columns: 1fr; }
}
```

- [ ] **Step 9: Run web and full tests**

Run:

```bash
node --test poc-v2/test/web.test.js
npm test
```

Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add api-validation/poc-v2/web/index.html \
  api-validation/poc-v2/web/app.js \
  api-validation/poc-v2/web/styles.css \
  api-validation/poc-v2/test/web.test.js
git commit -m "추천 지역에서 실제 장소를 함께 모으고 비교하게 한다"
```

---

### Task 8: Make External API Usage Explainable in the UI

**Files:**

- Modify: `api-validation/poc-v2/src/http-client.js:5-58`
- Modify: `api-validation/poc-v2/src/providers.js`
- Modify: `api-validation/poc-v2/src/pipeline.js`
- Modify: `api-validation/poc-v2/web/app.js:144-158`
- Test: `api-validation/poc-v2/test/http-client.test.js`
- Test: `api-validation/poc-v2/test/web.test.js`

**Interfaces:**

- Extends safe call record:

```js
{
  provider,
  purpose,
  method,
  url,
  parameterNames,
  status,
  attempts,
  durationMs,
  bytes,
}
```

- [ ] **Step 1: Write failing call-record tests**

Add:

```js
test("호출 기록은 목적과 비밀값 없는 파라미터 이름만 남긴다", async () => {
  const client = createHttpClient({
    fetchImpl: async () => new Response("{}", { status: 200 }),
  });
  const result = await client.json({
    provider: "KAKAO",
    purpose: "VENUE_CATEGORY_SEARCH",
    url: "https://example.test/search?category=FD6&apiKey=secret",
    parameterNames: ["category", "apiKey"],
  });
  assert.equal(result.record.purpose, "VENUE_CATEGORY_SEARCH");
  assert.deepEqual(result.record.parameterNames, ["category"]);
  assert.doesNotMatch(JSON.stringify(result.record), /secret|apiKey/);
});
```

- [ ] **Step 2: Run the focused test and observe failure**

Run:

```bash
node --test poc-v2/test/http-client.test.js
```

Expected: FAIL because purpose and parameter names are not recorded.

- [ ] **Step 3: Extend `client.json()` safely**

Accept:

```js
json({
  provider,
  purpose = "UNSPECIFIED",
  url,
  method = "GET",
  headers = {},
  body,
  parameterNames = [],
})
```

Record only:

```js
purpose: String(purpose),
parameterNames: parameterNames.filter(
  (name) => !["apiKey", "appKey", "Authorization", "key"].includes(name)
),
```

Never record header values or request bodies.

- [ ] **Step 4: Label every provider request**

Use these exact purposes:

```text
ORIGIN_KEYWORD_SEARCH
VENUE_KEYWORD_SEARCH
VENUE_CATEGORY_SEARCH
ADDRESS_SEARCH
TRANSIT_ISOCHRONE
HUB_KEYWORD_SEARCH
HUB_TRANSIT_EVALUATION
SHORTLIST_TRANSIT_EVALUATION
```

Where the same provider method serves multiple purposes, add a `purpose` argument with a safe default and pass it from the pipeline or route.

- [ ] **Step 5: Expand the call table**

Render columns:

```text
목적 | 공급자 | 메서드 | 안전한 URL | 파라미터 | 상태 | 시도 | 응답시간
```

All cells use `escapeHtml()`. Render URL text but do not make it clickable.

- [ ] **Step 6: Run focused and full tests**

Run:

```bash
node --test poc-v2/test/http-client.test.js poc-v2/test/web.test.js
npm test
```

Expected: all tests PASS and secret-scanning tests remain green.

- [ ] **Step 7: Commit**

```bash
git add api-validation/poc-v2/src/http-client.js \
  api-validation/poc-v2/src/providers.js \
  api-validation/poc-v2/src/pipeline.js \
  api-validation/poc-v2/web/app.js \
  api-validation/poc-v2/test/http-client.test.js \
  api-validation/poc-v2/test/web.test.js
git commit -m "외부 API 요청 목적과 계약을 화면에서 설명한다"
```

---

### Task 9: Live PoC, Documentation, and Visual Verification

**Files:**

- Modify: `api-validation/poc-v2/README.md`
- Modify: `api-validation/RESULTS_V2.md`

**Interfaces:**

- No new production interface.
- Produces reproducible evidence for all category types and shortlist evaluation.

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
cd api-validation
npm test
```

Expected:

- zero failed tests;
- the original 32 tests still pass;
- all new contract, provider, shortlist, validation, endpoint, and web tests pass.

- [ ] **Step 2: Run dependency and secret checks**

Run:

```bash
npm audit --omit=dev
git diff --check
```

Expected: zero vulnerabilities and no whitespace errors.

Scan tracked PoC files against actual `.env` values using a script that prints only filenames on a match. Expected: `secret value scan: clean`.

- [ ] **Step 3: Regenerate the original scenario report**

Run from `api-validation` after loading `backend/.env`:

```bash
npm run poc
```

Expected:

- `metro-west`: `SUCCEEDED`
- `metro-outer`: `SUCCEEDED`
- `no-intersection`: `NO_INTERSECTION`
- overall report: `PASS`

- [ ] **Step 4: Start the server and execute the full live venue flow**

Run:

```bash
npm run serve
```

Open `http://localhost:4173` and verify:

1. Search and select `정왕역`.
2. Search and select `강남역`.
3. Select 60 minutes and run.
4. Select the first ranked hub.
5. Search `FD6`, `CE7`, `CT1`, and `AT4`.
6. Search keyword `보드게임`.
7. Add three venues to the shortlist.
8. Vote for one venue.
9. Remove one venue, then add it again.
10. Evaluate shortlist transit times.
11. Confirm fairness rank and votes appear separately.

- [ ] **Step 5: Verify map and responsive behavior**

Desktop:

- scenario polygons and hub markers remain;
- venue markers appear;
- shortlist markers are visually distinct;
- selecting a venue card focuses its marker;
- OSM attribution reads `© OpenStreetMap contributors`.

Mobile at 390×844:

- category tabs remain horizontally usable;
- cards become one column;
- tables scroll horizontally without page overflow;
- buttons and inputs remain visible.

Expected browser console: zero errors and zero warnings caused by application code.

- [ ] **Step 6: Update README with exact user steps**

Document:

- existing fair-region stage;
- venue category and keyword stage;
- shortlist maximum and ephemeral nature;
- shortlist transit evaluation;
- OSM usage boundary;
- exact safe external request examples;
- current environment variable names.

- [ ] **Step 7: Update live results**

In `RESULTS_V2.md`, record:

- timestamp;
- category result counts for `FD6`, `CE7`, `CT1`, `AT4`;
- keyword query and result count;
- shortlisted venue names;
- participant travel-time matrix;
- browser and mobile verification;
- remaining risks without API key values.

- [ ] **Step 8: Final regression verification**

Run:

```bash
npm test
npm audit --omit=dev
git diff --check
git status --short
```

Expected: tests pass, zero audit findings, no diff errors, and only intended documentation changes remain before commit.

- [ ] **Step 9: Commit**

```bash
git add api-validation/poc-v2/README.md api-validation/RESULTS_V2.md
git commit -m "실제 장소 공동 결정 PoC의 실행 근거를 남긴다"
```

---

## Final Acceptance Checklist

- [ ] Existing origin, isochrone, intersection, hub ranking, matrix, and prebuilt scenario flows still work.
- [ ] Kakao category searches work for `FD6`, `CE7`, `CT1`, and `AT4`.
- [ ] Keyword searches work within the selected hub radius.
- [ ] The server, not the browser, resolves hub coordinates.
- [ ] Venue cards and map markers show the same normalized places.
- [ ] The shortlist rejects duplicates and a sixth item.
- [ ] Add, remove, vote, and evaluate operations work.
- [ ] Only shortlisted venues trigger the second TMAP evaluation.
- [ ] Fairness rank and votes remain separate.
- [ ] API call explanations show purpose, method, safe URL, parameter names, status, attempts, and latency.
- [ ] No secret values, authentication headers, or raw provider responses reach the browser or reports.
- [ ] Leaflet and OpenStreetMap remain; Kakao Map domain registration is unnecessary.
- [ ] OSM attribution is `© OpenStreetMap contributors`.
- [ ] Desktop and 390px mobile flows pass.
- [ ] All automated tests, audit, live scenarios, and secret scans pass.

