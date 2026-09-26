export interface Env {
  ASSETS: Fetcher;
  /** Workers AI binding */
  AI?: Ai;
  RATE_LIMIT?: KVNamespace;
  TURNSTILE_SECRET?: string;
  /** comma-separated frontend hostnames allowed to solve the widget */
  TURNSTILE_HOSTNAMES?: string;
  /** HMAC secret for session tokens and IP hashing */
  SESSION_SECRET?: string;
  /** Workers AI model id with function calling support */
  ADVISOR_MODEL?: string;
  /** optional: "low" | "medium" | "high" for reasoning models */
  ADVISOR_REASONING_EFFORT?: string;
  /** model turns per client per UTC day */
  DAILY_LIMIT?: string;
  LOG_LEVEL?: string;
}
