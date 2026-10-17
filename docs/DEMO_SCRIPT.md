# FirstStep: demo video script (under 3:00)

Google Cloud AI Builder Cup 2026, Challenge 1: BFSI. Submission deadline **18 Oct 2026**.

## What the submission must contain (aibuildercup.com FAQ)

1. A **working deployed link** on Cloud Run / GCP / Firebase. Judges will open it.
2. A **video demo under 3 minutes**. Hard limit: target 2:50 so a slow export never tips it over.
3. A **public GitHub repository**.
4. A **deck** explaining the solution in detail.

Scoring, the same for every theme:

| Criterion | Weight | Where the video earns it |
|---|---|---|
| Technical Merit & Gen AI Implementation | **40%** | Gemini doing real work on screen (reading, reasoning, explaining), grounding validator, models-score-rules-decide, live Cloud Run URL |
| Problem Alignment & Impact | 25% | Opening numbers, Kamala, prevention before money moves |
| Innovation & Creativity | 25% | Scam check + cash planner + tamper-evident audit in one flow; Laya taught by Gemini; OData for banks |
| User Experience & Solution Design | 10% | One continuous user story, plain language, Sinhala/Tamil, voice |

Rule for the edit: **every 20 seconds the viewer should see Gemini or a Google Cloud service do
something.** Technical merit is 40% of the score; architecture slides alone don't earn it, live
behaviour does.

---

## Script

Voice-over (VO) is written to be read at ~150 words a minute. Total VO is ~400 words.
Shot = what is on screen. Every shot is the **deployed** app, with the Cloud Run / Firebase
URL visible in the address bar at least once.

### 0:00–0:15 · Hook (Problem 25%)

**Shot:** Black screen, white text, one line at a time: *"USD 88–114 billion lost to online scams
in Asia-Pacific in 2025."* → *"Only 1 in 5 victims gets anything back."* Cut to a phone with a
WhatsApp message: *"Guaranteed 30% monthly returns. Only 10 slots left."*

**VO:** "Last year people across Asia-Pacific lost up to a hundred billion dollars to online
scams. Fewer than one in five got anything back. So FirstStep is built to stop the scam
*before* the money moves."

### 0:15–0:50 · Scam Shield (C2): Gemini reads, rules decide

**Shot:** FirstStep → Fraud → Scam Shield. Paste the WhatsApp text. Verdict card appears:
**HIGH_RISK**, fired rules (unlicensed entity, guaranteed returns, urgency, payment to a
personal account), reasons. Switch language to Sinhala, explanation re-renders. Guardian
alert toast: *"Alert sent to Kamala's son."*

**VO:** "Kamala, a retired teacher, forwards the message. Gemini pulls out the red flags: a
guaranteed return, a countdown, a payment to a personal account, a company that isn't licensed.
But Gemini doesn't get the final word. A versioned policy engine makes the call, so a model
that sounds confident can't overrule hard evidence. She gets the answer in Sinhala, and her
son gets an alert."

**Caption (bottom third):** `Gemini extracts flags → SHIELD-P001 rules decide`

### 0:50–1:30 · Cash planner (C1): TimesFM + optimiser

**Shot:** Portfolio screen with her holdings (pre-loaded, or imported from a statement photo
if the Gemini import is working on the deployed build). Withdraw: *Rs 300,000 by March*. Plan
result: day-by-day sell schedule, the cost compared with selling an equal slice of everything (the naive pro-rata baseline C1 costs alongside it), and the
TimesFM p10/p50/p90 forecast bands.

**VO:** "A month later she needs three hundred thousand rupees for school fees by March. Gemini
reads her broker statement. TimesFM forecasts each share, and a liquidity-aware optimiser
spreads the sales so she loses less than she would by selling a bit of everything at once. If the
target can't be met, it tells her how much can be raised. It never pretends."

**Caption:** `TimesFM forecast bands · MOEA/D liquidity-aware plan · infeasible plans reported, not hidden`

### 1:30–1:55 · Zero trust step-up (C2 gateway)

**Shot:** She sends money to the school, a new payee. Gateway decision: **STEP-UP**. Code
entry. Verified, transfer released.

**VO:** "Paying a new payee triggers a step-up check. That's zero trust: even inside a valid
session, a risky action needs fresh proof. Every service checks every request on its own,
and no service trusts another by default."

**Caption:** `Every request verified · least-privilege scopes · denials anchored to the audit log`

### 1:55–2:25 · Explainable assistant (C4): no ungrounded numbers

**Shot:** Assistant screen. Tap the mic, ask in Sinhala or English: *"Why did you flag that
message, and why sell these shares first?"* The answer streams in; the Trust Panel shows which
tools were called and a **Grounded ✓** badge.

**VO:** "She can ask why, by voice, in her own language. Gemini answers using our tools, and a
grounding validator checks every number in the answer against the tool outputs. If a figure
doesn't match, the answer is rejected before she sees it."

**Caption:** `Gemini agent · tool-grounded answers · Trust Panel`

### 2:25–2:45 · Tamper-evident audit (C3) + OData for banks

**Shot:** Audit screen: the scam verdict and the plan, each sealed with model version, policy
version and hash. Split screen: Excel / Google Sheets pulling `/odata/v1/audit/AuditRecords`.
Tamper tab: change one field, Verify → **INTEGRITY_FAILED** in red.

**VO:** "Every decision is sealed with the model and policy that made it, and anchored
on-chain. A bank or regulator connects through standard OData, straight from a spreadsheet.
Change one field, and verification fails instantly."

### 2:45–2:58 · Close (architecture flash)

**Shot:** 4-second architecture graphic: Gemini at the centre; Cloud Run services; TimesFM;
Pub/Sub; BigQuery; Firebase. Then the logo and the deployed URL.

**VO:** "Gemini at the centre, on Google Cloud end to end. FirstStep: stop the scam before the
money moves, then help people make the real decision safely."

---

## Recording checklist (do these before pressing record)

These decide whether the video shows the system or a mock-up. Anything not true on the
deployed build gets cut from the script, not faked.

- [ ] **Deployed on Cloud Run/Firebase** and recorded from that URL. Without a deployed link
      the submission isn't eligible, whatever the video shows. `infra/deploy/deploy_services.sh`
      is marked *untested against a live project*, so do a dry run first.
- [ ] `GEMINI_API_KEY` set on C2, C1 and C4 in the deployed services. Without it Scam Shield
      falls back to rules (`"source": "rules"`) and the Gen AI story falls apart on camera.
      Check that the verdict says `gemini`.
- [ ] C4 agent running on **Gemini** in the cloud, not local Ollama.
- [ ] `DEMO_MODE=true` on C2/C3 for recording (shows the step-up code, enables Tamper). Say
      nothing about it on screen.
- [ ] Seed one demo account with Kamala's portfolio (CSE tickers) so the planner has real holdings.
- [ ] Sinhala voice installed in the recording browser (the app falls back to text otherwise).
- [ ] Scam Shield takes **text**, not screenshots: the C2 endpoint accepts `text` only. Paste
      the message; don't claim "Gemini reads the screenshot" unless image input is added.
- [ ] Record at 1920×1080, browser zoom 110–125%, hide bookmarks and extensions.
- [ ] Captions burned in: judges often watch muted.
- [ ] Export ≤ 2:58; check the duration of the exported file, not the timeline.

## Deck outline (10–12 slides, mirrors the criteria)

1. Title + one-line pitch + deployed URL + repo URL
2. Problem in numbers (UNODC, GASA, Sri Lanka CERT)
3. Kamala's journey (the video in four frames)
4. Solution: four components, one flow
5. Gemini's five roles (reads, reasons, explains, teaches Laya, supervises)
6. Architecture on Google Cloud
7. Design principles: models score, rules decide; no ungrounded numbers
8. Zero trust: identities, scopes, step-up, denials anchored
9. OData v4: how a bank/regulator plugs in (screenshot of Excel pulling audit records)
10. Results: RQ1–RQ5 numbers, scam eval precision/recall, test counts. Report the honest ones,
    including where the hybrid does not beat the base model
11. Impact and roadmap
12. Team
