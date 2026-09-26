/**
 * Structured, leveled logger shared by build scripts, islands and the worker.
 * Output is one JSON object per line. Sensitive keys are redacted.
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SENSITIVE = /token|secret|password|authorization|cookie|api[-_]?key|^ip$/i;

type Fields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(scope: string): Logger;
}

function readEnvLevel(): LogLevel {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  const raw = g.process?.env?.LOG_LEVEL?.toLowerCase();
  return raw && raw in ORDER ? (raw as LogLevel) : "info";
}

let globalLevel: LogLevel = readEnvLevel();

export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export function redact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE.test(k)) out[k] = "[redacted]";
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else out[k] = v;
  }
  return out;
}

export function createLogger(scope: string, sink: (line: string, level: LogLevel) => void = defaultSink): Logger {
  const emit = (level: Exclude<LogLevel, "silent">, msg: string, fields?: Fields) => {
    if (ORDER[level] < ORDER[globalLevel]) return;
    const line = JSON.stringify({ level, ts: new Date().toISOString(), scope, msg, ...(fields ? redact(fields) : {}) });
    sink(line, level);
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (sub) => createLogger(`${scope}.${sub}`, sink),
  };
}

function defaultSink(line: string, level: LogLevel): void {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
