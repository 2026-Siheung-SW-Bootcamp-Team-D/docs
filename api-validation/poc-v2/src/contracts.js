function requireValue(value, field) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`계약 위반: ${field}`);
  }
  return value;
}

function normalizeKakaoPlace(doc) {
  const lon = Number(requireValue(doc.x, "documents[].x"));
  const lat = Number(requireValue(doc.y, "documents[].y"));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error("계약 위반: documents[].x/y 숫자");
  }
  return Object.freeze({
    id: String(requireValue(doc.id, "documents[].id")),
    name: String(requireValue(doc.place_name, "documents[].place_name")),
    category: String(doc.category_name || ""),
    categoryGroupCode: String(doc.category_group_code || ""),
    phone: String(doc.phone || ""),
    address: String(doc.address_name || ""),
    roadAddress: String(doc.road_address_name || ""),
    lon,
    lat,
    url: String(doc.place_url || ""),
    distanceMeters:
      doc.distance === undefined || doc.distance === ""
        ? null
        : Number(doc.distance),
  });
}

function normalizeKakaoKeyword(body) {
  if (!Array.isArray(body.documents)) throw new Error("계약 위반: documents");
  return body.documents.map(normalizeKakaoPlace);
}

function normalizeKakaoAddress(body) {
  if (!Array.isArray(body.documents)) throw new Error("계약 위반: documents");
  return body.documents.map((doc) => ({
    displayAddress: String(requireValue(doc.address_name, "documents[].address_name")),
    addressType: String(requireValue(doc.address_type, "documents[].address_type")),
    landAddress: doc.address?.address_name || null,
    roadAddress: doc.road_address?.address_name || null,
    lon: Number(requireValue(doc.x, "documents[].x")),
    lat: Number(requireValue(doc.y, "documents[].y")),
  }));
}

function normalizeOdsayIsochrone(body) {
  const geojson = body.result?.geojson;
  if (geojson === null) return null;
  if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    throw new Error("계약 위반: result.geojson FeatureCollection");
  }
  for (const feature of geojson.features) {
    if (!["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) {
      throw new Error(`계약 위반: geometry.type=${feature.geometry?.type}`);
    }
  }
  return geojson;
}

function normalizeTmapTransit(body) {
  const providerStatus = body.result?.status;
  if (providerStatus === 11) {
    return {
      status: "UNAVAILABLE",
      providerStatus,
      reason: String(body.result.message),
    };
  }
  const itineraries = body.metaData?.plan?.itineraries;
  if (!Array.isArray(itineraries)) {
    throw new Error("계약 위반: metaData.plan.itineraries");
  }
  if (itineraries.length === 0) {
    return { status: "UNAVAILABLE", providerStatus: null, reason: "경로 없음" };
  }
  const route = itineraries[0];
  return {
    status: "READY",
    totalSeconds: Number(requireValue(route.totalTime, "totalTime")),
    totalWalkSeconds: Number(requireValue(route.totalWalkTime, "totalWalkTime")),
    transferCount: Number(requireValue(route.transferCount, "transferCount")),
    fareAmount: Number(requireValue(route.fare?.regular?.totalFare, "fare.regular.totalFare")),
  };
}

module.exports = {
  normalizeKakaoKeyword,
  normalizeKakaoAddress,
  normalizeOdsayIsochrone,
  normalizeTmapTransit,
};
