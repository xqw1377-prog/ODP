import { buildPassport, reassessPassport } from "@odp/domain";
import { ProjectCandidateSchema } from "@odp/domain";
import type { ProjectCandidate, ProjectPassport } from "@odp/domain";
import { EvidenceBundleSchema } from "./evidence.js";
import type { EvidenceBundle } from "./evidence.js";
import { assembleDims } from "./collectors.js";

/**
 * The only official passport pipelines (P0-2). Both end in domain-layer
 * validation (buildPassport / reassessPassport already run
 * ProjectPassportSchema.parse, including the derivation lock) — a passport
 * with a hand-declared status cannot be produced here.
 */

/** candidate + raw evidence → validated passport (initial ruling). */
export function generatePassport(candidate: ProjectCandidate, bundle: EvidenceBundle): ProjectPassport {
  const validatedCandidate = ProjectCandidateSchema.parse(candidate);
  const validatedBundle = EvidenceBundleSchema.parse(bundle);
  if (validatedBundle.project_id !== validatedCandidate.project_id) {
    throw new Error(
      `evidence bundle ${validatedBundle.project_id} does not belong to candidate ${validatedCandidate.project_id}`,
    );
  }
  const dims = assembleDims(validatedBundle);
  return buildPassport(validatedCandidate.project_id, dims, validatedBundle.collected_at);
}

/** previous passport + new raw evidence → validated re-ruling (continuous audit). */
export function reassessFromEvidence(
  previous: ProjectPassport,
  bundle: EvidenceBundle,
  reason?: string,
): ProjectPassport {
  const validatedBundle = EvidenceBundleSchema.parse(bundle);
  if (validatedBundle.project_id !== previous.project_id) {
    throw new Error(
      `evidence bundle ${validatedBundle.project_id} does not belong to passport ${previous.project_id}`,
    );
  }
  const dims = assembleDims(validatedBundle);
  const trigger = reason ?? `continuous audit: evidence re-collected at ${validatedBundle.collected_at}`;
  return reassessPassport(previous, dims, trigger, validatedBundle.collected_at);
}
