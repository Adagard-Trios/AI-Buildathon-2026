"""The user's token must reach Component 2 when the agent's ToolNode runs the scam tool."""

import io
import json

from langchain_core.messages import AIMessage
from langgraph.graph import START, MessagesState, StateGraph
from langgraph.prebuilt import ToolNode

import tools.scam_tools as scam_tools
from caller_context import reset_caller, set_caller


def test_tool_node_forwards_the_callers_token(monkeypatch):
    seen = {}

    def fake_urlopen(req, timeout=None):
        seen.update({k.lower(): v for k, v in req.header_items()})
        return io.BytesIO(json.dumps({"level": "LOW", "policy_version": "1.0", "verified": True,
                                      "fired_rules": [], "reasons": []}).encode())

    monkeypatch.setattr(scam_tools.urllib.request, "urlopen", fake_urlopen)
    call = AIMessage(content="", tool_calls=[{"name": "check_scam_message", "args": {"message_text": "hi"}, "id": "1"}])
    ctx = set_caller("Bearer user-token")
    try:
        # Through a compiled graph, as agent.py runs it: that is where tools hop threads.
        g = StateGraph(MessagesState)
        g.add_node("tools", ToolNode([scam_tools.check_scam_message]))
        g.add_edge(START, "tools")
        out = g.compile().invoke({"messages": [call]})
    finally:
        reset_caller(ctx)
    assert "SCAM VERDICT: LOW" in out["messages"][-1].content
    assert seen.get("authorization") == "Bearer user-token"


def test_no_caller_means_no_header(monkeypatch):
    seen = {}
    monkeypatch.setattr(scam_tools.urllib.request, "urlopen",
                        lambda req, timeout=None: (seen.update(dict(req.header_items())), (_ for _ in ()).throw(OSError("down")))[1])
    assert "unavailable" in scam_tools.check_scam_message.invoke({"message_text": "hi"})
    assert "Authorization" not in seen
