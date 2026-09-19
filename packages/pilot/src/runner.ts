import { z } from "zod";
import { allocationLeaf, buildMerkleTree, createDistribution, merkleProof, PositiveU64String } from "@odp/domain";
import { buildAllocations, buildManifest, manifestHash } from "@odp/distribution-engine";
import { matchProject } from "@odp/matching-engine";
import { base58Encode } from "./base58.js";
import { newDistributionId } from "./ids.js";
import { assertDivisible, toMatchIntent } from "./intake-project.js";
import { eligiblePool } from "./intake-human.js";
import type { PilotProject, PilotRun } from "./schema.js";
import type { PilotStore } from "./store.js";

/* P3: generic pilot runner. Real-style project + real human pool through the
   FROZEN engines only: generatePassport (done at verify stage) → matchProject
   → buildAllocations with an EXPLICIT recipient_count (never the implicit
   top-2) → Merkle tree with proofs looked up per wallet → manifest. Dry mode
   stops here; devnet prepare is a separate script. Zero Aurora/Maya literals. */

export interface RunPlanInput {
  project_id: string;
  total_amount: string;
  recipient_count: number;
  distribution_id?: string;
  at?: Date;
}

export type RunPlanResult = { ok: true; run: PilotRun } | { ok: false; reason: string };

/** Placeholder mint for DRY runs; the real manifest is rebuilt at devnet
    prepare time with the actual mint. Documented, deterministic, honest. */
export const DRY_MINT_PLACEHOLDER = "mint-pending-dry-run";

export function planRun(store: PilotStore, input: RunPlanInput): RunPlanResult {
  const at = input.at ?? new Date();
  const project: PilotProject | null = store.projects.get(input.project_id);
  if (project === null) return { ok: false, reason: `project ${input.project_id} not found` };

  if (!Number.isInteger(input.recipient_count) || input.recipient_count < 1)
    return { ok: false, reason: "recipient_count must be a positive integer" };

  const amount = PositiveU64String.safeParse(input.total_amount);
  if (!amount.success)
    return { ok: false, reason: `total_amount must be a positive integer string ≤ 2^64-1 (${input.total_amount})` };
  const total_amount = amount.data;

  try {
    assertDivisible(total_amount, input.recipient_count);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  const engine = store.engine;
  const detail = engine.getProjectPassport(input.project_id);
  if (detail === null)
    return { ok: false, reason: "no passport yet — verify evidence claims and generate the passport first" };
  const { passport } = detail;
  if (passport.status !== "ALLOW")
    return { ok: false, reason: `passport status is ${passport.status} — matching is hard-gated on ALLOW` };

  const humans = eligiblePool(store);
  if (humans.length < input.recipient_count)
    return {
      ok: false,
      reason: `eligible pool has ${humans.length} humans; ${input.recipient_count} recipients requested`,
    };

  const intent = toMatchIntent(project);
  const matches = matchProject({ passport, intent, humans });
  const positive = matches.filter((m) => m.match_score > 0);
  if (positive.length < input.recipient_count)
    return {
      ok: false,
      reason: `only ${positive.length} humans scored above zero; ${input.recipient_count} recipients requested`,
    };

  const distribution_id = input.distribution_id ?? newDistributionId(project.project_id.replace(/^prj_/, ""), at);
  const distribution = createDistribution(
    distribution_id,
    project.project_id,
    DRY_MINT_PLACEHOLDER,
    total_amount,
    at.toISOString(),
  );
  // D4: explicit topN — a run must distribute to exactly the recipients the
  // operator asked for, never silently fall back to the frozen default top-2.
  const allocations = buildAllocations(distribution, matches, humans, { topN: input.recipient_count });

  const leaves = allocations.map((a) => allocationLeaf(a));
  const tree = buildMerkleTree(leaves);
  const root = tree.root.toString("hex");
  const proofs: Record<string, string[]> = {};
  allocations.forEach((a, i) => {
    proofs[a.wallet] = merkleProof(tree, leaves[i]!).map((buf) => base58Encode(buf));
  });

  const manifest = buildManifest({
    distribution_id,
    project_id: project.project_id,
    token_mint: DRY_MINT_PLACEHOLDER,
    total_amount,
    total_recipients: input.recipient_count,
    passport,
    matchIntent: intent,
    allocation_root: root,
    created_at: at.toISOString(),
  });

  const run: PilotRun = {
    run_id: `run_${project.project_id.replace(/^prj_/, "")}_${at.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`,
    project_id: project.project_id,
    distribution_id,
    token_mint: null,
    total_amount,
    recipient_count: input.recipient_count,
    status: "DRY",
    passport_status: "ALLOW",
    matches: matches.map((m) => ({ human_id: m.human_id, score: m.match_score })),
    allocations: allocations.map((a) => ({ human_id: a.human_id, wallet: a.wallet, amount: a.amount })),
    root,
    manifest_hash: manifestHash(manifest),
    committed_manifest_hash: null, // set at devnet prepare with the real mint
    proofs,
    onchain: null,
    claims: {},
    feedback: [],
    created_at: at.toISOString(),
  };
  for (let attempt = 0; store.runs.get(run.run_id) !== null; attempt++) {
    if (attempt > 64) throw new Error("could not allocate a free run id");
    run.run_id = `${run.run_id.slice(0, -2)}${Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, "0")}`;
  }
  store.runs.save(run);
  return { ok: true, run };
}
