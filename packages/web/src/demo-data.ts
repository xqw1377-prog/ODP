import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Allocation,
  HumanProfile,
  MatchResult,
  ProjectCandidate,
  ProjectPassport,
} from "@odp/domain";
import { allocationLeaf, buildMerkleTree, merkleProof } from "@odp/domain";
import {
  FixtureDiscoverySource,
  loadEvidenceBundles,
  generatePassport,
  buildRadarView,
} from "@odp/passport-engine";
import type { RadarProject } from "@odp/passport-engine";
import { loadHumanProfiles, loadMatchIntent, matchProject } from "@odp/matching-engine";
import { buildAllocations, buildManifest, manifestHash } from "@odp/distribution-engine";

/**
 * Demo data layer (P0-5 §18): EVERYTHING here is computed by the real
 * pipelines — passport-engine, matching-engine, distribution-engine. The UI
 * is forbidden from hardcoding rulings, rankings or allocations; this module
 * is the only bridge and it never fakes results.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const PASSPORT_FIXTURES = path.join(REPO, "packages/passport-engine/fixtures");
const MATCHING_FIXTURES = path.join(REPO, "packages/matching-engine/fixtures");
const DEMO_STATE_FILE = path.join(REPO, ".odp", "demo-state.json");

export const AURORA_PROJECT_ID = "prj_aurora_net";

export interface DemoState {
  distribution_id: string;
  created_at: string;
  network: string;
  rpc: string;
  program_id: string;
  project_authority: string;
  mint: string;
  distribution_pda: string;
  vault: string;
  root: string;
  manifest_hash: string;
  total: string;
  maya_amount: string;
  dan_amount: string;
  transactions: Record<string, string>;
}

/** presentation-only display names for fixture humans (not protocol data) */
export const HUMAN_DISPLAY: Record<string, string> = {
  hum_maya: "Maya",
  hum_dev_dan: "Dev Dan",
  hum_sib: "Sib",
};

export interface DemoSnapshot {
  radar: RadarProject[];
  auroraCandidate: ProjectCandidate;
  auroraPassport: ProjectPassport;
  matches: MatchResult[];
  humans: HumanProfile[];
  allocations: Allocation[];
  /** demo-state.json when a demo:prepare has been run, else null */
  demoState: DemoState | null;
}

export function computeDemoSnapshot(): DemoSnapshot {
  // passport pipeline (real)
  const candidates = new FixtureDiscoverySource(
    path.join(PASSPORT_FIXTURES, "discovery"),
  ).discover();
  const bundles = loadEvidenceBundles(path.join(PASSPORT_FIXTURES, "evidence"));
  const passports = candidates.map((c) => {
    const bundle = bundles.find((b) => b.project_id === c.project_id);
    if (bundle === undefined) throw new Error(`missing evidence bundle for ${c.project_id}`);
    return generatePassport(c, bundle);
  });
  const radar = buildRadarView(passports, candidates);

  const auroraPassport = passports.find((p) => p.project_id === AURORA_PROJECT_ID);
  const auroraCandidate = candidates.find((c) => c.project_id === AURORA_PROJECT_ID);
  if (auroraPassport === undefined || auroraCandidate === undefined) {
    throw new Error("aurora fixtures missing");
  }

  // matching pipeline (real, ALLOW hard gate included)
  const intent = loadMatchIntent(
    path.join(MATCHING_FIXTURES, "intents", `${AURORA_PROJECT_ID}.intent.json`),
  );
  const humans = loadHumanProfiles(path.join(MATCHING_FIXTURES, "humans"));
  const matches = matchProject({ passport: auroraPassport, intent, humans });

  // allocation policy (real, equal split) — off-chain numbers only;
  // on-chain ids come from demoState once demo:prepare has run.
  const allocations = buildAllocations(
    {
      distribution_id: "demo",
      project_id: AURORA_PROJECT_ID,
      token_mint: "demo",
      total_amount: "10000",
      total_recipients: 0,
      status: "PENDING_DEPOSIT",
      created_at: "2026-09-18T00:00:00Z",
      vault: null,
      allocation_root: null,
      deposit_tx: null,
      committed_at: null,
      closed_at: null,
    } as never,
    matches,
    humans,
  );

  return {
    radar,
    auroraCandidate,
    auroraPassport,
    matches,
    humans,
    allocations,
    demoState: loadDemoState(),
  };
}

export function loadDemoState(): DemoState | null {
  try {
    return JSON.parse(readFileSync(DEMO_STATE_FILE, "utf8")) as DemoState;
  } catch {
    return null;
  }
}

/** Merkle artifacts for the CURRENT demo distribution (recomputed, deterministic). */
export function demoTree(state: DemoState): {
  root: string;
  maya: { wallet: string; amount: bigint; proof: Buffer[] };
  dan: { wallet: string; amount: bigint; proof: Buffer[] };
} {
  const humans = loadHumanProfiles(path.join(MATCHING_FIXTURES, "humans"));
  const byId = new Map(humans.map((h) => [h.human_id, h]));
  const mk = (humanId: string, amount: string) => {
    const wallet = byId.get(humanId)!.wallet;
    return { wallet, amount: BigInt(amount), proof: [] as Buffer[] };
  };
  const maya = mk("hum_maya", state.maya_amount);
  const dan = mk("hum_dev_dan", state.dan_amount);
  const leaves = [
    allocationLeaf({ distribution_id: state.distribution_id, wallet: maya.wallet, amount: state.maya_amount }),
    allocationLeaf({ distribution_id: state.distribution_id, wallet: dan.wallet, amount: state.dan_amount }),
  ];
  const tree = buildMerkleTree(leaves);
  maya.proof = merkleProof(tree, leaves[0]!).map((b) => Buffer.from(b));
  dan.proof = merkleProof(tree, leaves[1]!).map((b) => Buffer.from(b));
  return { root: tree.root.toString("hex"), maya, dan };
}

/** The manifest hash committed on-chain — deterministic in its inputs. */
export function computeManifestHash(input: {
  distributionId: string;
  mint: string;
  root: string;
  total: string;
  createdAt: string;
}): string {
  const passport = computeDemoSnapshot().auroraPassport;
  const intent = loadMatchIntent(
    path.join(MATCHING_FIXTURES, "intents", `${AURORA_PROJECT_ID}.intent.json`),
  );
  return manifestHash(
    buildManifest({
      distribution_id: input.distributionId,
      project_id: AURORA_PROJECT_ID,
      token_mint: input.mint,
      total_amount: input.total,
      total_recipients: 2,
      passport: passport as unknown as object,
      matchIntent: intent as unknown as object,
      allocation_root: input.root,
      created_at: input.createdAt,
    }),
  );
}

/** "Why you" lines for Maya — derived from her REAL match_reasons, never hardcoded. */
export function mayaWhyYou(matches: MatchResult[]): string[] {
  const maya = matches.find((m) => m.human_id === "hum_maya");
  if (maya === undefined) return [];
  const lines: string[] = [];
  for (const reason of maya.match_reasons) {
    const fit = reason.match(/^Strong interest fit: (.+)$/);
    if (fit) {
      for (const tag of fit[1]!.split(" / ")) {
        lines.push(prettyTag(tag));
      }
      continue;
    }
    if (reason === "High human confidence") lines.push("High human confidence");
    if (reason === "Strong reputation") lines.push("Strong reputation");
  }
  return lines;
}

function prettyTag(tag: string): string {
  if (tag === "depin") return "DePIN";
  const words = tag.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(" ");
}
