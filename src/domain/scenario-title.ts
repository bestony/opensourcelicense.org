/**
 * Natural search query titles for scenario × license cell pages.
 * Replaces templated titles like "A1 ... — MIT" with high-intent queries like
 * "Can a cloud vendor sell MIT-licensed software as a service?".
 */

const SCENARIO_QUERY_EN: Record<string, (lic: string) => string> = {
  A1: (l) => `Can a cloud vendor sell ${l}-licensed software as a service?`,
  A2: (l) => `Can someone fork ${l} software and distribute a closed-source competitor?`,
  A3: (l) => `Can you embed ${l} software in a closed-source SaaS backend?`,
  A4: (l) => `Can you link ${l}-licensed code into a closed-source app or firmware?`,
  A5: (l) => `Can someone promote a modified version with your name or trademark under ${l}?`,
  A6: (l) => `Can someone sell unmodified copies of ${l}-licensed software?`,

  B1: (l) => `Does ${l} protect against patent infringement lawsuits from users?`,
  B2: (l) => `Can a contributor assert patents on their ${l}-licensed code?`,
  B3: (l) => `What governing law and venue apply to cross-border ${l} disputes?`,

  C1: (l) => `Can you relicense or sell commercial licenses for ${l} code without a CLA?`,
  C2: (l) => `Can ${l}-licensed code be merged into a GPL-3.0 project?`,
  C3: (l) => `Can you use a GPL-3.0 dependency in a ${l}-licensed project?`,
  C4: (l) => `Can someone fork an abandoned ${l} project to continue development?`,
  C5: (l) => `Can you block big companies or competitors under ${l}?`,
  C6: (l) => `What happens if ${l} code was written by an employee and the employer objects?`,

  D1: (l) => `Can someone remove copyright or attribution notices under ${l}?`,
  D2: (l) => `Can someone modify ${l} files without marking the changes?`,
  D3: (l) => `Is internal modification of ${l} software allowed without distribution?`,
  D4: (l) => `Can you prohibit military or surveillance use under ${l}?`,
  D5: (l) => `Can sanctioned entities use ${l}-licensed software?`,
  D6: (l) => `Can ${l}-licensed code be used to train an AI model?`,

  E1: (l) => `Can model weights under ${l} be used for military or surveillance?`,
  E2: (l) => `Does ${l} allow distillation or training other models on its outputs?`,
  E3: (l) => `Can a hyperscale company commercially use ${l}-licensed models?`,
  E4: (l) => `Can fine-tuned ${l} models be released as closed weights?`,
  E5: (l) => `Can a dataset under ${l} be used commercially and redistributed?`,
  E6: (l) => `Can you restrict a ${l} project to research use only?`,
};

const SCENARIO_QUERY_ZH: Record<string, (lic: string) => string> = {
  A1: (l) => `云厂商能把 ${l} 项目做成托管服务售卖吗？`,
  A2: (l) => `有人能 fork ${l} 项目并闭源分发竞品吗？`,
  A3: (l) => `能把 ${l} 代码嵌入闭源 SaaS 后端吗？`,
  A4: (l) => `能把 ${l} 代码链接进闭源 App 或固件分发吗？`,
  A5: (l) => `有人能用原作者名字或商标宣传 ${l} 改版吗？`,
  A6: (l) => `有人能原样打包收费售卖 ${l} 软件吗？`,

  B1: (l) => `${l} 能防御用户的专利侵权诉讼吗？`,
  B2: (l) => `贡献者能对 ${l} 用户主张其代码中的专利吗？`,
  B3: (l) => `${l} 跨法域纠纷适用什么法律与管辖？`,

  C1: (l) => `没有 CLA 时，作者能对 ${l} 项目改协议或卖商业授权吗？`,
  C2: (l) => `${l} 代码能被并入 GPL-3.0 项目吗？`,
  C3: (l) => `用了 GPL-3.0 依赖，整体还能以 ${l} 发布吗？`,
  C4: (l) => `项目停更后，他人能 fork 接手 ${l} 项目吗？`,
  C5: (l) => `作者能用 ${l} 只禁止大公司或竞争对手使用吗？`,
  C6: (l) => `${l} 项目的关键代码由员工编写且雇主反对怎么办？`,

  D1: (l) => `能删除 ${l} 代码中的版权与署名声明吗？`,
  D2: (l) => `修改 ${l} 代码可以不标注修改吗？`,
  D3: (l) => `${l} 允许不分发、不对外服务的内部修改吗？`,
  D4: (l) => `能用 ${l} 禁止军事或监控等不认同的用途吗？`,
  D5: (l) => `受制裁实体可以使用 ${l} 软件吗？`,
  D6: (l) => `${l} 代码能被用于训练 AI 模型吗？`,

  E1: (l) => `${l} 模型权重能用于军事、监控或虚假信息吗？`,
  E2: (l) => `${l} 允许蒸馏或用模型输出训练其他模型吗？`,
  E3: (l) => `超大规模公司能直接商用 ${l} 模型吗？`,
  E4: (l) => `${l} 模型微调后能换名闭源发布吗？`,
  E5: (l) => `${l} 数据集能被商用并再分发吗？`,
  E6: (l) => `作者能让 ${l} 项目只允许研究用途吗？`,
};

export function scenarioSearchTitle(
  scenarioId: string,
  licenseShortName: string,
  locale: string = "en",
  fallbackTitle?: string,
): string {
  const sid = scenarioId.toUpperCase();
  if (locale === "zh-cn" || locale === "zh-tw") {
    const fn = SCENARIO_QUERY_ZH[sid];
    if (fn) return fn(licenseShortName);
  }
  const enFn = SCENARIO_QUERY_EN[sid];
  if (enFn && (locale === "en" || !fallbackTitle)) {
    return enFn(licenseShortName);
  }
  if (fallbackTitle) {
    return `${fallbackTitle} (${licenseShortName})`;
  }
  return `${sid} — ${licenseShortName}`;
}
