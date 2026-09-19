import { assertSafeId } from "@odp/passport-engine";

/** Lowercase slug used only for record ids (store charset). */
export function slugify(raw: string, max = 48): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
  if (slug.length === 0) throw new Error(`cannot derive a safe id from ${JSON.stringify(raw)}`);
  return slug;
}

export function projectIdFromName(name: string): string {
  const id = `prj_${slugify(name)}`;
  assertSafeId(id);
  return id;
}

export function humanIdFromHandle(handle: string): string {
  const id = `hum_${slugify(handle.replace(/^@/, ""))}`;
  assertSafeId(id);
  return id;
}

export function normalizeXHandle(raw: string): string {
  const trimmed = raw.trim();
  const body = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (!/^[A-Za-z0-9_]{1,32}$/.test(body)) {
    throw new Error(`invalid X handle ${JSON.stringify(raw)} — use @name (letters, digits, underscore)`);
  }
  return `@${body}`;
}

export function symbolFromName(name: string): string {
  const letters = name.replace(/[^A-Za-z0-9]/g, "");
  if (letters.length < 2) throw new Error("cannot derive a symbol from the project name — pass symbol explicitly");
  return letters.slice(0, 4).toUpperCase();
}
