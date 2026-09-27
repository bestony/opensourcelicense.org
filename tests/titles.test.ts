import { describe, expect, it } from "vitest";
import { scenarioSearchTitle } from "@/domain/scenario-title";
import { projectSearchTitle } from "@/domain/project-title";

describe("scenarioSearchTitle", () => {
  it("formats English scenario titles as natural search queries", () => {
    expect(scenarioSearchTitle("A1", "MIT", "en")).toBe("Can a cloud vendor sell MIT-licensed software as a service?");
    expect(scenarioSearchTitle("A2", "Apache-2.0", "en")).toBe("Can someone fork Apache-2.0 software and distribute a closed-source competitor?");
    expect(scenarioSearchTitle("D6", "MIT", "en")).toBe("Can MIT-licensed code be used to train an AI model?");
  });

  it("formats Chinese scenario titles as natural search queries", () => {
    expect(scenarioSearchTitle("A1", "MIT", "zh-cn")).toBe("云厂商能把 MIT 项目做成托管服务售卖吗？");
    expect(scenarioSearchTitle("A1", "MIT", "zh-tw")).toBe("云厂商能把 MIT 项目做成托管服务售卖吗？");
    expect(scenarioSearchTitle("D6", "MIT", "zh-cn")).toBe("MIT 代码能被用于训练 AI 模型吗？");
  });

  it("falls back gracefully for other languages", () => {
    expect(scenarioSearchTitle("A1", "MIT", "de", "Managed Service")).toBe("Managed Service (MIT)");
  });
});

describe("projectSearchTitle", () => {
  const dummyInfo = (id: string) => {
    if (id === "bsd-patents") return { name: "BSD + Patents" };
    if (id === "bsd-3-clause") return { name: "BSD-3-Clause" };
    return { name: id };
  };

  it("generates query title for relicensed projects", () => {
    const title = projectSearchTitle(
      "React",
      "MIT",
      [
        {
          date: "2017-09-22",
          from: ["bsd-patents"],
          to: ["mit"],
          reason: "concerns",
          url: "https://example.com",
          forks: [],
        },
      ],
      dummyInfo,
      "en",
    );
    expect(title).toBe("React License: MIT (changed from BSD+Patents in 2017)");
  });

  it("generates query title in Chinese", () => {
    const title = projectSearchTitle(
      "React",
      "MIT",
      [
        {
          date: "2017-09-22",
          from: ["bsd-patents"],
          to: ["mit"],
          reason: "concerns",
          url: "https://example.com",
          forks: [],
        },
      ],
      dummyInfo,
      "zh-cn",
    );
    expect(title).toBe("React 许可证：MIT（2017 年由 BSD+Patents 变更）");
  });

  it("generates query title for projects without license changes", () => {
    const title = projectSearchTitle("Vue.js", "MIT", [], dummyInfo, "en");
    expect(title).toBe("Vue.js License: MIT");

    const zhTitle = projectSearchTitle("Vue.js", "MIT", [], dummyInfo, "zh-cn");
    expect(zhTitle).toBe("Vue.js 许可证：MIT");
  });
});
