"use client";

import { cn } from "@/lib/utils";

const SIZE = 40;
const RADIUS = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // 100.53 — same constant the original hard-coded

interface CountdownRingProps {
  remaining: number;
  period: number;
  urgent: boolean;
}

export function CountdownRing({ remaining, period, urgent }: CountdownRingProps) {
  const ratio = Math.max(0, Math.min(1, remaining / period));
  const offset = CIRCUMFERENCE * (1 - ratio);
  // Don't animate the wrap-around tick, or the ring visibly rewinds backwards.
  const isReset = remaining >= period;

  return (
    <div
      className="relative shrink-0"
      style={{ width: SIZE, height: SIZE }}
      role="timer"
      aria-label={`验证码将在 ${remaining} 秒后刷新`}
    >
      <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden="true">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="transparent"
          strokeWidth={3}
          className="stroke-[var(--g-track)]"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="transparent"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className={cn(
            "transition-[stroke-dashoffset,stroke] duration-300 ease-linear",
            urgent ? "stroke-[var(--g-red)]" : "stroke-[var(--g-blue)]",
            isReset && "transition-none",
          )}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center text-[11px] font-medium tabular-nums transition-colors",
          urgent ? "text-[var(--g-red)]" : "text-[var(--g-text-secondary)]",
        )}
      >
        {remaining}
      </span>
    </div>
  );
}
