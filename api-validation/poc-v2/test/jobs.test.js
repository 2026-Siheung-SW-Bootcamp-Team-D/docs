const test = require("node:test");
const assert = require("node:assert/strict");
const { validateScenario, createJobStore } = require("../src/jobs");

test("참여자 2~5명과 30·45·60분만 허용한다", () => {
  const participants = [
    { id: "P1", label: "정왕역", lon: 126.742616, lat: 37.345955 },
    { id: "P2", label: "강남역", lon: 127.027619, lat: 37.497942 },
  ];
  assert.equal(
    validateScenario({ title: "직접 실험", minutes: 45, participants }).minutes,
    45
  );
  assert.throws(
    () => validateScenario({ title: "한 명", minutes: 45, participants: participants.slice(0, 1) }),
    /2명 이상/
  );
  assert.throws(
    () => validateScenario({ title: "잘못된 시간", minutes: 40, participants }),
    /30, 45, 60/
  );
});

test("대한민국 밖 좌표와 지나치게 긴 이름을 안전하게 정규화한다", () => {
  assert.throws(
    () => validateScenario({
      minutes: 45,
      participants: [
        { label: "A", lon: 0, lat: 0 },
        { label: "B", lon: 127, lat: 37.5 },
      ],
    }),
    /대한민국 좌표/
  );
  const result = validateScenario({
    title: "x".repeat(100),
    minutes: 45,
    participants: [
      { label: "a".repeat(100), lon: 126.7, lat: 37.3 },
      { label: "B", lon: 127, lat: 37.5 },
    ],
  });
  assert.equal(result.title.length, 60);
  assert.equal(result.participants[0].label.length, 40);
});

test("작업 진행률과 성공 결과를 보존한다", async () => {
  const runner = async (scenario, _providers, onProgress) => {
    onProgress({ phase: "ISOCHRONE", done: 1, total: 2 });
    onProgress({ phase: "TRANSIT_EVALUATION", done: 2, total: 2 });
    return { ...scenario, status: "SUCCEEDED", candidates: [] };
  };
  const store = createJobStore({ runner, providers: {} });
  const job = store.create({
    title: "직접 실험",
    minutes: 45,
    participants: [
      { id: "P1", label: "정왕역", lon: 126.742616, lat: 37.345955 },
      { id: "P2", label: "강남역", lon: 127.027619, lat: 37.497942 },
    ],
  });
  await new Promise((resolve) => setImmediate(resolve));
  const completed = store.get(job.id);
  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(completed.progress.phase, "TRANSIT_EVALUATION");
});
