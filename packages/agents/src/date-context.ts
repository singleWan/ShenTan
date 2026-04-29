/**
 * 获取当前日期上下文，注入到 Agent 用户提示词中
 * @param characterType 角色类型：'historical' 或 'fictional'
 *   - 历史人物：不注入当前年份关键词，避免搜索现代衍生内容
 *   - 虚构角色：注入当前年份，用于搜索最新相关动态
 */
export function getDateContext(characterType?: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dateStr = `${year}年${month}月${day}日`;

  if (characterType === 'historical') {
    return `当前日期: ${dateStr}\n注意：该角色为历史人物，请仅搜索该人物生前发生的真实事件，严禁搜索或收集现代衍生内容（如展览、纪念活动、纪录片、学术研究等）。`;
  }

  const prevYear = year - 1;
  return `当前日期: ${dateStr}\n时效性搜索时请使用当前年份 ${year} 和前一年份 ${prevYear} 作为关键词。`;
}
