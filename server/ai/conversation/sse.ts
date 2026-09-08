import type { Response } from "express";
import type { GroundedAnswer } from "../domain/types";

export const AI_STREAM_VERSION = 1;

export type AiStreamEventType =
  | "response.started"
  | "response.text.delta"
  | "response.citation"
  | "response.warning"
  | "response.completed"
  | "response.failed";

export function initializeEventStream(res: Response) {
  res.status(200);
  res.set({
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
}

export function writeEvent(
  res: Response,
  requestId: string,
  type: AiStreamEventType,
  data: Record<string, unknown>,
) {
  if (res.destroyed || res.writableEnded) return false;
  return res.write(
    `event: ${type}\ndata: ${JSON.stringify({ data, request_id: requestId, type, version: AI_STREAM_VERSION })}\n\n`,
  );
}

export async function streamAnswerEvents(input: {
  academicYear: string | null;
  answer: GroundedAnswer;
  assistantMessageId: string;
  moduleCode: string | null;
  requestId: string;
  res: Response;
  signal?: AbortSignal;
}) {
  const { answer, requestId, res } = input;
  for (const delta of splitText(answer.answer)) {
    throwIfAborted(input.signal);
    writeEvent(res, requestId, "response.text.delta", { delta });
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  for (const citation of answer.citations) {
    writeEvent(res, requestId, "response.citation", { citation });
  }
  for (const warning of answer.warnings) {
    writeEvent(res, requestId, "response.warning", { warning });
  }
  writeEvent(res, requestId, "response.completed", {
    academic_year: input.academicYear,
    follow_up_question: answer.followUpQuestion ?? null,
    module_code: input.moduleCode,
    status: answer.status,
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("AI_STREAM_CANCELLED");
  }
}

export function splitText(value: string, maximumLength = 96) {
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > maximumLength) {
    let boundary = remaining.lastIndexOf(" ", maximumLength);
    if (boundary < maximumLength / 2) boundary = maximumLength;
    chunks.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
