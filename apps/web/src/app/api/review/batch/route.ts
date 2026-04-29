import { NextRequest, NextResponse } from 'next/server';
import { resolveReviewEvent, deleteEvent } from '@/lib/data';
import { getDb } from '@/lib/db';
import { auditLog } from '@/lib/db';
import { tags, characterTags, characters, events } from '@/lib/db';
import { eq, inArray } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventIds, action, mergeTargetId } = body as {
      eventIds: number[];
      action: 'keep' | 'merge' | 'delete';
      mergeTargetId?: number;
    };

    if (!eventIds?.length || !action) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    let processed = 0;
    const errors: string[] = [];

    for (const eventId of eventIds) {
      try {
        if (action === 'keep') {
          await resolveReviewEvent(eventId, 'keep');
        } else if (action === 'merge' && mergeTargetId) {
          await resolveReviewEvent(eventId, 'merge', mergeTargetId);
        } else if (action === 'delete') {
          // 记录审计日志
          const db = getDb();
          const evt = db.select({ title: events.title, category: events.category, characterId: events.characterId })
            .from(events)
            .where(eq(events.id, eventId))
            .get();
          if (evt) {
            db.insert(auditLog).values({
              action: 'batch_delete',
              entityType: 'event',
              entityId: eventId,
              details: JSON.stringify({ title: evt.title, category: evt.category, characterId: evt.characterId }),
            }).run();
          }
          await deleteEvent(eventId);
        }
        processed++;
      } catch (e) {
        errors.push(`事件 ${eventId}: ${(e as Error).message}`);
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '批量操作失败' },
      { status: 500 },
    );
  }
}
