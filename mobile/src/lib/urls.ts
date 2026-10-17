// Pure: where each backend lives, as seen from the PHONE.

export type Service = "platform" | "portfolio" | "fraud" | "audit" | "assistant";

export const SERVICES: Service[] = ["platform", "portfolio", "fraud", "audit", "assistant"];

/** Local ports, same convention as docker-compose (8000 + component number, platform 8100). */
export const PORTS: Record<Service, number> = {
  platform: 8100,
  portfolio: 8000,
  fraud: 8001,
  audit: 8002,
  assistant: 8003,
};

/**
 * Resolve base URLs, in priority order:
 *  1. a per-service override saved in Settings (e.g. a Cloud Run URL),
 *  2. EXPO_PUBLIC_<SERVICE>_URL baked in at build time (the deployed stack),
 *  3. the laptop running the Expo dev server.
 *
 * (3) matters because "localhost" on a phone is the phone itself; the dev server's host
 * (Constants.expoConfig.hostUri, e.g. "192.168.1.20:8081") is the laptop running docker compose.
 */
export function resolveBaseUrls(
  overrides: Partial<Record<Service, string>>,
  env: Partial<Record<Service, string | undefined>>,
  devHostUri: string | null | undefined,
): Record<Service, string> {
  const host = devHostUri ? devHostUri.split(":")[0] : "localhost";
  const out = {} as Record<Service, string>;
  for (const s of SERVICES) {
    const chosen = overrides[s]?.trim() || env[s]?.trim() || `http://${host}:${PORTS[s]}`;
    out[s] = chosen.replace(/\/+$/, "");
  }
  return out;
}
