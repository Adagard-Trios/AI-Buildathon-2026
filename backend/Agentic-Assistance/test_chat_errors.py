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
