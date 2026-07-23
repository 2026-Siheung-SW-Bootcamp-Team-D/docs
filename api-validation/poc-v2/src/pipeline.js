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

module.exports = { summarizeCandidate, rankCandidates };
