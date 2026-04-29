import { NextResponse } from 'next/server';
import { getRelationGraph } from '@/lib/data';

export async function GET() {
  try {
    const graph = await getRelationGraph();
    return NextResponse.json(graph);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询失败' },
      { status: 500 },
    );
  }
}
