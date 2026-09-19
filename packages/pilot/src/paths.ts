import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const PILOT_PACKAGE_ROOT = path.resolve(HERE, "..");
export const PILOT_FIXTURES = path.join(PILOT_PACKAGE_ROOT, "fixtures");
export const REPO_ROOT = path.resolve(PILOT_PACKAGE_ROOT, "../..");

/** Writable default on Vercel / other read-only deploy filesystems. */
export const EPHEMERAL_PILOT_DATA_DIR = path.join(tmpdir(), "odp-pilot");

export function isEphemeralDeployFs(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

/**
 * Runtime data for intakes + generic runs.
 *   override
 *   > ODP_PILOT_DATA_DIR
 *   > ODP_PILOT_DIR
 *   > ${ODP_DATA_DIR}/pilot
 *   > /tmp/odp-pilot when VERCEL=1 (serverless FS is read-only except /tmp)
 *   > <repo>/.odp/pilot
 *
 * On Vercel the default is ephemeral: intakes do not survive new instances.
 */
export function getPilotDataDir(override?: string): string {
  if (override !== undefined && override.length > 0) return path.resolve(override);
  const named = process.env.ODP_PILOT_DATA_DIR?.trim() || process.env.ODP_PILOT_DIR?.trim();
  if (named) return path.resolve(named);
  if (process.env.ODP_DATA_DIR) return path.resolve(process.env.ODP_DATA_DIR, "pilot");
  if (isEphemeralDeployFs()) return EPHEMERAL_PILOT_DATA_DIR;
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
