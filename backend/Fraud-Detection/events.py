"""Decision events for Component 3 (README 11). Envelope matches Component 1's."""

from __future__ import annotations

import json
import os
import threading
import urllib.request
import uuid
from datetime import datetime, timezone

import odata_service  # noqa: F401  (puts shared/auth on sys.path)
from zt_auth import service_token


def build_event(event_type: str, request: dict, response: dict, *, model_version: str,
                policy_version: str, principal: str | None = None, event_id: str | None = None,
                owner: str | None = None) -> dict:
    """event_id: pass the decision's own id when the customer holds it (a Scam Shield verdict),
    so Component 3 anchors it under an id the customer can later verify."""
    return {"event_id": event_id or str(uuid.uuid4()), "event_type": event_type, "schema_version": "1.0",
            "component": "c2", "occurred_at": datetime.now(timezone.utc).isoformat(),
            "model_version": model_version, "policy_version": policy_version,
            "principal": principal,
            # The authenticated user the decision belongs to; Component 3 scopes reads to it.
            "owner": owner, "request": request, "response": response}


def publish(event: dict) -> None:
    """Fire-and-forget to Component 3 (AUDIT_URL) and Pub/Sub (PUBSUB_DECISIONS_TOPIC + PROJECT_ID)."""
    def send() -> None:
        url = os.getenv("AUDIT_URL")
        if url:
            try:
                urllib.request.urlopen(urllib.request.Request(
                    url.rstrip("/") + "/api/audit/events", json.dumps(event).encode(),
                    {"Content-Type": "application/json", **service_token()}), timeout=5).read()
            except Exception:  # noqa: BLE001 - never block or fail the decision path
                pass
        topic, project = os.getenv("PUBSUB_DECISIONS_TOPIC"), os.getenv("PROJECT_ID")
        if topic and project:
            try:
                from google.cloud import pubsub_v1

                pub = pubsub_v1.PublisherClient()
                pub.publish(pub.topic_path(project, topic), json.dumps(event).encode()).result(timeout=5)
            except Exception:  # noqa: BLE001
                pass

    threading.Thread(target=send, daemon=True).start()
