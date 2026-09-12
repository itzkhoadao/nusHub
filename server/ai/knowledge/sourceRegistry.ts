import { sourceRegistrySchema, type KnowledgeSource } from "./types";

export const KNOWLEDGE_SOURCE_REGISTRY_VERSION = "2026-07-29.phase5.v1";

const registry = sourceRegistrySchema.parse({
  version: KNOWLEDGE_SOURCE_REGISTRY_VERSION,
  sources: [
    {
      allowedDomains: ["nus.edu.sg", "www.nus.edu.sg"],
      baseUrl: "https://www.nus.edu.sg/registrar/calendar",
      contentTypes: ["text/html", "application/pdf"],
      enabled: true,
      highStakes: false,
      id: "nus_registrar_calendar",
      maxStalenessHours: 168,
      name: "NUS Registrar Academic Calendar",
      owner: "Office of the University Registrar",
      requiredMetadata: ["academic_year", "effective_at"],
      trustTier: "T1",
    },
    {
      allowedDomains: ["uci.nus.edu.sg"],
      baseUrl:
        "https://uci.nus.edu.sg/campus-life/campus-services/transportation/internal-shuttle-bus/",
      contentTypes: ["text/html", "application/pdf"],
      enabled: true,
      highStakes: false,
      id: "nus_transport",
      maxStalenessHours: 24,
      name: "NUS Internal Shuttle Bus",
      owner: "University Campus Infrastructure",
      requiredMetadata: ["network_effective_at"],
      trustTier: "T1",
    },
    {
      allowedDomains: ["nus.edu.sg", "www.nus.edu.sg"],
      baseUrl: "https://nus.edu.sg/nuslibraries/",
      contentTypes: ["text/html"],
      enabled: true,
      highStakes: false,
      id: "nus_libraries",
      maxStalenessHours: 24,
      name: "NUS Libraries",
      owner: "NUS Libraries",
      requiredMetadata: ["page_type"],
      trustTier: "T1",
    },
    {
      allowedDomains: ["osa.nus.edu.sg"],
      baseUrl: "https://osa.nus.edu.sg/",
      contentTypes: ["text/html", "application/pdf"],
      enabled: true,
      highStakes: true,
      id: "nus_osa",
      maxStalenessHours: 24,
      name: "NUS Office of Student Affairs",
      owner: "Office of Student Affairs",
      requiredMetadata: ["service_area"],
      trustTier: "T1",
    },
    {
      allowedDomains: ["nus.edu.sg", "www.nus.edu.sg"],
      baseUrl: "https://nus.edu.sg/uhc/",
      contentTypes: ["text/html", "application/pdf"],
      enabled: true,
      highStakes: true,
      id: "nus_uhc",
      maxStalenessHours: 24,
      name: "NUS University Health Centre",
      owner: "University Health Centre",
      requiredMetadata: ["service_area"],
      trustTier: "T1",
    },
    {
      allowedDomains: ["nusit.nus.edu.sg"],
      baseUrl: "https://nusit.nus.edu.sg/",
      contentTypes: ["text/html"],
      enabled: true,
      highStakes: true,
      id: "nus_it",
      maxStalenessHours: 24,
      name: "NUS Information Technology",
      owner: "NUS IT",
      requiredMetadata: ["service_area"],
      trustTier: "T1",
    },
  ],
});

const sourceById = new Map(registry.sources.map((source) => [source.id, source]));

export function getKnowledgeSource(sourceId: string): KnowledgeSource {
  const source = sourceById.get(sourceId);
  if (!source?.enabled) {
    throw new KnowledgeSourcePolicyError(
      "SOURCE_NOT_ALLOWLISTED",
      "The requested knowledge source is not enabled in the registry.",
    );
  }
  return source;
}

export function listKnowledgeSources() {
  return registry.sources.slice();
}

export class KnowledgeSourcePolicyError extends Error {
  constructor(
    readonly code:
      | "SOURCE_CONTENT_TYPE_REJECTED"
      | "SOURCE_DOCUMENT_EMPTY"
      | "SOURCE_FETCH_FAILED"
      | "SOURCE_METADATA_INVALID"
      | "SOURCE_NOT_ALLOWLISTED"
      | "SOURCE_RESPONSE_TOO_LARGE"
      | "SOURCE_URL_REJECTED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "KnowledgeSourcePolicyError";
  }
}
