/**
 * Short-lived session tokens issued after one successful Turnstile check, so a
 * conversation does not need a new challenge for every model turn.
 * Format: `<expiresAtMs>.<hex hmac>`.
 */
import { hmacHex, safeEqual } from "./crypto";

export const SESSION_TTL_MS = 60 * 60 * 1000;

export async function issueSession(secret: string, now = Date.now()): Promise<string> {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${await hmacHex(secret, `session:${exp}`)}`;
}

export async function verifySession(secret: string, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(sig, await hmacHex(secret, `session:${exp}`));
}
