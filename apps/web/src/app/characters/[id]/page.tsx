import { getCharacter, getCharacterEvents, getEventReactions } from '@/lib/data';
import Link from 'next/link';
import TimelineInteractive from '@/components/TimelineInteractive';
import DeleteCharacterButton from '@/components/DeleteCharacterButton';
import { statusLabel } from '@/lib/labels';

export const dynamic = 'force-dynamic';

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const characterId = parseInt(id, 10);

  const character = await getCharacter(characterId);
  const eventList = await getCharacterEvents(characterId);

  const reactionsMap: Record<number, Awaited<ReturnType<typeof getEventReactions>>> = {};
  for (const evt of eventList) {
    const r = await getEventReactions(evt.id);
    if (r.length > 0) reactionsMap[evt.id] = r;
  }

  if (!character) {
    return (
      <div className="container">
        <div className="empty">
          <h2>角色不存在</h2>
          <Link href="/" className="back-link">返回首页</Link>
        </div>
      </div>
    );
  }

  const totalReactions = Object.values(reactionsMap).reduce((s, r) => s + r.length, 0);

  // 序列化事件数据给客户端组件
  const serializedEvents = eventList.map(evt => ({
    id: evt.id,
    title: evt.title,
    description: evt.description,
    dateText: evt.dateText,
    dateSortable: evt.dateSortable,
    category: evt.category,
    importance: evt.importance,
  }));

  const serializedReactions: Record<number, Array<{
    id: number;
    reactor: string;
    reactorType: string;
    reactionText: string | null;
    sentiment: string | null;
  }>> = {};
  for (const [eventId, reactions] of Object.entries(reactionsMap)) {
    serializedReactions[Number(eventId)] = reactions.map(r => ({
      id: r.id,
      reactor: r.reactor,
      reactorType: r.reactorType,
      reactionText: r.reactionText,
      sentiment: r.sentiment,
    }));
  }

  return (
    <div className="container">
      <Link href="/" className="back-link">← 返回</Link>

      <div className="char-header">
        <div className="char-title-row">
          <h1 className="glitch">{character.name}</h1>
          <span className={`badge badge-${character.status}`}>
            <span className="badge-dot" />
            {statusLabel(character.status)}
          </span>
          <DeleteCharacterButton characterId={characterId} characterName={character.name} />
        </div>
        <div className="char-meta">
          <span>{character.type === 'fictional' ? '虚构角色' : '历史人物'}</span>
          {character.source && <span>来源: {character.source}</span>}
        </div>
        {character.description && (
          <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>{character.description}</p>
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
        </div>
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
