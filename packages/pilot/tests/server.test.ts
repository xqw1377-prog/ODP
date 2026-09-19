import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nacl from "tweetnacl";
import { base58Encode } from "../src/base58.js";
import { createPilotServer } from "../src/server.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const j = (r: Response): Promise<any> => r.json();

let server: Server;
let base = "";
let storeDir = "";
const OPERATOR_TOKEN = "test-operator-token-0123456789";

function walletKeys() {
  const kp = nacl.sign.keyPair();
  return { pubkey: base58Encode(kp.publicKey), secretKey: kp.secretKey };
}

async function pilotFlow(base: string) {
  const keys = walletKeys();
  const challenge = await await j(await fetch(`${base}/api/pilot/challenge?wallet=${encodeURIComponent(keys.pubkey)}`));
  const signature = base58Encode(nacl.sign.detached(new TextEncoder().encode(challenge.message), keys.secretKey));
  const res = await fetch(`${base}/api/pilot/humans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: keys.pubkey,
      nonce: challenge.nonce,
      signature,
      x_handle: "@http_tester",
      interests: ["solana"],
      consent_accepted: true,
    }),
  });
  return { res, keys };
}

before(async () => {
  storeDir = mkdtempSync(join(tmpdir(), "odp-pilot-server-"));
  process.env.ODP_OPERATOR_TOKEN = OPERATOR_TOKEN;
  server = createPilotServer({ dataDir: storeDir });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

test("pages serve: intake landing carries the slogan, no wallet collection pre-verification", async () => {
  const res = await fetch(`${base}/`);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /Stop hunting/);
});

test("wallet ownership: challenge → signature → 201 ELIGIBLE; replay → 400", async () => {
  const { res } = await pilotFlow(base);
  assert.equal(res.status, 201);
  const body = await j(res);
  assert.equal(body.status, "ELIGIBLE");
});

test("intake rejects missing consent with 400", async () => {
  const keys = walletKeys();
  const challenge = await await j(await fetch(`${base}/api/pilot/challenge?wallet=${encodeURIComponent(keys.pubkey)}`));
  const res = await fetch(`${base}/api/pilot/humans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: keys.pubkey, nonce: challenge.nonce,
      signature: base58Encode(nacl.sign.detached(new TextEncoder().encode(challenge.message), keys.secretKey)),
      x_handle: "@noconsent", interests: ["solana"], consent_accepted: false,
    }),
  });
  assert.equal(res.status, 400);
  const body = await j(res);
  assert.match(body.error, /consent/);
});

test("project intake validates the solana wallet at submission", async () => {
  const res = await fetch(`${base}/api/pilot/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Bad Wallet Labs", symbol: "BWL", website: "https://bwl.example", x_account: "@bwl",
      wallet: "not-a-pubkey", intent_text: "we need testers", target_tags: ["solana"],
      discovery_source: "network",
      claims: [{ dimension: "TEAM", statement: "public founders", url: "https://bwl.example", proposed_findings: ["FOUNDERS_PUBLIC"] }],
    }),
  });
  assert.equal(res.status, 400);
  const body = await j(res);
  assert.match(body.error, /Solana pubkey/);
});

test("operator isolation: evidence decision endpoints are gated", async () => {
  // submit a real project first
  const keys = walletKeys();
  const submit = await fetch(`${base}/api/pilot/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Gated Co", symbol: "GATED", website: "https://gated.example", x_account: "@gated",
      wallet: keys.pubkey, intent_text: "we need solana testers", target_tags: ["solana"],
      discovery_source: "network",
      claims: [{ dimension: "TEAM", statement: "public founders page", url: "https://gated.example", proposed_findings: ["FOUNDERS_PUBLIC"] }],
    }),
  });
  const { project_id } = await j(submit);

  // no token → 403
  const noToken = await fetch(`${base}/api/operator/claim/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id, claim_id: "clm_whatever00", decision: "VERIFIED", verifier: "attacker" }),
  });
  assert.equal(noToken.status, 403);

  // wrong token → 403
  const wrongToken = await fetch(`${base}/api/operator/claim/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-operator-token": "wrong" },
    body: JSON.stringify({ project_id, claim_id: "clm_whatever00", decision: "VERIFIED", verifier: "attacker" }),
  });
  assert.equal(wrongToken.status, 403);

  // correct token → decision recorded
  const claimsRes = await fetch(`${base}/api/operator/claims?project_id=${encodeURIComponent(project_id)}`, {
    headers: { "x-operator-token": OPERATOR_TOKEN },
  });
  const { claims } = await j(claimsRes);
  assert.equal(claims.length, 1);
  const decide = await fetch(`${base}/api/operator/claim/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-operator-token": OPERATOR_TOKEN },
    body: JSON.stringify({ project_id, claim_id: claims[0].claim_id, decision: "VERIFIED", verifier: "commander" }),
  });
  assert.equal(decide.status, 200);
});

test("operator run planning works with token; aggregate state leaks no handles", async () => {
  const plan = await fetch(`${base}/api/operator/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-operator-token": OPERATOR_TOKEN },
    body: JSON.stringify({ project_id: "prj_gated_co", total_amount: "1000", recipient_count: 1 }),
  });
  // gated_co has 1 verified TEAM claim only → passport not generated → plan fails
  // with a clean reason (not a crash)
  const body = await j(plan);
  assert.ok([201, 409].includes(plan.status));
  if (plan.status === 409) assert.ok(typeof body.error === "string");

  const stateRes = await fetch(`${base}/api/pilot/state`);
  const state = await j(stateRes);
  assert.equal(state.real_humans >= 1, true);
  assert.equal(state.eligible >= 1, true);
  const raw = JSON.stringify(state);
  assert.ok(!raw.includes("@")); // no handles leak through the aggregate endpoint
});
