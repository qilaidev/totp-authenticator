import type { MetadataRoute } from "next";

import { withBase } from "@/lib/base-path";
import { APP_SHORT_TITLE, APP_TITLE } from "@/lib/app-meta";

// Required by `output: export` — the manifest is a build-time constant.
export const dynamic = "force-static";

/**
 * Lets the page be installed to a home screen, and gives Telegram a name and
 * colour to use for the mini app chrome. `display: standalone` matters mainly
 * outside Telegram — an authenticator is something people return to daily.
 *
 * `start_url` / `scope` / `icons[].src` 走 `withBase()`：这些属于 manifest JSON 字段，
 * Next.js 不会自动拼接 `basePath`；子路径部署时若遗漏，桌面快捷方式会错误跳转到站点根路径。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_TITLE,
    short_name: APP_SHORT_TITLE,
    description:
      "离线生成两步验证（TOTP）验证码，密钥保存在本设备浏览器中；可选的跨设备同步只会把加密后的副本交给 Telegram。",
    lang: "zh-CN",
    start_url: withBase("/"),
    scope: withBase("/"),
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1a73e8",
    categories: ["utilities", "security"],
    icons: [
      { src: withBase("/icon.svg"), sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
