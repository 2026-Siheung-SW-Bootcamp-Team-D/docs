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

test("허용되지 않은 카테고리를 거부한다", () => {
  assert.throws(
    () =>
      validateVenueSearch(
        new URLSearchParams({
          jobId: "j",
          hubId: "h",
          category: "XX9",
        })
      ),
    /허용하지 않은 장소 카테고리/
  );
});

test("반경은 100~5000m 정수만 허용한다", () => {
  for (const radius of ["99", "5001", "100.5"]) {
    assert.throws(
      () =>
        validateVenueSearch(
          new URLSearchParams({
            jobId: "j",
            hubId: "h",
            category: "FD6",
            radius,
          })
        ),
      /100~5000m 정수/
    );
  }
});

test("공백을 제거한 검색어 길이를 검증한다", () => {
  assert.throws(
    () =>
      validateVenueSearch(
        new URLSearchParams({
          jobId: "j",
          hubId: "h",
          query: " a ",
        })
      ),
    /2~50자/
  );
  assert.throws(
    () =>
      validateVenueSearch(
        new URLSearchParams({
          jobId: "j",
          hubId: "h",
          query: "x".repeat(51),
        })
      ),
    /2~50자/
  );
});

test("작업 결과 안의 거점만 찾는다", () => {
  const hub = { id: "h1", lon: 127, lat: 37, name: "명학역" };

  assert.equal(findHub({ result: { candidates: [hub] } }, "h1"), hub);
  assert.throws(() => findHub({ result: { candidates: [] } }, "h1"), /거점/);
});
