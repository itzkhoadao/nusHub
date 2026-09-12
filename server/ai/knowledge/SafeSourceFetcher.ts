import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type {
  FetchedKnowledgeDocument,
  KnowledgeSource,
} from "./types";
import { KnowledgeSourcePolicyError } from "./sourceRegistry";

type LookupAddress = { address: string; family: number };

export type SafeSourceFetcherOptions = {
  fetch?: typeof fetch;
  lookup?: (hostname: string) => Promise<LookupAddress[]>;
  maxDocumentBytes: number;
  maxRedirects?: number;
  now?: () => number;
  timeoutMs: number;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class SafeSourceFetcher {
  private readonly fetchImplementation: typeof fetch;
  private readonly lookupImplementation: (hostname: string) => Promise<LookupAddress[]>;
  private readonly maxDocumentBytes: number;
  private readonly maxRedirects: number;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(options: SafeSourceFetcherOptions) {
    this.fetchImplementation = options.fetch ?? fetch;
    this.lookupImplementation =
      options.lookup ??
      ((hostname) => lookup(hostname, { all: true, verbatim: true }));
    this.maxDocumentBytes = options.maxDocumentBytes;
    this.maxRedirects = options.maxRedirects ?? 3;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs;
  }

  async fetch(source: KnowledgeSource, inputUrl: string, signal?: AbortSignal) {
    let url = this.validateUrl(source, inputUrl);

    for (let redirects = 0; redirects <= this.maxRedirects; redirects += 1) {
      await this.validateResolution(url.hostname);
      let response: Response;
      try {
        const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
        response = await this.fetchImplementation(url, {
          headers: {
            Accept: source.contentTypes.join(", "),
            "User-Agent": "NUSHub-Knowledge-Ingestion/1.0",
          },
          redirect: "manual",
          signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
        });
      } catch (error) {
        if (signal?.aborted) {
          throw new DOMException("Knowledge source fetch was cancelled", "AbortError");
        }
        throw new KnowledgeSourcePolicyError(
          "SOURCE_FETCH_FAILED",
          "The approved source could not be fetched.",
          { cause: error },
        );
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirects === this.maxRedirects) {
          throw new KnowledgeSourcePolicyError(
            "SOURCE_URL_REJECTED",
            "The source exceeded the allowed redirect limit.",
          );
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new KnowledgeSourcePolicyError(
            "SOURCE_FETCH_FAILED",
            "The source returned an invalid redirect.",
          );
        }
        url = this.validateUrl(source, new URL(location, url).toString());
        continue;
      }

      if (!response.ok) {
        throw new KnowledgeSourcePolicyError(
          "SOURCE_FETCH_FAILED",
          "The approved source did not return a successful response.",
        );
      }

      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (
        contentType !== "text/html" &&
        contentType !== "application/pdf"
      ) {
        throw new KnowledgeSourcePolicyError(
          "SOURCE_CONTENT_TYPE_REJECTED",
          "The source returned an unsupported content type.",
        );
      }
      if (!source.contentTypes.includes(contentType)) {
        throw new KnowledgeSourcePolicyError(
          "SOURCE_CONTENT_TYPE_REJECTED",
          "The source content type is not approved for this registry entry.",
        );
      }

      const declaredLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > this.maxDocumentBytes
      ) {
        throw new KnowledgeSourcePolicyError(
          "SOURCE_RESPONSE_TOO_LARGE",
          "The source response exceeded the configured size limit.",
        );
      }

      return {
        bytes: await readBounded(response, this.maxDocumentBytes),
        canonicalUrl: url.toString(),
        contentType,
        etag: response.headers.get("etag"),
        fetchedAt: new Date(this.now()).toISOString(),
        lastModified: response.headers.get("last-modified"),
      } satisfies FetchedKnowledgeDocument;
    }

    throw new KnowledgeSourcePolicyError(
      "SOURCE_FETCH_FAILED",
      "The approved source could not be fetched.",
    );
  }

  private validateUrl(source: KnowledgeSource, value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch (error) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_URL_REJECTED",
        "The source URL is invalid.",
        { cause: error },
      );
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      isIP(hostname) !== 0 ||
      !source.allowedDomains.includes(hostname)
    ) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_URL_REJECTED",
        "The source URL is outside the approved HTTPS domain allowlist.",
      );
    }
    url.hash = "";
    return url;
  }

  private async validateResolution(hostname: string) {
    let addresses: LookupAddress[];
    try {
      addresses = await this.lookupImplementation(hostname);
    } catch (error) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_FETCH_FAILED",
        "The approved source hostname could not be resolved.",
        { cause: error },
      );
    }
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicAddress(address))
    ) {
      throw new KnowledgeSourcePolicyError(
        "SOURCE_URL_REJECTED",
        "The source hostname resolved to a prohibited network address.",
      );
    }
  }
}

async function readBounded(response: Response, maximumBytes: number) {
  if (!response.body) {
    throw new KnowledgeSourcePolicyError(
      "SOURCE_FETCH_FAILED",
      "The source returned an empty response.",
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new KnowledgeSourcePolicyError(
        "SOURCE_RESPONSE_TOO_LARGE",
        "The source response exceeded the configured size limit.",
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function isPublicAddress(address: string) {
  if (isIP(address) === 4) {
    const [first, second] = address.split(".").map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 88 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0) ||
      first >= 224
    );
  }

  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      return isPublicAddress(normalized.slice(7));
    }
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8")
    );
  }

  return false;
}
