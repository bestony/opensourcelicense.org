/**
 * Fixed-window daily limit in Workers KV. The key uses an HMAC of the client IP,
 * so raw IPs are never stored. KV is eventually consistent: the limit is soft,
 * which is acceptable for cost protection.
 */
import { hmacHex } from "./crypto";

export interface RateDecision {
  allowed: boolean;
  count: number;
  limit: number;
  key: string;
}

type KV = Pick<KVNamespace, "get" | "put">;

export async function checkRateLimit(kv: KV, secret: string, ip: string, limit: number, now = new Date()): Promise<RateDecision> {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const key = `rl:${(await hmacHex(secret, `ip:${ip}`)).slice(0, 32)}:${day}`;
  const count = Number((await kv.get(key)) ?? "0") || 0;
  if (count >= limit) return { allowed: false, count, limit, key };
  await kv.put(key, String(count + 1), { expirationTtl: 36 * 60 * 60 });
  return { allowed: true, count: count + 1, limit, key };
}
