const turf = require("@turf/turf");

function mergeFeatures(collection) {
  if (!collection?.features?.length) return null;
  return collection.features.reduce((acc, current) => {
    if (!acc) return current;
    return turf.union(turf.featureCollection([acc, current]));
  }, null);
}

function intersectIsochrones(collections) {
  if (!collections.length) return null;
  let result = mergeFeatures(collections[0]);
  for (const collection of collections.slice(1)) {
    const next = mergeFeatures(collection);
    if (!result || !next) return null;
    result = turf.intersect(turf.featureCollection([result, next]));
    if (!result) return null;
  }
  return result;
}

function largestPieces(feature, limit = 3) {
  if (!feature) return turf.featureCollection([]);
  const pieces = feature.geometry.type === "MultiPolygon"
    ? feature.geometry.coordinates.map((coordinates) => turf.polygon(coordinates))
    : [feature];
  return turf.featureCollection(
    pieces
      .map((piece) => ({ piece, area: turf.area(piece) }))
      .sort((a, b) => b.area - a.area)
      .slice(0, limit)
      .map(({ piece }) => piece)
  );
}

module.exports = { mergeFeatures, intersectIsochrones, largestPieces };
