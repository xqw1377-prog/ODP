import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

type PilotApi = {
  PHANTOM_MISSING: string;
  selectPhantom: (win: unknown) => { provider: unknown; source: string } | null;
  providerName: (provider: unknown) => string;
  mapWalletError: (err: unknown, provider: unknown) => Error;
  provider: (win?: unknown) => unknown;
  connectWallet: (options?: { waitMs?: number; window?: unknown }) => Promise<{ provider: unknown; pubkey: string }>;
  signMessage: (provider: unknown, message: string) => Promise<string>;
};

function loadPilot(win: Record<string, unknown> = {}, logs: unknown[][] = []): PilotApi {
  const code = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "pilot-app.js"), "utf8");
  const sandbox: vm.Context = {
    console: { log: (...args: unknown[]) => logs.push(args) },
    window: win,
    TextEncoder,
    globalThis: {},
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox);
  return sandbox.PILOT as PilotApi;
}

function phantomProvider(pubkey = "PhantomPubkey11111111111111111111111111111") {
  return {
    isPhantom: true,
    name: "Phantom",
    connect: async () => ({ publicKey: { toBase58: () => pubkey } }),
    signMessage: async (bytes: Uint8Array) => ({ signature: bytes }),
  };
}

function pollutedSolana() {
  return {
    isPhantom: false,
    name: "PollutedWallet",
    connect: async () => {
      throw new Error("Unexpected error");
    },
    signMessage: async () => {
      throw new Error("Unexpected error");
    },
  };
}

test("prefers window.phantom.solana over a polluted window.solana", async () => {
  const logs: unknown[][] = [];
  const phantom = phantomProvider();
  const PILOT = loadPilot({ phantom: { solana: phantom }, solana: pollutedSolana() }, logs);
  const chosen = PILOT.selectPhantom({ phantom: { solana: phantom }, solana: pollutedSolana() });
  assert.equal(chosen?.source, "window.phantom.solana");
  assert.equal(chosen?.provider, phantom);

  const { provider, pubkey } = await PILOT.connectWallet({ waitMs: 0 });
  assert.equal(provider, phantom);
  assert.equal(pubkey, "PhantomPubkey11111111111111111111111111111");
  assert.ok(logs.some((row) => JSON.stringify(row).includes("\"isPhantom\":true")));
  assert.ok(logs.some((row) => JSON.stringify(row).includes("Phantom")));
});

test("accepts window.solana only when isPhantom === true", async () => {
  const phantom = phantomProvider("OnlyFlaggedPhantom111111111111111111111");
  const PILOT = loadPilot({ solana: phantom });
  const { pubkey, provider } = await PILOT.connectWallet({ waitMs: 0 });
  assert.equal(provider, phantom);
  assert.equal(pubkey, "OnlyFlaggedPhantom111111111111111111111");
});

test("picks isPhantom from window.solana.providers when namespace is absent", async () => {
  const phantom = phantomProvider("FromProvidersArray11111111111111111111");
  const PILOT = loadPilot({
    solana: { isPhantom: false, name: "Aggregator", providers: [pollutedSolana(), phantom] },
  });
  const chosen = PILOT.selectPhantom({
    solana: { isPhantom: false, name: "Aggregator", providers: [pollutedSolana(), phantom] },
  });
  assert.equal(chosen?.source, "window.solana.providers[1]");
  const { pubkey } = await PILOT.connectWallet({ waitMs: 0 });
  assert.equal(pubkey, "FromProvidersArray11111111111111111111");
});

test("does not call connect() on a polluted window.solana", async () => {
  let connectCalls = 0;
  const polluted = {
    isPhantom: false,
    name: "EvilWallet",
    connect: async () => {
      connectCalls += 1;
      throw new Error("Unexpected error");
    },
  };
  const PILOT = loadPilot({ solana: polluted });
  await assert.rejects(() => PILOT.connectWallet({ waitMs: 0 }), { message: "Install/unlock Phantom" });
  assert.equal(connectCalls, 0);
});

test("maps Unexpected error and missing provider to Install/unlock Phantom", () => {
  const PILOT = loadPilot();
  assert.equal(PILOT.PHANTOM_MISSING, "Install/unlock Phantom");
  assert.equal(PILOT.mapWalletError(new Error("Unexpected error"), { isPhantom: true }).message, "Install/unlock Phantom");
  assert.equal(PILOT.mapWalletError(new Error("boom"), null).message, "Install/unlock Phantom");
  assert.equal(PILOT.mapWalletError(new Error("User rejected the request"), { isPhantom: true }).message, "User rejected the request");
});

test("provider debug name uses isPhantom, not a polluted wallet name", () => {
  const PILOT = loadPilot();
  assert.equal(PILOT.providerName({ isPhantom: true, name: "something-else" }), "Phantom");
  assert.equal(PILOT.providerName({ isPhantom: false, name: "PollutedWallet" }), "PollutedWallet");
  assert.equal(PILOT.providerName(null), "none");
});
