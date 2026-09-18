import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { base58Encode } from "../src/base58.js";

/**
 * Generates ephemeral demo keypairs (P0-4 §7) into `.odp/devnet-keys/`
 * (gitignored). Only the PUBLIC keys are committed, via
 * fixtures/keys/devnet-pubkeys.json. Idempotent: existing keypairs are kept.
 */
const NAMES = ["maya", "dan", "sib", "project"] as const;
type Name = (typeof NAMES)[number];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const keysDir = path.join(repoRoot, ".odp", "devnet-keys");
const registryFile = path.join(
  repoRoot,
  "packages/distribution-engine/fixtures/keys/devnet-pubkeys.json",
);

function loadOrGenerate(name: Name): { pubkeys: Uint8Array[]; created: boolean } {
  const file = path.join(keysDir, `${name}.json`);
  if (existsSync(file)) {
    const bytes = JSON.parse(readFileSync(file, "utf8")) as number[];
    return { pubkeys: [new Uint8Array(bytes.slice(32))], created: false };
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const seed = privateKey.export({ type: "pkcs8", format: "der" }).subarray(16);
  const pub = publicKey.export({ type: "spki", format: "der" }).subarray(12);
  if (seed.length !== 32 || pub.length !== 32) throw new Error("unexpected ed25519 key sizes");
  const solanaKeypair = Array.from(Buffer.concat([seed, pub]));
  writeFileSync(file, JSON.stringify(solanaKeypair), "utf8");
  return { pubkeys: [Buffer.from(pub)], created: true };
}

mkdirSync(keysDir, { recursive: true });
const registry: Record<string, string> = {};
for (const name of NAMES) {
  const { pubkeys, created } = loadOrGenerate(name);
  registry[name] = base58Encode(pubkeys[0]!);
  console.log(`${name}: ${registry[name]}${created ? "" : " (existing)"}`);
}
mkdirSync(path.dirname(registryFile), { recursive: true });
writeFileSync(registryFile, JSON.stringify(registry, null, 2) + "\n", "utf8");
console.log(`registry written: ${registryFile}`);
