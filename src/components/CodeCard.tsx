"use client";

import { memo } from "react";
import type { AuthEntry } from "@/types/auth";
import { formatCode } from "@/lib/totp";
import { cn } from "@/lib/utils";
import { CountdownRing } from "./CountdownRing";
import { TrashIcon } from "./icons";

const URGENT_SECONDS = 5;

interface CodeCardProps {
  entry: AuthEntry;
  code: string;
  /** The stored secret could not be decoded — an entry from before validation. */
  invalid: boolean;
  remaining: number;
  period: number;
  /** Takes the entry so the parent can memoise one stable handler for all rows. */
  onCopy: (entry: AuthEntry) => void;
  onDelete: (entry: AuthEntry) => void;
}

/**
 * Memoised so that everything which is not the clock — typing in the add form,
 * a toast appearing, the scanner opening — stops re-rendering every card. The
 * parent passes stable, entry-taking handlers to make this hold.
 */
function CodeCardComponent({
  entry,
  code,
  invalid,
  remaining,
  period,
  onCopy,
  onDelete,
}: CodeCardProps) {
  const urgent = !invalid && remaining <= URGENT_SECONDS;

  return (
    <article className="flex items-center gap-3 rounded-xl border border-[var(--g-border)] bg-[var(--g-surface)] px-4 py-3.5 transition-shadow hover:shadow-[var(--g-shadow-1)]">
      <button
        type="button"
        onClick={() => onCopy(entry)}
        disabled={invalid || !code}
        className="flex min-w-0 flex-1 cursor-pointer flex-col items-start rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--g-blue)] disabled:cursor-default"
        aria-label={invalid ? `${entry.remark}：密钥无法解析` : `复制 ${entry.remark} 的验证码`}
      >
        <span className="mb-[5px] max-w-full truncate text-[14px] leading-[1.3] text-[var(--g-text-secondary)]">
          {entry.remark}
        </span>
        {invalid ? (
          <span className="text-[14px] leading-[1.4] text-[var(--g-red)]">
            密钥无法解析，请删除后重新添加
          </span>
        ) : (
          <span
            className={cn(
              "text-[28px] leading-[1.15] font-medium tracking-[2px] tabular-nums transition-colors",
              urgent ? "text-[var(--g-red)]" : "text-[var(--g-blue)]",
            )}
          >
            {code ? formatCode(code) : "••• •••"}
          </span>
        )}
      </button>

      <div className="flex items-center gap-3">
        {invalid ? null : (
          <CountdownRing remaining={remaining} period={period} urgent={urgent} />
        )}

        <button
          type="button"
          onClick={() => onDelete(entry)}
          title="删除"
          aria-label={`删除 ${entry.remark}`}
          className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--g-text-secondary)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--g-red-tint)] hover:text-[var(--g-red)] focus-visible:ring-2 focus-visible:ring-[var(--g-red)] focus-visible:outline-none active:scale-92"
        >
          <TrashIcon className="size-5" />
        </button>
      </div>
    </article>
  );
}

export const CodeCard = memo(CodeCardComponent);
