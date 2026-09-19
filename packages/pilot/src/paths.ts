import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const PILOT_PACKAGE_ROOT = path.resolve(HERE, "..");
export const PILOT_FIXTURES = path.join(PILOT_PACKAGE_ROOT, "fixtures");
export const REPO_ROOT = path.resolve(PILOT_PACKAGE_ROOT, "../..");

/**
 * Runtime data for intakes + generic runs.
 *   ODP_PILOT_DIR  >  ${ODP_DATA_DIR}/pilot  >  <repo>/.odp/pilot
 */
export function getPilotDataDir(override?: string): string {
  if (override !== undefined && override.length > 0) return path.resolve(override);
  if (process.env.ODP_PILOT_DIR) return path.resolve(process.env.ODP_PILOT_DIR);
  if (process.env.ODP_DATA_DIR) return path.resolve(process.env.ODP_DATA_DIR, "pilot");
  return path.join(REPO_ROOT, ".odp", "pilot");
}

export function humansDir(dataDir: string): string {
  return path.join(dataDir, "humans");
}

export function consentsDir(dataDir: string): string {
  return path.join(dataDir, "consents");
}

export function intentsDir(dataDir: string): string {
  return path.join(dataDir, "intents");
}

export function runsDir(dataDir: string): string {
  return path.join(dataDir, "runs");
}
