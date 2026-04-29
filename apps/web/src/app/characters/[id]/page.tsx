import {
  getCharacter,
  getCharacterEvents,
  getReactionsForEvents,
  getCharacterRelations,
} from '@/lib/data';
import Link from 'next/link';
import TimelineInteractive from '@/components/TimelineInteractive';
import DeleteCharacterButton from '@/components/DeleteCharacterButton';
import { statusLabel, formatSourceDisplay } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const characterId = parseInt(id, 10);

  const character = await getCharacter(characterId);
  const eventList = await getCharacterEvents(characterId);
  const characterRelations = await getCharacterRelations(characterId);

  const reactionsMapRaw = await getReactionsForEvents(eventList.map((e) => e.id));
  const reactionsMap: Record<
    number,
    {
      id: number;
      reactor: string;
      reactorType: string;
      reactionText: string | null;
      sentiment: string | null;
      eventId: number;
    }[]
  > = {};
  for (const [eventId, r] of reactionsMapRaw) {
    if (r.length > 0) reactionsMap[eventId] = r;
  }

  if (!character) {
    return (
      <div className="container">
        <div className="empty">
          <h2>角色不存在</h2>
          <Link href="/" className="back-link">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  const totalReactions = Object.values(reactionsMap).reduce((s, r) => s + r.length, 0);

  // 序列化事件数据给客户端组件
  const serializedEvents = eventList.map((evt) => ({
    id: evt.id,
    title: evt.title,
    description: evt.description,
    dateText: evt.dateText,
    dateSortable: evt.dateSortable,
    category: evt.category,
    importance: evt.importance,
  }));

  const serializedReactions: Record<
    number,
    Array<{
      id: number;
      reactor: string;
      reactorType: string;
      reactionText: string | null;
      sentiment: string | null;
    }>
  > = {};
  for (const [eventId, reactions] of Object.entries(reactionsMap)) {
    serializedReactions[Number(eventId)] = reactions.map((r) => ({
      id: r.id,
      reactor: r.reactor,
      reactorType: r.reactorType,
      reactionText: r.reactionText,
      sentiment: r.sentiment,
    }));
  }

  return (
    <div className="container">
      <Link href="/" className="back-link">
        ← 返回
      </Link>

      <div className="char-header">
        <div className="char-title-row">
          <div className="char-avatar-wrapper">
            {character.imageUrl ? (
              <img
                src={
                  character.imageUrl.startsWith('http')
                    ? character.imageUrl
                    : `/api/images/${character.imageUrl}`
                }
                alt={character.name}
                className="char-avatar"
              />
            ) : (
              <div className="char-avatar-placeholder">
                <svg
                  viewBox="0 0 24 24"
                  width="40"
                  height="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
            )}
          </div>
          <div className="char-title-info">
            <div className="char-title-text">
              <h1 className="glitch">{character.name}</h1>
              <span className={`badge badge-${character.status}`}>
                <span className="badge-dot" />
                {statusLabel(character.status)}
              </span>
              <DeleteCharacterButton characterId={characterId} characterName={character.name} />
              <a
                href={`/collect?existingId=${characterId}&name=${encodeURIComponent(character.name)}&type=${character.type}`}
                className="btn-header"
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
              >
                继续收集
              </a>
            </div>
            <div className="char-meta">
              <span>{character.type === 'fictional' ? '虚构角色' : '历史人物'}</span>
              {character.source && <span>来源: {formatSourceDisplay(character.source)}</span>}
            </div>
          </div>
        </div>
        {character.description && (
          <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
            {character.description}
          </p>
        )}
        <div className="stats">
          <div className="stat">
            <div className="stat-value">{eventList.length}</div>
            <div className="stat-label">事件</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totalReactions}</div>
            <div className="stat-label">反应</div>
          </div>
          <div className="stat">
            <div className="stat-value">{characterRelations.length}</div>
            <div className="stat-label">关系</div>
          </div>
        </div>

        {characterRelations.length > 0 && (
          <div className="relations-section">
            <h3 className="relations-heading">角色关系</h3>
            <div className="relations-list">
              {characterRelations.map((rel) => (
                <div key={rel.id} className="relation-item-inline">
                  <span className="relation-arrow">
                    {rel.fromCharacterId === characterId ? '&rarr;' : '&larr;'}
                  </span>
                  <Link
                    href={`/characters/${rel.fromCharacterId === characterId ? rel.toCharacterId : rel.fromCharacterId}`}
                    className="relation-target-name"
                  >
                    {rel.fromCharacterId === characterId ? rel.toName : rel.fromName}
                  </Link>
                  <span className="relation-type-badge">{rel.relationType}</span>
                  {rel.description && <span className="relation-desc">{rel.description}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TimelineInteractive
        characterId={characterId}
        characterName={character.name}
        characterAliases={character.aliases}
        eventList={serializedEvents}
        reactionsMap={serializedReactions}
      />
    </div>
  );
}
