# FirstStep: demo video script (2:50)

Google Cloud AI Builder Cup 2026, Challenge 1: BFSI. Submission deadline **18 Oct 2026**.

Live app: <https://firststep-web-214625202650.us-central1.run.app>

Every shot below is the **deployed** app and shows only what it really does today. Where a
shot depends on Gemini, the line to use if Gemini is not answering is given too; never fake it.

## Scoring, and where the video earns it

| Criterion | Weight | Earned by |
|---|---|---|
| Technical Merit & Gen AI | **40%** | Gemini reading red flags and explaining in Sinhala; rules deciding; grounded answers; a real smart contract; Cloud Run URL on screen |
| Problem Alignment & Impact | 25% | Kamala; the numbers; stopping the money *before* it moves |
| Innovation & Creativity | 25% | One flow: scam check, safe cash planning, step-up, tamper-evident record; scam knowledge in Google's Open Knowledge Format |
| User Experience | 10% | One continuous story, plain words, Sinhala, the STOP stamp |

Rule for the edit: **every ~20 seconds the viewer sees Gemini or Google Cloud do something.**

---

## Before you press record (do all of these)

1. **Gemini is live.** On Scam Shield, the footer under a verdict must say *"Red flags read by
   Gemini"*. If it says *"the rule engine"*, the key is not working: fix that first. Ask the
   Assistant one question and confirm it answers.
2. **Fresh account.** Deploys wipe accounts. Register **Kamala Perera** with a new email.
3. **Warm the services** (they scale to zero; first calls are slow): open Portfolio, press
   **Refresh quotes**, then **Save**, and wait until the holdings show *ready*. Open every tab
   once.
4. **Practise the transfer once** (Fraud → Check a transfer) with the values in shot 5. If it
   no longer says STEP-UP (the engine learns from repeats), change **User** to `u_kamala_01`.
5. **OKF patterns reviewed (optional, recommended).** Have a teammate read
   `backend/Fraud-Detection/knowledge/scam-patterns/*.md` and add
   `verified: { by: human:<name>, at: <time> }` so they show *human-reviewed* instead of
   *unverified*. Needs a redeploy of C2.
6. Browser at 1920×1080, zoom 110–125%, bookmarks bar and extensions hidden, the Cloud Run URL
   visible in the address bar for at least one shot. Burn captions in: judges often watch muted.
7. Export at 2:50 or less, and check the length of the **exported file**, not the timeline.

---

## Script

Voice-over (VO) is ~150 words a minute; total ~400 words. Captions go in the bottom third.

### 0:00–0:12 · Hook

**Shot:** Black, white text one line at a time: *"USD 88–114 billion lost to online scams in
Asia-Pacific in 2025."* → *"Fewer than 1 in 4 victims get anything back."* Cut to a phone
showing the WhatsApp message (screen-record a real chat to yourself).

**VO:** "Last year, people across Asia-Pacific lost up to a hundred billion dollars to online
scams, and most never got a cent back. FirstStep stops the scam before the money moves."

### 0:12–0:45 · Scam Shield: Gemini reads, rules decide

**Shot:** Sign-in page (FirstStep, "Stop the scam before the money moves") → signed in as
Kamala → **Fraud** (Scam Shield is the first tab). Paste:

> Dear investor, join Lanka Wealth Growth Fund. Guaranteed 30% monthly returns. Only 10 slots
> left, offer ends tonight! Deposit Rs 50,000 to account 8001234567 (S. Perera, personal account).

Press **Check message**. The **STOP** stamp lands. Hold on *what to do next*, then scroll to
**Why** and **Known scam patterns**, then the footer line.

**VO:** "Kamala, a retired teacher, gets this on WhatsApp. She pastes it into FirstStep.
Gemini reads the red flags: a guaranteed return, an unlicensed fund, a payment to a personal
account. But Gemini doesn't get the final say. A versioned policy makes the call, so a
confident-sounding model can't overrule the evidence. And each verdict cites the scam pattern
it matched, kept in Google's Open Knowledge Format with its source and who reviewed it."

*If Gemini is not answering:* replace the second and third sentences with "The red-flag checks
run," and cut "Gemini" from the VO in this shot. Do not show the footer.

**Caption:** `Gemini reads red flags → SHIELD-P001 decides → cites OKF scam patterns`

### 0:45–1:10 · Assistant in Sinhala, grounded

**Shot:** **Assistant**. Choose **සිංහල**. Type or say: *"Why is this message a scam?"* The
answer appears in Sinhala, with the tools it called and the evidence underneath.

**VO:** "She can ask why in her own language. Gemini answers using the platform's own tools,
and a grounding check rejects any number that didn't come from them."

*If Gemini is not answering:* cut this shot; the assistant will say it is unavailable.

**Caption:** `Gemini agent · tool-grounded · Sinhala, Tamil, English`

### 1:10–1:45 · Cash planner

**Shot:** **Portfolio** (her starter holdings, live quotes, total in LKR) → **Withdraw**.
Amount **300,000 LKR**, deadline **10** days, **Plan withdrawal**. Show *Feasible*, the
day-by-day plan, then **Against naive liquidation** (this plan vs pro-rata, largest-first,
most-liquid-first).

**VO:** "A month later she needs three hundred thousand rupees for school fees. FirstStep
plans which shares to sell and when, using fuzzy rules and a genetic algorithm, and shows what
she saves against selling a bit of everything. If the target can't be met, it says so. We also
fine-tuned Google's TimesFM for these forecasts: on matched backtests it beat our LSTM baseline
by seven percent."

**Caption:** `Fuzzy GA plan vs 3 baselines · TimesFM + LoRA: −6.8% pinball loss vs LSTM (offline)`

### 1:45–2:10 · Zero trust: step-up on a new payee

**Shot:** **Fraud → Check a transfer**. Defaults (user `u_1001`, trusted device), tick **New
beneficiary**, amount **30,000**, **Score transaction** → **STEP-UP**. **Send me a code** →
type the demo code → **Identity confirmed**.

**VO:** "Paying the school, a new payee, needs fresh proof, even inside a valid session. That's
zero trust: every service checks every request itself, and no service trusts another."

**Caption:** `Every request verified · step-up on risk · denials sealed in the audit log`

### 2:10–2:38 · Tamper-evident record on a smart contract

**Shot:** **Audit**: the scam verdict, the plan and the transfer, each with its model and
time. Then **Tamper-evidence**: **1 Anchor** (NETWORK shows *live*, Hardhat EVM) → **2 Verify**
(*Integrity verified*, three matching hashes) → **3 Tamper** → **4 Verify again**
(*Tampering detected*, the recalculated hash in red).

**VO:** "Every decision is sealed with the model and policy that made it, and its fingerprint
is written to a smart contract. Change a single field later, and verification fails."

**Caption:** `SHA-256 commitment · AuditRegistry.sol · tamper → INTEGRITY FAILED`

### 2:38–2:50 · Close

**Shot:** One architecture slide for 4 seconds (Gemini at the centre; six services on Cloud
Run; OKF knowledge; the contract), then the FirstStep mark and the URL.

**VO:** "Gemini at the centre, on Google Cloud end to end. FirstStep: stop the scam before the
money moves, then help people make the real decision safely."

---

## Say this, not that

| Say | Not |
|---|---|
| "anchored in a smart contract" | "on Ethereum" or "on a public blockchain" (it is a private EVM inside the audit service) |
| "we fine-tuned TimesFM; offline it beat the baseline" | showing live TimesFM forecasts (the app shows labelled empirical bands) |
| "she pastes the message" | "Gemini reads the screenshot" (image input is not wired) |
| nothing about Laya | "Laya decides" (it is not served) |
| "the policy decides" | "the AI decides" |

## Optional shots (if you have time)

- **Roles (5 s):** sign in as `auditor@firststep.demo`; the header shows *auditor* and Audit
  lists every customer's records. Password: the `FIRSTSTEP_STAFF_PASSWORD` repo secret.
- **OData for banks (8 s):** Excel → Data → From Web → Advanced, URL
  `https://firststep-c3-audit-214625202650.us-central1.run.app/odata/v1/audit/AuditRecords`,
  header `Authorization: Bearer <token>` (copy the token from the browser's local storage
  key `firststep_access_token`). The audit log loads as a table. Every endpoint needs a token,
  which is the zero-trust point.

## Deck outline (10–12 slides)

1. Title, one-line pitch, live URL, repo URL
2. The problem in numbers (UNODC, GASA, Sri Lanka Police and CERT)
3. Kamala's journey: the video in four frames
4. One flow: scam check → explanation → cash plan → step-up → sealed record
5. Gemini's roles today: reads red flags, reasons as the agent, explains in Sinhala/Tamil/English
6. Architecture on Google Cloud: six Cloud Run services, CI deploy, OKF knowledge, the contract
7. Design principles: models score, rules decide; no ungrounded numbers; fail closed
8. Zero trust: RS256 + JWKS, per-service checks, roles from config, step-up, row-level reads
9. Results: RQ1 table (hybrid 0.00800 vs LSTM 0.00858 pinball on 7 matched folds, and where it
   is *not* better), test counts per service, the negative auth suite
10. What is live vs planned (honesty slide: README "Running on Google Cloud today")
11. Impact and roadmap: Sepolia anchoring, served TimesFM, fine-tuned Laya, WhatsApp bot
12. Team
