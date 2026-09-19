import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HumanProfileSchema } from "@odp/domain";
import {
  EARLY_HUMAN_V0_UNSCORED,
  LANDING_SUB,
  SLOGAN,
  intakeHuman,
} from "../src/human-intake.js";
import { persistHumanIntake, loadOptInHumans } from "../src/persist.js";
import { readPilotPool } from "../src/pool.js";
import { HUMAN_INTAKES, tempPilotDir } from "./helpers.js";

const ada = JSON.parse(readFileSync(HUMAN_INTAKES[0]!, "utf8"));

describe("Early Humans V0 intake", () => {
  it("slogan is the product line", () => {
    assert.equal(SLOGAN, "Stop hunting. Get discovered.");
    assert.match(LANDING_SUB, /Connect your X and Solana wallet/);
    assert.ok(!/join our beta/i.test(LANDING_SUB));
  });

  it("persists a frozen HumanProfile after stub X + wallet + 3–5 tags + consent", () => {
    const result = intakeHuman(ada);
    HumanProfileSchema.parse(result.profile);
    assert.equal(result.profile.human_id, "hum_pilot_ada");
    assert.equal(result.profile.x_id, "@pilot_ada");
    assert.deepEqual(result.profile.interest_tags, ["solana", "depin", "node_operator", "early_adopter"]);
    assert.deepEqual(result.profile.risk_flags, []);
    assert.equal(result.profile.human_confidence, EARLY_HUMAN_V0_UNSCORED.human_confidence);
    assert.equal(result.profile.reputation, 0);
    assert.equal(result.profile.network_score, 0);
    assert.equal(result.consent.opted_in, true);
    assert.equal(result.consent.x_source, "stub");
    assert.equal(result.consent.slogan, SLOGAN);
    assert.equal(result.consent.funnel_stage, "ELIGIBLE_HUMAN");
  });

  it("rejects missing opt-in consent", () => {
    assert.throws(() => intakeHuman({ ...ada, consent: false }), /consent/);
  });

  it("rejects stub X without acknowledgement", () => {
    assert.throws(() => intakeHuman({ ...ada, x_stub_acknowledged: false }), /x_stub_acknowledged/);
  });

  it("rejects fewer than 3 or more than 5 tags, and unknown tags", () => {
    assert.throws(() => intakeHuman({ ...ada, interest_tags: ["Solana", "DePIN"] }), /interest_tags/);
    assert.throws(
      () => intakeHuman({ ...ada, interest_tags: ["Solana", "DePIN", "AI", "Developer", "DeFi", "Gaming"] }),
      /interest_tags/,
    );
    assert.throws(() => intakeHuman({ ...ada, interest_tags: ["Solana", "DePIN", "airdrops"] }), /unknown interest tag/);
  });

  it("rejects a non-32-byte wallet", () => {
    assert.throws(() => intakeHuman({ ...ada, wallet: "not-a-pubkey" }), /base58|wallet/);
  });

  it("refuses to load humans without a consent sidecar", () => {
    const dir = tempPilotDir();
    persistHumanIntake(intakeHuman(ada), dir);
    assert.equal(loadOptInHumans(dir).length, 1);

    mkdirSync(path.join(dir, "humans"), { recursive: true });
    writeFileSync(
      path.join(dir, "humans", "hum_orphan.json"),
      JSON.stringify({
        human_id: "hum_orphan",
        x_id: "@orphan",
        wallet: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        human_confidence: 0.45,
        reputation: 0.2,
        network_score: 0.2,
        interest_tags: ["solana", "depin", "ai"],
        risk_flags: [],
      }) + "\n",
    );
    assert.throws(() => loadOptInHumans(dir), /no opt-in consent/);
  });

  it("only ELIGIBLE humans count as the pool; multi-wallet is REVIEW", () => {
    const dir = tempPilotDir();
    persistHumanIntake(intakeHuman(ada), dir);
    const clash = persistHumanIntake(
      intakeHuman({
        ...ada,
        x_handle: "@pilot_ada_alt",
        wallet: ada.wallet,
      }),
      dir,
    );
    assert.deepEqual(clash.consent.review_flags, ["MULTI_WALLET"]);
    assert.equal(clash.consent.funnel_stage, "WALLET_BOUND");
    assert.equal(loadOptInHumans(dir).length, 1);
    const pool = readPilotPool(dir);
    assert.equal(pool.eligible, 1);
    assert.equal(pool.target, 30);
    assert.equal(pool.stretch_hold, 1000);
    assert.equal(pool.review.length, 1);
  });
});
