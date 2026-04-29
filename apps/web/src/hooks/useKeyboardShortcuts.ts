'use client';

import { useEffect } from 'react';

interface ShortcutConfig {
  onSearch?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(config: ShortcutConfig) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // `/` 聚焦搜索框（非输入框时）
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        config.onSearch?.();
        return;
      }

      // Escape 关闭弹窗/清除焦点
      if (e.key === 'Escape') {
        config.onEscape?.();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [config]);
}
