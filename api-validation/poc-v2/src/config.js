const path = require("node:path");

function loadConfig(env = process.env) {
  const required = ["KAKAO_REST_KEY", "ODSAY_KEY", "TMAP_APP_KEY"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`필수 환경변수 누락: ${missing.join(", ")}`);
  }
  return Object.freeze({
    keys: Object.freeze({
      kakao: env.KAKAO_REST_KEY,
      odsay: env.ODSAY_KEY,
      tmap: env.TMAP_APP_KEY,
    }),
    timeoutMs: 10000,
    maxRetries: 3,
    concurrency: 1,
    rootDir: path.resolve(__dirname, ".."),
  });
}

module.exports = { loadConfig };
