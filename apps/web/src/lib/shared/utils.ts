import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';

// 从 apps/web 向上查找 monorepo 根目录
export function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== '/') {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return startDir;
}

export const MONOREPO_ROOT = findMonorepoRoot(resolve(process.cwd()));

export function getDbPath(): string {
  const raw = process.env.DATABASE_PATH ?? './data/shentan.db';
  if (raw.startsWith('file:')) return raw;
  return `file:${resolve(MONOREPO_ROOT, raw)}`;
}

export function getLogDir(): string {
  return resolve(MONOREPO_ROOT, 'data', 'logs');
}

export function getMaxConcurrent(): number {
  return parseInt(process.env.MAX_CONCURRENT_TASKS ?? '3', 10);
}
