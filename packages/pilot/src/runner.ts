import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { allocationLeaf, buildMerkleTree, createDistribution, merkleProof } from "@odp/domain";
import type { Allocation, HumanProfile, MatchResult, ProjectPassport } from "@odp/domain";
import { buildAllocations, buildManifest, manifestHash, P0_ALLOCATION_POLICY } from "@odp/distribution-engine";
import { matchProject } from "@odp/matching-engine";
import type { ProjectMatchIntent } from "@odp/matching-engine";
import { intakeProjectFromFile } from "./project-intake.js";
import { persistProjectIntake, loadOptInHumans, loadPersistedIntent, openPassportEngine } from "./persist.js";
import { getPilotDataDir, runsDir } from "./paths.js";

export interface PilotRunOptions {
  dataDir?: string;
  /** Path to a project brief. When set, intake runs first (generic, not Aurora). */
  briefFile?: string;
  /** Required when briefFile is omitted. */
  projectId?: string;
  totalAmount?: string;
  tokenMint?: string;
}

export interface PilotDistributionInputs {
  distribution_id: string;
  project_id: string;
  passport_status: ProjectPassport["status"];
  intent: ProjectMatchIntent;
  matches: MatchResult[];
  humans: HumanProfile[];
  allocations: Allocation[];
  merkle: {
    root: string;
    proofs: Record<string, string[]>;
  };
  manifest: ReturnType<typeof buildManifest>;
  manifest_hash: string;
  policy: { topN: number; note: string };
}

export interface PilotRunResult {
  passport: ProjectPassport;
  inputs: PilotDistributionInputs;
  outputFile: string;
}

function freshDistributionId(projectId: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const slug = projectId.replace(/^prj_/, "");
  return `dst_${slug}_${stamp}`;
}

/**
 * Generic pilot path: project intake (or load) → opt-in humans → match →
 * off-chain distribution inputs (allocations + merkle + manifest).
 *
 * Does not hard-bind AURORA_PROJECT_ID / Maya / Dan. Uses existing
 * matchProject + buildAllocations + FROZEN-V1 merkle helpers as-is.
 */
export function runPilot(options: PilotRunOptions = {}): PilotRunResult {
  const dataDir = getPilotDataDir(options.dataDir);
  const engine = openPassportEngine(dataDir);

  let projectId = options.projectId;
  if (options.briefFile !== undefined) {
    const taken = intakeProjectFromFile(options.briefFile);
    persistProjectIntake(taken, dataDir);
    projectId = taken.candidate.project_id;
  }
  if (projectId === undefined || projectId.length === 0) {
    throw new Error("runPilot requires briefFile or projectId");
  }

  const detail = engine.getProjectPassport(projectId);
  if (detail === null) {
    throw new Error(`no persisted passport for ${projectId} — run project intake first`);
  }
  const intent = loadPersistedIntent(projectId, dataDir);
  const humans = loadOptInHumans(dataDir);
  if (humans.length === 0) {
    throw new Error("no opt-in humans in the pilot store — run Early Humans intake first");
  }

  const matches = matchProject({ passport: detail.passport, intent, humans });

  const distributionId = freshDistributionId(projectId);
  const createdAt = new Date().toISOString();
  const totalAmount = options.totalAmount ?? "10000";
  const tokenMint = options.tokenMint ?? "pilot_offchain";
  const distribution = createDistribution(distributionId, projectId, tokenMint, totalAmount, createdAt);
  const allocations = buildAllocations(distribution, matches, humans, P0_ALLOCATION_POLICY);

  const leaves = allocations.map((a) => allocationLeaf(a));
  const tree = buildMerkleTree(leaves);
  const root = tree.root.toString("hex");
  const proofs: Record<string, string[]> = {};
  for (const a of allocations) {
    proofs[a.wallet] = merkleProof(tree, allocationLeaf(a)).map((b) => b.toString("hex"));
  }

  const manifest = buildManifest({
    distribution_id: distributionId,
    project_id: projectId,
    token_mint: tokenMint,
    total_amount: totalAmount,
    total_recipients: allocations.length,
    passport: detail.passport as unknown as object,
    matchIntent: intent as unknown as object,
    allocation_root: root,
    created_at: createdAt,
  });

  const inputs: PilotDistributionInputs = {
    distribution_id: distributionId,
    project_id: projectId,
    passport_status: detail.passport.status,
    intent,
    matches,
    humans,
    allocations,
    merkle: { root, proofs },
    manifest,
    manifest_hash: manifestHash(manifest),
    policy: {
      topN: P0_ALLOCATION_POLICY.topN,
      note: "P0 equal-split policy unchanged — match decides who; policy decides how much",
    },
  };

  mkdirSync(runsDir(dataDir), { recursive: true });
  const outputFile = path.join(runsDir(dataDir), `${distributionId}.json`);
  writeFileSync(outputFile, JSON.stringify(inputs, null, 2) + "\n", "utf8");

  return { passport: detail.passport, inputs, outputFile };
}
