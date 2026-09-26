/**
 * Canonical server-side Turnstile siteverify. A token is accepted only when it
 * is well formed, Cloudflare reports `success`, and the response carries the
 * action the widget was rendered with and a frontend hostname we allow.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Turnstile tokens are opaque; anything longer than this is not one. */
const MAX_TOKEN_LENGTH = 2048;

export interface TurnstileResult {
  success: boolean;
  errorCodes: string[];
}

export interface TurnstileExpectations {
  /** action passed to `turnstile.render`; the siteverify response must match */
  action: string;
  /** hostnames allowed to solve the widget; empty fails closed */
  hostnames: readonly string[];
  fetcher?: typeof fetch;
}

/** Parses the comma-separated `TURNSTILE_HOSTNAMES` variable. */
export function parseHostnames(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
}

export async function verifyTurnstile(secret: string, token: unknown, ip: string | null, expected: TurnstileExpectations): Promise<TurnstileResult> {
  const allowed = expected.hostnames.map((hostname) => hostname.toLowerCase());
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return { success: false, errorCodes: ["invalid-token"] };
  if (!allowed.length) return { success: false, errorCodes: ["hostnames-not-configured"] };

  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);

  let res: Response;
  try {
    res = await (expected.fetcher ?? fetch)(VERIFY_URL, { method: "POST", body });
  } catch {
    return { success: false, errorCodes: ["network-error"] };
  }
  if (!res.ok) return { success: false, errorCodes: [`http-${res.status}`] };

  const data = (await res.json()) as { success?: boolean; action?: string; hostname?: string; "error-codes"?: string[] };
  const errorCodes = [...(data["error-codes"] ?? [])];
  if (!data.success) return { success: false, errorCodes };
  if (data.action !== expected.action) errorCodes.push("action-mismatch");
  if (!allowed.includes((data.hostname ?? "").toLowerCase())) errorCodes.push("hostname-mismatch");
  return { success: errorCodes.length === 0, errorCodes };
}
