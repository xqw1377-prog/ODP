# SUBMISSION TRUTH GATE

**STATUS: ACTIVE** · Applies to: every agent or human writing ODP materials
(pitch, submission, README, docs, videos, chat drafts, outreach copy).
**Enforcement mode: process/manual. No automated CI enforcement exists yet.**
**Enforcement: CONFLICT WITH THIS GATE → STOP → DO NOT POLISH THE COPY →
DO NOT COMMIT → REPORT THE CONFLICT FIRST.**

## Why this gate exists

Agent-produced ODP documents have repeatedly contained fabricated facts —
"368 real participants (2026-09-22)", "NATIX responded positively",
"Enroll is a 0-SOL transaction", "Issue #8 fixed today". None of these claims
were true of the canonical submission main/evidence state. The Issue #8 fix
exists only on the deferred pilot branch @ `58e3101` and is not in main.
Every one of them would have entered the Colosseum submission and become a
credibility loss under judge questioning. This gate is the entry contract:
**facts first, copy second.**

## GATE A — CANONICAL FACTS

```text
P0 HACKATHON BASELINE      = 90d7ef0
PILOT-0 EVIDENCE BASELINE  = 64942ea
SUBMISSION CODE BASELINE   = c26b401
REAL HUMAN                 = YES
REAL HUMAN TRACTION        = NOT YET
FIRST-PARTY PILOT          = YES
EXTERNAL PROJECT ADOPTION  = NOT YET
SOLANA DEVNET              = YES
PRODUCTION                 = NO
```

## GATE B — CAPABILITY TRUTH

What the system actually does today. If material implies anything beyond
these lines, it is **UNSUPPORTED** until evidence is recorded and the gate is
updated — unsupported ≠ fiction: new facts enter by passing RULE 1, not by
being declared.

```text
HUMAN ENROLLMENT
= wallet signMessage challenge
= no transaction
= no fee
= server verifies; human wallet signs

WALLET OWNERSHIP
= VERIFIED BY SIGNATURE

X HANDLE
= SELF_DECLARED
= NOT X-VERIFIED

INTERESTS
= SELF_DECLARED

DUPLICATE WALLET
= REJECTED

DUPLICATE DECLARED X HANDLE
= REJECTED

UNIQUE HUMAN
= NOT PROVEN

MATCH
= ALLOW projects only

MAYA / DAN
= FIXTURES

PILOT-0
= founder-operated / first-party / Devnet / N=1

NATIX
= support acknowledgement + internal escalation
= project-team reply NOT YET
= pilot interest NOT YET

ISSUE #8 (pool stats refresh)
= CLOSED / NOT MERGED
= NOT IN MAIN
= fix exists on pilot branch 58e3101, DEFERRED POST-SUBMISSION

PUBLIC REAL-HUMAN COUNT
= DYNAMIC FACT
= must query runtime (odp.mealkey.cn/api/pilot/state) before quoting
= never hardcode from memory
```

## RULE 1 — EVIDENCE RULE

Any **number, adoption, partnership, reply, or production status** in ODP
material must carry all three:

```text
source        = where it was observed (store / explorer tx / signed doc / email)
observed_at   = date of observation
evidence level= ON-CHAIN | RUNTIME | REPO/CI | SIGNED RECORD | WRITTEN REPLY | PUBLIC SOURCE | VERBAL | HYPOTHESIS
```

```text
RUNTIME        = observed from the live service/API (e.g. /api/pilot/state)
REPO/CI        = repository state or CI run (commit SHA, test result, workflow)
PUBLIC SOURCE  = publicly reachable page/post (explorer, official blog, X post)
```

If any of the three is missing, the claim is labeled and used only as:

```text
HYPOTHESIS / NOT YET / UNKNOWN
```

## RULE 2 — CONFLICT PROTOCOL

```text
CONFLICT WITH TRUTH GATE
→ STOP
→ DO NOT POLISH THE COPY
→ DO NOT COMMIT
→ REPORT CONFLICT FIRST
```

The gate outranks every outline, deadline, style preference, and agent
confidence. A beautiful document built on a false fact is a failed document.

## RULE 3 — DYNAMIC FACTS

Runtime numbers (real humans, eligible, runs, claimed) change. Query

```text
https://odp.mealkey.cn/api/pilot/state
```

immediately before quoting. Never write a count from memory — not even one you
are sure of.

## Vocabulary watchlist (non-exhaustive — banned without RULE 1 evidence)

`368 participants` · `NATIX responded positively` · `positive reply` ·
`active discussions with DePIN projects` · `ecosystem validation` ·
`X-verified` · `enroll transaction` · `advisor relationships being
established` · `production-ready` · `user traction`

## APPROVED WORDING EXAMPLE (Team — the compliance standard)

> ODP is currently solo-founded by Xinquan Wang. During the hackathon I built
> the deterministic Passport and Matching layers, the Solana distribution
> program, the Early Humans enrollment flow, and completed the first
> first-party real-human self-custody claim on Devnet. I am now validating
> demand with Solana projects and recruiting the first external pilot.

Note what this paragraph does NOT do: no participant counts, no wallet count,
no NATIX characterization, no advisor claims — and it is still strong. That is
the bar.
