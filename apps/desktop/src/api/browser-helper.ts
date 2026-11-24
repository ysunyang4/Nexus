import { invoke, isTauri } from "@tauri-apps/api/core";
import { bridge } from "./bridge.js";

/**
 * Open external URL in user's default system browser (Edge / Chrome / Firefox etc.)
 * Works reliably in Tauri 2.0 Webview, dev browser, or over bridge HTTP.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;

  // 1. Try Tauri invoke IPC first if running inside desktop app
  try {
    if (isTauri()) {
      await invoke("desktop_open_url", { url });
      return;
    }
  } catch (tauriErr) {
    console.warn("[browser-helper] Tauri desktop_open_url invocation note:", tauriErr);
  }

  // 2. Try Bridge system browser open endpoint
  try {
    const baseUrl = bridge.getBaseUrl() || "http://127.0.0.1:8787";
    const res = await fetch(`${baseUrl}/api/browser/open-system`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (res.ok) return;
  } catch {}

  // 3. Try Local Server system browser open endpoint fallback
  try {
    const res = await fetch("http://127.0.0.1:18080/api/browser/open-system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (res.ok) return;
  } catch {}

  // 4. Fallback to standard window.open
  try {
    window.open(url, "_blank");
  } catch {}
}
