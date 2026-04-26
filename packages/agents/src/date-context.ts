/**
 * 获取当前日期上下文，注入到 Agent 用户提示词中
 */
export function getDateContext(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dateStr = `${year}年${month}月${day}日`;
  const prevYear = year - 1;
  return `当前日期: ${dateStr}\n时效性搜索时请使用当前年份 ${year} 和前一年份 ${prevYear} 作为关键词。`;
}
