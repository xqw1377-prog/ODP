import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { PositiveU64String, ProjectCandidateSchema } from "@odp/domain";
import { FindingKindSchema } from "@odp/passport-engine";
import { foreignFindings } from "./finding-ownership.js";
import { newClaimId, newProjectId } from "./ids.js";
import type { Dimension, EvidenceClaim, PilotProject } from "./schema.js";
import { DimensionSchema } from "./schema.js";
import type { PilotStore } from "./store.js";
import { unknownTags } from "./vocabulary.js";

/* P1: real project intake. A project provides the minimum viable facts plus
   SELF-DECLARED evidence candidates. Candidates are stored UNVERIFIED and can
   only reach the frozen passport pipeline after operator verification (D5-R:
   a project can hand us clues; it cannot issue itself a passport). */

export interface ProjectClaimInput {
  dimension: Dimension;
  statement: string;
  url?: string | null;
  proposed_findings: z.infer<typeof FindingKindSchema>[];
}

export interface ProjectIntakeInput {
  name: string;
  symbol: string;
  website: string;
  x_account: string;
  github?: string | null;
  token_address?: string | null;
  wallet: string;
  intent_text: string;
  target_tags: string[];
  discovery_source: "social" | "onchain" | "developer" | "capital" | "network";
  claims: ProjectClaimInput[];
  at?: Date;
}

export type ProjectIntakeResult =
  | { ok: true; project: PilotProject; claims: EvidenceClaim[] }
  | { ok: false; reason: string };

export function submitProject(store: PilotStore, input: ProjectIntakeInput): ProjectIntakeResult {
  const at = input.at ?? new Date();

  const symbol = input.symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return { ok: false, reason: "symbol must be 1-10 letters/digits" };
  if (input.name.trim().length < 2) return { ok: false, reason: "project name is required" };
  if (z.string().url().safeParse(input.website).success === false)
    return { ok: false, reason: "website must be a valid URL" };
  if (input.github !== undefined && input.github !== null && z.string().url().safeParse(input.github).success === false)
    return { ok: false, reason: "github must be a valid URL" };
  // P1-B review secondary fix: a field named "Solana wallet" is validated as one
  try {
    new PublicKey(input.wallet);
  } catch {
    return { ok: false, reason: "wallet must be a valid Solana pubkey (base58)" };
  }
  if (input.intent_text.trim().length < 8)
    return { ok: false, reason: "describe what humans you need (intent, min 8 chars)" };
  if (input.target_tags.length < 1) return { ok: false, reason: "pick at least one target interest" };
  const unknown = unknownTags(input.target_tags);
  if (unknown.length > 0) return { ok: false, reason: `unknown target interests: ${unknown.join(", ")}` };

  // claims: findings must belong to the claimed dimension (fail fast, clean message)
  for (const c of input.claims) {
    const dim = DimensionSchema.safeParse(c.dimension);
    if (!dim.success) return { ok: false, reason: `unknown dimension ${String(c.dimension)}` };
    if (c.statement.trim().length < 4) return { ok: false, reason: "evidence statements must be at least 4 chars" };
    if (!Array.isArray(c.proposed_findings) || c.proposed_findings.length < 1)
      return { ok: false, reason: `claim in ${c.dimension} needs at least one finding` };
    const foreign = foreignFindings(c.dimension, c.proposed_findings);
    if (foreign.length > 0)
      return { ok: false, reason: `findings ${foreign.join(", ")} do not belong to ${c.dimension}` };
  }

  const project_id = newProjectId(input.name, (id) => store.projects.get(id) !== null);
  const project: PilotProject = {
    project_id,
    name: input.name.trim(),
    symbol,
    website: input.website,
    x_account: input.x_account.trim(),
    github: input.github ?? null,
    chain: "solana",
    token_address: input.token_address ?? null,
    wallet: input.wallet,
    intent_text: input.intent_text.trim(),
    discovery_source: input.discovery_source,
    target_tags: [...new Set(input.target_tags)],
    created_at: at.toISOString(),
    status: "SUBMITTED",
  };
  store.projects.save(project);

  const claims = input.claims.map((c) => {
    const claim: EvidenceClaim = {
      claim_id: newClaimId(),
      project_id,
      dimension: c.dimension,
      statement: c.statement.trim(),
      url: c.url ?? null,
      proposed_findings: c.proposed_findings,
      status: "UNVERIFIED",
      verified_at: null,
      verifier: null,
      verify_note: null,
      created_at: at.toISOString(),
    };
    while (store.getClaims(project_id).some((x) => x.claim_id === claim.claim_id)) claim.claim_id = newClaimId();
    store.saveClaim(project_id, claim);
    return claim;
  });

  return { ok: true, project, claims };
}

/** The frozen pipeline input derived from a pilot project record. */
export function toCandidate(project: PilotProject) {
  return ProjectCandidateSchema.parse({
    project_id: project.project_id,
    name: project.name,
    symbol: project.symbol,
    website: project.website,
    x_account: project.x_account,
    github: project.github,
    chain: project.chain,
    token_address: project.token_address,
    discovered_at: project.created_at,
    discovery_sources: [project.discovery_source],
  });
}

/** The frozen matcher input derived from a pilot project record. */
export function toMatchIntent(project: PilotProject) {
  return { project_id: project.project_id, target_tags: project.target_tags };
}

export function assertDivisible(total_amount: PositiveU64String | string, recipient_count: number): void {
  const total = BigInt(total_amount);
  if (total % BigInt(recipient_count) !== 0n)
    throw new Error(
      `total_amount ${total_amount} is not divisible by ${recipient_count} recipients — ` +
        "the frozen equal-split allocation policy requires exact division",
    );
}
