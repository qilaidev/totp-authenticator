"use client";

import { AlertIcon } from "./icons";

interface ClockSkewNoticeProps {
  /** `serverNow - localNow` in milliseconds; always past the warning threshold. */
  offsetMs: number;
}

/**
 * The single most common "the app is broken" report for any authenticator is a
 * device clock that has drifted. The codes are correct for the time the phone
 * believes in, and every server rejects them.
 *
 * The app already compensates — codes on screen are generated against the
 * corrected time — but the user still has to fix the clock, because every other
 * authenticator they own is wrong too.
 */
export function ClockSkewNotice({ offsetMs }: ClockSkewNoticeProps) {
  const seconds = Math.round(Math.abs(offsetMs) / 1000);
  const direction = offsetMs > 0 ? "慢" : "快";

  return (
    <div
      role="status"
      className="mb-5 flex gap-2.5 rounded-xl border border-[var(--g-amber)]/40 bg-[var(--g-amber-tint)] px-4 py-3"
    >
      <AlertIcon className="mt-px size-[18px] shrink-0 text-[var(--g-amber)]" />
      <p className="text-[13px] leading-[1.6] text-[var(--g-text)]">
        本机时间比标准时间{direction}了约 {seconds} 秒。验证码依赖精确时间，页面已按校正后的时间
        生成下方验证码；请到系统设置里打开「自动设置日期与时间」，否则其它验证器仍会出错。
      </p>
    </div>
  );
}
