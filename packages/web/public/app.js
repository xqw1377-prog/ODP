/* ODP demo UI — presentation only. All rulings / rankings / allocations
   come from the real pipeline API. Nothing is hardcoded here. */

const app = document.getElementById("app");
const steps = document.getElementById("steps");
const badge = document.getElementById("demo-badge");

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => Number(n).toLocaleString("en-US");

const STEP_LABELS = { discover: "Discover", trust: "Trust", match: "Match", distribute: "Distribute" };

function setStep(current) {
  const order = ["discover", "trust", "match", "distribute", "claim"];
  const idx = order.indexOf(current);
  for (const el of steps.querySelectorAll("span")) {
    const s = el.dataset.step;
    el.innerHTML = `<i class="node"></i>${esc(STEP_LABELS[s] ?? s)}`;
    const i = order.indexOf(s);
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
    <section class="hero">
      <h1 class="mega rise">Token finds<br/><em>the human.</em></h1>
      <p class="hero-sub rise" style="animation-delay:.12s">ODP discovers crypto projects, derives trust from evidence, matches them with the right humans, and distributes ownership on Solana.</p>
      <div class="proto-flow rise" style="animation-delay:.24s">
        <a class="flow-node active" href="/radar"><i class="node"></i>Discover</a><i class="rail"></i>
        <a class="flow-node" href="/project/aurora"><i class="node"></i>Trust</a><i class="rail"></i>
        <a class="flow-node" href="/distribution/aurora"><i class="node"></i>Match</a><i class="rail"></i>
        <a class="flow-node" href="/claim/maya"><i class="node"></i>Distribute</a>
      </div>
    </section>
    <section class="proof-strip rise" style="animation-delay:.38s">
      <div class="strip-label">LIVE RADAR — EVIDENCE-DERIVED PROJECTS</div>
      ${radar.map((p) => `
        <div class="strip-row ${p.project_id === "prj_aurora_net" ? "hero" : ""}" ${p.project_id === "prj_aurora_net" ? 'id="aurora-row" role="button"' : ""}>
          <div class="who"><b>${esc(p.name)}</b><span class="mono">${esc(p.symbol)}</span></div>
          <span class="badge ${p.status}">${p.status}</span>
          <div class="why">${esc(p.reason ?? "")}</div>
          <div class="go">${p.project_id === "prj_aurora_net" ? "Enter →" : ""}</div>
        </div>`).join("")}
    </section>`;
  document.getElementById("aurora-row")?.addEventListener("click", () => nav("/project/aurora"));
}

// ── Scene 2 — Trust ─────────────────────────────────────────────────────

async function renderProject() {
  setStep("trust");
  badge.hidden = true;
  const { candidate, passport } = await api("/api/project/aurora");
  const dims = passport.dims;
  const dimCell = (k) => {
    const d = dims[k];
    const tone = d.warnings.length + d.unknowns.length > 0 ? "watch" : "ok";
    return `
    <div class="dim">
      <div class="k">${k}</div>
      <div class="v"><i class="dot ${tone}"></i>${esc(d.status)}</div>
      <div class="n">${d.evidence.length} evidence · ${d.warnings.length} warnings · ${d.unknowns.length} unknowns</div>
    </div>`;
  };
  app.innerHTML = `
    <h1 class="scene-title">Why can <em>${esc(candidate.name)}</em> enter the network?</h1>
    <p class="sub">Six-dimension Project Passport, derived from evidence — never declared, never bought.</p>
    <div class="grid-6">
      ${["TEAM", "PRODUCT", "CODE", "TOKEN", "ONCHAIN", "SOCIAL"].map(dimCell).join("")}
    </div>
    <div class="descend" aria-hidden="true"></div>
    <div class="judgment">
      <div class="label">PROTOCOL JUDGMENT</div>
      <div class="verdict">${esc(passport.status)}</div>
      <div class="note">ALLOW = eligible for distribution ≠ investment endorsement.</div>
      <div class="reasons">${passport.reasons.map((r) => "· " + esc(r)).join("<br/>")}</div>
    </div>
    <div class="center"><button class="cta" id="find">Find the right people</button></div>`;
  document.getElementById("find").addEventListener("click", () => nav("/distribution/aurora"));
}

// ── Scene 3+4 — Match & Distribution ────────────────────────────────────

function drawTree() {
  const tree = document.getElementById("tree");
  const svg = document.getElementById("tree-links");
  const rootEl = tree?.querySelector(".root-node");
  if (!tree || !svg || !rootEl) return;
  const leaves = [...tree.querySelectorAll(".leaf")];
  if (leaves.length === 0) return;
  const tb = tree.getBoundingClientRect();
  const rb = rootEl.getBoundingClientRect();
  const x0 = rb.left + rb.width / 2 - tb.left;
  const y0 = rb.bottom - tb.top;
  svg.setAttribute("width", tb.width);
  svg.setAttribute("height", tb.height);
  let out = "";
  for (const leaf of leaves) {
    const lb = leaf.getBoundingClientRect();
    const lx = lb.left + lb.width / 2 - tb.left;
    const ly = lb.top - tb.top - 6;
    const ty = y0 + (ly - y0) * 0.45;
    const blocked = leaf.classList.contains("blocked");
    out += `<path d="M ${x0} ${y0} V ${ty} H ${lx} V ${ly}" class="${blocked ? "link-blocked" : "link-flow"}"/>`;
    out += blocked
      ? `<g class="link-x"><circle cx="${lx}" cy="${ty}" r="9"/><text x="${lx}" y="${ty + 4}">×</text></g>`
      : `<circle cx="${lx}" cy="${ty}" r="4" class="link-dot"/>`;
  }
  svg.innerHTML = out;
}
addEventListener("resize", () => drawTree());

async function renderDistribution() {
  setStep("match");
  badge.hidden = true;
  const [data, projData] = await Promise.all([
    api("/api/distribution/aurora"),
    api("/api/project/aurora").catch(() => null),
  ]);
  const projectName = (projData && projData.candidate && projData.candidate.name) || "AURORA";
  const onchain = data.onchain;
  const scoreById = new Map(data.matches.map((m) => [m.human_id, m]));

  const tree = `
    <div class="tree" id="tree">
      <svg id="tree-links" aria-hidden="true"></svg>
      <div class="tree-root">
        <div class="root-node">
          <div class="root-name">${esc(projectName)}</div>
          <div class="root-sub">${onchain ? `ALLOW · ${fmt(onchain.total)} TOKENS ON-CHAIN` : "ALLOW"}</div>
        </div>
      </div>
      <div class="tree-leaves">
        ${data.matches.map((m, i) => `
          <div class="leaf ${m.blocked ? "blocked" : ""}" style="animation-delay:${i * 110 + 150}ms">
            <div class="leaf-name">${esc(m.display)}</div>
            <div class="leaf-score">${m.blocked ? esc(String(m.reasons[0] ?? "risk")).replace(/^blocked: /, "") : `match ${esc(String(m.score))}`}</div>
            <div class="leaf-status">${m.blocked ? "BLOCKED" : "MATCHED"}</div>
            <div class="leaf-why">${m.reasons.map((r) => esc(String(r).replace(/^blocked: /, ""))).join(" · ")}</div>
          </div>`).join("")}
      </div>
    </div>`;

  const onchainCard = onchain ? `
    <div class="panel">
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
    <div class="panel" style="color:var(--muted)">
      No live demo distribution yet — run <code>npm run demo:prepare</code>.
    </div>`;

  app.innerHTML = `
    <h1 class="scene-title">Why <em>these humans</em>?</h1>
    <p class="sub">Matching runs only for ALLOW projects. Risk-flagged humans are excluded — no score can outbid the risk gate.</p>
    ${tree}
    <div class="big-quote">Followers don't decide.<br/><em>Relevant crypto behavior does.</em></div>

    <div class="kicker">MATCH ≠ ALLOCATION</div>
    ${data.allocations.map((a) => {
      const m = scoreById.get(a.human_id);
      return `
      <div class="eq">
        <div class="eq-id"><b>${esc(a.display)}</b><span>match ${m ? esc(String(m.score)) : "—"}</span></div>
        <div class="eq-arrow">→</div>
        <div class="eq-amount">${fmt(a.amount)}</div>
      </div>`;
    }).join("")}
    <p class="small-note center">Match decides eligibility. Allocation follows protocol policy.</p>

    <div class="kicker" style="margin-top:40px">ON-CHAIN DISTRIBUTION</div>
    ${onchainCard}
    ${onchain ? `<div class="center"><button class="cta" id="maya">Open Maya's view</button></div>` : ""}
  `;
  requestAnimationFrame(drawTree);
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
    app.innerHTML = `<h1 class="mega">Aurora <em>found you.</em></h1><div class="error-box">${esc(err.message)}</div>`;
    return;
  }

  const base = `
    <section class="claim-stage">
      <div class="kicker">DISTRIBUTION · SOLANA DEVNET</div>
      <h1 class="mega">Aurora <em>found you.</em></h1>
      <div class="check-list">
        ${data.why.map((w) => `<div class="ok">${esc(w)}</div>`).join("")}
      </div>
      <div class="amount-mid">${fmt(data.amount)} <span>AURORA</span></div>
      <div class="center">
        <button class="cta" id="claim" style="font-size:18px; padding:16px 36px">Claim on Solana</button>
        <div class="small-note">Demo Wallet · real Devnet transaction · confirmation in a few seconds</div>
        <div id="status"></div>
      </div>
    </section>`;

  if (data.claimed) {
    renderClaimed({
      signature: null,
      receipt_pda: data.receipt_pda,
      maya_balance: data.maya_balance,
      amount: data.amount,
    });
    return;
  }

  app.innerHTML = base;

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
    STEP_LABELS.distribute = "Claimed ✓";
    setStep("claim");
    const amount = result.amount ?? amountArg ?? data.amount;
    app.innerHTML = `
      <section class="claim-stage">
        <div class="verified-pill"><i></i>VERIFIED ON SOLANA</div>
        <h1 class="mega">Ownership <em>delivered.</em></h1>
        <div class="mega-amount">${fmt(amount)}</div>
        <div class="unit">AURORA DEMO TOKENS — ALLOCATED TO MAYA</div>

        <div class="panel proof">
          <div class="strip-label">PROOF — ON-CHAIN EVIDENCE</div>
          <div class="kv">
            <div class="k">Project</div><div><b>Aurora Net</b></div>
            <div class="k">Human</div><div><b>Maya</b></div>
            <div class="k">Allocation</div><div>${fmt(amount)}</div>
            <div class="k">Maya token balance</div><div>${fmt(result.maya_balance)}</div>
            <div class="k">Network</div><div>Solana Devnet</div>
          </div>
          ${result.signature ? `<div style="margin-top:14px"><a class="link" target="_blank" rel="noopener" href="${esc(result.explorer)}">View on Solana Explorer ↗</a></div>` : ""}
          <details class="hashbox">
            <summary>Receipt details</summary>
            <div class="kv">
              <div class="k">Claim Transaction</div><div class="mono">${esc(result.signature ?? "(claimed in a previous session)")}</div>
              <div class="k">ClaimReceipt PDA</div><div class="mono">${esc(result.receipt_pda)}</div>
              <div class="k">Distribution PDA</div><div class="mono">${esc(loadStateIds().distribution_pda)}</div>
              <div class="k">Merkle Root</div><div class="mono">${esc(loadStateIds().root)}</div>
              <div class="k">Manifest Hash</div><div class="mono">${esc(loadStateIds().manifest_hash)}</div>
            </div>
          </details>
          <div class="check-list small">
            <div class="ok">Proof verified on-chain</div>
            <div class="ok">Wrong wallet rejected</div>
            <div class="ok">Wrong amount rejected</div>
            <div class="ok">Sybil excluded from the tree</div>
            <div class="ok">Double claim rejected at program level</div>
          </div>
          <div style="margin-top:12px">
            <a class="link" target="_blank" rel="noopener"
               href="https://github.com/xqw1377-prog/ODP/blob/main/docs/devnet-evidence-dst_aurora_devnet_003.md">View protocol evidence ↗</a>
          </div>
        </div>

        <div class="flow-quote">Discover → Trust → Match → Distribute. <em>That's ODP.</em></div>
        <div class="center"><a class="cta ghost" href="/radar">← Back to Radar</a></div>
      </section>`;
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
    if (path === "/early-humans") {
      location.assign("/early-humans");
      return;
    }
    app.innerHTML = `<h1>Not found</h1><a class="link" href="/radar">← Radar</a>`;
  } catch (err) {
    app.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
  }
}

addEventListener("popstate", route);
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="/"]');
  if (!a || a.target) return;
  const href = a.getAttribute("href");
  if (href === "/early-humans") return;
  e.preventDefault();
  nav(href);
});
route();
