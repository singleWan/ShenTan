import { deleteCharacter, getCharacter } from '@/lib/data';
import { apiHandler } from '@/lib/shared/api-handler';
import { rateLimitResponse } from '@/lib/shared/rate-limiter';

export const DELETE = apiHandler(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const limited = rateLimitResponse(request, 'deletions');
    if (limited) return limited;

    const { id } = await params;
    const characterId = parseInt(id, 10);
    if (isNaN(characterId)) {
      return Response.json({ error: '无效的角色 ID' }, { status: 400 });
    }

    const character = await getCharacter(characterId);
    if (!character) {
      return Response.json({ error: '角色不存在' }, { status: 404 });
    }

    await deleteCharacter(characterId);
    return Response.json({ success: true });
  },
);
