import { describe, expect, it } from "vitest";
import { safeAiSourceUrl } from "./aiContracts";
import { consumeAiEventStream, parseAiStreamBlock } from "./aiApi";

function event(type: string, data: object, id = "r1") {
  return `event: ${type}\ndata: ${JSON.stringify({ type, data, request_id: id, version: 1 })}\n\n`;
}
function stream(value: string, cancel?: () => void) {
  return new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(value)); controller.close();
  }, cancel });
}
const start = event("response.started", { message_id: "m1" });
const end = event("response.completed", { status: "answered" });
describe("assistant trust boundaries", () => {
  it("allows only official HTTPS citation destinations", () => {
    expect(safeAiSourceUrl("https://nus.edu.sg/registrar/")).toBeTruthy();
    expect(safeAiSourceUrl("https://api.nusmods.com/v2/2026-2027/modules/CS2030S.json")).toBeTruthy();
    for (const url of ["javascript:alert(1)", "https://nus.edu.sg.evil.com", "https://evilnus.edu.sg", "http://nus.edu.sg", "https://user:pass@nus.edu.sg", "https://nus.edu.sg:444", "https://evil.com/nus.edu.sg"]) {
      expect(safeAiSourceUrl(url)).toBeNull();
    }
  });
  it("rejects malformed deltas and terminal states", () => {
    expect(() => parseAiStreamBlock(event("response.text.delta", { delta: {} }))).toThrow();
    expect(() => parseAiStreamBlock(event("response.completed", { status: "trusted" }))).toThrow();
  });
  it("requires a complete, ordered stream with a consistent request identity", async () => {
    for (const value of [start, end + start, start + start + end,
      start + event("response.text.delta", { delta: "x" }, "other") + end,
      start + end + event("response.text.delta", { delta: "late" })]) {
      await expect(consumeAiEventStream(stream(value), () => undefined)).rejects.toThrow();
    }
  });
  it("bounds both an unfinished event and cumulative answer size", async () => {
    await expect(consumeAiEventStream(stream("data: " + "x".repeat(65_537)), () => undefined)).rejects.toThrow();
    await expect(consumeAiEventStream(stream(start + Array(4).fill(event("response.text.delta", { delta: "x".repeat(10_000) })).join("") + end), () => undefined)).rejects.toThrow();
  });
  it("cancels the source reader if a consumer rejects an event", async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(start)); },
      cancel() { cancelled = true; },
    });
    await expect(consumeAiEventStream(source, () => { throw new Error("Consumer rejected"); })).rejects.toThrow("Consumer rejected");
    expect(cancelled).toBe(true);
  });
});
