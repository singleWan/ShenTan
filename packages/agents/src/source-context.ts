/**
 * 生成来源材料约束提示段，注入到 Agent 用户提示词中
 * 仅当 source 有值时生成内容，否则返回空字符串
 */
export function buildSourceSection(source: string[] | undefined, contextHint: string): string {
  if (!source || source.length === 0) return '';
  const works = source.map((s) => `「${s}」`).join('、');
  return `\n## 来源材料约束\n\n该角色来源于${works}。${contextHint}其他来源的补充信息也可采纳，但应以${works}中的内容为主要依据。\n`;
}
