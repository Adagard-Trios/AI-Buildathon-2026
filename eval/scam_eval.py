"""Scam Shield evaluation (README 20): precision, recall and false-positive rate per language.

    python eval/scam_eval.py [labelled.jsonl]      # rows: {"text","lang","scam":bool}

Runs the same code path as the service (rules, or Gemini if GEMINI_API_KEY is set). A message
counts as flagged when the verdict is CAUTION or HIGH_RISK. The bundled seed set is SMALL and
partly synthetic: it checks the pipeline end to end, it does not prove real-world accuracy.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "Fraud-Detection"))

from shield import check_message  # noqa: E402

SEED = ROOT / "eval" / "scam_seed.jsonl"


def evaluate(rows: list[dict]) -> dict:
    by = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "tn": 0})
    for r in rows:
        flagged = check_message(r["text"])["level"] != "LOW_RISK"
        key = ("t" if flagged == r["scam"] else "f") + ("p" if flagged else "n")
        by[r.get("lang", "en")][key if key in ("tp", "fp", "fn", "tn") else key] += 1
    out = {}
    for lang, c in by.items():
        pos, neg = c["tp"] + c["fn"], c["fp"] + c["tn"]
        out[lang] = {"n": pos + neg, "precision": c["tp"] / (c["tp"] + c["fp"]) if c["tp"] + c["fp"] else None,
                     "recall": c["tp"] / pos if pos else None, "false_positive_rate": c["fp"] / neg if neg else None}
    return out


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else SEED
    data = [json.loads(l) for l in path.read_text("utf-8").splitlines() if l.strip()]
    print(json.dumps(evaluate(data), indent=2))
    print(f"test-set size: {len(data)} ({path.name})")
