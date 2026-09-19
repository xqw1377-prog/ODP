/* ODP Pilot — shared page logic. Minimal by design: truth > polish. */

const PILOT = {
  esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  },

  /** Phantom / Solflare standard provider. */
  provider() {
    return window.phantom?.solana ?? window.solana ?? null;
  },

  async connectWallet() {
    const provider = PILOT.provider();
    if (!provider) throw new Error("No Solana wallet found. Install Phantom or Solflare.");
    const resp = await provider.connect();
    const pubkey = resp.publicKey?.toBase58?.() ?? String(resp.publicKey);
    if (!pubkey) throw new Error("Wallet connected but no public key returned.");
    return { provider, pubkey };
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
    const encoded = new TextEncoder().encode(message);
    const resp = await provider.signMessage(encoded, "utf8");
    return PILOT.toBase58(resp.signature ?? resp);
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
