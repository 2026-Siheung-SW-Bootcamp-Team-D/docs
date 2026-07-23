const test = require("node:test");
const assert = require("node:assert/strict");
const { createProviders } = require("../src/providers");

test("Kakao 카테고리 검색은 거리순 장소 요청을 만든다", async () => {
  let captured;
  const providers = createProviders({
    keys: { kakao: "hidden", odsay: "hidden", tmap: "hidden" },
    client: {
      json: async (request) => {
        captured = request;
        return { body: { documents: [] }, record: { provider: "KAKAO" } };
      },
    },
  });

  await providers.kakaoCategory({
    category: "FD6",
    lon: 126.9231,
    lat: 37.4012,
    radius: 1000,
  });

  const url = new URL(captured.url);
  assert.equal(url.pathname, "/v2/local/search/category.json");
  assert.equal(url.searchParams.get("category_group_code"), "FD6");
  assert.equal(url.searchParams.get("x"), "126.9231");
  assert.equal(url.searchParams.get("y"), "37.4012");
  assert.equal(url.searchParams.get("radius"), "1000");
  assert.equal(url.searchParams.get("sort"), "distance");
  assert.equal(url.searchParams.get("size"), "15");
  assert.equal(captured.headers.Authorization, "KakaoAK hidden");
});
