const fs = require("node:fs");
const path = require("node:path");

function visit(value, pathName = "$") {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`유한하지 않은 숫자: ${pathName}`);
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["apiKey", "appKey", "Authorization"].includes(key)) {
      throw new Error(`비밀값 키 포함: ${key}`);
    }
    visit(child, `${pathName}.${key}`);
  }
}

function assertSafeReport(report) {
  visit(report);
  if (JSON.stringify(report).includes("KakaoAK")) {
    throw new Error("비밀값 인증 접두사 포함: KakaoAK");
  }
}

function writeReport(rootDir, report) {
  assertSafeReport(report);
  const outputDir = path.join(rootDir, "output");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "report-data.json"),
    JSON.stringify(report, null, 2)
  );
}

module.exports = { assertSafeReport, writeReport };
