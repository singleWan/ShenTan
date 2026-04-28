import { getAllTasks as getAllTasksFromStore, type UnifiedTaskType } from '@/lib/task-manager/store';
import { getTask as getCollectTask, recoverTasks } from '@/lib/collect/runner';
import { getTask as getBgTask } from '@/lib/task/runner';

// 服务器启动时恢复未完成任务
let recovered = false;
async function ensureRecovered() {
  if (!recovered) {
    recovered = true;
    await recoverTasks();
  }
}

// GET /api/tasks — 统一任务列表
export async function GET(request: Request) {
  await ensureRecovered();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as UnifiedTaskType | null;
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const tasks = getAllTasksFromStore({
    type: type ?? undefined,
    status: status ?? undefined,
    limit,
    offset,
  });

  // 合并内存中的实时状态（仅运行中任务）
  const enriched = tasks.map((task) => {
    if (!(task.status === 'starting' || task.status === 'running')) return task;

    if (task.type === 'collection') {
      const active = getCollectTask(task.id);
      if (active) {
        return {
          ...task,
          status: active.status,
          error: active.error ?? task.error,
          progress: active.progress ? JSON.stringify(active.progress) : task.progress,
        };
      }
    } else {
      const active = getBgTask(task.id);
      if (active) {
        return {
          ...task,
          status: active.status,
          error: active.error ?? task.error,
        };
      }
    }

    return task;
  });

  const runningCount = enriched.filter((t) =>
    t.status === 'starting' || t.status === 'running'
  ).length;

  return Response.json({
    tasks: enriched,
    total: enriched.length,
    runningCount,
  });
}
