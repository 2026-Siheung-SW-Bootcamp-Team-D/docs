const test = require("node:test");
const assert = require("node:assert/strict");
const { feature, featureCollection, polygon, multiPolygon } = require("@turf/helpers");
const { intersectIsochrones, largestPieces } = require("../src/geometry");

test("두 도달권의 교집합을 계산한다", () => {
  const a = featureCollection([polygon([[[0,0],[2,0],[2,2],[0,2],[0,0]]])]);
  const b = featureCollection([polygon([[[1,1],[3,1],[3,3],[1,3],[1,1]]])]);
  const result = intersectIsochrones([a, b]);
  assert.equal(result.geometry.type, "Polygon");
});

test("교집합이 없으면 null을 반환한다", () => {
  const a = featureCollection([polygon([[[0,0],[1,0],[1,1],[0,1],[0,0]]])]);
  const b = featureCollection([polygon([[[2,2],[3,2],[3,3],[2,3],[2,2]]])]);
  assert.equal(intersectIsochrones([a, b]), null);
});

test("MultiPolygon에서 면적이 큰 3개 조각만 남긴다", () => {
  const source = feature(multiPolygon([
    [[[0,0],[4,0],[4,4],[0,4],[0,0]]],
    [[[10,10],[13,10],[13,13],[10,13],[10,10]]],
    [[[20,20],[22,20],[22,22],[20,22],[20,20]]],
    [[[30,30],[31,30],[31,31],[30,31],[30,30]]],
  ]).geometry);
  const result = largestPieces(source, 3);
  assert.equal(result.features.length, 3);
});

test("빈 도달권은 null로 처리한다", () => {
  assert.equal(intersectIsochrones([{ type: "FeatureCollection", features: [] }]), null);
});
