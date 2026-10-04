import type { KnowledgeSearchFilters } from "./types";

const PRIVATE_DATA_PATTERN =
  /\b(my|someone(?:'s)?|another user(?:'s)?)\s+(?:NUS\s+)?(?:(?:module|course|exam)\s+)?(?:grades?|results?|gpa|bill|balance|application|medical records?|health records?|messages?|course\s*reg(?:istration)? status)\b/i;
const CREDENTIAL_PATTERN =
  /\b(?:show|tell|find|retrieve|reveal|give|expose|store|save|send|what(?:'s| is))\b.{0,50}\b(?:passwords?|one[- ]time passwords?|otps?|mfa codes?|recovery codes?|api keys?|private keys?|access tokens?|jwt)\b/i;
const SELF_HARM_PATTERN =
  /\b(?:suicid(?:e|al)|self[- ]harm|(?:hurt|hurting|harm|harming|kill|killing)\s+(?:myself|yourself|himself|herself|themselves)|(?:end|take)\s+my\s+life|(?:don't|do not)\s+want\s+to\s+live|(?:want|wish)\s+to\s+die)\b/i;
const OTHER_URGENT_PATTERN =
  /\b(emergency|chest pain|difficulty breathing|severe bleeding|physical danger|assault|sexual misconduct)\b/i;

export type KnowledgeQueryRoute =
  | { action: "refuse"; reason: "credentials" | "private_data" | "unsafe_input" }
  | { action: "clarify"; question: string }
  | { action: "unsupported" }
  | { action: "retrieve"; filters: KnowledgeSearchFilters; highStakes: boolean };

export function routeKnowledgeQuery(input: string): KnowledgeQueryRoute {
  if (/\b(?:ignore|override|disregard)\b.{0,60}\b(?:instructions|system|rules|policy)\b|<\/?(?:system|tool)>|\b(?:forge|fabricate)\b.{0,40}\b(?:citations?|sources?)\b/i.test(input)) {
    return { action: "refuse", reason: "unsafe_input" };
  }
  if (CREDENTIAL_PATTERN.test(input)) {
    return { action: "refuse", reason: "credentials" };
  }
  if (PRIVATE_DATA_PATTERN.test(input)) {
    return { action: "refuse", reason: "private_data" };
  }

  const normalized = input.toLowerCase();
  if (isUrgentKnowledgeQuery(normalized)) {
    return retrieve(["nus_uhc", "nus_osa"], true);
  }
  if (/\b(calendar|semester dates?|term dates?|reading week|exam period|mini[- ]semester)\b|\bsemester\b.{0,30}\b(?:start|end|begin)\b/.test(normalized)) {
    const academicYear = extractAcademicYear(input);
    if (!academicYear) return { action: "clarify", question: "Which academic year do you mean? For example, AY2026/27." };
    return retrieve(["nus_registrar_calendar"], false, {
      academicYear,
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

export function isUrgentKnowledgeQuery(input: string) {
  return SELF_HARM_PATTERN.test(input) || OTHER_URGENT_PATTERN.test(input);
}

export function isSelfHarmKnowledgeQuery(input: string) {
  return SELF_HARM_PATTERN.test(input);
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
