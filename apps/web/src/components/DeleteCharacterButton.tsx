'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteCharacterButtonProps {
  characterId: number;
  characterName: string;
}

export default function DeleteCharacterButton({ characterId, characterName }: DeleteCharacterButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/characters/${characterId}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/');
        router.refresh();
      }
    } finally {
      setDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <button
        className="btn-delete"
        onClick={() => setShowConfirm(true)}
      >
        删除角色
      </button>

      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>确认删除</h3>
            <p>
              确定要删除角色「{characterName}」及其所有事件和反应数据吗？此操作不可恢复。
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
