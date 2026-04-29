import { NextRequest, NextResponse } from 'next/server';
import { getPendingReviewEvents, resolveReviewEvent } from '@/lib/data';

export async function GET() {
  try {
    const pending = await getPendingReviewEvents();
    return NextResponse.json({ events: pending });
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
    const { eventId, action, mergeTargetId } = body as {
      eventId: number;
      action: 'keep' | 'merge';
      mergeTargetId?: number;
    };

    if (!eventId || !action) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    await resolveReviewEvent(eventId, action, mergeTargetId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '操作失败' },
      { status: 500 },
    );
  }
}
