# FirstStep: implementation plan

Gap analysis of the README (target) against the repo (current). Strategy: **adapt in place**.
Existing directories under `backend/` and `frontend/` stay; the README's `services/` layout is
not adopted because INTEGRATION.md, docker-compose and e2e tests depend on current paths.
Every Google service gets a **local fallback** behind one env switch, so the demo runs offline
and the cloud path is a configuration change.

## Current state

| README part | Repo today |
|---|---|
| Platform (users, portfolios) | Built (FastAPI + SQLite + JWT), not Firestore/Firebase |
| C1 planner (fuzzy + GA, MOEA/D, forecasting, news, reports) | Built; forecasts via Chronos/TimesFM adapters, not BigQuery; Laya notebooks exist |
| C2 gateway G1-G7, adversarial tests | Built (simulated models) |
| C2 Scam Shield (SHIELD-P001) | **Missing** |
| C3 policy, hashing, Hardhat contract, Express API | Built (JSON store, no BigQuery mirror, no OData, no Pub/Sub) |
| C4 agent | Built on local Ollama; no Gemini, no ADK, no grounding validator, no Guardian |
| OData v4 on every service | **Missing** |
| Zero trust (service tokens, step-up, App Check, IAP, VPC-SC) | Partial (JWT only) |
| Events | Kafka in C1 only; README wants Pub/Sub, C3 subscriber |
| Laya serve + distillation | Notebooks only |

## Phases

Each phase ends with tests green.

1. **C2 Scam Shield** (this slice): SHIELD-P001 v1.0 rules S1-S7, flag extraction
   (Gemini when `GEMINI_API_KEY` set, rule-based fallback), evidence tools (licensed registry,
   script similarity, link checks), `POST /shield/check`, seed corpus, tests.
2. **C4 grounding + Gemini**: number-matching validator, Gemini client with Ollama fallback,
   tool wiring to Shield/planner/audit, Guardian alert, Trust Panel pending actions.
3. **C3 completion**: event subscriber (anchors `decisions`), security-event anchoring,
   `DEMO_MODE`-gated Tamper, verify endpoint, mock/chain ledger switch.
4. **Shared OData layer** (`shared/odata`): `$filter/$select/$orderby/$top/$skip/$count/$expand`,
   paging, ETags, error format, `$metadata`; mount on each service under `/odata/v1/<svc>/`.
5. **Photo-to-Portfolio + Report Reader** (Gemini vision/long context, human confirm step).
6. **Laya**: serve wrapper, distillation scripts, per-language eval, routing/escalation +
   5% shadow check in C2/C4.
7. **Zero trust**: service-to-service tokens, audience checks, negative test suite, STEP-UP
   re-auth in frontend.
8. **Frontend**: Scam Shield screen, Guardian, Trust Panel wired to real API, Sinhala/Tamil.
9. **Infra**: Dockerfiles, `infra/` scripts, Pub/Sub, BigQuery SQL, Cloud Run deploy scripts,
   Campaign Radar. Scripts written and linted; **cannot be run without your GCP project**.
10. **Docs/eval**: update README build status honestly, evaluation scripts, demo script.

## Cannot be completed from this machine

Real deployment to Google Cloud, Sepolia anchoring, Laya fine-tuning on Vertex, VPC-SC,
Cloud Armor, IAP, labelled Sinhala/Tamil gold sets, second team member. README's own rule:
nothing is marked "done" until it runs on Google Cloud.
