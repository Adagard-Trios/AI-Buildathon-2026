import logging
import re

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from langchain_core.messages import HumanMessage

from agent import agent, llm
from langchain_core.messages import SystemMessage
from responsible_ai import run_responsible_ai_checks
from grounding import check_grounding
from guardian import build_alert
import json as _json

import trust_panel
from caller_context import reset_caller, set_caller
from odata import install_error_handler
from zt_auth import require

_log = logging.getLogger(__name__)


_SCRIPTS = {"සිංහල": ("Sinhala", 0x0D80, 0x0DFF), "தமிழ்": ("Tamil", 0x0B80, 0x0BFF)}


def _in_language(message: str, answer: str) -> str:
    """Honour "[Reply in සිංහල]" / "[Reply in தமிழ்]" even when the model answered in English.

    The system prompt asks for the language; small models often follow the English tool
    output instead. If under a fifth of the letters are in the requested script, one
    translation pass runs, keeping numbers and codes as they are. Any failure keeps the
    original answer: an English answer beats no answer.
    """
    m = re.match(r"\s*\[Reply in ([^\]]+)\]", message)
    target = _SCRIPTS.get(m.group(1).strip()) if m else None
    if not target or not answer.strip():
        return answer
    name, lo, hi = target
    letters = [c for c in answer if c.isalpha()]
    if letters and sum(lo <= ord(c) <= hi for c in letters) / len(letters) >= 0.2:
        return answer
    try:
        reply = llm.invoke([
            SystemMessage(content=(
                f"Translate the user's text into {name}, in {name} script, in plain words an older "
                "first-time investor understands. Keep every number, percentage, policy name and "
                "rule code exactly as written. Keep markdown formatting. Output only the translation.")),
            ("human", answer),
        ])
        translated = _text(reply.content).strip()
        return translated or answer
    except Exception:  # noqa: BLE001
        _log.exception("translation to %s failed; keeping the original answer", name)
        return answer


def _text(content) -> str:
    """Message content as plain text. Newer Gemini models return a list of content blocks
    ({"type": "text", "text": ...}, plus thought signatures) instead of a string, and every
    check below works on text."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            b if isinstance(b, str) else str(b.get("text", "")) if isinstance(b, dict) and b.get("type", "text") == "text" else ""
            for b in content
        )
    return "" if content is None else str(content)

app = FastAPI(
    title="FinAgent - Agentic Financial Assistant",
    description="Component 4 - Agentic LLM Assistant & Responsible AI",
    version="0.2.0"
)

install_error_handler(app)
for _r in trust_panel.build_routers():
    app.include_router(_r)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in __import__("os").environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# INTEGRATION SURFACE ONLY
#
# CORS is handled above, by this component's own middleware. The only thing added here for
# the platform is a health endpoint; nothing below touches the agent, the tools or the
# responsible-AI checks.
# --------------------------------------------------


@app.get("/health")
def health():
    """Liveness only -- deliberately does NOT invoke the agent.

    docker-compose and the frontend need to distinguish "this service is not running" from
    "the agent failed on this request". Calling the LLM here would conflate the two and make
    the check slow and key-dependent.
    """
    return {"status": "ok", "component": "agentic-assistance"}


# --------------------------------------------------
# REQUEST MODEL
# --------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    guardian_contact: str | None = None


# --------------------------------------------------
# ROOT
# --------------------------------------------------

@app.get("/")
def root():

    return {
        "project": "FinAgent",
        "component": "Agentic LLM Assistant & Responsible AI",
        "version": "0.2.0",
        "status": "running"
    }


# --------------------------------------------------
# CHAT
# --------------------------------------------------

@app.post("/odata/v1/assistant/Chat")
@app.post("/assistant/chat")
def chat(request: ChatRequest, http: Request, principal=Depends(require("assistant"))):
    owner = trust_panel.owner_of(principal)
    if not request.guardian_contact:
        request.guardian_contact = trust_panel.guardian_for(owner)


    # ----------------------------------------------
    # Send user message to agent
    # ----------------------------------------------

    # Tools call other components on the user's behalf with the user's own token.
    ctx = set_caller(http.headers.get("authorization"))
    try:
        result = agent.invoke(
            {
                "messages": [
                    HumanMessage(content=request.message)
                ]
            }
        )
    except Exception as exc:  # noqa: BLE001 - the model provider, not the request, failed
        # An unhandled exception becomes a bare 500 without CORS headers, which the browser
        # reports as "cannot reach the service". Say what actually happened, and never
        # substitute an invented answer.
        _log.exception("assistant model call failed")
        return JSONResponse(status_code=503, content={
            "detail": f"The assistant's language model is unavailable ({type(exc).__name__}). "
                      "No answer was generated."})
    finally:
        reset_caller(ctx)

    messages = result["messages"]

    # ----------------------------------------------
    # Final answer
    # ----------------------------------------------

    final_message = messages[-1]

    response_text = _in_language(request.message, _text(final_message.content))
    # Models sometimes echo the "[Reply in ...]" instruction back as the first line.
    response_text = re.sub(r"^\s*\[Reply in [^\]]*\]\s*", "", response_text)

    # ----------------------------------------------
    # Extract tools used
    # ----------------------------------------------

    tools_used = []

    for message in messages:

        # ToolMessage represents the result
        # returned by a tool
        if getattr(message, "type", None) == "tool":

            tool_name = getattr(message, "name", None)

            if tool_name and tool_name not in tools_used:
                tools_used.append(tool_name)

    # ----------------------------------------------
    # Extract tool evidence
    # ----------------------------------------------

    evidence = []

    for message in messages:

        if getattr(message, "type", None) == "tool":

            tool_name = getattr(message, "name", "unknown_tool")

            tool_output = _text(getattr(message, "content", ""))

            evidence.append(
                {
                    "tool": tool_name,
                    "result": tool_output
                }
            )

    # ----------------------------------------------
    # Responsible AI
    # ----------------------------------------------

    responsible_ai = run_responsible_ai_checks(
        request.message,
        response_text
    )

    # ----------------------------------------------
    # Grounding: reject answers with numbers no tool produced
    # ----------------------------------------------

    # Figures may come from a tool or from the user's own message: repeating "30%" back to
    # someone who asked about a 30% offer is not inventing a number.
    grounding = check_grounding(response_text, [request.message] + [e["result"] for e in evidence])
    if not grounding["grounded"]:
        response_text = (
            "I can't confirm some figures in my draft answer, so I won't state them. "
            "Please see the tool evidence below."
        )

    guardian = None
    for e in evidence:
        if e["tool"] == "check_scam_message" and "SCAM VERDICT: HIGH_RISK" in e["result"]:
            reasons = [l[2:] for l in e["result"].splitlines() if l.startswith("- ")]
            guardian = build_alert({"level": "HIGH_RISK", "reasons": reasons},
                                   request.guardian_contact)

    pending = []
    if guardian:
        pending.append(trust_panel.add_pending(owner, guardian))
    trust_panel.record_conversation(owner, tools_used, grounding["grounded"])

    # ----------------------------------------------
    # Return complete response
    # ----------------------------------------------

    return {

        "answer": response_text,

        "agent_execution": {

            "tools_used": tools_used,

            "number_of_tools": len(tools_used),

            "status": (
                "tools_executed"
                if tools_used
                else "no_tools_required"
            )
        },

        "evidence": evidence,

        "responsible_ai": {**responsible_ai, "grounding": grounding},

        "pending_actions": pending
    }