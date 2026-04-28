import { deleteReaction } from '@/lib/data';
import { apiHandler } from '@/lib/shared/api-handler';
import { rateLimitResponse } from '@/lib/shared/rate-limiter';

export const DELETE = apiHandler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const limited = rateLimitResponse(request, 'deletions');
  if (limited) return limited;

  const { id } = await params;
  const reactionId = parseInt(id, 10);
  if (isNaN(reactionId)) {
    return Response.json({ error: '无效的反应 ID' }, { status: 400 });
  }

  await deleteReaction(reactionId);
  return Response.json({ success: true });
});
