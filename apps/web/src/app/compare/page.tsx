'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface CharacterOption {
  id: number;
  name: string;
  type: string;
  color: string;
}

interface TimelineEvent {
  id: number;
  characterId: number;
  title: string;
  description: string | null;
  dateText: string | null;
  category: string;
  importance: number;
  color: string;
}

interface CompareData {
  characters: CharacterOption[];
  events: TimelineEvent[];
  relations: Array<{
    id: number;
    fromCharacterId: number;
    toCharacterId: number;
    relationType: string;
    description: string | null;
    fromColor: string;
    toColor: string;
  }>;
}

export default function ComparePage() {
  const [allCharacters, setAllCharacters] = useState<Array<{ id: number; name: string; type: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [data, setData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/search?q=%25&type=characters')
      .then((r) => r.json())
      .then((d) => setAllCharacters(d.characters ?? []))
      .catch(() => {});
  }, []);

  const fetchCompare = useCallback(async () => {
    if (selectedIds.length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compare?ids=${selectedIds.join(',')}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? '查询失败');
      }
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedIds]);

  useEffect(() => {
    if (selectedIds.length >= 2) {
      fetchCompare();
    } else {
      setData(null);
    }
  }, [selectedIds, fetchCompare]);

  const toggleCharacter = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const charName = (id: number) => data?.characters.find((c) => c.id === id)?.name ?? `#${id}`;

  return (
    <div className="container">
      <div className="header header-actions">
        <div>
          <h1 className="glitch">多角色对比</h1>
          <p className="header-subtitle">选择多个角色，对比他们的时间线交叉点</p>
        </div>
        <div className="header-btn-group">
          <Link href="/" className="btn-header">
            返回首页
          </Link>
        </div>
      </div>

      {/* 角色选择器 */}
      <div className="compare-selector">
        <h3>选择角色 (2-6个)</h3>
        <div className="compare-chips">
          {allCharacters.map((c) => (
            <button
              key={c.id}
              className={`compare-chip ${selectedIds.includes(c.id) ? 'selected' : ''}`}
              onClick={() => toggleCharacter(c.id)}
            >
              {c.name}
              <span className="chip-type">{c.type === 'historical' ? '史' : '虚'}</span>
            </button>
          ))}
        </div>
        {selectedIds.length > 0 && (
          <div className="compare-selected">
            已选: {selectedIds.map((id) => allCharacters.find((c) => c.id === id)?.name ?? `#${id}`).join(' + ')}
          </div>
        )}
      </div>

      {error && <div className="compare-error">{error}</div>}
      {loading && <div className="empty-state">加载中...</div>}

      {/* 对比结果 */}
      {data && (
        <>
          {/* 角色图例 */}
          <div className="compare-legend">
            {data.characters.map((c) => (
              <span key={c.id} className="legend-item" style={{ borderColor: c.color }}>
                <span className="legend-dot" style={{ background: c.color }} />
                {c.name}
              </span>
            ))}
          </div>

          {/* 角色间关系 */}
          {data.relations.length > 0 && (
            <div className="compare-relations">
              <h3>角色关系</h3>
              {data.relations.map((r) => (
                <div key={r.id} className="relation-item">
                  <span style={{ color: r.fromColor }}>{charName(r.fromCharacterId)}</span>
                  <span className="relation-type">{r.relationType}</span>
                  <span style={{ color: r.toColor }}>{charName(r.toCharacterId)}</span>
                  {r.description && <span className="relation-desc">({r.description})</span>}
                </div>
              ))}
            </div>
          )}

          {/* 统一时间线 */}
          <div className="compare-timeline">
            <h3>统一时间线 ({data.events.length} 个事件)</h3>
            <div className="timeline-list">
              {data.events.map((evt) => (
                <div key={evt.id} className="timeline-item" style={{ borderLeftColor: evt.color }}>
                  <div className="timeline-meta">
                    <span className="timeline-date">{evt.dateText ?? '未知日期'}</span>
                    <span className="timeline-char" style={{ color: evt.color }}>
                      {charName(evt.characterId)}
                    </span>
                    <span className="timeline-category">{evt.category}</span>
                  </div>
                  <div className="timeline-title">{evt.title}</div>
                  {evt.description && <div className="timeline-desc">{evt.description}</div>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!data && selectedIds.length < 2 && (
        <div className="empty-state">请选择至少 2 个角色进行对比</div>
      )}

      <style jsx>{`
        .compare-selector {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 1.25rem;
          margin-bottom: 1.5rem;
        }
        .compare-selector h3 {
          margin-bottom: 0.75rem;
          font-size: 1rem;
          color: var(--text);
        }
        .compare-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .compare-chip {
          padding: 0.35rem 0.75rem;
          border: 1px solid var(--border);
          border-radius: 20px;
          background: var(--bg);
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }
        .compare-chip.selected {
          background: var(--cyan-dim);
          border-color: var(--cyan);
          color: var(--cyan);
        }
        .chip-type {
          margin-left: 0.35rem;
          font-size: 0.7rem;
          opacity: 0.6;
        }
        .compare-selected {
          margin-top: 0.75rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .compare-error {
          padding: 1rem;
          background: var(--red-dim);
          border: 1px solid var(--red);
          border-radius: 8px;
          color: var(--red);
        }
        .compare-legend {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.3rem 0.75rem;
          border: 1px solid;
          border-radius: 4px;
          font-size: 0.85rem;
        }
        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .compare-relations {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }
        .compare-relations h3 {
          font-size: 0.95rem;
          margin-bottom: 0.5rem;
        }
        .relation-item {
          padding: 0.35rem 0;
          font-size: 0.85rem;
        }
        .relation-type {
          display: inline-block;
          margin: 0 0.5rem;
          padding: 0.1rem 0.4rem;
          background: var(--purple-dim);
          color: var(--purple);
          border-radius: 3px;
          font-size: 0.75rem;
        }
        .relation-desc {
          color: var(--text-muted);
          font-size: 0.8rem;
        }
        .compare-timeline h3 {
          font-size: 0.95rem;
          margin-bottom: 0.75rem;
        }
        .timeline-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .timeline-item {
          padding: 0.75rem 1rem;
          background: var(--surface);
          border: 1px solid var(--border);
          border-left: 3px solid;
          border-radius: 0 6px 6px 0;
        }
        .timeline-meta {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.8rem;
          margin-bottom: 0.3rem;
        }
        .timeline-date {
          color: var(--amber);
          font-family: var(--font-mono), monospace;
        }
        .timeline-char {
          font-weight: 600;
        }
        .timeline-category {
          background: var(--cyan-dim);
          color: var(--cyan);
          padding: 0.1rem 0.4rem;
          border-radius: 3px;
          font-size: 0.7rem;
        }
        .timeline-title {
          font-size: 0.95rem;
          color: var(--text);
        }
        .timeline-desc {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 0.2rem;
        }
      `}</style>
    </div>
  );
}
