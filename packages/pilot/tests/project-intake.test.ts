import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { intakeProject, intakeProjectFromFile, ProjectBriefSchema } from "../src/project-intake.js";
import { extractTagsFromText } from "../src/tags.js";
import { HELIOS_BRIEF } from "./helpers.js";

describe("project intake adapter", () => {
  it("converts a non-Aurora brief into candidate + intent and calls generatePassport", () => {
    const result = intakeProjectFromFile(HELIOS_BRIEF);
    assert.equal(result.candidate.project_id, "prj_helios_mesh");
    assert.notEqual(result.candidate.project_id, "prj_aurora_net");
    assert.equal(result.candidate.name, "Helios Mesh");
    assert.equal(result.candidate.x_account, "@heliosmesh");
    assert.equal(result.candidate.chain, "solana");
    assert.deepEqual(result.intent.project_id, "prj_helios_mesh");
    assert.deepEqual(result.intent.target_tags, ["solana", "depin", "node_operator", "early_adopter"]);
    assert.equal(result.passport.project_id, "prj_helios_mesh");
    assert.equal(result.passport.status, "ALLOW");
    assert.ok(result.passport.reasons.length >= 1);
  });

  it("extracts catalog tags from humans_needed free text (does not invent tags)", () => {
    assert.deepEqual(extractTagsFromText("Need Solana DePIN node operators and early adopters"), [
      "solana",
      "depin",
      "node_operator",
      "early_adopter",
    ]);
    assert.deepEqual(extractTagsFromText("looking for friends only"), []);
  });

  it("refuses to invent Passport findings when evidence is missing", () => {
    const brief = ProjectBriefSchema.parse({
      name: "Bare Project",
      x: "@bareproj",
      website: "https://bare.example",
      humans_needed: "Solana developers",
    });
    assert.throws(() => intakeProject(brief), /will not invent Passport findings/);
  });

  it("fail-closes on evidence project_id mismatch", () => {
    const raw = JSON.parse(readFileSync(HELIOS_BRIEF, "utf8")) as Record<string, unknown>;
    raw.project_id = "prj_other_mesh";
    assert.throws(() => intakeProject(raw, { briefDir: path.dirname(HELIOS_BRIEF) }), /does not bind/);
  });
});
