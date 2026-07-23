const ALLOWED_CATEGORIES = Object.freeze(["FD6", "CE7", "CT1", "AT4"]);

function validateVenueSearch(searchParams) {
  const jobId = String(searchParams.get("jobId") || "").trim();
  const hubId = String(searchParams.get("hubId") || "").trim();
  const categoryValue = String(searchParams.get("category") || "").trim();
  const queryValue = String(searchParams.get("query") || "").trim();
  const radius = Number(searchParams.get("radius") || 1000);

  if (!jobId || !hubId) {
    throw new Error("jobId와 hubId가 필요합니다.");
  }
  if (Boolean(categoryValue) === Boolean(queryValue)) {
    throw new Error("카테고리와 키워드 중 하나만 입력하세요.");
  }
  if (categoryValue && !ALLOWED_CATEGORIES.includes(categoryValue)) {
    throw new Error("허용하지 않은 장소 카테고리입니다.");
  }
  if (queryValue && (queryValue.length < 2 || queryValue.length > 50)) {
    throw new Error("장소 검색어는 2~50자여야 합니다.");
  }
  if (!Number.isInteger(radius) || radius < 100 || radius > 5000) {
    throw new Error("장소 검색 반경은 100~5000m 정수여야 합니다.");
  }

  return Object.freeze({
    jobId,
    hubId,
    category: categoryValue || null,
    query: queryValue || null,
    radius,
  });
}

function findHub(job, hubId) {
  const hub = job?.result?.candidates?.find(
    (candidate) => String(candidate.id) === String(hubId)
  );

  if (!hub) {
    throw new Error("선택한 교통 거점을 찾을 수 없습니다.");
  }

  return hub;
}

module.exports = { ALLOWED_CATEGORIES, validateVenueSearch, findHub };
