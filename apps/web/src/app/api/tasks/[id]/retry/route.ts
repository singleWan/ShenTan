import { getUnifiedTask } from '@/lib/task-manager/store';
import { startCollection } from '@/lib/collect/runner';
import { startExpandTask, startReactionTask } from '@/lib/task/runner';

// POST /api/tasks/[id]/retry — 重试失败任务
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = getUnifiedTask(id);
  if (!task) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }
  if (task.status !== 'failed') {
    return Response.json({ error: '只能重试失败的任务' }, { status: 400 });
  }

  let newTaskId: string;

  try {
    if (task.type === 'collection') {
      const config = task.config ? JSON.parse(task.config) : {};
      const result = startCollection({
        characterName: task.characterName,
        characterType: config.characterType ?? 'historical',
        source: config.source,
        maxRounds: config.maxRounds,
        aliases: config.aliases,
      });
      if (result.error) {
        return Response.json({ error: result.error }, { status: 429 });
      }
      newTaskId = result.taskId;
    } else if (task.type === 'expand-events') {
      const config = task.config ? JSON.parse(task.config) : {};
      newTaskId = startExpandTask({
        characterId: task.characterId!,
        characterName: task.characterName,
        mode: config.mode ?? 'around',
        afterEvent: config.afterEvent,
        beforeEvent: config.beforeEvent,
        centerEvent: config.centerEvent,
      });
    } else if (task.type === 'collect-reactions') {
      const config = task.config ? JSON.parse(task.config) : {};
      newTaskId = startReactionTask({
        characterId: task.characterId!,
        characterName: task.characterName,
        eventContext: config.eventContext,
      });
    } else {
      return Response.json({ error: '未知任务类型' }, { status: 400 });
    }
  } catch (err) {
    return Response.json({
      error: `重试失败: ${err instanceof Error ? err.message : '未知错误'}`,
    }, { status: 500 });
  }

  return Response.json({ taskId: newTaskId });
}
