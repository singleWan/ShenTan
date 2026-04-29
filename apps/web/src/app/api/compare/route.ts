import { NextRequest, NextResponse } from 'next/server';
import { getDb, characters, events, characterRelations } from '@/lib/db';
import { eq, inArray, sql, or, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const ids = request.nextUrl.searchParams.get('ids');
    if (!ids) {
      return NextResponse.json({ error: '缺少 ids 参数' }, { status: 400 });
    }

    const characterIds = ids.split(',').map(Number).filter((n) => !isNaN(n));
    if (characterIds.length < 2 || characterIds.length > 6) {
      return NextResponse.json({ error: '需要 2-6 个角色ID' }, { status: 400 });
    }

    const db = getDb();

    // 获取角色信息
    const chars = db
      .select()
      .from(characters)
      .where(inArray(characters.id, characterIds))
      .all();

    if (chars.length !== characterIds.length) {
      return NextResponse.json({ error: '部分角色不存在' }, { status: 404 });
    }

    // 获取所有事件
    const allEvents = db
      .select()
      .from(events)
      .where(inArray(events.characterId, characterIds))
      .orderBy(sql`COALESCE(${events.dateSortable}, 'zzzz')`, events.createdAt)
      .all();

    // 获取角色间关系
    const relations = db
      .select()
      .from(characterRelations)
      .where(
        or(
          inArray(characterRelations.fromCharacterId, characterIds),
          inArray(characterRelations.toCharacterId, characterIds),
        ),
      )
      .all();

    // 颜色分配
    const colors = ['#00f0ff', '#7b2fff', '#00ff88', '#ffb800', '#ff003c', '#ff8800'];
    const colorMap = new Map(chars.map((c, i) => [c.id, colors[i % colors.length]]));

    return NextResponse.json({
      characters: chars.map((c) => ({
        ...c,
        color: colorMap.get(c.id),
      })),
      events: allEvents.map((e) => ({
        ...e,
        color: colorMap.get(e.characterId),
      })),
      relations: relations.map((r) => ({
        ...r,
        fromColor: colorMap.get(r.fromCharacterId),
        toColor: colorMap.get(r.toCharacterId),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 },
    );
  }
}
