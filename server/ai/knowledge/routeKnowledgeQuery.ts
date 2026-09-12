import type { KnowledgeSearchFilters } from "./types";

const PRIVATE_DATA_PATTERN =
  /\b(my|someone(?:'s)?|another user(?:'s)?)\s+(?:(?:module|course|exam)\s+)?(?:grades?|results?|gpa|bill|balance|application|medical records?|messages?|course\s*reg(?:istration)? status)\b/i;
const CREDENTIAL_PATTERN =
  /\b(?:show|tell|find|retrieve|reveal|give|expose|store|save|send|what(?:'s| is))\b.{0,50}\b(?:passwords?|one[- ]time passwords?|otps?|mfa codes?|recovery codes?|api keys?|private keys?|access tokens?|jwt)\b/i;

export type KnowledgeQueryRoute =
  | { action: "refuse"; reason: "credentials" | "private_data" }
  | { action: "unsupported" }
  | { action: "retrieve"; filters: KnowledgeSearchFilters; highStakes: boolean };

export function routeKnowledgeQuery(input: string): KnowledgeQueryRoute {
  if (CREDENTIAL_PATTERN.test(input)) {
    return { action: "refuse", reason: "credentials" };
  }
  if (PRIVATE_DATA_PATTERN.test(input)) {
    return { action: "refuse", reason: "private_data" };
  }

  const normalized = input.toLowerCase();
  if (
    /\b(emergency|chest pain|difficulty breathing|severe bleeding|suicid(?:e|al)|self[- ]harm|physical danger|assault|sexual misconduct)\b/.test(
      normalized,
    )
  ) {
    return retrieve(["nus_uhc", "nus_osa"], true);
  }
  if (/\b(calendar|semester dates?|term dates?|reading week|exam period)\b/.test(normalized)) {
    return retrieve(["nus_registrar_calendar"], false, {
      academicYear: extractAcademicYear(input),
    });
  }
  if (/\b(shuttle|bus|transport|route|campus rider)\b/.test(normalized)) {
    return retrieve(["nus_transport"]);
  }
  if (/\b(librar(?:y|ies)|study space|opening hours?)\b/.test(normalized)) {
    return retrieve(["nus_libraries"]);
  }
  if (/\b(health|clinic|doctor|medical|vaccin|pharmacy|uhc)\b/.test(normalized)) {
    return retrieve(["nus_uhc"], true);
  }
  if (
    /\b(wifi|wi-fi|nusnet|vpn|password (?:reset|recovery)|account recovery|it care|cyber|phishing)\b/.test(
      normalized,
    ) || /\breset\b.{0,30}\bpassword\b/.test(normalized)
  ) {
    return retrieve(["nus_it"], true);
  }
  if (/\b(counselling|wellbeing|student affairs|osa|student support|harassment)\b/.test(normalized)) {
    return retrieve(["nus_osa"], true);
  }
  return { action: "unsupported" };
}

function retrieve(
  sourceIds?: string[],
  highStakes = false,
  filters: KnowledgeSearchFilters = {},
): KnowledgeQueryRoute {
  return {
    action: "retrieve",
    filters: { ...filters, sourceIds, trustTiers: ["T1"] },
    highStakes,
  };
}

function extractAcademicYear(input: string) {
  const match = input.match(
    /\b(?:AY\s*)?(20\d{2})\s*[/-]\s*(\d{2}|20\d{2})\b/i,
  );
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = match[2].length === 2
    ? Math.floor(start / 100) * 100 + Number(match[2])
    : Number(match[2]);
  return end === start + 1
    ? `AY${start}/${String(end).slice(-2)}`
    : undefined;
}
