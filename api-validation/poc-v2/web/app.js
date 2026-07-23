let report = { generatedAt: null, status: "NOT_RUN", scenarios: [] };
let activeJobId = null;
let activeScenario = null;
let activeHubId = null;
let currentVenues = [];
let currentShortlist = [];
let currentShortlistEvaluation = null;
let activeVenueCategory = "FD6";
let venueSearchToken = 0;

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

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "#";
  } catch {
    return "#";
  }
}

const minutes = (seconds) =>
  Number.isFinite(seconds) ? `${Math.round(seconds / 60)}분` : "N/A";

function encodePathSegment(value) {
  return encodeURIComponent(String(value ?? ""));
}

function isActiveLiveScenario(scenario) {
  return Boolean(
    activeJobId &&
    activeScenario &&
    scenario &&
    scenario.id === activeScenario.id
  );
}

function setVenueStatus(message = "") {
  document.querySelector("#venue-status").textContent = message;
}

function resetVenueSearchState(message = "") {
  venueSearchToken += 1;
  currentVenues = [];
  currentShortlistEvaluation = null;
  MeetingMap.renderVenues([]);
  renderVenueCards();
  renderShortlistMatrix();
  setVenueStatus(message);
  return venueSearchToken;
}

function appendEmptyState(container, message) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";
  const text = document.createElement("p");
  text.textContent = message;
  wrapper.append(text);
  container.replaceChildren(wrapper);
}

function setTableEmpty(table, message) {
  table.innerHTML = `<tbody><tr><td class="table-empty">${escapeHtml(message)}</td></tr></tbody>`;
}

function createBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`;
  badge.textContent = text;
  return badge;
}

function createMetaLine(text) {
  const line = document.createElement("p");
  line.className = "venue-meta";
  line.textContent = text;
  return line;
}

function createActionButton({ label, action, id, className = "secondary", disabled = false }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.action = action;
  button.dataset.id = String(id);
  button.textContent = label;
  button.disabled = disabled;
  return button;
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

function syncCategoryTabs() {
  document.querySelectorAll("#venue-category-tabs button").forEach((button) => {
    const isActive = button.dataset.category === activeVenueCategory;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function renderVenueCards() {
  const container = document.querySelector("#venue-results");
  container.replaceChildren();

  if (!currentVenues.length) {
    appendEmptyState(
      container,
      "추천 지역을 선택한 뒤 카테고리를 고르거나 직접 검색해 실제 장소를 찾아보세요."
    );
    return;
  }

  currentVenues.forEach((place) => {
    const card = document.createElement("article");
    card.className = "venue-card";

    const category = document.createElement("p");
    category.className = "venue-category";
    category.textContent = place.category || "분류 없음";

    const title = document.createElement("h3");
    title.textContent = place.name;

    const added = currentShortlist.some((item) => item.id === String(place.id));
    const actions = document.createElement("div");
    actions.className = "card-actions";

    actions.append(
      createActionButton({
        label: added ? "공동 후보에 담김" : "공동 후보에 담기",
        action: "add-venue",
        id: place.id,
        className: "primary",
        disabled: added,
      })
    );

    const url = safeHttpUrl(place.url);
    if (url !== "#") {
      const link = document.createElement("a");
      link.className = "venue-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "카카오 장소 보기";
      actions.append(link);
    }

    card.append(category, title);
    if (Number.isFinite(Number(place.distanceMeters))) {
      card.append(createMetaLine(`허브 기준 ${Number(place.distanceMeters)}m`));
    }
    card.append(createMetaLine(place.roadAddress || place.address || "주소 정보 없음"));
    if (place.phone) {
      card.append(createMetaLine(`전화 ${place.phone}`));
    }
    card.append(actions);
    container.append(card);
  });
}

function renderShortlist() {
  const shortlistPanel = document.querySelector("#shortlist-panel");
  const container = document.querySelector("#shortlist");
  const evaluateButton = document.querySelector("#evaluate-shortlist");

  evaluateButton.disabled = !currentShortlist.length;
  if (shortlistPanel.hidden) {
    container.replaceChildren();
    return;
  }

  container.replaceChildren();
  if (!currentShortlist.length) {
    appendEmptyState(
      container,
      "마음에 드는 장소를 최대 5곳까지 담아 공동 후보를 만들어 보세요."
    );
    return;
  }

  currentShortlist.forEach((place) => {
    const card = document.createElement("article");
    card.className = "shortlist-card";

    const title = document.createElement("h3");
    title.textContent = place.name;

    const category = document.createElement("p");
    category.className = "venue-category";
    category.textContent = place.category || "분류 없음";

    const badges = document.createElement("div");
    badges.className = "badge-row";
    badges.append(createBadge(`투표 ${Number(place.vote) || 0}`, "vote"));
    if (Number.isFinite(Number(place.distanceMeters))) {
      badges.append(createBadge(`허브 ${Number(place.distanceMeters)}m`, "metric"));
    }

    const actions = document.createElement("div");
    actions.className = "card-actions";
    actions.append(
      createActionButton({
        label: Number(place.vote) === 1 ? "투표 취소" : "팀 투표",
        action: "toggle-vote",
        id: place.id,
      }),
      createActionButton({
        label: "후보 제거",
        action: "remove-shortlist",
        id: place.id,
        className: "danger",
      })
    );

    card.append(
      category,
      title,
      createMetaLine(place.roadAddress || place.address || "주소 정보 없음")
    );
    if (place.phone) {
      card.append(createMetaLine(`전화 ${place.phone}`));
    }
    card.append(badges, actions);
    container.append(card);
  });
}

function renderShortlistMatrix() {
  const table = document.querySelector("#shortlist-matrix");
  table.replaceChildren();

  if (document.querySelector("#shortlist-panel").hidden) {
    return;
  }
  if (!currentShortlist.length) {
    setTableEmpty(table, "공동 후보를 담으면 실제 이동시간 비교 표가 여기에 나타납니다.");
    return;
  }
  if (!currentShortlistEvaluation?.length) {
    setTableEmpty(table, "공동 후보를 담은 뒤 실제 이동시간 비교를 실행하세요.");
    return;
  }

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headerRow.append(document.createElement("th"));
  const titleHeader = document.createElement("th");
  titleHeader.textContent = "공동 후보";
  headerRow.append(titleHeader);
  (activeScenario?.participants || []).forEach((participant) => {
    const cell = document.createElement("th");
    cell.textContent = participant.label;
    headerRow.append(cell);
  });
  thead.append(headerRow);

  const tbody = document.createElement("tbody");
  currentShortlistEvaluation.forEach((candidate) => {
    const row = document.createElement("tr");

    const rankCell = document.createElement("th");
    rankCell.textContent = `${candidate.rank}위`;
    row.append(rankCell);

    const summaryCell = document.createElement("td");
    summaryCell.className = "matrix-cell";

    const title = document.createElement("div");
    title.className = "matrix-title";
    title.textContent = candidate.name;

    const badges = document.createElement("div");
    badges.className = "matrix-badges";
    badges.append(
      createBadge(`공정성 ${candidate.rank}위`, "rank"),
      createBadge(`투표 ${Number(candidate.vote) || 0}`, "vote")
    );

    const stats = document.createElement("div");
    stats.className = "matrix-stats";
    stats.append(
      createBadge(
        candidate.metrics.maxSeconds === null
          ? "최장 N/A"
          : `최장 ${minutes(candidate.metrics.maxSeconds)}`,
        "metric"
      ),
      createBadge(
        candidate.metrics.avgSeconds === null
          ? "평균 N/A"
          : `평균 ${minutes(candidate.metrics.avgSeconds)}`,
        "metric"
      )
    );

    summaryCell.append(title, badges, stats);
    row.append(summaryCell);

    (activeScenario?.participants || []).forEach((participant) => {
      const route = candidate.routes.find(
        (item) => item.participantId === participant.id
      );
      const cell = document.createElement("td");
      cell.className = route?.status === "READY"
        ? "route-ready matrix-route"
        : "route-unavailable matrix-route";
      if (route?.status === "READY") {
        cell.textContent = `${minutes(route.totalSeconds)} · 환승 ${route.transferCount}회`;
        const detail = document.createElement("small");
        detail.textContent = `${route.fareAmount.toLocaleString()}원 · 도보 ${minutes(route.totalWalkSeconds)}`;
        cell.append(detail);
      } else {
        cell.textContent = "경로 없음";
      }
      row.append(cell);
    });

    tbody.append(row);
  });

  table.append(thead, tbody);
}

function renderVenueExplorer(scenario) {
  const explorer = document.querySelector("#venue-explorer");
  const shortlistPanel = document.querySelector("#shortlist-panel");
  const liveScenario = isActiveLiveScenario(scenario) && scenario.candidates?.length;

  if (!liveScenario) {
    explorer.hidden = true;
    shortlistPanel.hidden = true;
    venueSearchToken += 1;
    currentVenues = [];
    currentShortlistEvaluation = null;
    MeetingMap.renderVenues([]);
    MeetingMap.renderShortlist([]);
    setVenueStatus("");
    return;
  }

  explorer.hidden = false;
  shortlistPanel.hidden = false;
  const select = document.querySelector("#hub-select");
  const nextHubId = scenario.candidates.some((hub) => hub.id === activeHubId)
    ? activeHubId
    : String(scenario.candidates[0].id);

  select.replaceChildren();
  scenario.candidates.forEach((hub) => {
    const option = document.createElement("option");
    option.value = String(hub.id);
    option.textContent = `${hub.rank}. ${hub.name}`;
    select.append(option);
  });
  select.value = nextHubId;
  activeHubId = select.value;
  syncCategoryTabs();
  if (!currentVenues.length) {
    setVenueStatus("추천 지역을 선택하고 카테고리 또는 검색어로 실제 장소를 찾아보세요.");
  }
  renderVenueCards();
  renderShortlist();
  renderShortlistMatrix();
}

function renderScenario(scenario) {
  document.querySelectorAll("#scenario-tabs button").forEach((button) =>
    button.classList.toggle("active", button.dataset.id === scenario.id)
  );
  renderStatus(scenario);
  MeetingMap.renderScenario(scenario);
  renderRanking(scenario);
  renderMatrix(scenario);
  renderCalls(scenario);
  renderVenueExplorer(scenario);
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

function showVenueError(error) {
  setVenueStatus(error.message);
}

async function loadShortlist() {
  if (!activeJobId) return;
  const response = await fetch(
    `/api/jobs/${encodePathSegment(activeJobId)}/shortlist`
  ).then((result) => result.json());
  if (response.error) throw new Error(response.error);
  currentShortlist = Array.isArray(response.shortlist) ? response.shortlist : [];
  currentShortlistEvaluation = null;
  MeetingMap.renderShortlist(currentShortlist);
  renderShortlist();
  renderShortlistMatrix();
}

async function searchVenues({ category = null, query = null }) {
  if (!activeJobId || !activeHubId) {
    throw new Error("추천 지역을 먼저 계산하세요.");
  }

  const params = new URLSearchParams({
    jobId: activeJobId,
    hubId: activeHubId,
    radius: "1000",
  });
  if (category) params.set("category", category);
  if (query) params.set("query", query);

  const requestToken = resetVenueSearchState("실제 장소를 찾는 중입니다.");

  try {
    const response = await fetch(`/api/venues/search?${params.toString()}`).then(
      (value) => value.json()
    );
    if (requestToken !== venueSearchToken) {
      return false;
    }
    if (response.error) throw new Error(response.error);

    currentVenues = Array.isArray(response.places) ? response.places : [];
    MeetingMap.renderVenues(currentVenues);
    renderVenueCards();
    renderShortlistMatrix();
    setVenueStatus(
      currentVenues.length
        ? `${currentVenues.length}곳을 찾았습니다. 공동 후보에 담아 비교해 보세요.`
        : "조건에 맞는 장소를 찾지 못했습니다. 다른 카테고리나 검색어를 시도해 보세요."
    );
    return true;
  } catch (error) {
    if (requestToken !== venueSearchToken) {
      return false;
    }
    throw error;
  }
}

async function addVenueToShortlist(placeId) {
  const place = currentVenues.find((item) => String(item.id) === String(placeId));
  if (!place) {
    throw new Error("선택한 장소를 찾을 수 없습니다.");
  }

  const response = await fetch(
    `/api/jobs/${encodePathSegment(activeJobId)}/shortlist`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(place),
    }
  ).then((result) => result.json());
  if (response.error) throw new Error(response.error);

  currentShortlist = response.shortlist;
  currentShortlistEvaluation = null;
  MeetingMap.renderShortlist(currentShortlist);
  renderVenueCards();
  renderShortlist();
  renderShortlistMatrix();
  setVenueStatus("공동 후보에 추가했습니다.");
}

async function removeVenueFromShortlist(placeId) {
  const response = await fetch(
    `/api/jobs/${encodePathSegment(activeJobId)}/shortlist/${encodePathSegment(placeId)}`,
    { method: "DELETE" }
  ).then((result) => result.json());
  if (response.error) throw new Error(response.error);

  currentShortlist = response.shortlist;
  currentShortlistEvaluation = null;
  MeetingMap.renderShortlist(currentShortlist);
  renderVenueCards();
  renderShortlist();
  renderShortlistMatrix();
  setVenueStatus("공동 후보에서 제거했습니다.");
}

async function toggleShortlistVote(placeId) {
  const response = await fetch(
    `/api/jobs/${encodePathSegment(activeJobId)}/shortlist/${encodePathSegment(placeId)}/vote`,
    { method: "POST" }
  ).then((result) => result.json());
  if (response.error) throw new Error(response.error);

  currentShortlist = response.shortlist;
  currentShortlistEvaluation = null;
  MeetingMap.renderShortlist(currentShortlist);
  renderVenueCards();
  renderShortlist();
  renderShortlistMatrix();
  setVenueStatus("팀 투표를 업데이트했습니다.");
}

async function evaluateShortlist() {
  if (!activeJobId) {
    throw new Error("실시간 계산 결과가 필요합니다.");
  }
  setVenueStatus("공동 후보의 실제 이동시간을 다시 계산하는 중입니다.");
  const response = await fetch(
    `/api/jobs/${encodePathSegment(activeJobId)}/shortlist/evaluate`,
    { method: "POST" }
  ).then((result) => result.json());
  if (response.error) throw new Error(response.error);

  currentShortlistEvaluation = response.candidates;
  renderShortlistMatrix();
  setVenueStatus("실제 이동시간 비교를 업데이트했습니다.");
}

function bindVenueExplorer() {
  document.querySelector("#hub-select").addEventListener("change", (event) => {
    activeHubId = event.currentTarget.value;
    resetVenueSearchState("추천 지역이 바뀌었습니다. 카테고리나 검색어로 실제 장소를 찾아보세요.");
  });

  document
    .querySelector("#venue-category-tabs")
    .addEventListener("click", (event) => {
      const button = event.target.closest("button[data-category]");
      if (!button) return;
      activeVenueCategory = button.dataset.category;
      syncCategoryTabs();
      searchVenues({ category: activeVenueCategory }).catch(showVenueError);
    });

  document.querySelector("#search-venues").addEventListener("click", () => {
    const query = document.querySelector("#venue-query").value.trim();
    activeVenueCategory = null;
    syncCategoryTabs();
    searchVenues({ query }).catch(showVenueError);
  });

  document.querySelector("#venue-results").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='add-venue']");
    if (!button) return;
    addVenueToShortlist(button.dataset.id).catch(showVenueError);
  });

  document.querySelector("#shortlist").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "toggle-vote") {
      toggleShortlistVote(id).catch(showVenueError);
      return;
    }
    if (action === "remove-shortlist") {
      removeVenueFromShortlist(id).catch(showVenueError);
      return;
    }
  });

  document.querySelector("#evaluate-shortlist").addEventListener("click", () =>
    evaluateShortlist().catch(showVenueError)
  );
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
    SHORTLIST_EVALUATION: "공동 후보의 실제 이동시간을 계산하고 있습니다.",
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
      activeJobId = jobId;
      activeScenario = job.result;
      activeHubId = null;
      currentVenues = [];
      currentShortlist = [];
      currentShortlistEvaluation = null;
      renderScenario(job.result);
      renderVenueExplorer(job.result);
      await loadShortlist();
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
  bindVenueExplorer();
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
  MeetingMap.create("map");
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

const teamdWebTest = globalThis.__TEAMD_WEB_TEST__ || null;

if (teamdWebTest) {
  Object.assign(teamdWebTest, {
    safeHttpUrl,
    encodePathSegment,
    searchVenues,
    setVenueTestState({
      activeJobId: nextActiveJobId = activeJobId,
      activeHubId: nextActiveHubId = activeHubId,
      activeScenario: nextActiveScenario = activeScenario,
      currentShortlist: nextCurrentShortlist = currentShortlist,
    } = {}) {
      activeJobId = nextActiveJobId;
      activeHubId = nextActiveHubId;
      activeScenario = nextActiveScenario;
      currentShortlist = nextCurrentShortlist;
    },
    getVenueState() {
      return {
        activeJobId,
        activeHubId,
        currentVenues,
        currentShortlist,
        currentShortlistEvaluation,
        venueSearchToken,
        venueStatus: document.querySelector("#venue-status").textContent,
      };
    },
  });
}

if (!teamdWebTest?.skipBoot) {
  boot().catch(showLabError);
}
