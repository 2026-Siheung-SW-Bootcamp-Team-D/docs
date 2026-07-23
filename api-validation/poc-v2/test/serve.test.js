const test = require("node:test");
const assert = require("node:assert/strict");
const { resolvePublicFile, createAppServer } = require("../src/serve");

test("정적 파일 경로를 allowlist로 제한한다", () => {
  assert.match(resolvePublicFile("/"), /poc-v2\/web\/index\.html$/);
  assert.match(resolvePublicFile("/report-data.json"), /poc-v2\/output\/report-data\.json$/);
  assert.equal(resolvePublicFile("/../config.js"), null);
});

test("출발지 검색 결과와 계산 작업 상태를 반환한다", async (context) => {
  const providers = {
    kakaoKeyword: async () => ({
      data: [{ id: "1", name: "정왕역", lon: 126.742616, lat: 37.345955 }],
      record: { provider: "KAKAO", status: 200 },
    }),
  };
  const jobs = {
    create: () => ({ id: "00000000-0000-4000-8000-000000000001", status: "QUEUED" }),
    get: () => ({
      id: "00000000-0000-4000-8000-000000000001",
      status: "RUNNING",
      progress: { phase: "ISOCHRONE", done: 1, total: 2 },
    }),
  };
  const server = createAppServer({ providers, jobs });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const port = server.address().port;

  const search = await fetch(
    `http://127.0.0.1:${port}/api/origins/search?q=${encodeURIComponent("정왕역")}`
  ).then((response) => response.json());
  assert.equal(search.places[0].name, "정왕역");

  const created = await fetch(`http://127.0.0.1:${port}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      minutes: 45,
      participants: [
        { label: "A", lon: 126.7, lat: 37.3 },
        { label: "B", lon: 127, lat: 37.5 },
      ],
    }),
  }).then((response) => response.json());
  assert.equal(created.status, "QUEUED");

  const status = await fetch(
    `http://127.0.0.1:${port}/api/jobs/${created.id}`
  ).then((response) => response.json());
  assert.equal(status.progress.phase, "ISOCHRONE");
});

test("짧은 검색어와 존재하지 않는 작업을 거부한다", async (context) => {
  const server = createAppServer({
    providers: { kakaoKeyword: async () => ({ data: [] }) },
    jobs: { create: () => null, get: () => null },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const port = server.address().port;
  const search = await fetch(`http://127.0.0.1:${port}/api/origins/search?q=a`);
  assert.equal(search.status, 400);
  const job = await fetch(
    `http://127.0.0.1:${port}/api/jobs/00000000-0000-4000-8000-000000000002`
  );
  assert.equal(job.status, 404);
});
