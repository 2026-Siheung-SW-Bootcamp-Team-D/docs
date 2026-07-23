const crypto = require("node:crypto");

function validateScenario(input) {
  if (
    !Array.isArray(input.participants) ||
    input.participants.length < 2 ||
    input.participants.length > 5
  ) {
    throw new Error("참여자는 2명 이상 5명 이하여야 합니다.");
  }
  if (![30, 45, 60].includes(Number(input.minutes))) {
    throw new Error("도달시간은 30, 45, 60분 중 하나여야 합니다.");
  }
  const participants = input.participants.map((participant, index) => {
    const lon = Number(participant.lon);
    const lat = Number(participant.lat);
    if (
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      lon < 124 ||
      lon > 132 ||
      lat < 33 ||
      lat > 39
    ) {
      throw new Error(`${index + 1}번 참여자의 대한민국 좌표가 올바르지 않습니다.`);
    }
    return {
      id: `P${index + 1}`,
      label: String(participant.label || `참여자 ${index + 1}`).slice(0, 40),
      lon,
      lat,
    };
  });
  return {
    id: `custom-${Date.now()}`,
    title: String(input.title || "직접 만든 시나리오").slice(0, 60),
    minutes: Number(input.minutes),
    participants,
  };
}

function createJobStore({ runner, providers }) {
  const jobs = new Map();

  function create(input) {
    const scenario = validateScenario(input);
    const job = {
      id: crypto.randomUUID(),
      status: "QUEUED",
      progress: { phase: "QUEUED", done: 0, total: 1 },
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    jobs.set(job.id, job);
    setImmediate(async () => {
      job.status = "RUNNING";
      try {
        job.result = await runner(scenario, providers, (progress) => {
          job.progress = progress;
        });
        job.status = job.result.status;
      } catch (error) {
        job.status = "FAILED";
        job.error = { message: error.message };
      }
    });
    return { id: job.id, status: job.status };
  }

  function get(id) {
    return jobs.get(id) || null;
  }

  return Object.freeze({ create, get });
}

module.exports = { validateScenario, createJobStore };
