const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { loadConfig } = require("./config");
const { createHttpClient } = require("./http-client");
const { createProviders } = require("./providers");
const { createJobStore } = require("./jobs");
const { runScenario } = require("./pipeline");
const {
  addVenue,
  removeVenue,
  toggleVote,
  evaluateShortlist,
} = require("./shortlist");
const { validateVenueSearch, findHub } = require("./venue-search");
const root = path.resolve(__dirname, "..");

function resolvePublicFile(urlPath) {
  const routes = {
    "/": path.join(root, "web", "index.html"),
    "/app.js": path.join(root, "web", "app.js"),
    "/map-adapter.js": path.join(root, "web", "map-adapter.js"),
    "/styles.css": path.join(root, "web", "styles.css"),
    "/report-data.json": path.join(root, "output", "report-data.json"),
  };
  return routes[urlPath] || null;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 20000) throw new Error("요청 본문이 너무 큽니다.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("JSON 요청 본문이 올바르지 않습니다.");
  }
}

function requireJob(jobs, id) {
  const job = jobs.get(id);
  if (!job) {
    const error = new Error("작업을 찾을 수 없습니다.");
    error.status = 404;
    throw error;
  }
  return job;
}

function requireCompletedJob(job) {
  if (
    job?.status !== "SUCCEEDED" ||
    !job.result ||
    !Array.isArray(job.result.candidates) ||
    !Array.isArray(job.result.participants)
  ) {
    const error = new Error("작업 계산이 완료되지 않았습니다.");
    error.status = 409;
    throw error;
  }
  return job;
}

function createAppServer({ providers, jobs }) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (request.method === "GET" && url.pathname === "/api/origins/search") {
        const query = String(url.searchParams.get("q") || "").trim();
        if (query.length < 2 || query.length > 50) {
          return sendJson(response, 400, { error: "검색어는 2~50자여야 합니다." });
        }
        const result = await providers.kakaoKeyword({ query, size: 5 });
        return sendJson(response, 200, { places: result.data });
      }

      if (request.method === "GET" && url.pathname === "/api/venues/search") {
        const input = validateVenueSearch(url.searchParams);
        const job = requireCompletedJob(requireJob(jobs, input.jobId));
        let hub;
        try {
          hub = findHub(job, input.hubId);
        } catch (error) {
          error.status = 404;
          throw error;
        }
        const result = input.category
          ? await providers.kakaoCategory({
              category: input.category,
              lon: hub.lon,
              lat: hub.lat,
              radius: input.radius,
            })
          : await providers.kakaoKeyword({
              query: input.query,
              lon: hub.lon,
              lat: hub.lat,
              radius: input.radius,
              size: 15,
            });
        return sendJson(response, 200, {
          hub: { id: hub.id, name: hub.name, lon: hub.lon, lat: hub.lat },
          places: result.data,
          call: result.record,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/jobs") {
        return sendJson(response, 202, jobs.create(await readJson(request)));
      }

      const shortlistMatch = url.pathname.match(
        /^\/api\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/shortlist$/i
      );
      if (request.method === "GET" && shortlistMatch) {
        const job = requireJob(jobs, shortlistMatch[1]);
        return sendJson(response, 200, { shortlist: job.shortlist });
      }
      if (request.method === "POST" && shortlistMatch) {
        const job = requireJob(jobs, shortlistMatch[1]);
        try {
          const place = await readJson(request);
          const updated = jobs.update(job.id, (current) => ({
            ...current,
            shortlist: addVenue(current.shortlist, place),
          }));
          return sendJson(response, 200, { shortlist: updated.shortlist });
        } catch (error) {
          if (error.message.includes("이미 담긴") || error.message.includes("최대 5개")) {
            error.status = 409;
          }
          throw error;
        }
      }

      const shortlistEvaluateMatch = url.pathname.match(
        /^\/api\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/shortlist\/evaluate$/i
      );
      if (request.method === "POST" && shortlistEvaluateMatch) {
        const job = requireCompletedJob(requireJob(jobs, shortlistEvaluateMatch[1]));
        if (!job.shortlist.length) {
          throw new Error("공동 후보가 비어 있습니다.");
        }
        const evaluation = await evaluateShortlist({
          participants: job.result.participants,
          venues: job.shortlist,
          providers,
          onProgress: (progress) => {
            jobs.update(job.id, (current) => ({ ...current, progress }));
          },
        });
        const updated = jobs.update(job.id, (current) => ({
          ...current,
          shortlistEvaluation: evaluation.candidates,
          shortlistCalls: evaluation.calls,
        }));
        return sendJson(response, 200, {
          candidates: updated.shortlistEvaluation,
          calls: updated.shortlistCalls,
        });
      }

      const shortlistVoteMatch = url.pathname.match(
        /^\/api\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/shortlist\/([^/]+)\/vote$/i
      );
      if (request.method === "POST" && shortlistVoteMatch) {
        const job = requireJob(jobs, shortlistVoteMatch[1]);
        try {
          const updated = jobs.update(job.id, (current) => ({
            ...current,
            shortlist: toggleVote(current.shortlist, shortlistVoteMatch[2]),
          }));
          return sendJson(response, 200, { shortlist: updated.shortlist });
        } catch (error) {
          if (error.message.includes("찾을 수 없습니다")) {
            error.status = 404;
          }
          throw error;
        }
      }

      const shortlistVenueMatch = url.pathname.match(
        /^\/api\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/shortlist\/([^/]+)$/i
      );
      if (request.method === "DELETE" && shortlistVenueMatch) {
        const job = requireJob(jobs, shortlistVenueMatch[1]);
        const updated = jobs.update(job.id, (current) => ({
          ...current,
          shortlist: removeVenue(current.shortlist, shortlistVenueMatch[2]),
        }));
        if (updated.shortlist.length === job.shortlist.length) {
          const error = new Error("공동 후보를 찾을 수 없습니다.");
          error.status = 404;
          throw error;
        }
        return sendJson(response, 200, { shortlist: updated.shortlist });
      }

      const jobMatch = url.pathname.match(
        /^\/api\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
      );
      if (request.method === "GET" && jobMatch) {
        const job = jobs.get(jobMatch[1]);
        return job
          ? sendJson(response, 200, job)
          : sendJson(response, 404, { error: "작업을 찾을 수 없습니다." });
      }

      const file = resolvePublicFile(url.pathname);
      if (!file || !fs.existsSync(file)) {
        return sendJson(response, 404, { error: "Not found" });
      }
      const contentType = file.endsWith(".html")
        ? "text/html; charset=utf-8"
        : file.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : file.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "application/json; charset=utf-8";
      response.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      fs.createReadStream(file).pipe(response);
    } catch (error) {
      sendJson(response, Number(error.status) || 400, { error: error.message });
    }
  });
}

if (require.main === module) {
  const config = loadConfig();
  const client = createHttpClient(config);
  const providers = createProviders({ client, keys: config.keys });
  const jobs = createJobStore({ runner: runScenario, providers });
  createAppServer({ providers, jobs }).listen(4173, "127.0.0.1", () => {
    process.stdout.write("인터랙티브 PoC: http://localhost:4173\n");
  });
}

module.exports = { resolvePublicFile, createAppServer };
