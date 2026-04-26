import { NextRequest, NextResponse } from 'next/server';
import { deleteCharacter, getCharacter } from '@/lib/data';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const characterId = parseInt(id, 10);
  if (isNaN(characterId)) {
    return NextResponse.json({ error: '无效的角色 ID' }, { status: 400 });
  }

  const character = await getCharacter(characterId);
  if (!character) {
    return NextResponse.json({ error: '角色不存在' }, { status: 404 });
  }

  await deleteCharacter(characterId);
  return NextResponse.json({ success: true });
}
