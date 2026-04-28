import { clearTasks } from '@/lib/task-manager/store';

// DELETE /api/tasks/clear — 批量清理历史任务
export async function DELETE(request: Request) {
  let body: { statuses?: string[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const statuses = body.statuses ?? ['completed', 'failed', 'cancelled'];
  const deleted = clearTasks(statuses);

  return Response.json({ deleted });
}
