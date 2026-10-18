---
type: Scam Pattern
title: Payment to a personal account
description: Investment money is to be sent to an individual's bank account or a crypto wallet, not to a company.
tags: [payment, money-mule]
rules: [S2]
flags: [personal_account_payment]
status: stable
generated: { by: claude-code/opus-5.5, at: 2026-10-18T03:00:00Z }
verified: { by: process:firststep-ci/test_knowledge, at: 2026-10-18T09:00:00Z }
stale_after: 2027-04-18T00:00:00Z
sources:
  - id: gasa-2025
    resource: https://www.biocatch.com/analyst-report-gasa-state-of-scams-in-southeast-asia-2025
    title: GASA, The State of Scams in Southeast Asia 2025
---

# What it looks like

"Deposit to account 8001234567 (S. Perera)", "send USDT to this wallet", "WhatsApp the slip".

# Why it matters

A licensed firm collects money into its own business account. A personal account is usually a
money mule, and transfers to it are hard to recover. Bank transfers and digital wallets are the
main channels money leaves through in reported scams.[^gasa-2025]
