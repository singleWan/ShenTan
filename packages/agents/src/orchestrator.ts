import type { LanguageModel } from 'ai';
import type { Database, CharacterAlias, CollectionTaskProgress } from '@shentan/core';
import * as queries from '@shentan/core/queries';
import { runBiographer } from './biographer.js';
import { runEventExplorer } from './event-explorer.js';
import { runStatementCollector } from './statement-collector.js';
import { runReactionCollectorForEvent } from './reaction-collector.js';
import { resolveAliases, mergeAliases, parseUserAliases } from './alias-resolver.js';
import { resolveConfig, getProviderConfig, getAgentModelConfig } from './config/loader.js';
import type { ShentanConfig, QualityConfig } from './config/types.js';
import { DEFAULT_QUALITY_CONFIG } from './config/types.js';
import { createModel } from './provider/factory.js';
import { createResilientModel } from './utils/resilient-model.js';
import { getDefaultSearchManager } from '@shentan/crawler';
import { shouldContinue, formatQualityReport, type RoundQuality } from './quality-assessor.js';

export interface OrchestratorOptions {
  characterName: string;
  characterType: 'historical' | 'fictional';
  source?: string[];
  maxExploreRounds?: number;
  skipStatementCollection?: boolean;
  dbPath?: string;
  config?: ShentanConfig;
  userAliases?: CharacterAlias[];
  aliasesInput?: string;
  onProgress?: (progress: CollectionTaskProgress) => void;
}

export interface OrchestratorResult {
  characterId: number;
  success: boolean;
  totalEvents: number;
  totalReactions: number;
  stages: Array<{
    stage: string;
    success: boolean;
    message: string;
    duration: number;
  }>;
}

function createAgentModel(config: ShentanConfig, agentName: string, onLog?: (msg: string) => void): { model: LanguageModel; maxIterations: number; maxOutputTokens: number } {
  const { providerName, maxIterations, maxTokens } = getAgentModelConfig(config, agentName);
  const providerCfg = getProviderConfig(config, providerName);
  const baseModel = createModel(providerCfg);
  const model = createResilientModel(baseModel, {
    retry: config.retry,
    throttle: config.throttle,
  }, onLog);
  return { model, maxIterations, maxOutputTokens: maxTokens };
}

export async function runOrchestrator(
  db: Database,
  options: OrchestratorOptions,
  onLog?: (msg: string) => void,
): Promise<OrchestratorResult> {
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  const config = options.config ?? resolveConfig();

  // 初始化搜索引擎管理器（传入 SearXNG 配置）
  if (config.searxng?.enabled !== false) {
    getDefaultSearchManager(config.searxng?.baseUrl ?? 'http://localhost:8080');
  }

  // 合并质量配置
  const qualityConfig: QualityConfig = {
    ...DEFAULT_QUALITY_CONFIG,
    ...config.quality,
    // maxExploreRounds 优先使用显式传入值
    maxExploreRounds: options.maxExploreRounds
      ?? config.quality?.maxExploreRounds
      ?? DEFAULT_QUALITY_CONFIG.maxExploreRounds,
  };

  const totalStages = (options.skipStatementCollection ? 3 : 4) + (qualityConfig.maxExploreRounds ?? 5);
  const progress = (p: Omit<CollectionTaskProgress, 'totalStages'>) => {
    options.onProgress?.({ ...p, totalStages });
  };

  const bioCfg = createAgentModel(config, 'biographer', log);
  const exploreCfg = createAgentModel(config, 'event-explorer', log);
  const statementCfg = createAgentModel(config, 'statement-collector', log);
  const reactionCfg = createAgentModel(config, 'reaction-collector', log);

  const stages: OrchestratorResult['stages'] = [];

  // 创建角色记录
  const character = await queries.createCharacter(db, {
    name: options.characterName,
    type: options.characterType,
    source: options.source,
  });

  await queries.updateCharacterStatus(db, character.id, 'collecting');

  log(`\n${'='.repeat(60)}`);
  log(`开始收集: ${options.characterName} (ID: ${character.id})`);
  log(`类型: ${options.characterType === 'fictional' ? '虚构角色' : '历史人物'}`);
  log(`AI Provider: ${config.default} / ${config.providers[config.default]?.model}`);
  log(`事件拓展: 最少 ${qualityConfig.minExploreRounds} 轮，最多 ${qualityConfig.maxExploreRounds} 轮（动态收敛）`);
  log(`${'='.repeat(60)}\n`);

  // 预处理: 解析并合并别名
  let aliases: CharacterAlias[] = [];

  // 1. 解析用户输入的别名
  const userInputAliases: CharacterAlias[] = options.userAliases
    ?? (options.aliasesInput ? parseUserAliases(options.aliasesInput) : []);

  if (userInputAliases.length > 0) {
    log(`用户提供 ${userInputAliases.length} 个别名: ${userInputAliases.map(a => a.name).join('、')}`);
  }

  // 2. AI 解析别名
  try {
    log('--- 预处理: 解析角色别名 ---');
    const aiAliases = await resolveAliases(bioCfg.model, options.characterName, options.characterType, options.source);
    if (aiAliases.length > 0) {
      log(`AI 解析到 ${aiAliases.length} 个别名: ${aiAliases.map(a => a.name).join('、')}`);
    } else {
      log('AI 未解析到别名');
    }

    // 3. 合并（用户优先）
    aliases = mergeAliases(userInputAliases, aiAliases);
  } catch (e) {
    log(`别名解析失败（非致命）: ${(e as Error).message}`);
    aliases = userInputAliases;
  }

  if (aliases.length > 0) {
    await queries.updateCharacterAliases(db, character.id, aliases);
    log(`最终使用 ${aliases.length} 个别名: ${aliases.map(a => `${a.name}${a.source === 'user' ? '(用户)' : '(AI)'}`).join('、')}`);
  } else {
    log('无别名，将使用原始名称搜索');
  }

  // 阶段 1: 生平采集
  const bioStart = Date.now();
  log('--- 阶段 1: 生平事迹采集 ---');
  progress({ stage: 'biographer', stageIndex: 0, message: '生平事迹采集' });
  const bioResult = await runBiographer(
    bioCfg.model, db, character.id, options.characterName, options.characterType,
    bioCfg.maxIterations, bioCfg.maxOutputTokens, log, aliases, options.source,
  );
  stages.push({
    stage: 'biographer',
    success: bioResult.success,
    message: bioResult.message.substring(0, 200),
    duration: Date.now() - bioStart,
  });

  if (!bioResult.success) {
    await queries.updateCharacterStatus(db, character.id, 'failed');
    return { characterId: character.id, success: false, totalEvents: 0, totalReactions: 0, stages };
  }

  // 阶段 2: 事件拓展（动态质量驱动轮次）
  const roundQualities: RoundQuality[] = [];
  let prevEventCount = (await queries.getEvents(db, { characterId: character.id })).length;
  let round = 0;

  while (true) {
    round++;
    const exploreStart = Date.now();
    log(`\n--- 阶段 2.${round}: 事件拓展 (第 ${round} 轮) ---`);
    progress({ stage: 'event-explorer', stageIndex: round, roundIndex: round, maxRounds: qualityConfig.maxExploreRounds, eventsCount: prevEventCount, message: `事件拓展第 ${round} 轮` });

    const exploreResult = await runEventExplorer(
      exploreCfg.model, db, character.id, options.characterName, options.characterType, round,
      exploreCfg.maxIterations, exploreCfg.maxOutputTokens, log, aliases, options.source,
    );

    // 评估本轮质量
    const currentEventCount = (await queries.getEvents(db, { characterId: character.id })).length;
    const newEvents = Math.max(0, currentEventCount - prevEventCount);
    const quality: RoundQuality = {
      roundNumber: round,
      newEventsCount: newEvents,
      totalEventsCount: currentEventCount,
    };
    roundQualities.push(quality);

    log(`第 ${round} 轮完成: 新增 ${newEvents} 个事件，总计 ${currentEventCount} 个`);

    stages.push({
      stage: `event-explorer-round-${round}`,
      success: exploreResult.success,
      message: exploreResult.message.substring(0, 200),
      duration: Date.now() - exploreStart,
    });

    prevEventCount = currentEventCount;

    // 判断是否继续
    if (!shouldContinue(roundQualities, qualityConfig)) {
      log(`动态收敛: ${formatQualityReport(roundQualities)}，停止拓展`);
      break;
    }
  }

  // 阶段 3: 发言/政策/声明专项收集
  if (!options.skipStatementCollection) {
    const statementStart = Date.now();
    log('\n--- 阶段 3: 发言/政策/声明收集 ---');
    progress({ stage: 'statement-collector', stageIndex: qualityConfig.maxExploreRounds! + 1, message: '发言/政策/声明收集' });
    const statementResult = await runStatementCollector(
      statementCfg.model, db, character.id, options.characterName, options.characterType,
      statementCfg.maxIterations, statementCfg.maxOutputTokens, log, aliases, options.source,
    );
    stages.push({
      stage: 'statement-collector',
      success: statementResult.success,
      message: statementResult.message.substring(0, 200),
      duration: Date.now() - statementStart,
    });
  }

  // 阶段 4: 逐事件反应收集
  const reactionStart = Date.now();
  const reactionStageIndex = (options.skipStatementCollection ? 2 : 3) + (qualityConfig.maxExploreRounds ?? 5);
  log('\n--- 阶段 4: 逐事件各方反应收集 ---');
  const eventsForReaction = await queries.getEvents(db, { characterId: character.id, minImportance: 3 });
  log(`共 ${eventsForReaction.length} 个事件 (importance >= 3) 需要收集反应`);
  progress({ stage: 'reaction-collector', stageIndex: reactionStageIndex, eventsCount: eventsForReaction.length, message: `各方反应收集 (${eventsForReaction.length} 个事件)` });

  let reactionSuccessCount = 0;
  let reactionFailCount = 0;
  for (let i = 0; i < eventsForReaction.length; i++) {
    const evt = eventsForReaction[i];
    const evtStart = Date.now();
    log(`\n[ReactionCollector] 事件 ${i + 1}/${eventsForReaction.length}: "${evt.title}" (ID: ${evt.id})`);

    try {
      const evtResult = await runReactionCollectorForEvent({
        model: reactionCfg.model,
        db,
        characterId: character.id,
        characterName: options.characterName,
        characterType: options.characterType,
        event: evt,
        maxIterations: reactionCfg.maxIterations,
        maxOutputTokens: reactionCfg.maxOutputTokens,
        onLog: log,
        aliases,
        source: options.source,
      });

      const evtReactions = await queries.getReactionsForEvent(db, evt.id);
      log(`[ReactionCollector] 事件 "${evt.title}" 完成: ${evtReactions.length} 条反应 (${Date.now() - evtStart}ms)`);

      stages.push({
        stage: `reaction-collector-event-${evt.id}`,
        success: evtResult.success,
        message: evtResult.message.substring(0, 200),
        duration: Date.now() - evtStart,
      });
      reactionSuccessCount++;
    } catch (e) {
      const msg = (e as Error).message;
      log(`[ReactionCollector] 事件 "${evt.title}" 收集失败: ${msg}`);
      stages.push({
        stage: `reaction-collector-event-${evt.id}`,
        success: false,
        message: msg.substring(0, 200),
        duration: Date.now() - evtStart,
      });
      reactionFailCount++;
    }
  }

  log(`\n反应收集汇总: ${reactionSuccessCount} 个事件成功, ${reactionFailCount} 个失败, 总耗时 ${Date.now() - reactionStart}ms`);

  // 统计结果
  const allEvents = await queries.getEvents(db, { characterId: character.id });
  let totalReactions = 0;
  for (const evt of allEvents) {
    const r = await queries.getReactionsForEvent(db, evt.id);
    totalReactions += r.length;
  }

  const success = allEvents.length >= 5;
  await queries.updateCharacterStatus(db, character.id, success ? 'completed' : 'failed');

  log(`\n${'='.repeat(60)}`);
  log(`收集完成: ${options.characterName}`);
  log(`总事件数: ${allEvents.length}`);
  log(`总反应数: ${totalReactions}`);
  log(`事件拓展: ${formatQualityReport(roundQualities)}`);
  log(`状态: ${success ? '成功' : '失败（事件太少）'}`);
  log(`${'='.repeat(60)}\n`);

  return {
    characterId: character.id,
    success,
    totalEvents: allEvents.length,
    totalReactions,
    stages,
  };
}
