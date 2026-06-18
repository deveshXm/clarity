# Clarity — Launch Readiness Plan

_Drafted 2026-06-07. Scope from launch-prep request: full test pass, app cleanup, payments verification (live), eval re-run, build/deploy health. CommBot migration deferred (testing stays on Test workspace)._

## Guiding constraints
- **Live payments are outward-facing and real-money.** Test mode passes FIRST and gates the live check. The live charge is **you-driven** (your card, your click) — I prepare, verify, and watch logs, but don't transact on your behalf.
- **Don't break `dhruv` → `main` → Vercel auto-deploy.** All work on `dhruv`; nothing merges without your say.
- `DISABLE_QUOTA` is currently set locally — must be **off** for any quota/payment test or results are meaningless.

---

## Phase 0 — Hygiene & baseline (fast, no risk)
1. ✅ `evals/.venv/` gitignored (done).
2. Review `git status` — lots of untracked eval artifacts + the prompt/types changes from prior sessions. Decide what to commit vs ignore (e.g. `evals/data/simulation/` results, `.venv`).
3. `npm run build` + `npm run lint` — confirm the app compiles clean and there are no broken routes before testing anything live.
4. Confirm prod env parity: list which env vars Vercel needs (Stripe **live** keys, Slack prod tokens, Mongo, LangWatch) vs what's documented in `DEPLOY.md`.

## Phase 1 — Eval suites (correctness gate)
5. Finish the offline bench: re-run `generate_default.py` to regenerate `dataset.json` to the 5 shipped flags (only `flags.json` regenerated so far), then `evals:run` against a local `/api/evaluate`.
6. Re-run the three TS evals: `npm run evals:sim`, `npm run scenarios`, `npm run evals:style:deviation`.
7. Confirm no regression vs last recorded numbers (sim 95.7%, scenarios 9/9, style 100% band). Record results in `evals/EVAL_RESULTS.md`.

## Phase 2 — End-to-end QA in Slack (Test workspace)
8. Run `dev:test` (ngrok + dev) against the Test workspace.
9. Drive the live flows with the `/qa` skill: install/OAuth, message → flag → rephrase accept, harmful refusal, weekly digest, settings UI (flag toggles, target style). Fix bugs atomically, re-verify, before/after evidence.

## Phase 3 — Payments (TEST mode first, then LIVE)
10. **Test mode** (local, `sk_test_`, card `4242…`): full path — checkout → subscription created → webhook received → tier upgraded in DB → quota lifts → customer portal (cancel/manage). Turn `DISABLE_QUOTA` OFF to verify enforcement at the free-tier limit.
11. Audit the integration regardless of mode: `checkout`, `webhooks`, `portal` routes; price IDs; webhook signature verification; idempotency; what happens on failed/duplicate webhooks.
12. **Live mode** (production, **you-driven**): with live keys on Vercel, you run one real checkout on the deployed app; I watch Stripe + Vercel logs and DB to confirm the subscription propagates, then you cancel/refund. Smallest real amount.

## Phase 4 — Deploy & launch
13. Final `git diff` review of everything going to `main`.
14. PR `dhruv` → `main`, watch CI + Vercel deploy, canary-check production health.

## Deferred (separate follow-up)
- **CommBot workspace migration** — needs a new Slack app + OAuth redirect + token/env changes there. Scope-and-decide later; testing stays on **Test** for this launch.

---

## Open questions for you
- **Q1 — Build/lint:** OK for me to run `npm run build` now (Phase 0) to get a baseline? (read-only, no deploy)
- **Q2 — Live payment timing:** do the live charge (Phase 3 step 12) only after test mode + QA are green and the branch is deployed — agreed?
- **Q3 — Commit hygiene:** want me to propose a commit grouping for the pile of untracked eval/scenario files, or leave all of that to you?
