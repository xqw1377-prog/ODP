import { randomBytes, randomUUID } from "node:crypto";

/* Pilot identifiers. Deliberately NOT derived from X handles (handles change,
   slug normalization collides). Human identity = random stable id; the X
   handle lives in the sidecar and is marked SELF_DECLARED until real OAuth. */

const LOWER36 = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomString(alphabet: string, len: number): string {
  const max = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < len) {
    const buf = randomBytes(len * 2);
    for (const b of buf) {
      if (b >= max) continue; // rejection sampling, no modulo bias
      out += alphabet[b % alphabet.length];
      if (out.length === len) break;
    }
  }
  return out;
}

export function newHumanId(): string {
  return `hum_${randomString(LOWER36, 12)}`;
}

export function newClaimId(): string {
  return `clm_${randomString(LOWER36, 10)}`;
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

export function newCorrelationId(): string {
  return randomUUID();
}

/** filesystem/safe slug: lowercase, non-alnum -> _, collapsed, trimmed. */
export function slugify(input: string, maxLen = 24): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLen)
    .replace(/_+$/g, "");
  return s.length > 0 ? s : "x";
}

export function newProjectId(name: string, taken: (id: string) => boolean): string {
  const base = `prj_${slugify(name)}`;
  if (!taken(base)) return base;
  for (let i = 0; i < 16; i++) {
    const id = `${base}_${randomString(LOWER36, 4)}`;
    if (!taken(id)) return id;
  }
  throw new Error("could not allocate a free project id");
}

/** Distribution id for pilot runs. Any non-empty string passes frozen
    validation (only sha256(id) is stored on-chain), but we keep it structured. */
export function newDistributionId(projectSlug: string, at = new Date()): string {
  const stamp = at.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `dst_${slugify(projectSlug)}_pilot_${stamp}`;
}
