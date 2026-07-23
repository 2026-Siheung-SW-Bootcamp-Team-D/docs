const test = require("node:test");
const assert = require("node:assert/strict");
const { resolvePublicFile, createAppServer } = require("../src/serve");

function createCompletedJob(id = "00000000-0000-4000-8000-000000000010") {
  return {
    id,
    status: "SUCCEEDED",
    progress: { phase: "DONE", done: 1, total: 1 },
    result: {
      participants: [
        { id: "P1", label: "A", lon: 126.8, lat: 37.4 },
        { id: "P2", label: "B", lon: 127.0, lat: 37.5 },
      ],
      candidates: [{ id: "hub-1", name: "중앙역", lon: 126.91, lat: 37.4 }],
    },
    shortlist: [],
    shortlistEvaluation: null,
    shortlistCalls: [],
  };
}

function createMutableJobs(job) {
  const jobs = new Map([[job.id, job]]);
  return {
    create: () => ({ id: job.id, status: "QUEUED" }),
    get: (id) => jobs.get(id) || null,
    update: (id, updater) => {
      const current = jobs.get(id);
      if (!current) return null;
      const next = updater(current);
      jobs.set(id, next);
      return next;
    },
  };
}

function createIncompleteJob(id = "00000000-0000-4000-8000-000000000013") {
  return {
    id,
    status: "RUNNING",
    progress: { phase: "ISOCHRONE", done: 1, total: 2 },
    result: null,
    shortlist: [],
    shortlistEvaluation: null,
    shortlistCalls: [],
  };
}

function createNotReadyJob(status, id, error = null) {
  return {
    ...createIncompleteJob(id),
    status,
    error,
  };
}

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

test("장소 탐색부터 공동 후보 추가·투표·평가까지 HTTP로 처리한다", async (context) => {
  const job = createCompletedJob();
  const providers = {
    kakaoKeyword: async () => ({
      data: [{ id: "1", name: "정왕역", lon: 126.742616, lat: 37.345955 }],
      record: { provider: "KAKAO", status: 200 },
    }),
    kakaoCategory: async ({ category }) => ({
      data: [
        {
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
        },
      ],
      record: { provider: "KAKAO", status: 200 },
    }),
    tmapTransit: async ({ start }) => ({
      data: {
        status: "READY",
        totalSeconds: start.id === "P1" ? 1800 : 2100,
        totalWalkSeconds: 300,
        transferCount: 1,
        fareAmount: 1500,
      },
      record: { provider: "TMAP", status: 200 },
    }),
  };
  const server = createAppServer({ providers, jobs: createMutableJobs(job) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const venues = await fetch(
    `${base}/api/venues/search?jobId=${job.id}&hubId=hub-1&category=FD6&radius=1000`
  ).then((response) => response.json());
  assert.equal(venues.places[0].name, "모두의 식탁");

  const added = await fetch(`${base}/api/jobs/${job.id}/shortlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(venues.places[0]),
  }).then((response) => response.json());
  assert.equal(added.shortlist.length, 1);

  const listed = await fetch(`${base}/api/jobs/${job.id}/shortlist`).then((response) =>
    response.json()
  );
  assert.equal(listed.shortlist.length, 1);

  const voted = await fetch(`${base}/api/jobs/${job.id}/shortlist/venue-1/vote`, {
    method: "POST",
  }).then((response) => response.json());
  assert.equal(voted.shortlist[0].vote, 1);

  const evaluated = await fetch(`${base}/api/jobs/${job.id}/shortlist/evaluate`, {
    method: "POST",
  }).then((response) => response.json());
  assert.equal(evaluated.candidates.length, 1);

  const removed = await fetch(`${base}/api/jobs/${job.id}/shortlist/venue-1`, {
    method: "DELETE",
  }).then((response) => response.json());
  assert.equal(removed.shortlist.length, 0);
});

test("키워드 장소 탐색은 저장된 거점 좌표와 반경으로 Kakao 검색을 호출한다", async (context) => {
  const job = createCompletedJob("00000000-0000-4000-8000-000000000014");
  const calls = [];
  const providers = {
    kakaoKeyword: async (input) => {
      calls.push(input);
      return {
        data: [
          {
            id: "venue-keyword-1",
            name: "회의하기 좋은 카페",
            category: "음식점 > 카페",
            categoryGroupCode: "CE7",
            phone: "",
            address: "경기 안양시",
            roadAddress: "",
            lon: 126.93,
            lat: 37.41,
            url: "https://place.map.kakao.com/venue-keyword-1",
            distanceMeters: 180,
          },
        ],
        record: { provider: "KAKAO", status: 200 },
      };
    },
  };
  const server = createAppServer({ providers, jobs: createMutableJobs(job) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const port = server.address().port;

  const response = await fetch(
    `http://127.0.0.1:${port}/api/venues/search?jobId=${job.id}&hubId=hub-1&query=${encodeURIComponent("카페")}&radius=1500`
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.places[0].name, "회의하기 좋은 카페");
  assert.deepEqual(calls, [
    {
      query: "카페",
      lon: 126.91,
      lat: 37.4,
      radius: 1500,
      size: 15,
    },
  ]);
});

test("장소 탐색과 공동 후보 엔드포인트는 입력 오류와 상태 충돌을 구분한다", async (context) => {
  const job = createCompletedJob("00000000-0000-4000-8000-000000000011");
  const providers = {
    kakaoKeyword: async () => ({ data: [], record: { provider: "KAKAO", status: 200 } }),
    kakaoCategory: async ({ category }) => ({
      data: [
        {
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
        },
      ],
      record: { provider: "KAKAO", status: 200 },
    }),
    tmapTransit: async () => ({
      data: {
        status: "READY",
        totalSeconds: 1800,
        totalWalkSeconds: 300,
        transferCount: 1,
        fareAmount: 1500,
      },
      record: { provider: "TMAP", status: 200 },
    }),
  };
  const jobs = createMutableJobs(job);
  const server = createAppServer({ providers, jobs });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const missingJob = await fetch(
    `${base}/api/venues/search?jobId=00000000-0000-4000-8000-000000000099&hubId=hub-1&category=FD6&radius=1000`
  );
  assert.equal(missingJob.status, 404);

  const missingHub = await fetch(
    `${base}/api/venues/search?jobId=${job.id}&hubId=hub-x&category=FD6&radius=1000`
  );
  assert.equal(missingHub.status, 404);

  const invalidCategory = await fetch(
    `${base}/api/venues/search?jobId=${job.id}&hubId=hub-1&category=XX1&radius=1000`
  );
  assert.equal(invalidCategory.status, 400);

  const invalidRadius = await fetch(
    `${base}/api/venues/search?jobId=${job.id}&hubId=hub-1&category=FD6&radius=99`
  );
  assert.equal(invalidRadius.status, 400);

  const invalidQuery = await fetch(
    `${base}/api/venues/search?jobId=${job.id}&hubId=hub-1&query=a&radius=1000`
  );
  assert.equal(invalidQuery.status, 400);

  const missingVote = await fetch(`${base}/api/jobs/${job.id}/shortlist/venue-x/vote`, {
    method: "POST",
  });
  assert.equal(missingVote.status, 404);

  const missingDelete = await fetch(`${base}/api/jobs/${job.id}/shortlist/venue-x`, {
    method: "DELETE",
  });
  assert.equal(missingDelete.status, 404);

  for (let index = 1; index <= 5; index += 1) {
    const response = await fetch(`${base}/api/jobs/${job.id}/shortlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: `venue-${index}`,
        name: `장소 ${index}`,
        category: "음식점 > 한식",
        categoryGroupCode: "FD6",
        phone: "",
        address: "경기 안양시",
        roadAddress: "",
        lon: 126.92 + index * 0.001,
        lat: 37.4,
        url: `https://place.map.kakao.com/venue-${index}`,
        distanceMeters: 300,
      }),
    });
    assert.equal(response.status, 200);
  }

  const duplicate = await fetch(`${base}/api/jobs/${job.id}/shortlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "venue-1",
      name: "장소 1",
      lon: 126.92,
      lat: 37.4,
    }),
  });
  assert.equal(duplicate.status, 409);

  const sixth = await fetch(`${base}/api/jobs/${job.id}/shortlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "venue-6",
      name: "장소 6",
      lon: 126.98,
      lat: 37.4,
    }),
  });
  assert.equal(sixth.status, 409);

  const emptyJob = createCompletedJob("00000000-0000-4000-8000-000000000012");
  const emptyServer = createAppServer({
    providers,
    jobs: createMutableJobs(emptyJob),
  });
  await new Promise((resolve) => emptyServer.listen(0, "127.0.0.1", resolve));
  context.after(() => emptyServer.close());
  const emptyBase = `http://127.0.0.1:${emptyServer.address().port}`;
  const emptyEvaluation = await fetch(
    `${emptyBase}/api/jobs/${emptyJob.id}/shortlist/evaluate`,
    { method: "POST" }
  );
  assert.equal(emptyEvaluation.status, 400);
});

test("계산이 끝나지 않은 작업은 장소 탐색과 공동 후보 평가를 409로 거부한다", async (context) => {
  const jobs = new Map([
    ["00000000-0000-4000-8000-000000000013", createNotReadyJob("QUEUED", "00000000-0000-4000-8000-000000000013")],
    ["00000000-0000-4000-8000-000000000014", createNotReadyJob("RUNNING", "00000000-0000-4000-8000-000000000014")],
    [
      "00000000-0000-4000-8000-000000000015",
      createNotReadyJob("FAILED", "00000000-0000-4000-8000-000000000015", {
        message: "TMAP upstream failure",
      }),
    ],
  ]);
  const providers = {
    kakaoKeyword: async () => {
      throw new Error("provider should not be called");
    },
    kakaoCategory: async () => {
      throw new Error("provider should not be called");
    },
    tmapTransit: async () => {
      throw new Error("provider should not be called");
    },
  };
  const server = createAppServer({
    providers,
    jobs: {
      create: () => null,
      get: (id) => jobs.get(id) || null,
      update: () => null,
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  for (const jobId of jobs.keys()) {
    const venueSearch = await fetch(
      `${base}/api/venues/search?jobId=${jobId}&hubId=hub-1&category=FD6&radius=1000`
    );
    assert.equal(venueSearch.status, 409);
    assert.deepEqual(await venueSearch.json(), {
      error: "작업 계산이 완료되지 않았습니다.",
    });

    const evaluation = await fetch(`${base}/api/jobs/${jobId}/shortlist/evaluate`, {
      method: "POST",
    });
    assert.equal(evaluation.status, 409);
    assert.deepEqual(await evaluation.json(), {
      error: "작업 계산이 완료되지 않았습니다.",
    });
  }
});
