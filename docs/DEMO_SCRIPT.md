# FirstStep: demo video script (2:50)

Google Cloud AI Builder Cup 2026, Challenge 1: BFSI. Submission deadline **18 Oct 2026**.

Live app: <https://firststep-web-214625202650.us-central1.run.app>

**The story in one line:** *FirstStep is the last checkpoint before the money leaves. It catches
the scam at the moment of payment, explains it to the customer in Sinhala, Tamil or English, and
gives the bank and the regulator a record that can't be quietly changed.*

**The problem it answers:** in an authorised push payment (APP) scam the customer passes every
security check themselves (right login, right OTP, their own decision to pay), so a bank's fraud
controls wave the payment through. Regulators are moving the loss onto banks: UK mandatory APP
reimbursement since 7 Oct 2024 (up to £85,000), Singapore's Shared Responsibility Framework since
16 Dec 2024. Sri Lanka's central bank made "Be Scam Proof" its 2026 theme.

Every shot is the **deployed** app and shows only what it really does today. Where a shot depends
on Gemini, the line to use if Gemini is not answering is given too; never fake it.

## Scoring, and where the video earns it

| Criterion | Weight | Earned by |
|---|---|---|
| Technical Merit & Gen AI | **40%** | Gemini reading red flags and explaining in Sinhala; rules deciding; grounded answers; a sealed, verifiable record; Cloud Run URL on screen |
| Problem Alignment & Impact | 25% | APP scams: the customer authorises the payment; banks now carry the loss; Kamala |
| Innovation & Creativity | 25% | A checkpoint at the payment, not just a message checker; explanation in the customer's language at that moment; a record banks and regulators can verify |
| User Experience | 10% | One continuous story, plain words, Sinhala, the STOP stamp |

Rule for the edit: **every ~20 seconds the viewer sees Gemini or Google Cloud do something.**

---

## Before you press record (do all of these)

1. **Gemini is live.** On Scam Shield, the footer under a verdict must say *"Red flags read by
   Gemini"*. If it says *"the rule engine"*, the key is not working: fix that first. Ask the
   Assistant one question and confirm it answers.
2. **Fresh account.** Deploys wipe accounts. Register **Kamala Perera** with a new email.
3. **Warm every tab first.** Services scale to zero, so the first call on a quiet service takes
   about 15 s. Open Portfolio, Fraud (both tabs), Assistant and Audit once before recording.
4. **Practise the transfer once** (Fraud → Check a transfer → paste the message → Check before paying) with the values in shot 2. If it
   no longer says STEP-UP (the engine learns from repeats), register a fresh account: the form
   scores each customer as themselves (`u_<id>` on `dev_<id>`), so a new account starts clean.
5. **OKF patterns reviewed (optional, recommended).** Have a teammate read
   `backend/Fraud-Detection/knowledge/scam-patterns/*.md` and add
   `verified: { by: human:<name>, at: <time> }` so they show *human-reviewed* instead of
   *machine-confirmed* (what CI checks today). Needs a redeploy of C2.
6. Browser at 1920×1080, zoom 110–125%, bookmarks bar and extensions hidden, the Cloud Run URL
   visible in the address bar for at least one shot. Burn captions in: judges often watch muted.
7. Export at 2:50 or less, and check the length of the **exported file**, not the timeline.
8. **Submission bundle:** the video link (public YouTube, Vimeo or Drive), the repo, the live URL,
   and the deck. Upload the deck as the **PDF** from `docs/deck/` (the PPTX is there too), and
   put the video link into the deck's links slide before exporting the PDF.

---

## Script

Voice-over (VO) is ~150 words a minute; total ~400 words. Captions go in the bottom third.

### 0:00–0:20 · The hurry

**Shot:** Black, white text one line at a time: *"In a payment scam, the customer passes every
security check."* → *"Correct login. Correct OTP. Her own decision to pay."* Cut to a phone
showing the WhatsApp offer (screen-record a real chat to yourself) with "offer ends tonight"
visible.

**VO:** "Kamala, a retired teacher, gets a WhatsApp offer: thirty percent a month, guaranteed,
only ten slots left. She's in a hurry to pay. In a scam like this the customer passes every
security check herself, so the bank lets the money go. FirstStep is the last checkpoint before
it leaves."

**Caption:** `APP scams: the customer authorises the payment · UK & Singapore now put the loss on banks`

### 0:20–1:10 · The checkpoint: the bank pauses, asks, and checks the answer

**Shot:** Sign in as Kamala → **Fraud → Check a transfer**. Defaults (Kamala's own user and trusted
device, typing 240), tick **New beneficiary**, amount **30,000**, **Score transaction** →
**STEP-UP**. The box asks *"Before you pay, a quick check: what is it for?"* Paste:

> Dear investor, join Lanka Wealth Growth Fund. Guaranteed 30% monthly returns. Only 10 slots
> left, offer ends tonight! Deposit Rs 50,000 to account 8001234567 (S. Perera, personal account).

Press **Check before paying**. The **STOP** stamp lands under the transfer: what to do next,
**Why**, **Known scam patterns**, and the footer *"Red flags read by Gemini"*. Hold on the two
buttons: **Cancel the transfer** (the default) and **Continue anyway** (greyed out until she
ticks *"I have read the warning"*). Press **Cancel the transfer** → *"Transfer cancelled.
Nothing was sent."*

**VO:** "She starts a thirty-thousand-rupee transfer to someone she has never paid before. In
this kind of scam the victim passes every security check herself, even the one-time code, so
FirstStep doesn't just send a code. It pauses and asks what the payment is for. She pastes the
offer. Gemini reads the red flags: a guaranteed return, an unlicensed fund, money to a personal
account. But Gemini doesn't decide. A versioned policy does, and it says stop, before any money
moves. Each verdict cites the scam pattern it matched, kept in Google's Open Knowledge Format."

*If Gemini is not answering:* replace "Gemini reads the red flags" with "the red-flag checks
run" and cut "But Gemini doesn't decide."; do not show the footer.

*Optional (5 s):* the same message in the **Scam Shield** tab gives the same verdict, for
customers who want to check an offer before they ever pay.

**Caption:** `New payee → pause & ask → Gemini reads red flags → SHIELD-P001 says STOP → cancel`

### 1:10–1:50 · Why, in her own language

**Shot:** **Assistant**. In the language list choose **සිංහල**. Type or say: *"Why is this a
scam?"* followed by the same message. The answer appears in Sinhala, with the tool it called and
"Written by Gemini from the tool evidence, then checked" underneath.

**VO:** "Bank warnings usually fail because they're generic, and in English. Kamala asks why, in
Sinhala. Gemini answers using the platform's own scam check on her exact words, and a grounding
check withholds any figure the tools didn't produce. Scammers sell urgency; FirstStep makes
slowing down cheap."

*If Gemini is not answering:* cut this shot; the assistant will say it is unavailable.

**Caption:** `Gemini agent · tool-grounded · Sinhala, Tamil, English`

### 1:50–2:30 · The bank's view: a record that can't be quietly changed

**Shot:** **Audit**: the scam verdict and the transfer decision, each with its model and time.
Then **Tamper-evidence**: **1 Anchor** (NETWORK shows *live*) → **2 Verify** (*Integrity
verified*, three matching hashes) → **3 Tamper** → **4 Verify again** (*Tampering detected*,
the recalculated hash differs).

**VO:** "For the bank, every decision is sealed with the model and policy that made it, and its
fingerprint is anchored in a smart contract on the audit service's own chain. Change a single
field later and verification fails. That's the evidence a bank needs for a dispute or a
reimbursement claim, and regulators can read it over standard OData."

**Caption:** `SHA-256 commitment · AuditRegistry.sol · tamper → INTEGRITY FAILED · OData v4 for regulators`

### 2:30–2:50 · Close

**Shot:** One architecture slide for 5 seconds (six services on Cloud Run, Gemini, OKF knowledge,
the sealed record), then the numbers, then the FirstStep mark and the URL.

**VO:** "Six services on Cloud Run, Gemini at the centre, deployed on every push. Eleven of
eleven live checks pass. Sri Lanka's central bank made 'Be Scam Proof' this year's theme;
FirstStep is the checkpoint that makes it real."

**Caption:** `6/6 services on Cloud Run · 11/11 live checks · 176+ tests · Scam Shield 20/20 scams, 0 false alarms (40 synthetic msgs, Gemini)`

---

## Say this, not that

| Say | Not |
|---|---|
| "the bank pauses, asks what it's for, and checks her answer" | "the gateway's risk score uses the scam verdict" (the verdict gates the step-up; feeding it into the score is next) |
| "anchored in a smart contract on the audit service's own chain" | "on Ethereum" or "on a public blockchain" (public anchoring is future work) |
| "Gemini reads the red flags; the policy decides" | "the AI decides" |
| "she pastes the message" | "Gemini reads the screenshot" (image input is not wired) |
| one line on the cash planner, if any | genetic algorithms, MOEA/D, live TimesFM forecasts |
| nothing about Laya | "Laya decides" (it is not served) |

## Optional shots (if you have time)

- **Cash planner (5 s):** Withdraw → Rs 300,000, 10 days → *Feasible* and the comparison against
  selling a bit of everything. One line of VO at most.
- **Roles (5 s):** sign in as `auditor@firststep.demo`; the header shows *auditor* and Audit
  lists every customer's records. Password: the `FIRSTSTEP_STAFF_PASSWORD` repo secret.
- **OData for regulators (8 s):** Excel → Data → From Web → Advanced, URL
  `https://firststep-c3-audit-214625202650.us-central1.run.app/odata/v1/audit/AuditRecords`,
  header `Authorization: Bearer <token>` (copy the token from the browser's local storage key
  `firststep_access_token`). The audit log loads as a table. Every endpoint needs a token, which
  is the zero-trust point.

## Deck outline

The deck is `docs/deck/FirstStep_AI_Builder_Cup_2026.pdf` (and `.pptx`), filled into the official
template. Its story should follow the video:

1. Team details; problem statement: APP scams, where the customer authorises the payment
2. The idea: the last checkpoint before the money leaves; CBSL "Be Scam Proof", UK and Singapore
   rules first, then the scale figures
3. Opportunities: "Protects the payment, not just the phone"; why not Google Messages or ScamShield
4. Features, transfer gateway and step-up first
5. Process flow starting at "Transfer initiated", with the message check as an input
6. Design: the verdict stamp
7. Architecture on Cloud Run
8. Technologies: live / offline / planned
9. Prototype snapshots
10. Results: Scam Shield evaluation and the transfer and step-up checks first, tests and live
    checks next, TimesFM last
11. Built to be trusted: zero trust and responsible AI
12. Future development; links (with the video link filled in)
