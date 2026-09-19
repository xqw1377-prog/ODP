/* ODP Pilot — shared page logic. Minimal by design: truth > polish. */

const PHANTOM_MISSING = "Install/unlock Phantom";

function errText(err) {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (typeof err.message === "string" && err.message) return err.message;
  return String(err);
}

function providerName(provider) {
  if (!provider) return "none";
  if (provider.isPhantom === true) return "Phantom";
  if (provider.isSolflare === true) return "Solflare";
  if (provider.isBackpack === true) return "Backpack";
  if (provider.isBraveWallet === true) return "Brave";
  if (typeof provider.name === "string" && provider.name) return provider.name;
  return "unknown";
}

/** Inventory injected providers. Never treat a random window.solana as Phantom. */
function collectProviders(win) {
  const out = [];
  const phantomNs = win?.phantom?.solana;
  if (phantomNs) out.push({ provider: phantomNs, source: "window.phantom.solana" });
  const sol = win?.solana;
  if (sol) {
    out.push({ provider: sol, source: "window.solana" });
    if (Array.isArray(sol.providers)) {
      for (let i = 0; i < sol.providers.length; i += 1) {
        const extra = sol.providers[i];
        if (extra) out.push({ provider: extra, source: `window.solana.providers[${i}]` });
      }
    }
  }
  return out;
}

/**
 * Prefer the Phantom namespace, else any provider with isPhantom === true.
 * Do not fall back to a polluted window.solana.
 */
function selectPhantom(win) {
  const found = collectProviders(win);
  const fromNs = found.find((c) => c.source === "window.phantom.solana");
  if (fromNs) return fromNs;
  const flagged = found.find((c) => c.provider?.isPhantom === true);
  return flagged ?? null;
}

function logProviderChoice(selected, win) {
  const inventory = collectProviders(win).map((c) => ({
    source: c.source,
    name: providerName(c.provider),
    isPhantom: c.provider?.isPhantom === true,
  }));
  if (selected) {
    console.log("[ODP wallet] selected", {
      name: providerName(selected.provider),
      isPhantom: selected.provider?.isPhantom === true,
      source: selected.source,
      inventory,
    });
    return;
  }
  console.log("[ODP wallet] no Phantom provider", {
    name: "none",
    isPhantom: false,
    hasWindowPhantom: Boolean(win?.phantom?.solana),
    hasWindowSolana: Boolean(win?.solana),
    windowSolanaIsPhantom: win?.solana?.isPhantom === true,
    inventory,
  });
}

function mapWalletError(err, provider) {
  const msg = errText(err);
  if (/user rejected|rejected the request|cancelled|canceled|denied/i.test(msg)) {
    return err instanceof Error ? err : new Error(msg);
  }
  if (!provider || provider.isPhantom !== true || /unexpected error/i.test(msg)) {
    return new Error(PHANTOM_MISSING);
  }
  return err instanceof Error ? err : new Error(msg || PHANTOM_MISSING);
}

function readPubkey(resp, provider) {
  const key = resp?.publicKey ?? provider?.publicKey;
  if (!key) return "";
  if (typeof key.toBase58 === "function") return key.toBase58();
  if (typeof key === "string") return key;
  if (typeof key.toString === "function") {
    const printed = key.toString();
    if (printed && printed !== "[object Object]") return printed;
  }
  return "";
}

const PILOT = {
  PHANTOM_MISSING,
  esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  },

  selectPhantom,
  providerName,
  mapWalletError,

  injectedWindow() {
    return typeof window !== "undefined" ? window : globalThis;
  },

  /** Phantom only — never a blind window.solana fallback. */
  provider(win) {
    const scope = win ?? PILOT.injectedWindow();
    const selected = selectPhantom(scope);
    logProviderChoice(selected, scope);
    return selected?.provider ?? null;
  },

  async waitForPhantom(waitMs, win) {
    const scope = win ?? PILOT.injectedWindow();
    const existing = selectPhantom(scope);
    if (existing) return existing;
    const budget = typeof waitMs === "number" ? waitMs : 800;
    if (budget <= 0) return null;
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (typeof scope.removeEventListener === "function") {
          scope.removeEventListener("phantom#initialized", onReady);
        }
        clearInterval(tick);
        clearTimeout(timeout);
        resolve(value);
      };
      const probe = () => {
        const found = selectPhantom(scope);
        if (found) finish(found);
      };
      const onReady = () => probe();
      if (typeof scope.addEventListener === "function") {
        scope.addEventListener("phantom#initialized", onReady);
      }
      const tick = setInterval(probe, 80);
      const timeout = setTimeout(() => finish(selectPhantom(scope)), budget);
    });
  },

  async connectWallet(options) {
    const waitMs = options && typeof options.waitMs === "number" ? options.waitMs : 800;
    const win = options && options.window ? options.window : PILOT.injectedWindow();
    const selected = await PILOT.waitForPhantom(waitMs, win);
    logProviderChoice(selected, win);
    const provider = selected?.provider ?? null;
    if (!provider || typeof provider.connect !== "function") {
      throw new Error(PHANTOM_MISSING);
    }
    try {
      const resp = await provider.connect();
      const pubkey = readPubkey(resp, provider);
      if (!pubkey) throw new Error(PHANTOM_MISSING);
      return { provider, pubkey };
    } catch (err) {
      throw mapWalletError(err, provider);
    }
  },

  toBase58(bytes) {
    // minimal base58 encoder (wallet messages / signatures)
    const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    let out = "";
    while (n > 0n) {
      out = A[Number(n % 58n)] + out;
      n /= 58n;
    }
    for (const b of bytes) {
      if (b === 0) out = "1" + out;
      else break;
    }
    return out;
  },

  async signMessage(provider, message) {
    if (!provider || typeof provider.signMessage !== "function") {
      throw new Error(PHANTOM_MISSING);
    }
    try {
      const encoded = new TextEncoder().encode(message);
      const resp = await provider.signMessage(encoded, "utf8");
      return PILOT.toBase58(resp.signature ?? resp);
    } catch (err) {
      throw mapWalletError(err, provider);
    }
  },

  async api(path, opts) {
    const res = await fetch(path, opts);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? res.statusText);
    return body;
  },

  async post(path, payload) {
    return PILOT.api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
};

globalThis.PILOT = PILOT;
