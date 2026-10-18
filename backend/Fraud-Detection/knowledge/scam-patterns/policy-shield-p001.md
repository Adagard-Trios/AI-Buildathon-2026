---
type: Policy
title: SHIELD-P001
description: The deterministic rules that turn a message's red flags into a Scam Shield verdict.
resource: backend/Fraud-Detection/shield/policy.py
tags: [policy, scam-shield]
status: stable
version: "1.0"
generated: { by: claude-code/opus-5.5, at: 2026-10-18T03:00:00Z }
stale_after: 2027-04-18T00:00:00Z
---

# Rules

| Rule | Raises to | When |
|------|-----------|------|
| S1 | HIGH_RISK | Promises a guaranteed return **and** the entity is not licensed |
| S2 | CAUTION   | Asks for payment to a personal account or crypto wallet |
| S3 | HIGH_RISK | Closely matches a known scam script |
| S4 | CAUTION   | A linked domain was registered less than 30 days ago |
| S5 | HIGH_RISK | Pretends to be a bank or regulator |
| S6 | HIGH_RISK | Combined risk score is high |
| S7 | CAUTION   | Combined risk score is moderate |

A verdict only rises, never falls: the highest level any rule reaches wins. With too little
evidence the verdict is *unverified*, never "safe". Models (Gemini, or the rule-based fallback)
only read the red flags; this policy alone decides.
