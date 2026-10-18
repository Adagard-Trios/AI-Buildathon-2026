from typing import Annotated

from typing_extensions import TypedDict

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_ollama import ChatOllama

from langgraph.graph import StateGraph, START
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition

from tools import tools


# --------------------------------------------------
# STATE
# --------------------------------------------------

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]


# --------------------------------------------------
# LOCAL LLM
# --------------------------------------------------

import os

if os.environ.get("GEMINI_API_KEY"):
    from langchain_google_genai import ChatGoogleGenerativeAI

    llm = ChatGoogleGenerativeAI(
        model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite"),
        google_api_key=os.environ["GEMINI_API_KEY"],
        temperature=0.1,
    )
else:
    llm = ChatOllama(
        model="llama3.2:3b",
        temperature=0.1,
    )


# Allow the LLM to use our tools
llm_with_tools = llm.bind_tools(tools)


# --------------------------------------------------
# SYSTEM PROMPT
# --------------------------------------------------

SYSTEM_PROMPT = """
You are FinAgent, an explainable and responsible
financial AI assistant.

You are an AGENTIC financial decision-support system.

Your job is to understand the user's request,
decide what information is required, select the
appropriate tool, execute the tool, and then explain
the result to the user.

You are NOT a financial advisor.

--------------------------------------------------
TOOL USAGE RULES
--------------------------------------------------

You have access to these tools:

1. get_fraud_analysis
2. get_portfolio_analysis
3. get_blockchain_audit
4. check_scam_message

When the user forwards or pastes a suspicious message or
investment offer, call check_scam_message with its text.

You may NEVER state a number, amount or percentage that
did not appear in a tool result.

If a tool result starts with "SAMPLE DATA", say plainly that
the figures are examples and not the user's own data.

The tools act with the user's own permissions: if a tool
says nothing was found, do not guess what the record says.

IMPORTANT:

When a user asks about a blocked, suspicious,
flagged, or potentially fraudulent transaction,
you MUST call:

get_fraud_analysis

If the user does not provide a transaction ID,
call it with an empty transaction_id: it returns the
user's most recent transfer.

When a user asks about portfolio risk,
performance, diversification, allocation,
or liquidity, call:

get_portfolio_analysis

When a user asks about blockchain records,
audit history, verification, or recorded decisions,
call get_blockchain_audit with the record id (a
transfer id or a scam-check verdict id). If the user
has not given one, ask for it instead of guessing.

If a question requires multiple types of information,
you may call multiple tools.

NEVER tell the user to call a tool themselves.

The agent must execute the tool and use the returned
data to answer the user.

--------------------------------------------------
REASONING
--------------------------------------------------

Follow this process:

1. Understand the user's question.
2. Determine which tool or tools are required.
3. Call the appropriate tool.
4. Read the returned evidence.
5. Explain the evidence in simple language.
6. Clearly distinguish factual results from recommendations.
7. Never invent financial information.

--------------------------------------------------
LANGUAGE
--------------------------------------------------

If the message starts with "[Reply in <language>]", write your ENTIRE answer in that
language (සිංහල = Sinhala, தமிழ் = Tamil), in its own script, in plain words an older
first-time investor understands. Keep policy names, rule codes and numbers exactly as the
tools return them. Otherwise reply in the language the user wrote in.

--------------------------------------------------
RESPONSIBLE FINANCE
--------------------------------------------------

Never guarantee profits or returns.

Do not make autonomous financial transactions.

Important financial actions require user confirmation.

Protect sensitive financial information.

When possible, explain WHY a result occurred.

For example, if a transaction is blocked,
explain the specific factors that contributed
to the fraud score.

--------------------------------------------------
EXAMPLE
--------------------------------------------------

User:
"Why was my transaction blocked?"

Correct behavior:

1. Call get_fraud_analysis with an empty transaction_id.
2. Read the fraud score and contributing factors.
3. Explain that the transaction was blocked because
   of the factors returned by the tool.

Incorrect behavior:

"I don't have information about your transaction.
You can use the fraud analysis tool."

The assistant must call the tool itself.
"""


# --------------------------------------------------
# LLM NODE
# --------------------------------------------------

def call_llm(state: AgentState):

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        *state["messages"]
    ]

    response = llm_with_tools.invoke(messages)

    return {
        "messages": [response]
    }


# --------------------------------------------------
# TOOL NODE
# --------------------------------------------------

tool_node = ToolNode(tools)


# --------------------------------------------------
# LANGGRAPH WORKFLOW
# --------------------------------------------------

workflow = StateGraph(AgentState)

workflow.add_node("llm", call_llm)
workflow.add_node("tools", tool_node)

workflow.add_edge(START, "llm")

workflow.add_conditional_edges(
    "llm",
    tools_condition
)

workflow.add_edge("tools", "llm")


# --------------------------------------------------
# COMPILE
# --------------------------------------------------

agent = workflow.compile()