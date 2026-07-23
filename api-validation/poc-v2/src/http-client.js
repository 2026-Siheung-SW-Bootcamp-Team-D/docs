function sanitizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  const sanitizedParams = new URLSearchParams();
  const blocked = new Set(["apikey", "appkey", "key", "authorization"]);
  for (const [key, value] of url.searchParams.entries()) {
    if (!blocked.has(key.toLowerCase())) {
      sanitizedParams.append(key, value);
    }
  }
  url.search = sanitizedParams.toString();
  return url.toString();
}

class HttpClientError extends Error {
  constructor(message, { classification, provider, publicMessage, status } = {}) {
    super(message);
    this.name = "HttpClientError";
    this.classification = classification;
    this.provider = provider;
    this.publicMessage = publicMessage;
    this.status = status;
  }
}

function sanitizeParameterNames(names = []) {
  const blocked = new Set(["apikey", "appkey", "authorization", "key"]);
  return names.reduce((filtered, name) => {
    const value = String(name || "").trim();
    if (!value || blocked.has(value.toLowerCase()) || filtered.includes(value)) {
      return filtered;
    }
    return [...filtered, value];
  }, []);
}

function createUpstreamError({
  provider,
  classification,
  publicMessage,
  status = null,
} = {}) {
  return new HttpClientError(`${provider}: ${classification}`, {
    classification,
    provider,
    publicMessage,
    status,
  });
}

function isTimeoutError(error) {
  return ["AbortError", "TimeoutError"].includes(error?.name);
}

function createHttpClient({
  fetchImpl = fetch,
  timeoutMs = 10000,
  maxRetries = 3,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  async function json({
    provider,
    purpose = "UNSPECIFIED",
    url,
    method = "GET",
    headers = {},
    body,
    parameterNames = [],
  }) {
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
          throw createUpstreamError({
            provider,
            classification: isTimeoutError(error) ? "TIMEOUT" : "TRANSPORT",
            publicMessage: isTimeoutError(error)
              ? "외부 서비스 응답 시간이 초과되었습니다."
              : "외부 서비스 연결에 실패했습니다.",
          });
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
      if (response.status === 429) {
        throw createUpstreamError({
          provider,
          classification: "RATE_LIMITED",
          publicMessage: "외부 서비스 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.",
          status: response.status,
        });
      }
      if (response.status >= 500) {
        throw createUpstreamError({
          provider,
          classification: "UPSTREAM_5XX",
          publicMessage: "외부 서비스 응답이 불안정합니다.",
          status: response.status,
        });
      }
      if (!response.ok) {
        throw createUpstreamError({
          provider,
          classification: "UPSTREAM_BAD_RESPONSE",
          publicMessage: "외부 서비스 요청을 처리하지 못했습니다.",
          status: response.status,
        });
      }
      return {
        body: parsed,
        record: {
          provider,
          purpose: String(purpose),
          method,
          url: sanitizeUrl(url),
          parameterNames: sanitizeParameterNames(parameterNames),
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

module.exports = { HttpClientError, createHttpClient, sanitizeUrl };
