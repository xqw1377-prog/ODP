import { test } from "node:test";
import assert from "node:assert/strict";
import { INTEREST_VOCABULARY, isVocabularyTag, unknownTags } from "../src/vocabulary.js";

test("vocabulary has no duplicates and is uppercase-safe by construction", () => {
  assert.equal(new Set(INTEREST_VOCABULARY).size, INTEREST_VOCABULARY.length);
  for (const tag of INTEREST_VOCABULARY) assert.match(tag, /^[a-z_]+$/);
});

test("exact-intersection matching means unknown tags must be caught at intake", () => {
  assert.deepEqual(unknownTags(["solana", "depin"]), []);
  assert.deepEqual(unknownTags(["Solana"]), ["Solana"]); // case-sensitive by design
  assert.deepEqual(unknownTags(["defi", "deffi"]), ["deffi"]);
  assert.equal(isVocabularyTag("developer"), true);
  assert.equal(isVocabularyTag("dev"), false);
});
