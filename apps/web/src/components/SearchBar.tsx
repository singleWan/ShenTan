'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SearchResult {
  characters: Array<{ id: number; name: string; type: string; description: string | null }>;
  events: Array<{ id: number; title: string; dateText: string | null; category: string; characterId: number }>;
}

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=all`);
      const data = await res.json();
      setResults(data);
      setIsOpen(true);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  }, [search]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault();
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, [query, router]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasResults = results && (results.characters.length > 0 || results.events.length > 0);

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <div className="search-input-container">
        <span className="search-icon">&#x2315;</span>
        <input
          type="text"
          className="search-input"
          placeholder="搜索角色或事件..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
        />
        {loading && <span className="search-loading">...</span>}
      </div>

      {isOpen && hasResults && (
        <div className="search-dropdown">
          {results.characters.length > 0 && (
            <div className="search-section">
              <div className="search-section-title">角色</div>
              {results.characters.slice(0, 5).map((c) => (
                <Link
                  key={c.id}
                  href={`/characters/${c.id}`}
                  className="search-result-item"
                  onClick={() => setIsOpen(false)}
                >
                  <span className="search-result-name">{c.name}</span>
                  <span className="search-result-meta">{c.type}</span>
                </Link>
              ))}
            </div>
          )}
          {results.events.length > 0 && (
            <div className="search-section">
              <div className="search-section-title">事件</div>
              {results.events.slice(0, 5).map((e) => (
                <Link
                  key={e.id}
                  href={`/characters/${e.characterId}`}
                  className="search-result-item"
                  onClick={() => setIsOpen(false)}
                >
                  <span className="search-result-name">{e.title}</span>
                  <span className="search-result-meta">{e.dateText ?? e.category}</span>
                </Link>
              ))}
            </div>
          )}
          <Link
            href={`/search?q=${encodeURIComponent(query)}`}
            className="search-view-all"
            onClick={() => setIsOpen(false)}
          >
            查看全部结果
          </Link>
        </div>
      )}
    </div>
  );
}
