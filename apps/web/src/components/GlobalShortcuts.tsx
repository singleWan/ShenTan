'use client';

import { useCallback } from 'react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function GlobalShortcuts() {
  const handleSearch = useCallback(() => {
    const input = document.querySelector<HTMLInputElement>('.search-input');
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleEscape = useCallback(() => {
    const active = document.activeElement as HTMLElement;
    if (active) active.blur();
    const dropdown = document.querySelector('.search-dropdown');
    if (dropdown) dropdown.remove();
  }, []);

  useKeyboardShortcuts({
    onSearch: handleSearch,
    onEscape: handleEscape,
  });

  return null;
}
