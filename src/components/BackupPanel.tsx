"use client";

import { memo, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { DownloadIcon, UploadIcon } from "./icons";

interface BackupPanelProps {
  count: number;
  onExport: () => void;
  /** Returns true when something was imported, so the sheet can close. */
  onImportText: (text: string) => boolean;
}

const buttonClass =
  "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--g-border)] bg-[var(--g-surface)] px-3 py-2.5 text-[14px] font-medium text-[var(--g-blue)] transition-colors hover:bg-[var(--g-blue-tint)] focus-visible:ring-2 focus-visible:ring-[var(--g-blue)] focus-visible:outline-none disabled:cursor-default disabled:text-[var(--g-text-muted)] disabled:hover:bg-[var(--g-surface)]";

/**
 * Export / import. Inside Telegram a blob download goes nowhere, so export
 * copies the backup text and import takes it pasted back (or a file where the
 * client offers a picker).
 */
function BackupPanelComponent({ count, onExport, onImportText }: BackupPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-6 flex gap-2">
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <UploadIcon className="size-[17px]" />
        导入
      </button>
      <button type="button" onClick={onExport} disabled={count === 0} className={buttonClass}>
        <DownloadIcon className="size-[17px]" />
        导出
      </button>
      {open ? (
        <ImportSheet
          onClose={() => setOpen(false)}
          onImportText={(text) => {
            const ok = onImportText(text);
            if (ok) setOpen(false);
            return ok;
          }}
        />
      ) : null}
    </section>
  );
}

function ImportSheet({
  onClose,
  onImportText,
}: {
  onClose: () => void;
  onImportText: (text: string) => boolean;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  useFocusTrap(sheetRef, true, onClose);

  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center">
      <div
        className="g-fade-in absolute inset-0 bg-[var(--g-scrim)]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="导入"
        tabIndex={-1}
        className="g-safe-bottom relative w-full max-w-[560px] rounded-t-[20px] bg-[var(--g-surface)] p-5 shadow-[var(--g-shadow-2)] outline-none"
      >
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="粘贴导出的内容"
          aria-label="导出的内容"
          rows={5}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full resize-none rounded-lg border border-[var(--g-border)] bg-[var(--g-surface)] p-3 font-mono text-[13px] text-[var(--g-text)] outline-none placeholder:font-sans placeholder:text-[var(--g-text-muted)] focus:border-[var(--g-blue)]"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json,.txt,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void file.text().then(onImportText, () => onImportText(""));
          }}
        />

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={buttonClass}
          >
            选择文件
          </button>
          <button
            type="button"
            onClick={() => onImportText(text)}
            disabled={text.trim() === ""}
            className="flex-1 cursor-pointer rounded-lg bg-[var(--g-blue)] px-3 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[var(--g-blue-hover)] focus-visible:ring-2 focus-visible:ring-[var(--g-blue)] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
          >
            导入
          </button>
        </div>
      </div>
    </div>
  );
}

export const BackupPanel = memo(BackupPanelComponent);
