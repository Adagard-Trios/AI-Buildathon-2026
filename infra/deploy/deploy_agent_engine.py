"""Deploy the C4 orchestrator to Vertex AI Agent Engine (README 5, 17).

UNTESTED: the ADK / Agent Engine APIs move quickly and this file was written without access to a
live project. Treat it as the wiring plan; run it once and fix drift. Needs PROJECT_ID, REGION,
STAGING_BUCKET (gs://...), `pip install "google-cloud-aiplatform[agent_engines,adk]"`.

The deployed agent reuses the SAME tool functions as the local service
(backend/Agentic-Assistance/tools) so behaviour does not fork; grounding and the Trust Panel
stay in the Cloud Run service that fronts it.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "backend" / "Agentic-Assistance"
sys.path.insert(0, str(ROOT))


def main() -> None:
    import vertexai
    from google.adk.agents import Agent
    from vertexai import agent_engines

    from tools.audit_tools import get_blockchain_audit
    from tools.fraud_tools import get_fraud_analysis
    from tools.portfolio_tools import get_portfolio_analysis
    from tools.scam_tools import check_scam_message

    # ADK takes plain callables; the langchain @tool wrappers expose theirs as `.func`.
    fns = [t.func for t in (get_fraud_analysis, get_portfolio_analysis, get_blockchain_audit, check_scam_message)]

    from agent import SYSTEM_PROMPT  # same instructions as the local agent

    vertexai.init(project=os.environ["PROJECT_ID"], location=os.environ["REGION"],
                  staging_bucket=os.environ["STAGING_BUCKET"])
    agent = Agent(model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite"), name="firststep_orchestrator",
                  instruction=SYSTEM_PROMPT, tools=fns)
    remote = agent_engines.create(agent_engines.AdkApp(agent=agent),
                                  requirements=["google-cloud-aiplatform[agent_engines,adk]", "langchain-core"],
                                  extra_packages=[str(ROOT / "tools")])
    print("Agent Engine resource:", remote.resource_name)


if __name__ == "__main__":
    main()
