#!/usr/bin/env node
/**
 * ODsay 도달권 교집합 PoC (스펙 F10 검증).
 *
 * results/ 에 저장된 실제 ODsay 응답에서 GeoJSON 폴리곤을 꺼내
 * Turf.js 로 교집합을 계산한다. 실행: node intersect_poc.js
 *
 * 시나리오:
 *  A. 강남 60분 ∩ 정왕 60분  → 교집합 존재 예상 (정상 흐름)
 *  B. 강남 30분 ∩ 정왕 30분  → 교집합 없을 수 있음 (검색시간 확대 흐름)
 *  C. 강남 60분 ∩ 충주 60분  → 교집합 없음 예상 (장거리 전환 흐름, 스펙 F12)
 */
const fs = require("fs");
const path = require("path");
const turf = require("@turf/turf");

const RESULTS = path.join(__dirname, "results");

function loadIsochrone(name) {
  const js = JSON.parse(
    fs.readFileSync(path.join(RESULTS, `1_odsay_isochrone_${name}.json`))
  );
  const features = js.result?.geojson?.features;
  if (!features?.length) throw new Error(`${name}: geojson.features 없음`);
  // 여러 feature 면 union 으로 합쳐 1인 1도달권으로 만든다
  let merged = features[0];
  for (let i = 1; i < features.length; i++) {
    merged = turf.union(turf.featureCollection([merged, features[i]]));
  }
  return merged;
}

function intersectAll(names) {
  let acc = loadIsochrone(names[0]);
  for (let i = 1; i < names.length; i++) {
    if (!acc) return null;
    acc = turf.intersect(turf.featureCollection([acc, loadIsochrone(names[i])]));
  }
  return acc;
}

const scenarios = [
  ["A_gangnam60_jeongwang60", ["gangnam_60min", "jeongwang_60min"], "교집합 존재 예상"],
  ["B_gangnam30_jeongwang30", ["gangnam_30min", "jeongwang_30min"], "없으면 검색시간 확대"],
  ["C_gangnam60_chungju60", ["gangnam_60min", "chungju_60min"], "없으면 장거리 전환"],
];

for (const [id, names, note] of scenarios) {
  const t0 = Date.now();
  let result = null,
    err = null;
  try {
    result = intersectAll(names);
  } catch (e) {
    err = e.message;
  }
  const ms = Date.now() - t0;
  if (err) {
    console.log(`${id}: ERROR ${err}`);
    continue;
  }
  if (!result) {
    console.log(`${id}: 교집합 없음 (${ms}ms) — ${note}`);
    continue;
  }
  const areaKm2 = turf.area(result) / 1e6;
  const [minX, minY, maxX, maxY] = turf.bbox(result);
  const c = turf.centroid(result).geometry.coordinates;
  const polyCount =
    result.geometry.type === "MultiPolygon" ? result.geometry.coordinates.length : 1;
  const out = path.join(RESULTS, `intersection_${id}.geojson`);
  fs.writeFileSync(out, JSON.stringify(result));
  console.log(
    `${id}: 교집합 존재 (${ms}ms) — 면적 ${areaKm2.toFixed(1)}km², ` +
      `분리 폴리곤 ${polyCount}개, 중심 [${c[0].toFixed(4)}, ${c[1].toFixed(4)}], ` +
      `bbox [${minX.toFixed(3)},${minY.toFixed(3)} ~ ${maxX.toFixed(3)},${maxY.toFixed(3)}] -> ${path.basename(out)}`
  );
}
