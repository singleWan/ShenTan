import { getUnifiedTask, deleteUnifiedTask } from '@/lib/task-manager/store';
import { getTask as getCollectTask, cancelTask as cancelCollectTask } from '@/lib/collect/runner';
import { getTask as getBgTask, cancelTask as cancelBgTask } from '@/lib/task/runner';

// GET /api/tasks/[id] — 任务详情
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = getUnifiedTask(id);
  if (!task) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }

  if (task.type === 'collection') {
    const active = getCollectTask(id);
    if (active) {
      return Response.json({
        ...task,
        status: active.status,
        error: active.error ?? task.error,
        progress: active.progress ? JSON.stringify(active.progress) : task.progress,
        result: active.result ? JSON.stringify(active.result) : task.result,
        logs: active.logs,
      });
    }
  } else {
    const active = getBgTask(id);
    if (active) {
      return Response.json({
        ...task,
        status: active.status,
        error: active.error ?? task.error,
        logs: active.logs,
      });
    }
  }

  return Response.json(task);
}

// DELETE /api/tasks/[id] — 取消或删除任务
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = getUnifiedTask(id);
  if (!task) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }

  // 运行中任务先取消
  if (task.status === 'starting' || task.status === 'running') {
    if (task.type === 'collection') {
      cancelCollectTask(id);
    } else {
      cancelBgTask(id);
    }
  }

  // 从数据库删除
  deleteUnifiedTask(id);

  return Response.json({ success: true });
}
