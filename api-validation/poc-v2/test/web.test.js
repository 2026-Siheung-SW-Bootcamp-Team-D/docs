const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const web = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "web", name), "utf8");

test("HTML에 인터랙티브 입력과 결과 영역이 모두 있다", () => {
  const html = web("index.html");
  for (const id of [
    "participant-editor",
    "duration",
    "run-custom",
    "job-progress",
    "scenario-tabs",
    "map",
    "ranking",
    "matrix",
    "calls",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("HTML에 장소 탐색과 공동 후보 영역이 모두 있다", () => {
  const html = web("index.html");
  for (const id of [
    "venue-explorer",
    "hub-select",
    "venue-category-tabs",
    "venue-query",
    "search-venues",
    "venue-results",
    "shortlist",
    "evaluate-shortlist",
    "shortlist-matrix",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("브라우저 코드는 서버 작업 API를 사용하고 HTML escape를 적용한다", () => {
  const app = web("app.js");
  assert.match(app, /\/api\/origins\/search/);
  assert.match(app, /\/api\/jobs/);
  assert.match(app, /\/api\/venues\/search/);
  assert.match(app, /\/shortlist/);
  assert.match(app, /escapeHtml/);
  assert.doesNotMatch(app, /KAKAO_REST_KEY|ODSAY_KEY|TMAP_APP_KEY/);
});

test("지도 렌더링은 어댑터로 분리하고 OSM 기여자를 표시한다", () => {
  const html = web("index.html");
  const adapter = web("map-adapter.js");
  assert.match(html, /map-adapter\.js/);
  assert.match(adapter, /© OpenStreetMap contributors/);
  assert.match(adapter, /renderVenues/);
  assert.match(adapter, /renderShortlist/);
});
