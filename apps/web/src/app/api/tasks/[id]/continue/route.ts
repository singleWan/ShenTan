import { getUnifiedTask } from '@/lib/task-manager/store';
import { continueCollection } from '@/lib/collect/runner';

// POST /api/tasks/[id]/continue — 继续未完成的任务
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = getUnifiedTask(id);
  if (!task) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }
  if (task.status !== 'failed' && task.status !== 'cancelled') {
    return Response.json({ error: '只能继续失败或已取消的任务' }, { status: 400 });
  }
  if (task.type !== 'collection') {
    return Response.json({ error: '仅支持继续收集类任务' }, { status: 400 });
  }
  if (!task.characterId) {
    return Response.json({ error: '角色信息不存在，无法继续。请使用重试功能重新开始。' }, { status: 400 });
  }

  const config = task.config ? JSON.parse(task.config) : {};

  try {
    const result = continueCollection({
      characterId: task.characterId,
      characterName: task.characterName,
      characterType: config.characterType ?? 'historical',
      source: config.source,
      maxRounds: config.maxRounds,
      aliases: config.aliases,
    });

    if (result.error) {
      return Response.json({ error: result.error }, { status: 429 });
    }

    return Response.json({ taskId: result.taskId });
  } catch (err) {
    return Response.json({
      error: `继续任务失败: ${err instanceof Error ? err.message : '未知错误'}`,
    }, { status: 500 });
  }
}
