'use client';

import { useRef, useCallback, useEffect } from 'react';

export interface SSEHandlers {
  onLog?: (data: { timestamp: string; message: string }) => void;
  onComplete?: (data: Record<string, unknown>) => void;
  onError?: (data: { message: string }) => void;
  onCancelled?: () => void;
  onConnectionError?: () => void;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * 管理 EventSource 连接的通用 Hook。
 * 支持自动断线重连（指数退避），组件卸载时统一清理。
 */
export function useEventSource() {
  const esMapRef = useRef<Map<string, EventSource>>(new Map());
  const retryCountRef = useRef<Map<string, number>>(new Map());
  const handlersRef = useRef<Map<string, SSEHandlers>>(new Map());
  const stoppedRef = useRef(false);

  // 组件卸载时清理所有连接
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      for (const es of esMapRef.current.values()) {
        es.close();
      }
      esMapRef.current.clear();
      retryCountRef.current.clear();
      handlersRef.current.clear();
    };
  }, []);

  const connect = useCallback((url: string, handlers: SSEHandlers) => {
    // 重置重试计数
    retryCountRef.current.set(url, 0);
    handlersRef.current.set(url, handlers);
    stoppedRef.current = false;

    const createConnection = (retryCount: number) => {
      // 关闭同 URL 的旧连接
      const old = esMapRef.current.get(url);
      if (old) old.close();

      if (stoppedRef.current) return;

      const es = new EventSource(url);
      esMapRef.current.set(url, es);

      const cleanup = () => {
        es.close();
        esMapRef.current.delete(url);
      };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          const h = handlersRef.current.get(url);
          switch (data.type) {
            case 'log':
              h?.onLog?.({ timestamp: data.timestamp, message: data.message });
              break;
            case 'complete':
              h?.onComplete?.(data.result ?? {});
              cleanup();
              break;
            case 'error':
              h?.onError?.({ message: data.message });
              cleanup();
              break;
            case 'cancelled':
              h?.onCancelled?.();
              cleanup();
              break;
          }
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        const currentRetries = retryCountRef.current.get(url) ?? 0;
        cleanup();

        if (currentRetries < MAX_RETRIES && !stoppedRef.current) {
          const delay = Math.min(BASE_DELAY_MS * Math.pow(2, currentRetries), 8000);
          retryCountRef.current.set(url, currentRetries + 1);
          setTimeout(() => createConnection(currentRetries + 1), delay);
        } else {
          const h = handlersRef.current.get(url);
          h?.onConnectionError?.();
        }
      };
    };

    createConnection(0);

    return () => {
      stoppedRef.current = true;
      const es = esMapRef.current.get(url);
      if (es) {
        es.close();
        esMapRef.current.delete(url);
      }
    };
  }, []);

  const disconnect = useCallback((url: string) => {
    retryCountRef.current.delete(url);
    handlersRef.current.delete(url);
    const es = esMapRef.current.get(url);
    if (es) {
      es.close();
      esMapRef.current.delete(url);
    }
  }, []);

  return { connect, disconnect };
}
