import { z } from "zod";

/** ISO-8601 timestamp string. */
export const ISOString = z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
  message: "expected ISO-8601 timestamp",
});
export type ISOString = z.infer<typeof ISOString>;

export const U64_MAX = 18_446_744_073_709_551_615n; // 2^64 - 1

/** Total BigInt conversion: invalid literals yield null instead of throwing
 *  (zod v4 runs refinements even after an earlier check failed). */
function toBigintOrNull(s: string): bigint | null {
  try {
    return BigInt(s);
  } catch {
    return null;
  }
}

/**
 * Canonical base-10 unsigned integer string within the u64 range
 * (0 ..= 2^64-1, digits only, no leading zeros).
 * All ODP amounts use this representation — never float.
 */
export const U64String = z
  .string()
  .regex(/^\d+$/, { message: "expected base-10 digits only" })
  .refine((s) => toBigintOrNull(s)?.toString() === s, {
    message: "non-canonical integer (leading zeros are not allowed)",
  })
  .refine((s) => {
    const v = toBigintOrNull(s);
    return v !== null && v <= U64_MAX;
  }, { message: "value exceeds u64 range (2^64-1)" });
export type U64String = z.infer<typeof U64String>;

/**
 * Business-positive amount (> 0) for Distribution.total_amount,
 * Allocation.amount and receipt amounts. The u64 *type* bound and the
 * business "> 0" rule are deliberately separate concerns.
 */
export const PositiveU64String = U64String.refine((s) => {
  const v = toBigintOrNull(s);
  return v !== null && v > 0n;
}, {
  message: "amount must be greater than zero",
});
export type PositiveU64String = z.infer<typeof PositiveU64String>;

export function nowIso(): string {
  return new Date().toISOString();
}
