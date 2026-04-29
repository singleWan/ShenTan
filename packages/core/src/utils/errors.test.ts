import { describe, it, expect } from 'vitest';
import {
  ShentanError,
  ConfigError,
  DatabaseError,
  SearchError,
  ScrapeError,
  BrowserError,
  AgentError,
  ToolError,
  ProviderError,
  ValidationError,
  TimeoutError,
  AbortedError,
  isShentanError,
  toShentanError,
} from './errors.js';

describe('ShentanError', () => {
  it('基本属性正确', () => {
    const err = new ShentanError('AGENT_ERROR', '测试错误');
    expect(err.code).toBe('AGENT_ERROR');
    expect(err.message).toBe('测试错误');
    expect(err.name).toBe('ShentanError');
    expect(err.isRetryable).toBe(false);
  });

  it('支持 cause 和 context', () => {
    const cause = new Error('原始错误');
    const err = new ShentanError('DATABASE_ERROR', 'DB 失败', {
      cause,
      context: { table: 'events', operation: 'insert' },
    });
    expect(err.cause).toBe(cause);
    expect(err.context).toEqual({ table: 'events', operation: 'insert' });
  });

  it('toJSON 序列化', () => {
    const err = new ShentanError('VALIDATION_ERROR', '参数无效', { context: { field: 'name' } });
    const json = err.toJSON();
    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.message).toBe('参数无效');
    expect(json.context).toEqual({ field: 'name' });
  });
});

describe('isRetryable', () => {
  it('可重试错误', () => {
    expect(new ProviderError('rate limit').isRetryable).toBe(true);
    expect(new TimeoutError('超时').isRetryable).toBe(true);
    expect(new SearchError('搜索失败').isRetryable).toBe(true);
    expect(new ScrapeError('爬取失败').isRetryable).toBe(true);
    expect(new BrowserError('浏览器崩溃').isRetryable).toBe(true);
  });

  it('不可重试错误', () => {
    expect(new ConfigError('配置错误').isRetryable).toBe(false);
    expect(new DatabaseError('DB 错误').isRetryable).toBe(false);
    expect(new ValidationError('参数错误').isRetryable).toBe(false);
    expect(new AbortedError().isRetryable).toBe(false);
  });
});

describe('各子类错误', () => {
  const cases: Array<[new (msg: string, opts?: any) => ShentanError, string]> = [
    [ConfigError, 'CONFIG_ERROR'],
    [DatabaseError, 'DATABASE_ERROR'],
    [SearchError, 'SEARCH_ERROR'],
    [ScrapeError, 'SCRAPE_ERROR'],
    [BrowserError, 'BROWSER_ERROR'],
    [AgentError, 'AGENT_ERROR'],
    [ToolError, 'TOOL_ERROR'],
    [ProviderError, 'PROVIDER_ERROR'],
    [ValidationError, 'VALIDATION_ERROR'],
    [TimeoutError, 'TIMEOUT_ERROR'],
  ];

  for (const [Cls, code] of cases) {
    it(`${Cls.name} 继承 ShentanError 且 code=${code}`, () => {
      const err = new Cls('test');
      expect(err).toBeInstanceOf(ShentanError);
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(code);
      expect(err.name).toBe(Cls.name);
    });
  }

  it('AbortedError 默认消息', () => {
    const err = new AbortedError();
    expect(err.message).toBe('任务已取消');
    expect(err.code).toBe('ABORTED_ERROR');
  });
});

describe('isShentanError', () => {
  it('识别 ShentanError', () => {
    expect(isShentanError(new AgentError('test'))).toBe(true);
    expect(isShentanError(new ShentanError('AGENT_ERROR', 'test'))).toBe(true);
  });

  it('拒绝普通 Error', () => {
    expect(isShentanError(new Error('test'))).toBe(false);
    expect(isShentanError('string')).toBe(false);
    expect(isShentanError(null)).toBe(false);
  });
});

describe('toShentanError', () => {
  it('已是 ShentanError 则原样返回', () => {
    const original = new ConfigError('配置错误');
    expect(toShentanError(original)).toBe(original);
  });

  it('普通 Error 转换为 ShentanError', () => {
    const err = toShentanError(new Error('普通错误'));
    expect(err).toBeInstanceOf(ShentanError);
    expect(err.code).toBe('AGENT_ERROR'); // 默认 code
    expect(err.message).toBe('普通错误');
  });

  it('非 Error 值转换', () => {
    const err = toShentanError('字符串错误');
    expect(err.code).toBe('AGENT_ERROR');
    expect(err.message).toBe('字符串错误');
  });

  it('支持自定义默认 code', () => {
    const err = toShentanError(new Error('db fail'), 'DATABASE_ERROR');
    expect(err.code).toBe('DATABASE_ERROR');
  });
});
