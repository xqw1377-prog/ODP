import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PilotStore } from "../src/store.js";

/* P1-C gate 8 — pilot evidence export. PRIVACY RULE: aggregates + on-chain
   links only. The X↔wallet relation and per-human records stay in the private
   .odp/pilot/ store and are never exported. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const RUN_ID = (() => {
  const i = process.argv.indexOf("--run");
  return i !== -1 ? process.argv[i + 1] : process.argv[2];
})();
if (!RUN_ID) {
  console.error("usage: npm run pilot:evidence -- --run run_<id>");
  process.exit(1);
}

const store = new PilotStore();
const run = store.runs.get(RUN_ID);
if (run === null) throw new Error(`run ${RUN_ID} not found`);
const project = store.projects.get(run.project_id);
const passportDetail = store.engine.getProjectPassport(run.project_id);
const realHumans = store.humans.list().filter((h) => h.source === "REAL");

const claimed = Object.entries(run.claims);
const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const accountLink = (addr: string) => `https://explorer.solana.com/account/${addr}?cluster=devnet`;

const lines: string[] = [];
lines.push(`# ODP Pilot Evidence — ${run.run_id}`);
lines.push("");
lines.push(`- Project: **${project?.name ?? run.project_id}** (${run.project_id})`);
lines.push(`- Passport verdict: **${passportDetail?.passport.status ?? "unknown"}** (derived by the frozen engine)`);
lines.push(`- Distribution: \`${run.distribution_id}\` — ${accountLink(run.onchain?.distribution_pda ?? "n/a")}`);
lines.push("");
lines.push("## Aggregate funnel");
lines.push("");
lines.push("| Stage | Count |");
lines.push("| --- | --- |");
lines.push(`| Real enrolled humans | ${realHumans.length} |`);
lines.push(`| Eligible in pool | ${realHumans.filter((h) => h.status === "ELIGIBLE").length} |`);
lines.push(`| Matched (score > 0) | ${run.matches.filter((m) => m.score > 0).length} |`);
lines.push(`| Recipients (explicit N) | ${run.recipient_count} |`);
lines.push(`| Claimed (on-chain proven) | ${claimed.length} |`);
lines.push("");
lines.push("## On-chain artifacts");
lines.push("");
lines.push(`- Mint: ${accountLink(run.onchain?.mint ?? "n/a")}`);
lines.push(`- Vault: ${accountLink(run.onchain?.vault ?? "n/a")}`);
lines.push(`- Merkle root: \`${run.root}\``);
lines.push(`- Committed manifest hash: \`${run.committed_manifest_hash ?? run.manifest_hash}\``);
if (run.status !== "DRY" && run.committed_manifest_hash !== null && run.committed_manifest_hash !== run.manifest_hash) {
  lines.push(`- DRY manifest hash (superseded): \`${run.manifest_hash}\``);
}
lines.push("");
lines.push("| Lifecycle | Transaction |");
lines.push("| --- | --- |");
for (const [k, v] of Object.entries(run.onchain?.txs ?? {})) lines.push(`| ${k} | ${explorer(v)} |`);
lines.push("");
lines.push("| Recipient (pseudonymous) | Amount | Claim tx | Receipt |");
lines.push("| --- | --- | --- | --- |");
run.allocations.forEach((a, i) => {
  const c = run.claims[a.human_id];
  lines.push(
    `| recipient-${String(i + 1).padStart(2, "0")} | ${a.amount} | ${c ? explorer(c.claim_tx) : "not claimed yet"} | ${c ? accountLink(c.receipt_pda) : "—"} |`,
  );
});
lines.push("");
if (run.feedback.length > 0) {
  lines.push("## Recipient feedback (aggregate scores)");
  lines.push("");
  const avg = run.feedback.reduce((acc, f) => acc + f.score, 0) / run.feedback.length;
  lines.push(`- responses: ${run.feedback.length}, average score: ${avg.toFixed(2)} / 5`);
  lines.push("");
}
lines.push("> Per the ODP privacy rule, this export contains aggregates and on-chain");
lines.push("> links only. Handle↔wallet relations remain in the private runtime store.");

const out = path.join(REPO, "docs", `pilot-evidence-${run.run_id}.md`);
writeFileSync(out, lines.join("\n") + "\n");
console.log(`evidence written: docs/pilot-evidence-${run.run_id}.md (aggregates only — no handles, no wallets)`);
