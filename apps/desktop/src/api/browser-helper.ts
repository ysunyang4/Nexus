import { bridge } from "./bridge.js";

/**
 * Open external URL in user's default system browser (Edge / Chrome / Firefox etc.)
 * Works reliably in Tauri 2.0 Webview, dev browser, or over bridge HTTP.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;

  // 1. Try Tauri invoke IPC first
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("desktop_open_url", { url });
    return;
  } catch {}

  // 2. Try Bridge API
  try {
    const res = await fetch(`${bridge.getBaseUrl()}/api/browser/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (res.ok) return;
  } catch {}

  // 3. Fallback to window.open
  try {
    window.open(url, "_blank");
  } catch {}
}
