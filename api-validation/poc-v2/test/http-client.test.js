const test = require("node:test");
const assert = require("node:assert/strict");
const { createHttpClient, sanitizeUrl } = require("../src/http-client");

test("URL의 apiKey를 제거한다", () => {
  assert.equal(
    sanitizeUrl("https://api.example/path?apiKey=secret&x=1"),
    "https://api.example/path?x=1"
  );
});

test("URL의 비밀 쿼리 키를 대소문자와 무관하게 제거하고 일반 파라미터는 유지한다", () => {
  assert.equal(
    sanitizeUrl(
      "https://api.example/path?Authorization=bearer&apikey=one&AppKey=two&keep=ok"
    ),
    "https://api.example/path?keep=ok"
  );
});

test("429 후 재시도하고 호출 메타데이터만 기록한다", async () => {
  let count = 0;
  const fetchImpl = async () => {
    count += 1;
    if (count === 1) {
      return new Response('{"error":"throttled"}', {
        status: 429,
        headers: { "Retry-After": "0" },
      });
    }
    return new Response('{"ok":true}', { status: 200 });
  };
  const client = createHttpClient({
    fetchImpl,
    timeoutMs: 1000,
    maxRetries: 3,
    sleep: async () => {},
  });
  const result = await client.json({
    provider: "TEST",
    url: "https://api.example/path?apiKey=secret",
  });
  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.record.attempts, 2);
  assert.doesNotMatch(JSON.stringify(result.record), /secret/);
});

test("호출 기록은 목적과 비밀값 없는 파라미터 이름만 남긴다", async () => {
  const client = createHttpClient({
    fetchImpl: async () => new Response("{}", { status: 200 }),
  });
  const result = await client.json({
    provider: "KAKAO",
    purpose: "VENUE_CATEGORY_SEARCH",
    url: "https://example.test/search?category=FD6&apiKey=secret",
    parameterNames: ["category", "apiKey"],
  });
  assert.equal(result.record.purpose, "VENUE_CATEGORY_SEARCH");
  assert.deepEqual(result.record.parameterNames, ["category"]);
  assert.doesNotMatch(JSON.stringify(result.record), /secret|apiKey/);
});

test("JSON이 아닌 응답은 계약 오류로 거부한다", async () => {
  const client = createHttpClient({
    fetchImpl: async () => new Response("<html>bad gateway</html>", { status: 200 }),
  });
  await assert.rejects(
    client.json({ provider: "TEST", url: "https://api.example/path" }),
    /JSON이 아닌 응답/
  );
});
