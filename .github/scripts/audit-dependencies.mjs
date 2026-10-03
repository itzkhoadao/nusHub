import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WAIVED_ADVISORY = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const WAIVER_EXPIRES_AT = "2026-11-03T00:00:00.000Z";
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const VALID_SEVERITIES = new Set(["info", "low", "moderate", "high", "critical"]);

export function evaluateAuditReports(full, production, now = new Date()) {
  const fullVulnerabilities = vulnerabilities(full);
  const productionVulnerabilities = vulnerabilities(production);
  const productionBlocking = blockingNames(productionVulnerabilities);
  if (productionBlocking.length) {
    return { passed: false, reason: `Production vulnerabilities: ${productionBlocking.join(", ")}` };
  }

  const fullBlocking = blockingNames(fullVulnerabilities);
  if (!fullBlocking.length) return { passed: true, waived: false };
  if (now.getTime() >= Date.parse(WAIVER_EXPIRES_AT)) {
    return { passed: false, reason: `Development waiver expired on ${WAIVER_EXPIRES_AT}` };
  }
  const waived = fullBlocking.every((name) =>
    derivesOnlyFromWaivedAdvisory(name, fullVulnerabilities, new Set()),
  );
  return waived
    ? { passed: true, waived: true, expiresAt: WAIVER_EXPIRES_AT }
    : { passed: false, reason: `Unwaived vulnerabilities: ${fullBlocking.join(", ")}` };
}

function vulnerabilities(report) {
  if (!report || typeof report !== "object" || report.error ||
      !report.vulnerabilities || typeof report.vulnerabilities !== "object" ||
      Array.isArray(report.vulnerabilities)) {
    throw new Error("npm audit returned an invalid report; the gate fails closed.");
  }
  const entries = Object.values(report.vulnerabilities);
  if (entries.some((entry) => !entry || !VALID_SEVERITIES.has(entry.severity))) {
    throw new Error("npm audit returned an invalid vulnerability; the gate fails closed.");
  }
  const reportedCounts = report.metadata?.vulnerabilities;
  if (reportedCounts) {
    for (const severity of BLOCKING_SEVERITIES) {
      const count = entries.filter((entry) => entry.severity === severity).length;
      if (reportedCounts[severity] !== count) {
        throw new Error("npm audit vulnerability counts disagree; the gate fails closed.");
      }
    }
  }
  return report.vulnerabilities;
}

function blockingNames(vulnerabilitiesByName) {
  return Object.entries(vulnerabilitiesByName)
    .filter(([, value]) => BLOCKING_SEVERITIES.has(value?.severity))
    .map(([name]) => name)
    .sort();
}

function derivesOnlyFromWaivedAdvisory(name, all, visiting) {
  const vulnerability = all[name];
  if (!vulnerability || !BLOCKING_SEVERITIES.has(vulnerability.severity) ||
      vulnerability.severity === "critical" || !Array.isArray(vulnerability.via) ||
      vulnerability.via.length === 0 || visiting.has(name)) {
    return false;
  }
  const next = new Set(visiting);
  next.add(name);
  return vulnerability.via.every((cause) => {
    if (typeof cause === "string") {
      return derivesOnlyFromWaivedAdvisory(cause, all, next);
    }
    return name === "braces" && cause?.name === "braces" &&
      cause.url === WAIVED_ADVISORY && cause.severity === "high" &&
      hasNoCompatibleFix(vulnerability.fixAvailable);
  });
}

function hasNoCompatibleFix(fixAvailable) {
  // npm 10 identifies a Tailwind 4 major migration as a fix; npm 11 reports
  // no fix for braces itself. Neither is a patch to the current toolchain.
  return fixAvailable === false || Boolean(
    fixAvailable && typeof fixAvailable === "object" &&
    fixAvailable.name === "tailwindcss" &&
    fixAvailable.isSemVerMajor === true &&
    /^4\./.test(fixAvailable.version),
  );
}

function runAudit(omitDevelopment) {
  if (!process.env.npm_execpath) {
    throw new Error("Run this gate through npm run audit:ci.");
  }
  const arguments_ = [process.env.npm_execpath, "audit", "--json", "--audit-level=high"];
  if (omitDevelopment) arguments_.push("--omit=dev");
  const result = spawnSync(process.execPath, arguments_, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new Error(`npm audit did not complete (${result.error?.code ?? result.status ?? "unknown"}).`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("npm audit did not return JSON; the gate fails closed.");
  }
}

function main() {
  const production = runAudit(true);
  const full = runAudit(false);
  const evaluation = evaluateAuditReports(full, production);
  if (!evaluation.passed) {
    console.error(`Dependency audit failed: ${evaluation.reason}`);
    process.exitCode = 1;
    return;
  }
  if (evaluation.waived) {
    console.warn(`Dependency audit passed with one dev-only waiver: ${WAIVED_ADVISORY} (expires ${evaluation.expiresAt}).`);
  } else {
    console.log("Dependency audit passed: no high or critical vulnerabilities.");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Dependency audit failed.");
    process.exitCode = 1;
  }
}
