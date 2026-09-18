import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

/** Minimal structural parser contract (satisfied by our zod schemas). */
export interface Parser<T> {
  parse(data: unknown): T;
}

/**
 * Record ids are constrained to a conservative charset so they can never
 * traverse paths: lowercase alnum start, then alnum/_/-, max 64 chars.
 */
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`unsafe record id rejected: ${JSON.stringify(id)}`);
  }
}

/**
 * JSON file store with contract validation on BOTH ends (P0-2 hard rules):
 *   - save(): schema.parse BEFORE writing, then temp file + atomic rename,
 *     so a partially-written or non-canonical record can never exist.
 *   - get()/list(): schema.parse AFTER reading — a hand-edited or otherwise
 *     forged file (e.g. inconsistent ruling) fails loudly, never silently.
 */
export class ValidatedJsonStore<T> {
  constructor(
    private readonly dir: string,
    private readonly schema: Parser<T>,
    private readonly idOf: (record: T) => string,
  ) {}

  private fileOf(id: string): string {
    assertSafeId(id);
    return path.join(this.dir, `${id}.json`);
  }

  save(record: T): void {
    const parsed = this.schema.parse(record);
    const id = this.idOf(parsed);
    const target = this.fileOf(id);
    mkdirSync(this.dir, { recursive: true });
    const tmp = path.join(this.dir, `.${id}.${randomUUID()}.tmp`);
    writeFileSync(tmp, JSON.stringify(parsed, null, 2) + "\n", "utf8");
    renameSync(tmp, target);
  }

  get(id: string): T | null {
    const file = this.fileOf(id);
    if (!existsSync(file)) return null;
    return this.schema.parse(JSON.parse(readFileSync(file, "utf8")));
  }

  /** File path for a stored record (test/inspection hook). */
  filePath(id: string): string {
    return this.fileOf(id);
  }

  list(): T[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json") && !f.startsWith("."))
      .sort()
      .map((f) => this.schema.parse(JSON.parse(readFileSync(path.join(this.dir, f), "utf8"))))
      .sort((a, b) => (this.idOf(a) < this.idOf(b) ? -1 : this.idOf(a) > this.idOf(b) ? 1 : 0));
  }
}
