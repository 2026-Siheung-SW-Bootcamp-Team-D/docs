const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const web = (name) =>
  fs.readFileSync(path.join(__dirname, "..", "web", name), "utf8");

function createElement(tagName = "div") {
  const element = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    dataset: {},
    style: {},
    className: "",
    hidden: false,
    value: "",
    disabled: false,
    textContent: "",
    innerHTML: "",
    listeners: new Map(),
    classList: {
      toggle: () => {},
    },
    replaceChildren(...children) {
      this.children = children;
    },
    append(...children) {
      this.children.push(...children);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    prepend(...children) {
      this.children.unshift(...children);
    },
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    querySelectorAll() {
      return [];
    },
  };
  return element;
}

function loadBrowserTestHooks({ fetchImpl }) {
  const elements = new Map([
    ["#venue-status", createElement("p")],
    ["#venue-results", createElement("div")],
    ["#shortlist-panel", createElement("section")],
    ["#shortlist-matrix", createElement("table")],
  ]);
  elements.get("#shortlist-panel").hidden = false;

  const mapCalls = [];
  const hooks = { skipBoot: true };
  const context = {
    URL,
    URLSearchParams,
    console,
    fetch: fetchImpl,
    document: {
      createElement,
      querySelector(selector) {
        const element = elements.get(selector);
        if (!element) {
          throw new Error(`Unexpected selector: ${selector}`);
        }
        return element;
      },
      querySelectorAll() {
        return [];
      },
    },
    MeetingMap: {
      renderVenues(places) {
        mapCalls.push(places.map((place) => place.name));
      },
      renderShortlist() {},
      renderScenario() {},
      create() {},
    },
    setTimeout,
    clearTimeout,
    __TEAMD_WEB_TEST__: hooks,
  };
  context.window = context;
  context.globalThis = context;

  const source = web("app.js");
  vm.runInNewContext(source, context, { filename: "app.js" });

  return { hooks, elements, mapCalls };
}

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

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

test("브라우저 코드는 안전한 외부 URL과 인코딩된 경로 조각만 사용한다", () => {
  const { hooks } = loadBrowserTestHooks({
    fetchImpl: async () => ({ json: async () => ({ places: [] }) }),
  });

  assert.equal(
    hooks.safeHttpUrl("https://place.map.kakao.com/123"),
    "https://place.map.kakao.com/123"
  );
  assert.equal(hooks.safeHttpUrl("http://example.com/path"), "http://example.com/path");
  assert.equal(hooks.safeHttpUrl("javascript:alert(1)"), "#");
  assert.equal(hooks.safeHttpUrl("not-a-url"), "#");
  assert.equal(
    hooks.encodePathSegment("venue/1?group=a b"),
    "venue%2F1%3Fgroup%3Da%20b"
  );
});

test("최신 장소 검색만 venue 상태와 지도를 갱신하고 오래된 응답은 무시한다", async () => {
  const pending = [];
  const fetchUrls = [];
  const { hooks, elements, mapCalls } = loadBrowserTestHooks({
    fetchImpl: async (url) => {
      fetchUrls.push(String(url));
      const next = deferred();
      pending.push(next);
      return next.promise;
    },
  });

  hooks.setVenueTestState({
    activeJobId: "job-1",
    activeHubId: "hub-1",
  });

  const staleSearch = hooks.searchVenues({ category: "FD6" });
  const freshSearch = hooks.searchVenues({ query: "카페" });

  assert.equal(hooks.getVenueState().currentVenues.length, 0);
  assert.equal(elements.get("#venue-status").textContent, "실제 장소를 찾는 중입니다.");

  pending[1].resolve({
    json: async () => ({
      places: [
        {
          id: "fresh-1",
          name: "새 응답",
          category: "카페",
          address: "경기 안양시",
          roadAddress: "",
          phone: "",
          url: "https://place.map.kakao.com/fresh-1",
          distanceMeters: 120,
        },
      ],
    }),
  });
  await freshSearch;

  pending[0].resolve({
    json: async () => ({
      places: [
        {
          id: "stale-1",
          name: "오래된 응답",
          category: "음식점",
          address: "경기 시흥시",
          roadAddress: "",
          phone: "",
          url: "https://place.map.kakao.com/stale-1",
          distanceMeters: 500,
        },
      ],
    }),
  });
  await staleSearch;

  assert.match(fetchUrls[0], /category=FD6/);
  assert.match(fetchUrls[1], /query=%EC%B9%B4%ED%8E%98/);
  assert.deepEqual(
    hooks.getVenueState().currentVenues.map((place) => place.name),
    ["새 응답"]
  );
  assert.equal(
    elements.get("#venue-status").textContent,
    "1곳을 찾았습니다. 공동 후보에 담아 비교해 보세요."
  );
  assert.equal(
    JSON.stringify(mapCalls),
    JSON.stringify([[], [], ["새 응답"]])
  );
});
