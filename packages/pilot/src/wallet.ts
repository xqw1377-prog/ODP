const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decode Bitcoin-alphabet base58 (same alphabet as Solana pubkeys). */
export function base58Decode(s: string): Uint8Array {
  if (s.length === 0 || /[^1-9A-HJ-NP-Za-km-z]/.test(s)) {
    throw new Error("value is not valid base58");
  }
  let n = 0n;
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("value is not valid base58");
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.push(Number(n % 256n));
    n /= 256n;
  }
  bytes.reverse();
  let leading = 0;
  for (const ch of s) {
    if (ch === "1") leading += 1;
    else break;
  }
  const out = new Uint8Array(leading + bytes.length);
  out.set(bytes, leading);
  return out;
}

/** Fail closed: wallet must be a 32-byte Solana pubkey in base58. */
export function assertSolanaPubkey(wallet: string): string {
  const bytes = base58Decode(wallet);
  if (bytes.length !== 32) {
    throw new Error(`wallet must be a 32-byte Solana pubkey (got ${bytes.length} bytes)`);
  }
  return wallet;
}
