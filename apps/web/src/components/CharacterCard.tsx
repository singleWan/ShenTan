'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { statusLabel, formatSourceDisplay } from '@/lib/labels';

interface CharacterCardProps {
  id: number;
  name: string;
  type: string;
  source: string | null;
  status: string;
}

export default function CharacterCard({ id, name, type, source, status }: CharacterCardProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/characters/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <Link href={`/characters/${id}`} className="card-link">
        <div className="character-card hud-card">
          <div className="card-header">
            <h3>{name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`badge badge-${status}`}>
                <span className="badge-dot" />
                {statusLabel(status)}
              </span>
              <button
                className="card-delete-btn"
                onClick={handleDelete}
                title="删除角色"
              >
                删除
              </button>
            </div>
          </div>
          <div className="card-meta">
            <span>{type === 'fictional' ? '虚构角色' : '历史人物'}</span>
            {source && <span>来源: {formatSourceDisplay(source)}</span>}
          </div>
        </div>
      </Link>

      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>
              确定要删除角色「{name}」及其所有事件和反应数据吗？此操作不可恢复。
            </p>
            <div className="confirm-actions">
              <button
                className="btn-confirm-cancel"
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
              >
                取消
              </button>
              <button
                className="btn-confirm-delete"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
