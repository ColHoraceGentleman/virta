# Echo Brief Template — Copy, fill in, spawn

> Replace the bracketed `[…]` with project-specific details. Do not change section structure unless the methodology (`qa/METHODOLOGY.md`) changes.

---

## Header

**Goal:** [One sentence — what this QA pass verifies.]
**Read first (in this order):**
1. This brief (you're here).
2. `[<project>/]qa/METHODOLOGY.md` — the QA discipline (roles, tooling, failure artifacts).
3. `[<project>/]qa/QA.md` — the full behavior list. **Run all active behaviors** (`[ ]`), not just the new ones.
4. `[<project>/ACCOUNTING-v1.md]` or equivalent spec — for definitions.
5. `[latest CINDER_REPORT_<phase>.md]` — for what just shipped.
6. `[latest WREN_REVIEW_<phase>.md]` — for design-level findings Echo should not re-litigate.

**Authoritative code paths (live):**
- `[<project>/server/<path/to/changed/file>.js]` — what changed.
- `[<project>/server/<path/to/shared/file>.js]` — what didn't change but might break.
- Live service: `[<URL:port>]`. Live DB: `[<path/to/db>]`. Live fronted URL: `[<https://…>]`.

**Live state right now:**
- Service phase: `[A/B/C/D/…]`. Counts: `[N transactions, M rules, K mappings, …]`. Health: `[OK/degraded]`.
- DB backups in `[<path/to/backups>]`. Recent: `[…]`.

---

## Verification scope

Two layers, both mandatory.

### Layer 1 — Run the full QA doc

Execute **every active behavior** in `[<project>/]qa/QA.md` (anywhere `[ ]` is not struck through). For each:
- **PASS**: behavior matches expected; mark with `[x]` + today's date.
- **FAIL**: write a finding to the report; save failure artifact under `[<project>/]qa/runs/<today>/<VB-ID>/`; mark with a temporary `[!]` in the QA doc so Rusty notices on curation.
- **NEEDS-DECISION**: behavior is correct in code but the spec is ambiguous, or the result depends on something not specified; write a NEEDS-DECISION finding with the decision you want Rusty/Patrick to make.

### Layer 2 — Phase-specific scope

These are the new or modified behaviors from this phase's Cinder report. Run them with extra depth — at minimum: render + interaction + effect + side-effects. For each, also re-run *one adjacent* behavior from the QA doc to catch regressions (the cross-cutting concern in `METHODOLOGY.md` §"Cross-cutting interaction checks").

**Phase-specific checklist (in priority order):**
1. `[specific behavior or code path]`.
2. `[specific behavior or code path]`.
3. `[specific behavior or code path]`.

---

## What you DON'T need to do

- Don't re-verify [what another reviewer caught]. Wren already verified [X]; commit history is the proof.
- Don't rewrite schema or code. If you find a real bug, list it; don't apply a fix.
- Don't promote yourself to Sonnet. Use `[minimax/MiniMax-M3]` primary as your config.

## Deliverable

A single `[<project>/]qa/ECHO_REPORT_<phase>.md` with:

1. **Header summary** — verdict (SHIP / FIX-FIRST / NEEDS-DISCUSSION), counts (X/Y behaviors PASS, Z FAIL, W NEEDS-DECISION).
2. **Behavior-by-behavior results** — for each active ID in QA.md, PASS/FAIL/NEEDS-DECISION with one paragraph of evidence. Group by status (all PASSes together, then all FAILs, etc.) — easier for Patrick to scan.
3. **Phase-specific findings** — design-level observations from the code review portion of this pass.
4. **Cross-cutting findings** — interactions, regressions, behavioral surprises.
5. **Failure artifact index** — list of `qa/runs/<today>/<VB-ID>/` paths. These get referenced by Cinder when she fixes.
6. **Overall recommendation** — SHIP / FIX-FIRST / NEEDS-DISCUSSION.

Append to or replace? `[Your call]`.

## Constraints

- Read-only when reasonable. Don't rewrite working code; if a fix is needed, list it.
- Use your default model (`[minimax/MiniMax-M3]`).
- Estimated time: `[N]` min for the doc run + `[M]` min for the phase-specific work. Stay focused.

---

## Appendix — failure artifact checklist

When you write a FAIL, you MUST produce all of these under `qa/runs/<today>/<VB-ID>/`:
- `screenshot.png` — page state before the failing action.
- `screenshot-after.png` — page state after (or whatever the failing state ended in).
- `console.log` — full browser console output.
- `network.log` — every request/response with status codes.
- `command.txt` — the exact Playwright command(s) you ran.
- `notes.md` — one paragraph: expected vs. observed, hypothesis on root cause, suggested fix.

Push completion event to parent session when done. If a BLOCKER is found, escalate immediately via sessions_send.
