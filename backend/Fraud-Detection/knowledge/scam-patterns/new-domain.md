---
type: Scam Pattern
title: Newly registered website
description: The message links to a domain registered only days ago, or to a lookalike of a known brand.
tags: [phishing, link]
rules: [S4]
flags: [domain_age_days]
status: stable
generated: { by: claude-code/opus-5.5, at: 2026-10-18T03:00:00Z }
verified: { by: process:firststep-ci/test_knowledge, at: 2026-10-18T09:00:00Z }
stale_after: 2027-04-18T00:00:00Z
---

# What it looks like

`combank-secure-login.xyz`, `seylan-rewards.top`: a familiar name on a fresh domain.

# How Scam Shield checks it

Lookalike hosts count as brand new; otherwise the domain's registration age comes from RDAP
when enabled. Under 30 days is rule S4, CAUTION.
