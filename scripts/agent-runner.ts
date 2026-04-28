import { initDatabase, closeDb } from '@shentan/core';
import { runOrchestrator, type OrchestratorResult } from '@shentan/agents';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 确保 .env 环境变量已加载
function loadEnvFile() {
  // runner.ts 设置 cwd 为 monorepo 根目录，优先使用 process.cwd()
  const cwd = process.cwd();
  const searchDirs = [cwd];

  // 备用：从脚本位置向上查找
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
