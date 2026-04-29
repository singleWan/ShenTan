'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface GraphNode {
  id: number;
  name: string;
  type: string;
  isPlaceholder?: number;
}

interface GraphEdge {
  from: number;
  to: number;
  type: string;
  description: string | null;
  sourceUrl?: string | null;
  confidence?: string | null;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const RELATION_COLORS: Record<string, string> = {
  ally: '#22c55e',
  enemy: '#ef4444',
  family: '#3b82f6',
  colleague: '#f59e0b',
  rival: '#f97316',
  mentor: '#8b5cf6',
  friend: '#06b6d4',
  other: '#6b7280',
};

const RELATION_LABELS: Record<string, string> = {
  ally: '盟友',
  enemy: '敌人',
  family: '家人',
  colleague: '同事',
  rival: '对手',
  mentor: '导师',
  friend: '朋友',
  other: '其他',
};

export default function GraphPage() {
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{
    source: string;
    target: string;
    type: string;
    description: string | null;
    sourceUrl: string | null;
    confidence: string | null;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    fetch('/api/graph')
      .then((r) => r.json())
      .then((data) => setGraph(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: Math.max(500, window.innerHeight - 200),
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const fgData = useCallback(() => {
    const nodeSet = new Set(graph.nodes.map((n) => n.id));
    const fgNodes = graph.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      isPlaceholder: n.isPlaceholder ?? 0,
      val: graph.edges.filter((e) => e.from === n.id || e.to === n.id).length + 1,
    }));

    const fgLinks = graph.edges
      .filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to))
      .map((e, i) => ({
        source: e.from,
        target: e.to,
        type: e.type,
        description: e.description,
        index: i,
      }));

    return { nodes: fgNodes, links: fgLinks };
  }, [graph]);

  const getNodeRelations = useCallback(
    (nodeId: number) => {
      return graph.edges
        .filter((e) => e.from === nodeId || e.to === nodeId)
        .map((e) => {
          const isFrom = e.from === nodeId;
          const targetId = isFrom ? e.to : e.from;
          const target = graph.nodes.find((n) => n.id === targetId);
          return {
            source: isFrom ? graph.nodes.find((n) => n.id === nodeId)?.name ?? '' : target?.name ?? '',
            target: isFrom ? target?.name ?? '' : graph.nodes.find((n) => n.id === nodeId)?.name ?? '',
            type: e.type,
            description: e.description,
            sourceUrl: (e as GraphEdge & { sourceUrl?: string }).sourceUrl ?? null,
            confidence: (e as GraphEdge & { confidence?: string }).confidence ?? null,
          };
        });
    },
    [graph],
  );

  if (loading) {
    return (
      <div className="container">
        <div className="empty-state">加载中...</div>
      </div>
    );
  }

  if (graph.edges.length === 0) {
    return (
      <div className="container">
        <div className="header">
          <Link href="/" className="back-link">
            &larr; 返回首页
          </Link>
          <h1>角色关系网络</h1>
          <p className="header-subtitle">暂无关系数据</p>
        </div>
        <div className="empty-state">
          <h2>暂无关系数据</h2>
          <p>收集更多角色后，系统会自动提取角色间的关系</p>
        </div>
      </div>
    );
  }

  const data = fgData();

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

      {/* 图例 */}
      <div className="graph-legend">
        {Object.entries(RELATION_LABELS).map(([key, label]) => (
          <span key={key} className="legend-item">
            <span className="legend-dot" style={{ background: RELATION_COLORS[key] }} />
            {label}
          </span>
        ))}
      </div>

      <div ref={containerRef} className="graph-container">
        <ForceGraph2D
          graphData={data}
          width={dimensions.width}
          height={dimensions.height}
          nodeLabel="name"
          nodeVal="val"
          nodeColor={(node: Record<string, unknown>) => {
            const n = node as { isPlaceholder?: number; type?: string };
            return n.isPlaceholder ? '#6b7280' : '#22d3ee';
          }}
          nodeRelSize={6}
          nodeCanvasObject={(node: Record<string, unknown>, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const n = node as { x: number; y: number; name: string; isPlaceholder?: number };
            const label = n.name;
            const fontSize = Math.max(10, 12 / globalScale);
            ctx.font = `${fontSize}px Sans-Serif`;
            const textWidth = ctx.measureText(label).width;
            const bgPadding = fontSize * 0.3;

            ctx.fillStyle = n.isPlaceholder ? 'rgba(107,114,128,0.7)' : 'rgba(8,145,178,0.7)';
            ctx.beginPath();
            ctx.roundRect(n.x - textWidth / 2 - bgPadding, n.y - fontSize - bgPadding, textWidth + bgPadding * 2, fontSize + bgPadding * 2, 3);
            ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, n.x, n.y - fontSize / 2);
          }}
          linkColor={(link: Record<string, unknown>) => {
            const l = link as { type?: string };
            return RELATION_COLORS[l.type ?? 'other'] ?? '#6b7280';
          }}
          linkWidth={1.5}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.9}
          linkLineDash={(link: Record<string, unknown>) => {
            const l = link as { type?: string };
            return l.type === 'other' ? [4, 2] : null;
          }}
          onNodeClick={(node: Record<string, unknown>) => {
            const n = node as unknown as GraphNode;
            setSelectedNode(selectedNode?.id === n.id ? null : n);
          }}
          onLinkHover={(link: Record<string, unknown> | null) => {
            if (!link) {
              setHoverEdge(null);
              return;
            }
            const l = link as { source: { name: string }; target: { name: string }; type: string; description?: string };
            setHoverEdge({
              source: l.source.name,
              target: l.target.name,
              type: l.type,
              description: l.description ?? null,
              sourceUrl: null,
              confidence: null,
            });
          }}
          cooldownTicks={100}
        />
      </div>

      {/* 悬停边信息 */}
      {hoverEdge && (
        <div className="graph-edge-tooltip">
          <span style={{ color: RELATION_COLORS[hoverEdge.type] }}>
            {hoverEdge.source} → {RELATION_LABELS[hoverEdge.type] ?? hoverEdge.type} → {hoverEdge.target}
          </span>
          {hoverEdge.description && <p>{hoverEdge.description}</p>}
        </div>
      )}

      {/* 选中节点详情 */}
      {selectedNode && (
        <div className="graph-node-detail hud-card">
          <div className="detail-header">
            <Link href={`/characters/${selectedNode.id}`} className="detail-name">
              {selectedNode.name}
            </Link>
            <span className="detail-type">{selectedNode.type}</span>
            {selectedNode.isPlaceholder && <span className="detail-badge">占位角色</span>}
            <button className="detail-close" onClick={() => setSelectedNode(null)}>
              ×
            </button>
          </div>
          <div className="detail-relations">
            {getNodeRelations(selectedNode.id).map((rel, i) => (
              <div key={i} className="detail-relation-item">
                <span className="relation-arrow">&rarr;</span>
                <span className="relation-target">{selectedNode.name === rel.source ? rel.target : rel.source}</span>
                <span className="relation-type-badge" style={{ color: RELATION_COLORS[rel.type], borderColor: RELATION_COLORS[rel.type] }}>
                  {RELATION_LABELS[rel.type] ?? rel.type}
                </span>
                {rel.description && <span className="relation-desc">{rel.description}</span>}
                {rel.confidence && <span className="relation-confidence">置信度: {rel.confidence}</span>}
                {rel.sourceUrl && (
                  <a href={rel.sourceUrl} target="_blank" rel="noopener noreferrer" className="relation-source">
                    来源
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .graph-legend {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          padding: 0.75rem 0;
          margin-bottom: 0.5rem;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .graph-container {
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          background: var(--bg);
        }
        .graph-edge-tooltip {
          position: fixed;
          bottom: 2rem;
          left: 50%;
          transform: translateX(-50%);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          z-index: 10;
          max-width: 400px;
        }
        .graph-edge-tooltip p {
          margin: 0.25rem 0 0;
          color: var(--text-secondary);
          font-size: 0.8rem;
        }
        .graph-node-detail {
          position: fixed;
          top: 5rem;
          right: 1.5rem;
          width: 320px;
          max-height: 60vh;
          overflow-y: auto;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 1rem;
          z-index: 20;
        }
        .detail-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }
        .detail-name {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--cyan);
          text-decoration: none;
        }
        .detail-name:hover {
          text-decoration: underline;
        }
        .detail-type {
          font-size: 0.75rem;
          color: var(--text-muted);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 0.1rem 0.4rem;
        }
        .detail-badge {
          font-size: 0.7rem;
          color: var(--amber);
          border: 1px dashed var(--amber);
          border-radius: 4px;
          padding: 0.1rem 0.4rem;
        }
        .detail-close {
          margin-left: auto;
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 1.2rem;
          cursor: pointer;
        }
        .detail-relation-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.35rem 0;
          font-size: 0.85rem;
          flex-wrap: wrap;
        }
        .relation-target {
          color: var(--text);
        }
        .relation-type-badge {
          font-size: 0.75rem;
          padding: 0.1rem 0.4rem;
          border: 1px solid;
          border-radius: 4px;
        }
        .relation-desc {
          color: var(--text-secondary);
          font-size: 0.8rem;
        }
        .relation-confidence {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .relation-source {
          font-size: 0.75rem;
          color: var(--cyan);
          text-decoration: none;
        }
        .relation-source:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
