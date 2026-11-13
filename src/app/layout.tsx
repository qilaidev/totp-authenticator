import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TelegramWebApp } from "@/components/TelegramWebApp";
import { ServiceWorker } from "@/components/ServiceWorker";
import { NoShareGuard } from "@/components/NoShareGuard";
import { APP_TITLE } from "@/lib/app-meta";

const title = APP_TITLE;
const description =
  "基于浏览器原生 WebCrypto 离线生成标准 RFC 6238 两步验证（TOTP）动态验证码（兼容 Google Authenticator），密钥仅保存在本设备浏览器中，开启跨设备同步后仅通过 Telegram 传输加密密文。";

export const metadata: Metadata = {
  title,
  description,
  applicationName: title,
  formatDetection: { telephone: false, email: false, address: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title, statusBarStyle: "default" },
  // Nothing on this page should ever leak into a referrer: the URL is shared in
  // chats, and any query string a user pastes stays on the device.
  referrer: "no-referrer",
  robots: { index: true, follow: true },
  openGraph: { title, description, type: "website", locale: "zh_CN" },
};

// The original page ships `width=device-width, initial-scale=1.0,
// maximum-scale=1.0, user-scalable=no` — kept so the Telegram sheet can't zoom.
// `viewportFit: cover` is what makes `env(safe-area-inset-*)` non-zero on
// notched phones, which the safe-area padding below depends on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#202124" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <head>
        {/*
          Static export cannot set response headers, so the policy ships in the
          document. It is deliberately tight: this page loads one third-party
          script (Telegram's SDK) and talks to nobody — `connect-src 'self'` is
          what backs "这个页面自己不外发", since even a successful script injection
          would have nowhere to send anything. 跨设备同步不经过这里：`CloudStorage`
          走 SDK 的 postMessage 桥交给 Telegram 客户端，而且只交出密文。

          `'unsafe-inline'` on script-src is unavoidable for a Next.js static
          export — the hydration payload is inline.

          `frame-ancestors` is deliberately absent: browsers ignore it in a
          <meta> policy and warn about it in the console. 如需在 Telegram Web 中内嵌运行，
          请在静态托管层（Nginx / Cloudflare Pages 等）配置响应头：
          `frame-ancestors https://web.telegram.org https://*.telegram.org 'self'`。
          必须放行 telegram.org，否则 Telegram 网页版嵌不进这个小程序。
        */}
        <meta
          httpEquiv="Content-Security-Policy"
          content={[
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://telegram.org",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "media-src 'self' blob:",
            "connect-src 'self'",
            "font-src 'self'",
            "base-uri 'none'",
            "form-action 'none'",
            "object-src 'none'",
          ].join("; ")}
        />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <TelegramWebApp />
        <ServiceWorker />
        <NoShareGuard />
      </body>
    </html>
  );
}
