import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif']);

function guessExtension(url: string, contentType?: string): string {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes('image/png')) return '.png';
    if (ct.includes('image/webp')) return '.webp';
    if (ct.includes('image/gif')) return '.gif';
    if (ct.includes('image/svg')) return '.svg';
    if (ct.includes('image/avif')) return '.avif';
  }

  try {
    const pathname = new URL(url).pathname;
    const ext = extname(pathname).toLowerCase().split('?')[0];
    if (ext && IMAGE_EXTENSIONS.has(ext)) return ext;
  } catch {
    /* ignore */
  }

  return '.jpg';
}

export async function downloadImage(
  url: string,
  imagesDir: string,
  filename: string,
): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ShentanBot/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? undefined;
  const ext = guessExtension(url, contentType);
  const fullFilename = `${filename}${ext}`;
  const filePath = resolve(imagesDir, fullFilename);

  await mkdir(imagesDir, { recursive: true });
  const buffer = await response.arrayBuffer();
  await writeFile(filePath, Buffer.from(buffer));

  return fullFilename;
}
