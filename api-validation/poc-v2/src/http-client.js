function sanitizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  for (const key of ["apiKey", "appKey", "key"]) {
    if (url.searchParams.has(key)) url.searchParams.set(key, "[REDACTED]");
  }
  return url.toString();
}

function createHttpClient({
  fetchImpl = fetch,
  timeoutMs = 10000,
  maxRetries = 3,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  async function json({ provider, url, method = "GET", headers = {}, body }) {
    const startedAt = Date.now();
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (attempt === maxRetries) {
          throw new Error(`${provider}: 통신 실패 (${error.name})`);
        }
        await sleep(2 ** (attempt - 1) * 1000);
        continue;
      }

      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`${provider}: JSON이 아닌 응답 status=${response.status}`);
      }

      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = Number(response.headers.get("Retry-After") || 0);
        await sleep(Math.min(retryAfter * 1000 || 2 ** (attempt - 1) * 1000, 10000));
        continue;
      }
      if (!response.ok) {
        throw new Error(`${provider}: HTTP ${response.status}`);
      }
      return {
        body: parsed,
        record: {
          provider,
          method,
          url: sanitizeUrl(url),
          status: response.status,
          attempts: attempt,
          durationMs: Date.now() - startedAt,
          bytes: Buffer.byteLength(text),
        },
      };
    }
    throw new Error(`${provider}: 재시도 한도 초과`);
  }
  return Object.freeze({ json });
}

module.exports = { createHttpClient, sanitizeUrl };
