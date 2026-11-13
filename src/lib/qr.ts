/**
 * QR decoding with two backends:
 *  1. the native `BarcodeDetector` (Chrome / Android WebView / Telegram Android)
 *  2. a lazily imported `jsQR` fallback for Safari, iOS and desktop Firefox
 */

export type QrSource =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap;

export type QrDecoder = (source: QrSource) => Promise<string | null>;

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function getNativeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

function sourceSize(source: QrSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/** Downscale large frames — jsQR is O(pixels) and 4K frames stall the loop. */
const MAX_SCAN_EDGE = 720;

function readImageData(source: QrSource): ImageData | null {
  const { width, height } = sourceSize(source);
  if (!width || !height) return null;

  const scale = Math.min(1, MAX_SCAN_EDGE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(source as CanvasImageSource, 0, 0, targetWidth, targetHeight);
  try {
    return context.getImageData(0, 0, targetWidth, targetHeight);
  } catch {
    return null;
  }
}

export async function createQrDecoder(): Promise<QrDecoder> {
  const NativeDetector = getNativeDetectorCtor();

  if (NativeDetector) {
    try {
      const detector = new NativeDetector({ formats: ["qr_code"] });
      return async (source) => {
        try {
          const results = await detector.detect(source as CanvasImageSource);
          return results[0]?.rawValue ?? null;
        } catch {
          return null;
        }
      };
    } catch {
      // fall through to jsQR
    }
  }

  const { default: jsQR } = await import("jsqr");
  return async (source) => {
    const imageData = readImageData(source);
    if (!imageData) return null;
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    return result?.data ?? null;
  };
}

/** Decode a QR code from a picked image file (gallery / screenshot import). */
export async function decodeQrFromFile(file: File): Promise<string | null> {
  const decode = await createQrDecoder();

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const value = await decode(bitmap);
      bitmap.close();
      if (value) return value;
    } catch {
      // fall through to the <img> path
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return await decode(image);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
