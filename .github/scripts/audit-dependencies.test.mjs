import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAuditReports } from "./audit-dependencies.mjs";

const beforeExpiry = new Date("2026-10-03T00:00:00.000Z");
const clean = { vulnerabilities: {} };

function bracesReport() {
  return {
    vulnerabilities: {
      braces: {
        severity: "high",
        fixAvailable: false,
        via: [{
          name: "braces",
          url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
          severity: "high",
        }],
      },
      micromatch: { severity: "high", via: ["braces"] },
      chokidar: { severity: "high", via: ["braces"] },
      "fast-glob": { severity: "high", via: ["micromatch"] },
      tailwindcss: { severity: "high", via: ["chokidar", "fast-glob", "micromatch"] },
    },
  };
}

test("passes a clean full and production audit", () => {
  assert.deepEqual(evaluateAuditReports(clean, clean, beforeExpiry), {
    passed: true,
    waived: false,
  });
});

test("waives only the known development dependency chain before expiration", () => {
  assert.deepEqual(evaluateAuditReports(bracesReport(), clean, beforeExpiry), {
    passed: true,
    waived: true,
    expiresAt: "2026-11-03T00:00:00.000Z",
  });
});

test("never waives a production vulnerability", () => {
  const report = bracesReport();
  assert.match(evaluateAuditReports(report, report, beforeExpiry).reason, /Production vulnerabilities/);
});

test("rejects additional advisories in a waived package", () => {
  const report = bracesReport();
  report.vulnerabilities.braces.via.push({
    name: "braces",
    url: "https://github.com/advisories/GHSA-new-advisory",
    severity: "high",
  });
  assert.equal(evaluateAuditReports(report, clean, beforeExpiry).passed, false);
});

test("rejects any other high or critical vulnerability", () => {
  const report = bracesReport();
  report.vulnerabilities.other = {
    severity: "critical",
    via: [{ name: "other", url: "https://github.com/advisories/GHSA-other", severity: "critical" }],
  };
  assert.equal(evaluateAuditReports(report, clean, beforeExpiry).passed, false);
});

test("fails after the waiver expiration", () => {
  assert.match(
    evaluateAuditReports(bracesReport(), clean, new Date("2026-11-03T00:00:00.000Z")).reason,
    /expired/,
  );
});

test("fails if upstream marks the advisory fixable", () => {
  const report = bracesReport();
  report.vulnerabilities.braces.fixAvailable = true;
  assert.equal(evaluateAuditReports(report, clean, beforeExpiry).passed, false);
});

test("fails closed on malformed npm audit output", () => {
  assert.throws(() => evaluateAuditReports({ error: "registry unavailable" }, clean), /invalid report/);
  assert.throws(
    () => evaluateAuditReports({ vulnerabilities: { suspicious: {} } }, clean),
    /invalid vulnerability/,
  );
  assert.throws(
    () => evaluateAuditReports({ vulnerabilities: {}, metadata: { vulnerabilities: { high: 1, critical: 0 } } }, clean),
    /counts disagree/,
  );
});
