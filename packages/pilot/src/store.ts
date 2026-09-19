import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ChallengeSchema, type Challenge } from "./schema.js";
import { ClaimFileSchema, type ClaimFile, type EvidenceClaim } from "./schema.js";
import { PilotHumanSchema, type PilotHuman } from "./schema.js";
import { PilotProjectSchema, type PilotProject } from "./schema.js";
import { PilotRunSchema, type PilotRun } from "./schema.js";
import type { z } from "zod";

/* Private pilot storage under .odp/pilot/ (gitignored — this is runtime data
   with wallets and consent records; only aggregates are ever exported).
   Same discipline as the frozen ValidatedJsonStore: schema-parse before write,
   write-temp-then-rename, filename id must equal record id (binding). */

export function defaultPilotDir(): string {
  return process.env.ODP_PILOT_DATA ?? join(process.cwd(), ".odp", "pilot");
}

class RecordStore<T> {
  constructor(
    private readonly dir: string,
    private readonly schema: z.ZodType<T>,
    private readonly idOf: (record: T) => string,
  ) {
    mkdirSync(this.dir, { recursive: true });
  }

  private path(id: string): string {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error(`pilot store: unsafe id ${JSON.stringify(id)}`);
    return join(this.dir, `${id}.json`);
  }

  save(record: T): void {
    const parsed = this.schema.parse(record); // fail closed before touching disk
    const id = this.idOf(parsed);
    const target = this.path(id);
    const tmp = join(dirname(target), `.${id}.${randomSuffix()}.tmp`);
    writeFileSync(tmp, JSON.stringify(parsed, null, 2) + "\n");
    renameSync(tmp, target); // atomic on same volume
  }

  get(id: string): T | null {
    const target = this.path(id);
    if (!existsSync(target)) return null;
    const parsed = this.schema.parse(JSON.parse(readFileSync(target, "utf8")));
    if (this.idOf(parsed) !== id) throw new Error(`pilot store: binding mismatch for ${id}`);
    return parsed;
  }

  list(): T[] {
    if (!existsSync(this.dir)) return [];
    const out: T[] = [];
    for (const name of readdirSync(this.dir).sort()) {
      if (!name.endsWith(".json") || name.startsWith(".")) continue;
      const parsed = this.schema.parse(JSON.parse(readFileSync(join(this.dir, name), "utf8")));
      if (this.idOf(parsed) + ".json" !== name) throw new Error(`pilot store: binding mismatch for ${name}`);
      out.push(parsed);
    }
    return out;
  }
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class PilotStore {
  readonly humans: RecordStore<PilotHuman>;
  readonly projects: RecordStore<PilotProject>;
  readonly runs: RecordStore<PilotRun>;
  readonly challenges: RecordStore<Challenge>;
  private readonly claimsDir: string;

  constructor(readonly rootDir: string = defaultPilotDir()) {
    this.humans = new RecordStore<PilotHuman>(join(rootDir, "humans"), PilotHumanSchema, (r) => r.human_id);
    this.projects = new RecordStore<PilotProject>(join(rootDir, "projects"), PilotProjectSchema, (r) => r.project_id);
    this.runs = new RecordStore<PilotRun>(join(rootDir, "runs"), PilotRunSchema, (r) => r.run_id);
    this.challenges = new RecordStore<Challenge>(join(rootDir, "challenges"), ChallengeSchema, (r) => r.nonce);
    this.claimsDir = join(rootDir, "claims");
    mkdirSync(this.claimsDir, { recursive: true });
  }

  /** evidence candidates: one file per project, rewritten atomically */
  getClaims(project_id: string): EvidenceClaim[] {
    const target = join(this.claimsDir, `${project_id}.json`);
    if (!existsSync(target)) return [];
    const file: ClaimFile = ClaimFileSchema.parse(JSON.parse(readFileSync(target, "utf8")));
    return file.claims;
  }

  saveClaim(project_id: string, claim: EvidenceClaim): void {
    const claims = this.getClaims(project_id).filter((c) => c.claim_id !== claim.claim_id);
    const file: ClaimFile = ClaimFileSchema.parse({ project_id, claims: [...claims, claim] });
    const target = join(this.claimsDir, `${project_id}.json`);
    const tmp = join(this.claimsDir, `.${project_id}.${randomSuffix()}.tmp`);
    writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n");
    renameSync(tmp, target);
  }
}
