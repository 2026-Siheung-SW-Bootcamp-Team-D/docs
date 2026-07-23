const { rankCandidates } = require("./pipeline");

function validateVenue(place) {
  const lon = Number(place.lon);
  const lat = Number(place.lat);

  if (!place.id || !place.name) {
    throw new Error("장소 ID와 이름이 필요합니다.");
  }
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error("장소 좌표가 올바르지 않습니다.");
  }

  return Object.freeze({
    id: String(place.id),
    name: String(place.name).slice(0, 100),
    category: String(place.category || "").slice(0, 200),
    categoryGroupCode: String(place.categoryGroupCode || "").slice(0, 3),
    phone: String(place.phone || "").slice(0, 30),
    address: String(place.address || "").slice(0, 200),
    roadAddress: String(place.roadAddress || "").slice(0, 200),
    lon,
    lat,
    url: String(place.url || "").slice(0, 500),
    distanceMeters: Number.isFinite(Number(place.distanceMeters))
      ? Number(place.distanceMeters)
      : null,
    vote: Number(place.vote) === 1 ? 1 : 0,
  });
}

function addVenue(shortlist, place) {
  const venue = validateVenue(place);

  if (shortlist.some((item) => item.id === venue.id)) {
    throw new Error("이미 담긴 공동 후보입니다.");
  }
  if (shortlist.length >= 5) {
    throw new Error("공동 후보는 최대 5개까지 담을 수 있습니다.");
  }

  return [...shortlist, venue];
}

function removeVenue(shortlist, venueId) {
  return shortlist.filter((venue) => venue.id !== String(venueId));
}

function toggleVote(shortlist, venueId) {
  let found = false;
  const next = shortlist.map((venue) => {
    if (venue.id !== String(venueId)) {
      return venue;
    }
    found = true;
    return Object.freeze({ ...venue, vote: venue.vote === 1 ? 0 : 1 });
  });

  if (!found) {
    throw new Error("공동 후보를 찾을 수 없습니다.");
  }

  return next;
}

async function evaluateShortlist({
  participants,
  venues,
  providers,
  onProgress = () => {},
}) {
  const calls = [];
  const evaluated = [];
  const total = participants.length * venues.length;
  let done = 0;

  onProgress({ phase: "SHORTLIST_EVALUATION", done, total });

  for (const venue of venues) {
    const routes = [];
    for (const participant of participants) {
      const response = await providers.tmapTransit({
        start: participant,
        end: venue,
      });
      calls.push(response.record);
      routes.push({ participantId: participant.id, ...response.data });
      done += 1;
      onProgress({ phase: "SHORTLIST_EVALUATION", done, total });
    }
    evaluated.push({ ...venue, routes });
  }

  return { candidates: rankCandidates(evaluated), calls };
}

module.exports = {
  validateVenue,
  addVenue,
  removeVenue,
  toggleVote,
  evaluateShortlist,
};
