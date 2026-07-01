# QA Methodology — Virta Tasks

> This project follows the discipline documented at `~/clawd/projects/accounting-app/qa/METHODOLOGY.md`. For the canonical description of roles, Playwright setup, behavior-ID convention, and failure-artifact spec, read that file first. This document only tracks project-specific adaptations and a thin scaffold until Echo populates QA.md for the first time.
>
> **Until then:** the discipline applies in spirit (Cinder appends Test coverage, Echo verifies behaviors), but QA.md for this project starts nearly empty. The methodology, templates, and structure are here so future work has a place to land — not as a substitute for actual verification.

## Why this starts thin

The QA doc is anchored in observed behavior + past regressions + the spec. Virta Tasks hasn't yet had a dedicated Echo QA pass — Phase A's review pass wasn't completed (see 2026-06-30 daily note), and Phase B/C/D aren't on the Books-style "Wren review → Echo browser QA" pipeline yet. Pretending we have a verified behavior list would deceive Echo into treating guesses as ground truth.

So: structure only. Behaviors get enumerated on the first real Echo-on-Tasks QA pass.

## Project-specific notes

- **Live DB:** `data/tasks.db` (shared with this `task-manager/` repo's path; reset based on production usage)
- **Live service:** `localhost:3001` (same Service as Books; Books routes are mounted at `/api/v1/books/`)
- **Live fronted URL:** `https://virta.muckdart.com`
- **Code areas most likely to receive Echo attention first:** project/column CRUD, task create/update, subtask flow (added 2026-06-30), calendar OAuth flows (Google credentials live here), categorization UI (legacy from before Books split out)
- **Existing backlog items affecting QA:** subtask inline detail, folder rules, urgency auto-sort, agent_status widget, subtask attachments — each will need behaviors once features ship

## Change log

- 2026-07-01 — Scaffold created. Methodology cross-linked to Books; QA.md and templates pending population by first Echo pass.
