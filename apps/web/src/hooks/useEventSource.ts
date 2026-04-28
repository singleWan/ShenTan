'use client';

import { useRef, useCallback, useEffect } from 'react';

export interface SSEHandlers {
  onLog?: (data: { timestamp: string; message: string }) => void;
  onComplete?: (data: Record<string, unknown>) => void;
  onError?: (data: { message: string }) => void;
  onCancelled?: () => void;
  onConnectionError?: () => void;
}

/**
 * 管理 EventSource 连接的通用 Hook。
 * 自动追踪所有活跃连接，组件卸载时统一清理。
 */
export function useEventSource() {
  const esMapRef = useRef<Map<string, EventSource>>(new Map());

  // 组件卸载时清理所有连接
  useEffect(() => {
    return () => {
      for (const es of esMapRef.current.values()) {
        es.close();
      }
      esMapRef.current.clear();
    };
  }, []);

  const connect = useCallback((url: string, handlers: SSEHandlers) => {
    // 关闭同 URL 的旧连接
    const old = esMapRef.current.get(url);
    if (old) old.close();

    const es = new EventSource(url);
    esMapRef.current.set(url, es);

    const cleanup = () => {
      es.close();
      esMapRef.current.delete(url);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        switch (data.type) {
          case 'log':
            handlers.onLog?.({ timestamp: data.timestamp, message: data.message });
            break;
          case 'complete':
            handlers.onComplete?.(data.result ?? {});
            cleanup();
            break;
          case 'error':
            handlers.onError?.({ message: data.message });
            cleanup();
            break;
          case 'cancelled':
            handlers.onCancelled?.();
            cleanup();
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      cleanup();
      handlers.onConnectionError?.();
    };

    return cleanup;
  }, []);

  const disconnect = useCallback((url: string) => {
    const es = esMapRef.current.get(url);
    if (es) {
      es.close();
      esMapRef.current.delete(url);
    }
  }, []);

  return { connect, disconnect };
}
