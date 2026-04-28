import { initDatabase, closeDb } from '@shentan/core';
import {
  runExpandEvents,
  runSingleReactionCollector,
  resolveConfig,
  getProviderConfig,
  getAgentModelConfig,
  createModel,
} from '@shentan/agents';

type ExpandPayload = {
  type: 'expand';
  characterId: number;
  characterName: string;
  characterAliases: string;
  mode: 'range' | 'around';
  afterEvent?: { id: number; title: string; dateText?: string | null; dateSortable?: string | null; description?: string | null };
  beforeEvent?: { id: number; title: string; dateText?: string | null; dateSortable?: string | null; description?: string | null };
  centerEvent?: { id: number; title: string; dateText?: string | null; dateSortable?: string | null; description?: string | null; category?: string | null; importance?: number | null };
  dbPath: string;
};

type ReactionPayload = {
  type: 'reaction';
  characterId: number;
  characterName: string;
  characterAliases: string;
  eventContext: {
    id: number;
    title: string;
    description?: string | null;
    dateText?: string | null;
    category?: string | null;
    importance?: number | null;
  };
  dbPath: string;
};

type IPCMessage =
  | { type: 'start-expand'; payload: ExpandPayload }
  | { type: 'start-reaction'; payload: ReactionPayload }
  | { type: 'cancel' };

function send(msg: { type: string; payload?: unknown }) {
  if (process.send) {
    process.send(msg);
  }
}

const abortController = new AbortController();

function parseAliases(aliasesStr?: string) {
  if (!aliasesStr) return undefined;
  try {
    const parsed = JSON.parse(aliasesStr);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

process.on('message', async (msg: IPCMessage) => {
  if (msg.type === 'cancel') {
    abortController.abort();
    return;
  }

  const payload = msg.type === 'start-expand' ? msg.payload : msg.payload;
  const dbPath = payload.dbPath;

  const onLog = (logMsg: string) => {
    send({ type: 'log', payload: { message: logMsg, timestamp: new Date().toISOString() } });
  };

  try {
    send({ type: 'status', payload: { status: 'running' } });

    const db = await initDatabase(dbPath);
    const config = resolveConfig();
    const aliases = parseAliases(payload.characterAliases);

    if (msg.type === 'start-expand') {
      const { characterId, characterName, mode, afterEvent, beforeEvent, centerEvent } = msg.payload;
      const agentCfg = getAgentModelConfig(config, 'event-explorer');
      const providerCfg = getProviderConfig(config, agentCfg.providerName);
      const model = createModel(providerCfg);

      let context;
      if (mode === 'range' && afterEvent && beforeEvent) {
        context = { mode: 'range' as const, afterEvent, beforeEvent };
      } else if (mode === 'around' && centerEvent) {
        context = { mode: 'around' as const, centerEvent };
      } else {
        throw new Error('无效的拓展参数');
      }

      const result = await runExpandEvents(
        model, db, characterId, characterName, context,
        agentCfg.maxIterations, agentCfg.maxTokens, onLog, aliases,
        abortController.signal,
      );
      send({ type: 'complete', payload: { success: result.success, message: result.message } });
    } else {
      const { characterId, characterName, eventContext } = msg.payload;
      const agentCfg = getAgentModelConfig(config, 'reaction-collector');
      const providerCfg = getProviderConfig(config, agentCfg.providerName);
      const model = createModel(providerCfg);

      const result = await runSingleReactionCollector(
        model, db, eventContext, characterName,
        agentCfg.maxIterations, agentCfg.maxTokens, onLog, aliases,
        abortController.signal,
      );
      send({ type: 'complete', payload: { success: result.success, message: result.message } });
    }
  } catch (error) {
    send({ type: 'error', payload: { message: (error as Error).message } });
  } finally {
    closeDb();
    process.exit(0);
  }
});

send({ type: 'ready' });
