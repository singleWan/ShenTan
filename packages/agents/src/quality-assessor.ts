import type { LanguageModel } from 'ai';
import { generateText } from 'ai';
import type { QualityConfig } from './config/types.js';
import { DEFAULT_QUALITY_CONFIG } from './config/types.js';

export interface RoundQuality {
  roundNumber: number;
  newEventsCount: number;
  totalEventsCount: number;
  searchCount?: number;
  uniqueDomains?: number;
  contentQualityScore?: number;
  roundSummary?: string;
}

/**
 * 根据角色类型和进度计算自适应收敛阈值
 */
function getAdaptiveConfig(
  baseConfig: QualityConfig,
  characterType: string,
  currentRound: number,
  totalEvents: number,
): QualityConfig {
  const cfg = { ...baseConfig };

  // 按角色类型调整阈值
  if (characterType === 'fictional') {
    cfg.convergenceThreshold = Math.min(cfg.convergenceThreshold, 1);
  } else {
    cfg.convergenceThreshold = Math.max(cfg.convergenceThreshold, 2);
  }

  // 后半段轮次更严格（提前收敛）
  const progressRatio = currentRound / cfg.maxExploreRounds;
  if (progressRatio > 0.6) {
    cfg.consecutiveDryRounds = Math.max(1, cfg.consecutiveDryRounds - 1);
  }

  // 已有大量事件时更宽松（说明角色信息丰富）
  if (totalEvents > 50) {
    cfg.convergenceThreshold = Math.min(cfg.convergenceThreshold + 1, 5);
  }

  return cfg;
}

/**
 * 评估当前轮次质量并决定是否继续
 */
export function shouldContinue(
  qualities: RoundQuality[],
  config: Partial<QualityConfig>,
  characterType?: string,
): boolean {
  const baseCfg = { ...DEFAULT_QUALITY_CONFIG, ...config };
  const last = qualities[qualities.length - 1];
  if (!last) return true;

  // 自适应阈值
  const cfg = characterType
    ? getAdaptiveConfig(baseCfg, characterType, last.roundNumber, last.totalEventsCount)
    : baseCfg;

  // 不足最少轮次，必须继续
  if (qualities.length < cfg.minExploreRounds) return true;

  // 达到最大轮次，停止
  if (qualities.length >= cfg.maxExploreRounds) return false;

  // 内容质量极低时提前停止
  if (
    last.contentQualityScore !== undefined &&
    last.contentQualityScore < 0.3 &&
    qualities.length >= cfg.minExploreRounds
  ) {
    return false;
  }

  // 检查连续低新增轮次
  const recent = qualities.slice(-cfg.consecutiveDryRounds);
  if (recent.length >= cfg.consecutiveDryRounds) {
    const allDry = recent.every((q) => q.newEventsCount < cfg.convergenceThreshold);
    if (allDry) return false;
  }

  return true;
}

/**
 * LLM 评估本轮新增事件的内容质量
 */
export async function scoreContentQuality(
  model: LanguageModel,
  newEvents: Array<{
    title: string;
    description?: string | null;
    category?: string | null;
    importance?: number | null;
  }>,
): Promise<number> {
  if (newEvents.length === 0) return 0;

  const eventList = newEvents
    .slice(0, 20)
    .map(
      (e, i) =>
        `${i + 1}. [${e.category ?? 'other'}] ${e.title}${e.description ? ` - ${e.description.substring(0, 100)}` : ''} (重要度: ${e.importance ?? '?'})`,
    )
    .join('\n');

  const result = await generateText({
    model,
    prompt: `评估以下事件收集质量，返回 0-1 的分数。评估维度：
1. 描述完整性：是否有足够描述（权重 30%）
2. 信息价值：是否为有意义的事件（权重 30%）
3. 分类准确性：分类是否合理（权重 20%）
4. 来源多样性：是否覆盖不同领域（权重 20%）

仅返回一个 0-1 之间的数字，不要其他内容。

事件列表：
${eventList}`,
    maxOutputTokens: 10,
  });

  const score = parseFloat(result.text.trim());
  return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
}

/**
 * 格式化质量报告
 */
export function formatQualityReport(qualities: RoundQuality[]): string {
  if (qualities.length === 0) return '无轮次记录';
  const last = qualities[qualities.length - 1];
  const totalNew = qualities.reduce((sum, q) => sum + q.newEventsCount, 0);
  const parts = [
    `共 ${qualities.length} 轮，累计新增 ${totalNew} 事件，当前总事件数 ${last.totalEventsCount}`,
  ];
  if (last.searchCount) parts.push(`搜索 ${last.searchCount} 次`);
  if (last.uniqueDomains) parts.push(`来源域名 ${last.uniqueDomains} 个`);
  if (last.contentQualityScore !== undefined)
    parts.push(`内容质量 ${last.contentQualityScore.toFixed(2)}`);
  return parts.join('，');
}
