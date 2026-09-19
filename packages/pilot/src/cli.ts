export function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0) {
    const v = process.argv[i + 1];
    if (v !== undefined && !v.startsWith("--")) return v;
  }
  return fallback;
}

export function requireFlag(name: string): string {
  const v = flag(name);
  if (v === undefined) {
    throw new Error(`missing required ${name}`);
  }
  return v;
}
