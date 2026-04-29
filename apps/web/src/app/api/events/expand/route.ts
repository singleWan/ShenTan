import { startExpandTask, getTask, subscribe, cancelTask } from '@/lib/task/runner';
import { getBgTask } from '@/lib/task-manager/store';
import { rateLimitResponse } from '@/lib/shared/rate-limiter';

export async function POST(request: Request) {
  const limited = rateLimitResponse(request, 'expand');
  if (limited) return limited;
  let body: {
    characterId?: number;
    characterName?: string;
    characterAliases?: string;
    mode?: 'range' | 'around';
    afterEvent?: {
      id: number;
      title: string;
      dateText?: string | null;
      dateSortable?: string | null;
      description?: string | null;
    };
    beforeEvent?: {
      id: number;
      title: string;
      dateText?: string | null;
      dateSortable?: string | null;
      description?: string | null;
    };
    centerEvent?: {
      id: number;
      title: string;
      dateText?: string | null;
      dateSortable?: string | null;
      description?: string | null;
      category?: string | null;
      importance?: number | null;
    };
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求体解析失败' }, { status: 400 });
  }

  if (!body.characterId || !body.characterName || !body.mode) {
    return Response.json({ error: '缺少必要参数' }, { status: 400 });
  }

  if (body.mode === 'range' && (!body.afterEvent || !body.beforeEvent)) {
    return Response.json({ error: 'range 模式需要 afterEvent 和 beforeEvent' }, { status: 400 });
  }

  if (body.mode === 'around' && !body.centerEvent) {
    return Response.json({ error: 'around 模式需要 centerEvent' }, { status: 400 });
  }

  const taskId = startExpandTask({
    characterId: body.characterId,
    characterName: body.characterName,
    characterAliases: body.characterAliases,
    mode: body.mode,
    afterEvent: body.afterEvent,
    beforeEvent: body.beforeEvent,
    centerEvent: body.centerEvent,
  });

  return Response.json({ taskId });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) {
    return Response.json({ error: '缺少 taskId' }, { status: 400 });
  }

  // 优先从内存获取活跃任务
  const task = getTask(taskId);
  if (task) {
    return createExpandSseResponse(task, taskId, request);
  }

  // 内存中没有，从 DB 获取最终状态
  const dbTask = getBgTask(taskId);
  if (!dbTask) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }

  // 返回 DB 中的最终状态
  const encoder = new TextEncoder();
  const events: string[] = [];

  if (dbTask.status === 'completed' && dbTask.result) {
    try {
      events.push(
        `data: ${JSON.stringify({ type: 'complete', result: JSON.parse(dbTask.result) })}\n\n`,
      );
    } catch {
      events.push(`data: ${JSON.stringify({ type: 'complete', result: dbTask.result })}\n\n`);
    }
  } else if (dbTask.status === 'failed') {
    events.push(
      `data: ${JSON.stringify({ type: 'error', message: dbTask.error || '任务失败' })}\n\n`,
    );
  } else if (dbTask.status === 'cancelled') {
    events.push(`data: ${JSON.stringify({ type: 'cancelled' })}\n\n`);
  } else {
    events.push(`data: ${JSON.stringify({ type: 'error', message: '任务已中断，请重试' })}\n\n`);
  }

  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function createExpandSseResponse(
  task: NonNullable<ReturnType<typeof getTask>>,
  taskId: string,
  request: Request,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const log of task.logs) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'log', ...log })}\n\n`));
      }
      if (task.status === 'completed' && task.result) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'complete', result: task.result })}\n\n`),
        );
        controller.close();
        return;
      }
      if (task.status === 'failed' && task.error) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: task.error })}\n\n`),
        );
        controller.close();
        return;
      }
      if (task.status === 'cancelled') {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'cancelled' })}\n\n`));
        controller.close();
        return;
      }

      const unsubscribe = subscribe(taskId, (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          if (data.type === 'complete' || data.type === 'error' || data.type === 'cancelled') {
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
      Connection: 'keep-alive',
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) {
    return Response.json({ error: '缺少 taskId' }, { status: 400 });
  }
  const ok = cancelTask(taskId);
  return Response.json({ success: ok });
}
