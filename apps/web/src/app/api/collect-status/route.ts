import { getAllTasks } from '@/lib/collect/runner';

// GET /api/collect-status — 查询所有任务状态
export async function GET() {
  const tasks = getAllTasks();
  return Response.json({ tasks });
}
