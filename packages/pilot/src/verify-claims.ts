import { EvidenceBundleSchema, type EvidenceBundle } from "@odp/passport-engine";
import type { ProjectPassport } from "@odp/domain";
import { toCandidate } from "./intake-project.js";
import type { EvidenceClaim, PilotProject } from "./schema.js";
import type { PilotStore } from "./store.js";

/* D5-R enforcement point + evidence honesty (P1-B review, blocker 1): a
   SELF_DECLARED candidate stays in the pilot sidecar until an operator has
   verified it — and a positive finding may only enter the PUBLIC-SOURCE
   bundle when the operator verified it against a PUBLIC, traceable source
   URL. Manual review without a public URL is recorded but never promotes a
   passport. A project can hand us clues; it cannot issue itself a passport. */

export type ClaimDecision = "VERIFIED" | "REJECTED";

export function decideClaim(
  store: PilotStore,
  project_id: string,
  claim_id: string,
  input: { verifier: string; decision: ClaimDecision; note?: string },
  at = new Date(),
): EvidenceClaim {
  if (input.verifier.trim().length < 2) throw new Error("verifier identity is required for the audit trail");
  const claims = store.getClaims(project_id);
  const claim = claims.find((c) => c.claim_id === claim_id);
  if (claim === undefined) throw new Error(`claim ${claim_id} not found for ${project_id}`);
  if (claim.status !== "UNVERIFIED") throw new Error(`claim ${claim_id} already decided (${claim.status})`);

  const decided: EvidenceClaim = {
    ...claim,
    status: input.decision,
    verified_at: at.toISOString(),
    verifier: input.verifier.trim(),
    verify_note: input.note ?? null,
  };
  store.saveClaim(project_id, decided);
  return decided;
}

/** Observation provenance is honest about how it was verified. */
function observationSource(claim: EvidenceClaim): string {
  return "public-web (operator-verified)";
}

/** Evidence honesty (blocker 1): only VERIFIED claims backed by a public,
    traceable URL may enter the PUBLIC-SOURCE bundle. VERIFIED claims without
    a URL stay review-only in the sidecar — they can never promote a finding. */
export function buildEvidenceBundle(store: PilotStore, project: PilotProject, at = new Date()): EvidenceBundle {
  const verified = store
    .getClaims(project.project_id)
    .filter((c) => c.status === "VERIFIED" && c.url !== null); // D5-R + blocker 1

  const observations = { TEAM: [], PRODUCT: [], CODE: [], TOKEN: [], ONCHAIN: [], SOCIAL: [] } as Record<
    "TEAM" | "PRODUCT" | "CODE" | "TOKEN" | "ONCHAIN" | "SOCIAL",
    unknown[]
  >;
  for (const c of verified) {
    observations[c.dimension].push({
      source: observationSource(c),
      detail: c.statement,
      url: c.url,
      at: c.verified_at ?? c.created_at,
      findings: c.proposed_findings,
    });
  }
  return EvidenceBundleSchema.parse({
    project_id: project.project_id,
    collected_at: at.toISOString(),
    maturity: "PUBLIC-SOURCE",
    observations,
  });
}

/** Review-only claims: verified by an operator but without a public source —
    recorded for the audit trail, never passport-promoting. */
export function reviewOnlyClaims(store: PilotStore, project_id: string): EvidenceClaim[] {
  return store
    .getClaims(project_id)
    .filter((c) => c.status === "VERIFIED" && c.url === null);
}

export function generatePassportForProject(
  store: PilotStore,
  project_id: string,
  at = new Date(),
): ProjectPassport {
  const project = store.projects.get(project_id);
  if (project === null) throw new Error(`project ${project_id} not found`);
  const candidate = toCandidate(project);
  const bundle = buildEvidenceBundle(store, project, at);

  const engine = store.engine;
  engine.ingestCandidate(candidate);
  const passport = engine.generateFromBundle(candidate, bundle);

  store.projects.save({ ...project, status: "PASSPORT_GENERATED" });
  return passport;
}
