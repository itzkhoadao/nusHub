import { readFile, writeFile } from "node:fs/promises";
import { evaluatePhase5AgentGate } from "./phase5AgentGate";

async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0 || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`${name} requires a path`);
    return args[i + 1];
  };
  const [datasetText, reportText, reviewText, sqlText, apiText, refreshText] = await Promise.all(
    ["--dataset", "--report", "--reviews", "--sql", "--api", "--refresh"].map(flag => readFile(arg(flag), "utf8")));
  const result = evaluatePhase5AgentGate({ datasetText, reportText, reviewText, sqlText, apiText, refreshText });
  await writeFile(arg("--out"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(result, null, 2));
}
void main().catch(error => {
  console.error("Phase 5 agent gate blocked:", error instanceof Error ? error.message : "Invalid evidence");
  process.exitCode = 1;
});
