import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { FetchedKnowledgeDocument, KnowledgeSource } from "./types";
import { KnowledgeSourcePolicyError } from "./sourceRegistry";

const CAPTURE_NAMES: Record<string, string> = {
  nus_transport: "transport",
  nus_libraries: "libraries",
  nus_osa: "student-support",
  nus_uhc: "uhc",
  nus_it: "it-contact",
};

const captureMetadataSchema = z.object({
  sourceUrl: z.url(),
  capturedAt: z.iso.datetime(),
  method: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  htmlBytes: z.number().int().positive(),
  textCharacters: z.number().int().positive(),
  textSha256: z.string().regex(/^[a-f0-9]{64}$/),
  faqSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  htmlComplete: z.boolean(),
  ingestionApproved: z.literal(false),
}).passthrough();

/** A staging-only delivery channel for pages observed in a user's Chrome tab. */
export class BrowserCaptureFetcher {
  constructor(
    private readonly directory: string,
    private readonly maxDocumentBytes: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async fetch(source: KnowledgeSource, inputUrl: string): Promise<FetchedKnowledgeDocument> {
    const name = CAPTURE_NAMES[source.id];
    if (!name || !source.contentTypes.includes("text/html")) {
      throw new KnowledgeSourcePolicyError("SOURCE_NOT_ALLOWLISTED", "No browser capture is configured for this source.");
    }
    const meta = captureMetadataSchema.parse(JSON.parse(await readFile(path.join(this.directory, `${name}.metadata.json`), "utf8")) as unknown);
    const requested = new URL(inputUrl);
    const captured = new URL(meta.sourceUrl);
    requested.hash = "";
    captured.hash = "";
    if (requested.toString() !== captured.toString() || captured.protocol !== "https:" ||
      captured.username || captured.password || (captured.port && captured.port !== "443") ||
      !source.allowedDomains.includes(captured.hostname.toLowerCase())) {
      throw new KnowledgeSourcePolicyError("SOURCE_URL_REJECTED", "Capture URL differs from the allowlisted manifest URL.");
    }
    const age = this.now().getTime() - Date.parse(meta.capturedAt);
    if (age < -300_000 || age > source.maxStalenessHours * 3_600_000) {
      throw new KnowledgeSourcePolicyError("SOURCE_APPROVAL_INVALID", "Browser capture is outside the source freshness window.");
    }
    const originalHtml = await readFile(path.join(this.directory, `${name}.html`));
    if (originalHtml.byteLength > this.maxDocumentBytes || originalHtml.byteLength !== meta.htmlBytes) {
      throw new KnowledgeSourcePolicyError("SOURCE_RESPONSE_TOO_LARGE", "Capture size differs from its metadata or exceeds the limit.");
    }
    const hash = createHash("sha256").update(originalHtml).digest("hex");
    if (hash !== meta.sha256) {
      throw new KnowledgeSourcePolicyError("SOURCE_APPROVAL_CHANGED", "Capture HTML hash differs from its metadata.");
    }
    if (meta.htmlComplete !== /<\/html>\s*$/.test(originalHtml.toString("utf8"))) {
      throw new KnowledgeSourcePolicyError("SOURCE_APPROVAL_CHANGED", "Capture HTML completeness differs from its metadata.");
    }
    const visibleText = await readFile(path.join(this.directory, `${name}.txt`), "utf8");
    if (visibleText.length !== meta.textCharacters ||
      createHash("sha256").update(visibleText).digest("hex") !== meta.textSha256) {
      throw new KnowledgeSourcePolicyError("SOURCE_APPROVAL_CHANGED", "Captured visible text differs from its metadata.");
    }
    const content = name === "uhc"
      ? await faqContent(path.join(this.directory, "uhc-all-answers.json"), meta.faqSha256)
      : selectPageContent(name, visibleText);
    const bytes = Buffer.from(`<html><head><title>${escapeHtml(source.name)}</title></head><body><main><h1>${escapeHtml(source.name)}</h1>${content.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</main></body></html>`);
    if (bytes.byteLength > this.maxDocumentBytes) {
      throw new KnowledgeSourcePolicyError("SOURCE_RESPONSE_TOO_LARGE", "Normalized capture exceeds the source size limit.");
    }
    return {
      bytes,
      canonicalUrl: captured.toString(),
      contentType: "text/html",
      etag: null,
      fetchedAt: meta.capturedAt,
      lastModified: null,
    };
  }
}

function selectPageContent(name: string, visibleText: string) {
  const boundaries: Record<string, [string, string]> = {
    transport: ["NUS Internal Shuttle Bus (ISB) Services", "Corporate Admin\nCampus Planning"],
    libraries: ["Looking for Study Spaces Beyond Our Opening Hours?", "NUS Libraries\nCentral Library"],
    "student-support": ["Feeling low or overwhelmed", "Home\nWellness\n NUS Student Support Directory"],
    "it-contact": ["Contact Us\nIT Care", "NUS Information Technology | NUS IT Services"],
  };
  const [startMarker, endMarker] = boundaries[name];
  const start = visibleText.indexOf(startMarker);
  const end = visibleText.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new KnowledgeSourcePolicyError("SOURCE_DOCUMENT_EMPTY", "Capture page boundaries are missing or changed; inspect the source again.");
  }
  let selected = visibleText.slice(start, end);
  if (name === "student-support") {
    const advisors = selected.indexOf("List of SAU Advisors");
    const counselling = selected.indexOf("Counselling Support");
    const external = selected.indexOf("External Organisations", counselling);
    if (advisors < 0 || counselling < 0 || external < 0) {
      throw new KnowledgeSourcePolicyError("SOURCE_DOCUMENT_EMPTY", "Student support section boundaries are missing; inspect the source again.");
    }
    selected = `${selected.slice(0, advisors)}\n${selected.slice(counselling, external)}`;
  }
  const content = selected.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const anchors: Record<string, string[]> = {
    transport: ["ISB Service A", "ISB Service D", "ISB Service K", "ISB Service R", "5 Jan 2026"],
    libraries: ["Quiet Study Space, Level 2", "24/7 daily", "NUS card"],
    "student-support": ["University Counselling Services", "Lifeline NUS", "6516 7777"],
    "it-contact": ["IT Care (Level 6, Central Library Building)", "For Counter Walk-In Service"],
  };
  if (anchors[name].some((anchor) => !content.join("\n").includes(anchor))) {
    throw new KnowledgeSourcePolicyError("SOURCE_DOCUMENT_EMPTY", "Capture is missing an expected source section; inspect the source again.");
  }
  return content;
}

async function faqContent(filename: string, expectedHash?: string) {
  const raw = await readFile(filename, "utf8");
  if (!expectedHash || createHash("sha256").update(raw).digest("hex") !== expectedHash) {
    throw new KnowledgeSourcePolicyError("SOURCE_APPROVAL_CHANGED", "Captured FAQ answers differ from their metadata.");
  }
  const answers = z.array(z.object({
    question: z.string().min(1),
    text: z.string().min(1),
    html: z.string().min(1),
  }).passthrough()).min(30).parse(JSON.parse(raw) as unknown);
  if (new Set(answers.map((answer) => answer.question)).size !== answers.length ||
      !answers.some((answer) => /MyUHC|appointment/i.test(answer.question + answer.text))) {
    throw new KnowledgeSourcePolicyError("SOURCE_DOCUMENT_EMPTY", "FAQ capture is incomplete; inspect the source again.");
  }
  const appointmentQuestions = [
    "Can I walk-in for a medical consultation / Do I have to book an appointment?",
    "How can I schedule a specialist consultation?",
    "Do I need to schedule an appointment for vaccinations?",
    "Do I have to book an appointment for the medical examination?",
    "General",
    "Appointment",
  ];
  return appointmentQuestions.map((question) => {
    const answer = answers.find((item) => item.question === question);
    if (!answer) {
      throw new KnowledgeSourcePolicyError("SOURCE_DOCUMENT_EMPTY", `Required UHC appointment FAQ is missing: ${question}`);
    }
    let text = answer.text.replace(/\s+/g, " ").trim();
    if (question === "General") text = text.split(/2\. I can.t log in to MyUHC/i, 1)[0];
    if (question === "Appointment") text = text.split(/2\. I cannot find an available slot/i, 1)[0];
    if (text.length < 40) {
      throw new KnowledgeSourcePolicyError("SOURCE_DOCUMENT_EMPTY", `Required UHC appointment FAQ is incomplete: ${question}`);
    }
    if (question === "Appointment") {
      const match = answer.html.match(/href="(https:\/\/nusaqs\.aisoft\.sg\/eappt\/?)"/i);
      if (!match) throw new KnowledgeSourcePolicyError("SOURCE_DOCUMENT_EMPTY", "UHC appointment portal link is missing.");
      text += ` Official linked appointment portal: ${match[1]}`;
    }
    return `Question: ${question}\nAnswer: ${text}`;
  });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
