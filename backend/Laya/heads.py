"""Question sets (heads) for the fast path. Question schema is Laya's own: see
backend/Portfolio-Optimization/decision/questions.py. Label sets are fixed: Gemini's teaching
labels (distill.py), fine-tuning and serving all index by these names."""

from __future__ import annotations

SCAM_FLAGS = {
    "guaranteed_return": {"type": "noul", "instructions": "Does this message promise a guaranteed or risk-free return?"},
    "personal_account_payment": {"type": "noul", "instructions": "Does it ask for payment to a personal account or crypto wallet?"},
    "impersonates_authority": {"type": "noul", "instructions": "Does it pretend to be a bank or regulator?"},
    "urgency": {"type": "noul", "instructions": "Does it pressure the reader to act immediately?"},
}

INTENT = {
    "intent": {
        "type": "choice",
        "instructions": "What does the user want?",
        "criteria": {"scam_check": "check a suspicious message or offer", "cash_plan": "raise cash by a deadline",
                     "explain": "understand an earlier decision", "audit": "verify a record", "other": "anything else"},
    },
}

SAFETY = {
    "guaranteed_language": {"type": "noul", "instructions": "Does this reply promise guaranteed returns?"},
    "buy_recommendation": {"type": "noul", "instructions": "Does this reply recommend buying a specific security?"},
}

HEADS = {"scam_flags": SCAM_FLAGS, "intent": INTENT, "safety": SAFETY}
