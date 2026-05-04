import { useEffect, useState } from 'react';
import './Toast.css';

export interface ToastMessage {
  id: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface Props {
  darkMode: boolean;
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export default function ToastStack({ darkMode, toasts, onDismiss }: Props) {
  return (
    <div className={`toast-stack ${darkMode ? 'dark' : ''}`}>
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} darkMode={darkMode} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  darkMode,
  onDismiss,
}: {
  toast: ToastMessage;
  darkMode: boolean;
  onDismiss: (id: string) => void;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLeaving(true);
      window.setTimeout(() => onDismiss(toast.id), 180);
    }, toast.durationMs ?? 8000);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.durationMs, onDismiss]);

  return (
    <div className={`toast ${darkMode ? 'dark' : ''} ${leaving ? 'leaving' : ''}`}>
      <span className="toast-text">{toast.text}</span>
      {toast.actionLabel && toast.onAction && (
        <button
          className="toast-action"
          onClick={() => {
            toast.onAction?.();
            onDismiss(toast.id);
          }}
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        className="toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
