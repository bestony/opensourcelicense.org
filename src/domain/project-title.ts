import type { Project } from "./catalog";

/**
 * Generates search-intent titles for project pages matching queries like
 * "is X open source" and "X license change".
 *
 * Example: "React License: MIT (changed from BSD+Patents in 2017)"
 */
export function projectSearchTitle(
  name: string,
  licenses: string,
  timeline: Project["timeline"] | undefined,
  info: (id: string) => { name: string },
  locale: string = "en",
): string {
  if (timeline && timeline.length > 0) {
    const lastChange = timeline[timeline.length - 1];
    if (lastChange.from && lastChange.from.length > 0 && lastChange.date) {
      const year = lastChange.date.slice(0, 4);
      const fromNames = lastChange.from.map((id: string) => info(id).name.replace(/\s*\+\s*/g, "+")).join(" / ");
      if (locale === "zh-cn") {
        return `${name} 许可证：${licenses}（${year} 年由 ${fromNames} 变更）`;
      }
      if (locale === "zh-tw") {
        return `${name} 授權條款：${licenses}（${year} 年由 ${fromNames} 變更）`;
      }
      return `${name} License: ${licenses} (changed from ${fromNames} in ${year})`;
    }
  }
  if (locale === "zh-cn") {
    return `${name} 许可证：${licenses}`;
  }
  if (locale === "zh-tw") {
    return `${name} 授權條款：${licenses}`;
  }
  return `${name} License: ${licenses}`;
}
