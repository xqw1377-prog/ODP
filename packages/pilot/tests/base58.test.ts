import { test } from "node:test";
import assert from "node:assert/strict";
import { randomFillSync } from "node:crypto";
import { base58Decode, base58Encode } from "../src/base58.js";

test("base58 roundtrip preserves arbitrary bytes", () => {
  for (const bytes of [
    new Uint8Array([0, 0, 1, 2, 3]),
    new Uint8Array([255, 254, 128, 7]),
    new Uint8Array(32).fill(7),
    new Uint8Array([0]),
    cryptoRandom(64),
  ]) {
    assert.deepEqual(base58Decode(base58Encode(bytes)), bytes);
  }
});

test("base58 leading zero bytes map to '1' prefixes", () => {
  const encoded = base58Encode(new Uint8Array([0, 0, 9]));
  assert.ok(encoded.startsWith("11"), `expected leading 11, got ${encoded}`);
  assert.deepEqual(base58Decode(encoded), new Uint8Array([0, 0, 9]));
});

test("base58 rejects invalid characters and empty input", () => {
  assert.throws(() => base58Decode("0OIl"), /invalid character/);
  assert.throws(() => base58Decode(""), /empty input/);
});

function cryptoRandom(len: number): Uint8Array {
  const b = new Uint8Array(len);
  randomFillSync(b);
  return b;
}
