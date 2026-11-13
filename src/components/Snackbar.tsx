"use client";

import { useEffect } from "react";

interface SnackbarProps {
  message: string;
  /** Changing this id restarts the auto-dismiss timer for a repeated message. */
  id: number;
  onDismiss: () => void;
}

export function Snackbar({ message, id, onDismiss }: SnackbarProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 2200);
    return () => window.clearTimeout(timer);
  }, [id, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="g-snack-in pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-60 flex justify-center px-5"
    >
      <span className="max-w-[560px] rounded-lg bg-[#323236] px-4 py-3 text-[14px] leading-[1.4] text-white shadow-[var(--g-shadow-2)]">
        {message}
      </span>
    </div>
  );
}
