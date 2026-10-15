"""Gemini teaches Laya (README 6.3): label raw texts with a fixed question set.

    GEMINI_API_KEY=... python distill.py scam_flags raw.txt labels.jsonl

raw.txt: one text per line. Output: one JSON per line {"text", "labels"}. Labels are
SYNTHETIC TEACHER labels: validate against a human-checked gold set (eval.py) before use.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request

from heads import HEADS


def label(text: str, head: str) -> dict:
    qs = {k: v["instructions"] for k, v in HEADS[head].items()}
    prompt = ("Answer each question about the text. Return JSON with the same keys; use true/false "
              f"for yes/no questions.\nQuestions: {json.dumps(qs)}\nText:\n{text[:4000]}")
    body = json.dumps({"contents": [{"parts": [{"text": prompt}]}],
                       "generationConfig": {"responseMimeType": "application/json", "temperature": 0}}).encode()
    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", body,
        {"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(json.load(r)["candidates"][0]["content"]["parts"][0]["text"])


def main(head: str, src: str, dst: str) -> None:
    with open(src, encoding="utf-8") as f, open(dst, "w", encoding="utf-8") as out:
        for line in filter(None, (l.strip() for l in f)):
            out.write(json.dumps({"text": line, "labels": label(line, head)}, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in HEADS:
        sys.exit("usage: distill.py <head> <raw.txt> <labels.jsonl>")
    main(*sys.argv[1:])
