let report = { generatedAt: null, status: "NOT_RUN", scenarios: [] };
let map;
let layers = [];
const colors = ["#2557d6", "#f39c12", "#8e44ad", "#16a085", "#d35400"];
const customParticipants = [
  { label: "", lon: null, lat: null },
  { label: "", lon: null, lat: null },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const minutes = (seconds) =>
  Number.isFinite(seconds) ? `${Math.round(seconds / 60)}분` : "N/A";

function clearLayers() {
  layers.forEach((layer) => layer.remove());
  layers = [];
}

function bindScenarioTab(button, scenario) {
  button.addEventListener("click", () => renderScenario(scenario));
}

function addScenarioTab(scenario, prepend = false) {
  const nav = document.querySelector("#scenario-tabs");
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.id = scenario.id;
  button.textContent = scenario.title;
  bindScenarioTab(button, scenario);
  prepend ? nav.prepend(button) : nav.append(button);
}

function renderStatus(scenario) {
  const totalCalls = scenario.calls?.length || 0;
  const totalMs = scenario.calls?.reduce(
    (sum, call) => sum + (call.durationMs || 0),
    0
  ) || 0;
  const values = [
    ["상태", scenario.status, scenario.status === "SUCCEEDED"],
    ["참여자", `${scenario.participants?.length || 0}명`, false],
    ["외부 호출", `${totalCalls}회`, false],
    ["누적 응답시간", `${(totalMs / 1000).toFixed(1)}초`, false],
  ];
  document.querySelector("#status-grid").innerHTML = values
    .map(([label, value, good]) =>
      `<div class="status-card${good ? " good" : ""}">${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></div>`
    )
    .join("");
}

function renderMap(scenario) {
  clearLayers();
  (scenario.isochrones || []).forEach((geojson, index) => {
    const label = scenario.participants?.[index]?.label || `참여자 ${index + 1}`;
    const layer = L.geoJSON(geojson, {
      style: { color: colors[index], weight: 2, fillOpacity: .09 },
    }).bindTooltip(escapeHtml(`${label} 도달권`));
    layer.addTo(map);
    layers.push(layer);
  });
  if (scenario.intersection) {
    const layer = L.geoJSON(scenario.intersection, {
      style: { color: "#e35353", weight: 3, fillOpacity: .22 },
    }).bindTooltip("모두의 공통 도달 영역");
    layer.addTo(map);
    layers.push(layer);
  }
  (scenario.candidates || []).forEach((candidate) => {
    const marker = L.marker([candidate.lat, candidate.lon])
      .addTo(map)
      .bindPopup(
        `<strong>${candidate.rank}. ${escapeHtml(candidate.name)}</strong><br>${escapeHtml(candidate.roadAddress || candidate.address || "")}`
      );
    layers.push(marker);
  });
  if (layers.length) {
    const group = L.featureGroup(layers);
    if (group.getBounds().isValid()) {
      map.fitBounds(group.getBounds(), { padding: [24, 24], maxZoom: 12 });
    }
  } else {
    map.setView([37.45, 126.9], 8);
  }
}

function renderRanking(scenario) {
  const container = document.querySelector("#ranking");
  if (!scenario.candidates?.length) {
    const message = scenario.status === "NO_INTERSECTION"
      ? "공통 도달 영역이 없습니다.<br>시간 범위를 넓히거나 직접 후보를 추가해야 합니다."
      : "평가할 수 있는 후보가 없습니다.";
    container.innerHTML = `<div class="empty-state"><p>${message}</p></div>`;
    return;
  }
  container.innerHTML = scenario.candidates
    .map((candidate) => `
      <div class="rank">
        <strong><span class="rank-number">${candidate.rank}</span>${escapeHtml(candidate.name)}</strong>
        <p class="rank-address">${escapeHtml(candidate.roadAddress || candidate.address || "주소 없음")}</p>
        <div class="chips">${candidate.reasons.map((reason) =>
          `<span class="chip">${escapeHtml(reason)}</span>`
        ).join("")}</div>
      </div>
    `)
    .join("");
}

function renderMatrix(scenario) {
  const participantLabels = Object.fromEntries(
    (scenario.participants || []).map((participant) => [
      participant.id,
      participant.label,
    ])
  );
  const table = document.querySelector("#matrix");
  if (!scenario.candidates?.length) {
    table.innerHTML = "<tbody><tr><td>표시할 이동시간 결과가 없습니다.</td></tr></tbody>";
    return;
  }
  table.innerHTML = `
    <thead><tr><th>후보</th>${Object.values(participantLabels)
      .map((label) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
    <tbody>${scenario.candidates.map((candidate) => `
      <tr>
        <th>${candidate.rank}. ${escapeHtml(candidate.name)}</th>
        ${candidate.routes.map((route) => route.status === "READY"
          ? `<td class="route-ready">${minutes(route.totalSeconds)} · 환승 ${route.transferCount}회<br><small>${route.fareAmount.toLocaleString()}원</small></td>`
          : `<td class="route-unavailable">경로 없음</td>`
        ).join("")}
      </tr>
    `).join("")}</tbody>
  `;
}

function renderCalls(scenario) {
  const calls = scenario.calls || [];
  document.querySelector("#calls").innerHTML = `
    <thead><tr><th>공급자</th><th>HTTP</th><th>시도</th><th>시간</th><th>크기</th></tr></thead>
    <tbody>${calls.map((call) => `
      <tr>
        <td>${escapeHtml(call.provider)}</td>
        <td>${call.status}</td>
        <td>${call.attempts}</td>
        <td>${call.durationMs}ms</td>
        <td>${call.bytes}B</td>
      </tr>
    `).join("")}</tbody>
  `;
}

function renderScenario(scenario) {
  document.querySelectorAll("#scenario-tabs button").forEach((button) =>
    button.classList.toggle("active", button.dataset.id === scenario.id)
  );
  renderStatus(scenario);
  renderMap(scenario);
  renderRanking(scenario);
  renderMatrix(scenario);
  renderCalls(scenario);
}

function renderParticipantEditor() {
  const editor = document.querySelector("#participant-editor");
  editor.innerHTML = customParticipants.map((participant, index) => `
    <div class="participant-row" data-index="${index}">
      <strong>참여자 ${index + 1}</strong>
      <input type="search" value="${escapeHtml(participant.label)}" placeholder="역·건물·장소 검색" aria-label="참여자 ${index + 1} 출발지 검색어">
      <button type="button" class="search-origin">검색</button>
      <select class="origin-results" aria-label="참여자 ${index + 1} 출발지 결과">
        <option value="">검색 결과 선택</option>
      </select>
      ${customParticipants.length > 2
        ? '<button type="button" class="remove-participant danger">삭제</button>'
        : ""}
    </div>
  `).join("");
  editor.querySelectorAll(".search-origin").forEach((button) =>
    button.addEventListener("click", (event) =>
      searchOrigin(event).catch(showLabError)
    )
  );
  editor.querySelectorAll(".remove-participant").forEach((button) =>
    button.addEventListener("click", removeParticipant)
  );
}

async function searchOrigin(event) {
  const button = event.currentTarget;
  const row = button.closest(".participant-row");
  const index = Number(row.dataset.index);
  const query = row.querySelector("input").value.trim();
  button.disabled = true;
  button.textContent = "검색 중";
  try {
    const response = await fetch(
      `/api/origins/search?q=${encodeURIComponent(query)}`
    ).then((result) => result.json());
    if (response.error) throw new Error(response.error);
    const select = row.querySelector(".origin-results");
    select.innerHTML = '<option value="">검색 결과 선택</option>' +
      response.places.map((place, placeIndex) =>
        `<option value="${placeIndex}">${escapeHtml(place.name)} · ${escapeHtml(place.roadAddress || place.address)}</option>`
      ).join("");
    select.onchange = () => {
      const place = response.places[Number(select.value)];
      if (!place) return;
      customParticipants[index] = {
        label: place.name,
        lon: place.lon,
        lat: place.lat,
      };
      row.querySelector("input").value = place.name;
    };
  } finally {
    button.disabled = false;
    button.textContent = "검색";
  }
}

function removeParticipant(event) {
  customParticipants.splice(
    Number(event.currentTarget.closest(".participant-row").dataset.index),
    1
  );
  renderParticipantEditor();
}

function showLabError(error) {
  const progress = document.querySelector("#job-progress");
  progress.hidden = false;
  document.querySelector("#progress-bar").style.width = "100%";
  document.querySelector("#progress-bar").style.background = "#d5564c";
  document.querySelector("#progress-label").textContent = error.message;
}

async function runCustomScenario() {
  if (customParticipants.some((participant) => !Number.isFinite(participant.lon))) {
    throw new Error("모든 참여자의 검색 결과를 선택하세요.");
  }
  const runButton = document.querySelector("#run-custom");
  runButton.disabled = true;
  document.querySelector("#progress-bar").style.background = "";
  try {
    const created = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "직접 만든 시나리오",
        minutes: Number(document.querySelector("#duration").value),
        participants: customParticipants,
      }),
    }).then((response) => response.json());
    if (created.error) throw new Error(created.error);
    document.querySelector("#job-progress").hidden = false;
    await pollJob(created.id);
  } finally {
    runButton.disabled = false;
  }
}

async function pollJob(jobId) {
  const phaseLabels = {
    QUEUED: "작업을 준비하고 있습니다.",
    ISOCHRONE: "참여자별 도달권을 계산하고 있습니다.",
    INTERSECTION: "공통 도달 영역을 찾고 있습니다.",
    HUB_COLLECTION: "공통 영역의 교통 거점을 찾고 있습니다.",
    TRANSIT_EVALUATION: "후보별 실제 대중교통 시간을 비교하고 있습니다.",
  };
  for (;;) {
    const job = await fetch(`/api/jobs/${jobId}`).then((response) => response.json());
    const progress = job.progress || { phase: "QUEUED", done: 0, total: 1 };
    const percent = Math.round(
      (progress.done / Math.max(progress.total, 1)) * 100
    );
    document.querySelector("#progress-bar").style.width = `${percent}%`;
    document.querySelector("#progress-label").textContent =
      `${phaseLabels[progress.phase] || progress.phase} ${progress.done}/${progress.total}`;
    if (["SUCCEEDED", "NO_INTERSECTION"].includes(job.status)) {
      addScenarioTab(job.result, true);
      renderScenario(job.result);
      document.querySelector("#progress-label").textContent =
        job.status === "SUCCEEDED"
          ? "계산이 완료되었습니다. 아래 결과를 확인하세요."
          : "공통 도달 영역이 없습니다. 아래 결과를 확인하세요.";
      document.querySelector("#progress-bar").style.width = "100%";
      document.querySelector(".results-header").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }
    if (job.status === "FAILED") throw new Error(job.error.message);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function bindInteractiveLab() {
  renderParticipantEditor();
  document.querySelector("#add-participant").addEventListener("click", () => {
    if (customParticipants.length >= 5) return;
    customParticipants.push({ label: "", lon: null, lat: null });
    renderParticipantEditor();
  });
  document.querySelector("#run-custom").addEventListener("click", () =>
    runCustomScenario().catch(showLabError)
  );
}

async function boot() {
  map = L.map("map", { zoomControl: true }).setView([37.45, 126.9], 8);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(map);
  bindInteractiveLab();

  try {
    report = await fetch("/report-data.json").then((response) => {
      if (!response.ok) throw new Error("사전 시나리오 결과가 없습니다.");
      return response.json();
    });
    document.querySelector("#summary").textContent =
      `${new Date(report.generatedAt).toLocaleString("ko-KR")} 기준 · 전체 판정 ${report.status}`;
    report.scenarios.forEach((scenario) => addScenarioTab(scenario));
    if (report.scenarios.length) renderScenario(report.scenarios[0]);
  } catch (error) {
    document.querySelector("#summary").textContent =
      "직접 출발지를 선택해 새로운 검증을 시작할 수 있습니다.";
    document.querySelector("#ranking").innerHTML =
      '<div class="empty-state"><p>위에서 출발지를 선택하고 계산을 실행하세요.</p></div>';
  }
}

boot().catch(showLabError);
