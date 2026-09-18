import { readFileSync } from "node:fs";

/** Load a JSON fixture relative to this test file. */
export function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
}
