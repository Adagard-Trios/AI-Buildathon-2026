/**
 * Component 4 — Localized Explainable Agentic LLM Assistant (W V A D K Chamara).
 *
 * Shapes mirror the return of `backend/Agentic-Assistance/main.py::chat`.
 */

import { request } from "./client";

export interface AssistantEvidence {
  tool: string;
  result: string;
}

export interface AssistantReply {
  answer: string;
  agent_execution: {
    tools_used: string[];
    number_of_tools: number;
    status: string;
  };
  evidence: AssistantEvidence[];
  responsible_ai: Record<string, unknown>;
  pending_actions: PendingAction[];
}

export interface PendingAction {
  Id: string;
  Kind: string;
  Status: string;
  Reversible: boolean;
  Summary: string;
  To?: string | null;
}

const ROOT = "/odata/v1/assistant";

export async function pendingActions(): Promise<PendingAction[]> {
  return (await request<{ value: PendingAction[] }>("assistant", `${ROOT}/PendingActions?$filter=Status eq 'pending'&$orderby=CreatedAt desc`)).value;
}

export function confirmAction(id: string): Promise<PendingAction> {
  return request<PendingAction>("assistant", `${ROOT}/Confirm`, { method: "POST", body: { id } });
}

export function rollbackAction(id: string): Promise<PendingAction> {
  return request<PendingAction>("assistant", `${ROOT}/Rollback`, { method: "POST", body: { id } });
}

export function addGuardian(contact: string, name = ""): Promise<unknown> {
  return request("assistant", `${ROOT}/Guardians`, { method: "POST", body: { contact, name } });
}

export function askAssistant(message: string, guardianContact?: string): Promise<AssistantReply> {
  return request<AssistantReply>("assistant", "/assistant/chat", {
    method: "POST",
    body: { message, guardian_contact: guardianContact },
  });
}

export function assistantHealth(): Promise<{ status: string }> {
  return request<{ status: string }>("assistant", "/health", { auth: false });
}
