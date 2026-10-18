# FirstStep

**Live:** <https://firststep-web-214625202650.us-central1.run.app> (Google Cloud Run, `us-central1`)

**Stop the scam before the money moves. Then help people make the real decision safely.**

An AI copilot for first-time investors, built on Gemini.

**Google Cloud AI Builder Cup 2026 · Challenge 1: BFSI – Intelligent Risk, Fraud & Financial Experiences**

---

## Meet Kamala

Kamala is a retired teacher. Her late husband left her a small portfolio of shares she has
never really understood.

One evening a WhatsApp message arrives: *"Guaranteed 30% monthly returns. Only 10 slots left.
Your friend Nalini already joined."* There's a payment link and a countdown.

She forwards it to FirstStep. A few seconds later, in Sinhala:

> *"This is very likely a scam. The company isn't licensed to take investments, no real
> investment can guarantee 30% a month, and the payment goes to a personal account. Please
> don't send money."*

Her son gets a short alert on his phone. Kamala doesn't send anything.

A month later she needs Rs 300,000 for her granddaughter's school fees by March. She takes a
photo of her broker statement and asks out loud, *"What should I sell?"* FirstStep shows her
which shares to sell, on which days, and how much less she loses than if she sold everything at
once. When she sends the money to the school, a new payee, the app asks her to confirm with a
one-time code before it goes through.

Every answer tells her *why*. Every decision is recorded so that nobody, including us, can
quietly change it later.

**That is FirstStep. Everything after this section is how it works.**

---

## Running on Google Cloud today

Sections 4 to 15 describe the full design. This is what is deployed right now, so the two are
never confused.

| | What runs | Notes |
|---|---|---|
| **Web app** | Next.js on Cloud Run: <https://firststep-web-214625202650.us-central1.run.app> | Register any email; every new account gets a starter portfolio |
| **Platform** | Accounts, portfolios, RS256 token signing (JWKS) | One warm instance; SQLite, so accounts reset on each platform deploy |
| **C1 Portfolio** | Cash Planner (fuzzy + GA + baselines), MOEA/D, empirical forecast bands; decisions by fuzzy rules (Laya not served yet) | The fine-tuned TimesFM hybrid is evaluated offline (section 20), not served |
| **C2 Fraud** | Scam Shield (SHIELD-P001), transaction gateway G1-G7, STEP-UP, scam-pattern knowledge in **Google's Open Knowledge Format (OKF)** | Gemini reads red flags when a key with credit is configured; otherwise rules, and the verdict says which |
| **C3 Audit** | Policy, canonical hashing, OData, tamper demo, **AuditRegistry.sol on a Hardhat EVM inside the service** | Private chain that lives as long as the instance; Sepolia is the next step |
| **C4 Assistant** | LangGraph agent on Gemini, grounding validator, Trust Panel | Answers only when Gemini is reachable; otherwise says so, never invents |
| **Deploy** | GitHub Actions on every push to `main`, keyless (Workload Identity Federation) | Only changed services rebuild; `infra/deploy/deploy_lean.sh` |
| **Mobile** | Expo app in `mobile/`, customer screens only | Not published to a store; point `EXPO_PUBLIC_*_URL` at the services above |

**Roles.** Everyone who registers is a *customer* and sees only their own data. Two staff
accounts are provisioned by the platform at startup and cannot be self-registered:
`auditor@firststep.demo` (reads every audit record, alters nothing) and `admin@firststep.demo`
(admin and auditor; may reset demo state). Their password is a repository secret, not in this
file. Scaled to zero to keep cost near nothing; the platform keeps one instance.

Not deployed, to keep cost low: Kafka, MLflow, the OData gateway, Pub/Sub, BigQuery, the load
balancer, Cloud Armor and VPC-SC. Every service runs without them.

---

## What FirstStep does

| For Kamala | In plain words | Component |
|---|---|---|
| **Spots scams** | Checks a message, screenshot, voice note or link and says if it's a scam, and why | C2 Fraud & Scam Detection |
| **Plans cash** | Reads her statement from a photo and plans how to raise money by a deadline at the lowest loss | C1 Portfolio & Liquidity |
| **Explains everything** | Answers by voice or text in Sinhala, Tamil or English, and shows the evidence | C4 Explainable Assistant |
| **Keeps an honest record** | Seals every decision so anyone can check later that it wasn't changed | C3 Tamper-Evident Audit |

## Why it's different

- **It acts before the money moves.** Only about one in five scam victims in Southeast Asia
  gets anything back, so FirstStep is built to prevent, not to report.
- **The AI never has the final say.** AI models gather evidence and score risk; clear,
  versioned rules make the call. A confident-sounding model can't overrule hard evidence.
- **Every number is real.** The assistant can't state an amount it didn't get from a
  calculation. If it tries, the answer is rejected.
- **Every decision can be proven.** Each verdict and plan is sealed with the model and rules
  that produced it.

## Powered by Gemini

Gemini is the centre of FirstStep. It **reads** screenshots, statements and annual reports,
**reasons** as the agent that coordinates every component, **explains** each decision in the
user's language, and **teaches** the small, fast model (Laya) that handles high-volume
yes/no checks. Gemini also **supervises** that model: anything uncertain, unfamiliar or
high-stakes goes back to Gemini, and Gemini spot-checks the fast model's answers continuously.
TimesFM in BigQuery forecasts prices; Vertex AI, Agent Engine and Cloud Run run it all.

---

## Table of contents

- [Running on Google Cloud today](#running-on-google-cloud-today)

1. [The problem in numbers](#1-the-problem-in-numbers)
2. [The four components](#2-the-four-components)
3. [Demo script](#3-demo-script)
4. [Design principles](#4-design-principles)
5. [System architecture](#5-system-architecture)
6. [Model strategy: Gemini at the centre](#6-model-strategy-gemini-at-the-centre)
7. [Component 1: Portfolio and liquidity planning](#7-component-1-portfolio-and-liquidity-planning)
8. [Component 2: Fraud and scam detection](#8-component-2-fraud-and-scam-detection)
9. [Component 3: Tamper-evident auditability](#9-component-3-tamper-evident-auditability)
10. [Component 4: Explainable agentic assistant](#10-component-4-explainable-agentic-assistant)
11. [Integration and events](#11-integration-and-events)
12. [OData v4 API standard](#12-odata-v4-api-standard)
13. [Zero-trust architecture](#13-zero-trust-architecture)
14. [Google Cloud technology map](#14-google-cloud-technology-map)
15. [Responsible-AI framework](#15-responsible-ai-framework)
16. [Repository layout](#16-repository-layout)
17. [Quick start](#17-quick-start)
18. [Configuration](#18-configuration)
19. [Data sources](#19-data-sources)
20. [Evaluation plan](#20-evaluation-plan)
21. [Build status](#21-build-status)
22. [Known limitations](#22-known-limitations)
23. [Roadmap](#23-roadmap)
24. [Team](#24-team)
25. [References](#25-references)

---

## 1. The problem in numbers

**Scams are an everyday financial threat across the region, and investment scams are the
largest category.**

- UNODC estimates victims across East Asia, Southeast Asia, Australia and New Zealand lost
  USD 88.3–114.1 billion to transnational online scams in 2025, at least triple the 2023 estimate.
- In GASA's 2025 survey of 6,000 Southeast Asian adults, 63% received scam outreach in the
  past year and 22% lost money. Investment scams were the most common type reported, money
  left mainly through bank transfers and digital wallets, and only 22% of victims recovered
  any of it.
- In Sri Lanka, police report online scam complaints doubled in a year to about 3,100, and
  Sri Lanka CERT logged more than 12,650 cyber-related complaints in 2025. Common types include
  fake investment and forex schemes, instant-loan scams, phishing in the name of banks, and
  schemes targeting the elderly.

People who invest legitimately get little help either. Statements are hard to read, annual
reports are long, and when they suddenly need cash they sell whatever is easiest, often at the
worst possible cost. When an AI system does make a decision for them, there is no way to check
later that it wasn't changed.

| Who | Pain today |
|---|---|
| First-time investor | Can't tell a real opportunity from a scam; doesn't understand their own holdings |
| Family of an older investor | Finds out about the scam after the money is gone |
| Banks and regulators | See scam campaigns late; can't verify why an automated decision was made; can't plug new tools into existing systems easily |

---

## 2. The four components

| # | Component | Question it answers |
|---|---|---|
| 1 | **Portfolio & Liquidity Planning** | "What do I own, and how do I raise cash by a deadline at the lowest loss?" |
| 2 | **Fraud & Scam Detection** | "Is this offer a scam? Is this transfer safe?" |
| 3 | **Tamper-Evident Auditability** | "Can we prove this decision wasn't altered, and which model and policy made it?" |
| 4 | **Explainable Agentic Assistant** | "Why was this decided, in my language, and am I still in control?" |

Each component is an independent service with its own tests and its own OData v4 service
document. They share one identity provider, one event bus and one web app, and no service
trusts another by default.

---

## 3. Demo script

Kamala's story, as shown in the three-minute video, with the component behind each step.

1. **C2 · Scam Shield.** Kamala pastes the WhatsApp message (the deployed build takes text;
   screenshots are designed, not yet wired). The red-flag checks run, the entity is unlicensed and the text matches a known scam
   script. Verdict: **HIGH_RISK**, explained in Sinhala. Her son gets a Family Guardian alert.
2. **C3 · Audit.** The verdict is sealed with its model and policy version.
3. **C1 · Photo-to-Portfolio.** She photographs her broker statement; Gemini extracts her
   holdings for her to confirm.
4. **C4 · Assistant (voice, Sinhala).** *"I need Rs 300,000 for school fees by March."*
5. **C1 · Cash Planner.** A day-by-day sell plan, its cost versus naive selling, and
   per-holding forecast bands (empirical in the deployed build; the TimesFM hybrid's results
   are in section 20).
6. **C2 · Transaction gateway.** The transfer to a new payee is scored and the gateway asks
   for a **STEP-UP** check. Zero trust in action: a risky action needs fresh proof, even inside
   a valid session.
7. **C4 · Explanation.** Gemini explains why the scam was flagged, why the plan sells what it
   sells, and why the transfer needed an extra check. Every number traces to a tool output.
8. **C3 · Tamper demo.** An auditor queries the audit log through OData from a spreadsheet
   tool, alters a stored record, and verification fails instantly.

---

## 4. Design principles

### 4.1 Models score, rules decide

No model output directly triggers an action. Models produce **scores and evidence**; a
**deterministic, versioned policy engine** is the only component allowed to issue a verdict
or block a transaction.

> Example: a split-transfer attack where each transfer scores only "medium" risk is still
> **BLOCKED** once the running total reaches the single-transfer limit. The rule fires
> regardless of the score.

### 4.2 No ungrounded numbers

The assistant may **never** state a figure it did not receive from a tool. A grounding
validator checks every number in the final answer against that turn's tool outputs.
Requiring only that a tool was *called* is not enough; the numbers must *match*.

### 4.3 Gemini at the centre

Gemini reads, reasons, explains, teaches and supervises. A small model distilled from Gemini
(Laya) handles high-volume fixed checks, and Gemini keeps checking its work. Plain code does
arithmetic. See [section 6](#6-model-strategy-gemini-at-the-centre).

### 4.4 Prevention over detection

Verdicts, a "pause before you pay" step and family alerts all happen **before** money moves.

### 4.5 Every decision is provable

Every verdict, transaction decision and plan is canonicalised, hashed and anchored with its
model version and policy version. Only hashes and provenance go on-chain.

### 4.6 Never trust, always verify

Every request, from a user or another service, is authenticated, authorised against least
privilege, and logged. Network location grants nothing. See [section 13](#13-zero-trust-architecture).

### 4.7 Open by standard

Every component exposes its data and operations through **OData v4**, so a bank's core
system, a BI tool or a regulator's platform can connect without custom adapters.
See [section 12](#12-odata-v4-api-standard).

### 4.8 Failure isolation

No component depends on another on the request path except the assistant's tool calls. If
one service is down, the others keep working and the web app shows an explanatory state.

---

## 5. System architecture

```
     Web app (Firebase Hosting)    External systems (core banking, BI, regulators)
              |                                      |
     Firebase Auth + App Check              OAuth 2.0 client credentials
              |                                      |
              +---------------+----------------------+
                              |
             External HTTPS Load Balancer + Cloud Armor (WAF, rate limits)
                              |
                API gateway (Cloud Run) — token verification, OData routing
                              |
        (service-to-service: Google-signed ID tokens, Cloud Run IAM, internal ingress)
                              |
   +-------------+------------+-------------+--------------+------------------+
   |             |            |             |              |                  |
 Platform     C1 Portfolio  C2 Fraud &    C3 Audit       C4 Assistant      Laya inference
 OData svc    & Liquidity   Scam          OData svc      (ADK on Vertex    (Cloud Run GPU
 users,       OData svc     OData svc     policy,        AI Agent Engine)  or ONNX on CPU)
 portfolios   fuzzy + GA,   Scam Shield,  hashing,       Gemini, tools     fine-tuned
 (Firestore)  MOEA/D,       gateway       AuditRegistry  over C1-C3,       laya-multilingual
              import        G1-G7,        .sol           grounding         heads
                 |          BigQuery ML      ^           validator
                 v             |             |              |
       BigQuery AI.FORECAST    |             |              |
       (TimesFM)               v             |              v
   =============  Pub/Sub topic `decisions` (IAM-restricted publishers)  ============
                              |
                              v
        BigQuery (inside VPC Service Controls perimeter): decision log, audit mirror,
        Campaign Radar  ->  Looker Studio dashboards
```

---

## 6. Model strategy: Gemini at the centre

### 6.1 Gemini's five roles

| Role | What Gemini does |
|---|---|
| **Reader** | Reads screenshots, broker statements, voice transcripts and annual reports (multimodal, long context) |
| **Reasoner** | Runs the ADK orchestrator agent that plans each request and calls every component's tools |
| **Explainer** | Turns rule traces, scores and plans into plain language in Sinhala, Tamil and English |
| **Teacher** | Labels the training data that the fast Laya model learns from (distillation) |
| **Supervisor** | Handles every uncertain, unfamiliar or high-stakes case, and spot-checks Laya's answers continuously |

### 6.2 Laya: Gemini's fast path

Some questions are asked thousands of times with the same fixed answers, such as "does this
message promise a guaranteed return?" or "is this news item about this company?". For those,
FirstStep uses **Laya** (`convaiinnovations/laya`), a small non-autoregressive decision model
(ModernBERT-large, 421M parameters English / 322M multilingual, 512-token context, Apache 2.0)
that answers in one forward pass, about 33–40 ms on a T4 GPU.

Laya is a **student of Gemini**, not a replacement for it. It only answers questions Gemini has
taught it, only in languages where it has matched Gemini, and Gemini keeps checking its work.

### 6.3 Distillation pipeline (Gemini teaches Laya)

```
Raw inputs (scam messages, news items, holding snapshots, user requests)
        |
        v
Gemini labels them with structured output (fixed questions, fixed answer choices)
        |
        v
Human-checked gold set (a few hundred examples per head) validates Gemini's labels
        |
        v
Fine-tune Laya heads on Vertex AI custom training
        |
        v
Evaluate per head and per language: accuracy on the gold set + agreement with Gemini
        |
        v
Deploy a head for a language only if it meets the threshold; otherwise that language stays on Gemini
```

This solves the labelled-data problem: Gemini produces the training labels at scale, and a
small human-checked set keeps Gemini's labels honest.

### 6.4 Runtime flow

1. Every request enters through the **Gemini-orchestrated agent** (or a component's own
   Gemini step for images and documents).
2. Where a validated Laya head exists, it answers the fixed questions first.
3. **Escalation to Gemini** happens when the verdict band is `CAUTION`, the language is not
   validated, the input is an image or longer than Laya's window, or the decision is high-stakes.
4. **Shadow checking.** Gemini re-answers a random sample (default 5%) of Laya's decisions.
   Disagreements are logged, reviewed and fed back as new training data, so Laya keeps
   improving and drift is caught early.
5. Neither model makes the final call. Their answers are inputs to the deterministic rule
   engines (section 4.1).

### 6.5 Who does what

| Task | Primary | Fast path | Why |
|---|---|---|---|
| Reading screenshots, statements, PDFs | **Gemini** | — | Vision and documents |
| Orchestrating tools across components | **Gemini** (ADK) | — | Agentic reasoning |
| Explanations in Sinhala, Tamil, English | **Gemini** | — | Generation |
| Annual report Q&A | **Gemini** long context | — | Reports exceed Laya's window |
| Scam red-flag questions on message text | **Gemini** (teacher, supervisor, escalation) | Laya-multilingual | High volume, fixed questions |
| News relevance and sentiment (C1) | **Gemini** (teacher, supervisor) | Laya-multilingual | Thousands of short items |
| Per-holding sell / spread / defer / exclude (C1) | **Gemini** (teacher, supervisor) | Laya typed-decisions | Structured choice; never sets amounts |
| Intent routing in the assistant | **Gemini** (fallback) | Laya | Removes an extra model call from most turns |
| Output safety check | **Gemini** (teacher) | Laya | Runs on every response |
| Transaction risk (tabular) | **BigQuery ML** | — | Tabular data |
| Forecasts | **TimesFM** via `AI.FORECAST` | — | Time series |
| Amounts, costs, ratios, hashes | **Code** | — | Arithmetic is never delegated to a model |

### 6.6 Using Laya safely

- **Fine-tuned only.** The model card reports zero-shot typed-decision accuracy near the random
  baseline and describes Laya as a base to specialise. No head is used without fine-tuning.
  (A zero-shot trial on Cloud Run was rolled back: the news stage and the decision layer each
  loaded their own copy of the 808 MB base, which exceeded the instance's memory.)
- **Confidence is not trusted alone.** The model card warns the model can stay confident while
  wrong, so escalation uses verdict bands and shadow checks, not Laya's confidence.
- **Languages are validated, not assumed.** Sinhala, Tamil and code-mixed accuracy is measured
  separately; unvalidated languages route to Gemini.
- **Hosting.** Fine-tuning on Vertex AI custom training (L4 or T4). Serving on Cloud Run with
  GPU, or ONNX Runtime on CPU (`laya[onnx]`) where latency allows.

### 6.7 Why this design

Gemini does everything that needs understanding, generation or judgement; Laya makes the
high-volume checks fast and cheap enough to run on every message. Removing Laya would make the
system slower and costlier, not less capable. Removing Gemini would leave nothing that can read,
reason, explain or teach.

The system runs on Gemini on Vertex AI and is deployed on Cloud Run, as the competition requires.

---

## 7. Component 1: Portfolio and liquidity planning

> **Goal:** Let a first-time investor see what they own and raise cash by a deadline at the
> lowest realised loss, with every amount traceable.

### 7.1 Photo-to-Portfolio

The user photographs or uploads a broker or depository statement. Gemini (Document AI for
scanned PDFs) extracts symbol, quantity, average cost and currency into a fixed schema. The user
confirms every row before it is saved.

### 7.2 Forecasting

Forecasts come from **BigQuery ML `AI.FORECAST`** using Google's TimesFM foundation model:
p10 / p50 / p90 bands per holding, with no model to train or host. A plain LSTM baseline is
kept for comparison.

*Deployed today:* each holding's empirical return quantiles over two years, labelled as such,
feed the planner. A TimesFM model fine-tuned with LoRA plus an LSTM residual head ("hybrid")
was trained on a Colab T4 and evaluated walk-forward (section 20); it is registered locally but
not served, because TimesFM's 821 MB base would make every cold start of a scale-to-zero
service slow. News relevance and sentiment come from a fine-tuned Laya-multilingual head.

### 7.3 Cash Planner (fuzzy inference + genetic algorithm)

Raise amount `X` within `N` days at the lowest realised loss.

- **Fuzzy layer 1.** Mamdani system over urgency, market regime and position liquidity
  (27 rules) gives each holding a sell priority.
- **Fuzzy layer 2.** Zero-order Sugeno system over news sentiment, forecast outlook and
  attention spike gives a signed, monotone priority adjustment.
- **Laya decision layer.** A fine-tuned Laya typed-decisions head answers, per holding, *sell
  now / spread / defer / exclude* and *downside risk*. Answers adjust fuzzy priorities only;
  the GA still computes every amount. An excluded holding is capped at zero only if the rest
  can cover the target.
- **Genetic algorithm.** Searches ordered `(holding, fraction, day)` schedules under a hard
  deadline and a daily participation cap of 10% of average daily volume. Part of the initial
  population is seeded from the fuzzy ordering.
- **Fitness.** Square-root market-impact cost, forecast return given up, timing risk from the
  forecast band, FX conversion cost, crystallised loss against cost basis, and penalties for
  shortfall and priority deviation, scaled to the target amount.
- **Baselines** in every response: pro-rata, largest-first and most-liquid-first.
- **Infeasibility is an answer.** "You can raise Rs 220,000 of Rs 300,000 by March" returns
  normally with the shortfall.
- **Traceability.** Every plan carries a `FuzzyRuleTrace`, `CostBreakdown`, the Laya answers
  used, and `ModelVersion`.

### 7.4 Long-term allocation (MOEA/D)

Multi-objective optimization over expected return (p50 forecast), CVaR at 95%, and liquidity
cost charged on the trade. Three Pareto selection rules (knee, max-Sharpe, scalarized) are
reported side by side, against a Markowitz max-Sharpe baseline.

### 7.5 Report Reader

Annual and interim reports go into Gemini's long context (Document AI for scanned pages).
Answers cite the page. Ratios are computed in code.

---

## 8. Component 2: Fraud and scam detection

> **Principle:** the ML side never decides. It produces a score. A deterministic gateway is
> the only component allowed to choose an action.

### 8.1 Scam Shield (messages and offers)

**Knowledge in Open Knowledge Format.** The scam patterns Scam Shield recognises live in
`backend/Fraud-Detection/knowledge/scam-patterns/` as an OKF v0.2 bundle (Google Cloud's open
spec for agent-readable knowledge): one markdown concept per pattern with YAML frontmatter for
sources, `generated` / `verified` trust signals and `stale_after`, plus the SHIELD-P001 rules
that fire on it. Every verdict cites the concepts it rests on with their trust tier
(*unverified*, *machine-confirmed*, *human-reviewed*), and `GET /shield/knowledge` serves the
bundle. A reviewer promotes a pattern by adding a `human:` entry to `verified`; the bundle
informs, and the policy alone decides.

| Input | Handling |
|---|---|
| Text (SMS, WhatsApp, Telegram, email) | Gemini-taught red-flag questions, answered by the Laya fast path where validated; Gemini answers directly for `CAUTION` cases, unvalidated languages and shadow checks |
| Screenshot | Gemini reads the image, then the text path |
| Voice note | Speech-to-Text, then the text path |
| Link | Web Risk API, domain age, redirect chain, lookalike-domain check |

**Evidence tools** run in parallel: licensed-entity lookup (Vertex AI Search over the
regulator register), scam-script similarity (vector search over known scams), Google Search
grounding for news about the entity.

**Scam policy `SHIELD-P001 v1.0`** (fixed order, escalation only):

| Rule | Condition | Effect |
|---|---|---|
| S1 | Guaranteed return **and** entity not licensed | `HIGH_RISK` |
| S2 | Payment requested to a personal account or crypto wallet | at least `CAUTION` |
| S3 | Known scam-script similarity ≥ 0.85 | `HIGH_RISK` |
| S4 | Domain registered < 30 days ago | at least `CAUTION` |
| S5 | Impersonates a bank or regulator | `HIGH_RISK` |
| S6 | Combined risk score ≥ 0.70 | `HIGH_RISK` |
| S7 | Combined risk score 0.35–0.70 | at least `CAUTION` |

### 8.2 Transaction risk (dual-stream)

```
 Transaction
      |
 +----+--------------------+
 |                         |
Behavioural stream       Relational stream
deviation from the       shared devices, beneficiaries
user's own baseline      and IPs; two-hop risk from
                         blocked entities
 |                         |
 +----+--------------------+
      | late fusion -> risk score
 DETERMINISTIC GATEWAY (bands + rules G1..G7)
      |
 ALLOW / STEP-UP / BLOCK  ->  Pub/Sub `decisions`
```

- **Models.** BigQuery ML boosted-tree classifiers trained on public datasets (PaySim,
  IEEE-CIS), with per-prediction attributions from `ML.EXPLAIN_PREDICT`.
- **Bands.** risk < 0.35 → ALLOW; 0.35–0.70 → STEP-UP; ≥ 0.70 → BLOCK.

| Rule | Meaning | Effect |
|---|---|---|
| G1 | Amount ≥ 250,000 to a new device or payee while risk is elevated | BLOCK |
| G2 | Device change with amount ≥ 25,000 | at least STEP-UP |
| G3 | Relational risk ≥ 0.75 | at least STEP-UP |
| G4 | Account ≤ 7 days old moving ≥ 10,000 | at least STEP-UP |
| G5 | Behavioural ≥ 0.90 and relational ≥ 0.60 | BLOCK |
| G6 | Micro-payment from an established, clean account | capped at STEP-UP |
| G7 | Split transfers to one payee total ≥ the single-transfer limit | BLOCK |

### 8.3 Adversarial evaluation

| Attack | What it tests |
|---|---|
| Camouflage | Attacker mimics normal behaviour but keeps the mule device, payee and IP |
| Slow drift | Small daily nudges; the baseline learns only from ALLOWed transactions |
| Structuring | One large amount split into small transfers; G7 blocks it |

### 8.4 Campaign Radar

Anonymised verdicts (features and hashes only) stream into BigQuery. Similar reports are
clustered into campaigns by embedding similarity and shared entities, shown in Looker Studio.

---

## 9. Component 3: Tamper-evident auditability

> **Goal:** Any AI decision on the platform can later be proven unaltered, with the model and
> policy that produced it, without putting personal data on-chain.

1. **Policy engine** (`P001 v1.0`, deterministic, versioned):
   `riskScore ≥ 80 and confidence ≥ 70` → REJECT; `riskScore ≥ 80 and confidence < 70` →
   HUMAN_REVIEW; below 80 → APPROVE.
2. **Canonical hashing.** Fixed field set, sorted keys, SHA-256.
3. **On-chain anchoring.** `AuditRegistry.sol` stores only hash, decision, policy version,
   model version, timestamp and submitter. *Deployed today:* the C3 container starts a Hardhat
   EVM node, deploys the contract and anchors every decision as a contract transaction with a
   receipt and block number. The chain is private and lives as long as the instance, like the
   records it commits to; if it cannot start, C3 serves on a fallback ledger and labels it
   "chain unavailable". Target: an Ethereum testnet (Sepolia) via Blockchain Node Engine.
4. **BigQuery mirror.** Every off-chain record and its hash is also written to BigQuery and
   exposed through the C3 OData service, so auditors can query it from Excel, Power BI or any
   OData client.
5. **Human-in-the-loop.** Reviewers approve or reject HUMAN_REVIEW items; each review is a new
   canonical record and commitment. Reviewer access goes through Identity-Aware Proxy.
6. **Verification.** The `Verify` function recomputes the hash and compares it with the
   on-chain commitment. A `Tamper` action (demo only, disabled in production config) alters a
   record on purpose.
7. **Security events.** Zero-trust denials (rejected tokens, policy violations) are also
   anchored, so the security log itself is tamper-evident.

This is a hash-commitment scheme. Zero-knowledge proofs are not implemented.

---

## 10. Component 4: Explainable agentic assistant

> **Goal:** One assistant, in Sinhala, Tamil or English, by text or voice, that explains
> every decision on the platform and keeps the user in control.

### 10.1 Agent design

*Deployed today:* a LangGraph agent on Cloud Run with the same tools and checks, calling Gemini.
The ADK / Agent Engine version below is the target; its deploy script is written, not run.

```
Orchestrator (ADK on Vertex AI Agent Engine, Gemini)
   (Laya fast path pre-classifies intent; Gemini decides the plan)
 ├── scam_tools        -> C2  Shield.Check
 ├── transaction_tools -> C2  Transactions.Score
 ├── portfolio_tools   -> C1  Portfolios, Portfolio.Import
 ├── planner_tools     -> C1  Planner.Plan, Forecasts
 ├── report_tools      -> C1  Report.Ask
 ├── audit_tools       -> C3  AuditRecords, Verify
 └── grounding validator + Laya output-safety check + responsible-AI checks
```

- **Least privilege for the agent.** The assistant runs under its own service account and
  acts **on behalf of the user** with the user's token. It can only read what the user can
  read, and every write requires Trust Panel confirmation.
- **Typed tool contracts.** Tools call the OData services and return structured output.
- **Failure handling.** Turn and time budgets; one re-ask on a malformed tool call; a safe
  fallback on a second failure.

### 10.2 Explainability

- **Fraud and scam:** ranked reasons, fired rules, Laya red-flag answers and `ML.EXPLAIN_PREDICT`
  attributions.
- **Plans:** fuzzy rule trace, Laya decisions used, cost breakdown and baselines.
- **Audit:** anchoring status, policy version and model version.
- Gemini turns the evidence into plain language. Responses list the tools that ran and the raw
  evidence.

### 10.3 Voice, Trust Panel and Family Guardian

- **Voice:** Speech-to-Text and Text-to-Speech for Sinhala, Tamil and English.
- **Trust Panel:** any action that saves data, moves money or contacts someone is shown first
  and confirmed by the user; saved actions can be rolled back.
- **Family Guardian:** on a `HIGH_RISK` verdict, a nominated contact gets a short alert with the
  reason, never the message content.

---

## 11. Integration and events

| Concern | How it works |
|---|---|
| Identity | Firebase Auth for users; OAuth 2.0 client credentials for external systems; Google-signed ID tokens between services |
| User data | Platform service owns users and portfolios in Firestore |
| Data access | Every component exposes an OData v4 service |
| Decisions | Every C1 and C2 decision is published to Pub/Sub `decisions` |
| Audit | C3 subscribes to `decisions` and anchors every event |
| Explanation | C4 calls C1–C3 through typed OData tools |

### Decision event

```json
{
  "event_id": "...",
  "event_type": "fraud.transaction | scam.verdict | portfolio.plan",
  "schema_version": "1.0",
  "component": "c1 | c2",
  "occurred_at": "...",
  "model_version": "...",
  "policy_version": "...",
  "principal": "user or service identity that caused the decision",
  "request": { },
  "response": { }
}
```

---

## 12. OData v4 API standard

### 12.1 Why OData

Banks, insurers and regulators already run tools that speak OData (Excel, Power BI, SAP,
Dynamics, many core-banking integration layers). Exposing every component as an OData v4
service means a future integration is configuration, not custom code: a client reads the
`$metadata` document and knows every entity, field and operation.

### 12.2 Conventions

- **OData v4.0**, JSON format (`application/json;odata.metadata=minimal`), `OData-Version: 4.0`
  on every response, and a CSDL `$metadata` document published by every service.
- **Entity sets** for data that is listed and queried; **Actions** for operations with side
  effects; **Functions** for side-effect-free computations. Every action and function declares
  its parameters and return type in `$metadata`, generated from the same request models the
  endpoints validate against, so the contract cannot drift from the code.
- **Supported query options:** `$filter` (incl. `contains`, `startswith`, `endswith`),
  `$select`, `$expand`, `$orderby`, `$top`, `$skip`, `$count`, `$format=json`, and the
  `/<EntitySet>/$count` segment. `$search` and `$apply` return **501 Not Implemented**, and
  unknown `$` options return 400: an ignored option would hand back unfiltered data that the
  client believes was filtered.
- **Server-driven paging** with a URL-encoded `@odata.nextLink`; maximum page size 200.
- **Optimistic concurrency** with ETags (`If-Match`) on updates.
- **Errors** in the OData JSON error format.
- **Versioned service roots:** `/odata/v1/...`.
- **Authorisation** is applied *before* query evaluation: a `$filter` or `$expand` can never
  return rows the caller is not allowed to see.

### 12.3 Service catalogue

**Platform** — `/odata/v1/platform/`

| Kind | Name | Notes |
|---|---|---|
| Entity set | `Users` | Own record only |
| Entity set | `Portfolios`, `Holdings` | `Portfolios?$expand=Holdings` |

**C1 Portfolio & Liquidity** — `/odata/v1/portfolio/`

| Kind | Name | Notes |
|---|---|---|
| Action | `ImportStatement` | Image or PDF in, draft `Holdings` out for confirmation |
| Action | `Plan` | Target amount and deadline in, `CashPlan` out |
| Action | `Optimize` | MOEA/D allocation with a selection rule |
| Entity set | `CashPlans`, `PlanSteps` | `CashPlans(id)?$expand=PlanSteps,Baselines` |
| Function | `Forecast(Symbol='...',Horizon=21)` | p10 / p50 / p90 from `AI.FORECAST` |
| Action | `AskReport` | Question over a company report, with page citations |

**C2 Fraud & Scam** — `/odata/v1/fraud/`

| Kind | Name | Notes |
|---|---|---|
| Action | `CheckMessage` | Text, image, audio or link in, `Verdict` out |
| Action | `ScoreTransaction` | Transaction in, action, reasons and fired rules out |
| Entity set | `Verdicts`, `TransactionDecisions` | e.g. `Verdicts?$filter=Level eq 'HIGH_RISK'&$orderby=CreatedAt desc` |
| Entity set | `Campaigns` | Institution role only |
| Action | `SimulateAttack` | Camouflage, slow drift or structuring |

**C3 Audit** — `/odata/v1/audit/`

| Kind | Name | Notes |
|---|---|---|
| Entity set | `AuditRecords` | Hash, decision, policy and model versions, anchor status |
| Function | `Verify(RecordId='...')` | Recomputes the hash and compares with the chain |
| Action | `Review` | Records a human review |
| Action | `Tamper` | Demo only; disabled unless `DEMO_MODE=true` |

**C4 Assistant** — `/odata/v1/assistant/`

| Kind | Name | Notes |
|---|---|---|
| Action | `Chat` | Text or voice turn; returns answer, tools run, evidence, responsible-AI report |
| Entity set | `Conversations`, `PendingActions` | Trust Panel items awaiting confirmation |
| Action | `Confirm`, `Rollback` | Trust Panel |
| Entity set | `Guardians` | Trusted contacts |

All services also expose `GET /health` (outside the OData root) for health checks.

### 12.4 Example

```http
GET /odata/v1/fraud/Verdicts?$filter=Level eq 'HIGH_RISK' and CreatedAt ge 2026-10-01T00:00:00Z
    &$select=Id,Level,ReasonCodes,PolicyVersion&$top=50
Authorization: Bearer <token>
```

```http
POST /odata/v1/portfolio/Plan
Authorization: Bearer <token>
Content-Type: application/json

{ "PortfolioId": "p-123", "TargetAmount": 300000, "Currency": "LKR", "DeadlineDays": 120 }
```

---

## 13. Zero-trust architecture

### 13.1 Principles

1. **Verify explicitly.** Every request carries a verifiable identity; every service checks it.
2. **Least privilege.** Every identity, human or machine, gets only the permissions its job needs.
3. **Assume breach.** Network position grants nothing; every hop is authenticated and logged,
   and blast radius is limited by design.
4. **Continuous verification.** Risky actions require fresh proof, even inside a valid session.

### 13.2 Controls

| Layer | Control | Implementation |
|---|---|---|
| **User identity** | Strong authentication | Firebase Auth with MFA for sensitive roles; short-lived ID tokens |
| **Device and app** | Only genuine clients | Firebase App Check on the web app |
| **External systems** | Machine identity | OAuth 2.0 client credentials, scoped per client, short-lived tokens |
| **Token signing** | Only one service can mint | RS256: the platform alone holds the private key (Secret Manager / its own volume) and publishes `/.well-known/jwks.json`; every component verifies with the public key and accepts exactly one algorithm, so an HS256 token is refused even with a "correct" secret. User tokens are addressed to the app (`aud: firststep-app`); service tokens name each component they may call, and a machine identity can never obtain the app audience |
| **Fail closed** | Misconfiguration refuses, never accepts | `AUTH_REQUIRED` is on unless explicitly `false`; no key configured means 500, not "allow"; placeholder or short client secrets stop the platform at start-up |
| **Row-level data** | A customer sees only their own records | Owner stamped by the producing component from the authenticated caller, inside the hashed audit envelope; C3 and C2 filter every read path (list, entity, `$count`, `Verify`) before query options run; auditors and scoped service identities see all |
| **Network (local)** | Nothing reachable that need not be | Host ports bound to 127.0.0.1 (`BIND_ADDR`); Kafka on an internal-only network with no host port; MLflow loopback-only; the OData gateway is the single entry point for external systems |
| **Authorisation** | Least privilege by role, not just a valid login | `roles` claim granted only by deployment config (`PLATFORM_ROLES`), never by the API. Role-bearing addresses are provisioned by the platform at startup and refused at self-registration (registration does not prove ownership of an email). C3 human review needs `auditor`; resetting audit records needs `admin` *and* `DEMO_MODE`; the tamper demo alters only the caller's own record (or any, for `admin`); resetting C2's shared fraud state needs `admin`; outside `DEMO_MODE` only the components that made a decision may anchor it |
| **Edge** | Filter before the app | External HTTPS Load Balancer with Cloud Armor: WAF rules, rate limits, geo and bot controls |
| **Admin and reviewer consoles** | Context-aware access | Identity-Aware Proxy in front of C3 review and admin screens |
| **Service to service** | No implicit trust | Cloud Run services set to internal ingress and require IAM authentication; callers present Google-signed ID tokens |
| **Workload identity** | No keys | One service account per service, least-privilege IAM roles, no exported keys; Workload Identity Federation for CI |
| **Agent** | Acts as the user | C4 calls tools with the user's delegated token, never with elevated rights |
| **Data perimeter** | Stop exfiltration | VPC Service Controls perimeter around BigQuery, Vertex AI and Cloud Storage |
| **Secrets** | No secrets in code | Secret Manager, rotated, accessed only by the owning service account |
| **Supply chain** | Only trusted images | Artifact Registry with vulnerability scanning; Binary Authorization for Cloud Run |
| **Encryption** | In transit and at rest | TLS everywhere; Google-managed encryption, CMEK optional for audit data |
| **Events** | Trusted publishers only | Pub/Sub topic IAM: only C1 and C2 service accounts may publish to `decisions` |
| **Continuous verification** | Step-up on risk | C2 gateway STEP-UP triggers re-authentication for risky transfers; Trust Panel for sensitive writes |
| **Monitoring** | See everything | Cloud Audit Logs, Cloud Logging, Security Command Center; denials anchored by C3 |

### 13.3 Trust boundaries

```
 Untrusted          | Edge                 | Application             | Data
 -------------------+----------------------+-------------------------+---------------------
 Browser, bots,     | Load Balancer,       | Cloud Run services      | BigQuery, Firestore,
 external systems   | Cloud Armor, IAP,    | (internal ingress,      | Vertex AI, Storage
                    | gateway token check  | IAM-authenticated)      | (VPC-SC perimeter)
```

Every arrow across a boundary carries a token that is verified on arrival.

---

## 14. Google Cloud technology map

**Live** runs in the deployed app today. **Offline** was built and evaluated but is not served.
**Planned** is designed (often with code or scripts written) but not running. What stands in for
a planned service today is named in the last column.

| Need | Google technology | Status | Today |
|---|---|---|---|
| Services, build, deploy | **Cloud Run**, **Cloud Build**, **Artifact Registry**, **Workload Identity Federation** (keyless CI) | Live | Six services; GitHub Actions deploys on every push |
| Secrets | **Secret Manager** | Live | Signing key and service-client secrets; the Gemini key comes from the `GEMINI_API_KEY` GitHub secret when set, else `firststep-gemini-key` |
| Reasoning, red flags, explanation | **Gemini** (Gemini API) | Live | Scam Shield red flags, the assistant, statement import; rules take over and say so when it is unavailable |
| Gemini on **Vertex AI** | | Planned | Gemini API via an AI Studio key |
| Scam-pattern knowledge | **Open Knowledge Format (OKF)** | Live | Bundle cited in every Scam Shield verdict |
| Forecasting foundation model | **TimesFM**, fine-tuned with LoRA | Offline | Trained on a Colab T4, evaluated walk-forward (section 20); the app shows empirical bands |
| Forecasting in SQL | **BigQuery ML `AI.FORECAST`** | Planned | SQL written in `data/sql/`, not run |
| Agents | **ADK** + **Vertex AI Agent Engine** | Planned | LangGraph agent on Cloud Run calling Gemini; deploy script written |
| Fast path for fixed checks | **Laya**, distilled from Gemini on **Vertex AI custom training** | Planned | Not served (section 6.6) |
| Fresh facts, entity lookup, script similarity | **Grounding with Google Search**, **Vertex AI Search**, **Vertex AI Vector Search** | Planned | Seed licensed-entity register and local similarity |
| Fraud models and attributions | **BigQuery ML**, `ML.EXPLAIN_PREDICT` | Planned | A simulated dual-stream scoring engine plus the deterministic gateway |
| Documents | **Document AI** | Planned | Gemini reads statement photos |
| Link safety | **Web Risk API** | Planned | Opt-in code path, untested live |
| Voice and language | **Speech-to-Text**, **Text-to-Speech**, **Cloud Translation** | Planned | Browser speech APIs; Gemini replies in Sinhala, Tamil or English |
| Events, analytics, dashboards | **Pub/Sub**, **BigQuery**, **Looker Studio** | Planned | Events go straight to the audit service |
| Blockchain node | **Blockchain Node Engine** (Ethereum testnet) | Planned | `AuditRegistry.sol` on a Hardhat EVM inside the audit service |
| App data and identity | **Firestore**, **Firebase Auth**, **App Check**, **Identity-Aware Proxy** | Planned | SQLite on the platform service; the platform's own RS256 tokens and JWKS |
| Edge and perimeter | **Cloud Load Balancing**, **Cloud Armor**, **VPC Service Controls**, **Binary Authorization** | Planned | Every service verifies tokens itself |
| Monitoring | **Cloud Logging** | Live | Cloud Run's default logging |
| Monitoring | **Cloud Audit Logs**, **Security Command Center**, **Vertex AI Experiments** | Planned | Denials sealed in the audit trail; MLflow for experiments |

---|---|---|
| Reasoning, vision, explanation | **Gemini on Vertex AI** | C1, C2, C4 |
| Teaching and supervising the fast path | **Gemini** labels training data and shadow-checks answers | C1, C2, C4 |
| Fast path for fixed checks | **Laya**, distilled from Gemini on **Vertex AI custom training**, served on **Cloud Run (GPU)** | C1, C2, C4 |
| Agents | **ADK** + **Vertex AI Agent Engine** | C4 |
| Fresh facts | **Grounding with Google Search** | C2 |
| Licensed-entity lookup | **Vertex AI Search** | C2 |
| Scam-script similarity | **Vertex AI Vector Search** / BigQuery vector search | C2 |
| Scam-pattern knowledge | **Open Knowledge Format (OKF)** bundle, cited in every verdict | C2, C4 |
| Forecasting | **BigQuery ML `AI.FORECAST` (TimesFM)** | C1 |
| Fraud models and attributions | **BigQuery ML**, `ML.EXPLAIN_PREDICT` | C2, C4 |
| Documents | **Document AI** | C1 |
| Link safety | **Web Risk API** | C2 |
| Voice and language | **Speech-to-Text**, **Text-to-Speech**, **Cloud Translation** | C4 |
| Events | **Pub/Sub** | all |
| Analytics and audit mirror | **BigQuery** | C2, C3 |
| Dashboards | **Looker Studio** | C2, C3 |
| Blockchain node | **Blockchain Node Engine** (Ethereum testnet) | C3 |
| Services | **Cloud Run** | all |
| App data | **Firestore** | Platform |
| Identity | **Firebase Auth**, **App Check**, **Identity-Aware Proxy** | all |
| Edge security | **Cloud Load Balancing**, **Cloud Armor** | all |
| Data perimeter | **VPC Service Controls** | all |
| Secrets and supply chain | **Secret Manager**, **Artifact Registry**, **Binary Authorization** | all |
| Monitoring | **Cloud Logging**, **Cloud Audit Logs**, **Security Command Center** | all |
| Experiments | **Vertex AI Experiments** | C1, C2 |

---

## 15. Responsible-AI framework

| Principle | Implementation |
|---|---|
| **Determinism where it matters** | Scam policy, transaction gateway and audit policy are versioned rule engines; models only supply scores |
| **Grounding** | C4 rejects any answer whose numbers don't match tool output |
| **Supervised models** | Gemini teaches and spot-checks the fast path; code does arithmetic |
| **Explainability** | Fuzzy rule traces and Laya answers (C1), reasons and attributions (C2), provenance (C3), plain-language explanation (C4) |
| **Auditability** | Every decision and every security denial hashed and anchored (C3) |
| **Human oversight** | STEP-UP challenges (C2), HUMAN_REVIEW queue (C3), Trust Panel (C4) |
| **Privacy** | Only hashes on-chain; message bodies not stored after analysis; data perimeter around analytics |
| **Safety** | Laya output-safety check blocks "guaranteed return" language and buy recommendations |
| **Honesty** | Low-evidence checks labelled "unverified", never "safe" |
| **Fairness** | Accuracy and false-positive rates reported per language |
| **Not financial advice** | FirstStep explains and plans; it does not recommend buying any security |

---

## 16. Repository layout

The repository adapts the original plan in place; paths below are the real ones.

```
backend/
  Gateway/                  API gateway: token check, /odata/v1/<service>/ routing
  Platform/                 users, portfolios, client-credentials tokens (SQLite; Firestore planned)
  Portfolio-Optimization/   C1: planner (fuzzy + GA), MOEA/D, forecasting, news, fundamentals,
                            importer/ (statement photo), fundamentals/ask.py (Report Reader),
                            service/odata_c1.py (CashPlans, PlanSteps, Forecast)
  Fraud-Detection/          C2: gateway G1-G7, shield/ (SHIELD-P001, evidence, routing, radar),
                            stepup.py, events.py, odata_service.py
  Blockchain-Auditability/  C3: Express backend (policy, hashing, ledger adapter, events, OData),
                            blockchain/ (AuditRegistry.sol, Hardhat), frontend/ (standalone demo)
  Agentic-Assistance/       C4: agent, grounding.py, guardian.py, trust_panel.py, responsible_ai/
  Laya/                     heads, serve.py, distill.py, eval.py
shared/
  odata/                    OData query engine, paging, errors, $metadata
  auth/                     zero-trust token verification, service tokens
frontend/                   Next.js app (Scam Shield, Trust Panel, voice, statement import)
mobile/                     Expo (React Native) customer app
data/sql/                   BigQuery schemas, models, views
infra/                      deploy/deploy_lean.sh (what runs today), docker/, iam/, network/
.github/workflows/          deploy.yml: Cloud Run deploy on every push to main
eval/                       scam_eval.py and labelled seed set
docs/PLAN.md                gap analysis and phase plan
```

---

## 17. Quick start

### Prerequisites

- A Google Cloud project with billing enabled (VPC Service Controls needs the project to sit
  inside a Google Cloud organization)
- `gcloud` CLI, Python 3.12, Node 20
- A Sepolia RPC endpoint for C3, or `LEDGER_MODE=mock`

```bash
gcloud config set project $PROJECT_ID
gcloud services enable aiplatform.googleapis.com run.googleapis.com bigquery.googleapis.com \
  pubsub.googleapis.com firestore.googleapis.com documentai.googleapis.com \
  webrisk.googleapis.com speech.googleapis.com texttospeech.googleapis.com \
  translate.googleapis.com secretmanager.googleapis.com iap.googleapis.com \
  binaryauthorization.googleapis.com artifactregistry.googleapis.com
```

### Local development

```bash
cp .env.example .env            # set JWT_SECRET; optionally GEMINI_API_KEY
docker compose up --build       # platform, C1-C4, frontend, Kafka, MLflow
```

Without Docker, per service (see each backend README and INTEGRATION.md):

```bash
cd backend/Platform               && uv run uvicorn service.api:app --port 8100
cd backend/Portfolio-Optimization && uv run uvicorn service.api:app --port 8000
cd backend/Fraud-Detection        && uvicorn app:app --port 8001
cd backend/Blockchain-Auditability/backend && PORT=8002 node src/index.js
cd backend/Agentic-Assistance     && uvicorn main:app --port 8003
cd backend/Laya                   && uvicorn serve:app --port 8090      # optional, needs a checkpoint
cd frontend                       && npm install && npm run dev
```

Tests: `pytest` in each Python backend (Fraud-Detection, Platform, Portfolio-Optimization,
Agentic-Assistance, Laya, Gateway), `pytest` in `shared/odata`, `npm test` in
`backend/Blockchain-Auditability/backend`. Set `AUTH_REQUIRED=true` to enforce tokens.

### Deploy

**What is used today.** Every push to `main` runs `.github/workflows/deploy.yml`, which
authenticates keylessly and runs `infra/deploy/deploy_lean.sh` for the services whose folders
changed (`shared/` or `infra/` changes redeploy everything). By hand:

```bash
PROJECT_ID=firststep-buildathon bash infra/deploy/deploy_lean.sh            # everything
PROJECT_ID=firststep-buildathon bash infra/deploy/deploy_lean.sh c2 frontend # only these
```

New environment variables or secrets must be added to `deploy_lean.sh`, or they will not exist
on Cloud Run. One-time setup for CI is `infra/deploy/setup_github_deploy.sh`.

**Full design (not yet run).** The scripts below build the complete architecture in sections
5 and 13; expect to fix drift.

```bash
bash infra/iam/create_service_accounts.sh
bash infra/deploy/create_resources.sh            # BigQuery, Pub/Sub, Firestore, secrets
bash infra/deploy/deploy_services.sh             # build + Cloud Run for every service
bash infra/network/create_edge.sh                # load balancer + Cloud Armor (needs DOMAIN)
python infra/deploy/deploy_agent_engine.py       # needs STAGING_BUCKET
bash infra/network/create_vpcsc_perimeter.sh     # requires an organization
```

---

## 18. Configuration

| Variable | Used by | Meaning |
|---|---|---|
| `PROJECT_ID`, `REGION` | all | Google Cloud project and region |
| `GEMINI_MODEL` | C1, C2, C4 | Gemini model ID (default `gemini-3.5-flash-lite`; 2.0-flash and 2.5-flash-lite are retired for new projects) |
| `GEMINI_API_KEY` | C1, C2, C4 | The `GEMINI_API_KEY` GitHub secret when set (passed as an env var by CI), else Secret Manager `firststep-gemini-key` |
| `PLATFORM_ROLES` | Platform | `email:role role;email:role`; known roles `admin`, `auditor`. These accounts are provisioned at startup and cannot be self-registered |
| `PLATFORM_STAFF_PASSWORD` | Platform | Password for the provisioned staff accounts (12+ characters; GitHub secret `FIRSTSTEP_STAFF_PASSWORD` in CI) |
| `PLATFORM_STARTER_PORTFOLIO` | Platform | `true` gives every new account the demo portfolio |
| `PROJECT_NUMBER` | deploy | Passed by CI so the deploy needs no Resource Manager API |
| `LAYA_ENDPOINT` | C1, C2, C4 | Internal URL of the Laya inference service |
| `LAYA_HEADS` | Laya | Which fine-tuned heads to load (e.g. `scam_flags,news,decision,intent,safety`) |
| `LAYA_LANGS_VALIDATED` | C2, C4 | Languages Laya is trusted for; others route to Gemini |
| `BQ_DATASET` | C1, C2, C3 | BigQuery dataset |
| `PUBSUB_DECISIONS_TOPIC` | C1–C4 | Decision events |
| `SEARCH_DATASTORE_ID` | C2 | Licensed-entity register |
| `SHIELD_POLICY_VERSION`, `GATEWAY_POLICY_VERSION`, `AUDIT_POLICY_VERSION` | C2, C3 | Active policy versions |
| `PARTICIPATION_CAP` | C1 | Daily selling cap as a fraction of average daily volume |
| `CHAIN_RPC_URL`, `REGISTRY_ADDRESS`, `LEDGER_MODE` | C3 | Chain endpoint, contract address, `chain` or `mock` |
| `ODATA_MAX_PAGE_SIZE` | all | Default 200 |
| `ALLOWED_AUDIENCES` | all | Token audiences each service accepts |
| `DEMO_MODE` | C2, C3 | Enables the `Tamper` action and shows the step-up code on screen; must be `false` in production |
| `GUARDIAN_ENABLED` | C4 | Enable family alerts |

---

## 19. Data sources

| Data | Source | Notes |
|---|---|---|
| Scam messages | Public warnings from Sri Lanka CERT, police and regulators; GASA and similar reports; synthetic examples | Used to fine-tune and test Laya scam heads; synthetic examples labelled |
| Licensed entities | Public regulator registers | Dated snapshot |
| Transactions | PaySim, IEEE-CIS (public) | For C2 transaction models |
| Market prices | Colombo Stock Exchange, Yahoo Finance | Loaded into BigQuery |
| Company reports | CSE announcements | Public PDFs |
| News | Google News, GDELT, RSS | For C1 sentiment; raw text not stored |

---

## 20. Evaluation plan

| Area | Question | Metric | Comparison |
|---|---|---|---|
| C1 | Does the Cash Planner save money? | Realised loss and slippage | Pro-rata, largest-first, most-liquid-first |
| C1 | Does the Laya decision layer help? | Realised shortfall, per-question accuracy | Rules only vs rules + Laya |
| C1 | Is statement import accurate? | Field-level accuracy | Gemini vs Document AI |
| C2 | Does Scam Shield catch scams without crying wolf? | Precision, recall, false-positive rate per language | Laya + rules vs Gemini + rules vs rules only |
| C2 | Is Laya fast enough to matter? | p50 / p95 latency, cost per 1,000 checks | Laya vs Gemini on the same questions |
| C2 | Do the transaction models work? | Precision, recall, PR-AUC | Behaviour-only vs dual-stream |
| C2 | Does the gateway resist attacks? | Final action under each attack | Model only vs model + rules |
| Laya | Is it calibrated? | Expected calibration error per head and language | Before and after fine-tuning |
| C3 | Is every decision anchored? | % of events anchored; time to anchor | — |
| C3 | Is tampering detected? | Detection rate on altered records | — |
| C4 | Is the assistant grounded? | % of responses passing the validator first time | Prompt variants |
| C4 | Is routing correct? | Laya intent accuracy | Laya vs Gemini routing |
| Zero trust | Are unauthorised calls rejected? | Pass rate of a negative test suite (no token, wrong audience, expired token, cross-user OData `$filter`/`$expand`, direct call bypassing the gateway) | — |
| OData | Is the API standards-compliant? | `$metadata` validates; an off-the-shelf OData client (Excel or Power BI) can read every entity set | — |

All results are reported with test-set sizes. Negative results are reported, not tuned away.

### Results so far: RQ1, forecast quality (C1)

Walk-forward backtest, 5-day horizon, no look-ahead, scored on the 7 folds every model shares
(`backend/Portfolio-Optimization/experiments/colab_finetune.ipynb`, Colab T4).

| Model | Folds | Predictions | Pinball loss | MAE | p10 / p50 / p90 coverage |
|---|---|---|---|---|---|
| **Hybrid** (TimesFM + LoRA, LSTM residual head) | 7 | 8,558 | **0.00800** | **0.0248** | 14.4% / 54.8% / 87.2% |
| LSTM baseline | 7 | 9,944 | 0.00858 | 0.0264 | 12.3% / 50.3% / 84.4% |

The hybrid is 6.8% better on pinball loss and better on MAE, and its upper band is more honest
(87.2% against a 90% target). It is *not* better calibrated everywhere: its p10 and p50
coverage drift further from target than the LSTM's. The zero-shot TimesFM and Chronos-Bolt rows
in the raw table are excluded: the backtest fed them one series per fold instead of one per
symbol, so they made one prediction per fold and are not comparable.

---

## 21. Build status

"Built" means the code exists and its tests pass **locally**. Nothing is marked done until it
runs on Google Cloud, so no row below says "done".

| Part | Status |
|---|---|
| Shared OData layer and auth | Built locally (`shared/`); ETag / `If-Match` on Platform `Portfolios` only; not tested with Excel or Power BI; no `$search`, `$apply` |
| Platform service | **Live on Cloud Run** (SQLite, RS256 + JWKS, client credentials, staff roles); Firestore not implemented |
| Laya serving, distillation, eval scripts | Built locally; **no fine-tuned checkpoint exists**, so Laya serves nothing yet and every call routes to Gemini or rules |
| C1 Photo-to-Portfolio, Report Reader | Built locally; Gemini path tested with a mock only |
| C1 Cash Planner, MOEA/D | **Live on Cloud Run**; forecasts are labelled empirical bands. Hybrid TimesFM model trained and evaluated offline (RQ1 above), not served; BigQuery `AI.FORECAST` SQL written, unrun |
| C2 Scam Shield | Built locally; seed registry and corpus are tiny; RDAP domain age and Web Risk are opt-in (`RDAP_ENABLED`, `WEBRISK_API_KEY`) and untested live; Vertex AI Search / vector search not wired |
| C2 Transaction gateway | Built locally; models are the **simulated** dual-stream engine, not BigQuery ML (SQL written, unrun) |
| C2 Campaign Radar | Built locally (exact-hash grouping); Looker Studio not set up |
| C3 Policy, hashing, event anchoring, OData | **Live on Cloud Run**, anchoring to `AuditRegistry.sol` on a Hardhat EVM inside the service |
| C3 BigQuery mirror, Pub/Sub OIDC verification | Written (REST, no SDK), OIDC verifier unit-tested with a local key; BigQuery insert untested live |
| C3 Sepolia anchoring | Not run (needs a funded testnet key); the deployed chain is the in-service Hardhat node |
| C4 Orchestrator | Runs on local LangGraph (Ollama, or Gemini with a key); ADK / Agent Engine script written, unrun |
| C4 Grounding, Trust Panel, Guardian, voice | Built locally; voice uses the browser Web Speech API, not Google Speech APIs; Guardian delivery is a webhook/queue only |
| Zero-trust (tokens, audiences, scopes, step-up, denial anchoring) | Built locally with a negative test suite; App Check, IAP, Cloud Armor, VPC-SC not run |
| Cloud Run deployment | **Live**: web, platform and C1-C4 via `deploy_lean.sh`, redeployed by GitHub Actions on every push to `main`. The full-design scripts (load balancer, Cloud Armor, VPC-SC, Agent Engine) are written, unrun |
| Mobile app | Built (Expo, customer screens); not published |

## 22. Known limitations

1. **Laya needs fine-tuning for every head.** Zero-shot it performs near random on typed
   decisions, so each head depends on the quality of its labelled set.
2. **Laya's Sinhala and Tamil accuracy is unproven** until measured; unvalidated languages
   route to Gemini.
3. **Laya's 512-token window** limits it to short inputs; long messages are truncated or routed
   to Gemini.
4. **Scam data in Sinhala and Tamil is scarce.** The seed corpus is small and partly synthetic.
5. **Transaction models are trained on public synthetic data**, not real bank data.
6. **OData support is partial:** `$search` and `$apply` are not implemented.
7. **VPC Service Controls requires a Google Cloud organization**; without one, the data
   perimeter is documented but not enforced.
8. **On-chain anchoring uses a private chain** inside the audit service today (a testnet is the
   target) and a hash-commitment scheme, not zero-knowledge proofs.
9. **Laya is not served yet.** It needs a fine-tuned head per task; until then the Cash
   Planner decides with fuzzy rules and news relevance uses keywords.
10. **Accounts reset on each platform deploy** (SQLite on the instance); Firestore is planned.
11. **Forecasts are bands, not predictions.**
12. **Portfolios are user-supplied.** There is no brokerage connection.
13. **Not financial advice.** FirstStep is a prototype for education and protection.

---

## 23. Roadmap

- WhatsApp and Telegram bot for forwarding suspicious messages
- OData `$apply` aggregation for the Campaign Radar
- Graph neural network for the relational fraud stream
- Merkle batching for cheaper anchoring
- Secure Campaign Radar feed for bank fraud teams
- Gemma or Laya on-device screening
- Formal user study on trust and perceived control

---

## 24. Team

| Name | Role |
|---|---|
| Nivakaran S. | Design and development of all four components |
| Dhushanthini R. | Component 2: fraud and scam detection |
| Abeysekara W C S M | Component 3: tamper-evident auditability |
| Duwaragie | Google Cloud deployment and CI |

---

## 25. References

- UNODC, transnational online scam losses 2025: <https://www.freepressjournal.in/amp/world/asian-online-scam-victims-lost-upto-114-billion-in-2025-as-cybercrime-networks-expand-un-report>
- GASA, *The State of Scams in Southeast Asia 2025*: <https://www.biocatch.com/analyst-report-gasa-state-of-scams-in-southeast-asia-2025>
- Online scams double in a year, Sri Lanka Police: <https://www.dailymirror.lk/breaking-news/Online-scams-doubles-in-a-year-police-increase-crackdowns/108-330212>
- Sri Lanka CERT, 12,650+ complaints in 2025: <https://www.nampa.org/text/22821495>
- BigQuery `AI.FORECAST` (TimesFM): <https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/bigqueryml-syntax-ai-forecast>
- Laya model card: <https://huggingface.co/convaiinnovations/laya>
- Laya release summary: <https://aiweekly.co/alerts/convai-ships-laya-a-421m-modernbert-decision-model-apache-20>
- OData v4.01 specification: <https://www.odata.org/documentation/>
