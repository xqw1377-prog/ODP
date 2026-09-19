/* Controlled interest vocabulary (D-decision): the frozen matcher scores
   interest fit by EXACT set intersection, so free-text tags would silently
   score zero on typos. Intake forms offer checkboxes from this list; project
   target_tags must come from the same list. Extending the vocabulary later is
   a pilot-layer change and never touches the engines. */

export const INTEREST_VOCABULARY = [
  "solana",
  "defi",
  "depin",
  "nft",
  "gaming",
  "ai",
  "infrastructure",
  "early_adopter",
  "hardware",
  "developer",
  "trader",
  "liquidity_provider",
  "community",
  "mobile",
] as const;

export type InterestTag = (typeof INTEREST_VOCABULARY)[number];

export function isVocabularyTag(tag: string): tag is InterestTag {
  return (INTEREST_VOCABULARY as readonly string[]).includes(tag);
}

/** Returns the unknown tags (empty = all good). */
export function unknownTags(tags: string[]): string[] {
  return tags.filter((t) => !isVocabularyTag(t));
}
