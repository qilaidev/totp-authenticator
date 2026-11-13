"use client";

import { useEffect } from "react";

import { withBase } from "@/lib/base-path";

/**
 * Registers the offline shell worker.
 *
 * Registration is deferred to `load` so it never competes with first paint, and
 * every failure path is swallowed: some in-app WebViews and every private
 * window reject `register()`, and the app is fully functional without it.
 *
 * 脚本地址和 scope 都走 `withBase()`。`public/` 里的文件是逐字拷贝的，`basePath` 不会
 * 改写这两个字符串；挂在 `/2fa/` 下还去注册 `/sw.js` 的话，注册会因为 404 而失败——离线
 * 能力静悄悄地没了，而一个要联网才出得来码的验证器就没什么意义了。
 *
 * scope 也必须是 `/2fa/`：浏览器只允许 worker 控制**自己所在目录及以下**，`/2fa/sw.js`
 * 要 scope `/` 会被直接拒绝。
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Service workers need a secure context; a plain-http deploy would throw.
    if (!window.isSecureContext) return;

    const register = () => {
      navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/") }).catch(() => {
        // offline support is optional
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
