import { eq, lt, sql } from 'drizzle-orm';
import type { Database } from './connection.js';
import { crawlCache } from './schema.js';

export interface CachedPage {
  id: number;
  url: string;
  contentHash: string;
  content: string;
  title: string | null;
  fetchedAt: string;
  expiresAt: string;
}

export async function getCachedPage(db: Database, url: string): Promise<CachedPage | null> {
  const now = new Date().toISOString();
  const result = await db.select().from(crawlCache)
    .where(sql`${crawlCache.url} = ${url} AND ${crawlCache.expiresAt} > ${now}`)
    .limit(1);
  return result[0] ?? null;
}

export async function setCachedPage(db: Database, input: {
  url: string;
  content: string;
  title?: string;
  ttlHours?: number;
}): Promise<void> {
  const ttl = input.ttlHours ?? (Number(process.env.CACHE_TTL ?? 24) || 24);
  const now = new Date();
  const contentHash = simpleHash(input.content);

  await db.insert(crawlCache).values({
    url: input.url,
    contentHash,
    content: input.content,
    title: input.title ?? null,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 3600_000).toISOString(),
  }).onConflictDoUpdate({
    target: crawlCache.url,
    set: {
      contentHash,
      content: input.content,
      title: input.title ?? null,
      fetchedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttl * 3600_000).toISOString(),
    },
  });
}

export async function clearExpiredCache(db: Database): Promise<number> {
  const now = new Date().toISOString();
  const result = await db.delete(crawlCache).where(lt(crawlCache.expiresAt, now));
  return result.rowsAffected ?? 0;
}

export async function clearAllCache(db: Database): Promise<void> {
  await db.delete(crawlCache);
}

export async function getCacheStats(db: Database): Promise<{
  total: number;
  expired: number;
  estimatedSizeKB: number;
}> {
  const now = new Date().toISOString();
  const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(crawlCache);
  const [expiredResult] = await db.select({ count: sql<number>`count(*)` }).from(crawlCache)
    .where(lt(crawlCache.expiresAt, now));
  const [sizeResult] = await db.select({ size: sql<number>`coalesce(sum(length(content)), 0)` }).from(crawlCache);

  return {
    total: totalResult?.count ?? 0,
    expired: expiredResult?.count ?? 0,
    estimatedSizeKB: Math.round((sizeResult?.size ?? 0) / 1024),
  };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}
