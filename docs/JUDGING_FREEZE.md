# Judging freeze

From submission (18 Oct 2026) until results, judges use the live app. Every push to `main`
redeploys the services whose folders changed, and some redeploys wipe state. Keep the live app as
it was submitted.

## Do not push to `main`

| Path | What a push does | Why it hurts |
|---|---|---|
| `infra/` or `shared/` | Redeploys all six services | Everything below, at once |
| `backend/Platform/` | Redeploys the platform | Accounts live in SQLite on the instance: every judge's account and portfolio is deleted |
| `backend/Blockchain-Auditability/` | Redeploys C3 | The audit chain restarts empty: anchored records and the tamper demo history are gone |
| `backend/Fraud-Detection/` | Redeploys C2 | The engine's learned behaviour resets (harmless, but numbers shift mid-review) |
| `frontend/`, other `backend/` | Redeploys that service | ~15 s cold start for the next visitor, nothing lost |

Docs outside these folders (`docs/`, `README.md`, `eval/`) deploy nothing and are safe to push.

## If something must change

1. Push to a branch, not `main`. The workflow only runs on `main`.
2. If a live fix is unavoidable, redeploy only that service:
   `gh workflow run deploy.yml -f targets="c4"` (never `all`, never `platform` or `c3`).
3. Afterwards, check the live flow once: register, Fraud → Check a transfer (30,000, new
   beneficiary → STEP-UP → paste the scam → STOP), Assistant in Sinhala, Audit → Tamper-evidence.

## Things that can still go wrong on their own

- **Gemini free-tier quota.** Scam Shield falls back to the rule engine (footer says "the rule
  engine"); the Assistant answers that it is unavailable. Nothing breaks, but the demo is weaker.
- **Cold starts.** Services scale to zero; the first call after a quiet spell takes ~15 s.
- **Instance recycling.** Cloud Run can replace an idle platform or C3 instance at any time, with
  the same effect as a redeploy. A judge whose account vanished can register again in seconds.
