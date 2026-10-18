---
type: Scam Pattern
title: Unlicensed investment offer
description: Money is solicited by a fund or company that does not appear on any regulator's register.
tags: [investment, licensing]
rules: [S1]
flags: [entity_licensed]
status: stable
generated: { by: claude-code/opus-5.5, at: 2026-10-18T03:00:00Z }
stale_after: 2027-04-18T00:00:00Z
sources:
  - id: register
    resource: backend/Fraud-Detection/data/licensed_entities.json
    title: FirstStep seed register of licensed entities (dated snapshot)
---

# What it looks like

A name that sounds official ("Lanka Wealth Growth Fund") with no licence number, or one that
does not match the regulator's list.

# How Scam Shield checks it

The entity named in the message is looked up in the licensed-entities register. Combined with a
guaranteed return, an unlicensed entity is rule S1, which is HIGH_RISK on its own.

# Limits

The register is a small, dated snapshot. "Not found" is evidence, not proof.
