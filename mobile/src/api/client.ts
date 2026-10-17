import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import { ApiError, messageFrom, safeParse } from "../lib/errors";
import { resolveBaseUrls, type Service } from "../lib/urls";

export { ApiError };

const TOKEN_KEY = "firststep.token";
const OVERRIDES_KEY = "firststep.urls";

let token: string | null = null;
let overrides: Partial<Record<Service, string>> = {};
let onAuthLost: (() => void) | null = null;

const ENV: Partial<Record<Service, string | undefined>> = {
  platform: process.env.EXPO_PUBLIC_PLATFORM_URL,
  portfolio: process.env.EXPO_PUBLIC_PORTFOLIO_URL,
  fraud: process.env.EXPO_PUBLIC_FRAUD_URL,
  audit: process.env.EXPO_PUBLIC_AUDIT_URL,
  assistant: process.env.EXPO_PUBLIC_ASSISTANT_URL,
};

export function baseUrls(): Record<Service, string> {
  return resolveBaseUrls(overrides, ENV, Constants.expoConfig?.hostUri);
}

/** Load the stored session and URL overrides once at start-up. */
export async function loadSession(): Promise<string | null> {
  // The token lives in the OS keystore (Keychain / Android Keystore), never in plain storage.
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  const saved = await SecureStore.getItemAsync(OVERRIDES_KEY);
  overrides = saved ? (safeParse(saved) as Partial<Record<Service, string>>) : {};
  return token;
}

export async function setToken(value: string | null): Promise<void> {
  token = value;
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function hasToken(): boolean {
  return token !== null;
}

export async function setUrlOverrides(next: Partial<Record<Service, string>>): Promise<void> {
  overrides = next;
  await SecureStore.setItemAsync(OVERRIDES_KEY, JSON.stringify(next));
}

export function urlOverrides(): Partial<Record<Service, string>> {
  return { ...overrides };
}

/** Called when any request comes back 401, so the app can return to sign-in once. */
export function setOnAuthLost(fn: (() => void) | null): void {
  onAuthLost = fn;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  timeoutMs?: number;
}

export async function request<T>(service: Service, path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, timeoutMs = 60_000 } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const base = baseUrls()[service];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, `Can't reach the ${service} service (${base}). Check your connection.`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const payload = text ? safeParse(text) : null;
  if (!response.ok) {
    const error = new ApiError(response.status, messageFrom(response.status, payload), payload);
    if (response.status === 401 && auth && token) onAuthLost?.();
    throw error;
  }
  return payload as T;
}
