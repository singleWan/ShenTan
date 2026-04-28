import { deleteEvent, getEvent } from '@/lib/data';
import { apiHandler } from '@/lib/shared/api-handler';
import { rateLimitResponse } from '@/lib/shared/rate-limiter';

export const DELETE = apiHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const limited = rateLimitResponse(request, 'deletions');
  if (limited) return limited;

  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return Response.json({ error: '无效的事件 ID' }, { status: 400 });
  }

  const event = await getEvent(eventId);
  if (!event) {
    return Response.json({ error: '事件不存在' }, { status: 404 });
  }

  await deleteEvent(eventId);
  return Response.json({ success: true });
});
