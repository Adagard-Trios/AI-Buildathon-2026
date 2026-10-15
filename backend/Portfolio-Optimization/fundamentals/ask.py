"""Report Reader: answer a question over a cached company report, citing pages.

Retrieval is keyword overlap over pages, so only the best pages are sent to the model.
Ratios are NOT answered by the model: callers get them from fundamentals.ratios. Without a
Gemini key the reader returns the retrieved pages only, labelled unverified, never an
invented answer.
"""

from __future__ import annotations

import re

from service.gemini import GeminiUnavailable, generate_json

_WORD = re.compile(r"[a-z]{3,}")
TOP_PAGES = 6


def top_pages(pages: dict[int, str], question: str, k: int = TOP_PAGES) -> list[int]:
    q = set(_WORD.findall(question.lower()))
    scored = sorted(((len(q & set(_WORD.findall(t.lower()))), -n) for n, t in pages.items()), reverse=True)
    return sorted(-neg for score, neg in scored[:k] if score > 0)


def valid_citations(cited: list, allowed: set[int]) -> list[int]:
    return sorted({int(c) for c in cited if str(c).lstrip("-").isdigit() and int(c) in allowed})


def ask_report(pages: dict[int, str], question: str) -> dict:
    chosen = top_pages(pages, question)
    if not chosen:
        return {"answer": None, "citations": [], "verified": False,
                "note": "No page of this report mentions those terms."}
    context = "\n\n".join(f"[page {n}]\n{pages[n][:6000]}" for n in chosen)
    prompt = ('Answer ONLY from the pages below. Return JSON {"answer":str,"pages":[int]} listing the '
              "pages used. If the pages do not answer it, set answer to null. Do not compute ratios.\n\n"
              f"Question: {question}\n\n{context}")
    try:
        out = generate_json([{"text": prompt}])
    except GeminiUnavailable as exc:
        return {"answer": None, "citations": chosen, "verified": False,
                "note": f"Model unavailable ({exc}); showing the most relevant pages only."}
    cites = valid_citations(out.get("pages") or [], set(chosen))
    if out.get("answer") and not cites:  # an uncited answer is rejected, like an ungrounded number
        return {"answer": None, "citations": chosen, "verified": False,
                "note": "The model gave no valid page citation, so its answer was discarded."}
    return {"answer": out.get("answer"), "citations": cites, "verified": bool(out.get("answer"))}
