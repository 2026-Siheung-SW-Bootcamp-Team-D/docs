function summarizeCandidate(candidate) {
  const ready = candidate.routes.filter((route) => route.status === "READY");
  const unreachableCount = candidate.routes.length - ready.length;
  const maxSeconds = ready.length
    ? Math.max(...ready.map((route) => route.totalSeconds))
    : null;
  const avgSeconds = ready.length
    ? Math.round(ready.reduce((sum, route) => sum + route.totalSeconds, 0) / ready.length)
    : null;
  const transferAvg = ready.length
    ? Number((ready.reduce((sum, route) => sum + route.transferCount, 0) / ready.length).toFixed(2))
    : null;
  return {
    ...candidate,
    metrics: { unreachableCount, maxSeconds, avgSeconds, transferAvg },
  };
}

function sortable(value) {
  return value === null ? Number.MAX_SAFE_INTEGER : value;
}

function rankCandidates(candidates) {
  return candidates
    .map(summarizeCandidate)
    .sort((a, b) =>
      a.metrics.unreachableCount - b.metrics.unreachableCount ||
      sortable(a.metrics.maxSeconds) - sortable(b.metrics.maxSeconds) ||
      sortable(a.metrics.avgSeconds) - sortable(b.metrics.avgSeconds) ||
      sortable(a.metrics.transferAvg) - sortable(b.metrics.transferAvg) ||
      String(a.id).localeCompare(String(b.id))
    )
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      reasons: [
        `도달 불가 ${candidate.metrics.unreachableCount}명`,
        candidate.metrics.maxSeconds === null
          ? "최장 N/A"
          : `최장 ${Math.round(candidate.metrics.maxSeconds / 60)}분`,
        candidate.metrics.avgSeconds === null
          ? "평균 N/A"
          : `평균 ${Math.round(candidate.metrics.avgSeconds / 60)}분`,
        candidate.metrics.transferAvg === null
          ? "평균 환승 N/A"
          : `평균 환승 ${candidate.metrics.transferAvg}회`,
      ],
    }));
}

const turf = require("@turf/turf");
const { intersectIsochrones, largestPieces } = require("./geometry");

async function runScenario(scenario, providers, onProgress = () => {}) {
  const calls = [];
  const isochrones = [];
  onProgress({ phase: "ISOCHRONE", done: 0, total: scenario.participants.length });
  for (const participant of scenario.participants) {
    const response = await providers.odsayIsochrone({
      lon: participant.lon,
      lat: participant.lat,
      minutes: scenario.minutes,
      purpose: "TRANSIT_ISOCHRONE",
    });
    calls.push(response.record);
    if (response.data) isochrones.push(response.data);
    onProgress({
      phase: "ISOCHRONE",
      done: isochrones.length,
      total: scenario.participants.length,
    });
  }

  onProgress({ phase: "INTERSECTION", done: 0, total: 1 });
  const intersection = intersectIsochrones(isochrones);
  onProgress({ phase: "INTERSECTION", done: 1, total: 1 });
  if (!intersection) {
    return {
      ...scenario,
      status: "NO_INTERSECTION",
      calls,
      isochrones,
      intersection: null,
      candidates: [],
    };
  }

  const pieces = largestPieces(intersection, 3);
  const queries = ["지하철역", "기차역", "시외버스터미널", "시청"];
  const candidateMap = new Map();
  const hubSearchTotal = pieces.features.length * queries.length;
  let hubSearchDone = 0;
  onProgress({ phase: "HUB_COLLECTION", done: 0, total: hubSearchTotal });
  for (const piece of pieces.features) {
    const [lon, lat] = turf.centroid(piece).geometry.coordinates;
    for (const query of queries) {
      const response = await providers.kakaoKeyword({
        query,
        lon,
        lat,
        radius: 20000,
        size: 15,
        purpose: "HUB_KEYWORD_SEARCH",
      });
      calls.push(response.record);
      for (const place of response.data) candidateMap.set(place.id, place);
      hubSearchDone += 1;
      onProgress({ phase: "HUB_COLLECTION", done: hubSearchDone, total: hubSearchTotal });
    }
  }

  const selected = [...candidateMap.values()]
    .filter((place) => turf.booleanPointInPolygon([place.lon, place.lat], intersection))
    .sort((a, b) =>
      sortable(a.distanceMeters) - sortable(b.distanceMeters) ||
      String(a.id).localeCompare(String(b.id))
    )
    .slice(0, 6);

  const evaluated = [];
  const transitTotal = selected.length * scenario.participants.length;
  let transitDone = 0;
  onProgress({ phase: "TRANSIT_EVALUATION", done: 0, total: transitTotal });
  for (const candidate of selected) {
    const routes = [];
    for (const participant of scenario.participants) {
      const response = await providers.tmapTransit({
        start: participant,
        end: candidate,
        purpose: "HUB_TRANSIT_EVALUATION",
      });
      calls.push(response.record);
      routes.push({ participantId: participant.id, ...response.data });
      transitDone += 1;
      onProgress({ phase: "TRANSIT_EVALUATION", done: transitDone, total: transitTotal });
    }
    evaluated.push({ ...candidate, routes });
  }

  return {
    ...scenario,
    status: "SUCCEEDED",
    calls,
    isochrones,
    intersection,
    candidates: rankCandidates(evaluated).slice(0, 3),
  };
}

module.exports = { summarizeCandidate, rankCandidates, runScenario };
