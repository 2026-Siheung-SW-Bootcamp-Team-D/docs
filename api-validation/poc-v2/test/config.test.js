const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../src/config");

test("필수 API 키 이름만 알려주고 값은 오류에 포함하지 않는다", () => {
  assert.throws(
    () => loadConfig({}),
    (error) => {
      assert.match(error.message, /KAKAO_REST_KEY, ODSAY_KEY, TMAP_APP_KEY/);
      assert.doesNotMatch(error.message, /Authorization|KakaoAK|appKey=/);
      return true;
    }
  );
});

test("키가 있으면 고정 실행 설정을 반환한다", () => {
  const config = loadConfig({
    KAKAO_REST_KEY: "kakao-test",
    ODSAY_KEY: "odsay-test",
    TMAP_APP_KEY: "tmap-test",
  });
  assert.equal(config.timeoutMs, 10000);
  assert.equal(config.maxRetries, 3);
  assert.equal(config.concurrency, 1);
});
