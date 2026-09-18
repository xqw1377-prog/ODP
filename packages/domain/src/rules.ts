import { PassportDimsSchema, ProjectPassportSchema } from "./passport.js";
import type { PassportDims, ProjectPassport } from "./passport.js";
import { derivePassportRuling } from "./passport-policy.js";
import { nowIso } from "./util.js";

/**
 * Build the initial passport from a candidate's dimension evidence.
 * The first history entry records the DISCOVERED → ruling transition.
 * Status/reasons always come from derivePassportRuling — the single
 * source of truth shared with the schema itself.
 */
export function buildPassport(project_id: string, dims: PassportDims, at = nowIso()): ProjectPassport {
  const validated = PassportDimsSchema.parse(dims);
  const { status, reasons } = derivePassportRuling(validated);
  const passport: ProjectPassport = {
    project_id,
    dims: validated,
    status,
    reasons,
    status_history: [{ from: "DISCOVERED", to: status, reason: `initial ruling: ${reasons.join("; ")}`, at }],
    updated_at: at,
  };
  return ProjectPassportSchema.parse(passport);
}

/**
 * Continuous-audit re-ruling. ODP constitutional constraint:
 * **status is produced by evidence, never dictated by the caller.**
 *
 * There is deliberately no API that sets the overall status directly. The
 * next overall status is always `derivePassportRuling(nextDims)`; the
 * caller only supplies new evidence (and a human-readable trigger reason
 * recorded in history when the ruling actually changes).
 *
 * Consequences:
 *   - A persisted passport can never contradict its six dimensions
 *     (the schema's derivation lock enforces this on every parse too).
 *   - Recovery (REJECT/WATCH → ALLOW) requires the evidence itself to heal —
 *     there is no appeal path around the dims in P0.
 *   - Re-assessment with an unchanged aggregate refreshes dims/updated_at
 *     but appends nothing to history.
 */
export function reassessPassport(
  previous: ProjectPassport,
  nextDims: PassportDims,
  reason: string,
  at = nowIso(),
): ProjectPassport {
  const dims = PassportDimsSchema.parse(nextDims);
  const { status, reasons } = derivePassportRuling(dims);
  const status_history =
    status === previous.status
      ? previous.status_history
      : [...previous.status_history, { from: previous.status, to: status, reason, at }];
  return ProjectPassportSchema.parse({
    ...previous,
    dims,
    status,
    reasons,
    status_history,
    updated_at: at,
  });
}
