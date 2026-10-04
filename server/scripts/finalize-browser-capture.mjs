import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import console from "node:console";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const position = args.indexOf("--capture");
const value = position >= 0 ? args[position + 1] : undefined;
if (!value || value.startsWith("--")) {
  throw new Error("Usage: node scripts/finalize-browser-capture.mjs --capture path/to/capture-directory");
}
const directory = path.resolve(value);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const name of ["transport", "libraries", "student-support", "uhc", "it-contact"]) {
  const filename = path.join(directory, `${name}.metadata.json`);
  const metadata = JSON.parse(await readFile(filename, "utf8"));
  const html = await readFile(path.join(directory, `${name}.html`));
  const text = await readFile(path.join(directory, `${name}.txt`), "utf8");
  if (hash(html) !== metadata.sha256 || html.byteLength !== metadata.htmlBytes ||
      text.length !== metadata.textCharacters || metadata.ingestionApproved !== false) {
    throw new Error(`Original capture metadata does not match the saved page: ${name}`);
  }
  const complete = /<\/html>\s*$/.test(html.toString("utf8"));
  if (metadata.htmlComplete !== undefined && metadata.htmlComplete !== complete) {
    throw new Error(`Original HTML completeness changed: ${name}`);
  }
  const textSha256 = hash(Buffer.from(text));
  if (metadata.textSha256 && metadata.textSha256 !== textSha256) {
    throw new Error(`Finalized visible text hash changed: ${name}`);
  }
  metadata.textSha256 = textSha256;
  metadata.htmlComplete = complete;
  if (name === "uhc") {
    const answers = await readFile(path.join(directory, "uhc-all-answers.json"));
    const faqSha256 = hash(answers);
    if (metadata.faqSha256 && metadata.faqSha256 !== faqSha256) {
      throw new Error("Finalized UHC FAQ hash changed");
    }
    metadata.faqSha256 = faqSha256;
  }
  await writeFile(filename, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify({ name, htmlComplete: complete, textCharacters: text.length }));
}
