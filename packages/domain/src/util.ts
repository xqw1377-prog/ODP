import { z } from "zod";

/** ISO-8601 timestamp string. */
export const ISOString = z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
  message: "expected ISO-8601 timestamp",
});
export type ISOString = z.infer<typeof ISOString>;

/**
 * Canonical base-10 unsigned integer string (u64-safe).
 * All token amounts in ODP use this representation — never float.
 */
export const U64String = z
  .string()
  .regex(/^\d+$/, { message: "expected base-10 digits only" })
  .refine((s) => BigInt(s).toString() === s, {
    message: "non-canonical integer (leading zeros are not allowed)",
  });
export type U64String = z.infer<typeof U64String>;

export function nowIso(): string {
  return new Date().toISOString();
}
