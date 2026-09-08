import { createHash } from "node:crypto";
import { parseAcademicYear, parseModuleCode } from "../domain/moduleInput";
import { NusModsError } from "./NusModsError";
import {
  nusModsModuleListSchema,
  nusModsModuleSchema,
  type NusModsModuleListItem,
  type NusModsModuleResult,
  type NusModsSourceMetadata,
} from "./NusModsTypes";

const NUSMODS_BASE_URL = "https://api.nusmods.com/v2/";

type CacheEntry<T> = {
  freshUntil: number;
  staleUntil: number;
  value: T;
};

type ListResult = {
  modules: NusModsModuleListItem[];
  source: NusModsSourceMetadata;
};

export type NusModsTelemetryEvent = {
  cache: "fresh" | "miss" | "stale";
  durationMs: number;
  operation: "get_module" | "list_modules";
  outcome: "found" | "not_found" | "error";
  sourceId: "nusmods_api";
};

export type NusModsClientOptions = {
  cacheMaxEntries?: number;
  cacheTtlMs?: number;
  fetch?: typeof fetch;
  maxDocumentBytes?: number;
  maxStalenessMs?: number;
  now?: () => number;
  recordTelemetry?: (event: NusModsTelemetryEvent) => void;
  timeoutMs?: number;
};

export class NusModsClient {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly cacheMaxEntries: number;
  private readonly cacheTtlMs: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly maxDocumentBytes: number;
  private readonly maxStalenessMs: number;
  private readonly now: () => number;
  private readonly recordTelemetry: (event: NusModsTelemetryEvent) => void;
  private readonly timeoutMs: number;

  constructor(options: NusModsClientOptions = {}) {
    this.cacheMaxEntries = options.cacheMaxEntries ?? 500;
    this.cacheTtlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1_000;
    this.fetchImplementation = options.fetch ?? fetch;
    this.maxDocumentBytes = options.maxDocumentBytes ?? 1024 * 1024;
    this.maxStalenessMs = options.maxStalenessMs ?? 48 * 60 * 60 * 1_000;
    this.now = options.now ?? Date.now;
    this.recordTelemetry = options.recordTelemetry ?? (() => undefined);
    this.timeoutMs = options.timeoutMs ?? 15_000;

    if (this.maxStalenessMs < this.cacheTtlMs) {
      throw new Error("maxStalenessMs must be greater than or equal to cacheTtlMs");
    }
  }

  async getModule(
    academicYear: string,
    moduleCode: string,
  ): Promise<NusModsModuleResult> {
    const canonicalAcademicYear = parseAcademicYear(academicYear).apiValue;
    const canonicalModuleCode = parseModuleCode(moduleCode);
    if (
      canonicalAcademicYear !== academicYear ||
      canonicalModuleCode !== moduleCode
    ) {
      throw new TypeError("NUSMods client inputs must already be canonicalized");
    }

    const key = `module:${academicYear}:${moduleCode}`;
    const endpoint = `${NUSMODS_BASE_URL}${academicYear}/modules/${moduleCode}.json`;

    return this.getCachedOrFetch(key, "get_module", async () => {
      const response = await this.fetchJson(endpoint);

      if (response.status === 404) {
        return { status: "not_found" } as const;
      }

      if (!response.ok) {
        throw new NusModsError(
          "SOURCE_UNAVAILABLE",
          "NUSMods did not return a successful response.",
        );
      }

      const { hash, json } = await this.readBoundedJson(response);
      const parsed = nusModsModuleSchema.safeParse(json);

      if (
        !parsed.success ||
        !matchesAcademicYear(parsed.data.acadYear, academicYear) ||
        parsed.data.moduleCode.toUpperCase() !== moduleCode
      ) {
        throw new NusModsError(
          "SOURCE_INVALID_RESPONSE",
          "NUSMods returned a module record that failed validation.",
        );
      }

      const fetchedAt = new Date(this.now()).toISOString();
      return {
        module: parsed.data,
        source: {
          academicYear,
          contentHash: hash,
          fetchedAt,
          moduleCode,
          sourceId: "nusmods_api",
          stale: false,
          url: endpoint,
        },
        status: "found",
      } as const;
    });
  }

  async listModules(academicYear: string): Promise<ListResult> {
    if (parseAcademicYear(academicYear).apiValue !== academicYear) {
      throw new TypeError("NUSMods client inputs must already be canonicalized");
    }

    const key = `list:${academicYear}`;
    const endpoint = `${NUSMODS_BASE_URL}${academicYear}/moduleList.json`;

    return this.getCachedOrFetch(key, "list_modules", async () => {
      const response = await this.fetchJson(endpoint);

      if (!response.ok) {
        throw new NusModsError(
          "SOURCE_UNAVAILABLE",
          "NUSMods did not return its module list.",
        );
      }

      const { hash, json } = await this.readBoundedJson(response);
      const parsed = nusModsModuleListSchema.safeParse(json);

      if (!parsed.success) {
        throw new NusModsError(
          "SOURCE_INVALID_RESPONSE",
          "NUSMods returned a module list that failed validation.",
        );
      }

      const fetchedAt = new Date(this.now()).toISOString();
      return {
        modules: parsed.data,
        source: {
          academicYear,
          contentHash: hash,
          fetchedAt,
          sourceId: "nusmods_api",
          stale: false,
          url: endpoint,
        },
      };
    });
  }

  private async fetchJson(url: string): Promise<Response> {
    try {
      return await this.fetchImplementation(url, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError");
      throw new NusModsError(
        isTimeout ? "SOURCE_TIMEOUT" : "SOURCE_UNAVAILABLE",
        isTimeout
          ? "The NUSMods request timed out."
          : "The NUSMods source is currently unavailable.",
        { cause: error },
      );
    }
  }

  private async getCachedOrFetch<T>(
    key: string,
    operation: NusModsTelemetryEvent["operation"],
    loader: () => Promise<T>,
  ): Promise<T> {
    const startedAt = this.now();
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;

    if (cached && startedAt < cached.freshUntil) {
      this.touchCache(key, cached);
      this.emitTelemetry(operation, cached.value, "fresh", startedAt);
      return cached.value;
    }

    const activeRequest = this.inFlight.get(key) as Promise<T> | undefined;
    if (activeRequest) {
      return activeRequest;
    }

    const request = (async () => {
      try {
        const value = await loader();
        const timestamp = this.now();
        this.setCache(key, {
          freshUntil: timestamp + this.cacheTtlMs,
          staleUntil: timestamp + this.maxStalenessMs,
          value,
        });
        this.emitTelemetry(operation, value, "miss", startedAt);
        return value;
      } catch (error) {
        if (
          cached &&
          !isNotFound(cached.value) &&
          this.now() < cached.staleUntil
        ) {
          const staleValue = markStale(cached.value);
          this.emitTelemetry(operation, staleValue, "stale", startedAt);
          return staleValue;
        }

        this.recordTelemetry({
          cache: "miss",
          durationMs: Math.max(0, this.now() - startedAt),
          operation,
          outcome: "error",
          sourceId: "nusmods_api",
        });
        throw error;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, request);
    return request;
  }

  private async readBoundedJson(
    response: Response,
  ): Promise<{ hash: string; json: unknown }> {
    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (!contentType?.includes("application/json")) {
      throw new NusModsError(
        "SOURCE_INVALID_RESPONSE",
        "NUSMods returned a non-JSON response.",
      );
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > this.maxDocumentBytes) {
      throw new NusModsError(
        "SOURCE_RESPONSE_TOO_LARGE",
        "The NUSMods response exceeded the configured size limit.",
      );
    }

    if (!response.body) {
      throw new NusModsError(
        "SOURCE_INVALID_RESPONSE",
        "NUSMods returned an empty response.",
      );
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > this.maxDocumentBytes) {
        await reader.cancel();
        throw new NusModsError(
          "SOURCE_RESPONSE_TOO_LARGE",
          "The NUSMods response exceeded the configured size limit.",
        );
      }
      chunks.push(value);
    }

    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    try {
      return {
        hash: createHash("sha256").update(bytes).digest("hex"),
        json: JSON.parse(bytes.toString("utf8")),
      };
    } catch (error) {
      throw new NusModsError(
        "SOURCE_INVALID_RESPONSE",
        "NUSMods returned malformed JSON.",
        { cause: error },
      );
    }
  }

  private emitTelemetry(
    operation: NusModsTelemetryEvent["operation"],
    value: unknown,
    cache: NusModsTelemetryEvent["cache"],
    startedAt: number,
  ) {
    this.recordTelemetry({
      cache,
      durationMs: Math.max(0, this.now() - startedAt),
      operation,
      outcome:
        isNotFound(value) ? "not_found" : "found",
      sourceId: "nusmods_api",
    });
  }

  private setCache<T>(key: string, entry: CacheEntry<T>) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, entry);

    while (this.cache.size > this.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
  }

  private touchCache<T>(key: string, entry: CacheEntry<T>) {
    this.cache.delete(key);
    this.cache.set(key, entry);
  }
}

function isNotFound(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "not_found"
  );
}

function markStale<T>(value: T): T {
  if (
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    typeof value.source === "object" &&
    value.source !== null
  ) {
    return {
      ...value,
      source: { ...value.source, stale: true },
    } as T;
  }

  return value;
}

function matchesAcademicYear(sourceValue: string, expectedApiValue: string) {
  try {
    return parseAcademicYear(sourceValue).apiValue === expectedApiValue;
  } catch {
    return false;
  }
}
