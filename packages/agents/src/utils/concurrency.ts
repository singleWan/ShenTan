/**
 * 并发执行异步任务池。
 * @param tasks 待执行的任务工厂函数数组（返回 Promise）
 * @param limit 最大并发数
 * @param signal 可选的取消信号
 * @returns 每个任务的结果（成功/失败 + 值/错误）
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  signal?: AbortSignal,
): Promise<Array<{ success: true; value: T } | { success: false; error: Error }>> {
  const results: Array<{ success: true; value: T } | { success: false; error: Error }> = new Array(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      if (signal?.aborted) {
        // 标记剩余任务为取消
        while (nextIndex < tasks.length) {
          results[nextIndex] = { success: false, error: new Error('任务已取消') };
          nextIndex++;
        }
        return;
      }

      const index = nextIndex++;
      try {
        const value = await tasks[index]!();
        results[index] = { success: true, value };
      } catch (e) {
        results[index] = { success: false, error: e instanceof Error ? e : new Error(String(e)) };
      }
    }
  }

  // 启动 min(limit, tasks.length) 个并发 worker
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => runNext(),
  );
  await Promise.all(workers);

  return results;
}
