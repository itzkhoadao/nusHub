import { apiUrl, mutationFetch } from "./api";
import { getAuthToken } from "./authStorage";

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
  return body.conversations;
}

export async function getAiConversation(conversationId: string) {
  const body = await getJson<{ conversation: AiConversation }>(
    `/api/ai/conversations/${encodeURIComponent(conversationId)}`,
  );
  return body.conversation;
}

export async function createAiConversation(title: string) {
  const response = await mutationFetch(apiUrl("/api/ai/conversations"), {
    body: JSON.stringify({ title }),
    headers: {
      ...authorizationHeaders(),
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = await readJson(response);
  if (!response.ok) throw responseError(response, body);
  return (body as { conversation: AiConversationSummary }).conversation;
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
    typeof payload.type !== "string" ||
    !STREAM_EVENT_TYPES.has(payload.type as AiStreamEventType) ||
    !isRecord(payload.data) ||
    eventName !== payload.type
  ) {
    throw new AiApiError("The assistant returned an invalid stream.", "AI_STREAM_INVALID", 502);
  }

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

  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      let boundary = buffer.search(/\r?\n\r?\n/);
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0] ?? "\n\n";
        buffer = buffer.slice(boundary + separator.length);
        const event = parseAiStreamBlock(block);
        if (event) onEvent(event);
        boundary = buffer.search(/\r?\n\r?\n/);
      }

      if (done) break;
    }

    if (buffer.trim()) {
      const event = parseAiStreamBlock(buffer);
      if (event) onEvent(event);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function streamAiMessage(input: {
  content: string;
  conversationId: string;
  onEvent: (event: AiStreamEvent) => void;
  signal: AbortSignal;
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
        "Idempotency-Key": crypto.randomUUID(),
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
