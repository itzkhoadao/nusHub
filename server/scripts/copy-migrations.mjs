// Copies SQL files into the compiled production directory

import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverDirectory = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(serverDirectory, "migrations");
const destinationDirectory = path.join(serverDirectory, "dist", "migrations");

await rm(destinationDirectory, { force: true, recursive: true }); // remove server/dist/migrations before copying
await mkdir(destinationDirectory, { recursive: true }); // make a new server/dist/migrations again
await cp(sourceDirectory, destinationDirectory, {
  force: true,
  recursive: true,
}); // copy to destination
