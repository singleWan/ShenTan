'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from './ConfirmDialog';

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

      <ConfirmDialog
        open={showConfirm}
        message={<>确定要删除角色「{characterName}」及其所有事件和反应数据吗？此操作不可恢复。</>}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
