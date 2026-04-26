import { NextRequest, NextResponse } from 'next/server';
import { deleteReaction, getEventReactions, getEvent } from '@/lib/data';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reactionId = parseInt(id, 10);
  if (isNaN(reactionId)) {
    return NextResponse.json({ error: '无效的反应 ID' }, { status: 400 });
  }

  await deleteReaction(reactionId);
  return NextResponse.json({ success: true });
}
