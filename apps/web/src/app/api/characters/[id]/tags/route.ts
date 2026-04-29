import { NextRequest, NextResponse } from 'next/server';
import { getDb, tags, characterTags } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const characterId = Number(id);

  try {
    const db = getDb();
    const result = db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(characterTags)
      .innerJoin(tags, eq(characterTags.tagId, tags.id))
      .where(eq(characterTags.characterId, characterId))
      .all();
    return NextResponse.json({ tags: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const characterId = Number(id);

  try {
    const body = await request.json();
    const { tagId } = body as { tagId: number };

    if (!tagId) {
      return NextResponse.json({ error: '缺少 tagId' }, { status: 400 });
    }

    const db = getDb();
    // 手动 upsert：先检查是否存在
    const existing = db
      .select()
      .from(characterTags)
      .where(
        and(eq(characterTags.characterId, characterId), eq(characterTags.tagId, tagId)),
      )
      .get();

    if (!existing) {
      db.insert(characterTags).values({ characterId, tagId }).run();
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失败' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const characterId = Number(id);

  try {
    const { searchParams } = new URL(request.url);
    const tagId = Number(searchParams.get('tagId'));

    if (!tagId) {
      return NextResponse.json({ error: '缺少 tagId' }, { status: 400 });
    }

    const db = getDb();
    db.delete(characterTags)
      .where(
        and(eq(characterTags.characterId, characterId), eq(characterTags.tagId, tagId)),
      )
      .run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失败' },
      { status: 500 },
    );
  }
}
