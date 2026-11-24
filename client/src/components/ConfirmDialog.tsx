import React from 'react';
import { useApp } from '../context/AppContext';
import { Modal } from './Modal';

export const ConfirmDialog: React.FC = () => {
  const { confirmState, resolveConfirm } = useApp();
  if (!confirmState) return null;

  const { title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive } =
    confirmState.options;

  return (
    <Modal
      open={true}
      onClose={() => resolveConfirm(false)}
      title={title}
      maxWidthClass="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={() => resolveConfirm(false)}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            className={`px-4 py-2 text-xs font-medium rounded-lg text-white transition-colors ${
              destructive
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{message}</p>
    </Modal>
  );
};
