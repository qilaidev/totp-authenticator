"use client";

import { useRef } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText,
  cancelText = "取消",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, onCancel);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center px-6">
      <div
        className="g-fade-in absolute inset-0 bg-[var(--g-scrim)]"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        tabIndex={-1}
        className="g-dialog-in relative w-full max-w-[360px] rounded-[20px] bg-[var(--g-surface)] p-6 shadow-[var(--g-shadow-2)] outline-none"
      >
        <h2 id="confirm-title" className="mb-2 text-[18px] font-medium text-[var(--g-text)]">
          {title}
        </h2>
        <p
          id="confirm-description"
          className="text-[14px] leading-[1.6] break-words text-[var(--g-text-secondary)]"
        >
          {description}
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-full px-4 py-2 text-[14px] font-medium text-[var(--g-blue)] transition-colors hover:bg-[var(--g-blue-tint)] focus-visible:ring-2 focus-visible:ring-[var(--g-blue)] focus-visible:outline-none"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="cursor-pointer rounded-full px-4 py-2 text-[14px] font-medium text-[var(--g-red)] transition-colors hover:bg-[var(--g-red-tint)] focus-visible:ring-2 focus-visible:ring-[var(--g-red)] focus-visible:outline-none"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
