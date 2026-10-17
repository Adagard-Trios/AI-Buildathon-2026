# FirstStep mobile (customers)

React Native (Expo SDK 57, Expo Router) app for **customers only**. There are no admin,
auditor, tamper, reset or research screens: those stay in the web console and are refused by
the services anyway (Component 3 requires `auditor` / `admin` roles that customers never hold).

## Screens and flows

| Tab / screen | What the customer does | Service call |
|---|---|---|
| Welcome → Sign up / Sign in | Pick English, සිංහල or தமிழ்; create an account | Platform `/auth/register`, `/auth/login` |
| **Home** | Total value, "check a message" call to action, pending confirmations, recent checks | Platform `/portfolios`, C4 `PendingActions` |
| **Check** | Paste a WhatsApp/SMS/email → verdict, reasons, fired rules, policy version → "check the seal" → for HIGH_RISK, ask the assistant (raises the Family Guardian alert) | C2 `CheckMessage` |
| **Money** | Portfolios; add holdings by share code (live price + liquidity from C1); or **read a statement photo** (Gemini) → confirm each line → save | Platform, C1 `/market/quote`, `/portfolio/import-statement` |
| Raise cash | Amount, deadline, urgency → day-by-day sell plan, cost, saving vs "sell a slice of everything", forecast bands, honest shortfall when it can't be raised | C1 `/portfolio/withdraw` |
| Send money | Payee, account, amount → gateway decides **ALLOW / STEP-UP / BLOCK**; step-up asks for a one-time code; block shows the reasons | C2 `/score`, `/step-up/*` |
| **Ask** | Chat in the chosen language, read aloud, tools used + "grounded" badge; confirm or cancel the guardian alert | C4 `/assistant/chat`, `Confirm`, `Rollback` |
| **Me** | Language, Family guardian, Receipts, server addresses, sign out | |
| Receipts | Each decision made for the customer; scam verdicts can be verified against the tamper-evident log | C3 `/api/audit/{id}/verify` |

Design rules carried over from the platform:

- **No invented answers.** If the assistant is unreachable the app says so; it never shows a
  canned reply with made-up figures.
- **The customer confirms.** Statement imports are drafts until confirmed; guardian alerts
  wait in "Waiting for your OK".
- **Least data on the phone.** The session token is in the OS keystore (SecureStore); scam
  messages are never stored, only an 8-word preview; history is per user and capped.
- **Behavioural signals without content.** Typing rhythm uses keystroke *timestamps* only.

## Run it

```bash
cd mobile
npm install
npx expo start          # scan the QR code with Expo Go, or press a / i
```

In development the app talks to the laptop running the Expo server on the docker-compose
ports (8100, 8000–8003). The stack binds to 127.0.0.1 by default, so for a phone on the same
Wi-Fi start it with `BIND_ADDR=0.0.0.0 docker compose up`. For a deployed
stack set the URLs at build time (see `.env.example`) or enter them under **Me → Server addresses**.

Checks:

```bash
npm test          # pure logic: transfer signals, plan summary, money parsing, i18n, URL resolution
npm run typecheck
npm run lint
npx expo export --platform android   # full Metro bundle
```

## Known limits

- Sinhala and Tamil strings need a native-speaker review before release; untranslated keys fall back to English.
- Voice input is not included (it needs a native speech module and a dev build); answers can be read aloud.
- Transfers are simulated: the gateway really scores them, but no money moves.
- The step-up code is shown on screen only when the server runs in `DEMO_MODE` (no SMS delivery in the prototype).
