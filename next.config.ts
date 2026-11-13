import type { NextConfig } from "next";

/**
 * 静态导出（`output: "export"`）：无需 Node.js 服务端运行时，构建产物 `out/` 可直接
 * 部署至 Nginx、Cloudflare Pages、GitHub Pages 或任意静态托管服务。
 *
 * 这个应用天然适合静态导出——它 100% 在浏览器里跑：TOTP 用 WebCrypto 本地算，密钥只进
 * `localStorage`，运行时不依赖后端接口。没有 API 路由、没有 server action、没有
 * middleware。
 *
 * `basePath` 来自构建期的 `NEXT_PUBLIC_BASE_PATH`，默认为空（挂载在域名根路径）。
 * 同一个变量也被 `src/lib/base-path.ts` 读走，去拼那几处 Next 管不到的字符串常量。
 */

/** 归一化成 `""` 或 `"/2fa"`。和 `src/lib/base-path.ts` 的 `normalize` 同规则。 */
function normalizeBasePath(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH ?? "");

const nextConfig: NextConfig = {
  output: "export",

  // 空串会被 Next 当成「配了但为空」而报错，所以没有挂载点时整个键都不出现。
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),

  reactStrictMode: true,

  // 没必要向每个访客广告框架版本。
  poweredByHeader: false,

  // 安全工具的加密路径不该把可读源码发出去，而且 source map 会让 CDN 上的字节数翻倍。
  productionBrowserSourceMaps: false,

  // `output: export` 出的是普通静态文件，可由任意静态托管服务（Nginx / Cloudflare Pages 等）提供无后缀路径回退。
  trailingSlash: false,
};

export default nextConfig;
