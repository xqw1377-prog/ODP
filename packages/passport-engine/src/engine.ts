import path from "node:path";
import { ProjectCandidateSchema, ProjectPassportSchema } from "@odp/domain";
import type { ProjectCandidate, ProjectPassport } from "@odp/domain";
import { ValidatedJsonStore } from "./store.js";
import { generatePassport, reassessFromEvidence } from "./pipeline.js";
import type { EvidenceBundle } from "./evidence.js";
import { buildRadarView, filterRadar } from "./readmodel.js";
import type { PassportDetail, RadarFilter, RadarProject } from "./readmodel.js";
import type { DiscoverySource } from "./discovery.js";

/**
 * PassportEngine — facade wiring discovery → evidence assembly → passport
 * pipeline → validated persistence → read models (P0-2).
 *
 * Invariant #1 holds end to end: no method anywhere accepts an overall
 * status. Everything persisted passes ProjectPassportSchema.parse on write
 * AND on read (derivation lock included).
 */
export interface PassportEngineOptions {
  dataDir: string;
}

export class PassportEngine {
  readonly candidates: ValidatedJsonStore<ProjectCandidate>;
  readonly passports: ValidatedJsonStore<ProjectPassport>;

  constructor({ dataDir }: PassportEngineOptions) {
    this.candidates = new ValidatedJsonStore(
      path.join(dataDir, "candidates"),
      ProjectCandidateSchema,
      (c) => c.project_id,
    );
    this.passports = new ValidatedJsonStore(
      path.join(dataDir, "passports"),
      ProjectPassportSchema,
      (p) => p.project_id,
    );
  }

  /** Validate + persist a discovered candidate. */
  ingestCandidate(candidate: ProjectCandidate): ProjectCandidate {
    const parsed = ProjectCandidateSchema.parse(candidate);
    this.candidates.save(parsed);
    return parsed;
  }

  /** Discover from a source and ingest everything found. */
  discoverAndIngest(source: DiscoverySource): ProjectCandidate[] {
    return source.discover().map((c) => this.ingestCandidate(c));
  }

  /** candidate + raw evidence → derived passport, validated, persisted. */
  generateFromBundle(candidate: ProjectCandidate, bundle: EvidenceBundle): ProjectPassport {
    const passport = generatePassport(candidate, bundle);
    this.passports.save(passport);
    return passport;
  }

  /** Continuous audit: reload previous, re-derive from new evidence, persist. */
  reassessProject(project_id: string, newEvidence: EvidenceBundle, reason?: string): ProjectPassport {
    const previous = this.passports.get(project_id);
    if (previous === null) {
      throw new Error(`no persisted passport for ${project_id}`);
    }
    const next = reassessFromEvidence(previous, newEvidence, reason);
    this.passports.save(next);
    return next;
  }

  /** Radar read model, optionally filtered by ruling. */
  radar(filter: RadarFilter = "ALL"): RadarProject[] {
    return filterRadar(buildRadarView(this.passports.list(), this.candidates.list()), filter);
  }

  /** Passport detail read model: candidate + full six-dimension passport. */
  getProjectPassport(project_id: string): PassportDetail | null {
    const passport = this.passports.get(project_id);
    if (passport === null) return null;
    const candidate = this.candidates.get(project_id);
    if (candidate === null) {
      throw new Error(`persisted passport ${project_id} has no candidate record`);
    }
    return { candidate, passport };
  }
}
