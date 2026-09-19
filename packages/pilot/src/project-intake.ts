import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ProjectCandidateSchema } from "@odp/domain";
import type { ProjectCandidate, ProjectPassport } from "@odp/domain";
import { generatePassport, EvidenceBundleSchema, FindingKindSchema } from "@odp/passport-engine";
import type { EvidenceBundle, Observation } from "@odp/passport-engine";
import { ProjectMatchIntentSchema } from "@odp/matching-engine";
import type { ProjectMatchIntent } from "@odp/matching-engine";
import { extractTagsFromText, normalizeTag } from "./tags.js";
import type { EarlyHumanTagSlug } from "./tags.js";
import { normalizeXHandle, projectIdFromName, symbolFromName } from "./ids.js";
import { assertSolanaPubkey } from "./wallet.js";

const DIMS = ["TEAM", "PRODUCT", "CODE", "TOKEN", "ONCHAIN", "SOCIAL"] as const;
type Dim = (typeof DIMS)[number];

/**
 * One operator-supplied evidence pointer. Findings MUST be provided —
 * this adapter will not invent Passport findings or rulings.
 */
export const EvidencePointerSchema = z
  .object({
    dimension: z.enum(DIMS),
    source: z.string().min(1),
    detail: z.string().min(1),
    url: z.string().url().nullable().optional(),
    findings: z.array(FindingKindSchema).min(1),
    at: z.string().optional(),
  })
  .strict();
export type EvidencePointer = z.infer<typeof EvidencePointerSchema>;

/**
 * Real project brief. Converted into ProjectCandidate + EvidenceBundle +
 * ProjectMatchIntent, then handed to the existing passport / matching engines.
 */
export const ProjectBriefSchema = z
  .object({
    name: z.string().min(1),
    x: z.string().min(1),
    website: z.string().url(),
    wallet: z.string().min(1).optional(),
    humans_needed: z.string().min(1),
    symbol: z.string().min(1).optional(),
    github: z.string().url().nullable().optional(),
    project_id: z.string().min(1).optional(),
    token_address: z.string().min(1).nullable().optional(),
    target_tags: z.array(z.string().min(1)).optional(),
    evidence_pointers: z.array(EvidencePointerSchema).optional(),
    evidence_bundle: EvidenceBundleSchema.optional(),
    evidence_bundle_path: z.string().min(1).optional(),
    discovered_at: z.string().optional(),
  })
  .strict();
export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;

export interface ProjectIntakeResult {
  candidate: ProjectCandidate;
  evidence: EvidenceBundle;
  intent: ProjectMatchIntent;
  /** Derived by the existing passport pipeline — never assigned here. */
  passport: ProjectPassport;
}

export function loadProjectBrief(file: string): ProjectBrief {
  return ProjectBriefSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

function resolveTargetTags(brief: ProjectBrief): EarlyHumanTagSlug[] {
  if (brief.target_tags !== undefined && brief.target_tags.length > 0) {
    return unique(brief.target_tags.map(normalizeTag));
  }
  const extracted = extractTagsFromText(brief.humans_needed);
  if (extracted.length === 0) {
    throw new Error(
      `could not extract any Early Humans V0 tags from humans_needed ${JSON.stringify(brief.humans_needed)} — pass target_tags or mention catalog interests`,
    );
  }
  return extracted;
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function emptyObservations(): Record<Dim, Observation[]> {
  return { TEAM: [], PRODUCT: [], CODE: [], TOKEN: [], ONCHAIN: [], SOCIAL: [] };
}

function loadBundleFromBrief(brief: ProjectBrief, projectId: string, briefDir?: string): EvidenceBundle {
  let bundle: EvidenceBundle | undefined;
  if (brief.evidence_bundle !== undefined) {
    bundle = brief.evidence_bundle;
  } else if (brief.evidence_bundle_path !== undefined) {
    const file = path.isAbsolute(brief.evidence_bundle_path)
      ? brief.evidence_bundle_path
      : path.resolve(briefDir ?? process.cwd(), brief.evidence_bundle_path);
    bundle = EvidenceBundleSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } else if (brief.evidence_pointers !== undefined && brief.evidence_pointers.length > 0) {
    const collectedAt = brief.discovered_at ?? new Date().toISOString();
    const observations = emptyObservations();
    for (const p of brief.evidence_pointers) {
      observations[p.dimension].push({
        source: p.source,
        detail: p.detail,
        url: p.url ?? null,
        at: p.at ?? collectedAt,
        findings: p.findings,
      });
    }
    bundle = EvidenceBundleSchema.parse({
      project_id: projectId,
      collected_at: collectedAt,
      maturity: brief.evidence_pointers.some((p) => p.url) ? "PUBLIC-SOURCE" : "SIMULATED",
      observations,
    });
  }

  if (bundle === undefined) {
    throw new Error(
      "project intake requires evidence (evidence_bundle, evidence_bundle_path, or evidence_pointers with findings) — the adapter will not invent Passport findings",
    );
  }

  if (bundle.project_id !== projectId) {
    throw new Error(
      `evidence bundle project_id ${bundle.project_id} does not bind to candidate ${projectId} (identity binding)`,
    );
  }
  return EvidenceBundleSchema.parse(bundle);
}

function toCandidate(brief: ProjectBrief): ProjectCandidate {
  const project_id = brief.project_id ?? projectIdFromName(brief.name);
  const discovered_at = brief.discovered_at ?? new Date().toISOString();
  const wallet = brief.wallet !== undefined ? assertSolanaPubkey(brief.wallet) : undefined;
  const sources: Array<"social" | "onchain" | "developer" | "capital" | "network"> = ["social"];
  if (brief.github) sources.push("developer");
  if (wallet !== undefined || brief.token_address) sources.push("onchain");

  return ProjectCandidateSchema.parse({
    project_id,
    name: brief.name,
    symbol: brief.symbol ?? symbolFromName(brief.name),
    website: brief.website,
    x_account: normalizeXHandle(brief.x),
    github: brief.github ?? null,
    chain: "solana",
    token_address: brief.token_address ?? wallet ?? null,
    discovered_at,
    discovery_sources: sources,
  });
}

/**
 * Convert a real project brief into domain inputs and call generatePassport.
 * Does not persist. Does not invent findings or change derivation rules.
 */
export function intakeProject(briefInput: unknown, options: { briefDir?: string } = {}): ProjectIntakeResult {
  const brief = ProjectBriefSchema.parse(briefInput);
  const candidate = toCandidate(brief);
  const evidence = loadBundleFromBrief(brief, candidate.project_id, options.briefDir);
  const intent = ProjectMatchIntentSchema.parse({
    project_id: candidate.project_id,
    target_tags: resolveTargetTags(brief),
  });
  const passport = generatePassport(candidate, evidence);
  return { candidate, evidence, intent, passport };
}

export function intakeProjectFromFile(briefFile: string): ProjectIntakeResult {
  return intakeProject(loadProjectBrief(briefFile), { briefDir: path.dirname(briefFile) });
}
