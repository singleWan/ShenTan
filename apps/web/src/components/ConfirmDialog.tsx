'use client';

import { type ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title = '确认删除',
  message,
  confirmLabel = '确认删除',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn-confirm-cancel" onClick={onCancel} disabled={loading}>
            取消
          </button>
          <button className="btn-confirm-delete" onClick={onConfirm} disabled={loading}>
            {loading ? '删除中...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
