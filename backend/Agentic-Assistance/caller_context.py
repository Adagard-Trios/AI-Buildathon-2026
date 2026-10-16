"""The caller's credentials, carried from the chat request into the agent's tools.

Zero trust means the downstream service decides for itself whether the caller may do what
the tool asks. So a tool forwards the USER's own bearer token (on-behalf-of) rather than a
blanket service identity: Component 2 re-verifies it, and a user can never reach more through
the agent than they could by calling the service directly.

A ContextVar rather than a module global: concurrent chats must not see each other's token.
LangChain runs tools through a context-copying executor, so the value survives the hop into
the ToolNode's worker threads.
"""

from __future__ import annotations

from contextvars import ContextVar

_authorization: ContextVar[str | None] = ContextVar("caller_authorization", default=None)


def set_caller(authorization: str | None):
    return _authorization.set(authorization)


def reset_caller(token) -> None:
    _authorization.reset(token)


def auth_headers() -> dict:
    """Authorization header for a downstream call: the caller's own token, else nothing."""
    value = _authorization.get()
    return {"Authorization": value} if value else {}
