// Pure helpers (no React Native imports) so they run under `node --test`.

/** An HTTP failure with the most useful message the backend gave us. */
export class ApiError extends Error {
  // Plain fields, not constructor parameter properties: Node's strip-only TypeScript
  // (used by `npm test`) cannot run parameter properties.
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  /** 401/403: the session is gone or not allowed; send the user back to sign-in. */
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** 0 = could not reach the service at all; 503 = it answered "not ready". */
  get isUnavailable(): boolean {
    return this.status === 0 || this.status === 503;
  }
}

/**
 * The services answer in two shapes: the OData error body on /odata routes
 * ({"error": {"code", "message", "details"}}) and FastAPI's {"detail": ...} elsewhere.
 * Component 3 also uses {"success": false, "message"}.
 */
export function messageFrom(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const err = b.error as { message?: string; details?: { target?: string; message?: string }[] } | undefined;
    if (err && typeof err === "object" && typeof err.message === "string") {
      const extra = Array.isArray(err.details)
        ? err.details.map((d) => (d.target ? `${d.target}: ${d.message}` : d.message)).filter(Boolean)
        : [];
      return extra.length ? `${err.message} ${extra.join("; ")}` : err.message;
    }
    if (typeof b.detail === "string") return b.detail;
    if (Array.isArray(b.detail)) {
      const parts = b.detail
        .map((item: unknown) => {
          if (item && typeof item === "object" && "msg" in item) {
            const it = item as { loc?: unknown[]; msg: string };
            const loc = Array.isArray(it.loc) ? it.loc.slice(1).join(".") : "";
            return loc ? `${loc}: ${it.msg}` : it.msg;
          }
          return String(item);
        })
        .filter(Boolean);
      if (parts.length) return parts.join("; ");
    }
    if (typeof b.message === "string") return b.message;
  }
  return `Request failed (${status})`;
}

export function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
