/** What to say under "还没有验证码". */
export type EmptyHint = "local-only" | "synced";

/**
 * The second line exists because an empty list reads as lost data, and what it
 * means depends on whether this device is syncing: inside Telegram the codes
 * follow the account, outside it they never leave the browser they were added
 * in — and that is the case where a backup is the only way back.
 */
export function EmptyState({ hint }: { hint: EmptyHint }) {
  return (
    <div className="mb-5 rounded-lg bg-[var(--g-surface-2)] px-4 py-3 text-center">
      <p className="text-[14px] text-[var(--g-text-secondary)]">还没有验证码，在下方添加</p>
      <p className="mt-1 text-[12.5px] leading-[1.5] text-[var(--g-text-muted)]">
        {hint === "synced"
          ? "添加后会跟着这个 Telegram 账号走，换台设备登录也能看到。"
          : "验证码只保存在添加它的那台设备上。换手机或清缓存前，先导出备份。"}
      </p>
    </div>
  );
}
