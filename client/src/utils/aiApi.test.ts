import { describe, expect, it } from "vitest";
import {
  AiApiError,
  consumeAiEventStream,
  parseAiStreamBlock,
  type AiStreamEvent,
} from "./aiApi";

const encoder = new TextEncoder();

function chunkedStream(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("AI event stream parsing", () => {
  it("reassembles split CRLF events and preserves typed data", async () => {
    const events: AiStreamEvent[] = [];
    const stream = chunkedStream([
      "event: response.started\r\ndata: {\"data\":{\"message_id\":\"m1\"},",
      "\"request_id\":\"r1\",\"type\":\"response.started\",\"version\":1}\r\n\r\n",
      "event: response.text.delta\ndata: {\"data\":{\"delta\":\"Hello\"},\"request_id\":\"r1\",",
      "\"type\":\"response.text.delta\",\"version\":1}\n\n",
    ]);

    await consumeAiEventStream(stream, (event) => events.push(event));

    expect(events).toHaveLength(2);
    expect(events[0].data.message_id).toBe("m1");
    expect(events[1].data.delta).toBe("Hello");
  });

  it("ignores SSE comments and rejects mismatched event envelopes", () => {
    expect(parseAiStreamBlock(": keep-alive")).toBeNull();
    expect(() =>
      parseAiStreamBlock(
        'event: response.completed\ndata: {"data":{},"request_id":"r1","type":"response.failed","version":1}',
      ),
    ).toThrow(AiApiError);
    expect(() =>
      parseAiStreamBlock(
        'data: {"data":{},"request_id":"r1","type":"response.completed","version":1}',
      ),
    ).toThrow(AiApiError);
  });

  it("rejects unknown protocol versions instead of guessing", () => {
    expect(() =>
      parseAiStreamBlock(
        'event: response.started\ndata: {"data":{},"request_id":"r1","type":"response.started","version":2}',
      ),
    ).toThrowError(/invalid stream/i);
  });
});
