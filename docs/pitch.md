# ODP · 3-Minute Pitch & Demo Script

> One line to land: **Token finds the human.**
> Four steps to remember: **Discover → Trust → Match → Distribute**

Actuals referenced below are real, verified on Solana Devnet:
program `GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW`, browser-click
claim `23Wh2oTs…SinijRx7n`, full evidence in
[docs/browser-e2e-evidence-dst_aurora_demo_20260918150700.md](browser-e2e-evidence-dst_aurora_demo_20260918150700.md)
and [docs/devnet-evidence-dst_aurora_devnet_003.md](devnet-evidence-dst_aurora_devnet_003.md).

---

## 0:00–0:20 — The Problem (talk over `/radar`)

> Thousands of crypto projects launch every month.
> Good projects struggle to find real users.
> Real users drown in noise — bots, paid hype, sybils.
> Platforms profit from the mismatch. We remove it.

**On screen:** Radar page — hero + three evidence rows.
Point at the Nimbus and PhantomX evidence rows first:

> ODP doesn't distribute everything. Most discovery stops at "what's trending".
> We stop at "what's true".

---

## 0:20–0:50 — Trust (click **Aurora Net** → `/project/aurora`)

> Before any token moves, a project must EARN distribution.
> ODP audits six dimensions of evidence — team, product, code, token,
> on-chain behavior, social authenticity.

Point at the six tiles:

> Aurora: team verified, product live, code active, token healthy,
> on-chain healthy, social organic.

Point at the judgment:

> The protocol's ruling is ALLOW — derived from evidence, never declared,
> never bought. ALLOW means eligible for distribution — it is not an
> investment endorsement. Nimbus stays WATCH. PhantomX is REJECTED —
> its token is a honeypot. Different projects, different outcomes, same rules.

---

## 0:50–1:30 — Match (click **Find the right people** → `/distribution/aurora`)

> Now the important question: WHO should this project reach?
> Not the loudest follower. The right human.

Point at Maya:

> Maya — 0.942. Why? Solana, DePIN, early adopter, hardware. Real behavior,
> real confidence. Dan — 0.491, relevant, a developer.
> And Sib — BLOCKED. Sybil cluster. No score can outbid risk.

Point at the allocation line:

> Here's the part most platforms won't say out loud:
> Maya scores 0.942, Dan 0.491 — they each get 5,000.
> **Match decides eligibility. Allocation follows protocol policy — not popularity.**
> Followers don't decide. Relevant crypto behavior does.

Point at the on-chain card:

> This isn't a mockup. It's a live Solana Devnet distribution — vault funded,
> merkle root committed, ready to claim.

**Key beat — say it slowly:** *Token finds the human.*

---

## 1:30–2:10 — The Live Claim (click **Open Maya's view** → `/claim/maya`)

> This is Maya's view. She didn't hunt for an airdrop. Aurora found HER.

Point at the why-you list:

> She can see exactly why she was selected.

Point at the button:

> Now the moment of truth — a real claim, on real Solana, right now.

**CLICK "Claim on Solana".** Wait silently for the spinner (~10s).
Do not talk over the wait — let the audience feel the confirmation.

---

## 2:10–2:40 — Proof (the page flips itself to **Ownership delivered. · VERIFIED ON SOLANA**)

> Confirmed. Five thousand tokens, on Devnet, in Maya's wallet.
> A ClaimReceipt exists on-chain. Try to claim twice? The program itself
> rejects it — not the UI, the smart contract.

Point at the PROOF panel:

> Proof verified, wrong wallet rejected, wrong amount rejected,
> sybils excluded, double claims rejected — all of this happened in our
> recorded devnet runs. Every transaction is on the explorer.

---

## 2:40–3:00 — Close

> ODP: discover projects, establish trust, match them with the right humans,
> and distribute ownership on Solana — verifiably.

Final slide / final words:

> **Discover → Trust → Match → Distribute.**
> **Token finds the human. That's ODP.**

---

## Backup Q&A (if asked)

- **Where does trust come from?** Evidence vectors assembled per dimension;
  ruling is DERIVED by deterministic rules (derivation-locked: a passport
  whose status disagrees with its evidence cannot even parse).
- **Why can't rich projects buy reach?** No pay-to-reach anywhere; score
  uses interest fit + human confidence + reputation + network quality only.
- **Anti-sybil?** Risk flags hard-block matching at score 0; Sib is the
  live example.
- **Is the demo real?** Yes — Devnet program GRgi…yFeW, real browser click,
  real tx (see evidence docs), reproducible via `npm run demo:prepare && npm run dev`.
- **What's frozen vs future?** P0 froze the golden path (whitepaper-aligned);
  no protocol token, no DAO, no ads. Growth = more discovery sources, richer
  evidence, more chains.
