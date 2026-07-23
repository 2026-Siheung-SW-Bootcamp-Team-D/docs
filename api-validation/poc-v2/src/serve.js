const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { loadConfig } = require("./config");
const { createHttpClient } = require("./http-client");
const { createProviders } = require("./providers");
const { createJobStore } = require("./jobs");
const { runScenario } = require("./pipeline");
const root = path.resolve(__dirname, "..");

function resolvePublicFile(urlPath) {
  const routes = {
    "/": path.join(root, "web", "index.html"),
    "/app.js": path.join(root, "web", "app.js"),
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

      if (request.method === "POST" && url.pathname === "/api/jobs") {
        return sendJson(response, 202, jobs.create(await readJson(request)));
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
      sendJson(response, 400, { error: error.message });
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
