import { request, setToken } from "./client";
import type {
  AssistantReply,
  Guardian,
  Holding,
  ImportResult,
  PendingAction,
  Portfolio,
  PortfolioSummary,
  QuoteResponse,
  ScoreResponse,
  ShieldVerdict,
  StepUpChallenge,
  StepUpResult,
  TokenResponse,
  TransactionInput,
  User,
  VerifyResult,
  WithdrawalResponse,
} from "./types";

// --- Platform: identity and portfolios --------------------------------------------------
export async function register(email: string, displayName: string, password: string): Promise<TokenResponse> {
  const r = await request<TokenResponse>("platform", "/auth/register", {
    method: "POST",
    auth: false,
    body: { email, display_name: displayName, password },
  });
  await setToken(r.access_token);
  return r;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const r = await request<TokenResponse>("platform", "/auth/login", {
    method: "POST",
    auth: false,
    body: { email, password },
  });
  await setToken(r.access_token);
  return r;
}

export const me = () => request<User>("platform", "/auth/me");
export const listPortfolios = () => request<PortfolioSummary[]>("platform", "/portfolios");
export const getPortfolio = (id: number) => request<Portfolio>("platform", `/portfolios/${id}`);
export const createPortfolio = (name: string, holdings: Holding[], baseCurrency = "LKR") =>
  request<Portfolio>("platform", "/portfolios", {
    method: "POST",
    body: { name, base_currency: baseCurrency, holdings },
  });
export const updatePortfolio = (id: number, data: { name?: string; holdings?: Holding[] }) =>
  request<Portfolio>("platform", `/portfolios/${id}`, { method: "PUT", body: data });
export const deletePortfolio = (id: number) => request<void>("platform", `/portfolios/${id}`, { method: "DELETE" });

// --- Component 1: planning, statement import, quotes ------------------------------------
export function planCash(params: {
  holdings: Holding[];
  targetAmount: number;
  deadlineDays: number;
  urgency: number;
  baseCurrency?: string;
}): Promise<WithdrawalResponse> {
  return request<WithdrawalResponse>("portfolio", "/portfolio/withdraw", {
    method: "POST",
    timeoutMs: 120_000,
    body: {
      holdings: params.holdings,
      target_amount: params.targetAmount,
      urgency: params.urgency,
      risk_tolerance: 0.5,
      deadline_days: params.deadlineDays,
      use_agent: false,
      base_currency: params.baseCurrency ?? null,
    },
  });
}

/** Gemini reads a statement photo into DRAFT holdings. Nothing is saved until the user confirms. */
export const importStatement = (contentBase64: string, mimeType: string) =>
  request<ImportResult>("portfolio", "/portfolio/import-statement", {
    method: "POST",
    timeoutMs: 120_000,
    body: { content_base64: contentBase64, mime_type: mimeType },
  });

export const quote = (symbol: string, quantity?: number) =>
  request<QuoteResponse>("portfolio", "/market/quote", { method: "POST", body: { symbol, quantity } });

// --- Component 2: Scam Shield, transfer gateway, step-up --------------------------------
export const checkMessage = (text: string) =>
  request<ShieldVerdict>("fraud", "/odata/v1/fraud/CheckMessage", { method: "POST", body: { text } });

export const scoreTransfer = (tx: TransactionInput) =>
  request<ScoreResponse>("fraud", "/score", { method: "POST", body: tx });

export const startStepUp = (transactionId: string, userId: string) =>
  request<StepUpChallenge>("fraud", "/step-up/challenge", {
    method: "POST",
    body: { transaction_id: transactionId, user_id: userId },
  });

export const verifyStepUp = (challengeId: string, code: string) =>
  request<StepUpResult>("fraud", "/step-up/verify", { method: "POST", body: { challenge_id: challengeId, code } });

// --- Component 3: proof that a decision was not changed ---------------------------------
export const verifyDecision = (id: string) =>
  request<VerifyResult>("audit", `/api/audit/${encodeURIComponent(id)}/verify`);

// --- Component 4: assistant, guardian, pending confirmations ----------------------------
const ROOT = "/odata/v1/assistant";

export const ask = (message: string) =>
  request<AssistantReply>("assistant", "/assistant/chat", { method: "POST", timeoutMs: 120_000, body: { message } });

export async function pendingActions(): Promise<PendingAction[]> {
  const q = "$filter=" + encodeURIComponent("Status eq 'pending'") + "&$orderby=" + encodeURIComponent("CreatedAt desc");
  return (await request<{ value: PendingAction[] }>("assistant", `${ROOT}/PendingActions?${q}`)).value;
}

export const confirmAction = (id: string) =>
  request<PendingAction>("assistant", `${ROOT}/Confirm`, { method: "POST", body: { id } });
export const rollbackAction = (id: string) =>
  request<PendingAction>("assistant", `${ROOT}/Rollback`, { method: "POST", body: { id } });

export async function guardians(): Promise<Guardian[]> {
  return (await request<{ value: Guardian[] }>("assistant", `${ROOT}/Guardians`)).value;
}
export const addGuardian = (contact: string, name: string) =>
  request<Guardian>("assistant", `${ROOT}/Guardians`, { method: "POST", body: { contact, name } });
