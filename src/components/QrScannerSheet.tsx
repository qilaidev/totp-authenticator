"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftEntry } from "@/types/auth";
import { createQrDecoder, decodeQrFromFile } from "@/lib/qr";
import { isMigrationUri, parseScannedText } from "@/lib/totp";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { CameraOffIcon, CloseIcon, ImageUpIcon, ScanFrame } from "./icons";

type ScannerStatus = "starting" | "scanning" | "denied" | "no-camera";

const STATUS_TEXT: Record<ScannerStatus, string> = {
  starting: "正在启动摄像头…",
  scanning: "将二维码放入取景框",
  denied: "摄像头权限被拒绝，可改用下方的图片导入",
  "no-camera": "此设备没有可用的摄像头，可改用下方的图片导入",
};

/** Frame interval for the decode loop — 140 ms keeps the main thread free. */
const SCAN_INTERVAL = 140;

/**
 * `getUserMedia` never settles while a permission prompt is waiting for the user,
 * so after this long we stop pretending the camera is about to appear.
 */
const CAMERA_TIMEOUT = 5000;

interface QrScannerSheetProps {
  onClose: () => void;
  onResult: (entry: DraftEntry) => void;
}

/** Mounted only while the scanner is open, so every open starts from a clean state. */
export function QrScannerSheet({ onClose, onResult }: QrScannerSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [hint, setHint] = useState("");

  useFocusTrap(dialogRef, true, onClose);

  const handleDecoded = useCallback(
    (text: string): boolean => {
      const entry = parseScannedText(text);
      if (!entry) {
        // Setting state on every frame would re-render the sheet ~7x/second
        // while the camera points at an unrelated QR code.
        const message = isMigrationUri(text)
          ? "这是 Google 身份验证器的批量导出码，本工具暂不支持，请改用单个账号的二维码"
          : "这个二维码里没有可用的 2FA 密钥";
        setHint((current) => (current === message ? current : message));
        return false;
      }
      onResult(entry);
      return true;
    },
    [onResult],
  );

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    const video = videoRef.current;

    const slowTimer = window.setTimeout(() => {
      if (!cancelled) {
        setHint("摄像头还没就绪。若没看到授权提示，可直接用下方的图片导入");
      }
    }, CAMERA_TIMEOUT);

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        window.clearTimeout(slowTimer);
        if (!cancelled) setStatus("no-camera");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (error) {
        if (cancelled) return;
        window.clearTimeout(slowTimer);
        const name = error instanceof DOMException ? error.name : "";
        setHint("");
        setStatus(
          name === "NotAllowedError" || name === "SecurityError" ? "denied" : "no-camera",
        );
        return;
      }

      if (cancelled || !video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // autoplay can be rejected while the sheet animates in; the loop still works
      }

      const decode = await createQrDecoder();
      if (cancelled) return;
      window.clearTimeout(slowTimer);
      setStatus("scanning");
      setHint("");

      const tick = async () => {
        if (cancelled) return;
        if (video.readyState >= 2) {
          const value = await decode(video);
          if (cancelled) return;
          if (value && handleDecoded(value)) return;
        }
        timer = window.setTimeout(() => void tick(), SCAN_INTERVAL);
      };

      void tick();
    };

    void start();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(slowTimer);
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [handleDecoded]);

  const handleFileChange = async (file: File | undefined) => {
    if (!file) return;
    setHint("正在识别图片…");
    const text = await decodeQrFromFile(file);
    if (!text) {
      setHint("没有在这张图片里找到二维码");
      return;
    }
    handleDecoded(text);
  };

  const cameraUnavailable = status === "denied" || status === "no-camera";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="g-fade-in absolute inset-0 bg-[var(--g-scrim)]"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="扫描二维码"
        tabIndex={-1}
        className="g-sheet-in g-safe-bottom relative w-full max-w-[560px] rounded-t-[20px] bg-[var(--g-surface)] px-5 pt-5 shadow-[var(--g-shadow-2)] outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-medium text-[var(--g-text)]">扫描二维码</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex size-9 cursor-pointer items-center justify-center rounded-full text-[var(--g-text-secondary)] transition-colors hover:bg-[var(--g-hover)] focus-visible:ring-2 focus-visible:ring-[var(--g-blue)] focus-visible:outline-none"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="size-full object-cover"
          />

          {status === "scanning" ? (
            <>
              <ScanFrame className="absolute inset-[12%] size-auto opacity-90" />
              <div className="g-scanline absolute inset-x-[12%] h-0.5 rounded-full bg-[var(--g-blue)]" />
            </>
          ) : null}

          {cameraUnavailable ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#202124] px-6 text-center">
              <CameraOffIcon className="size-8 text-white/70" />
              <p className="text-[13px] leading-[1.5] text-white/70">{STATUS_TEXT[status]}</p>
            </div>
          ) : null}
        </div>

        <p
          role="status"
          aria-live="polite"
          className="mt-3 min-h-10 text-center text-[13px] leading-[1.5] text-[var(--g-text-secondary)]"
        >
          {hint || (cameraUnavailable ? "" : STATUS_TEXT[status])}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void handleFileChange(file);
          }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--g-border)] px-4 py-3 text-[15px] font-medium text-[var(--g-blue)] transition-colors hover:bg-[var(--g-blue-tint)] focus-visible:ring-2 focus-visible:ring-[var(--g-blue)] focus-visible:outline-none"
        >
          <ImageUpIcon className="size-[18px]" />
          从图片导入二维码
        </button>
      </div>
    </div>
  );
}
