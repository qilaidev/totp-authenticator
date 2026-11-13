/**
 * 这个站点被挂在哪个路径下。
 *
 * 默认部署在域名或子域的根路径上，这里是空串。
 * 挂到某个子路径下时构建要带 `basePath`，而 `basePath` 只对 **Next 自己生成的 URL**
 * 生效——`/_next/*`、`<Link>`、`next/image` 那些。
 *
 * 剩下三处是我们自己写的字符串常量，Next 不会碰，必须自己拼：
 *
 *   1. `app/manifest.ts` 里的 `start_url` / `scope` / `icons[].src`——那是 manifest **正文**，
 *      对 Next 来说只是一段 JSON 数据
 *   2. `ServiceWorker.tsx` 里 `register()` 的脚本地址与 scope
 *   3. `public/sw.js`——`public/` 是逐字拷贝的，整个文件都不经过 Next
 *
 * 第 3 条没法用这个模块（Service Worker 里没有构建期常量），它改成从 `self.location`
 * 反推自己的挂载点，见那个文件顶部的注释。
 *
 * 值来自构建期环境变量 `NEXT_PUBLIC_BASE_PATH`，`next.config.ts` 读的是同一个变量——
 * 一处配置同时决定 Next 的 `basePath` 和这里，不会漂。不设就是空串，也就是挂在根上，
 * 独立部署（自己的域名、自己的子域）时什么都不用改。
 */

/** 归一化成 `""` 或 `"/2fa"`：有前导斜杠、没有尾随斜杠。 */
function normalize(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export const BASE_PATH = normalize(process.env.NEXT_PUBLIC_BASE_PATH ?? "");

/**
 * 把站内绝对路径拼上挂载点。
 *
 * `withBase("/sw.js")` → 挂在根上时是 `/sw.js`，挂在 `/2fa` 下时是 `/2fa/sw.js`。
 * `withBase("/")` 保留尾随斜杠（Service Worker 的 scope 需要它）。
 */
export function withBase(path: string): string {
  if (!BASE_PATH) return path;
  return path === "/" ? `${BASE_PATH}/` : `${BASE_PATH}${path}`;
}
