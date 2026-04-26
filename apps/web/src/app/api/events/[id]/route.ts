import { NextRequest, NextResponse } from 'next/server';
import { deleteEvent, getEvent } from '@/lib/data';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return NextResponse.json({ error: '无效的事件 ID' }, { status: 400 });
  }

  const event = await getEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: '事件不存在' }, { status: 404 });
  }

  await deleteEvent(eventId);
  return NextResponse.json({ success: true });
}
