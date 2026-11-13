import child_process from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";

let dedicatedBrowserProcess: child_process.ChildProcess | null = null;
let dedicatedBrowserPid: number | null = null;

export function getDedicatedProfileDir(): string {
  const localAppData =
    process.env.LOCALAPPDATA ||
    (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : "C:\\AppData\\Local");
  const profileDir = path.join(localAppData, "Nexus", "browser_profile");
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }
  return profileDir;
}

export function findBrowserExecutable(): string {
  if (process.platform === "win32") {
    const candidatePaths = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(process.env.LOCALAPPDATA || "", "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft\\Edge\\Application\\msedge.exe"),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
      path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
    ];

    if (process.env.EDGE_PATH && fs.existsSync(process.env.EDGE_PATH)) {
      return process.env.EDGE_PATH;
    }
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }

    for (const p of candidatePaths) {
      if (p && fs.existsSync(p)) return p;
    }

    try {
      const edgeOutput = child_process.execSync("where msedge", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const firstLine = edgeOutput.split(/\r?\n/)[0]?.trim();
      if (firstLine && fs.existsSync(firstLine)) return firstLine;
    } catch {}

    try {
      const chromeOutput = child_process.execSync("where chrome", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      const firstLine = chromeOutput.split(/\r?\n/)[0]?.trim();
      if (firstLine && fs.existsSync(firstLine)) return firstLine;
    } catch {}
  }

  throw new Error("未检测到兼容的 Chromium 浏览器 (Edge 或 Chrome)");
}

export function getNexusIconBuffer(): Buffer | null {
  const localAppData =
    process.env.LOCALAPPDATA ||
    (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : "C:\\AppData\\Local");
  const cachedIcon = path.join(localAppData, "Nexus", "browser_icon.png");
  if (fs.existsSync(cachedIcon)) {
    try {
      return fs.readFileSync(cachedIcon);
    } catch {}
  }

  const candidatePaths = [
    path.resolve(process.cwd(), "apps/desktop/src-tauri/icons/64x64.png"),
    path.resolve(process.cwd(), "../icons/64x64.png"),
    path.resolve(process.cwd(), "resources/icons/64x64.png"),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const buf = fs.readFileSync(p);
        fs.mkdirSync(path.dirname(cachedIcon), { recursive: true });
        fs.writeFileSync(cachedIcon, buf);
        return buf;
      } catch {}
    }
  }
  return null;
}

export function ensureBrowserExtension(): string {
  const localAppData =
    process.env.LOCALAPPDATA ||
    (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Local") : "C:\\AppData\\Local");
  const extDir = path.join(localAppData, "Nexus", "browser_extension");
  if (!fs.existsSync(extDir)) {
    fs.mkdirSync(extDir, { recursive: true });
  }

  const iconBuf = getNexusIconBuffer();
  if (iconBuf) {
    try {
      fs.writeFileSync(path.join(extDir, "icon.png"), iconBuf);
    } catch {}
  }

  const manifest = {
    manifest_version: 3,
    name: "Nexus Permissive Browser Extension",
    version: "1.3",
    description: "Allows frame embedding of web dashboards and AI assistants within Nexus Dedicated Browser",
    permissions: ["declarativeNetRequest", "declarativeNetRequestWithHostAccess"],
    host_permissions: ["<all_urls>"],
    background: {
      service_worker: "sw.js",
    },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content.js"],
        all_frames: true,
        run_at: "document_start",
      },
    ],
    icons: {
      "64": "icon.png",
    },
    declarative_net_request: {
      rule_resources: [
        {
          id: "nexus_rules",
          enabled: true,
          path: "rules.json",
        },
      ],
    },
  };

  const rules = [
    {
      id: 1,
      priority: 1000,
      action: {
        type: "modifyHeaders",
        responseHeaders: [
          { header: "x-frame-options", operation: "remove" },
          { header: "X-Frame-Options", operation: "remove" },
          { header: "frame-options", operation: "remove" },
          { header: "Frame-Options", operation: "remove" },
          { header: "content-security-policy", operation: "remove" },
          { header: "Content-Security-Policy", operation: "remove" },
          { header: "content-security-policy-report-only", operation: "remove" },
          { header: "Content-Security-Policy-Report-Only", operation: "remove" },
          { header: "cross-origin-opener-policy", operation: "remove" },
          { header: "Cross-Origin-Opener-Policy", operation: "remove" },
          { header: "cross-origin-embedder-policy", operation: "remove" },
          { header: "Cross-Origin-Embedder-Policy", operation: "remove" },
        ],
      },
      condition: {
        resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "other"],
      },
    },
  ];

  const contentScript = `
window.addEventListener('click', function(e) {
  var a = e.target && e.target.closest ? e.target.closest('a') : null;
  if (a && a.href) {
    if (a.target === '_blank' || a.target === '_new') {
      a.target = '_self';
    }
  }
}, true);

try {
  window.open = function(url) {
    if (url) {
      window.location.href = url;
    }
    return window;
  };
} catch(e) {}
`;

  fs.writeFileSync(path.join(extDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  fs.writeFileSync(path.join(extDir, "sw.js"), "// Nexus Frame Permissive Service Worker\nconsole.log('Nexus Permissive Service Worker active');\n", "utf8");
  fs.writeFileSync(path.join(extDir, "rules.json"), JSON.stringify(rules, null, 2), "utf8");
  fs.writeFileSync(path.join(extDir, "content.js"), contentScript, "utf8");

  return extDir;
}

export const createPermissiveExtension = ensureBrowserExtension;

export function launchNexusBrowser(
  targetUrl?: string,
  aiType?: string,
  forceRestart = false
): { success: boolean; pid?: number; profileDir: string; error?: string } {
  const profileDir = getDedicatedProfileDir();
  const browserExe = findBrowserExecutable();

  // Guarantee clean startup: terminate any zombie browser instances running on this dedicated profile
  if (process.platform === "win32") {
    try {
      const psCmd = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*browser_profile*' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
      child_process.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", psCmd], {
        stdio: "ignore",
        timeout: 5000,
      });
    } catch {}
    // Clean stale lock files
    try {
      const singletonLock = path.join(profileDir, "SingletonLock");
      if (fs.existsSync(singletonLock)) fs.unlinkSync(singletonLock);
      const lockFile = path.join(profileDir, "LOCK");
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    } catch {}
  }

  if (dedicatedBrowserPid) {
    try {
      process.kill(dedicatedBrowserPid);
    } catch {}
    dedicatedBrowserPid = null;
    dedicatedBrowserProcess = null;
  }

  const port = process.env.NEXUS_BRIDGE_PORT || process.env.PORT || "8787";
  const queryParams = new URLSearchParams();
  if (targetUrl) queryParams.set("url", targetUrl);
  if (aiType) queryParams.set("ai", aiType);
  const qStr = queryParams.toString();
  const startUrl = qStr
    ? `http://127.0.0.1:${port}/nexus-browser?${qStr}`
    : `http://127.0.0.1:${port}/nexus-browser`;

  const extDir = ensureBrowserExtension();
  const args = [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    `--load-extension=${extDir}`,
    `--disable-extensions-except=${extDir}`,
    "--disable-site-isolation-trials",
    "--allow-running-insecure-content",
    `--app=${startUrl}`,
  ];

  try {
    const proc = child_process.spawn(browserExe, args, {
      detached: true,
      stdio: "ignore",
    });
    proc.unref();

    dedicatedBrowserProcess = proc;
    dedicatedBrowserPid = proc.pid ?? null;

    return {
      success: true,
      pid: dedicatedBrowserPid ?? undefined,
      profileDir,
    };
  } catch (err: any) {
    return {
      success: false,
      profileDir,
      error: err.message || String(err),
    };
  }
}

export function resetNexusBrowserProfile(): { success: boolean; error?: string } {
  const profileDir = getDedicatedProfileDir();
  if (process.platform === "win32") {
    try {
      const psCmd = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*browser_profile*' -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
      child_process.spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", psCmd], {
        stdio: "ignore",
        timeout: 5000,
      });
    } catch {}
  }
  if (dedicatedBrowserPid) {
    try {
      process.kill(dedicatedBrowserPid);
    } catch {}
    dedicatedBrowserPid = null;
    dedicatedBrowserProcess = null;
  }
  try {
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
    fs.mkdirSync(profileDir, { recursive: true });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

export function getNexusBrowserStatus(): { running: boolean; pid?: number; profileDir: string } {
  const profileDir = getDedicatedProfileDir();
  let isRunning = false;
  if (dedicatedBrowserPid) {
    try {
      process.kill(dedicatedBrowserPid, 0);
      isRunning = true;
    } catch {
      isRunning = false;
      dedicatedBrowserPid = null;
      dedicatedBrowserProcess = null;
    }
  }
  return {
    running: isRunning,
    pid: dedicatedBrowserPid ?? undefined,
    profileDir,
  };
}

/**
 * 极速纯净正文与网页转 Markdown 提纯引擎
 */
export async function extractWebMarkdown(inputUrlOrHtml: string): Promise<{
  success: boolean;
  title: string;
  markdown: string;
  wordCount: number;
  estimatedTokens: number;
  url?: string;
  error?: string;
}> {
  let html = "";
  let url = "";

  if (inputUrlOrHtml.startsWith("http://") || inputUrlOrHtml.startsWith("https://")) {
    url = inputUrlOrHtml;
    try {
      html = await fetchHtml(url);
    } catch (err: any) {
      return {
        success: false,
        title: "",
        markdown: "",
        wordCount: 0,
        estimatedTokens: 0,
        url,
        error: `请求网页失败: ${err.message}`,
      };
    }
  } else {
    html = inputUrlOrHtml;
  }

  // 提取标题
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "未命名网页";

  // 清洗无用标签（脚本、样式、导航、页脚、广告）
  let cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // 基础 Markdown 转换
  let md = cleanHtml
    // 标题
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "\n#### $1\n")
    // 段落与换行
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "\n$1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // 粗体斜体
    .replace(/<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gi, "**$1**")
    .replace(/<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/gi, "*$1*")
    // 代码
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    // 链接
    .replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    // 列表
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    // 剥离剩余的所有 HTML 标签
    .replace(/<[^>]+>/g, " ")
    // 实体字符转换
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // 多余空行与空格压缩
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  const finalMarkdown = `# ${title}\n\n${url ? `> 来源: [${url}](${url})\n\n` : ""}${md}`;
  const wordCount = finalMarkdown.length;
  const estimatedTokens = Math.ceil(wordCount * 0.7);

  return {
    success: true,
    title,
    markdown: finalMarkdown,
    wordCount,
    estimatedTokens,
    url,
  };
}

function fetchHtml(targetUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === "https:" ? https : http;
    const req = client.get(
      targetUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NexusAI/1.3.0",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchHtml(new URL(res.headers.location, targetUrl).toString()).then(resolve).catch(reject);
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("请求超时"));
    });
  });
}

/**
 * Nexus 零风控代理请求转发器 (剥离 X-Frame-Options & CSP)
 */
export function handleNexusProxyRequest(
  targetUrl: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  redirectHops = 0
): void {
  if (redirectHops > 5) {
    res.writeHead(508, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Too many redirects");
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch (err: any) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Invalid target URL: ${err.message}`);
    return;
  }

  const client = parsed.protocol === "https:" ? https : http;
  const outgoingHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 NexusAI/1.3.0",
    Accept: (req.headers["accept"] as string) || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": (req.headers["accept-language"] as string) || "zh-CN,zh;q=0.9,en;q=0.8",
  };

  if (req.headers["cookie"]) {
    outgoingHeaders["cookie"] = req.headers["cookie"] as string;
  }

  const proxyReq = client.get(
    parsed,
    { headers: outgoingHeaders },
    (upstreamRes) => {
      if (
        upstreamRes.statusCode &&
        upstreamRes.statusCode >= 300 &&
        upstreamRes.statusCode < 400 &&
        upstreamRes.headers.location
      ) {
        const nextUrl = new URL(upstreamRes.headers.location, targetUrl).toString();
        res.writeHead(302, {
          Location: `/proxy?url=${encodeURIComponent(nextUrl)}`,
          "Access-Control-Allow-Origin": "*",
        });
        res.end();
        return;
      }

      const headers: Record<string, any> = { ...upstreamRes.headers };
      delete headers["x-frame-options"];
      delete headers["X-Frame-Options"];
      delete headers["frame-options"];
      delete headers["content-security-policy"];
      delete headers["Content-Security-Policy"];
      delete headers["content-security-policy-report-only"];
      delete headers["cross-origin-opener-policy"];
      delete headers["cross-origin-embedder-policy"];

      headers["access-control-allow-origin"] = "*";

      const contentType = String(headers["content-type"] || "");
      const isHtml = contentType.toLowerCase().includes("text/html");

      if (isHtml) {
        delete headers["content-length"];
        delete headers["content-encoding"];
        res.writeHead(upstreamRes.statusCode || 200, headers);

        let body = "";
        upstreamRes.setEncoding("utf8");
        upstreamRes.on("data", (chunk) => {
          body += chunk;
        });
        upstreamRes.on("end", () => {
          const baseTag = `<base href="${parsed.origin}${parsed.pathname}">`;
          let modified = body;
          if (/<head[^>]*>/i.test(modified)) {
            modified = modified.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}`);
          } else if (/<html[^>]*>/i.test(modified)) {
            modified = modified.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${baseTag}</head>`);
          } else {
            modified = `${baseTag}\n${modified}`;
          }
          res.end(modified);
        });
      } else {
        res.writeHead(upstreamRes.statusCode || 200, headers);
        upstreamRes.pipe(res);
      }
    }
  );

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<div style="font-family:sans-serif;padding:24px;color:#f87171;background:#090d16;">
      <h3>Nexus 代理加载失败</h3>
      <p style="color:#94a3b8;font-size:13px;">无法连接到目标站点: ${err.message}</p>
      <p style="margin-top:12px;"><a href="${targetUrl}" target="_blank" style="color:#38bdf8;text-decoration:none;">点击在原生窗口中打开 &rarr;</a></p>
    </div>`);
  });

  proxyReq.setTimeout(20000, () => {
    proxyReq.destroy();
    res.writeHead(504, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("代理请求超时");
  });
}

/**
 * 生成极简线条风（Minimalist Outline Style）专属 AI 浏览器门户 HTML
 */
export function getNexusBrowserHtml(initialUrl: string = "", initialAi: string = ""): string {
  let targetAi = "chatgpt";
  const normAi = (initialAi || "").toLowerCase();
  const normUrl = (initialUrl || "").toLowerCase();

  if (normAi === "reader") {
    targetAi = "reader";
  } else {
    targetAi = "chatgpt";
  }

  let mainCanvasUrl = initialUrl;
  if (mainCanvasUrl.includes("chatgpt.com")) {
    mainCanvasUrl = "";
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus AI 专属浏览器 - Built-in Native Edition</title>
  <link rel="icon" type="image/png" href="/nexus-browser/icon.png">
  <link rel="shortcut icon" type="image/png" href="/nexus-browser/icon.png">
  <link rel="apple-touch-icon" href="/nexus-browser/icon.png">
  <style>
    :root {
      --bg-base: #080b11;
      --bg-bar: #0d1118;
      --bg-card: #111622;
      --bg-card-hover: #161e2e;
      --border-line: rgba(255, 255, 255, 0.08);
      --border-hover: rgba(255, 255, 255, 0.18);
      --border-active: #38bdf8;
      --text-main: #f1f5f9;
      --text-sub: #94a3b8;
      --text-muted: #64748b;
      --accent-cyan: #38bdf8;
      --accent-emerald: #10b981;
      --accent-purple: #c084fc;
      --accent-amber: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: var(--bg-base);
      color: var(--text-main);
      display: flex;
      flex-direction: column;
      user-select: none;
    }

    /* 36px Minimalist Header Bar */
    header {
      height: 36px;
      background: var(--bg-bar);
      border-bottom: 1px solid var(--border-line);
      display: flex;
      align-items: center;
      padding: 0 10px;
      gap: 8px;
      z-index: 100;
      flex-shrink: 0;
    }

    /* Minimalist Logo Badge */
    .brand-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid var(--border-line);
      background: transparent;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.15s;
    }
    .brand-badge:hover {
      border-color: var(--border-hover);
      background: rgba(255, 255, 255, 0.03);
    }
    .brand-badge img {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      object-fit: cover;
    }
    .brand-badge span {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      color: #e2e8f0;
      font-family: monospace;
    }

    /* Navigation Controls */
    .nav-group {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }
    .nav-btn {
      width: 26px;
      height: 26px;
      border-radius: 4px;
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-sub);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      flex-shrink: 0;
      transition: all 0.15s;
    }
    .nav-btn:hover {
      border-color: var(--border-line);
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.04);
    }

    /* Minimalist Outline Omnibox */
    .omnibox-box {
      flex: 1;
      max-width: 480px;
      min-width: 160px;
      height: 28px;
      position: relative;
      display: flex;
      align-items: center;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--border-line);
      border-radius: 6px;
      padding: 0 6px;
      gap: 4px;
      transition: all 0.15s;
    }
    .omnibox-box:focus-within {
      border-color: var(--border-active);
      box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.3);
      background: rgba(0, 0, 0, 0.6);
    }
    .engine-pill {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 11px;
      padding: 1px 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 2px;
      border-radius: 4px;
      white-space: nowrap;
    }
    .engine-pill:hover {
      color: var(--text-main);
    }
    .omnibox-input {
      flex: 1;
      height: 100%;
      background: transparent;
      border: none;
      color: var(--text-main);
      font-size: 11px;
      font-family: inherit;
      outline: none;
      padding: 0 4px;
    }
    .omnibox-input::placeholder {
      color: var(--text-muted);
    }
    .omni-action {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;
    }
    .omni-action:hover {
      color: var(--text-main);
    }

    /* Engine Dropdown */
    .engine-menu {
      position: absolute;
      top: 32px;
      left: 0;
      background: var(--bg-card);
      border: 1px solid var(--border-line);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      padding: 3px;
      display: none;
      flex-direction: column;
      gap: 1px;
      z-index: 200;
      width: 120px;
    }
    .engine-opt {
      padding: 4px 8px;
      font-size: 11px;
      color: var(--text-sub);
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .engine-opt:hover {
      background: rgba(56, 189, 248, 0.12);
      color: var(--text-main);
    }

    /* Minimalist Split Preset Pills */
    .split-pills {
      display: flex;
      align-items: center;
      gap: 2px;
      border: 1px solid var(--border-line);
      border-radius: 6px;
      padding: 2px;
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.02);
      margin: 0 2px;
    }
    .split-opt {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted);
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      font-family: monospace;
      transition: all 0.15s;
    }
    .split-opt:hover {
      color: var(--text-main);
    }
    .split-opt.active {
      border-color: rgba(56, 189, 248, 0.4);
      color: var(--accent-cyan);
      background: rgba(56, 189, 248, 0.1);
    }

    /* Minimalist AI Companion Tab Switcher */
    .ai-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .ai-tab {
      background: transparent;
      border: 1px solid var(--border-line);
      color: var(--text-sub);
      font-size: 11px;
      font-weight: 500;
      padding: 3px 8px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      transition: all 0.15s;
    }
    .ai-tab:hover {
      border-color: var(--border-hover);
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.03);
    }
    .ai-tab.active[data-ai="chatgpt"] {
      border-color: var(--accent-emerald);
      color: #34d399;
      background: rgba(16, 185, 129, 0.1);
    }

    .ai-tab.active[data-ai="reader"] {
      border-color: var(--accent-amber);
      color: #fbbf24;
      background: rgba(245, 158, 11, 0.1);
    }
    .ai-tab.active[data-ai="settings"] {
      border-color: var(--border-hover);
      color: #f1f5f9;
      background: rgba(255, 255, 255, 0.08);
    }

    /* Workspace Dual Viewport */
    .workspace {
      flex: 1;
      display: flex;
      position: relative;
      overflow: hidden;
      background: var(--bg-base);
    }

    /* Left Web Canvas */
    .web-canvas {
      flex: 1;
      height: 100%;
      position: relative;
      overflow: hidden;
      background: var(--bg-base);
      min-width: 200px;
    }
    .web-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #fff;
      display: none;
    }

    /* Floating Status Pill for Web Canvas */
    .canvas-pill {
      position: absolute;
      bottom: 12px;
      left: 12px;
      z-index: 10;
      background: rgba(13, 17, 24, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid var(--border-line);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11px;
      color: var(--text-muted);
      display: none;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    }
    .canvas-pill-url {
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-main);
      font-family: monospace;
    }
    .canvas-pill-action {
      background: transparent;
      border: none;
      color: var(--accent-cyan);
      cursor: pointer;
      font-size: 11px;
      padding: 0 4px;
      transition: opacity 0.15s;
    }
    .canvas-pill-action:hover {
      opacity: 0.8;
    }

    /* Speed Dial Panel (Home Page) */
    .speeddial-panel {
      position: absolute;
      inset: 0;
      overflow-y: auto;
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-width: 820px;
      margin: 0 auto;
    }
    .speeddial-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1px solid var(--border-line);
      padding-bottom: 12px;
    }
    .speeddial-title {
      font-size: 16px;
      font-weight: 600;
      color: #f8fafc;
      letter-spacing: -0.2px;
    }
    .speeddial-desc {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .speeddial-search-box {
      display: flex;
      border: 1px solid var(--border-line);
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.25);
      padding: 6px 10px;
      gap: 8px;
      align-items: center;
      transition: border-color 0.15s;
    }
    .speeddial-search-box:focus-within {
      border-color: var(--border-active);
    }
    .speeddial-search-input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-main);
      font-size: 12px;
      outline: none;
    }

    /* Minimalist Cards Grid */
    .dial-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 8px;
    }
    .dial-card {
      background: var(--bg-card);
      border: 1px solid var(--border-line);
      border-radius: 6px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      color: var(--text-main);
      text-decoration: none;
      transition: all 0.15s;
    }
    .dial-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-hover);
      transform: translateY(-1px);
    }
    .dial-icon {
      font-size: 15px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid var(--border-line);
      background: rgba(255, 255, 255, 0.02);
      flex-shrink: 0;
    }
    .dial-name {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-main);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Draggable Splitter */
    .splitter {
      width: 3px;
      background: var(--border-line);
      cursor: col-resize;
      position: relative;
      z-index: 20;
      transition: background 0.15s;
    }
    .splitter:hover, .splitter.dragging {
      background: var(--accent-cyan);
    }

    /* Right Copilot Companion Dock */
    .copilot-dock {
      width: 400px;
      height: 100%;
      position: relative;
      overflow: hidden;
      background: var(--bg-bar);
      border-left: 1px solid var(--border-line);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .copilot-dock.collapsed {
      display: none;
    }

    /* Copilot Mini Action Bar */
    .copilot-bar {
      height: 28px;
      background: var(--bg-bar);
      border-bottom: 1px solid var(--border-line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      font-size: 11px;
      flex-shrink: 0;
    }
    .copilot-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      color: var(--text-main);
    }
    .copilot-indicator span.pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent-emerald);
    }
    .copilot-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .copilot-btn {
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid var(--border-line);
      background: transparent;
      color: var(--text-sub);
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 3px;
      transition: all 0.15s;
    }
    .copilot-btn:hover {
      border-color: var(--border-hover);
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.04);
    }

    /* Copilot Body Viewports */
    .copilot-body {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    /* Official AI Iframes (Zero Popups, 100% Embedded!) */
    .ai-hub-view {
      position: absolute;
      inset: 0;
      display: none;
      flex-direction: column;
      background: var(--bg-base);
    }
    .ai-hub-view.active {
      display: flex !important;
    }
    .ai-hub-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #fff;
    }

    /* Reader Viewport */
    .reader-view {
      position: absolute;
      inset: 0;
      background: var(--bg-card);
      color: var(--text-main);
      padding: 16px;
      display: none;
      flex-direction: column;
      gap: 10px;
      overflow-y: auto;
    }
    .reader-view.active {
      display: flex !important;
    }
    .reader-input-box {
      display: flex;
      gap: 6px;
    }
    .reader-input {
      flex: 1;
      padding: 6px 10px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-line);
      color: var(--text-main);
      font-size: 11px;
      outline: none;
    }
    .reader-submit-btn {
      padding: 6px 12px;
      border-radius: 6px;
      background: var(--accent-amber);
      border: none;
      color: #000;
      font-weight: 600;
      font-size: 11px;
      cursor: pointer;
    }
    .reader-output {
      flex: 1;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border-line);
      border-radius: 6px;
      padding: 12px;
      font-family: monospace;
      font-size: 11px;
      white-space: pre-wrap;
      overflow-y: auto;
      line-height: 1.5;
    }

    /* Settings Viewport */
    .settings-view {
      position: absolute;
      inset: 0;
      background: var(--bg-card);
      padding: 18px;
      display: none;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
    }
    .settings-view.active {
      display: flex !important;
    }
    .settings-item {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-line);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .settings-item-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-main);
    }
    .settings-item-desc {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .settings-code {
      font-family: monospace;
      font-size: 10px;
      padding: 4px 8px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.4);
      color: #38bdf8;
      width: fit-content;
    }
    .settings-btn-danger {
      padding: 6px 12px;
      border-radius: 6px;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      width: fit-content;
      transition: all 0.15s;
    }
    .settings-btn-danger:hover {
      background: rgba(239, 68, 68, 0.25);
    }

    /* Minimalist Toast */
    #nexusToast {
      position: fixed;
      top: 44px;
      right: 14px;
      z-index: 999;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid var(--accent-cyan);
      color: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 11px;
      display: none;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    }
  </style>
</head>
<body>
  <!-- Header Bar -->
  <header>
    <div class="brand-badge" onclick="goHome()" title="返回首页 (Nexus Browser)">
      <img src="/nexus-browser/icon.png" alt="Nexus" />
      <span>NEXUS</span>
    </div>

    <!-- Navigation Controls -->
    <div class="nav-group">
      <button class="nav-btn" onclick="historyBack()" title="后退">&#x2190;</button>
      <button class="nav-btn" onclick="historyForward()" title="前进">&#x2192;</button>
      <button class="nav-btn" onclick="reloadFrame()" title="刷新">&#x21BB;</button>
      <button class="nav-btn" onclick="goHome()" title="主页">&#x2302;</button>
    </div>

    <!-- Omnibox (Search & URL) -->
    <div class="omnibox-box">
      <button class="engine-pill" id="enginePill" onclick="toggleEngineMenu(event)">
        <span id="engineLabel">Google</span>
        <span style="font-size:9px;opacity:0.7;">&#x25BE;</span>
      </button>
      <div class="engine-menu" id="engineMenu">
        <div class="engine-opt" onclick="selectEngine('google', 'Google')">🌐 Google</div>
        <div class="engine-opt" onclick="selectEngine('bing', 'Bing')">🔍 Bing</div>
        <div class="engine-opt" onclick="selectEngine('github', 'GitHub')">🐙 GitHub</div>
        <div class="engine-opt" onclick="selectEngine('arxiv', 'arXiv')">📄 arXiv</div>
        <div class="engine-opt" onclick="selectEngine('duckduckgo', 'DuckDuckGo')">🦆 DuckDuckGo</div>
        <div class="engine-opt" onclick="selectEngine('baidu', 'Baidu')">🇨🇳 百度</div>
      </div>
      <input
        type="text"
        id="omnibox"
        class="omnibox-input"
        placeholder="搜索或输入网址 (Enter)..."
        autocomplete="off"
        spellcheck="false"
        onkeydown="handleOmniboxKey(event)"
      />
      <button class="omni-action" onclick="clearOmnibox()" title="清空">&#x2715;</button>
    </div>

    <!-- Split Ratio Controls -->
    <div class="split-pills">
      <button class="split-opt active" id="btn-split-73" onclick="setSplitPreset('73')" title="7:3 宽幅浏览伴生模式">7:3</button>
      <button class="split-opt" id="btn-split-55" onclick="setSplitPreset('55')" title="5:5 双屏对等模式">5:5</button>
      <button class="split-opt" id="btn-split-37" onclick="setSplitPreset('37')" title="3:7 聚焦 AI 模式">3:7</button>
      <button class="split-opt" id="btn-split-full" onclick="setSplitPreset('full')" title="纯净全屏浏览模式">&#x26F6;</button>
      <button class="split-opt" id="btn-split-toggle" onclick="toggleCopilotDock()" title="收起 / 展开伴生侧栏">&#x25D8;</button>
    </div>

    <!-- AI Companion Tabs -->
    <div class="ai-tabs">
      <button class="ai-tab ${targetAi === 'chatgpt' ? 'active' : ''}" data-ai="chatgpt" id="tab-chatgpt" onclick="switchCopilotTab('chatgpt')">🤖 ChatGPT</button>
      <button class="ai-tab ${targetAi === 'reader' ? 'active' : ''}" data-ai="reader" id="tab-reader" onclick="switchCopilotTab('reader')">📄 脱水提纯</button>
      <button class="ai-tab" data-ai="settings" id="tab-settings" onclick="switchCopilotTab('settings')" title="沙箱数据与重置">&#x2699;</button>
    </div>
  </header>

  <!-- Dual Workspace -->
  <div class="workspace" id="workspace">
    <!-- Left Web Canvas -->
    <div class="web-canvas" id="webCanvas">
      <iframe id="webIframe" class="web-iframe"></iframe>

      <!-- Minimalist Floating URL Status Pill -->
      <div class="canvas-pill" id="canvasPill">
        <span class="canvas-pill-url" id="canvasPillUrl">about:blank</span>
        <button class="canvas-pill-action" onclick="copyCurrentUrl()" title="复制网址">&#x1F4CB; 复制</button>
        <button class="canvas-pill-action" onclick="extractToReader()" title="网页脱水转 Markdown">&#x1F4C4; 提纯</button>
        <button class="canvas-pill-action" onclick="reloadFrame()" title="刷新网页">&#x21BB; 刷新</button>
        <button class="canvas-pill-action" onclick="goHome()" title="返回导航页">&#x2715;</button>
      </div>

      <!-- Speed Dial View -->
      <div class="speeddial-panel" id="speeddialPanel">
        <div class="speeddial-header">
          <div>
            <div class="speeddial-title">Nexus AI 极简导航起始页</div>
            <div class="speeddial-desc">独立数据沙箱 • 内置 AI 实时伴生 • 全内置无外部弹窗</div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);font-family:monospace;" id="clockText">--:--</div>
        </div>

        <!-- Quick Search Bar -->
        <div class="speeddial-search-box">
          <span style="font-size:12px;color:var(--text-muted);">&#x1F50D;</span>
          <input
            type="text"
            id="dialSearchInput"
            class="speeddial-search-input"
            placeholder="搜索网页或输入 URL..."
            onkeydown="if(event.key==='Enter') doDialSearch()"
          />
          <button class="copilot-btn" onclick="doDialSearch()">搜索</button>
        </div>

        <!-- Minimalist Cards Grid -->
        <div class="dial-grid">
          <div class="dial-card" onclick="navigate('https://www.google.com')">
            <div class="dial-icon">🌐</div>
            <div class="dial-name">Google 搜索</div>
          </div>
          <div class="dial-card" onclick="navigate('https://www.bing.com')">
            <div class="dial-icon">🔍</div>
            <div class="dial-name">Bing 必应</div>
          </div>
          <div class="dial-card" onclick="navigate('https://github.com')">
            <div class="dial-icon">🐙</div>
            <div class="dial-name">GitHub</div>
          </div>
          <div class="dial-card" onclick="navigate('https://huggingface.co')">
            <div class="dial-icon">🤗</div>
            <div class="dial-name">Hugging Face</div>
          </div>
          <div class="dial-card" onclick="navigate('https://arxiv.org')">
            <div class="dial-icon">📄</div>
            <div class="dial-name">arXiv AI 论文</div>
          </div>
          <div class="dial-card" onclick="navigate('https://www.bilibili.com')">
            <div class="dial-icon">📺</div>
            <div class="dial-name">哔哩哔哩</div>
          </div>
          <div class="dial-card" onclick="navigate('https://www.v2ex.com')">
            <div class="dial-icon">💬</div>
            <div class="dial-name">V2EX 社区</div>
          </div>
          <div class="dial-card" onclick="navigate('https://developer.mozilla.org')">
            <div class="dial-icon">📚</div>
            <div class="dial-name">MDN Web Docs</div>
          </div>
          <div class="dial-card" onclick="navigate('https://www.xiaohongshu.com')">
            <div class="dial-icon">📕</div>
            <div class="dial-name">小红书</div>
          </div>
          <div class="dial-card" onclick="navigate('https://x.com')">
            <div class="dial-icon">🐦</div>
            <div class="dial-name">Twitter / X</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Draggable Hairline Splitter -->
    <div class="splitter" id="splitter"></div>

    <!-- Right AI Copilot Companion Dock -->
    <div class="copilot-dock" id="copilotDock">
      <!-- Mini Copilot Action Bar -->
      <div class="copilot-bar">
        <div class="copilot-indicator" id="copilotIndicator">
          <span class="pulse-dot"></span>
          <span id="copilotTitle">${targetAi === 'reader' ? '📄 网页脱水' : '🤖 ChatGPT 官网'}</span>
        </div>
        <div class="copilot-actions">
          <button class="copilot-btn" onclick="sendContextToAi()" title="将左侧网页上下文与纯净文本投送到剪贴板 Ctrl+V">&#x1F4CB; 投送网页</button>
          <button class="copilot-btn" onclick="reloadCurrentAiFrame()" title="刷新当前 AI 页面">&#x21BB; 刷新</button>
          <button class="copilot-btn" onclick="resetCurrentAiFrame()" title="返回当前 AI 首页">&#x2302; 首页</button>
        </div>
      </div>

      <!-- Copilot Body: 100% Embedded Official AI Workspaces -->
      <div class="copilot-body">
        <!-- 1. ChatGPT Embedded View -->
        <div id="view-chatgpt" class="ai-hub-view ${targetAi === 'chatgpt' ? 'active' : ''}">
          <iframe class="ai-hub-iframe" id="aiFrame-chatgpt" src="${targetAi === 'chatgpt' ? 'https://chatgpt.com' : 'about:blank'}" data-src="https://chatgpt.com"></iframe>
        </div>


        <!-- 4. Reader Viewport -->
        <div id="view-reader" class="reader-view ${targetAi === 'reader' ? 'active' : ''}">
          <div style="font-size:11px;color:var(--text-muted);">
            输入任意网址，一键提取纯净正文并脱水转为 Markdown，零 Token 浪费：
          </div>
          <div class="reader-input-box">
            <input type="text" id="readerUrlInput" class="reader-input" placeholder="https://example.com/article" />
            <button class="reader-submit-btn" onclick="doReaderExtract()">⚡ 提纯</button>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);" id="readerStats">
            <span>就绪</span>
            <div style="display:flex;gap:4px;">
              <button class="copilot-btn" onclick="copyReaderOutput()">复制 Markdown</button>
              <button class="copilot-btn" onclick="downloadReaderMarkdown()">导出 .md</button>
            </div>
          </div>
          <div id="readerOutput" class="reader-output">点击上方【⚡ 提纯】按钮提取正文内容...</div>
        </div>

        <!-- 5. Settings Viewport -->
        <div id="view-settings" class="settings-view">
          <div class="settings-item">
            <div class="settings-item-title">独立数据沙箱 Profile</div>
            <div class="settings-item-desc">Nexus 专属浏览器使用独立沙箱，完全隔离于系统日常浏览器，账号登录持久保持。</div>
            <div class="settings-code" id="settingsProfilePath">%LOCALAPPDATA%\\Nexus\\browser_profile</div>
          </div>
          <div class="settings-item">
            <div class="settings-item-title">清空沙箱 Cookies 与缓存</div>
            <div class="settings-item-desc">若遇账号封禁、风控拦截或需重置登录状态，可一键清空沙箱隔离数据。</div>
            <button class="settings-btn-danger" onclick="resetBrowserProfile()">⚠️ 清空沙箱缓存数据</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="nexusToast">已完成</div>

  <script>
    let currentMainUrl = "${mainCanvasUrl}";
    let currentAiType = "${targetAi}";
    let selectedEngine = "google";
    const SEARCH_ENGINES = {
      google: "https://www.google.com/search?q=",
      bing: "https://www.bing.com/search?q=",
      github: "https://github.com/search?q=",
      arxiv: "https://arxiv.org/search/?searchtype=all&query=",
      duckduckgo: "https://duckduckgo.com/?q=",
      baidu: "https://www.baidu.com/s?wd="
    };
    const AI_URL_MAP = {
      chatgpt: "https://chatgpt.com"
    };

    // Clock
    function updateClock() {
      const now = new Date();
      const el = document.getElementById("clockText");
      if (el) el.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    setInterval(updateClock, 1000);
    updateClock();

    function isLikelyUrl(str) {
      if (!str) return false;
      const s = str.trim();
      if (s.startsWith("http://") || s.startsWith("https://")) return true;
      return s.indexOf(".") > 0 && s.indexOf(" ") === -1;
    }

    // Direct Native Navigation (Zero Proxy, Permissive Extension Handles Headers!)
    function navigate(url) {
      if (!url) return;
      let target = url.trim();
      if (!target.startsWith("http://") && !target.startsWith("https://")) {
        if (isLikelyUrl(target)) {
          target = "https://" + target;
        } else {
          target = SEARCH_ENGINES[selectedEngine] + encodeURIComponent(target);
        }
      }

      currentMainUrl = target;
      document.getElementById("omnibox").value = target;

      const iframe = document.getElementById("webIframe");
      iframe.src = target;
      iframe.style.display = "block";

      document.getElementById("speeddialPanel").style.display = "none";
      const pill = document.getElementById("canvasPill");
      pill.style.display = "flex";
      document.getElementById("canvasPillUrl").innerText = target;
    }

    function goHome() {
      currentMainUrl = "";
      document.getElementById("omnibox").value = "";
      const iframe = document.getElementById("webIframe");
      iframe.style.display = "none";
      iframe.src = "about:blank";
      document.getElementById("speeddialPanel").style.display = "flex";
      document.getElementById("canvasPill").style.display = "none";
    }

    function historyBack() {
      try { document.getElementById("webIframe").contentWindow.history.back(); } catch(e) {}
    }
    function historyForward() {
      try { document.getElementById("webIframe").contentWindow.history.forward(); } catch(e) {}
    }
    function reloadFrame() {
      const iframe = document.getElementById("webIframe");
      if (iframe && iframe.src && iframe.src !== "about:blank") {
        iframe.src = iframe.src;
      }
    }
    function clearOmnibox() {
      document.getElementById("omnibox").value = "";
      document.getElementById("omnibox").focus();
    }
    function copyCurrentUrl() {
      if (currentMainUrl) {
        navigator.clipboard.writeText(currentMainUrl);
        showToast("已复制网址: " + currentMainUrl);
      }
    }

    function handleOmniboxKey(e) {
      if (e.key === "Enter") {
        navigate(document.getElementById("omnibox").value);
      }
    }
    function doDialSearch() {
      const val = document.getElementById("dialSearchInput").value;
      if (val) navigate(val);
    }

    // Engine Selector
    function toggleEngineMenu(e) {
      e.stopPropagation();
      const m = document.getElementById("engineMenu");
      m.style.display = m.style.display === "flex" ? "none" : "flex";
    }
    function selectEngine(key, label) {
      selectedEngine = key;
      document.getElementById("engineLabel").innerText = label;
      document.getElementById("engineMenu").style.display = "none";
    }
    document.addEventListener("click", () => {
      const m = document.getElementById("engineMenu");
      if (m) m.style.display = "none";
    });

    // AI Companion Switching with Lazy Loading
    function switchCopilotTab(aiKey) {
      currentAiType = aiKey;
      document.querySelectorAll(".ai-tab").forEach(tab => tab.classList.remove("active"));
      const targetTab = document.getElementById("tab-" + aiKey);
      if (targetTab) targetTab.classList.add("active");

      document.querySelectorAll(".ai-hub-view, .reader-view, .settings-view").forEach(v => v.classList.remove("active"));
      const targetView = document.getElementById("view-" + aiKey);
      if (targetView) targetView.classList.add("active");

      // Lazy load iframe if about:blank
      const iframe = document.getElementById("aiFrame-" + aiKey);
      if (iframe && iframe.getAttribute("data-src") && (!iframe.src || iframe.src === "about:blank")) {
        iframe.src = iframe.getAttribute("data-src");
      }

      const titleMap = {
        chatgpt: "🤖 ChatGPT 官网",
        reader: "📄 网页脱水提纯",
        settings: "⚙ 沙箱隔离设置"
      };
      document.getElementById("copilotTitle").innerText = titleMap[aiKey] || "AI 官网";

      if (aiKey === "reader" && currentMainUrl) {
        document.getElementById("readerUrlInput").value = currentMainUrl;
      }
    }

    function reloadCurrentAiFrame() {
      const iframe = document.getElementById("aiFrame-" + currentAiType);
      if (iframe) {
        iframe.src = iframe.getAttribute("data-src") || iframe.src;
        showToast("已刷新 " + currentAiType);
      }
    }

    function resetCurrentAiFrame() {
      const iframe = document.getElementById("aiFrame-" + currentAiType);
      if (iframe && AI_URL_MAP[currentAiType]) {
        iframe.src = AI_URL_MAP[currentAiType];
        showToast("已回到 " + currentAiType + " 首页");
      }
    }

    // Split presets
    function setSplitPreset(preset) {
      const dock = document.getElementById("copilotDock");
      const splitter = document.getElementById("splitter");
      document.querySelectorAll(".split-opt").forEach(b => b.classList.remove("active"));

      if (preset === "full") {
        dock.classList.add("collapsed");
        splitter.style.display = "none";
        document.getElementById("btn-split-full").classList.add("active");
        return;
      }

      dock.classList.remove("collapsed");
      splitter.style.display = "block";

      const totalWidth = document.getElementById("workspace").clientWidth;
      let ratio = 0.3;
      if (preset === "73") ratio = 0.3;
      else if (preset === "55") ratio = 0.5;
      else if (preset === "37") ratio = 0.7;

      const dockWidth = Math.max(260, Math.min(totalWidth - 200, Math.round(totalWidth * ratio)));
      dock.style.width = dockWidth + "px";
      const btn = document.getElementById("btn-split-" + preset);
      if (btn) btn.classList.add("active");
    }

    function toggleCopilotDock() {
      const dock = document.getElementById("copilotDock");
      const splitter = document.getElementById("splitter");
      if (dock.classList.contains("collapsed")) {
        setSplitPreset("73");
      } else {
        dock.classList.add("collapsed");
        splitter.style.display = "none";
        document.querySelectorAll(".split-opt").forEach(b => b.classList.remove("active"));
        document.getElementById("btn-split-full").classList.add("active");
      }
    }

    // Splitter Dragging
    const splitter = document.getElementById("splitter");
    let isDragging = false;
    splitter.addEventListener("mousedown", (e) => {
      isDragging = true;
      splitter.classList.add("dragging");
      document.body.style.cursor = "col-resize";
    });
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const workspaceRect = document.getElementById("workspace").getBoundingClientRect();
      const newDockWidth = workspaceRect.right - e.clientX;
      if (newDockWidth >= 220 && newDockWidth <= (workspaceRect.width - 200)) {
        document.getElementById("copilotDock").style.width = newDockWidth + "px";
        document.querySelectorAll(".split-opt").forEach(b => b.classList.remove("active"));
      }
    });
    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        splitter.classList.remove("dragging");
        document.body.style.cursor = "default";
      }
    });

    // Send Context Prompt to Clipboard
    function sendContextToAi() {
      const url = currentMainUrl || "https://www.google.com";
      const title = document.getElementById("canvasPillUrl").innerText || url;
      const prompt = "【网页分析请求】\\n来源地址: " + url + "\\n页面标题: " + title + "\\n请基于上述网页内容进行深度分析与提炼，回答我的后续提问。";
      navigator.clipboard.writeText(prompt);
      showToast("已提取左侧网页上下文 Prompt 至剪贴板，直接在右侧对话框 Ctrl+V 粘贴！");
    }

    function extractToReader() {
      if (currentMainUrl) {
        switchCopilotTab("reader");
        document.getElementById("readerUrlInput").value = currentMainUrl;
        doReaderExtract();
      }
    }

    // Reader Engine
    async function doReaderExtract() {
      const input = document.getElementById("readerUrlInput").value.trim();
      const output = document.getElementById("readerOutput");
      const stats = document.getElementById("readerStats");
      if (!input) return;

      output.innerText = "⚡ 正在提取纯净正文并脱水转为 Markdown，请稍候...";
      try {
        const res = await fetch("/api/nexus-browser/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: input }),
        });
        const data = await res.json();
        if (data.success && data.markdown) {
          output.innerText = data.markdown;
          stats.querySelector("span").innerText = "字数: " + (data.wordCount || 0) + " | 预估 Tokens: " + (data.estimatedTokens || 0);
        } else {
          output.innerText = "❌ 提取失败: " + (data.error || "未能获取页面有效正文");
        }
      } catch (err) {
        output.innerText = "❌ 请求失败: " + err.message;
      }
    }

    function copyReaderOutput() {
      const text = document.getElementById("readerOutput").innerText;
      if (text) {
        navigator.clipboard.writeText(text);
        showToast("已复制 Markdown 内容！");
      }
    }

    function downloadReaderMarkdown() {
      const text = document.getElementById("readerOutput").innerText;
      if (!text) return;
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "nexus-extracted-" + Date.now() + ".md";
      a.click();
    }

    async function resetBrowserProfile() {
      if (!confirm("确定要清空独立沙箱的 Cookies、缓存和历史记录吗？")) return;
      try {
        const res = await fetch("/api/nexus-browser/reset-profile", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          alert("沙箱缓存与登录态已清空！请重新启动浏览器。");
        } else {
          alert("重置失败: " + data.error);
        }
      } catch (e) {
        alert("请求异常: " + e.message);
      }
    }

    function showToast(msg) {
      const toast = document.getElementById("nexusToast");
      toast.innerText = msg;
      toast.style.display = "block";
      setTimeout(() => { toast.style.display = "none"; }, 2800);
    }

    // Auto navigate if initialUrl provided
    if (currentMainUrl) {
      navigate(currentMainUrl);
    }
  </script>
</body>
</html>`;
}
