const test = require("node:test");
const assert = require("node:assert/strict");
const { assertSafeReport } = require("../src/report");

test("안전한 요약 보고서를 허용한다", () => {
  assert.doesNotThrow(() => assertSafeReport({ status: "PASS", scenarios: [] }));
});

test("API 키와 인증 헤더를 거부한다", () => {
  for (const unsafe of [
    { apiKey: "secret" },
    { Authorization: "KakaoAK secret" },
    { appKey: "secret" },
  ]) {
    assert.throws(() => assertSafeReport(unsafe), /비밀값/);
  }
});

test("Infinity처럼 JSON에서 정보가 유실되는 숫자를 거부한다", () => {
  assert.throws(
    () => assertSafeReport({ metrics: { average: Number.POSITIVE_INFINITY } }),
    /유한하지 않은 숫자/
  );
});
