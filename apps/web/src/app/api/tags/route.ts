import { NextRequest, NextResponse } from 'next/server';
import { getDb, tags, characterTags } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const db = getDb();
    const allTags = db.select().from(tags).orderBy(tags.name).all();
    return NextResponse.json({ tags: allTags });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color } = body as { name: string; color?: string };

    if (!name?.trim()) {
      return NextResponse.json({ error: '标签名不能为空' }, { status: 400 });
    }

    const db = getDb();
    const result = db.insert(tags).values({ name: name.trim(), color: color ?? null }).returning().get();
    return NextResponse.json({ tag: result });
  } catch (error) {
    if (String(error).includes('UNIQUE')) {
      return NextResponse.json({ error: '标签已存在' }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建失败' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = Number(searchParams.get('id'));

    if (!id) {
      return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    }

    const db = getDb();
    db.delete(characterTags).where(eq(characterTags.tagId, id)).run();
    db.delete(tags).where(eq(tags.id, id)).run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 },
    );
  }
}
