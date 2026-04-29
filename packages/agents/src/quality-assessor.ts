import type { QualityConfig } from './config/types.js';
import { DEFAULT_QUALITY_CONFIG } from './config/types.js';

export interface RoundQuality {
  roundNumber: number;
  newEventsCount: number;
  totalEventsCount: number;
}

/**
 * 评估当前轮次质量并决定是否继续
 */
export function shouldContinue(qualities: RoundQuality[], config: Partial<QualityConfig>): boolean {
  const cfg = { ...DEFAULT_QUALITY_CONFIG, ...config };

  // 不足最少轮次，必须继续
  if (qualities.length < cfg.minExploreRounds) return true;

  // 达到最大轮次，停止
  if (qualities.length >= cfg.maxExploreRounds) return false;

  // 检查连续低新增轮次
  const recent = qualities.slice(-cfg.consecutiveDryRounds);
  if (recent.length >= cfg.consecutiveDryRounds) {
    const allDry = recent.every((q) => q.newEventsCount < cfg.convergenceThreshold);
    if (allDry) return false;
  }

  return true;
}

/**
 * 格式化质量报告
 */
export function formatQualityReport(qualities: RoundQuality[]): string {
  if (qualities.length === 0) return '无轮次记录';
  const last = qualities[qualities.length - 1];
  const totalNew = qualities.reduce((sum, q) => sum + q.newEventsCount, 0);
  return `共 ${qualities.length} 轮，累计新增 ${totalNew} 事件，当前总事件数 ${last.totalEventsCount}`;
}
