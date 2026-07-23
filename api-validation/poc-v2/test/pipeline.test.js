const test = require("node:test");
const assert = require("node:assert/strict");
const { featureCollection, polygon } = require("@turf/helpers");
const { rankCandidates, summarizeCandidate, runScenario } = require("../src/pipeline");

test("도달 불가 인원, 최장시간, 평균시간, 환승 순서로 정렬한다", () => {
  const candidates = [
    { id: "A", routes: [{ status: "READY", totalSeconds: 1800, transferCount: 0 }, { status: "READY", totalSeconds: 3600, transferCount: 1 }] },
    { id: "B", routes: [{ status: "READY", totalSeconds: 2400, transferCount: 0 }, { status: "READY", totalSeconds: 2700, transferCount: 0 }] },
    { id: "C", routes: [{ status: "READY", totalSeconds: 1200, transferCount: 0 }, { status: "UNAVAILABLE" }] },
  ];
  const ranked = rankCandidates(candidates);
  assert.deepEqual(ranked.map((candidate) => candidate.id), ["B", "A", "C"]);
});

test("순위 이유를 검증 가능한 숫자로 만든다", () => {
  const summary = summarizeCandidate({
    id: "B",
    routes: [
      { status: "READY", totalSeconds: 2400, transferCount: 0 },
      { status: "READY", totalSeconds: 2700, transferCount: 1 },
    ],
  });
  assert.deepEqual(summary.metrics, {
    unreachableCount: 0,
    maxSeconds: 2700,
    avgSeconds: 2550,
    transferAvg: 0.5,
  });
});

test("모든 경로가 없으면 마지막 순위로 보내는 유한한 지표를 만든다", () => {
  const summary = summarizeCandidate({
    id: "X",
    routes: [{ status: "UNAVAILABLE" }, { status: "UNAVAILABLE" }],
  });
  assert.equal(summary.metrics.unreachableCount, 2);
  assert.equal(summary.metrics.maxSeconds, null);
  assert.equal(summary.metrics.avgSeconds, null);
  assert.equal(summary.metrics.transferAvg, null);
});

test("도달권부터 대중교통 평가까지 진행률과 후보 순위를 만든다", async () => {
  const area = featureCollection([
    polygon([[[126.7,37.3],[127.1,37.3],[127.1,37.6],[126.7,37.6],[126.7,37.3]]]),
  ]);
  const providers = {
    odsayIsochrone: async () => ({
      data: area,
      record: { provider: "ODSAY", status: 200, durationMs: 1, bytes: 10, attempts: 1 },
    }),
    kakaoKeyword: async () => ({
      data: [{ id: "hub-1", name: "중앙역", lon: 126.9, lat: 37.45, roadAddress: "", address: "" }],
      record: { provider: "KAKAO", status: 200, durationMs: 1, bytes: 10, attempts: 1 },
    }),
    tmapTransit: async ({ start }) => ({
      data: { status: "READY", totalSeconds: start.id === "P1" ? 1200 : 1800, totalWalkSeconds: 300, transferCount: 1, fareAmount: 1500 },
      record: { provider: "TMAP", status: 200, durationMs: 1, bytes: 10, attempts: 1 },
    }),
  };
  const progress = [];
  const result = await runScenario({
    id: "test",
    title: "테스트",
    minutes: 45,
    participants: [
      { id: "P1", label: "A", lon: 126.8, lat: 37.4 },
      { id: "P2", label: "B", lon: 127.0, lat: 37.5 },
    ],
  }, providers, (value) => progress.push(value));

  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.candidates[0].name, "중앙역");
  assert.deepEqual(
    [...new Set(progress.map((value) => value.phase))],
    ["ISOCHRONE", "INTERSECTION", "HUB_COLLECTION", "TRANSIT_EVALUATION"]
  );
});
