import Link from 'next/link';
import { getRelationGraph } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function GraphPage() {
  let graph: Awaited<ReturnType<typeof getRelationGraph>> = { nodes: [], edges: [] };
  try {
    graph = await getRelationGraph();
  } catch {
    // 数据库不可用
  }

  // 构建邻接表用于渲染
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n.name]));
  const relationsByNode = new Map<
    number,
    Array<{ target: number; type: string; description: string | null }>
  >();

  for (const edge of graph.edges) {
    const list = relationsByNode.get(edge.from) ?? [];
    list.push({ target: edge.to, type: edge.type, description: edge.description });
    relationsByNode.set(edge.from, list);
  }

  const relationTypeLabels: Record<string, string> = {
    ally: '盟友',
    enemy: '敌人',
    family: '家人',
    colleague: '同事',
    rival: '对手',
    mentor: '导师',
    friend: '朋友',
    other: '其他',
  };

  return (
    <div className="container">
      <div className="header">
        <Link href="/" className="back-link">
          &larr; 返回首页
        </Link>
        <h1>角色关系网络</h1>
        <p className="header-subtitle">
          {graph.nodes.length} 个角色, {graph.edges.length} 条关系
        </p>
      </div>

      {graph.edges.length === 0 ? (
        <div className="empty-state">
          <h2>暂无关系数据</h2>
          <p>收集更多角色后，系统会自动提取角色间的关系</p>
        </div>
      ) : (
        <div className="relation-graph-container">
          {/* 节点列表 */}
          <div className="relation-nodes-grid">
            {graph.nodes.map((node) => {
              const outgoing = relationsByNode.get(node.id) ?? [];
              const incoming = graph.edges.filter((e) => e.to === node.id);
              if (outgoing.length === 0 && incoming.length === 0) return null;

              return (
                <div key={node.id} className="hud-card relation-node-card">
                  <div className="relation-node-header">
                    <Link href={`/characters/${node.id}`} className="relation-node-name">
                      {node.name}
                    </Link>
                    <span className="relation-node-type">{node.type}</span>
                  </div>
                  <div className="relation-list">
                    {outgoing.map((rel, i) => (
                      <div key={`out-${i}`} className="relation-item-inline">
                        <span className="relation-arrow">&rarr;</span>
                        <Link href={`/characters/${rel.target}`} className="relation-target-name">
                          {nodeMap.get(rel.target) ?? '未知'}
                        </Link>
                        <span className="relation-type-badge">
                          {relationTypeLabels[rel.type] ?? rel.type}
                        </span>
                        {rel.description && (
                          <span className="relation-desc">{rel.description}</span>
                        )}
                      </div>
                    ))}
                    {incoming.map((rel, i) => (
                      <div key={`in-${i}`} className="relation-item-inline">
                        <span className="relation-arrow">&larr;</span>
                        <Link href={`/characters/${rel.from}`} className="relation-target-name">
                          {nodeMap.get(rel.from) ?? '未知'}
                        </Link>
                        <span className="relation-type-badge">
                          {relationTypeLabels[rel.type] ?? rel.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
