const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  success: boolean;
  errorCodes: string[];
}

export async function verifyTurnstile(secret: string, token: string, ip: string | null, fetcher: typeof fetch = fetch): Promise<TurnstileResult> {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const res = await fetcher(VERIFY_URL, { method: "POST", body });
  if (!res.ok) return { success: false, errorCodes: [`http-${res.status}`] };
  const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
  return { success: !!data.success, errorCodes: data["error-codes"] ?? [] };
}
