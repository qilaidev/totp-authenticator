/**
 * Clipboard write with a legacy fallback.
 *
 * `navigator.clipboard` is unavailable on insecure origins and is rejected
 * outright by several in-app WebViews (including Telegram's on some Android
 * builds), so the `execCommand` path is not dead code here — it is the path
 * that actually runs for a meaningful share of users.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea fallback
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    // `position: fixed` with a zero-ish size keeps iOS from scrolling the page
    // to the element, which is visible as a jump even though it is transparent.
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.padding = "0";
    textarea.style.border = "none";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);

    // iOS ignores `select()` on a readonly textarea; it needs an explicit range.
    const range = document.createRange();
    range.selectNodeContents(textarea);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    textarea.setSelectionRange(0, text.length);

    const ok = document.execCommand("copy");
    selection?.removeAllRanges();
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Trigger a client-side file download without leaving the page. */
export function downloadTextFile(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously cancels the download in Safari; one frame is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
