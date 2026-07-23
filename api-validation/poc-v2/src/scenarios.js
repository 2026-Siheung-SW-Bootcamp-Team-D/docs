module.exports = Object.freeze([
  {
    id: "metro-west",
    title: "시흥·부평·강남 수도권 모임",
    minutes: 60,
    participants: [
      { id: "P1", label: "시흥", lon: 126.742616, lat: 37.345955 },
      { id: "P2", label: "부평", lon: 126.723507, lat: 37.489493 },
      { id: "P3", label: "강남", lon: 127.027619, lat: 37.497942 },
    ],
  },
  {
    id: "metro-outer",
    title: "시흥·수원·서울 외곽 포함",
    minutes: 60,
    participants: [
      { id: "P1", label: "시흥", lon: 126.742616, lat: 37.345955 },
      { id: "P2", label: "수원", lon: 127.000645, lat: 37.265713 },
      { id: "P3", label: "서울", lon: 126.972559, lat: 37.554648 },
    ],
  },
  {
    id: "no-intersection",
    title: "수도권·충주 장거리",
    minutes: 60,
    participants: [
      { id: "P1", label: "강남", lon: 127.027619, lat: 37.497942 },
      { id: "P2", label: "충주", lon: 127.926000, lat: 36.968600 },
    ],
  },
]);
