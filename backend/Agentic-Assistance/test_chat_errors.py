"""A failing language model is reported as such, never as a crash or an invented answer."""

from fastapi.testclient import TestClient

import main


def test_model_failure_is_a_503_with_cors(monkeypatch):
    def boom(_state):
        raise RuntimeError("404 model retired")

    monkeypatch.setattr(main.agent, "invoke", boom)
    origin = "http://localhost:3000"
    response = TestClient(main.app).post("/assistant/chat", json={"message": "hi"}, headers={"Origin": origin})
    assert response.status_code == 503
    assert "No answer was generated" in response.json()["detail"]
    # The browser can only show the real reason if the error still carries CORS headers.
    assert response.headers.get("access-control-allow-origin") == origin


def test_gemini_content_blocks_are_read_as_text(monkeypatch):
    """Gemini 3.x returns content as a list of blocks; the checks must see the text."""
    from langchain_core.messages import AIMessage, ToolMessage

    def reply(state):
        return {"messages": state["messages"] + [
            ToolMessage(content="SCAM VERDICT: HIGH_RISK\n- Promises a guaranteed return",
                        name="check_scam_message", tool_call_id="1"),
            AIMessage(content=[{"type": "text", "text": "This is very likely a scam."},
                               {"type": "thinking", "thinking": "hidden"}]),
        ]}

    monkeypatch.setattr(main.agent, "invoke", reply)
    body = TestClient(main.app).post("/assistant/chat", json={"message": "is this a scam?"}).json()
    assert body["answer"] == "This is very likely a scam."
    assert body["agent_execution"]["tools_used"] == ["check_scam_message"]


def test_figures_from_the_users_own_message_are_grounded(monkeypatch):
    from langchain_core.messages import AIMessage

    monkeypatch.setattr(main.agent, "invoke", lambda state: {"messages": state["messages"] + [
        AIMessage(content="No real investment can guarantee 30% a month.")]})
    body = TestClient(main.app).post("/assistant/chat", json={"message": "Is a guaranteed 30% monthly return real?"}).json()
    assert body["answer"] == "No real investment can guarantee 30% a month."
    assert body["responsible_ai"]["grounding"]["grounded"] is True


def test_invented_figures_are_still_rejected(monkeypatch):
    from langchain_core.messages import AIMessage

    monkeypatch.setattr(main.agent, "invoke", lambda state: {"messages": state["messages"] + [
        AIMessage(content="About 4,700 people lost money to this scheme.")]})
    body = TestClient(main.app).post("/assistant/chat", json={"message": "Is this a scam?"}).json()
    assert body["responsible_ai"]["grounding"]["grounded"] is False


def test_answer_is_translated_when_the_model_ignores_the_language(monkeypatch):
    from langchain_core.messages import AIMessage

    monkeypatch.setattr(main.agent, "invoke", lambda state: {"messages": state["messages"] + [
        AIMessage(content="This is a scam. 30% a month is not real.")]})
    class FakeLLM:
        def invoke(self, msgs):
            return AIMessage(content="මෙය වංචාවකි. මසකට 30% සැබෑ නොවේ.")

    monkeypatch.setattr(main, "llm", FakeLLM())
    body = TestClient(main.app).post("/assistant/chat", json={"message": "[Reply in සිංහල] Is 30% a month real?"}).json()
    assert body["answer"].startswith("මෙය")
    assert body["responsible_ai"]["grounding"]["grounded"] is True


def test_english_is_left_alone():
    assert main._in_language("Is this a scam?", "Yes.") == "Yes."
