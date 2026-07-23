const test = require("node:test");
const assert = require("node:assert/strict");
const { rankCandidates, summarizeCandidate } = require("../src/pipeline");

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
