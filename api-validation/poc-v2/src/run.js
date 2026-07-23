const path = require("node:path");
const { loadConfig } = require("./config");
const { createHttpClient } = require("./http-client");
const { createProviders } = require("./providers");
const { runScenario } = require("./pipeline");
const { writeReport } = require("./report");
const scenarios = require("./scenarios");

async function main() {
  const config = loadConfig();
  const client = createHttpClient(config);
  const providers = createProviders({ client, keys: config.keys });
  const results = [];
  for (const scenario of scenarios) {
    process.stdout.write(`[RUN] ${scenario.title}\n`);
    try {
      const result = await runScenario(scenario, providers, (progress) => {
        process.stdout.write(
          `  ${progress.phase} ${progress.done}/${progress.total}\n`
        );
      });
      results.push(result);
      process.stdout.write(`[${result.status}] ${scenario.title}\n`);
    } catch (error) {
      results.push({
        id: scenario.id,
        title: scenario.title,
        status: "FAILED",
        error: { message: error.message },
      });
      process.stdout.write(`[FAILED] ${scenario.title}: ${error.message}\n`);
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    status: results.every((result) =>
      ["SUCCEEDED", "NO_INTERSECTION"].includes(result.status)
    ) ? "PASS" : "FAIL",
    scenarios: results,
  };
  writeReport(config.rootDir, report);
  process.stdout.write(
    `보고서 데이터: ${path.join(config.rootDir, "output", "report-data.json")}\n`
  );
  if (report.status === "FAIL") process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
