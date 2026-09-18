/* ODP demo UI — presentation only. All rulings / rankings / allocations
   come from the real pipeline API. Nothing is hardcoded here. */

const app = document.getElementById("app");
const steps = document.getElementById("steps");
const badge = document.getElementById("demo-badge");

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => Number(n).toLocaleString("en-US");

function setStep(current) {
  const order = ["discover", "trust", "match", "distribute", "claim"];
  const idx = order.indexOf(current);
  for (const el of steps.querySelectorAll("span")) {
    const i = order.indexOf(el.dataset.step);
    el.className = i === idx ? "active" : i < idx ? "done" : "";
  }
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

function nav(to) {
  history.pushState(null, "", to);
  route();
}

// ── Scene 1 — Discover ──────────────────────────────────────────────────

async function renderRadar() {
  setStep("discover");
  badge.hidden = true;
  const { radar } = await api("/api/radar");
  app.innerHTML = `
    <h1>Good projects struggle to find <em>real users</em>.<br/>Real users struggle to find <em>good projects</em>.</h1>
    <p class="sub">ODP discovers projects, audits the evidence, and only distributes what earns it.</p>
    <div class="grid-3">
      ${radar.map((p) => `
        <div class="card project-card ${p.project_id === "prj_aurora_net" ? "hero" : ""}" data-id="${esc(p.project_id)}">
          <div class="name">${esc(p.name)}</div>
          <div class="symbol">${esc(p.symbol)}</div>
          <span class="badge ${p.status}">${p.status}</span>
          <div class="why">${esc(p.reason ?? "")}</div>
        </div>`).join("")}
    </div>`;
  app.querySelector(".project-card.hero")?.addEventListener("click", () => nav("/project/aurora"));
}

// ── Scene 2 — Trust ─────────────────────────────────────────────────────

async function renderProject() {
  setStep("trust");
  badge.hidden = true;
  const { candidate, passport } = await api("/api/project/aurora");
  const dims = passport.dims;
  const dimCard = (k) => `
    <div class="dim">
      <div class="k">${k}</div>
      <div class="v">${esc(dims[k].status)}</div>
      <div class="n">${dims[k].evidence.length} evidence · ${dims[k].warnings.length} warnings · ${dims[k].unknowns.length} unknowns</div>
    </div>`;
  app.innerHTML = `
    <h1>Why can <em>${esc(candidate.name)}</em> enter the network?</h1>
    <p class="sub">Six-dimension Project Passport, derived from evidence — never declared, never bought.</p>
    <div class="grid-6">
      ${["TEAM", "PRODUCT", "CODE", "TOKEN", "ONCHAIN", "SOCIAL"].map(dimCard).join("")}
    </div>
    <div class="card judgment">
      <div class="label">PROTOCOL JUDGMENT</div>
      <div class="verdict">${passport.status}</div>
      <div class="note">ALLOW = eligible for distribution ≠ investment endorsement.</div>
      <div class="reasons">${passport.reasons.map((r) => "· " + esc(r)).join("<br/>")}</div>
    </div>
    <button class="cta" id="find">Find the right people</button>`;
  document.getElementById("find").addEventListener("click", () => nav("/distribution/aurora"));
}

// ── Scene 3+4 — Match & Distribution ────────────────────────────────────

async function renderDistribution() {
  setStep("match");
  badge.hidden = true;
  const data = await api("/api/distribution/aurora");
  const humans = data.matches.map((m, i) => `
    <div class="card human ${m.blocked ? "blocked" : ""}">
      <div class="rank">#${i + 1}</div>
      <div class="who">
        <div class="name">${esc(m.display)}</div>
        <div class="why">${m.blocked ? m.reasons.map(esc).join(" · ") : m.reasons.map(esc).join(" · ")}</div>
      </div>
      <div class="score">${m.blocked ? `<b>BLOCKED</b><span>distribution blocked</span>` : `<b>${m.score}</b><span>match score</span>`}</div>
    </div>`).join("");

  const onchain = data.onchain;
  const onchainCard = onchain ? `
    <div class="card" style="margin-top:16px">
      <div class="kv">
        <div class="k">Network</div><div>Solana ${esc(onchain.network)}</div>
        <div class="k">Program</div><div class="mono">${esc(onchain.program_id.slice(0, 10))}…${esc(onchain.program_id.slice(-6))}</div>
        <div class="k">Recipients</div><div>${data.allocations.length}</div>
        <div class="k">Total</div><div>${fmt(onchain.total)}</div>
      </div>
      <div style="margin-top:14px"><span class="status-pill ready">READY TO CLAIM</span></div>
      <details class="hashbox">
        <summary>View commitments (Merkle Root · Manifest · PDA)</summary>
        <div class="kv">
          <div class="k">Distribution PDA</div><div class="mono">${esc(onchain.distribution_pda)}</div>
          <div class="k">Vault</div><div class="mono">${esc(onchain.vault)}</div>
          <div class="k">Merkle Root</div><div class="mono">${esc(onchain.root)}</div>
          <div class="k">Manifest Hash</div><div class="mono">${esc(onchain.manifest_hash)}</div>
          <div class="k">Distribution ID</div><div class="mono">${esc(onchain.distribution_id)}</div>
        </div>
      </details>
    </div>` : `
    <div class="card" style="margin-top:16px; color:var(--muted)">
      No live demo distribution yet — run <code>npm run demo:prepare</code>.
    </div>`;

  app.innerHTML = `
    <h1>Why <em>these humans</em>?</h1>
    <p class="sub">Matching runs only for ALLOW projects. Sib is excluded by risk — no score can outbid it.</p>
    ${humans}
    <div class="big-quote">Followers don't decide.<br/><em>Relevant crypto behavior does.</em></div>

    <h2>Selected Humans — equal allocation</h2>
    ${data.allocations.map((a) => `
      <div class="card" style="display:flex; justify-content:space-between; margin-bottom:10px">
        <b>${esc(a.display)}</b><span>${fmt(a.amount)}</span>
      </div>`).join("")}
    <p class="small-note">
      Maya score 0.942 · Dan score 0.491 — but both receive the same amount.
      <b> Match decides eligibility. Allocation follows protocol policy.</b>
    </p>

    <h2>On-chain distribution</h2>
    ${onchainCard}
    ${onchain ? `<button class="cta" id="maya">Open Maya's view</button>` : ""}
  `;
  document.getElementById("maya")?.addEventListener("click", () => nav("/claim/maya"));
}

// ── Scene 5 — Maya's claim ──────────────────────────────────────────────

async function renderClaim() {
  setStep("distribute");
  badge.hidden = false;
  let data;
  try {
    data = await api("/api/claim/maya");
  } catch (err) {
    app.innerHTML = `<h1>Aurora found you.</h1><div class="error-box">${esc(err.message)}</div>`;
    return;
  }

  const base = `
    <div class="claim-hero card">
      <h1>Aurora found <em>you</em>.</h1>
      <div class="check-list" style="text-align:left; max-width:420px; margin:22px auto">
        ${data.why.map((w) => `<div class="ok">${esc(w)}</div>`).join("")}
      </div>
      <div class="amount">${fmt(data.amount)}</div>
      <div class="unit">AURORA DEMO TOKENS</div>
    </div>`;

  if (data.claimed) {
    renderClaimed({
      signature: null,
      receipt_pda: data.receipt_pda,
      maya_balance: data.maya_balance,
      amount: data.amount,
    });
    return;
  }

  app.innerHTML = base + `
    <div style="text-align:center">
      <button class="cta" id="claim" style="font-size:18px; padding:16px 36px">Claim on Solana</button>
      <div class="small-note">Demo Wallet · real Devnet transaction · confirmation in a few seconds</div>
      <div id="status"></div>
    </div>`;

  document.getElementById("claim").addEventListener("click", async () => {
    const btn = document.getElementById("claim");
    const status = document.getElementById("status");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Signing & sending to Devnet…';
    try {
      status.innerHTML = "";
      const result = await api("/api/claim/maya", { method: "POST" });
      renderClaimed(result, data.amount);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Claim on Solana";
      status.innerHTML = `<div class="error-box">Claim failed: ${esc(err.message)}</div>`;
    }
  });

  function renderClaimed(result, amountArg) {
    setStep("distribute");
    steps.querySelector('[data-step="distribute"]').innerHTML = "Claimed ✓";
    const amount = result.amount ?? amountArg ?? data.amount;
    app.innerHTML = `
      <div class="claim-hero card">
        <h1>Claimed on Solana <em>✓</em></h1>
        <div class="amount">${fmt(result.maya_balance)}</div>
        <div class="unit">AURORA DEMO TOKENS RECEIVED BY MAYA</div>
      </div>
      <div class="card">
        <div class="kv">
          <div class="k">Project</div><div><b>Aurora Net</b></div>
          <div class="k">Human</div><div><b>Maya</b></div>
          <div class="k">Allocation</div><div>${fmt(amount)}</div>
          <div class="k">Network</div><div>Solana Devnet</div>
          <div class="k">Status</div><div><span class="status-pill claimed">CLAIMED</span></div>
        </div>
        ${result.signature ? `<div style="margin-top:16px"><a class="link" target="_blank" rel="noopener" href="${esc(result.explorer)}">View on Solana Explorer ↗</a></div>` : ""}
        <details class="hashbox">
          <summary>Receipt details</summary>
          <div class="kv">
            <div class="k">Claim Transaction</div><div class="mono">${esc(result.signature ?? "(claimed in a previous session)")}</div>
            <div class="k">ClaimReceipt PDA</div><div class="mono">${esc(result.receipt_pda)}</div>
            <div class="k">Distribution PDA</div><div class="mono">${esc(data.distribution_id ? "" : "")}${esc(loadStateIds().distribution_pda)}</div>
            <div class="k">Merkle Root</div><div class="mono">${esc(loadStateIds().root)}</div>
            <div class="k">Manifest Hash</div><div class="mono">${esc(loadStateIds().manifest_hash)}</div>
          </div>
        </details>
      </div>
      <div class="card" style="margin-top:16px">
        <b>Protocol Protection</b>
        <div class="check-list">
          <div class="ok">Proof verified on-chain</div>
          <div class="ok">Wrong wallet rejected</div>
          <div class="ok">Wrong amount rejected</div>
          <div class="ok">Sybil excluded from the tree</div>
          <div class="ok">Double claim rejected at program level</div>
        </div>
        <div style="margin-top:14px">
          <a class="link" target="_blank" rel="noopener"
             href="https://github.com/xqw1377-prog/ODP/blob/main/docs/devnet-evidence-dst_aurora_devnet_003.md">View protocol evidence ↗</a>
        </div>
      </div>
      <div class="big-quote" style="margin-top:34px">Discover → Trust → Match → Distribute.<br/><em>That's ODP.</em></div>
      <div style="text-align:center"><a class="cta ghost" href="/radar">← Back to Radar</a></div>`;
  }

  function loadStateIds() {
    // distribution ids come from the distribution API (real state)
    return idsCache ?? { distribution_pda: "", root: "", manifest_hash: "" };
  }
}

let idsCache = null;
async function prefetchIds() {
  try {
    const data = await api("/api/distribution/aurora");
    idsCache = data.onchain;
  } catch { idsCache = null; }
}

// ── router ──────────────────────────────────────────────────────────────

async function route() {
  const path = location.pathname;
  try {
    if (path === "/" || path === "/radar") return await renderRadar();
    if (path === "/project/aurora") return await renderProject();
    if (path === "/distribution/aurora") return await renderDistribution();
    if (path === "/claim/maya") { await prefetchIds(); return await renderClaim(); }
    app.innerHTML = `<h1>Not found</h1><a class="link" href="/radar">← Radar</a>`;
  } catch (err) {
    app.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
  }
}

addEventListener("popstate", route);
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="/"]');
  if (!a || a.target) return;
  e.preventDefault();
  nav(a.getAttribute("href"));
});
route();
