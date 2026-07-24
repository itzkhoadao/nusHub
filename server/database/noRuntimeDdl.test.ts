// This file scans routes/ and utils/ folders and fails if detects SQL that changes the database schema
// such as CREATE TABLE, ALTER TABLE, CREATE INDEX (should only appear in migration files)

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

// detect schema-changing SQL
const DDL_PATTERN =
  /\b(?:ALTER\s+TABLE|CREATE\s+(?:UNIQUE\s+)?INDEX|CREATE\s+TABLE|DROP\s+(?:INDEX|TABLE))\b/i;

// find all TS files in project folder
async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return typescriptFiles(entryPath);
      }

      return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
    }),
  );

  return nestedFiles.flat();
}

test("request routes and runtime utilities contain no schema-changing SQL", async () => {
  const serverDirectory = path.resolve(__dirname, "..");
  const files = (
    await Promise.all(
      ["routes", "utils"].map((directory) =>
        typescriptFiles(path.join(serverDirectory, directory)),
      ),
    )
  ).flat();
  const violations: string[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");

    if (DDL_PATTERN.test(source)) {
      violations.push(path.relative(serverDirectory, file));
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Schema-changing SQL belongs in migrations, not: ${violations.join(", ")}`,
  );
});
