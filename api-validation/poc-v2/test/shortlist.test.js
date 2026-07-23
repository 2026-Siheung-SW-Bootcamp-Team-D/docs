const test = require("node:test");
const assert = require("node:assert/strict");
const {
  addVenue,
  removeVenue,
  toggleVote,
  evaluateShortlist,
} = require("../src/shortlist");

const venue = (id) => ({
  id,
  name: `장소 ${id}`,
  category: "음식점 > 한식",
  categoryGroupCode: "FD6",
  phone: "",
  address: "경기 안양시",
  roadAddress: "",
  lon: 126.92,
  lat: 37.4,
  url: `https://place.map.kakao.com/${id}`,
  distanceMeters: 300,
});

test("공동 후보는 불변 배열로 추가·제외·투표한다", () => {
  const original = [];
  const added = addVenue(original, venue("1"));
  const voted = toggleVote(added, "1");
  const removed = removeVenue(voted, "1");

  assert.deepEqual(original, []);
  assert.equal(added[0].vote, 0);
  assert.equal(voted[0].vote, 1);
  assert.deepEqual(removed, []);
});

test("공동 후보는 중복과 5개 초과를 거부한다", () => {
  let shortlist = [];

  for (let index = 1; index <= 5; index += 1) {
    shortlist = addVenue(shortlist, venue(String(index)));
  }

  assert.throws(() => addVenue(shortlist, venue("6")), /최대 5개/);
  assert.throws(() => addVenue(shortlist, venue("1")), /이미 담긴/);
});

test("공동 후보만 참여자별 TMAP 시간으로 평가한다", async () => {
  const calls = [];
  const providers = {
    tmapTransit: async ({ start, end }) => {
      calls.push([start.id, end.id]);
      return {
        data: {
          status: "READY",
          totalSeconds: end.id === "1" ? 1800 : 2400,
          totalWalkSeconds: 300,
          transferCount: 1,
          fareAmount: 1500,
        },
        record: { provider: "TMAP", status: 200 },
      };
    },
  };

  const result = await evaluateShortlist({
    participants: [
      { id: "P1", label: "A", lon: 126.8, lat: 37.4 },
      { id: "P2", label: "B", lon: 127.0, lat: 37.5 },
    ],
    venues: [venue("1"), venue("2")],
    providers,
  });

  assert.equal(calls.length, 4);
  assert.equal(result.candidates[0].id, "1");
  assert.equal(result.candidates[0].metrics.maxSeconds, 1800);
});
