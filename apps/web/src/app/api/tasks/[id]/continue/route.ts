import { getUnifiedTask } from '@/lib/task-manager/store';
import { resumeCollection } from '@/lib/collect/runner';
import { resumeBgTask } from '@/lib/task/runner';

// POST /api/tasks/[id]/continue — 继续中断/失败/取消的任务
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = getUnifiedTask(id);
  if (!task) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }
  if (task.status !== 'failed' && task.status !== 'cancelled' && task.status !== 'interrupted') {
    return Response.json({ error: '只能继续失败、已取消或已中断的任务' }, { status: 400 });
  }

  try {
    if (task.type === 'collection') {
      const result = await resumeCollection(id);
      if (result.error) {
        return Response.json({ error: result.error }, { status: 429 });
      }
      return Response.json({ taskId: result.taskId });
    } else {
      // expand-events / collect-reactions
      const result = resumeBgTask(id);
      if (result.error) {
        return Response.json({ error: result.error }, { status: 429 });
      }
      return Response.json({ taskId: result.taskId });
    }
  } catch (err) {
    return Response.json(
      {
        error: `继续任务失败: ${err instanceof Error ? err.message : '未知错误'}`,
      },
      { status: 500 },
    );
  }
}
