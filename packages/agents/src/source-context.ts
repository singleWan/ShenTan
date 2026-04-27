/**
 * 生成来源材料约束提示段，注入到 Agent 用户提示词中
 * 仅当 source 有值时生成内容，否则返回空字符串
 */
export function buildSourceSection(source: string | undefined, contextHint: string): string {
  if (!source) return '';
  return `\n## 来源材料约束\n\n该角色来源于「${source}」。${contextHint}其他来源的补充信息也可采纳，但应以「${source}」中的内容为主要依据。\n`;
}
