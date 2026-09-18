import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  ProjectCandidateSchema,
  ProjectPassportSchema,
  HumanProfileSchema,
  MatchResultSchema,
  DistributionSchema,
  AllocationSchema,
  DistributionReceiptSchema,
  createDistribution,
  buildReceipt,
} from "../src/index.js";
import { loadJson } from "./helpers.js";

// ── G1: every frozen schema accepts its golden fixtures ────────────────

describe("ProjectCandidate schema", () => {
  it("parses all three golden candidates", () => {
    for (const f of ["aurora", "nimbus", "phantomx"]) {
      const candidate = ProjectCandidateSchema.parse(
        loadJson(`../fixtures/projects/${f}.candidate.json`),
      );
      assert.ok(candidate.project_id.length > 0);
      assert.ok(candidate.discovery_sources.length > 0);
    }
  });

  it("rejects missing required field", () => {
    const bad = loadJson("../fixtures/projects/aurora.candidate.json") as Record<string, unknown>;
    delete bad.project_id;
    assert.throws(() => ProjectCandidateSchema.parse(bad));
  });

  it("rejects empty discovery_sources", () => {
    const bad = {
      ...(loadJson("../fixtures/projects/aurora.candidate.json") as Record<string, unknown>),
      discovery_sources: [],
    };
    assert.throws(() => ProjectCandidateSchema.parse(bad));
  });

  it("rejects malformed website url", () => {
    const bad = {
      ...(loadJson("../fixtures/projects/aurora.candidate.json") as Record<string, unknown>),
      website: "not-a-url",
    };
    assert.throws(() => ProjectCandidateSchema.parse(bad));
  });
});

describe("ProjectPassport schema", () => {
  it("parses all three golden passports (ALLOW / WATCH / REJECT)", () => {
    for (const f of ["aurora", "nimbus", "phantomx"]) {
      const passport = ProjectPassportSchema.parse(
        loadJson(`../fixtures/passports/${f}.passport.json`),
      );
      assert.ok(["ALLOW", "WATCH", "REJECT"].includes(passport.status));
      assert.ok(passport.reasons.length > 0);
    }
  });

  it("rejects unknown dimension status vocabulary", () => {
    const bad = loadJson("../fixtures/passports/aurora.passport.json") as {
      dims: Record<string, { status: string }>;
    };
    bad.dims.TEAM!.status = "GREAT";
    assert.throws(() => ProjectPassportSchema.parse(bad));
  });

  it("rejects invalid evidence entry (missing detail)", () => {
    const bad = loadJson("../fixtures/passports/aurora.passport.json") as {
      dims: Record<string, { evidence: Record<string, unknown>[] }>;
    };
    delete bad.dims.TEAM!.evidence[0]!.detail;
    assert.throws(() => ProjectPassportSchema.parse(bad));
  });

  it("rejects overall status outside ALLOW/WATCH/REJECT", () => {
    const bad = { ...(loadJson("../fixtures/passports/aurora.passport.json") as Record<string, unknown>), status: "MAYBE" };
    assert.throws(() => ProjectPassportSchema.parse(bad));
  });
});

describe("HumanProfile schema", () => {
  it("parses all three human fixtures", () => {
    for (const f of ["maya", "dev_dan", "sib"]) {
      HumanProfileSchema.parse(loadJson(`../fixtures/humans/${f}.json`));
    }
  });

  it("rejects empty interest_tags", () => {
    const bad = { ...(loadJson("../fixtures/humans/maya.json") as Record<string, unknown>), interest_tags: [] };
    assert.throws(() => HumanProfileSchema.parse(bad));
  });

  it("rejects unknown risk flag", () => {
    const bad = { ...(loadJson("../fixtures/humans/maya.json") as Record<string, unknown>), risk_flags: ["MEGA_SYBIL"] };
    assert.throws(() => HumanProfileSchema.parse(bad));
  });

  it("rejects out-of-range human_confidence", () => {
    const bad = { ...(loadJson("../fixtures/humans/maya.json") as Record<string, unknown>), human_confidence: 1.5 };
    assert.throws(() => HumanProfileSchema.parse(bad));
  });
});

describe("MatchResult schema", () => {
  const valid = {
    project_id: "prj_aurora_net",
    human_id: "hum_maya",
    match_score: 0.82,
    match_reasons: ["interest overlap: solana, depin"],
  } as const;

  it("accepts a valid match with reasons", () => {
    MatchResultSchema.parse(valid);
  });

  it("rejects black-box score (empty match_reasons)", () => {
    assert.throws(() => MatchResultSchema.parse({ ...valid, match_reasons: [] }));
  });

  it("rejects out-of-range match_score", () => {
    assert.throws(() => MatchResultSchema.parse({ ...valid, match_score: 1.2 }));
  });
});

describe("Distribution / Allocation / Receipt schemas", () => {
  it("createDistribution yields a valid PENDING_DEPOSIT record", () => {
    const d = createDistribution("dst_001", "prj_aurora_net", "AURAt0kEnAddr3ssExampleX7qVNE9dJm1LkzPwR4TgHc", "1000000");
    assert.equal(d.status, "PENDING_DEPOSIT");
    assert.equal(d.vault, null);
    DistributionSchema.parse(d);
  });

  it("rejects non-canonical amounts (decimal / leading zeros / negative)", () => {
    for (const amount of ["10.5", "007", "-3"]) {
      assert.throws(() =>
        AllocationSchema.parse({ distribution_id: "dst_001", human_id: "hum_maya", wallet: "W", amount }),
      );
    }
  });

  it("rejects malformed allocation_root", () => {
    assert.throws(() =>
      DistributionSchema.parse({
        distribution_id: "dst_001",
        project_id: "p",
        token_mint: "m",
        vault: "v",
        allocation_root: "not-hex",
        total_amount: "100",
        total_recipients: 1,
        status: "COMMITTED",
        created_at: "2026-09-18T00:00:00Z",
        deposit_tx: "tx",
        committed_at: "2026-09-18T00:01:00Z",
        closed_at: null,
      }),
    );
  });

  it("rejects receipt without claim_tx", () => {
    const receipt = buildReceipt({
      project_id: "prj_aurora_net",
      distribution_id: "dst_001",
      wallet: "MayaWa11etAddressExample1111111111111111111111",
      amount: "4200",
      token_mint: "AURAt0kEnAddr3ssExampleX7qVNE9dJm1LkzPwR4TgHc",
      claim_tx: "5 ClaimTxSignatureExample000000000000000000000000000",
      claimed_at: "2026-09-18T10:00:00Z",
      allocation_root: "ab".repeat(32),
    });
    assert.equal(receipt.amount, "4200");

    assert.throws(() =>
      buildReceipt({
        ...receipt,
        claim_tx: "",
      } as never),
    );
  });
});
