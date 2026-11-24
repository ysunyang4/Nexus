/**
 * Nexus Extension Bridge Pro - Popup Interaction Controller
 * Claude Signature Warm Aesthetic with instant tab jumping and auto-wake.
 */

document.addEventListener("DOMContentLoaded", () => {
  const connBadge = document.getElementById("connBadge");
  const connText = document.getElementById("connText");
  const gatewayBadge = document.getElementById("gatewayBadge");
  const nodeList = document.getElementById("nodeList");
  const nodeCount = document.getElementById("nodeCount");
  const btnScan = document.getElementById("btnScan");
  const btnTheme = document.getElementById("btnTheme");

  // 0. 主题切换与持久化 (默认 Claude 暖浅模式，支持一键切换 Claude 暖深模式)
  const verEl = document.getElementById("brandVersion");
  if (verEl && chrome.runtime?.getManifest) {
    const v = chrome.runtime.getManifest().version;
    if (v) verEl.textContent = `v${v} · 网页多模型算力中枢`;
  }

  const savedTheme = localStorage.getItem("nexus_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  if (btnTheme) {
    btnTheme.textContent = savedTheme === "dark" ? "☀️" : "🌙";
    btnTheme.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("nexus_theme", next);
      btnTheme.textContent = next === "dark" ? "☀️" : "🌙";
    });
  }

  // 1. 各大模型高质感轻量 SVG 图标库 (自适应浅色与深色 Claude 色块)
  const MODEL_ICONS = {
    "deepseek-reasoner": `
      <div class="brand-icon-wrap icon-deepseek">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
          <path d="M12 12 2.1 12.5"></path>
          <path d="m4.93 4.93 4.24 4.24"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </div>
    `,
    "gpt-omni": `
      <div class="brand-icon-wrap icon-chatgpt">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m10 15 5-3-5-3v6z"></path>
        </svg>
      </div>
    `,
    "claude-worker": `
      <div class="brand-icon-wrap icon-claude">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </div>
    `,
    "kimi-longcontext": `
      <div class="brand-icon-wrap icon-kimi">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
        </svg>
      </div>
    `,
    "doubao-pro": `
      <div class="brand-icon-wrap icon-doubao">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
    `,
    "duck-speed": `
      <div class="brand-icon-wrap icon-duck">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
      </div>
    `,
  };

  function getIcon(nodeId) {
    if (!nodeId) return MODEL_ICONS["gpt-omni"];
    const key = Object.keys(MODEL_ICONS).find((k) => nodeId.toLowerCase().includes(k) || k.includes(nodeId.toLowerCase()));
    return key ? MODEL_ICONS[key] : MODEL_ICONS["gpt-omni"];
  }

  function renderState(state) {
    if (!state) return;

    // 1. 本地连接状态渲染
    if (connBadge && connText) {
      if (state.connected) {
        connText.textContent = "Nexus 已联通";
        connBadge.className = "status-pill status-pill-online";
        connBadge.title = "已成功连接本地调度引擎 (18080)";
        const dot = connBadge.querySelector(".status-dot");
        if (dot) dot.classList.add("pulse");
      } else {
        connText.textContent = "未连接 (点击重试)";
        connBadge.className = "status-pill status-pill-offline";
        connBadge.title = "点击重试连接本地 Nexus 调度服务 (18080)";
        const dot = connBadge.querySelector(".status-dot");
        if (dot) dot.classList.remove("pulse");
      }
    }

    // 2. 调度权限状态
    if (gatewayBadge) {
      if (state.gatewayEnabled === false) {
        gatewayBadge.textContent = "已闭锁 (外部禁调)";
        gatewayBadge.className = "gateway-tag tag-closed";
        gatewayBadge.title = "已在 Nexus 桌面端工作台关闭调度授权，外部 AI 无法调用";
      } else {
        gatewayBadge.textContent = "已开放 (Claude / AI 可调度)";
        gatewayBadge.className = "gateway-tag tag-open";
        gatewayBadge.title = "Nexus 桌面调度授权已开启，支持多模型接力推理";
      }
    }

    // 3. 算力节点列表渲染
    if (nodeList) {
      const nodes = state.nodes || state.activeNodes || [];
      if (nodeCount) {
        nodeCount.textContent = String(nodes.length);
      }

      if (nodes.length === 0) {
        nodeList.innerHTML = `
          <div class="empty-state">
            <div>未在 Edge 中发现已打开的 AI 页面</div>
            <div class="empty-action-hint">请在浏览器打开 DeepSeek / ChatGPT / Kimi 等，点击上方“刷新检测”</div>
          </div>
        `;
      } else {
        nodeList.innerHTML = nodes
          .map((n) => {
            const statusUpper = (n.status || "ONLINE").toUpperCase();
            let pillClass = "status-online";
            let statusText = "🟢 就绪 ONLINE";

            if (statusUpper === "STANDBY") {
              pillClass = "status-standby";
              statusText = "🟡 点击唤醒";
            } else if (statusUpper === "UNAUTHORIZED" || statusUpper === "OFFLINE") {
              pillClass = "status-unauthorized";
              statusText = "🔒 未登录";
            }

            return `
              <div class="node-card" data-tab-id="${n.tabId || ''}" data-status="${statusUpper}" title="${statusUpper === 'STANDBY' ? '点击一键唤醒并激活该标签页' : '点击切换并聚焦至该标签页'}">
                <div class="node-left">
                  ${getIcon(n.nodeId)}
                  <div class="node-text-wrap">
                    <div class="node-name">
                      <span>${escapeHtml(n.displayName || n.nodeId)}</span>
                      <span class="jump-icon">↗</span>
                    </div>
                    <div class="node-desc">${escapeHtml(n.bestFor || n.title || "高性能模型推理节点")}</div>
                  </div>
                </div>
                <span class="node-status-pill ${pillClass}">${statusText}</span>
              </div>
            `;
          })
          .join("");

        // 绑定卡片点击：若休眠中则点击自动唤醒刷新，若就绪则一键聚焦
        const cards = nodeList.querySelectorAll(".node-card");
        cards.forEach((card) => {
          const tabIdStr = card.getAttribute("data-tab-id");
          const status = card.getAttribute("data-status");
          if (tabIdStr) {
            const tabId = parseInt(tabIdStr, 10);
            if (!isNaN(tabId)) {
              card.addEventListener("click", () => {
                if (status === "STANDBY") {
                  const pill = card.querySelector(".node-status-pill");
                  if (pill) {
                    pill.textContent = "⏳ 唤醒刷新中...";
                    pill.className = "node-status-pill status-standby";
                  }
                  chrome.runtime.sendMessage({ action: "ACTIVATE_AND_WAKE_TAB", tabId }, (res) => {
                    if (res && res.nodes) {
                      renderState(res);
                    } else {
                      refresh();
                    }
                  });
                } else {
                  chrome.runtime.sendMessage({ action: "ACTIVATE_TAB", tabId });
                }
              });
            }
          }
        });
      }
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function refresh() {
    const icon = btnScan ? btnScan.querySelector(".refresh-icon") : null;
    if (icon) icon.classList.add("spinning");

    if (nodeList && (!nodeList.children || nodeList.children.length === 0)) {
      nodeList.innerHTML = `<div class="empty-state">正在深度探测 Edge AI 标签页状态...</div>`;
    }

    chrome.runtime.sendMessage({ action: "SCAN_NODES" }, (res) => {
      if (icon) {
        setTimeout(() => icon.classList.remove("spinning"), 500);
      }
      if (!chrome.runtime.lastError && res) {
        renderState(res);
      } else {
        chrome.storage.local.get(["nexusState"], (localRes) => {
          renderState(localRes.nexusState || {});
        });
      }
    });
  }

  // 1. 0ms 极速呈现本地缓存状态
  chrome.storage.local.get(["nexusState"], (localRes) => {
    if (localRes && localRes.nexusState) {
      renderState(localRes.nexusState);
    }
  });

  // 2. 实时监听来自 Background Service Worker 的状态广播
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "STATE_UPDATED" && msg.state) {
      renderState(msg.state);
    }
  });

  // 3. 向 Background 查询最新状态
  chrome.runtime.sendMessage({ action: "POPUP_INIT" }, (res) => {
    if (!chrome.runtime.lastError && res) {
      renderState(res);
    }
  });

  // 4. 事件监听
  if (btnScan) {
    btnScan.addEventListener("click", () => {
      refresh();
    });
  }

  if (connBadge) {
    connBadge.addEventListener("click", () => {
      if (connText) connText.textContent = "重连中...";
      chrome.runtime.sendMessage({ action: "RECONNECT" }, (res) => {
        if (!chrome.runtime.lastError && res) {
          renderState(res);
        }
      });
    });
  }
});
