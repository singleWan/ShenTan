import { initDatabase, closeDb, createLogWriter } from '@shentan/core';
import * as queries from '@shentan/core/queries';
import { runOrchestrator } from '@shentan/agents';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fork } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

config({ path: resolve(process.cwd(), '.env') });

export async function collectCommand(
  name: string,
  options: {
    type?: string;
    source?: string;
    rounds?: string;
    aliases?: string;
    db?: string;
    daemon?: boolean;
  },
) {
  const dbPath = options.db
    ? `file:${resolve(options.db)}`
    : process.env.DATABASE_PATH
      ? `file:${resolve(process.env.DATABASE_PATH)}`
      : 'file:./data/shentan.db';

  const characterType = (options.type === 'fictional' || options.type === 'fiction') ? 'fictional' : 'historical';
  const maxRounds = options.rounds ? parseInt(options.rounds, 10) : 5;
  const sourceList = options.source
    ? options.source.split(/[,，]/).map(s => s.trim()).filter(s => s.length > 0)
    : undefined;

  if (options.daemon) {
    return runDaemon(name, characterType, sourceList, maxRounds, options.aliases, dbPath);
  }

  console.log(`\n🔍 神探 - 角色事迹收集系统`);
  console.log(`角色: ${name}`);
  console.log(`类型: ${characterType === 'fictional' ? '虚构角色' : '历史人物'}`);
  if (sourceList) console.log(`来源: ${sourceList.join('、')}`);
  if (options.aliases) console.log(`用户别名: ${options.aliases}`);
  console.log(`拓展轮次: 最少 2 轮，最多 ${maxRounds} 轮（动态收敛）`);
  console.log(`数据库: ${dbPath}\n`);

  const db = await initDatabase(dbPath);

  try {
    // 创建任务记录
    const taskId = crypto.randomUUID();
    const logDir = resolve(process.cwd(), 'data', 'logs');
    const logWriter = createLogWriter(logDir, taskId);
    logWriter.write(`开始收集: ${name} (${characterType})`);

    await queries.createCollectionTask(db, {
      id: taskId,
      characterName: name,
      characterType: characterType as 'historical' | 'fictional',
      source: sourceList,
      maxRounds,
      aliases: options.aliases,
      logPath: logWriter.logPath,
    });

    const result = await runOrchestrator(db, {
      characterName: name,
      characterType: characterType as 'historical' | 'fictional',
      source: sourceList,
      maxExploreRounds: maxRounds,
      aliasesInput: options.aliases,
      onProgress: (p) => {
        queries.updateCollectionTask(db, taskId, { progress: p }).catch(() => {});
      },
    }, (msg) => {
      logWriter.write(msg);
    });

    // 更新任务状态
    await queries.updateCollectionTask(db, taskId, {
      characterId: result.characterId,
      status: result.success ? 'completed' : 'failed',
      completedAt: new Date().toISOString(),
      result: JSON.stringify(result),
    });

    logWriter.write(`收集完成: 事件 ${result.totalEvents}, 反应 ${result.totalReactions}`);

    console.log('\n📊 收集结果:');
    console.log(`  角色ID: ${result.characterId}`);
    console.log(`  成功: ${result.success ? '是' : '否'}`);
    console.log(`  总事件: ${result.totalEvents}`);
    console.log(`  总反应: ${result.totalReactions}`);
    console.log(`  日志: ${logWriter.logPath}`);
    console.log('\n⏱ 各阶段耗时:');
    for (const stage of result.stages) {
      console.log(`  ${stage.stage}: ${(stage.duration / 1000).toFixed(1)}s ${stage.success ? '✓' : '✗'}`);
    }
  } finally {
    closeDb();
  }
}

async function runDaemon(
  name: string,
  characterType: string,
  sourceList: string[] | undefined,
  maxRounds: number,
  aliases: string | undefined,
  dbPath: string,
) {
  const taskId = crypto.randomUUID();
  const logDir = resolve(process.cwd(), 'data', 'logs');
  const pidsDir = resolve(process.cwd(), 'data', 'pids');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  if (!existsSync(pidsDir)) mkdirSync(pidsDir, { recursive: true });

  // 创建任务记录
  const db = await initDatabase(dbPath);
  try {
    await queries.createCollectionTask(db, {
      id: taskId,
      characterName: name,
      characterType: characterType as 'historical' | 'fictional',
      source: sourceList,
      maxRounds,
      aliases,
    });
  } finally {
    closeDb();
  }

  // 构建参数
  const args = [
    '--import', 'tsx',
    resolve(process.cwd(), 'scripts/agent-runner.ts'),
  ];

  const child = fork(resolve(process.cwd(), 'scripts/agent-runner.ts'), [], {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env },
    cwd: process.cwd(),
    stdio: 'pipe',
    detached: true,
  });

  // 写入 PID 文件
  const { writeFileSync } = await import('node:fs');
  writeFileSync(resolve(pidsDir, `${taskId}.pid`), String(child.pid));

  // 启动任务
  child.send({
    type: 'start',
    payload: {
      characterName: name,
      characterType,
      source: sourceList,
      maxRounds,
      aliases,
      dbPath,
      logDir,
      taskId,
    },
  });

  child.unref();

  console.log(`\n🚀 后台任务已启动`);
  console.log(`  任务ID: ${taskId}`);
  console.log(`  PID: ${child.pid}`);
  console.log(`  日志: ${resolve(logDir, `${taskId}.log`)}`);
  console.log(`\n查看任务: shentan tasks show ${taskId}`);
  console.log(`查看日志: shentan tasks logs ${taskId}`);
}
