import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { HumanProfileSchema } from "@odp/domain";
import type { HumanProfile } from "@odp/domain";

/** Loads validated HumanProfile fixtures from a directory (P0: fixture-backed). */
export function loadHumanProfiles(dir: string): HumanProfile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => HumanProfileSchema.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))));
}
