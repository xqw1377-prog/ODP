import { z } from "zod";
import { ISOString, PassportStatusSchema } from "@odp/domain";
import type { ProjectCandidate, ProjectPassport } from "@odp/domain";

/**
 * Radar read model (P0-2 §11). Derives ONLY from persisted passports and
 * persisted candidates — there is no second status store. What Radar shows
 * is what the derivation lock validated.
 */
export const RadarProjectSchema = z
  .object({
    project_id: z.string().min(1),
    name: z.string().min(1),
    symbol: z.string().min(1),
    status: PassportStatusSchema,
    reasons: z.array(z.string().min(1)).min(1),
    updated_at: ISOString,
  })
  .strict();
export type RadarProject = z.infer<typeof RadarProjectSchema>;

export type RadarFilter = "ALL" | "ALLOW" | "WATCH" | "REJECT";

export function buildRadarView(passports: ProjectPassport[], candidates: ProjectCandidate[]): RadarProject[] {
  const byId = new Map(candidates.map((c) => [c.project_id, c]));
  return passports
    .map((p) => {
      const c = byId.get(p.project_id);
      if (c === undefined) {
        throw new Error(`persisted passport ${p.project_id} has no candidate record`);
      }
      return RadarProjectSchema.parse({
        project_id: p.project_id,
        name: c.name,
        symbol: c.symbol,
        status: p.status,
        reasons: p.reasons,
        updated_at: p.updated_at,
      });
    })
    .sort((a, b) => (a.project_id < b.project_id ? -1 : a.project_id > b.project_id ? 1 : 0));
}

export function filterRadar(projects: RadarProject[], filter: RadarFilter): RadarProject[] {
  if (filter === "ALL") return projects;
  return projects.filter((p) => p.status === filter);
}

/** Passport detail read model (P0-2 §12) — the future Passport page's only data source. */
export interface PassportDetail {
  candidate: ProjectCandidate;
  passport: ProjectPassport;
}
