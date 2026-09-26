import { describe, expect, it } from "vitest";
import { buildCompatIndex, checkExpression } from "@/domain/compat";
import { realCatalog } from "./helpers";

const idx = buildCompatIndex(realCatalog().compat);

describe("compat", () => {
  it("permissive deps fit anything", () => {
    expect(checkExpression(idx, "MIT", "gpl-3.0").status).toBe("compatible");
    expect(checkExpression(idx, "ISC", "busl-1.1").status).toBe("compatible");
  });
  it("gpl deps force gpl-family projects", () => {
    expect(checkExpression(idx, "GPL-3.0-only", "mit").status).toBe("incompatible");
    expect(checkExpression(idx, "GPL-3.0-or-later", "agpl-3.0").status).toBe("compatible");
    expect(checkExpression(idx, "AGPL-3.0-only", "gpl-3.0").status).toBe("conditional");
  });
  it("handles OR / AND expressions", () => {
    expect(checkExpression(idx, "(MIT OR GPL-3.0-only)", "apache-2.0").status).toBe("compatible");
    expect(checkExpression(idx, "MIT AND GPL-3.0-only", "apache-2.0").status).toBe("incompatible");
  });
  it("reports unknown licenses", () => {
    expect(checkExpression(idx, "Foo-1.0", "mit").status).toBe("unknown");
  });
});

describe("compat exceptions", () => {
  it("denies GPL-incompatible weak copyleft for GPL projects only", () => {
    expect(checkExpression(idx, "CDDL-1.0", "gpl-2.0").status).toBe("incompatible");
    expect(checkExpression(idx, "CDDL-1.0", "mit").status).toBe("compatible");
    expect(checkExpression(idx, "EPL-2.0", "gpl-3.0").status).toBe("conditional");
    expect(checkExpression(idx, "GPL-2.0-only", "gpl-2.0").status).toBe("compatible");
    expect(checkExpression(idx, "GPL-2.0-only", "gpl-3.0").status).toBe("incompatible");
  });
});
