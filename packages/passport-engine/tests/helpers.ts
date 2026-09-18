import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURES_DIR = fileURLToPath(new URL("../fixtures", import.meta.url));

export const DISCOVERY_DIR = path.join(FIXTURES_DIR, "discovery");
export const EVIDENCE_DIR = path.join(FIXTURES_DIR, "evidence");
export const EXPECTED_DIR = path.join(FIXTURES_DIR, "expected");

export function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, rel), "utf8"));
}
