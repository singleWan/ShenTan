import { NextRequest, NextResponse } from 'next/server';
import { searchCharacters, searchEvents } from '@/lib/data';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q') ?? '';
  const type = searchParams.get('type') ?? 'all';

  if (!q.trim()) {
    return NextResponse.json({ characters: [], events: [] });
  }

  try {
    const [characterResults, eventResults] = await Promise.all([
      type === 'events' ? Promise.resolve([]) : searchCharacters(q),
      type === 'characters'
        ? Promise.resolve([])
        : searchEvents(q, {
            category: searchParams.get('category') ?? undefined,
            dateFrom: searchParams.get('dateFrom') ?? undefined,
            dateTo: searchParams.get('dateTo') ?? undefined,
            importance: searchParams.get('importance')
              ? Number(searchParams.get('importance')) || undefined
              : undefined,
          }),
    ]);

    return NextResponse.json({
      characters: characterResults,
      events: eventResults,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '搜索失败' },
      { status: 500 },
    );
  }
}
