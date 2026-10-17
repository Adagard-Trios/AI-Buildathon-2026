"""Auth is ON by default (fail closed); this suite opts out, and the zero-trust tests
turn it back on explicitly with monkeypatch."""

import os

os.environ.setdefault("AUTH_REQUIRED", "false")
