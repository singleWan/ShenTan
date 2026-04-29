'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface ReviewEvent {
  id: number;
  characterId: number;
  title: string;
  description: string | null;
  dateText: string | null;
  category: string | null;
  importance: number;
  sourceUrl: string | null;
}

export default function ReviewPage() {
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/review');
      if (!res.ok) throw new Error('获取失败');
      const data = await res.json();
      setEvents(data.events ?? []);
      setSelectedIds(new Set());
      setFocusedIndex(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (events.length === 0) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const focused = events[focusedIndex];

      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, events.length - 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          if (focused) {
            e.preventDefault();
            handleAction(focused.id, 'keep');
          }
          break;
        case 'm':
        case 'M':
          if (focused && mergeTarget === null) {
            e.preventDefault();
            setMergeTarget(focused.id);
          }
          break;
        case ' ':
          if (focused) {
            e.preventDefault();
            toggleSelect(focused.id);
          }
          break;
        case 'A':
          if (e.shiftKey) {
            e.preventDefault();
            const allIds = new Set(events.map((e) => e.id));
            setSelectedIds(selectedIds.size === events.length ? new Set() : allIds);
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [events, focusedIndex, mergeTarget, selectedIds]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAction = async (eventId: number, action: 'keep' | 'merge') => {
    setProcessing((prev) => new Set(prev).add(eventId));
    setError(null);
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          action,
          mergeTargetId: action === 'merge' ? mergeTarget : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? '操作失败');
      }
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
      if (mergeTarget === eventId) setMergeTarget(null);
      setFocusedIndex((i) => Math.min(i, Math.max(0, events.length - 2)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  const handleBatchKeep = async () => {
    if (selectedIds.size === 0) return;
    setError(null);
    try {
      const res = await fetch('/api/review/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds: [...selectedIds], action: 'keep' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? '批量操作失败');
      }
      setEvents((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      setSelectedIds(new Set());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setError(null);
    try {
      const res = await fetch('/api/review/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds: [...selectedIds], action: 'delete' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? '批量操作失败');
      }
      setEvents((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      setSelectedIds(new Set());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleBatchMerge = async () => {
    if (!mergeTarget || selectedIds.size === 0) return;
    const idsToMerge = [...selectedIds].filter((id) => id !== mergeTarget);
    if (idsToMerge.length === 0) return;
    setError(null);
    try {
      const res = await fetch('/api/review/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds: idsToMerge, action: 'merge', mergeTargetId: mergeTarget }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? '批量合并失败');
      }
      setEvents((prev) => prev.filter((e) => !selectedIds.has(e.id) || e.id === mergeTarget));
      setSelectedIds(new Set());
      setMergeTarget(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const importanceLabel = (n: number) => {
    const labels = ['', '☆', '★☆', '★★', '★★★', '★★★★★'];
    return labels[n] ?? '★'.repeat(n);
  };

  return (
    <div className="container">
      <div className="header header-actions">
        <div>
          <h1 className="glitch">事件审查</h1>
          <p className="header-subtitle">审核疑似重复事件，决定保留或合并</p>
        </div>
        <div className="header-btn-group">
          <Link href="/" className="btn-header">
            返回首页
          </Link>
        </div>
      </div>

      {/* 快捷键提示 */}
      <div className="shortcut-bar">
        <span className="shortcut-hint">
          <kbd>K</kbd> 保留 &nbsp;
          <kbd>J</kbd>/<kbd>↑↓</kbd> 切换 &nbsp;
          <kbd>M</kbd> 合并 &nbsp;
          <kbd>Space</kbd> 选择 &nbsp;
          <kbd>Shift+A</kbd> 全选
        </span>
      </div>

      {loading && <div className="empty-state">加载中...</div>}

      {!loading && error && (
        <div className="review-error">
          <p>{error}</p>
          <button className="btn-action" onClick={() => fetchPending()}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✓</div>
          <p>所有事件已审核完毕</p>
        </div>
      )}

      {!loading && events.length > 0 && (
        <>
          <div className="review-stats">
            待审核事件: <span className="text-cyan">{events.length}</span>
            {selectedIds.size > 0 && (
              <>
                {' '}
                | 已选: <span className="text-cyan">{selectedIds.size}</span>
              </>
            )}
          </div>

          {/* 批量操作栏 */}
          {selectedIds.size > 0 && (
            <div className="batch-bar">
              <button className="btn-action btn-keep" onClick={handleBatchKeep}>
                批量保留 ({selectedIds.size})
              </button>
              <button className="btn-action btn-merge" onClick={handleBatchDelete}>
                批量删除 ({selectedIds.size})
              </button>
              {mergeTarget && (
                <button className="btn-action btn-merge-confirm" onClick={handleBatchMerge}>
                  批量合并到 #{mergeTarget} ({selectedIds.size})
                </button>
              )}
            </div>
          )}

          <div className="review-list">
            {events.map((evt, idx) => (
              <div
                key={evt.id}
                className={`review-card${idx === focusedIndex ? ' focused' : ''}${selectedIds.has(evt.id) ? ' selected' : ''}`}
              >
                <div className="review-card-header">
                  <label className="review-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(evt.id)}
                      onChange={() => toggleSelect(evt.id)}
                    />
                  </label>
                  <span className="review-id">ID: {evt.id}</span>
                  <span className="review-importance">{importanceLabel(evt.importance)}</span>
                  {evt.category && <span className="review-category">{evt.category}</span>}
                </div>
                <h3 className="review-title">{evt.title}</h3>
                {evt.description && <p className="review-desc">{evt.description}</p>}
                <div className="review-meta">
                  {evt.dateText && <span className="review-date">{evt.dateText}</span>}
                  {evt.sourceUrl && (
                    <a
                      href={evt.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="review-link"
                    >
                      来源
                    </a>
                  )}
                  <span className="review-char">角色 #{evt.characterId}</span>
                </div>
                <div className="review-actions">
                  <button
                    className="btn-action btn-keep"
                    disabled={processing.has(evt.id)}
                    onClick={() => handleAction(evt.id, 'keep')}
                  >
                    保留
                  </button>
                  <button
                    className="btn-action btn-merge"
                    disabled={processing.has(evt.id)}
                    onClick={() => {
                      if (mergeTarget === evt.id) {
                        setMergeTarget(null);
                      } else {
                        setMergeTarget(evt.id);
                      }
                    }}
                  >
                    {mergeTarget === evt.id ? '取消合并' : '标记为重复'}
                  </button>
                  {mergeTarget !== null && mergeTarget !== evt.id && (
                    <button
                      className="btn-action btn-merge-confirm"
                      disabled={processing.has(evt.id)}
                      onClick={() => handleAction(evt.id, 'merge')}
                    >
                      合并到 #{mergeTarget}
                    </button>
                  )}
                </div>
                {processing.has(evt.id) && <div className="review-processing">处理中...</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <style jsx>{`
        .shortcut-bar {
          padding: 0.5rem 0;
          margin-bottom: 0.5rem;
          border-bottom: 1px solid var(--border);
        }
        .shortcut-hint {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        kbd {
          display: inline-block;
          padding: 0.1rem 0.4rem;
          font-size: 0.7rem;
          font-family: var(--font-mono), monospace;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 3px;
          color: var(--cyan);
        }
        .review-stats {
          padding: 1rem 0;
          font-size: 0.95rem;
          color: var(--text-secondary);
        }
        .text-cyan {
          color: var(--cyan);
          font-weight: 600;
        }
        .batch-bar {
          display: flex;
          gap: 0.5rem;
          padding: 0.75rem;
          margin-bottom: 1rem;
          background: var(--surface);
          border: 1px solid var(--border-light);
          border-radius: 8px;
        }
        .review-error {
          padding: 1.5rem;
          background: var(--red-dim);
          border: 1px solid var(--red);
          border-radius: 8px;
          text-align: center;
        }
        .review-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .review-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 1.25rem;
          transition: border-color 0.2s;
        }
        .review-card.focused {
          border-color: var(--cyan);
          box-shadow: 0 0 0 1px var(--cyan);
        }
        .review-card.selected {
          background: var(--cyan-dim);
          border-color: var(--cyan);
        }
        .review-card-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .review-checkbox {
          display: flex;
          align-items: center;
          cursor: pointer;
        }
        .review-checkbox input {
          accent-color: var(--cyan);
          width: 16px;
          height: 16px;
        }
        .review-id {
          font-family: var(--font-mono), monospace;
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .review-importance {
          color: var(--amber);
          font-size: 0.85rem;
        }
        .review-category {
          background: var(--cyan-dim);
          color: var(--cyan);
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
        }
        .review-title {
          font-size: 1.1rem;
          color: var(--text);
          margin-bottom: 0.35rem;
        }
        .review-desc {
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin-bottom: 0.5rem;
        }
        .review-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          font-size: 0.8rem;
          color: var(--text-muted);
          margin-bottom: 1rem;
        }
        .review-date {
          color: var(--purple);
        }
        .review-link {
          color: var(--cyan);
          text-decoration: none;
        }
        .review-link:hover {
          text-decoration: underline;
        }
        .review-char {
          font-family: var(--font-mono), monospace;
        }
        .review-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .btn-action {
          padding: 0.4rem 1rem;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: var(--surface);
          color: var(--text);
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }
        .btn-action:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-keep:hover:not(:disabled) {
          background: var(--green-dim);
          border-color: var(--green);
          color: var(--green);
        }
        .btn-merge:hover:not(:disabled) {
          background: var(--amber-dim);
          border-color: var(--amber);
          color: var(--amber);
        }
        .btn-merge-confirm {
          background: var(--red-dim);
          border-color: var(--red);
          color: var(--red);
        }
        .btn-merge-confirm:hover:not(:disabled) {
          background: var(--red);
          color: var(--bg);
        }
        .review-processing {
          margin-top: 0.5rem;
          font-size: 0.85rem;
          color: var(--cyan);
        }
      `}</style>
    </div>
  );
}
