/**
 * Early Humans V0 interest catalog.
 *
 * Display labels are the product list. Slugs are what HumanProfile.interest_tags
 * and ProjectMatchIntent.target_tags store so matching-engine can intersect them.
 * This file does not change MATCH_WEIGHTS or the match formula.
 */

export const EARLY_HUMAN_TAGS = [
  { slug: "solana", label: "Solana" },
  { slug: "depin", label: "DePIN" },
  { slug: "ai", label: "AI" },
  { slug: "developer", label: "Developer" },
  { slug: "node_operator", label: "Node Operator" },
  { slug: "consumer_crypto", label: "Consumer Crypto" },
  { slug: "defi", label: "DeFi" },
  { slug: "gaming", label: "Gaming" },
  { slug: "infrastructure", label: "Infrastructure" },
  { slug: "early_adopter", label: "Early Adopter" },
] as const;

export type EarlyHumanTagSlug = (typeof EARLY_HUMAN_TAGS)[number]["slug"];

const SLUGS = new Set<string>(EARLY_HUMAN_TAGS.map((t) => t.slug));
const LABEL_TO_SLUG = new Map<string, EarlyHumanTagSlug>(
  EARLY_HUMAN_TAGS.flatMap((t) => [
    [t.slug, t.slug],
    [t.label.toLowerCase(), t.slug],
  ]),
);

/** Phrase matchers, longest first, so "node operator" wins over a bare word. */
const TEXT_PATTERNS: ReadonlyArray<readonly [RegExp, EarlyHumanTagSlug]> = [
  [/\bnode\s*operators?\b/i, "node_operator"],
  [/\bearly\s*adopters?\b/i, "early_adopter"],
  [/\bconsumer\s*crypto\b/i, "consumer_crypto"],
  [/\binfrastructure\b/i, "infrastructure"],
  [/\bdevelopers?\b/i, "developer"],
  [/\bsolana\b/i, "solana"],
  [/\bdepin\b/i, "depin"],
  [/\bdefi\b/i, "defi"],
  [/\bgaming\b/i, "gaming"],
  [/\bai\b/i, "ai"],
];

export function isEarlyHumanTagSlug(value: string): value is EarlyHumanTagSlug {
  return SLUGS.has(value);
}

/** Accept a catalog slug or its display label; reject unknown tags. */
export function normalizeTag(raw: string): EarlyHumanTagSlug {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const slug = LABEL_TO_SLUG.get(key) ?? LABEL_TO_SLUG.get(key.replace(/\s+/g, "_"));
  if (slug === undefined) {
    throw new Error(
      `unknown interest tag ${JSON.stringify(raw)} — Early Humans V0 allows: ${EARLY_HUMAN_TAGS.map((t) => t.label).join(", ")}`,
    );
  }
  return slug;
}

/** Pull catalog tags out of free-text "what humans do you need?". Never invent tags. */
export function extractTagsFromText(text: string): EarlyHumanTagSlug[] {
  const found = new Set<EarlyHumanTagSlug>();
  for (const [re, slug] of TEXT_PATTERNS) {
    if (re.test(text)) found.add(slug);
  }
  return EARLY_HUMAN_TAGS.map((t) => t.slug).filter((slug) => found.has(slug));
}

export function labelForTag(slug: string): string {
  return EARLY_HUMAN_TAGS.find((t) => t.slug === slug)?.label ?? slug;
}
