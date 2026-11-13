"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { ScanLineIcon } from "./icons";

export interface FormErrors {
  remark?: string;
  secret?: string;
}

interface AddCodeFormProps {
  remark: string;
  secret: string;
  errors: FormErrors;
  onRemarkChange: (value: string) => void;
  onSecretChange: (value: string) => void;
  onScanClick: () => void;
  onSubmit: () => void;
  /** e.g. "已识别参数：SHA256 · 8 位 · 60 秒" — shown after a scan or paste. */
  metaNote: string | null;
}

const inputClass =
  "w-full rounded-lg border bg-[var(--g-surface)] px-[15px] py-[15px] text-[16px] leading-[1.2] text-[var(--g-text)] outline-none transition-colors placeholder:text-[var(--g-text-muted)]";

function AddCodeFormComponent({
  remark,
  secret,
  errors,
  onRemarkChange,
  onSecretChange,
  onScanClick,
  onSubmit,
  metaNote,
}: AddCodeFormProps) {
  return (
    <section>
      <h2 className="mb-5 text-[16px] font-medium text-[var(--g-text)]">添加 / 更新验证码</h2>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        noValidate
      >
        <div className="mb-[15px]">
          <input
            type="text"
            value={remark}
            onChange={(event) => onRemarkChange(event.target.value)}
            placeholder="请输入备注如：123"
            aria-label="备注"
            aria-invalid={Boolean(errors.remark)}
            aria-describedby={errors.remark ? "remark-error" : undefined}
            autoComplete="off"
            maxLength={64}
            enterKeyHint="next"
            className={cn(
              inputClass,
              errors.remark
                ? "border-[var(--g-red)] focus:border-[var(--g-red)]"
                : "border-[var(--g-border)] focus:border-[var(--g-blue)]",
            )}
          />
          {errors.remark ? (
            <p id="remark-error" role="alert" className="mt-1.5 text-[13px] text-[var(--g-red)]">
              {errors.remark}
            </p>
          ) : null}
        </div>

        <div className="mb-[15px]">
          <div className="relative">
            <input
              type="text"
              value={secret}
              onChange={(event) => onSecretChange(event.target.value)}
              placeholder="请输入密钥如：QXT56RTBY3S5IL57J"
              aria-label="密钥"
              aria-invalid={Boolean(errors.secret)}
              aria-describedby={errors.secret ? "secret-error" : "secret-hint"}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={256}
              enterKeyHint="done"
              className={cn(
                inputClass,
                "pr-[52px] font-mono tracking-[0.5px]",
                errors.secret
                  ? "border-[var(--g-red)] focus:border-[var(--g-red)]"
                  : "border-[var(--g-border)] focus:border-[var(--g-blue)]",
              )}
            />
            <button
              type="button"
              onClick={onScanClick}
              title="扫描二维码"
              aria-label="扫描二维码"
              className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-[var(--g-text-secondary)] transition-colors hover:bg-[var(--g-hover)] hover:text-[var(--g-blue)] focus-visible:ring-2 focus-visible:ring-[var(--g-blue)] focus-visible:outline-none"
            >
              <ScanLineIcon className="size-5" />
            </button>
          </div>
          {errors.secret ? (
            <p id="secret-error" role="alert" className="mt-1.5 text-[13px] text-[var(--g-red)]">
              {errors.secret}
            </p>
          ) : (
            <p id="secret-hint" className="mt-1.5 text-[13px] text-[var(--g-text-muted)]">
              {metaNote ?? "支持直接粘贴 otpauth:// 链接，会自动识别备注与密钥"}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="mt-2.5 w-full cursor-pointer rounded-lg bg-[var(--g-blue)] px-4 py-[15px] text-[16px] font-medium text-white transition-colors duration-200 hover:bg-[var(--g-blue-hover)] focus-visible:ring-2 focus-visible:ring-[var(--g-blue)] focus-visible:ring-offset-2 focus-visible:outline-none active:bg-[var(--g-blue-active)]"
        >
          保存
        </button>
      </form>
    </section>
  );
}

export const AddCodeForm = memo(AddCodeFormComponent);
