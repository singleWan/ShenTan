import { initDatabase, closeDb, createLogWriter } from '@shentan/core';
import { runOrchestrator, type OrchestratorResult } from '@shentan/agents';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// 确保 .env 环境变量已加载
config({ path: resolve(process.cwd(), '.env') });

interface StartPayload {
  characterName: string;
  characterType: 'historical' | 'fictional';
  source?: string[];
  maxRounds?: number;
  aliases?: string;
  dbPath: string;
  logDir?: string;
  taskId?: string;
  existingCharacterId?: number;
}

type IPCMessage =
  | { type: 'start'; payload: StartPayload }
  | { type: 'cancel' };

function send(msg: { type: string; payload?: unknown }) {
  if (process.send) {
    process.send(msg);
  }
}

const abortController = new AbortController();

process.on('message', async (msg: IPCMessage) => {
  if (msg.type === 'cancel') {
    abortController.abort();
    return;
  }

  if (msg.type === 'start') {
    const { characterName, characterType, source, maxRounds, aliases, dbPath, logDir, taskId, existingCharacterId } = msg.payload;

    // 创建文件日志
    const logId = taskId ?? `${Date.now()}`;
    const logDirectory = logDir ?? resolve(process.cwd(), 'data', 'logs');
    let logWriter: ReturnType<typeof createLogWriter> | null = null;
    try {
      logWriter = createLogWriter(logDirectory, logId);
      logWriter.write(`开始收集: ${characterName} (${characterType})`);
    } catch (e) {
      console.error(`日志文件创建失败: ${(e as Error).message}`);
    }

    const onLog = (logMsg: string) => {
      send({ type: 'log', payload: { message: logMsg, timestamp: new Date().toISOString() } });
      logWriter?.write(logMsg);
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
        existingCharacterId,
        onProgress: (progress) => {
          send({ type: 'progress', payload: progress });
        },
        signal: abortController.signal,
      }, onLog);

      logWriter?.write(`收集完成: 事件 ${result.totalEvents}, 反应 ${result.totalReactions}`);
      send({ type: 'complete', payload: result });
    } catch (error) {
      const errMsg = (error as Error).message;
      logWriter?.write(`收集失败: ${errMsg}`);
      send({ type: 'error', payload: { message: errMsg } });
    } finally {
      closeDb();
      process.exit(0);
    }
  }
});

send({ type: 'ready' });
