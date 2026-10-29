import { ReactNode, useEffect, useRef } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  // "danger" is for actions that undo something (red button); "primary" for everything else.
  tone?: 'primary' | 'danger';
  // True while the confirmed action is running: both buttons lock so it can't be submitted twice.
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Go back',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Start on the safe button so a stray Enter press never confirms; stop the page behind from scrolling.
  useEffect(() => {
    cancelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancelRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy]);

  // Keep Tab inside the dialog by cycling between its two buttons.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const first = cancelRef.current;
    const last = confirmRef.current;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={trapTab}
        className="glass w-full max-w-md rounded-3xl p-8 shadow-2xl"
      >
        <h2 id="confirm-dialog-title" className="text-2xl font-extrabold">
          {title}
        </h2>
        <div className="mt-4 text-white/70 text-sm space-y-3">{children}</div>
        <div className="mt-8 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-5 py-3 rounded-2xl border border-white/20 text-white/80 hover:bg-white/10 disabled:opacity-50 transition-all duration-300"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`px-5 py-3 rounded-2xl font-semibold hover:scale-105 disabled:opacity-60 disabled:hover:scale-100 transition-all duration-300 ${
              tone === 'danger'
                ? 'bg-gradient-to-r from-[#ef4444] to-[#dc2626]'
                : 'bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f97316]'
            }`}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
