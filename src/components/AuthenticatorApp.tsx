"use client";

import { useCallback, useEffect, useState } from "react";
import { APP_TITLE } from "@/lib/app-meta";
import type { AuthEntry, DraftEntry } from "@/types/auth";
import {
  exportBackup,
  findDuplicateSecret,
  importBackup,
  removeEntry,
  saveEntry,
  syncDeviceStorage,
  useAuthEntries,
} from "@/lib/auth-store";
import { initCloudSync, syncNow, useSyncStatus } from "@/lib/cloud-sync";
import { useClockSkew, useSecondTick, useTotpCodes } from "@/hooks/use-totp";
import {
  DEFAULT_PERIOD,
  isValidSecret,
  normalizeSecret,
  parseOtpAuth,
  parseScannedText,
  remainingSeconds,
} from "@/lib/totp";
import { copyText, downloadTextFile } from "@/lib/clipboard";
import {
  canDownloadFiles,
  canScanWithTelegram,
  haptic,
  scanQrWithTelegram,
  setBackButton,
  useTelegram,
} from "@/lib/telegram";
import { AddCodeForm, type FormErrors } from "./AddCodeForm";
import { BackupPanel } from "./BackupPanel";
import { ClockSkewNotice } from "./ClockSkewNotice";
import { CodeCard } from "./CodeCard";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { QrScannerSheet } from "./QrScannerSheet";
import { Snackbar } from "./Snackbar";
import { SyncPanel } from "./SyncPanel";
import { BrandMark } from "./icons";

interface Toast {
  id: number;
  message: string;
}

/**
 * The non-default TOTP parameters carried by a scanned `otpauth://` URI.
 *
 * These have to survive the round trip through the form: the URI is the only
 * place they are ever stated, and saving without them silently downgrades a
 * SHA256 / 8-digit / 60-second account to SHA1 / 6 / 30 — which produces
 * confident, well-formatted, permanently wrong codes.
 */
type DraftMeta = Pick<DraftEntry, "issuer" | "digits" | "period" | "algorithm">;

const NO_META: DraftMeta = {};

function describeMeta(meta: DraftMeta): string | null {
  const parts: string[] = [];
  if (meta.algorithm) parts.push(meta.algorithm);
  if (meta.digits) parts.push(`${meta.digits} 位`);
  if (meta.period) parts.push(`${meta.period} 秒`);
  return parts.length > 0 ? `已识别参数：${parts.join(" · ")}` : null;
}

/** Accepts anything the QR pipeline can turn into an entry. */
function isScannableText(text: string): boolean {
  return parseScannedText(text) !== null;
}

export function AuthenticatorApp() {
  const entries = useAuthEntries();
  const tick = useSecondTick();
  const skew = useClockSkew();
  const telegram = useTelegram();
  const syncStatus = useSyncStatus();

  useEffect(() => {
    if (!telegram.ready) return;
    void syncDeviceStorage();
    initCloudSync();
  }, [telegram.ready]);

  // Only correct once the drift is large enough to matter. The `Date` header has
  // one-second resolution, so applying every measured millisecond would add
  // noise rather than accuracy.
  const now = skew.significant ? tick + skew.offsetMs : tick;
  const { codes, failed } = useTotpCodes(entries, now);

  const [remark, setRemark] = useState("");
  const [secret, setSecret] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [draftMeta, setDraftMeta] = useState<DraftMeta>(NO_META);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AuthEntry | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string) => {
    setToast({ id: Date.now(), message });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  const applyEntry = useCallback((entry: DraftEntry) => {
    setRemark((current) => (entry.remark ? entry.remark : current));
    setSecret(entry.secret);
    setErrors({});
    setDraftMeta({
      issuer: entry.issuer,
      digits: entry.digits,
      period: entry.period,
      algorithm: entry.algorithm,
    });
  }, []);

  const handleScanResult = useCallback(
    (entry: DraftEntry) => {
      setScannerOpen(false);
      applyEntry(entry);
      haptic("success");
      showToast(entry.remark ? "已识别二维码，确认后保存" : "已识别密钥，请填写备注");
    },
    [applyEntry, showToast],
  );

  /**
   * Inside Telegram, prefer the client's own camera sheet: the in-app WebView
   * denies `getUserMedia` outright on several iOS builds, and where it works it
   * fights the client for the camera. Fall back to the in-page scanner whenever
   * Telegram cannot help.
   */
  const handleScanClick = useCallback(() => {
    haptic("tap");
    if (!canScanWithTelegram()) {
      setScannerOpen(true);
      return;
    }

    void scanQrWithTelegram("对准 2FA 二维码", isScannableText).then((result) => {
      if (result.status === "ok") {
        const entry = parseScannedText(result.text);
        if (entry) {
          handleScanResult(entry);
          return;
        }
      }
      if (result.status === "unsupported") setScannerOpen(true);
      // "cancelled" is the user's decision — do not reopen anything.
    });
  }, [handleScanResult]);

  const handleSecretChange = useCallback(
    (value: string) => {
      const parsed = parseOtpAuth(value);
      if (parsed) {
        applyEntry(parsed);
        showToast("已识别 otpauth 链接");
        return;
      }
      // Anything typed or pasted by hand is a bare secret with default
      // parameters; drop whatever a previous scan put there.
      setDraftMeta(NO_META);
      setSecret(value);
    },
    [applyEntry, showToast],
  );

  const handleSubmit = useCallback(() => {
    const trimmedRemark = remark.trim();
    const normalizedSecret = normalizeSecret(secret);
    const nextErrors: FormErrors = {};

    if (!trimmedRemark) nextErrors.remark = "请输入备注";
    if (!normalizedSecret) {
      nextErrors.secret = "请输入密钥";
    } else if (!isValidSecret(normalizedSecret)) {
      nextErrors.secret = "密钥格式不正确，只能包含 A–Z 和 2–7，且不少于 8 位";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      haptic("error");
      return;
    }

    const duplicate = findDuplicateSecret(normalizedSecret, trimmedRemark);
    const { result, persisted } = saveEntry({
      ...draftMeta,
      remark: trimmedRemark,
      secret: normalizedSecret,
    });

    setRemark("");
    setSecret("");
    setDraftMeta(NO_META);
    haptic("success");

    if (persisted === "quota") {
      showToast("已添加，但浏览器拒绝保存，刷新后会丢失");
    } else if (duplicate) {
      showToast(`已保存，但与「${duplicate.remark}」是同一个密钥`);
    } else {
      showToast(result === "updated" ? `已更新「${trimmedRemark}」` : `已添加「${trimmedRemark}」`);
    }
  }, [remark, secret, draftMeta, showToast]);

  const handleCopy = useCallback(
    (entry: AuthEntry) => {
      const code = codes[entry.id];
      if (!code) return;
      void copyText(code).then((ok) => {
        haptic(ok ? "tap" : "error");
        showToast(ok ? "已复制验证码" : "复制失败，请长按手动复制");
      });
    },
    [codes, showToast],
  );

  const handleDeleteRequest = useCallback((entry: AuthEntry) => {
    haptic("tap");
    setPendingDelete(entry);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    removeEntry(pendingDelete.id);
    setPendingDelete(null);
    haptic("warning");
    showToast(`已删除「${pendingDelete.remark}」`);
  }, [pendingDelete, showToast]);

  const cancelDelete = useCallback(() => setPendingDelete(null), []);
  const closeScanner = useCallback(() => setScannerOpen(false), []);

  const handleExport = useCallback(() => {
    const backup = exportBackup();
    if (canDownloadFiles()) {
      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`2fa-backup-${stamp}.json`, backup, "application/json");
      haptic("tap");
      showToast("已导出");
      return;
    }
    void copyText(backup).then((ok) => {
      haptic(ok ? "success" : "error");
      showToast(ok ? "已复制，粘贴到收藏夹保存" : "复制失败");
    });
  }, [showToast]);

  const handleImportText = useCallback(
    (text: string): boolean => {
      const summary = importBackup(text.trim());
      if (!summary) {
        haptic("error");
        showToast("内容无法识别");
        return false;
      }
      haptic(summary.added > 0 ? "success" : "warning");
      showToast(
        summary.persisted === "quota"
          ? `已导入 ${summary.added} 条，但保存失败，刷新后会丢失`
          : summary.added > 0
            ? `已导入 ${summary.added} 条`
            : "没有新增，条目都已存在",
      );
      return true;
    },
    [showToast],
  );

  /**
   * Telegram's back gesture closes the whole mini app by default. While an
   * overlay is up it should close the overlay instead — otherwise the first
   * instinct of every Android user dismisses the app.
   */
  const overlayOpen = scannerOpen || pendingDelete !== null;
  useEffect(() => {
    if (!telegram.inTelegram) return;
    if (!overlayOpen) {
      setBackButton(null);
      return;
    }
    setBackButton(() => {
      setScannerOpen(false);
      setPendingDelete(null);
    });
    return () => setBackButton(null);
  }, [telegram.inTelegram, overlayOpen]);

  return (
    <div className="g-viewport flex flex-col bg-[var(--g-bg)] text-[var(--g-text)]">
      <div className="g-safe-bottom mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 pt-5">
        <header className="mb-4 flex items-center gap-2">
          <BrandMark className="size-7" />
          <span className="text-[15px] font-medium text-[var(--g-text)]">
            {APP_TITLE}
          </span>
        </header>

        <SyncPanel status={syncStatus} onRetry={syncNow} />

        {entries.length === 0 ? (
          <h1 className="mb-6 text-[20px] leading-[1.4] font-medium text-[var(--g-blue)]">
            离线生成标准 RFC 6238 两步验证动态码（兼容 Google Authenticator），为您的所有账号提供本地优先的安全保护。
          </h1>
        ) : null}

        {skew.significant ? <ClockSkewNotice offsetMs={skew.offsetMs} /> : null}

        {entries.length > 0 ? (
          <section aria-label="验证码列表" className="mb-5 flex flex-col gap-2.5">
            {entries.map((entry) => {
              const period = entry.period ?? DEFAULT_PERIOD;
              return (
                <CodeCard
                  key={entry.id}
                  entry={entry}
                  code={codes[entry.id] ?? ""}
                  invalid={failed[entry.id] === true}
                  remaining={remainingSeconds(period, now)}
                  period={period}
                  onCopy={handleCopy}
                  onDelete={handleDeleteRequest}
                />
              );
            })}
          </section>
        ) : (
          <EmptyState hint={syncStatus.phase === "on" ? "synced" : "local-only"} />
        )}

        <AddCodeForm
          remark={remark}
          secret={secret}
          errors={errors}
          onRemarkChange={setRemark}
          onSecretChange={handleSecretChange}
          onScanClick={handleScanClick}
          onSubmit={handleSubmit}
          metaNote={describeMeta(draftMeta)}
        />

        <BackupPanel
          count={entries.length}
          onExport={handleExport}
          onImportText={handleImportText}
        />
      </div>

      {scannerOpen ? (
        <QrScannerSheet onClose={closeScanner} onResult={handleScanResult} />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除验证码？"
        description={`删除「${pendingDelete?.remark ?? ""}」后，需要重新添加密钥才能再次获取验证码。`}
        confirmText="删除"
        onConfirm={handleConfirmDelete}
        onCancel={cancelDelete}
      />

      {toast ? <Snackbar id={toast.id} message={toast.message} onDismiss={dismissToast} /> : null}
    </div>
  );
}
