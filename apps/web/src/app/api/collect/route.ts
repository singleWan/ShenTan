import { startCollection, getTask, subscribe, cancelTask } from '@/lib/collect/runner';
import { getTaskFromDb } from '@/lib/collect/task-store';

// POST /api/collect — 启动收集任务
export async function POST(request: Request) {
  let body: {
    characterName?: string;
    characterType?: string;
    source?: string[];
    maxRounds?: number;
    aliases?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '请求体解析失败' }, { status: 400 });
  }

  const characterName = body.characterName?.trim();
  if (!characterName) {
    return Response.json({ error: '角色名称不能为空' }, { status: 400 });
  }

  const characterType = body.characterType === 'fictional' ? 'fictional' : 'historical';
  const { taskId, error } = startCollection({
    characterName,
    characterType,
    source: body.source,
    maxRounds: body.maxRounds ?? 5,
    aliases: body.aliases,
  });

  if (error) {
    return Response.json({ error }, { status: 429 });
  }

  return Response.json({ taskId });
}

// GET /api/collect?taskId=xxx — SSE 进度流
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) {
    return Response.json({ error: '缺少 taskId' }, { status: 400 });
  }

  // 优先从内存获取活跃任务
  const task = getTask(taskId);
  if (task) {
    return createSseResponse(task, taskId, request);
  }

  // 内存中没有，从 DB 获取最终状态
  const dbTask = await getTaskFromDb(taskId);
  if (!dbTask) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }

  // 返回 DB 中的最终状态作为 SSE 事件
  const encoder = new TextEncoder();
  const events: string[] = [];

  if (dbTask.status === 'completed' && dbTask.result) {
    try {
      events.push(`data: ${JSON.stringify({ type: 'complete', result: JSON.parse(dbTask.result) })}\n\n`);
    } catch {
      events.push(`data: ${JSON.stringify({ type: 'complete', result: dbTask.result })}\n\n`);
    }
  } else if (dbTask.status === 'failed') {
    events.push(`data: ${JSON.stringify({ type: 'error', message: dbTask.error || '任务失败' })}\n\n`);
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
      'Connection': 'keep-alive',
    },
  });
}

function createSseResponse(task: ReturnType<typeof getTask>, taskId: string, request: Request): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      if (!task) { controller.close(); return; }
      // 回放已有日志
      for (const log of task.logs) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'log', ...log })}\n\n`));
      }
      // 回放进度
      if (task.progress) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'progress', progress: task.progress })}\n\n`));
      }
      // 如果已完成，直接发送结果
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
      if (task.status === 'cancelled') {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'cancelled' })}\n\n`));
        controller.close();
        return;
      }

      // 订阅后续更新
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
      'Connection': 'keep-alive',
    },
  });
}

// DELETE /api/collect?taskId=xxx — 取消任务
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  if (!taskId) {
    return Response.json({ error: '缺少 taskId' }, { status: 400 });
  }
  const ok = cancelTask(taskId);
  return Response.json({ success: ok });
}
