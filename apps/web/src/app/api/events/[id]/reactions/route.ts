import { startReactionTask, getTask, subscribe, cancelTask } from '@/lib/task/runner';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return Response.json({ error: '无效的事件ID' }, { status: 400 });
  }

  let body: {
    characterId?: number;
    characterName?: string;
    characterAliases?: string;
    eventContext?: {
      title: string;
      description?: string | null;
      dateText?: string | null;
      category?: string | null;
      importance?: number | null;
    };
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求体解析失败' }, { status: 400 });
  }

  if (!body.characterId || !body.characterName || !body.eventContext?.title) {
    return Response.json({ error: '缺少必要参数' }, { status: 400 });
  }

  const taskId = startReactionTask({
    characterId: body.characterId,
    characterName: body.characterName,
    characterAliases: body.characterAliases,
    eventContext: {
      id: eventId,
      title: body.eventContext.title,
      description: body.eventContext.description ?? null,
      dateText: body.eventContext.dateText ?? null,
      category: body.eventContext.category ?? null,
      importance: body.eventContext.importance ?? null,
    },
  });

  return Response.json({ taskId });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) {
    return Response.json({ error: '缺少 taskId' }, { status: 400 });
  }

  const task = getTask(taskId);
  if (!task) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const log of task.logs) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'log', ...log })}\n\n`));
      }
      if (task.status === 'completed' && task.result) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', result: task.result })}\n\n`));
        controller.close();
        return;
      }
      if (task.status === 'failed' && task.error) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: task.error })}\n\n`));
        controller.close();
        return;
      }

      const unsubscribe = subscribe(taskId, (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          if (data.type === 'complete' || data.type === 'error') {
            controller.close();
          }
        } catch {
          // stream closed
        }
      });

      request.signal.addEventListener('abort', () => {
        unsubscribe();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) {
    return Response.json({ error: '缺少 taskId' }, { status: 400 });
  }
  const ok = cancelTask(taskId);
  return Response.json({ success: ok });
}
