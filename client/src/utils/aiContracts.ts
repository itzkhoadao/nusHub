import type { AiCitation, AiConversationSummary, AiMessage } from "./aiApi";

export function safeAiSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const official = host === "nus.edu.sg" || host.endsWith(".nus.edu.sg") ||
      host === "nusmods.com" || host === "api.nusmods.com";
    return official && url.protocol === "https:" && !url.username && !url.password &&
      (!url.port || url.port === "443") ? url.toString() : null;
  } catch { return null; }
}

export function isAiSummary(value: unknown): value is AiConversationSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && item.id.length > 0 && item.id.length <= 100 &&
    typeof item.title === "string" && item.title.length <= 80 &&
    typeof item.created_at === "string" && Number.isFinite(Date.parse(item.created_at)) &&
    typeof item.updated_at === "string" && Number.isFinite(Date.parse(item.updated_at));
}

export function isAiMessage(value: unknown): value is AiMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.content === "string" && item.content.length <= 32_768 &&
    ["user", "assistant"].includes(String(item.role)) &&
    ["processing", "completed", "failed", "interrupted"].includes(String(item.delivery_status)) &&
    (item.answer_status === null || ["answered", "not_verified", "refused", "needs_clarification"].includes(String(item.answer_status))) &&
    Array.isArray(item.citations) && item.citations.length <= 20 && item.citations.every(isAiCitation) &&
    Array.isArray(item.warnings) && item.warnings.length <= 20 && item.warnings.every(w => typeof w === "string" && w.length <= 2000) &&
    ["academic_year", "module_code", "follow_up_question", "error_code"].every(k => item[k] === null || (typeof item[k] === "string" && (item[k] as string).length <= 2000)) &&
    (item.feedback_rating === null || item.feedback_rating === "helpful" || item.feedback_rating === "unhelpful") &&
    typeof item.created_at === "string" && Number.isFinite(Date.parse(item.created_at)) &&
    typeof item.updated_at === "string" && Number.isFinite(Date.parse(item.updated_at));
}

export function isAiCitation(value: unknown): value is AiCitation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const citation = value as Record<string, unknown>;
  return ["sourceId", "documentVersionId", "title", "url", "retrievedAt"].every(key =>
    typeof citation[key] === "string" && (citation[key] as string).length > 0 && (citation[key] as string).length <= 2000) &&
    safeAiSourceUrl(citation.url as string) !== null &&
    Number.isFinite(Date.parse(citation.retrievedAt as string)) &&
    (citation.effectiveAt === null || (typeof citation.effectiveAt === "string" && Number.isFinite(Date.parse(citation.effectiveAt)))) &&
    Array.isArray(citation.claimIds) && citation.claimIds.length <= 100 &&
    citation.claimIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 200);
}
