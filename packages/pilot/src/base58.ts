/* Pilot-local base58 (Bitcoin alphabet). Self-contained on purpose: signatures
   and pubkeys cross this boundary as base58 strings, and the frozen engines'
   base58 module only exposes encode. */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));

export function base58Encode(buf: Uint8Array): string {
  let n = 0n;
  for (const b of buf) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) {
    out = ALPHABET.charAt(Number(n % 58n)) + out;
    n /= 58n;
  }
  for (const b of buf) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out;
}

export function base58Decode(s: string): Uint8Array {
  if (s.length === 0) throw new Error("base58: empty input");
  let n = 0n;
  for (const c of s) {
    const i = INDEX.get(c);
    if (i === undefined) throw new Error(`base58: invalid character ${JSON.stringify(c)}`);
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const c of s) {
    if (c === "1") bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}
