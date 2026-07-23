const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeKakaoKeyword,
  normalizeKakaoAddress,
  normalizeOdsayIsochrone,
  normalizeTmapTransit,
} = require("../src/contracts");

const fixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8"));

test("Kakao 키워드 검색 좌표와 조건부 distance를 정규화한다", () => {
  const places = normalizeKakaoKeyword(fixture("kakao-keyword.json"));
  assert.deepEqual(places[0], {
    id: "21160803",
    name: "강남역 2호선",
    category: "교통,수송 > 지하철,전철 > 수도권2호선",
    address: "서울 강남구 역삼동 858",
    roadAddress: "서울 강남구 강남대로 지하 396",
    lon: 127.02800140627488,
    lat: 37.49808633653005,
    url: "http://place.map.kakao.com/21160803",
    distanceMeters: 37,
  });
});

test("Kakao 키워드 검색에서 중심 좌표가 없으면 distance는 null이다", () => {
  const body = fixture("kakao-keyword.json");
  delete body.documents[0].distance;
  assert.equal(normalizeKakaoKeyword(body)[0].distanceMeters, null);
});

test("Kakao 주소 검색은 중첩 road_address.address_name을 읽는다", () => {
  const addresses = normalizeKakaoAddress(fixture("kakao-address.json"));
  assert.equal(addresses[0].roadAddress, "서울 중구 세종대로 110");
  assert.equal(addresses[0].landAddress, "서울 중구 태평로1가 31");
});

test("ODsay MultiPolygon을 보존한다", () => {
  const geojson = normalizeOdsayIsochrone(fixture("odsay-multipolygon.json"));
  assert.equal(geojson.type, "FeatureCollection");
  assert.equal(geojson.features[0].geometry.type, "MultiPolygon");
});

test("ODsay geojson null을 정상적인 도달권 없음으로 처리한다", () => {
  assert.equal(normalizeOdsayIsochrone({ result: { geojson: null } }), null);
});

test("TMAP 정상 경로의 초·환승·요금을 정규화한다", () => {
  assert.deepEqual(normalizeTmapTransit(fixture("tmap-route.json")), {
    status: "READY",
    totalSeconds: 3117,
    totalWalkSeconds: 553,
    transferCount: 1,
    fareAmount: 1850,
  });
});

test("TMAP 알려진 status 11을 경로 없음으로 분리한다", () => {
  assert.deepEqual(normalizeTmapTransit(fixture("tmap-no-route.json")), {
    status: "UNAVAILABLE",
    providerStatus: 11,
    reason: "출발지와 도착지가 너무 가까움",
  });
});

test("TMAP 알 수 없는 200 응답은 계약 위반이다", () => {
  assert.throws(
    () => normalizeTmapTransit({ result: { status: 999, message: "unknown" } }),
    /metaData.plan.itineraries/
  );
});
