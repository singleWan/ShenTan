// 用户界面中文标签映射

export const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  collecting: '收集中',
  completed: '已完成',
  failed: '失败',
};

export const CATEGORY_LABELS: Record<string, string> = {
  life: '个人生活',
  career: '职业生涯',
  political: '政治活动',
  conflict: '冲突争议',
  achievement: '成就荣誉',
  scandal: '丑闻争议',
  speech: '重要发言',
  policy: '政策法规',
  statement: '公开声明',
  rumor: '坊间传闻',
  other: '其他',
};

export const SENTIMENT_LABELS: Record<string, string> = {
  positive: '正面',
  negative: '负面',
  neutral: '中立',
  mixed: '复杂',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function sentimentLabel(sentiment: string): string {
  return SENTIMENT_LABELS[sentiment] ?? sentiment;
}

// 解析 source 字段，兼容旧数据（纯字符串）和新数据（JSON 数组）
export function formatSourceDisplay(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.join('、');
  } catch { /* 旧数据：纯字符串 */ }
  return raw;
}
