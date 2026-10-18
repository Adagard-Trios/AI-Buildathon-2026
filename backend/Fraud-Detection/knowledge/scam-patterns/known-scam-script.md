---
type: Scam Pattern
title: Known scam script
description: The message closely matches the wording of a scam message already recorded in the corpus.
tags: [script, campaign]
rules: [S3]
flags: [script_similarity]
status: stable
generated: { by: claude-code/opus-5.5, at: 2026-10-18T03:00:00Z }
stale_after: 2027-04-18T00:00:00Z
sources:
  - id: corpus
    resource: backend/Fraud-Detection/data/scam_corpus.json
    title: FirstStep scam corpus (seed set, partly synthetic)
---

# What it looks like

Campaigns reuse the same text with small edits: a different fund name, number or deadline.

# How Scam Shield checks it

Similarity against the recorded scripts; a close match is rule S3, HIGH_RISK. The same
anonymised features group messages into campaigns for the Campaign Radar, without storing text.
