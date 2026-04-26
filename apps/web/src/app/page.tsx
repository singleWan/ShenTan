import { listCharacters } from '@/lib/data';
import Link from 'next/link';
import CharacterCard from '@/components/CharacterCard';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let characterList: Awaited<ReturnType<typeof listCharacters>> = [];
  try {
    characterList = await listCharacters();
  } catch {
    // 数据库不存在
  }

  return (
    <div className="container">
      <div className="header header-actions">
        <div>
          <h1 className="glitch">神探</h1>
          <p className="header-subtitle">AI驱动的角色生平事迹与事件反应可视化</p>
        </div>
        <Link href="/collect" className="btn-header">
          + 收集新角色
        </Link>
      </div>

      {characterList.length === 0 ? (
        <div className="empty-state">
          <h2>暂无角色数据</h2>
          <p>
            <Link href="/collect" className="neon-link">点击这里</Link> 开始收集角色信息
          </p>
        </div>
      ) : (
        <div className="character-grid">
          {characterList.map((c) => (
            <CharacterCard
              key={c.id}
              id={c.id}
              name={c.name}
              type={c.type}
              source={c.source}
              status={c.status}
            />
          ))}
        </div>
      )}
    </div>
  );
}
