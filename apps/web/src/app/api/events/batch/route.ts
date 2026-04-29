import { NextRequest, NextResponse } from 'next/server';
import { getDb, events, reactions, auditLog } from '@/lib/db';
import { inArray, sql } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ids } = body as { action: 'delete'; ids: number[] };

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: '单次最多操作 100 条' }, { status: 400 });
    }

    const db = getDb();

    if (action === 'delete') {
      // 删除关联反应
      db.delete(reactions)
        .where(sql`${reactions.eventId} IN (${ids.join(',')})`)
        .run();
      // 删除事件
      const result = db
        .delete(events)
        .where(sql`${events.id} IN (${ids.join(',')})`)
        .run();

      // 审计日志
      try {
        db.insert(auditLog)
          .values({
            action: 'batch_delete',
            entityType: 'event',
            details: JSON.stringify({ count: result.changes, ids }),
          })
          .run();
      } catch {
        // 审计日志失败不影响操作
      }

      return NextResponse.json({ deleted: result.changes });
    }

    return Response.json({ error: '不支持的操作' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失败' },
      { status: 500 },
    );
  }
}
