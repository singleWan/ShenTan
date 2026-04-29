'use client';

import { memo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { statusLabel, formatSourceDisplay } from '@/lib/labels';
import ConfirmDialog from './ConfirmDialog';

interface CharacterCardProps {
  id: number;
  name: string;
  type: string;
  source: string | null;
  status: string;
  imageUrl: string | null;
}

function CharacterCardInner({
  id,
  name,
  type,
  source,
  status,
  imageUrl,
}: CharacterCardProps) {
  const router = useRouter();
  const imageSrc = imageUrl
    ? imageUrl.startsWith('http')
      ? imageUrl
      : `/api/images/${imageUrl}`
    : null;
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
          <div className="card-image-wrapper">
            {imageSrc ? (
              <img src={imageSrc} alt={name} className="card-image" loading="lazy" />
            ) : (
              <div className="card-image-placeholder">
                <svg
                  viewBox="0 0 24 24"
                  width="32"
                  height="32"
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
          <div className="card-header">
            <h3>{name}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`badge badge-${status}`}>
                <span className="badge-dot" />
                {statusLabel(status)}
              </span>
              <button className="card-delete-btn" onClick={handleDelete} title="删除角色">
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

      <ConfirmDialog
        open={showConfirm}
        message={<>确定要删除角色「{name}」及其所有事件和反应数据吗？此操作不可恢复。</>}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

const CharacterCard = memo(CharacterCardInner);
export default CharacterCard;
