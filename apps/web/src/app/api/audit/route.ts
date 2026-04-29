import { NextRequest, NextResponse } from 'next/server';
import { getDb, auditLog } from '@/lib/db';
import { desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 50, 200);
    const logs = db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit).all();
    return NextResponse.json({ logs });
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
    const { action, entityType, entityId, details } = body as {
      action: string;
      entityType: string;
      entityId?: number;
      details?: string;
    };

    if (!action || !entityType) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const db = getDb();
    db.insert(auditLog)
      .values({
        action,
        entityType,
        entityId: entityId ?? null,
        details: details ?? null,
      })
      .run();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '记录失败' },
      { status: 500 },
    );
  }
}
