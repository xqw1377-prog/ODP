import { test } from "node:test";
import assert from "node:assert/strict";
import { decideClaim, buildEvidenceBundle, reviewOnlyClaims, generatePassportForProject } from "../src/verify-claims.js";
import { submitProject } from "../src/intake-project.js";
import { generateWalletKeys, makeTempStore } from "./helpers.js";

/* Blocker 1 — evidence honesty: an operator-VERIFIED claim WITHOUT a public,
   traceable source URL must never enter the PUBLIC-SOURCE bundle or promote a
   passport finding, no matter how confidently the operator reviewed it. */

test("no-source positive claims stay review-only and never promote a passport", () => {
  const store = makeTempStore();
  const keys = generateWalletKeys();
  const submitted = submitProject(store, {
    name: "Sourceless Co",
    symbol: "SRCLESS",
    website: "https://sourceless.example",
    x_account: "@sourceless",
    github: null,
    token_address: null,
    wallet: keys.pubkey,
    intent_text: "We need solana developers to pilot our sdk",
    target_tags: ["solana", "developer"],
    discovery_source: "network",
    claims: [
      // has a public URL → VERIFIED + promotable
      {
        dimension: "TEAM",
        statement: "Founders public on the company site",
        url: "https://sourceless.example/team",
        proposed_findings: ["FOUNDERS_PUBLIC", "PRIOR_SHIPPED"],
      },
      // NO url → even when VERIFIED, it is review-only
      {
        dimension: "PRODUCT",
        statement: "Operator says product is live (no public link provided)",
        url: null,
        proposed_findings: ["LIVE_MAINNET"],
      },
    ],
  });
  if (!submitted.ok) throw new Error(submitted.reason);
  for (const c of submitted.claims) {
    decideClaim(store, submitted.project.project_id, c.claim_id, { verifier: "commander", decision: "VERIFIED" });
  }

  const project = store.projects.get(submitted.project.project_id)!;
  const bundle = buildEvidenceBundle(store, project);

  // promotable claim entered, source-less claim did not
  assert.equal(bundle.observations.TEAM.length, 1);
  assert.equal(bundle.observations.PRODUCT.length, 0);
  assert.equal(reviewOnlyClaims(store, submitted.project.project_id).length, 1);

  // the derived passport shows the honest consequence: PRODUCT has no
  // evidence → NO_EVIDENCE → WATCH, and PRODUCT=LIVE was never claimed
  const passport = generatePassportForProject(store, submitted.project.project_id);
  assert.equal(passport.status, "WATCH");
  assert.equal(passport.dims.PRODUCT.status, "IDEA");
  assert.ok(JSON.stringify(passport.dims.PRODUCT.evidence).includes("LIVE MAINNET") === false);
});
