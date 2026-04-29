import { initDatabase, closeDb, queries } from '@shentan/core';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

config({ path: resolve(process.cwd(), '.env') });

function getDbPath(dbOption?: string): string {
  if (dbOption) return `file:${resolve(dbOption)}`;
  if (process.env.DATABASE_PATH) return `file:${resolve(process.env.DATABASE_PATH)}`;
  return 'file:./data/shentan.db';
}

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  running: '🔄',
  completed: '✅',
  failed: '❌',
  cancelled: '🚫',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export async function tasksCommand(
  subcommand: string | undefined,
  taskId: string | undefined,
  options: {
    status?: string;
    db?: string;
    lines?: string;
  },
) {
  const dbPath = getDbPath(options.db);
  const db = await initDatabase(dbPath);

  try {
    switch (subcommand) {
      case 'list':
        await listTasks(db, options.status);
        break;
      case 'show':
        if (!taskId) {
          console.error('请指定任务ID');
          process.exit(1);
        }
        await showTask(db, taskId);
        break;
      case 'logs':
        if (!taskId) {
          console.error('请指定任务ID');
          process.exit(1);
        }
        showLogs(db, taskId, options.lines ? parseInt(options.lines, 10) : 50);
        break;
      case 'cancel':
        if (!taskId) {
          console.error('请指定任务ID');
          process.exit(1);
        }
        await cancelTask(db, taskId);
        break;
      default:
        await listTasks(db, options.status);
    }
  } finally {
    closeDb();
  }
}

async function listTasks(db: import('@shentan/core').Database, statusFilter?: string) {
  const tasks = await queries.listCollectionTasks(db, {
    status: statusFilter as any,
    limit: 20,
  });

  if (tasks.length === 0) {
    console.log('暂无任务记录');
    return;
  }

  console.log('\n📋 采集任务列表\n');
  console.log('  ID(前8位)   状态     角色名称             创建时间');
  console.log('  ──────────  ──────   ──────────────────   ──────────────────');

  for (const t of tasks) {
    const id = t.id.substring(0, 8);
    const icon = STATUS_ICONS[t.status] ?? '❓';
    const label = STATUS_LABELS[t.status] ?? t.status;
    const name =
      t.characterName.length > 16 ? t.characterName.substring(0, 16) + '...' : t.characterName;
    const created = new Date(t.createdAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    console.log(`  ${id}  ${icon} ${label.padEnd(6)}   ${name.padEnd(18)}   ${created}`);
  }

  console.log(`\n  共 ${tasks.length} 条记录`);
  console.log('  使用 "shentan tasks show <taskId>" 查看详情');
  console.log('  使用 "shentan tasks logs <taskId>" 查看日志\n');
}

async function showTask(db: import('@shentan/core').Database, taskId: string) {
  const task = await queries.getCollectionTask(db, taskId);
  if (!task) {
    console.error(`未找到任务: ${taskId}`);
    process.exit(1);
  }

  const icon = STATUS_ICONS[task.status] ?? '❓';
  const label = STATUS_LABELS[task.status] ?? task.status;

  console.log(`\n📋 任务详情\n`);
  console.log(`  任务ID:    ${task.id}`);
  console.log(`  状态:      ${icon} ${label}`);
  console.log(`  角色名称:  ${task.characterName}`);
  console.log(`  角色类型:  ${task.characterType === 'fictional' ? '虚构角色' : '历史人物'}`);
  if (task.source) {
    try {
      const sources = JSON.parse(task.source);
      if (Array.isArray(sources)) console.log(`  来源作品:  ${sources.join('、')}`);
    } catch {
      console.log(`  来源作品:  ${task.source}`);
    }
  }
  if (task.characterId) console.log(`  角色ID:    ${task.characterId}`);
  console.log(`  最大轮次:  ${task.maxRounds ?? 5}`);
  console.log(`  创建时间:  ${new Date(task.createdAt).toLocaleString('zh-CN')}`);
  if (task.startedAt)
    console.log(`  开始时间:  ${new Date(task.startedAt).toLocaleString('zh-CN')}`);
  if (task.completedAt)
    console.log(`  完成时间:  ${new Date(task.completedAt).toLocaleString('zh-CN')}`);
  if (task.logPath) console.log(`  日志路径:  ${task.logPath}`);
  if (task.pid) console.log(`  PID:       ${task.pid}`);
  if (task.error) console.log(`  错误:      ${task.error}`);

  if (task.result) {
    try {
      const result = JSON.parse(task.result);
      console.log(`\n  📊 收集结果:`);
      console.log(`    事件数: ${result.totalEvents}`);
      console.log(`    反应数: ${result.totalReactions}`);
      if (result.stages) {
        for (const s of result.stages) {
          console.log(
            `    ${s.stage}: ${(s.duration / 1000).toFixed(1)}s ${s.success ? '✓' : '✗'}`,
          );
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (task.progress) {
    try {
      const p = JSON.parse(task.progress);
      console.log(`\n  📈 当前进度:`);
      console.log(`    阶段: ${p.message || p.stage} (${p.stageIndex + 1}/${p.totalStages})`);
      if (p.eventsCount !== undefined) console.log(`    事件: ${p.eventsCount}`);
      if (p.roundIndex !== undefined) console.log(`    轮次: ${p.roundIndex}/${p.maxRounds}`);
    } catch {
      /* ignore */
    }
  }

  console.log();
}

async function showLogs(db: import('@shentan/core').Database, taskId: string, lines: number) {
  const t = await queries.getCollectionTask(db, taskId);
  if (!t) {
    console.error(`未找到任务: ${taskId}`);
    process.exit(1);
  }

  const logPath = t.logPath ?? resolve(process.cwd(), 'data', 'logs', `${taskId}.log`);
  if (!existsSync(logPath)) {
    console.error(`日志文件不存在: ${logPath}`);
    process.exit(1);
  }

  const content = readFileSync(logPath, 'utf-8');
  const allLines = content.split('\n').filter((l) => l.length > 0);
  const tail = allLines.slice(-lines);

  console.log(`\n📄 日志 (最后 ${tail.length} 行)\n`);
  for (const line of tail) {
    console.log(`  ${line}`);
  }
  console.log();
}

async function cancelTask(db: import('@shentan/core').Database, taskId: string) {
  const task = await queries.getCollectionTask(db, taskId);
  if (!task) {
    console.error(`未找到任务: ${taskId}`);
    process.exit(1);
  }

  if (task.status !== 'running' && task.status !== 'pending') {
    console.error(`任务状态为 "${task.status}"，无法取消`);
    process.exit(1);
  }

  // 如果有 PID，尝试终止进程
  if (task.pid) {
    try {
      process.kill(task.pid, 'SIGTERM');
    } catch {
      // 进程可能已结束
    }
  }

  await queries.updateCollectionTask(db, taskId, {
    status: 'cancelled',
    completedAt: new Date().toISOString(),
    error: '用户取消',
  });

  console.log(`✅ 任务 ${taskId.substring(0, 8)} 已取消`);
}
