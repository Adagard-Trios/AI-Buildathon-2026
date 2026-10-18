# Directory Update Log

## 2026-10-18

- Created the bundle: SHIELD-P001 and seven scam patterns, mapped to rules S1-S5. Drafted by an
  AI agent from the policy code and public scam warnings; not yet human-reviewed.
- Machine-confirmed the seven scam patterns: CI (`tests/test_knowledge.py`) checks that every
  pattern's rules and flags exist in SHIELD-P001 and its evidence. Not a human review; a
  reviewer adds `verified: { by: human:<name> }` to lift a pattern to human-reviewed.
