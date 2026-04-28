/**
 * 基于内存的滑动窗口限流器。
 * 适用于单实例部署场景，重启后计数重置。
 */

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();

/** 清理过期窗口（防止内存泄漏） */
function cleanup(key: string, windowMs: number) {
  const entry = windows.get(key);
  if (!entry) return;
  const cutoff = Date.now() - windowMs;
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);
  if (entry.timestamps.length === 0) windows.delete(key);
}

/**
 * 检查请求是否在限流范围内。
 * @param key 限流键（通常为 IP 或用户标识）
 * @param limit 窗口内最大请求数
 * @param windowMs 窗口大小（毫秒）
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  cleanup(key, windowMs);

  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }

  const now = Date.now();
  const cutoff = now - windowMs;
  const recentRequests = entry.timestamps.filter(t => t > cutoff);

  if (recentRequests.length >= limit) {
    const oldestInWindow = recentRequests[0]!;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestInWindow + windowMs,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - recentRequests.length - 1,
    resetAt: now + windowMs,
  };
}

/** 从请求中提取客户端 IP */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return '127.0.0.1';
}

/** 预定义限流规则 */
export const RATE_LIMITS = {
  /** 角色收集：1次/分钟（重操作） */
  collect: { limit: 1, windowMs: 60_000 },
  /** 事件拓展：3次/分钟 */
  expand: { limit: 3, windowMs: 60_000 },
  /** 反应收集：3次/分钟 */
  reactions: { limit: 3, windowMs: 60_000 },
  /** 删除操作：10次/分钟 */
  deletions: { limit: 10, windowMs: 60_000 },
} as const;

export type RateLimitOperation = keyof typeof RATE_LIMITS;

/**
 * 检查请求是否超出限流，超出则返回 429 Response，否则返回 null。
 * 在 API 路由 handler 开头调用，early return 即可。
 */
export function rateLimitResponse(req: Request, operation: RateLimitOperation): Response | null {
  const rule = RATE_LIMITS[operation];
  const ip = getClientIp(req);
  const result = checkRateLimit(`${ip}:${operation}`, rule.limit, rule.windowMs);
  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return Response.json(
      { error: '请求过于频繁，请稍后再试', resetAt: result.resetAt },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    );
  }
  return null;
}
