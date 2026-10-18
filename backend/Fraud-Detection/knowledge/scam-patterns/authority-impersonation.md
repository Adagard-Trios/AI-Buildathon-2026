---
type: Scam Pattern
title: Impersonating a bank or regulator
description: The message claims to come from a bank, the central bank, the police or a regulator to borrow its trust.
tags: [impersonation, phishing]
rules: [S5]
flags: [impersonates_authority]
status: stable
generated: { by: claude-code/opus-5.5, at: 2026-10-18T03:00:00Z }
verified: { by: process:firststep-ci/test_knowledge, at: 2026-10-18T09:00:00Z }
stale_after: 2027-04-18T00:00:00Z
sources:
  - id: lk-cert
    resource: https://www.nampa.org/text/22821495
    title: Sri Lanka CERT, more than 12,650 complaints in 2025
---

# What it looks like

"Central Bank notice: verify your account", "your account will be suspended today". Phishing in
the name of banks is among the common types reported in Sri Lanka.[^lk-cert]

# What to do

Call the institution on a number you find yourself. A bank will never ask for a one-time code.
