import { apiUrl, mutationFetch } from "./api";
import { getAuthToken } from "./authStorage";
import { isAiCitation, isAiMessage, isAiSummary, safeAiSourceUrl } from "./aiContracts";

export type AiAvailability = {
  enabled: boolean;
  model: string;
  provider: "gemini";
  status: "configured" | "disabled";
};

export type AiConversationSummary = {
  created_at: string;
  id: string;
  title: string;
  updated_at: string;
};

export type AiCitation = {
  claimIds: string[];
  documentVersionId: string;
  effectiveAt: string | null;
  retrievedAt: string;
  sourceId: string;
  title: string;
  url: string;
};

export type AiEvidencePassage = {
  claimId: string; content: string; documentVersionId: string; sourceId: string; title: string; url: string;
};

export async function getAiMessageEvidence(messageId: string) {
  const body = await getJson<{ passages: AiEvidencePassage[] }>(`/api/ai/messages/${encodeURIComponent(messageId)}/evidence`);
  if (!Array.isArray(body.passages) || body.passages.length > 20 || body.passages.some(p =>
    !p || typeof p.content !== "string" || p.content.length > 10_000 || typeof p.claimId !== "string" ||
    typeof p.documentVersionId !== "string" || typeof p.sourceId !== "string" || typeof p.url !== "string" || !safeAiSourceUrl(p.url))) {
    throw new AiApiError("The source passages could not be loaded.", "AI_RESPONSE_INVALID", 502);
  }
  return body.passages;
}

export type AiMessage = {
  academic_year: string | null;
  answer_status:
    | "answered"
    | "needs_clarification"
    | "not_verified"
    | "refused"
    | null;
  citations: AiCitation[];
  content: string;
  created_at: string;
  delivery_status: "processing" | "completed" | "failed" | "interrupted";
  error_code: string | null;
  feedback_rating: "helpful" | "unhelpful" | null;
  follow_up_question: string | null;
  id: string;
  module_code: string | null;
  role: "user" | "assistant";
  updated_at: string;
  warnings: string[];
};

export type AiConversation = AiConversationSummary & {
  has_earlier_messages?: boolean;
  messages: AiMessage[];
};

export type AiStreamEventType =
  | "response.started"
  | "response.text.delta"
  | "response.citation"
  | "response.warning"
  | "response.completed"
  | "response.failed";

export type AiStreamEvent = {
  data: Record<string, unknown>;
  requestId: string;
  type: AiStreamEventType;
  version: 1;
};

export class AiApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AiApiError";
  }
}

function authorizationHeaders() {
  const token = getAuthToken();
  if (!token) {
    throw new AiApiError("Sign in to use the AI assistant.", "AUTH_REQUIRED", 401);
  }
  return { Authorization: `Bearer ${token}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => ({}));
  return isRecord(value) ? value : {};
}

function responseError(response: Response, body: Record<string, unknown>) {
  return new AiApiError(
    typeof body.error === "string" ? body.error : "The AI request could not be completed.",
    typeof body.code === "string" ? body.code : "AI_REQUEST_FAILED",
    response.status,
  );
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), { headers: authorizationHeaders() });
  const body = await readJson(response);
  if (!response.ok) throw responseError(response, body);
  return body as T;
}

export async function getAiAvailability(): Promise<AiAvailability> {
  const response = await fetch(apiUrl("/api/ai/health"), {
    headers: authorizationHeaders(),
  });
  const body = await readJson(response);

  if (typeof body.enabled !== "boolean" || typeof body.model !== "string" || body.provider !== "gemini" ||
    body.status !== (body.enabled ? "configured" : "disabled")) {
    if (!response.ok) throw responseError(response, body);
    throw new AiApiError("The assistant returned an invalid response.", "AI_RESPONSE_INVALID", 502);
  }
  if (response.status === 503 && body.status === "disabled") {
    return body as AiAvailability;
  }
  if (!response.ok) throw responseError(response, body);
  return body as AiAvailability;
}

export async function listAiConversations() {
  const body = await getJson<{ conversations: AiConversationSummary[] }>(
    "/api/ai/conversations",
  );
  if (!Array.isArray(body.conversations) || body.conversations.length > 100 || !body.conversations.every(isAiSummary)) {
    throw new AiApiError("Conversation history could not be loaded.", "AI_RESPONSE_INVALID", 502);
  }
  return body.conversations;
}

export async function getAiConversation(conversationId: string) {
  const body = await getJson<{ conversation: AiConversation }>(
    `/api/ai/conversations/${encodeURIComponent(conversationId)}`,
  );
  if (!isAiSummary(body.conversation) || !Array.isArray(body.conversation.messages) ||
      body.conversation.messages.length > 200 || !body.conversation.messages.every(isAiMessage)) {
    throw new AiApiError("This conversation could not be loaded.", "AI_RESPONSE_INVALID", 502);
  }
  return body.conversation;
}

export async function createAiConversation(title: string, signal?: AbortSignal) {
  const response = await mutationFetch(apiUrl("/api/ai/conversations"), {
    body: JSON.stringify({ title }),
    headers: {
      ...authorizationHeaders(),
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  const body = await readJson(response);
  if (!response.ok) throw responseError(response, body);
  if (!isAiSummary(body.conversation)) throw new AiApiError("The conversation could not be saved.", "AI_RESPONSE_INVALID", 502);
  return body.conversation;
}

export async function renameAiConversation(conversationId: string, title: string) {
  const response = await mutationFetch(apiUrl(`/api/ai/conversations/${encodeURIComponent(conversationId)}`), {
    body: JSON.stringify({ title }), headers: { ...authorizationHeaders(), "Content-Type": "application/json" }, method: "PATCH",
  });
  const body = await readJson(response);
  if (!response.ok) throw responseError(response, body);
  if (!isAiSummary(body.conversation)) throw new AiApiError("The conversation could not be saved.", "AI_RESPONSE_INVALID", 502);
  return body.conversation;
}

export async function deleteAiConversation(conversationId: string) {
  const response = await mutationFetch(
    apiUrl(`/api/ai/conversations/${encodeURIComponent(conversationId)}`),
    {
      headers: authorizationHeaders(),
      method: "DELETE",
    },
  );
  if (!response.ok) throw responseError(response, await readJson(response));
}

export async function submitAiFeedback(
  messageId: string,
  rating: "helpful" | "unhelpful",
) {
  const response = await mutationFetch(
    apiUrl(`/api/ai/messages/${encodeURIComponent(messageId)}/feedback`),
    {
      body: JSON.stringify({ rating }),
      headers: {
        ...authorizationHeaders(),
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  const body = await readJson(response);
  if (!response.ok) throw responseError(response, body);
  return rating;
}

const STREAM_EVENT_TYPES = new Set<AiStreamEventType>([
  "response.started",
  "response.text.delta",
  "response.citation",
  "response.warning",
  "response.completed",
  "response.failed",
]);

export function parseAiStreamBlock(block: string): AiStreamEvent | null {
  if (block.length > 65_536) throw new AiApiError("The assistant stream exceeded its safe limit.", "AI_STREAM_INVALID", 502);
  let eventName = "";
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventName = value;
    if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(dataLines.join("\n"));
  } catch {
    throw new AiApiError("The assistant returned an invalid stream.", "AI_STREAM_INVALID", 502);
  }

  if (
    !isRecord(payload) ||
    payload.version !== 1 ||
    typeof payload.request_id !== "string" ||
    !payload.request_id || payload.request_id.length > 100 ||
    typeof payload.type !== "string" ||
    !STREAM_EVENT_TYPES.has(payload.type as AiStreamEventType) ||
    !isRecord(payload.data) ||
    eventName !== payload.type
  ) {
    throw new AiApiError("The assistant returned an invalid stream.", "AI_STREAM_INVALID", 502);
  }

  const data = payload.data;
  const type = payload.type;
  const valid = type === "response.started" ? typeof data.message_id === "string" && data.message_id.length > 0 :
    type === "response.text.delta" ? typeof data.delta === "string" && data.delta.length <= 16_384 :
    type === "response.citation" ? isAiCitation(data.citation) :
    type === "response.warning" ? typeof data.warning === "string" && data.warning.length <= 2000 :
    type === "response.completed" ? typeof data.status === "string" && ["answered", "needs_clarification", "not_verified", "refused"].includes(data.status) :
    type === "response.failed" ? typeof data.code === "string" && data.code.length <= 100 && typeof data.message === "string" && data.message.length <= 2000 : false;
  if (!valid) throw new AiApiError("The assistant returned an invalid stream.", "AI_STREAM_INVALID", 502);

  return {
    data: payload.data,
    requestId: payload.request_id,
    type: payload.type as AiStreamEventType,
    version: 1,
  };
}

export async function consumeAiEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: AiStreamEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let requestId: string | null = null;
  let terminal = false;
  let textLength = 0;
  let eventCount = 0;
  let bytes = 0;
  const deliver = (event: AiStreamEvent) => {
    if (terminal || ++eventCount > 1000 || (requestId !== null && event.requestId !== requestId) ||
      (requestId === null && event.type !== "response.started") ||
      (requestId !== null && event.type === "response.started")) {
      throw new AiApiError("The assistant returned an invalid event sequence.", "AI_STREAM_INVALID", 502);
    }
    requestId = event.requestId;
    if (event.type === "response.text.delta") textLength += (event.data.delta as string).length;
    if (textLength > 32_768) throw new AiApiError("The answer exceeded its safe limit.", "AI_STREAM_INVALID", 502);
    terminal = event.type === "response.completed" || event.type === "response.failed";
    onEvent(event);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      bytes += value?.byteLength ?? 0;
      if (bytes > 2_000_000) throw new AiApiError("The assistant stream exceeded its safe limit.", "AI_STREAM_INVALID", 502);
      buffer += decoder.decode(value, { stream: !done });

      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? "\n\n";
        buffer = buffer.slice(boundary + separator.length);
        const event = parseAiStreamBlock(block);
        if (event) deliver(event);
        boundary = buffer.search(/\r?\n\r?\n/);
      }
      if (buffer.length > 65_536) throw new AiApiError("The assistant stream exceeded its safe limit.", "AI_STREAM_INVALID", 502);

      if (done) break;
    }

    if (buffer.trim()) {
      const event = parseAiStreamBlock(buffer);
      if (event) deliver(event);
    }
    if (!terminal) throw new AiApiError("The answer ended before it was complete.", "AI_STREAM_INCOMPLETE", 502);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function streamAiMessage(input: {
  content: string;
  conversationId: string;
  onEvent: (event: AiStreamEvent) => void;
  signal: AbortSignal;
  idempotencyKey?: string;
}) {
  const response = await fetch(
    apiUrl(
      `/api/ai/conversations/${encodeURIComponent(input.conversationId)}/messages`,
    ),
    {
      body: JSON.stringify({ content: input.content }),
      headers: {
        Accept: "text/event-stream",
        ...authorizationHeaders(),
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey ?? crypto.randomUUID(),
      },
      method: "POST",
      signal: input.signal,
    },
  );

  if (!response.ok) throw responseError(response, await readJson(response));
  if (!response.headers.get("Content-Type")?.includes("text/event-stream")) {
    throw new AiApiError("The assistant returned an invalid stream.", "AI_STREAM_INVALID", 502);
  }
  if (!response.body) {
    throw new AiApiError("The assistant stream was empty.", "AI_STREAM_EMPTY", 502);
  }

  await consumeAiEventStream(response.body, input.onEvent);
}
