"""Gemini-backed document endpoints for Component 1 (README 12.3: ImportStatement, AskReport)."""

from __future__ import annotations

import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from service.auth import CallerIdentity, require_user
from service.gemini import GeminiUnavailable

router = APIRouter()


class ImportStatementRequest(BaseModel):
    content_base64: str = Field(min_length=4)
    mime_type: str


class AskReportRequest(BaseModel):
    symbol: str
    question: str = Field(min_length=3, max_length=500)


@router.post("/portfolio/import-statement")
@router.post("/odata/v1/portfolio/ImportStatement")
def import_statement(req: ImportStatementRequest, _caller: CallerIdentity | None = Depends(require_user)):
    """Draft holdings from a statement photo/PDF. Nothing is saved; the user confirms each row."""
    from importer.statement import import_statement as run

    try:
        return run(base64.b64decode(req.content_base64, validate=True), req.mime_type)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except GeminiUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None


@router.post("/analysis/ask-report")
@router.post("/odata/v1/portfolio/AskReport")
def ask_report(req: AskReportRequest, _caller: CallerIdentity | None = Depends(require_user)):
    from fundamentals.ask import ask_report as run
    from fundamentals.extract import pdf_pages
    from fundamentals.reports import REPORT_DIR

    sym = req.symbol.split(".")[0].upper()
    pdfs = [p for p in REPORT_DIR.rglob("*.pdf") if p.parent.name.upper().startswith(sym)]
    pdfs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    if not pdfs:
        raise HTTPException(status_code=404, detail=f"No cached report for {req.symbol}")
    return {**run(pdf_pages(pdfs[0]), req.question), "report": pdfs[0].name}
