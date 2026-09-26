# EARLY HUMANS — UX VALIDATION MATRIX

Baseline:
```text
CURRENT MAIN         = e743eb1 (docs-only after this)
PILOT CODE BASELINE  = 7b0cea0
Pilot runtime code is unchanged between them; e743eb1 is docs-only.
```
The PILOT-0-passing claim-page/UX fixes live on `pilot/real-evidence-v0` @
`58e3101` and are **DEFERRED POST-SUBMISSION** (ruling: PR #8 / pool-refresh =
DEFERRED). Any status change requires a gate ruling.

**Two gates are tracked separately and must never be merged:**

```text
BLOCKS SUBMISSION?      = would a judge hitting this during review damage the hackathon submission?
BLOCKS PUBLIC RECRUITMENT? = would this stop the first 30 external humans from completing the flow?
```

Worked examples (frozen):

```text
Issue #8 pool-stats refresh = UX defect, fix deferred.  BLOCKS SUBMISSION = NO, RECRUITMENT = NO
D3 restart persistence      = recruitment blocker.       BLOCKS SUBMISSION = NO, RECRUITMENT = YES
```

## The real enrollment capability (today)

```text
OPEN → CONNECT WALLET → GET CHALLENGE → signMessage → wallet ownership verified
→ enter self-declared X handle → choose interests → explicit consent
→ submit enrollment → persistent state (server-side PilotHuman record)
NO TRANSACTION. NO FEE. NO ON-CHAIN CREDENTIAL AT ENROLLMENT.
```

Evidence keys: **TEST** = named suite in `packages/pilot/tests` · **CODE** =
code-path inspection · **FIELD** = observed in a real run (PILOT-0 / public) ·
**UNTESTED** = no evidence yet.

## Matrix

| ID | PRECONDITION | ACTION | EXPECTED | EVIDENCE | CURRENT STATUS (pilot code baseline @ 7b0cea0) | BLK SUBMIT | BLK RECRUIT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | page open, no wallet extension | click Connect | clear "No Solana wallet found. Install Phantom or Solflare." | CODE | message correct but subtle (small status line) | NO | NO — polish before scale |
| 2 | wallet installed, user dismisses popup | click Connect | wallet's own rejection message shown, page stays usable | CODE | passthrough via catch | NO | NO |
| 3 | challenge older than 10 min | submit enrollment | 400 "challenge expired", nonce unconsumed | TEST (challenge suite) | PASS | NO | NO |
| 4 | tampered signature | submit enrollment | 400 "signature verification failed"; nonce REMAINS UNCONSUMED (only a successful verification consumes it) | TEST + FIELD (wrong-signature probes) | PASS | NO | NO |
| 5 | nonce reused AFTER a successful signature verification / enrollment | submit enrollment | 400 "challenge already used" (failed attempts do NOT consume) | TEST + FIELD | PASS | NO | NO |
| 6 | malformed X handle | submit enrollment | 400 "x_handle must look like @name…", nonce NOT consumed | TEST | PASS | NO | NO |
| 7 | zero interests selected | submit enrollment | 400 "pick at least one interest", nonce NOT consumed | TEST | PASS | NO | NO |
| 8 | consent unchecked | submit enrollment | 400 "consent to be matched is required", nonce NOT consumed | TEST | PASS | NO | NO |
| 9 | wallet already enrolled | submit enrollment | 400 "this wallet is already enrolled" | TEST | PASS | NO | NO |
| 10 | handle already enrolled (case-insensitive) | submit enrollment | 400 "this X handle is already enrolled — one human, one pool entry" | TEST | PASS | NO | NO |
| 11 | all checks pass | submit enrollment | 201 {human_id, status ELIGIBLE}; success visible to user | TEST + FIELD (PILOT-0) | PASS — but success feedback is one subtle line (panel fix deferred @ 58e3101) | NO | NO — UX polish |
| 12 | reload page after enroll (same server) | re-open / | aggregate state persists; human record server-side | CODE (atomic file store, read-back tests) | PASS for browser reload / same server; local process-restart evidence NOT REPO-RECORDED; **Fly restart UNTESTED** | NO | **YES (with 13)** |
| 13 | server restart (D3) | `systemctl/fly` restart → re-check state | humans/runs preserved | UNTESTED on Fly (volume unconfirmed) | **OPEN — D3 HOLD** | NO | **YES** |
| 14 | pool stats after enroll | observe stats block | count increments without manual refresh | CODE (Issue #8) | **DEFECT OPEN on main** — fetched once, no auto-refresh; fix deferred @ 58e3101 | NO | NO — cosmetic; fix recommended before first public run |
| 15 | devnet/RPC slow or down during claim build | click Sign & send | clear 400/409 with message; retry by clicking again | CODE + FIELD (transient public timeouts observed) | PARTIAL — error surfaces, manual retry only, no auto-retry | NO | NO |
| 16 | mobile Phantom in-app browser | full flow on phone | enroll + claim complete | UNTESTED | OPEN — **RELEASE CONDITION**: one mobile-Phantom pass required before recruitment (policy; UNTESTED is not a proven defect) | NO | **YES BY RELEASE POLICY** |
| 17 | desktop Chrome + Phantom extension | full flow on desktop | enroll + claim complete | FIELD (PILOT-0 + public enrollment) | PASS | NO | NO |
| 18 | Solflare instead of Phantom | connect via the injected provider (window.solana compatibility) | flow completes | UNTESTED | OPEN — advertised by UI; provider compatibility UNTESTED | NO | NO |
| 19 | loading / empty / error states | observe each async surface | no blank panels; loading text present; errors in boxes | CODE | PARTIAL — pool "loading…" + error boxes exist; success panel deferred | NO | NO |
| 20 | privacy — public aggregate API | inspect /api/pilot/state | no handle↔wallet relation; counts only | TEST + FIELD (grep '@' = 0) | PASS | NO | NO |

## Gate summary

```text
BLOCKS SUBMISSION (judge-during-review)      = NONE of the 20 rows hard-block.
BLOCKS PUBLIC RECRUITMENT                    = D3 restart persistence (13)
                                             + mobile pass (16)
                                             + pre-run hygiene: 14 fix, 18 optional
```

## Deferred-fix inventory (all already written, on `pilot/real-evidence-v0` @ 58e3101)

```text
enrollment success panel (row 11/19 visibility)
pool stats 30s auto-refresh (row 14 / Issue #8)
claim-wait staged feedback + double-submit guard
```

58e3101 contains all three fixes in one commit. Porting by cherry-pick/replay
requires conflict review against current main. **NOT EXECUTED.**

## Re-verification protocol

Any row may be upgraded from UNTESTED/OPEN only by a recorded run:
precondition reproduced → action executed → expected observed → evidence
screenshot/log stored. Rows never downgrade silently — a PASS that regresses
is a new defect entry, not an edit of this matrix.
