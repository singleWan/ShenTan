import { initDatabase, closeDb } from '@shentan/core';
import { runOrchestrator, type OrchestratorResult } from '@shentan/agents';

interface StartPayload {
  characterName: string;
  characterType: 'historical' | 'fictional';
  source?: string;
  maxRounds?: number;
  aliases?: string;
  dbPath: string;
}

type IPCMessage =
  | { type: 'start'; payload: StartPayload }
  | { type: 'cancel' };

function send(msg: { type: string; payload?: unknown }) {
  if (process.send) {
    process.send(msg);
  }
}

process.on('message', async (msg: IPCMessage) => {
  if (msg.type === 'start') {
    const { characterName, characterType, source, maxRounds, aliases, dbPath } = msg.payload;

    const onLog = (logMsg: string) => {
      send({ type: 'log', payload: { message: logMsg, timestamp: new Date().toISOString() } });
    };

    try {
      send({ type: 'status', payload: { status: 'running' } });

      const db = await initDatabase(dbPath);
      const result: OrchestratorResult = await runOrchestrator(db, {
        characterName,
        characterType,
        source,
        maxExploreRounds: maxRounds ?? 5,
        aliasesInput: aliases,
      }, onLog);

      send({ type: 'complete', payload: result });
    } catch (error) {
      send({ type: 'error', payload: { message: (error as Error).message } });
    } finally {
      closeDb();
      process.exit(0);
    }
  }

  if (msg.type === 'cancel') {
    send({ type: 'error', payload: { message: '任务已取消' } });
    process.exit(0);
  }
});

send({ type: 'ready' });
