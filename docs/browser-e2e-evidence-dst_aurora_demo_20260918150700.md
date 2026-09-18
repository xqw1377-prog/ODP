# Browser E2E Evidence — dst_aurora_demo_20260918150700

P0-5R1 · Browser Click Proof: a REAL browser click on `Claim on Solana`
drove the full chain `click → POST /api/claim/maya → fresh Devnet tx →
Receipt`, and the page transitioned itself to `Claimed on Solana ✓`
without any reload.

## Environment

- Browser: real desktop Google Chrome (`chrome.exe`, separate window opened
  via `--new-window http://127.0.0.1:3179/radar`; not the embedded
  verification browser)
- Interaction: OS accessibility press (AXPress) on the actual page elements —
  Aurora Net card → Find the right people → Open Maya's view → Claim on Solana
- Demo server: `packages/web` (`npm run dev`, port 3179), claim signing in
  local demo-wallet mode (Maya keypair never left the server)
- Distribution prepared by `npm run demo:prepare` and stopped at READY TO CLAIM

## Walkthrough (all clicks in the real browser)

```text
/radar               → card grid rendered (Aurora ALLOW / Nimbus WATCH / PhantomX REJECT)
click "Aurora Net"   → /project/aurora (six-dim passport + PROTOCOL JUDGMENT ALLOW)
click "Find the right people" → /distribution/aurora (match ranking, Sib BLOCKED,
                                equal 5000/5000, on-chain card READY TO CLAIM)
click "Open Maya's view"      → /claim/maya ("Aurora found you." + why-you + 5,000)
screenshot: docs/screenshots/browser-e2e-claim-before.png
click "Claim on Solana"       → button → spinner → page transitioned ITSELF (no reload)
screenshot: docs/screenshots/browser-e2e-claimed.png
```

## The click-triggered request (server access log)

```text
[2026-09-18T15:13:16.701Z] POST /api/claim/maya -> 200
  dist=dst_aurora_demo_20260918150700
  sig=23Wh2oTsGNcL9dnd4Ff7S5hZayU2rE3U5kRKV3sW3E4SE7s9kMvAPsTvMKa2yNTxTFcfZF8mV99aGSHSinijRx7n
  receipt=2ay782Z8UNqAEtvsUij9QEWfB98APzXvUtZo21UbGR7s
  maya_balance=5000
```

## On-chain facts

```text
distribution_id = dst_aurora_demo_20260918150700
distribution    = HQ9EE4tePqKzziHeJxsiGMmsXGj8Dkr5viQPpSupL7Rk
vault           = AqMcSBAcVTcfGFMzzCsnhmAQhq8VDJd8my9nsxCfj4id
mint            = HJ9vg7BSVRBB32gPYLTu3QLXyL8ngrns2gfpa8ZnidDa
allocation root = 9cb903c8528bcd96fddb9ddf8e7ae50da033e58371d85356cab87770a47b0915
manifest hash   = f954f2c3557c57a4294457d119eec697d0c21112082409c1e6218b8d589b7130
claim tx        = 23Wh2oTsGNcL9dnd4Ff7S5hZayU2rE3U5kRKV3sW3E4SE7s9kMvAPsTvMKa2yNTxTFcfZF8mV99aGSHSinijRx7n
explorer        = https://explorer.solana.com/tx/23Wh2oTsGNcL9dnd4Ff7S5hZayU2rE3U5kRKV3sW3E4SE7s9kMvAPsTvMKa2yNTxTFcfZF8mV99aGSHSinijRx7n?cluster=devnet
ClaimReceipt    = 2ay782Z8UNqAEtvsUij9QEWfB98APzXvUtZo21UbGR7s
Maya balance    = 5000
```

## Page transition proof (no reload)

The accessibility tree after the click (same SPA state, URL unchanged
`/claim/maya`) showed `Claimed on Solana ✓`, step bar `Claimed ✓`,
receipt card (Project Aurora Net / Human Maya / Allocation 5,000 /
Solana Devnet / CLAIMED), the Explorer link to the tx above, and the
Protocol Protection checklist. The only HTTP call in this window was the
POST logged above.
