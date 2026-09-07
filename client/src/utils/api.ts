export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}

const RETRYABLE_GATEWAY_STATUSES = new Set([502, 503, 504]);
const DEFAULT_RETRY_DELAYS_MS = [250, 750];

function retryDelay(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get("Retry-After");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1_000;
  }

  return DEFAULT_RETRY_DELAYS_MS[attempt] ?? 1_000;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/**
 * Sends one logical API mutation. The key is generated once and reused across
 * transport/gateway retries so the server can replay the original result.
 */
export async function mutationFetch(
  input: Parameters<typeof globalThis.fetch>[0],
  init: NonNullable<Parameters<typeof globalThis.fetch>[1]>,
) {
  const method = init.method?.toUpperCase();

  if (!method || !["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new Error("mutationFetch requires an unsafe HTTP method");
  }

  const headers = new Headers(init.headers);
  if (!headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", crypto.randomUUID());
  }

  const request = { ...init, headers };

  for (let attempt = 0; ; attempt += 1) {
    let response: Response | null = null;

    try {
      response = await fetch(input, request);
    } catch (error) {
      if (attempt >= DEFAULT_RETRY_DELAYS_MS.length || init.signal?.aborted) {
        throw error;
      }
    }

    if (response) {
      const isProcessing =
        response.status === 409 &&
        response.headers.get("Idempotency-Status") === "processing";
      const isRetryableGatewayFailure =
        RETRYABLE_GATEWAY_STATUSES.has(response.status) &&
        response.headers.get("Idempotency-Replayed") !== "true";

      if (!isProcessing && !isRetryableGatewayFailure) {
        return response;
      }

      if (attempt >= DEFAULT_RETRY_DELAYS_MS.length) {
        return response;
      }
    }

    await wait(retryDelay(response, attempt));
  }
}
