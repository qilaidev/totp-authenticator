/*
 * Offline shell for the 2FA mini app.
 *
 * An authenticator that needs the network to show a code is a bad
 * authenticator: the codes are computed locally, so the only thing standing
 * between a user on a plane and their code is the page itself. This worker also
 * removes almost all repeat-visit traffic, which is what keeps the hosting cost
 * flat as the number of users grows.
 *
 * Strategy, deliberately conservative:
 *   - navigations: network first, cached shell as the fallback. A worker that
 *     served HTML from cache first could pin every user to a broken build.
 *   - /_next/static/*: cache first. Those URLs are content-hashed, so a hit is
 *     always the right bytes and a new build simply asks for new URLs.
 *   - anything else (other origins, non-GET, the clock-sync HEAD request):
 *     not intercepted at all.
 *
 * 挂载点在运行时动态计算，不写死路径。默认部署在域名或子域根路径下（挂载点为空），也支持挂载在
 * 任意子路径下（如 `/2fa`）。由于 `public/` 下的静态资源由 Next 原样拷贝，`basePath` 不会改写它，
 * 构建期工具函数（`src/lib/base-path.ts`）也无法在 Service Worker 中直接引入。
 *
 * Service Worker 可通过自身的脚本地址 `self.location.href` 去掉末尾 `/sw.js` 反推出真实挂载前缀，
 * 根路径部署时为空字符串。无论 `NEXT_PUBLIC_BASE_PATH` 如何调整或迁移至独立子域，本文件均无需改动。
 */

/** 本应用的挂载点：挂在根上是 `""`，挂在 `/2fa/` 下是 `"/2fa"`。 */
const BASE = new URL(self.location.href).pathname.replace(/\/sw\.js$/, "");

/** 站内绝对路径 → 带挂载点的真实地址。`"/"` 保留尾随斜杠。 */
const at = (path) => (path === "/" ? `${BASE}/` : `${BASE}${path}`);

// 缓存名带上挂载点：同一个源下如果以后还挂了别的东西，缓存不会串。
const SHELL_CACHE = `2fa-shell-v1${BASE}`;
const ASSET_CACHE = `2fa-assets-v1${BASE}`;
const SHELL_URL = at("/index.html");

/** Old builds leave their hashed chunks behind; keep the cache bounded. */
const MAX_ASSET_ENTRIES = 80;

const PRECACHE = [at("/"), SHELL_URL, at("/manifest.webmanifest"), at("/icon.svg")];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // One at a time rather than `addAll`: that rejects as a unit, so a
        // single missing file would leave the app with no offline shell at all.
        Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))),
      )
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

/*
 * 只清理本应用的旧缓存。
 *
 * 在独立源部署时可直接按名称排除，但当应用与其他静态站点共享同一源（例如挂载在 `/2fa/` 子路径下）时，
 * 粗暴删除“非当前两个缓存”的逻辑会在 activate 时误删同源下其他应用的缓存。
 *
 * 因此改为按前缀与挂载点认领：仅管理以 `2fa-` 开头且匹配当前 `BASE` 的缓存键。
 */
const CACHE_PREFIX = "2fa-";
const owns = (key) => key.startsWith(CACHE_PREFIX) && key.endsWith(BASE);

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => owns(key) && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch {
    const cached = (await caches.match(SHELL_URL)) || (await caches.match(at("/")));
    if (cached) return cached;
    throw new Error("offline and no cached shell");
  }
}

async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
    void trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith(at("/_next/static/"))) {
    event.respondWith(handleAsset(request));
  }
});
