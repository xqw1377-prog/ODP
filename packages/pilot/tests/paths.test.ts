import { describe, it, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import path from "node:path";
import { tmpdir } from "node:os";
import { EPHEMERAL_PILOT_DATA_DIR, getPilotDataDir, isEphemeralDeployFs, REPO_ROOT } from "../src/paths.js";

const KEYS = ["ODP_PILOT_DATA_DIR", "ODP_PILOT_DIR", "ODP_DATA_DIR", "VERCEL"] as const;

function snapshotEnv(): Record<(typeof KEYS)[number], string | undefined> {
  return {
    ODP_PILOT_DATA_DIR: process.env.ODP_PILOT_DATA_DIR,
    ODP_PILOT_DIR: process.env.ODP_PILOT_DIR,
    ODP_DATA_DIR: process.env.ODP_DATA_DIR,
    VERCEL: process.env.VERCEL,
  };
}

function restoreEnv(prev: Record<(typeof KEYS)[number], string | undefined>): void {
  for (const key of KEYS) {
    if (prev[key] === undefined) delete process.env[key];
    else process.env[key] = prev[key];
  }
}

describe("getPilotDataDir", { concurrency: false }, () => {
  const prev = snapshotEnv();
  afterEach(() => restoreEnv(prev));

  it("prefers ODP_PILOT_DATA_DIR over ODP_PILOT_DIR and Vercel /tmp", () => {
    process.env.ODP_PILOT_DATA_DIR = "/tmp/odp-named";
    process.env.ODP_PILOT_DIR = "/tmp/odp-legacy";
    process.env.VERCEL = "1";
    assert.equal(getPilotDataDir(), path.resolve("/tmp/odp-named"));
  });

  it("keeps ODP_PILOT_DIR as the existing alias", () => {
    delete process.env.ODP_PILOT_DATA_DIR;
    process.env.ODP_PILOT_DIR = "/tmp/odp-legacy";
    assert.equal(getPilotDataDir(), path.resolve("/tmp/odp-legacy"));
  });

  it("uses /tmp/odp-pilot on Vercel when no env override is set", () => {
    delete process.env.ODP_PILOT_DATA_DIR;
    delete process.env.ODP_PILOT_DIR;
    delete process.env.ODP_DATA_DIR;
    process.env.VERCEL = "1";
    assert.equal(isEphemeralDeployFs(), true);
    assert.equal(getPilotDataDir(), EPHEMERAL_PILOT_DATA_DIR);
    assert.ok(getPilotDataDir().startsWith(tmpdir()));
  });

  it("stays on the repo .odp/pilot path for local runs", () => {
    delete process.env.ODP_PILOT_DATA_DIR;
    delete process.env.ODP_PILOT_DIR;
    delete process.env.ODP_DATA_DIR;
    delete process.env.VERCEL;
    assert.equal(isEphemeralDeployFs(), false);
    assert.equal(getPilotDataDir(), path.join(REPO_ROOT, ".odp", "pilot"));
  });
});
