"""No ungrounded numbers: every figure in an answer must appear in that turn's tool output."""

from __future__ import annotations

import re
from typing import Iterable, List

_NUM = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?")
# ponytail: bare integers <= 10 are skipped (list markers, "2 factors"). Tighten if abused.
_TRIVIAL_MAX = 10


def _numbers(text: str) -> List[float]:
    out = []
    for m in _NUM.findall(text):
        try:
            out.append(float(m.replace(",", "").rstrip(".")))
        except ValueError:
            pass
    return out


def check_grounding(answer: str, tool_outputs: Iterable[str]) -> dict:
    allowed = {round(n, 6) for t in tool_outputs for n in _numbers(t)}
    ungrounded = []
    for n in _numbers(answer):
        if n.is_integer() and n <= _TRIVIAL_MAX:
            continue
        if round(n, 6) not in allowed:
            ungrounded.append(n)
    return {"grounded": not ungrounded, "ungrounded_numbers": ungrounded}
