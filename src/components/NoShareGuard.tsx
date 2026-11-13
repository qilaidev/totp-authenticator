"use client";

import { useEffect } from "react";

/**
 * Android WebView 的长按菜单（复制链接、打开图片、分享）不受 CSS 管，只能拦 `contextmenu`。
 * 输入框放行，否则粘贴没法用。iOS 那侧由 globals.css 的 `-webkit-touch-callout: none` 管。
 */
export function NoShareGuard() {
  useEffect(() => {
    const block = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      event.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
    };
  }, []);

  return null;
}
