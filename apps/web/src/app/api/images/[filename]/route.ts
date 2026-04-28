import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

function getImagesDir(): string {
  const dbPath = process.env.DATABASE_PATH ?? './data/shentan.db';
  const cleanPath = dbPath.replace(/^file:/, '');
  return resolve(resolve(cleanPath), '..', 'images');
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  if (!filename || filename.includes('..') || filename.includes('/')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream';

  try {
    const filePath = resolve(getImagesDir(), filename);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 });
    }

    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
