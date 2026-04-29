import { NextRequest, NextResponse } from 'next/server';
import { getCharacterRelations } from '@/lib/data';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const characterId = searchParams.get('characterId');

  if (!characterId) {
    return NextResponse.json({ error: '缺少 characterId 参数' }, { status: 400 });
  }

  try {
    const relations = await getCharacterRelations(Number(characterId));
    return NextResponse.json({ relations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 },
    );
  }
}
