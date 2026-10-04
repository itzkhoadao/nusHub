// Browser acceptance checks use explicit API fixtures, never live user accounts.
// Start Vite locally, then run with an installed Playwright module.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.ASSISTANT_PREVIEW_URL || "http://127.0.0.1:5178";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Browser fixtures are restricted to loopback previews");
const output = path.resolve("evaluation-results/assistant-ui");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
const id = "11111111-1111-4111-8111-111111111111";
const assistantId = "22222222-2222-4222-8222-222222222222";
const stamp = "2026-10-04T00:00:00.000Z";
const summary = { id, title: "Reading week", created_at: stamp, updated_at: stamp };
const citation = { claimIds: ["knowledge_chunk:9"], documentVersionId: "fixture-version", sourceId: "nus_registrar_calendar",
  title: "NUS Academic Calendar AY2026/27", url: "https://nus.edu.sg/registrar/docs/default-source/calendar/ay2026-2027.pdf",
  retrievedAt: stamp, effectiveAt: "2026-07-30T00:00:00.000Z" };
const makeMessage = (role, content, messageId) => ({ id: messageId, role, content, created_at: stamp, updated_at: stamp,
  delivery_status: "completed", answer_status: role === "assistant" ? "answered" : null, citations: role === "assistant" ? [citation] : [],
  warnings: [], error_code: null, feedback_rating: null, academic_year: "AY2026/27", module_code: null, follow_up_question: null });
let messages = [];
let created = false;
let requests = 0;
let stall = false;
let createDelay = false;
let releaseCreation;
const errors = [];
await context.addInitScript(() => {
  sessionStorage.setItem("token", "browser-fixture-only");
  sessionStorage.setItem("user", JSON.stringify({ id: "fixture-user", username: "Intern", email: "fixture@example.test" }));
});
if (context.routeWebSocket) await context.routeWebSocket("**", socket => socket.close());
await context.route("**/*", async route => {
  const req = route.request();
  const url = new URL(req.url());
  if (!url.pathname.startsWith("/api/")) {
    if (url.origin === new URL(base).origin) return route.continue();
    return route.abort();
  }
  const fulfill = value => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
  const p = url.pathname;
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: {
    "Access-Control-Allow-Origin": new URL(base).origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key, Accept",
  } });
  if (p === "/api/users/me") return fulfill({ user: { id: "fixture-user", username: "Intern", email: "fixture@example.test" } });
  if (p === "/api/notifications") return fulfill({ notifications: [], unread_count: 0 });
  if (p === "/api/conversations") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  if (p === "/api/ai/health") return fulfill({ enabled: true, status: "configured", model: "fixture-model", provider: "gemini" });
  if (p === "/api/ai/conversations" && req.method() === "GET") return fulfill({ conversations: created ? [summary] : [] });
  if (p === "/api/ai/conversations" && req.method() === "POST") {
    if (createDelay) await new Promise(resolve => { releaseCreation = resolve; });
    created = true;
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ conversation: summary }) }).catch(() => undefined);
  }
  if (p.endsWith("/messages") && req.method() === "POST") {
    requests++;
    if (stall) { await new Promise(resolve => setTimeout(resolve, 1200)); return route.abort().catch(() => undefined); }
    const content = req.postDataJSON().content;
    const answer = "Regular Semester 1 reading week runs from 14 to 20 November 2026.";
    messages = [makeMessage("user", content, "33333333-3333-4333-8333-333333333333"), makeMessage("assistant", answer, assistantId)];
    const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, data, version: 1, request_id: "fixture-request" })}\n\n`;
    return route.fulfill({ status: 200, contentType: "text/event-stream", body:
      event("response.started", { message_id: assistantId, user_message_id: messages[0].id }) +
      event("response.text.delta", { delta: answer }) + event("response.citation", { citation }) +
      event("response.completed", { status: "answered", academic_year: "AY2026/27", module_code: null, follow_up_question: null }) });
  }
  if (p.endsWith("/evidence")) return fulfill({ passages: [{ claimId: "knowledge_chunk:9", content: "READING WEEK\n14 Nov 2026 – 20 Nov 2026",
    documentVersionId: citation.documentVersionId, sourceId: citation.sourceId, title: citation.title, url: citation.url }] });
  if (p.endsWith("/feedback")) return fulfill({ rating: req.postDataJSON().rating });
  if (p === `/api/ai/conversations/${id}`) {
    if (req.method() === "PATCH") { summary.title = req.postDataJSON().title; return fulfill({ conversation: summary }); }
    if (req.method() === "DELETE") { created = false; messages = []; return route.fulfill({ status: 204 }); }
    return fulfill({ conversation: { ...summary, messages } });
  }
  return fulfill({});
});
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
const checks = {};
try {
  await page.goto(base + "/assistant");
  await page.getByRole("heading", { name: "What’s on your mind?" }).waitFor();
  await page.screenshot({ path: path.join(output, "desktop-welcome.png"), fullPage: true });
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: /Find your breathing room/ }).click();
  const composer = page.getByRole("textbox", { name: "Ask a NUS question" });
  assert.match(await composer.inputValue(), /regular Semester 1/);
  await composer.press("Shift+Enter");
  assert.ok((await composer.inputValue()).includes("\n"));
  await composer.press("Enter");
  await page.getByText("Regular Semester 1 reading week runs from 14 to 20 November 2026.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Send", exact: true }).waitFor();
  await page.locator(".ai-sources summary").click();
  await page.locator(".assistant-evidence-passage").waitFor();
  assert.match(await page.locator(".assistant-evidence-passage").innerText(), /14 Nov 2026/);
  checks.sendAndEvidence = true;
  assert.equal(requests, 1);
  await page.getByRole("button", { name: "Mark answer as helpful" }).click();
  assert.equal(await page.getByRole("button", { name: "Mark answer as helpful" }).getAttribute("aria-pressed"), "true");
  checks.feedback = true;
  await page.getByRole("button", { name: "Copy answer and sources" }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /14 to 20 November 2026/);
  checks.copyWithSources = true;
  await page.getByRole("button", { name: "Rename conversation" }).click();
  await page.getByLabel("Conversation name").fill("Semester planning");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await page.getByRole("heading", { name: "Semester planning", exact: true }).waitFor();
  checks.rename = true;
  await page.getByRole("textbox", { name: "Search conversations" }).fill("not a match");
  await page.getByText("No matching conversations.", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Search conversations" }).fill("");
  checks.historySearch = true;
  await page.screenshot({ path: path.join(output, "desktop-answer.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const sendBox = await page.getByRole("button", { name: "Send", exact: true }).boundingBox();
  const navBox = await page.locator("nav.fixed.bottom-0").boundingBox();
  assert.ok(sendBox && navBox && sendBox.y + sendBox.height < navBox.y, "Mobile navigation must not cover Send");
  await page.getByRole("button", { name: "Toggle conversation history" }).click();
  await page.getByRole("textbox", { name: "Search conversations" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Toggle conversation history" }).click();
  checks.mobileHistoryAndNoOverflow = true;
  await page.screenshot({ path: path.join(output, "mobile-answer.png"), fullPage: true });
  await composer.fill("Please check the NUS calendar.");
  stall = true;
  await composer.press("Enter");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByText("This response was stopped before it finished.", { exact: true }).waitFor();
  checks.stop = true;
  stall = false;
  await page.getByRole("button", { name: "Delete this conversation" }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Delete this conversation" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("heading", { name: "What’s on your mind?" }).waitFor();
  checks.deleteDialog = true;
  createDelay = true;
  await composer.fill("Check reading week in AY2026/27.");
  const countBefore = requests;
  const creationRequested = page.waitForRequest(req => new URL(req.url()).pathname === "/api/ai/conversations" && req.method() === "POST");
  await composer.press("Enter");
  await creationRequested;
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.waitForTimeout(100);
  assert.equal(requests, countBefore, "No message may start while creation is pending");
  releaseCreation();
  await page.getByRole("button", { name: "Send", exact: true }).waitFor();
  await page.waitForTimeout(600);
  assert.equal(requests, countBefore, "Stopping during creation must not launch a message request");
  checks.stopDuringCreation = true;
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "report.json"), JSON.stringify({ checkedAt: new Date().toISOString(), scope: "real browser; API fixtures; no production accounts or live model claims", checks, errors }, null, 2));
  console.log("Assistant browser acceptance passed", checks);
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  console.error("Browser acceptance failed", { page: await page.locator("body").innerText(), errors });
  throw error;
} finally { await browser.close(); }
