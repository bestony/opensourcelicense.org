import { describe, expect, it } from "vitest";
import { createLogger, redact, setLogLevel } from "@/lib/log";

describe("log", () => {
  it("redacts sensitive keys", () => {
    expect(redact({ token: "x", apiKey: "y", ip: "1.2.3.4", ok: 1 })).toEqual({
      token: "[redacted]",
      apiKey: "[redacted]",
      ip: "[redacted]",
      ok: 1,
    });
  });

  it("respects level threshold", () => {
    const lines: string[] = [];
    setLogLevel("warn");
    const log = createLogger("t", (l) => lines.push(l));
    log.info("skip");
    log.warn("keep", { n: 1 });
    setLogLevel("info");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ level: "warn", scope: "t", msg: "keep", n: 1 });
  });
});
