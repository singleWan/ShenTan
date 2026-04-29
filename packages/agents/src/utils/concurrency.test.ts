import { describe, it, expect } from 'vitest';
import { runWithConcurrency } from './concurrency.js';

describe('runWithConcurrency', () => {
  it('按序执行所有任务', async () => {
    const order: number[] = [];
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => {
      order.push(n);
      return n * 2;
    });

    const results = await runWithConcurrency(tasks, 2);
    expect(results).toHaveLength(5);
    expect(results.every((r) => r.success)).toBe(true);
    expect(results.map((r) => (r.success ? r.value : 0))).toEqual([2, 4, 6, 8, 10]);
  });

  it('限制并发数', async () => {
    let running = 0;
    let maxRunning = 0;

    const tasks = Array.from({ length: 10 }, () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
      return true;
    });

    await runWithConcurrency(tasks, 3);
    expect(maxRunning).toBeLessThanOrEqual(3);
  });

  it('失败任务不影响其他任务', async () => {
    const tasks = [
      async () => 'ok',
      async () => {
        throw new Error('fail');
      },
      async () => 'also ok',
    ];

    const results = await runWithConcurrency(tasks, 2);
    expect(results[0]).toEqual({ success: true, value: 'ok' });
    expect(results[1].success).toBe(false);
    if (!results[1].success) expect(results[1].error.message).toBe('fail');
    expect(results[2]).toEqual({ success: true, value: 'also ok' });
  });

  it('空任务数组返回空结果', async () => {
    const results = await runWithConcurrency([], 3);
    expect(results).toEqual([]);
  });

  it('取消信号中止剩余任务', async () => {
    const controller = new AbortController();
    let completed = 0;

    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      if (i === 1) controller.abort(); // 第二个任务触发取消
      completed++;
      return i;
    });

    const results = await runWithConcurrency(tasks, 1, controller.signal);
    expect(completed).toBeLessThan(5);
    // 取消后的任务应标记为失败
    const cancelled = results.filter((r) => !r.success);
    expect(cancelled.length).toBeGreaterThan(0);
  });

  it('并发数大于任务数时不会报错', async () => {
    const tasks = [async () => 1, async () => 2];
    const results = await runWithConcurrency(tasks, 10);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
  });
});
