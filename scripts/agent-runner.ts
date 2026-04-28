import { initDatabase, closeDb, createLogWriter } from '@shentan/core';
import { runOrchestrator, type OrchestratorResult } from '@shentan/agents';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 确保 .env 环境变量已加载
function loadEnvFile() {
  const cwd = process.cwd();
  const searchDirs = [cwd];

  try {
    const scriptDir = resolve(fileURLToPath(import.meta.url), '..');
    if (scriptDir !== cwd) searchDirs.push(scriptDir);
  } catch { /* ignore */ }

  for (const startDir of searchDirs) {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
      if (existsSync(resolve(dir, '.env'))) {
        const envPath = resolve(dir, '.env');
        const content = readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex === -1) continue;
          const key = trimmed.slice(0, eqIndex).trim();
          const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
        return;
      }
      const parent = resolve(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
  }
}

loadEnvFile();

interface StartPayload {
  characterName: string;
  characterType: 'historical' | 'fictional';
  source?: string[];
  maxRounds?: number;
  aliases?: string;
  dbPath: string;
  logDir?: string;
  taskId?: string;
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
    const { characterName, characterType, source, maxRounds, aliases, dbPath, logDir, taskId } = msg.payload;

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
        onProgress: (progress) => {
          send({ type: 'progress', payload: progress });
        },
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

  if (msg.type === 'cancel') {
    send({ type: 'error', payload: { message: '任务已取消' } });
    process.exit(0);
  }
});

send({ type: 'ready' });
