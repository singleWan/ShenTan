import Link from 'next/link';
import { searchCharacters, searchEvents } from '@/lib/data';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ q?: string; category?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q ?? '';
  const category = params.category;

  let characters: Awaited<ReturnType<typeof searchCharacters>> = [];
  let events: Awaited<ReturnType<typeof searchEvents>> = [];

  if (q.trim()) {
    try {
      [characters, events] = await Promise.all([
        searchCharacters(q),
        searchEvents(q, { category: category ?? undefined }),
      ]);
    } catch {
      // 数据库不可用
    }
  }

  const categories = [
    'life',
    'career',
    'political',
    'conflict',
    'achievement',
    'scandal',
    'speech',
    'policy',
    'statement',
    'rumor',
    'other',
  ];

  return (
    <div className="container">
      <div className="header">
        <Link href="/" className="back-link">
          &larr; 返回首页
        </Link>
        <h1>搜索结果</h1>
        <p className="header-subtitle">
          {q
            ? `搜索: "${q}" — 找到 ${characters.length} 个角色, ${events.length} 个事件`
            : '输入关键词开始搜索'}
        </p>
      </div>

      <form className="search-page-form" action="/search" method="GET">
        <div className="form-group">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="输入角色名或事件关键词..."
            className="search-page-input"
            autoFocus
          />
        </div>
        <div className="search-filters">
          <span className="filter-label">类别过滤:</span>
          <button
            type="submit"
            name="category"
            value=""
            className={`filter-btn ${!category ? 'active' : ''}`}
          >
            全部
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="submit"
              name="category"
              value={cat}
              className={`filter-btn ${category === cat ? 'active' : ''}`}
            >
              {cat}
            </button>
          ))}
          <input type="hidden" name="q" value={q} />
        </div>
      </form>

      {!q.trim() && (
        <div className="empty-state">
          <h2>输入关键词开始搜索</h2>
          <p>搜索角色名称、描述或事件标题</p>
        </div>
      )}

      {q.trim() && characters.length > 0 && (
        <section className="search-results-section">
          <h2 className="search-section-heading">角色 ({characters.length})</h2>
          <div className="search-results-list">
            {characters.map((c) => (
              <Link key={c.id} href={`/characters/${c.id}`} className="search-result-card hud-card">
                <div className="search-result-card-title">{c.name}</div>
                <div className="search-result-card-meta">
                  <span>{c.type}</span>
                  {c.description && (
                    <span className="search-result-desc">{c.description.slice(0, 100)}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {q.trim() && events.length > 0 && (
        <section className="search-results-section">
          <h2 className="search-section-heading">事件 ({events.length})</h2>
          <div className="search-results-list">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/characters/${e.characterId}`}
                className="search-result-card hud-card"
              >
                <div className="search-result-card-header">
                  <span className="search-result-card-title">{e.title}</span>
                  <span className="search-result-card-badge">{e.category}</span>
                </div>
                <div className="search-result-card-meta">
                  {e.dateText && <span>{e.dateText}</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {q.trim() && characters.length === 0 && events.length === 0 && (
        <div className="empty-state">
          <h2>未找到结果</h2>
          <p>尝试使用不同的关键词搜索</p>
        </div>
      )}
    </div>
  );
}
