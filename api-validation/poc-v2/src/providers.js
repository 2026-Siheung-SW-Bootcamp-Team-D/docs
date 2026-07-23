const {
  normalizeKakaoKeyword,
  normalizeKakaoAddress,
  normalizeOdsayIsochrone,
  normalizeTmapTransit,
} = require("./contracts");

function createProviders({ client, keys }) {
  async function kakaoKeyword({ query, lon, lat, radius = 20000, size = 15 }) {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    const params = {
      query,
      x: lon,
      y: lat,
      radius: lon === undefined || lat === undefined ? undefined : radius,
      size,
    };
    Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const result = await client.json({
      provider: "KAKAO",
      url: url.toString(),
      headers: { Authorization: `KakaoAK ${keys.kakao}` },
    });
    return { data: normalizeKakaoKeyword(result.body), record: result.record };
  }

  async function kakaoCategory({ category, lon, lat, radius = 1000, size = 15 }) {
    const url = new URL("https://dapi.kakao.com/v2/local/search/category.json");
    const params = {
      category_group_code: category,
      x: lon,
      y: lat,
      radius,
      sort: "distance",
      size,
    };
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const result = await client.json({
      provider: "KAKAO",
      url: url.toString(),
      headers: { Authorization: `KakaoAK ${keys.kakao}` },
    });
    return { data: normalizeKakaoKeyword(result.body), record: result.record };
  }

  async function kakaoAddress(query) {
    const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
    url.searchParams.set("query", query);
    url.searchParams.set("size", "5");
    const result = await client.json({
      provider: "KAKAO",
      url: url.toString(),
      headers: { Authorization: `KakaoAK ${keys.kakao}` },
    });
    return { data: normalizeKakaoAddress(result.body), record: result.record };
  }

  async function odsayIsochrone({ lon, lat, minutes }) {
    const url = new URL("https://api.odsay.com/v1/api/searchPubTransIsochrone");
    const params = {
      apiKey: keys.odsay,
      x: lon,
      y: lat,
      searchTime: minutes,
      searchMethod: 4,
    };
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const result = await client.json({ provider: "ODSAY", url: url.toString() });
    return { data: normalizeOdsayIsochrone(result.body), record: result.record };
  }

  async function tmapTransit({ start, end }) {
    const result = await client.json({
      provider: "TMAP",
      url: "https://apis.openapi.sk.com/transit/routes/sub",
      method: "POST",
      headers: {
        appKey: keys.tmap,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: {
        startX: String(start.lon),
        startY: String(start.lat),
        endX: String(end.lon),
        endY: String(end.lat),
        count: 1,
      },
    });
    return { data: normalizeTmapTransit(result.body), record: result.record };
  }

  return Object.freeze({ kakaoKeyword, kakaoCategory, kakaoAddress, odsayIsochrone, tmapTransit });
}

module.exports = { createProviders };
