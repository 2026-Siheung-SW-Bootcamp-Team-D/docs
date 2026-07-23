(() => {
  let map;
  let scenarioLayers = [];
  let venueLayers = [];
  let shortlistLayers = [];
  const markerByPlaceId = new Map();
  const colors = ["#2557d6", "#f39c12", "#8e44ad", "#16a085", "#d35400"];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clearLayers(group) {
    group.forEach((layer) => layer.remove());
    return [];
  }

  function allLayers() {
    return [...scenarioLayers, ...venueLayers, ...shortlistLayers];
  }

  function fitToLayers() {
    const layers = allLayers();
    if (layers.length) {
      const group = L.featureGroup(layers);
      if (group.getBounds().isValid()) {
        map.fitBounds(group.getBounds(), { padding: [24, 24], maxZoom: 12 });
        return;
      }
    }
    map.setView([37.45, 126.9], 8);
  }

  function create(elementId) {
    map = L.map(elementId, { zoomControl: true }).setView([37.45, 126.9], 8);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
  }

  function renderScenario(scenario) {
    scenarioLayers = clearLayers(scenarioLayers);
    (scenario.isochrones || []).forEach((geojson, index) => {
      const label = scenario.participants?.[index]?.label || `참여자 ${index + 1}`;
      const layer = L.geoJSON(geojson, {
        style: { color: colors[index], weight: 2, fillOpacity: 0.09 },
      }).bindTooltip(escapeHtml(`${label} 도달권`));
      layer.addTo(map);
      scenarioLayers.push(layer);
    });
    if (scenario.intersection) {
      const layer = L.geoJSON(scenario.intersection, {
        style: { color: "#e35353", weight: 3, fillOpacity: 0.22 },
      }).bindTooltip("모두의 공통 도달 영역");
      layer.addTo(map);
      scenarioLayers.push(layer);
    }
    (scenario.candidates || []).forEach((candidate) => {
      const marker = L.marker([candidate.lat, candidate.lon])
        .addTo(map)
        .bindPopup(
          `<strong>${candidate.rank}. ${escapeHtml(candidate.name)}</strong><br>${escapeHtml(candidate.roadAddress || candidate.address || "")}`
        );
      scenarioLayers.push(marker);
    });
    fitToLayers();
  }

  function renderVenues(places) {
    venueLayers = clearLayers(venueLayers);
    markerByPlaceId.clear();
    (places || []).forEach((place) => {
      const marker = L.circleMarker([place.lat, place.lon], {
        radius: 7,
        color: "#2557d6",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 3,
      })
        .addTo(map)
        .bindPopup(`<strong>${escapeHtml(place.name)}</strong>`);
      markerByPlaceId.set(String(place.id), marker);
      venueLayers.push(marker);
    });
    fitToLayers();
  }

  function renderShortlist(places) {
    shortlistLayers = clearLayers(shortlistLayers);
    (places || []).forEach((place) => {
      shortlistLayers.push(
        L.circleMarker([place.lat, place.lon], {
          radius: 10,
          color: "#e35353",
          fillColor: "#e35353",
          fillOpacity: 0.85,
          weight: 2,
        })
          .addTo(map)
          .bindPopup(`<strong>공동 후보 · ${escapeHtml(place.name)}</strong>`)
      );
    });
    fitToLayers();
  }

  function focusPlace(placeId) {
    const marker = markerByPlaceId.get(String(placeId));
    if (!marker) return;
    map.panTo(marker.getLatLng());
    marker.openPopup();
  }

  window.MeetingMap = Object.freeze({
    create,
    renderScenario,
    renderVenues,
    renderShortlist,
    focusPlace,
  });
})();
