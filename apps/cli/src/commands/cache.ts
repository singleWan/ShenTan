import { getDb, closeDb, cache } from '@shentan/core';
import { initDatabase } from '@shentan/core';

export async function cacheCommand(subcommand: string) {
  const db = await initDatabase();

  try {
    switch (subcommand) {
      case 'stats': {
        const stats = await cache.getCacheStats(db);
        console.log(`缓存统计:`);
        console.log(`  总条目: ${stats.total}`);
        console.log(`  已过期: ${stats.expired}`);
        console.log(`  有效缓存: ${stats.total - stats.expired}`);
        console.log(`  估算大小: ${stats.estimatedSizeKB} KB`);
        break;
      }
      case 'clear': {
        const cleared = await cache.clearExpiredCache(db);
        console.log(`已清除 ${cleared} 条过期缓存`);
        break;
      }
      case 'clear-all': {
        await cache.clearAllCache(db);
        console.log('已清空全部缓存');
        break;
      }
      default:
        console.log(`未知子命令: ${subcommand}`);
        console.log('可用命令: stats, clear, clear-all');
    }
  } finally {
    closeDb();
  }
}
