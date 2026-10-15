"""Per-head, per-language evaluation (README 20, 6.3): accuracy on the human gold set,
agreement with Gemini, and expected calibration error. A language is validated for a head only
if it meets the thresholds.  Input rows: {"lang","gold","gemini","pred","conf"} (bool or label)."""

from __future__ import annotations

from collections import defaultdict

ACC_MIN = 0.90
AGREE_MIN = 0.90
ECE_MAX = 0.10
MIN_ROWS = 50  # below this a language is "unmeasured", never "validated"


def ece(rows: list[dict], bins: int = 10) -> float:
    if not rows:
        return 0.0
    buckets = defaultdict(list)
    for r in rows:
        buckets[min(int(r["conf"] * bins), bins - 1)].append(r)
    total = len(rows)
    return sum(len(b) / total * abs(sum(x["pred"] == x["gold"] for x in b) / len(b)
                                    - sum(x["conf"] for x in b) / len(b)) for b in buckets.values())


def evaluate(rows: list[dict]) -> dict:
    by_lang = defaultdict(list)
    for r in rows:
        by_lang[r["lang"]].append(r)
    out = {}
    for lang, rs in by_lang.items():
        n = len(rs)
        acc = sum(r["pred"] == r["gold"] for r in rs) / n
        agree = sum(r["pred"] == r["gemini"] for r in rs) / n
        e = ece(rs)
        out[lang] = {"n": n, "accuracy": round(acc, 4), "agreement": round(agree, 4), "ece": round(e, 4),
                     "validated": n >= MIN_ROWS and acc >= ACC_MIN and agree >= AGREE_MIN and e <= ECE_MAX}
    return out


def validated_languages(report: dict) -> str:
    """Value for LAYA_LANGS_VALIDATED."""
    return ",".join(sorted(l for l, m in report.items() if m["validated"]))
