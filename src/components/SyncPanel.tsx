"use client";

import { memo } from "react";
import type { SyncStatus } from "@/lib/cloud-sync";
import { CloudIcon } from "./icons";

interface SyncPanelProps {
  status: SyncStatus;
  onRetry: () => void;
}

const linkButtonClass =
  "cursor-pointer rounded-md px-2 py-1 text-[13px] font-medium text-[var(--g-blue)] transition-colors hover:bg-[var(--g-blue-tint)] focus-visible:ring-2 focus-visible:ring-[var(--g-blue)] focus-visible:outline-none disabled:cursor-default disabled:text-[var(--g-text-muted)] disabled:hover:bg-transparent";

/**
 * Nothing at all while sync is working.
 *
 * Sync runs by itself and has no switch, so a row confirming that it worked is
 * a row that is correct every time and worth reading never — it only pushes
 * the codes down the screen. The one state worth a row is the opposite: this
 * device is out of step with the others, and there is something to press.
 */
function SyncPanelComponent({ status, onRetry }: SyncPanelProps) {
  if (status.phase !== "on" || !status.error) return null;

  return (
    <section className="mb-4 flex items-center gap-2 rounded-lg bg-[var(--g-surface-2)] px-3.5 py-2.5">
      <CloudIcon className="size-[18px] shrink-0 text-[var(--g-blue)]" />
      <p className="min-w-0 flex-1 text-[13px] text-[var(--g-red)]">{status.error}</p>
      <button type="button" onClick={onRetry} disabled={status.busy} className={linkButtonClass}>
        重试
      </button>
    </section>
  );
}

export const SyncPanel = memo(SyncPanelComponent);
