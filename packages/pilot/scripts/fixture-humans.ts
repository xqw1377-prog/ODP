import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import { newHumanId } from "../src/ids.js";
import { computeHumanConfidence, noEvidenceScore } from "../src/provenance.js";
import type { PilotHuman } from "../src/schema.js";
import { PilotStore } from "../src/store.js";

/* FIXTURE/TEST/REHEARSAL humans ONLY (D1-R ruling). Server-generated
   keypairs are demo infrastructure — they are stored under .odp/devnet-keys/
   (the frozen demo key environment, gitignored) and every record is marked
   source: FIXTURE, which excludes them from all real-evidence counts and
   from the real match pool. NEVER point real humans at this script. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const N = Number(process.argv[2] ?? 3);
const T = new Date().toISOString();

const store = new PilotStore();
const keysDir = path.join(REPO, ".odp", "devnet-keys", "pilot-fixtures");
mkdirSync(keysDir, { recursive: true });

for (let i = 0; i < N; i++) {
  const human_id = newHumanId();
  const kp = Keypair.generate();
  writeFileSync(path.join(keysDir, `${human_id}.json`), JSON.stringify(Array.from(kp.secretKey)));
  const record: PilotHuman = {
    human_id,
    source: "FIXTURE",
    wallet: kp.publicKey.toBase58(),
    wallet_verified_at: T, // fixture: keypair held here, ownership trivially known
    x_handle: `@fixture_${i}`,
    x_identity_status: "SELF_DECLARED",
    interests: ["solana", i % 2 === 0 ? "depin" : "ai"],
    consent: { accepted_at: T, policy_version: "pilot-v0-2026-09" },
    scores: {
      human_confidence: computeHumanConfidence({ wallet_verified: true, x_identity_status: "SELF_DECLARED" }, T),
      reputation: noEvidenceScore("reputation", T),
      network_score: noEvidenceScore("network_score", T),
    },
    status: "ELIGIBLE",
    created_at: T,
  };
  store.humans.save(record);
  console.log(`FIXTURE human ${human_id} wallet=${record.wallet} (excluded from real counts)`);
}
console.log(`done — ${N} FIXTURE humans; keys under .odp/devnet-keys/pilot-fixtures/ (never real evidence)`);
