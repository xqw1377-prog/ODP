import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  U64String,
  PositiveU64String,
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
import type { DistributionReceipt, ProjectPassport } from "../src/index.js";
import { loadJson } from "./helpers.js";

const MINT = "AURAt0kEnAddr3ssExampleX7qVNE9dJm1LkzPwR4TgHc";

function auroraCandidate(): Record<string, unknown> {
  return loadJson("../fixtures/projects/aurora.candidate.json") as Record<string, unknown>;
}
function auroraPassport(): ProjectPassport {
  return ProjectPassportSchema.parse(loadJson("../fixtures/passports/aurora.passport.json"));
}
function validReceipt(): DistributionReceipt {
  return buildReceipt({
    project_id: "prj_aurora_net",
    distribution_id: "dst_001",
    wallet: "MayaWa11etAddressExample1111111111111111111111",
    amount: "4200",
    token_mint: MINT,
    claim_tx: "5ClaimTxSignatureExample00000000000000000000000000",
    claimed_at: "2026-09-18T10:00:00Z",
    allocation_root: "ab".repeat(32),
  });
}

// ── R1: U64 boundaries ─────────────────────────────────────────────────

describe("U64 / PositiveU64 string format (R1)", () => {
  const cases: Array<[string, boolean]> = [
    ["0", true],
    ["18446744073709551615", true], // 2^64 - 1
    ["18446744073709551616", false], // 2^64
    ["-1", false],
    ["01", false],
    ["1.0", false],
  ];
  for (const [value, ok] of cases) {
    it(`U64String ${value} → ${ok ? "PASS" : "REJECT"}`, () => {
      assert.equal(U64String.safeParse(value).success, ok);
    });
  }

  it("PositiveU64String rejects zero while U64String accepts it", () => {
    assert.equal(U64String.safeParse("0").success, true);
    assert.equal(PositiveU64String.safeParse("0").success, false);
    assert.equal(PositiveU64String.safeParse("1").success, true);
  });

  it("u64 max is a valid allocation amount", () => {
    assert.equal(
      AllocationSchema.safeParse({
        distribution_id: "dst_001",
        human_id: "hum_maya",
        wallet: "MayaWa11etAddressExample1111111111111111111111",
        amount: "18446744073709551615",
      }).success,
      true,
    );
  });

  it("business amounts (total_amount / allocation.amount) must be > 0", () => {
    assert.throws(() =>
      AllocationSchema.parse({
        distribution_id: "dst_001",
        human_id: "hum_maya",
        wallet: "MayaWa11etAddressExample1111111111111111111111",
        amount: "0",
      }),
    );
    assert.throws(() => createDistribution("dst_001", "prj_aurora_net", MINT, "0"));
  });
});

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
    const bad = auroraCandidate();
    delete bad.project_id;
    assert.throws(() => ProjectCandidateSchema.parse(bad));
  });

  it("rejects empty discovery_sources", () => {
    const bad = { ...auroraCandidate(), discovery_sources: [] };
    assert.throws(() => ProjectCandidateSchema.parse(bad));
  });

  it("rejects malformed website url", () => {
    const bad = { ...auroraCandidate(), website: "not-a-url" };
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
      dims: Record<string, { evidence: Array<Record<string, unknown>> }>;
    };
    delete (bad.dims.TEAM!.evidence[0] as { detail?: unknown }).detail;
    assert.throws(() => ProjectPassportSchema.parse(bad));
  });

  it("rejects overall status outside ALLOW/WATCH/REJECT", () => {
    const bad = { ...(loadJson("../fixtures/passports/aurora.passport.json") as Record<string, unknown>), status: "MAYBE" };
    assert.throws(() => ProjectPassportSchema.parse(bad));
  });
});

// ── R4: explainability invariants ──────────────────────────────────────

describe("passport explainability invariants (R4)", () => {
  it("empty reasons rejected", () => {
    const bad = auroraPassport();
    bad.reasons = [];
    assert.throws(() => ProjectPassportSchema.parse(bad), /reasons/);
  });

  it("history ending at a status different from current rejected", () => {
    const bad = auroraPassport();
    bad.status = "WATCH"; // history last .to is still ALLOW
    assert.throws(() => ProjectPassportSchema.parse(bad));
  });

  it("history not starting at DISCOVERED rejected", () => {
    const bad = auroraPassport();
    bad.status_history[0]!.from = "WATCH";
    assert.throws(() => ProjectPassportSchema.parse(bad));
  });

  it("broken history chain rejected", () => {
    const bad = auroraPassport();
    bad.status_history = [
      { from: "DISCOVERED", to: "WATCH", reason: "initial", at: "2026-09-10T09:00:00Z" },
      { from: "REJECT", to: "ALLOW", reason: "chain is broken here", at: "2026-09-10T10:00:00Z" },
    ];
    assert.throws(() => ProjectPassportSchema.parse(bad));
  });

  it("empty status_history rejected", () => {
    const bad = auroraPassport();
    bad.status_history = [];
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

// ── R6: frozen schemas are strict ──────────────────────────────────────

describe("frozen schemas are strict (R6)", () => {
  const validMatch = {
    project_id: "prj_aurora_net",
    human_id: "hum_maya",
    match_score: 0.82,
    match_reasons: ["interest overlap: solana, depin"],
  };
  const validAllocation = {
    distribution_id: "dst_001",
    human_id: "hum_maya",
    wallet: "MayaWa11etAddressExample1111111111111111111111",
    amount: "4200",
  };

  it("unknown top-level field rejected on all 7 schemas", () => {
    assert.throws(() => ProjectCandidateSchema.parse({ ...auroraCandidate(), magic_trust_score: 999 }));
    assert.throws(() => ProjectPassportSchema.parse({ ...auroraPassport(), magic_trust_score: 999 }));
    assert.throws(() =>
      HumanProfileSchema.parse({ ...(loadJson("../fixtures/humans/maya.json") as Record<string, unknown>), magic_trust_score: 999 }),
    );
    assert.throws(() => MatchResultSchema.parse({ ...validMatch, magic_trust_score: 999 }));
    assert.throws(() =>
      DistributionSchema.parse({ ...createDistribution("dst_001", "prj_aurora_net", MINT, "8000"), magic_trust_score: 999 }),
    );
    assert.throws(() => AllocationSchema.parse({ ...validAllocation, magic_trust_score: 999 }));
    assert.equal(DistributionReceiptSchema.safeParse({ ...validReceipt(), magic_trust_score: 999 }).success, false);
  });

  it("unknown nested field inside dims rejected", () => {
    const bad = loadJson("../fixtures/passports/aurora.passport.json") as {
      dims: Record<string, Record<string, unknown>>;
    };
    bad.dims.TEAM!.extra_field = 1;
    assert.throws(() => ProjectPassportSchema.parse(bad));
  });

  it("unknown nested field inside evidence rejected", () => {
    const bad = loadJson("../fixtures/passports/aurora.passport.json") as {
      dims: Record<string, { evidence: Array<Record<string, unknown>> }>;
    };
    bad.dims.TEAM!.evidence[0]!.confidence = 0.99;
    assert.throws(() => ProjectPassportSchema.parse(bad));
  });
});

// ── Distribution / Allocation / Receipt basics ─────────────────────────

describe("Distribution / Allocation / Receipt schemas", () => {
  it("createDistribution yields a valid PENDING_DEPOSIT record", () => {
    const d = createDistribution("dst_001", "prj_aurora_net", MINT, "1000000");
    assert.equal(d.status, "PENDING_DEPOSIT");
    assert.equal(d.vault, null);
    DistributionSchema.parse(d);
  });

  it("rejects malformed allocation_root", () => {
    assert.throws(() =>
      DistributionSchema.parse({
        distribution_id: "dst_001",
        project_id: "prj_aurora_net",
        token_mint: MINT,
        vault: "Va11tAddressExample0000000000000000000000000",
        allocation_root: "NOTHEX",
        total_amount: "100",
        total_recipients: 1,
        status: "COMMITTED",
        created_at: "2026-09-18T00:00:00Z",
        deposit_tx: "DepositTxExample000000000000000000000000000000000",
        committed_at: "2026-09-18T00:01:00Z",
        closed_at: null,
      }),
    );
  });

  it("builds a valid receipt and rejects one without claim_tx", () => {
    const receipt = validReceipt();
    assert.equal(receipt.amount, "4200");
    assert.throws(() => buildReceipt({ ...receipt, claim_tx: "" }));
  });
});
