/**
 * Nexus Extension Bridge Pro - Background Service Worker (MV3)
 * Handles bidirectional WebSocket connection with local Nexus Relay Server on 18080.
 * Implements keepalive heartbeat, auto-injection, tab anti-sleep locking, and automatic tab wake-up.
 */

const NEXUS_WS_URLS = [
  "ws://127.0.0.1:18080/extension-relay",
  "ws://localhost:18080/extension-relay",
];

const ADAPTER_SCRIPTS = [
  "adapters/base-adapter.js",
  "adapters/chatgpt-adapter.js",
  "adapters/claude-adapter.js",
  "adapters/deepseek-adapter.js",
  "adapters/kimi-adapter.js",
  "adapters/doubao-adapter.js",
  "adapters/duck-adapter.js",
  "content.js",
];

let ws = null;
let currentWsIndex = 0;
let reconnectTimer = null;
let isConnected = false;
let activeServerUrl = "";
let gatewayEnabled = true;
let lastDiscoveredNodes = [];
const activeDispatchTasks = new Map();

// 1. 保活闹钟 (MV3 Keepalive Alarm)
chrome.alarms.create("nexus_keepalive", { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "nexus_keepalive") {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectToNexus();
    } else {
      try {
        ws.send(JSON.stringify({ type: "HEARTBEAT", timestamp: Date.now() }));
      } catch {}
    }
  }
});

function broadcastState(partial = {}) {
  const state = {
    connected: isConnected,
    gatewayEnabled,
    serverUrl: activeServerUrl,
    nodes: lastDiscoveredNodes,
    ...partial,
  };
  chrome.runtime.sendMessage({
    action: "STATE_UPDATED",
    state,
  }).catch(() => {});
}

function isAiUrl(url) {
  if (!url) return false;
  return (
    url.includes("chatgpt.com") ||
    url.includes("openai.com") ||
    url.includes("claude.ai") ||
    url.includes("deepseek.com") ||
    url.includes("kimi.com") ||
    url.includes("kimi.moonshot.cn") ||
    url.includes("moonshot.cn") ||
    url.includes("doubao.com") ||
    url.includes("duckduckgo.com") ||
    url.includes("duck.ai")
  );
}

// 2. 标签页创建与更新事件监听：自动锁定 autoDiscardable: false，禁止 Edge 将 AI 标签页休眠
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab && tab.url && isAiUrl(tab.url)) {
    chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab && tab.url && isAiUrl(tab.url)) {
    chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});
  }
});

// 3. 动态注入脚本（带 3000ms 超时防护）
async function tryInjectContentScripts(tabId) {
  try {
    if (!chrome.scripting || !chrome.scripting.executeScript) return false;
    const p = chrome.scripting.executeScript({
      target: { tabId },
      files: ADAPTER_SCRIPTS,
    });
    const timeout = new Promise((r) => setTimeout(() => r(false), 3000));
    return await Promise.race([p, timeout]);
  } catch (err) {
    return false;
  }
}

// 优雅唤醒休眠标签页并等待页面完全加载与 Hydration 完成
function reloadAndWaitForTab(tabId, timeoutMs = 8000) {
  return new Promise(async (resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }, timeoutMs);

    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 800); // 留出 React/Vue SPA 挂载渲染时间
        }
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    try {
      await chrome.tabs.reload(tabId);
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
  });
}

// 4. 连接 Nexus 本地中转服务
function connectToNexus(force = false) {
  if (!force && ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (ws) {
    try {
      ws.close();
    } catch {}
    ws = null;
  }

  const url = NEXUS_WS_URLS[currentWsIndex % NEXUS_WS_URLS.length];
  activeServerUrl = url;

  try {
    ws = new WebSocket(url);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.onopen = async () => {
    isConnected = true;
    updateStorageState({ connected: true, serverUrl: url, lastConnected: Date.now() });
    broadcastState({ connected: true, serverUrl: url });

    // 发送扩展注册消息
    try {
      ws.send(
        JSON.stringify({
          type: "EXTENSION_REGISTER",
          version: "1.3.4",
          client: "Nexus Extension Bridge Pro",
        })
      );
    } catch {}

    // 自动扫描并同步节点给 Nexus 后端
    const nodes = await scanActiveNodes();
    try {
      ws.send(
        JSON.stringify({
          type: "NODES_DISCOVERED",
          requestId: "init_sync_" + Date.now(),
          nodes,
        })
      );
    } catch {}
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      await handleNexusMessage(msg);
    } catch (err) {
      console.error("[Nexus Extension Pro] 解析消息失败:", err);
    }
  };

  ws.onerror = () => {
    isConnected = false;
    updateStorageState({ connected: false });
    broadcastState({ connected: false });
  };

  ws.onclose = () => {
    isConnected = false;
    updateStorageState({ connected: false });
    broadcastState({ connected: false });
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    currentWsIndex++;
    connectToNexus();
  }, 2000);
}

// 5. 处理 Nexus 指令
async function handleNexusMessage(msg) {
  if (msg.type === "PING") {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
    }
    return;
  }

  if (msg.type === "GATEWAY_STATE_CHANGED") {
    gatewayEnabled = Boolean(msg.enabled);
    updateStorageState({ gatewayEnabled });
    broadcastState({ gatewayEnabled });
    return;
  }

  // 发现活跃节点
  if (msg.type === "DISCOVER_NODES") {
    const nodes = await scanActiveNodes();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "NODES_DISCOVERED",
          requestId: msg.requestId,
          nodes,
        })
      );
    }
    return;
  }

  // 调度任务执行
  if (msg.type === "DISPATCH_TASK") {
    const { requestId, nodeId, prompt, timeoutMs, action, newChat, deleteCurrentChat } = msg;
    let targetTab = await findTabForNode(nodeId);

    if (!targetTab) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "TASK_RESULT",
            requestId,
            nodeId,
            success: false,
            node_not_open: true,
            error: `目标模型节点 [${nodeId}] 对应的标签页未在 Edge 浏览器中打开。请先在 Edge 中打开对应网站并登录。`,
          })
        );
      }
      return;
    }

    // 1. 自动唤醒休眠标签页：检测 Edge discarded 状态或心跳是否无响应
    let isSleeping = Boolean(targetTab.discarded);
    if (!isSleeping) {
      const ping = await sendHealthCheck(targetTab.id);
      if (!ping) {
        isSleeping = true;
      }
    }

    if (isSleeping) {
      console.log(`[Nexus Extension Pro] 目标标签页 [${nodeId}] 处于 Edge 休眠状态，执行自动热唤醒...`);
      try {
        await reloadAndWaitForTab(targetTab.id, 8000);
        await tryInjectContentScripts(targetTab.id);
      } catch (err) {
        console.warn("[Nexus Extension Pro] 唤醒重载异常:", err);
      }
    }

    // 2. 强制锁定 autoDiscardable: false，禁止 Edge 再次将其休眠
    try {
      await chrome.tabs.update(targetTab.id, { autoDiscardable: false });
    } catch {}

    // 执行前确保脚本已就绪
    await tryInjectContentScripts(targetTab.id);

    // 3. 构建任务生命周期追踪与防睡保活泵
    const taskRecord = {
      requestId,
      nodeId,
      tabId: targetTab.id,
      completed: false,
      sendResult: null,
    };
    activeDispatchTasks.set(requestId, taskRecord);

    const sendTaskResultOnce = (payload) => {
      if (taskRecord.completed) return;
      taskRecord.completed = true;
      activeDispatchTasks.delete(requestId);
      if (taskKeepaliveTimer) {
        clearInterval(taskKeepaliveTimer);
      }

      const sendPayload = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(
              JSON.stringify({
                type: "TASK_RESULT",
                requestId,
                nodeId,
                success: Boolean(payload.success),
                content: payload.content,
                error: payload.error,
              })
            );
          } catch {}
        }
      };

      if (!ws || ws.readyState !== WebSocket.OPEN) {
        connectToNexus(true);
        setTimeout(sendPayload, 400);
      } else {
        sendPayload();
      }
    };

    taskRecord.sendResult = sendTaskResultOnce;

    // 任务执行期间每 3 秒刷新 Service Worker 与后端中转连接，防止 MV3 空闲休眠断流
    const taskKeepaliveTimer = setInterval(() => {
      if (taskRecord.completed) {
        clearInterval(taskKeepaliveTimer);
        return;
      }
      try {
        chrome.runtime.getPlatformInfo(() => {});
      } catch {}

      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(
            JSON.stringify({
              type: "TASK_KEEPALIVE",
              requestId,
              nodeId,
              timestamp: Date.now(),
            })
          );
        } catch {}
      }
    }, 3000);

    const taskPayload = {
      action: "EXECUTE_TASK",
      requestId,
      prompt,
      taskAction: action || (newChat ? "new_chat" : deleteCurrentChat ? "delete_chat" : "chat"),
      newChat: Boolean(newChat),
      deleteCurrentChat: Boolean(deleteCurrentChat),
      timeoutMs,
    };

    const doSend = (isRetry = false) => {
      try {
        chrome.tabs.sendMessage(targetTab.id, taskPayload, async (response) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr || !response) {
            // 若遇到接收端未就绪且尚未重试过，立即自动动态补注脚本并无缝二次重发
            if (!isRetry && lastErr && lastErr.message && lastErr.message.includes("Receiving end does not exist")) {
              console.warn(`[Nexus Extension Pro] 目标标签页 [${nodeId}] 接收端未连接，尝试自动动态补注脚本并重发...`);
              await tryInjectContentScripts(targetTab.id);
              await new Promise((r) => setTimeout(r, 400));
              doSend(true);
              return;
            }

            // 如果 content.js 已通过 TASK_FINISHED_PUSH 直推完成，则忽略回调错误
            if (!taskRecord.completed) {
              setTimeout(() => {
                if (!taskRecord.completed) {
                  let errText = lastErr ? lastErr.message : "未收到页面响应";
                  if (errText.includes("Receiving end does not exist")) {
                    errText = `目标标签页 [${nodeId}] 通信通道断开。请在 Edge 中按 F5 刷新该页面或点击插件面板卡片重新唤醒。`;
                  }
                  sendTaskResultOnce({
                    success: false,
                    error: errText,
                  });
                }
              }, 1200);
            }
            return;
          }

          sendTaskResultOnce(response);
        });
      } catch (err) {
        if (!taskRecord.completed) {
          sendTaskResultOnce({
            success: false,
            error: err.message || String(err),
          });
        }
      }
    };

    doSend(false);
  }
}

// 6. 辅助函数：扫描所有打开的 AI 标签页
async function scanActiveNodes() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return lastDiscoveredNodes;
  }

  const nodes = [];

  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl || "";
    if (!url) continue;
    if (!isAiUrl(url)) continue;

    // 自动对所有检测到的 AI 标签页标记 autoDiscardable: false，防止进入休眠
    chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});

    // 1. 尝试直接健康检查（带 350ms 硬超时，防止沉睡标签页卡死）
    let resp = await sendHealthCheck(tab.id);

    // 2. 如果页面在加载扩展前就已打开，尝试动态补注脚本
    if (!resp) {
      await tryInjectContentScripts(tab.id);
      resp = await sendHealthCheck(tab.id);
    }

    if (resp && resp.health) {
      nodes.push({
        ...resp.health,
        tabId: tab.id,
        title: tab.title || url,
        url: url,
      });
    } else {
      // 3. 容底模式：即使 DOM 尚未准备好，也识别该标签页并展示
      const fallback = inferNodeFromUrl(url);
      if (fallback) {
        nodes.push({
          ...fallback,
          tabId: tab.id,
          title: tab.title || url,
          url: url,
        });
      }
    }
  }

  lastDiscoveredNodes = nodes;
  updateStorageState({ activeNodes: nodes, lastScan: Date.now() });

  // 同步向本地 Nexus 服务汇报
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(
        JSON.stringify({
          type: "NODES_DISCOVERED",
          requestId: "push_" + Date.now(),
          nodes,
        })
      );
    } catch {}
  }

  return nodes;
}

function sendHealthCheck(tabId) {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, 350);

    try {
      chrome.tabs.sendMessage(tabId, { action: "HEALTH_CHECK" }, (r) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError || !r) {
            resolve(null);
          } else {
            resolve(r);
          }
        }
      });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

function inferNodeFromUrl(url) {
  if (url.includes("deepseek.com")) {
    return {
      nodeId: "deepseek-reasoner",
      displayName: "DeepSeek R1 (深度求索)",
      status: "STANDBY",
      bestFor: "点击卡片一键唤醒并激活",
      ready: false,
    };
  }
  if (url.includes("kimi.com") || url.includes("kimi.moonshot.cn") || url.includes("moonshot.cn")) {
    return {
      nodeId: "kimi-longcontext",
      displayName: "Kimi (月之暗面)",
      status: "STANDBY",
      bestFor: "点击卡片一键唤醒并激活",
      ready: false,
    };
  }
  if (url.includes("chatgpt.com") || url.includes("openai.com")) {
    return {
      nodeId: "gpt-omni",
      displayName: "ChatGPT (GPT-4o / Omni)",
      status: "STANDBY",
      bestFor: "点击卡片一键唤醒并激活",
      ready: false,
    };
  }
  if (url.includes("claude.ai")) {
    return {
      nodeId: "claude-worker",
      displayName: "Claude 3.7 Sonnet",
      status: "STANDBY",
      bestFor: "点击卡片一键唤醒并激活",
      ready: false,
    };
  }
  if (url.includes("doubao.com")) {
    return {
      nodeId: "doubao-pro",
      displayName: "豆包 (字节跳动)",
      status: "STANDBY",
      bestFor: "点击卡片一键唤醒并激活",
      ready: false,
    };
  }
  if (url.includes("duckduckgo.com") || url.includes("duck.ai")) {
    return {
      nodeId: "duck-speed",
      displayName: "DuckDuckGo AI",
      status: "STANDBY",
      bestFor: "点击卡片一键唤醒并激活",
      ready: false,
    };
  }
  return null;
}

// 7. 辅助函数：按 NodeId 查找标签页（兼顾 discarded 标签页的 pendingUrl）
async function findTabForNode(nodeId) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl || "";
    if (!url) continue;
    if (nodeId.includes("gpt") && (url.includes("chatgpt.com") || url.includes("chat.openai.com") || url.includes("openai.com"))) return tab;
    if (nodeId.includes("claude") && url.includes("claude.ai")) return tab;
    if (nodeId.includes("deepseek") && url.includes("deepseek.com")) return tab;
    if (nodeId.includes("kimi") && (url.includes("kimi.com") || url.includes("kimi.moonshot.cn") || url.includes("moonshot.cn"))) return tab;
    if (nodeId.includes("doubao") && url.includes("doubao.com")) return tab;
    if (nodeId.includes("duck") && (url.includes("duckduckgo.com") || url.includes("duck.ai"))) return tab;
  }
  return null;
}

function updateStorageState(partial) {
  try {
    chrome.storage.local.get(["nexusState"], (res) => {
      const current = res ? (res.nexusState || {}) : {};
      chrome.storage.local.set({ nexusState: { ...current, ...partial } });
    });
  } catch {}
}

// 8. 处理来自 Popup 和 Content 的直接通信
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "ACTIVATE_TAB" && msg.tabId) {
    chrome.tabs.update(msg.tabId, { active: true }).catch(() => {});
    chrome.tabs.get(msg.tabId, (tab) => {
      if (tab && tab.windowId) {
        chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === "ACTIVATE_AND_WAKE_TAB" && msg.tabId) {
    chrome.tabs.update(msg.tabId, { active: true }).catch(() => {});
    chrome.tabs.get(msg.tabId, async (tab) => {
      if (tab && tab.windowId) {
        chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      }
      try {
        await reloadAndWaitForTab(msg.tabId, 6000);
        await tryInjectContentScripts(msg.tabId);
        const nodes = await scanActiveNodes();
        broadcastState({ nodes });
        sendResponse({ ok: true, nodes });
      } catch (err) {
        const nodes = await scanActiveNodes();
        sendResponse({ ok: true, nodes });
      }
    });
    return true;
  }

  if (msg.action === "NODE_KEEPALIVE") {
    if (sender && sender.tab && sender.tab.id) {
      chrome.tabs.update(sender.tab.id, { autoDiscardable: false }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  // 接收来自 Content Script 的长任务执行心跳
  if (msg.action === "TASK_RUNNING_KEEPALIVE") {
    const task = activeDispatchTasks.get(msg.requestId || msg.taskId);
    if (task && ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(
          JSON.stringify({
            type: "TASK_KEEPALIVE",
            requestId: task.requestId,
            nodeId: task.nodeId,
            timestamp: Date.now(),
          })
        );
      } catch {}
    }
    sendResponse({ ok: true });
    return true;
  }

  // 接收来自 Content Script 的任务完成直推（防止长时间任务回调通道中断）
  if (msg.action === "TASK_FINISHED_PUSH") {
    const task = activeDispatchTasks.get(msg.requestId || msg.taskId);
    if (task && task.sendResult) {
      task.sendResult(msg);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === "POPUP_INIT") {
    // 立即秒回当前连接与缓存状态，确保 0ms 闪电呈现
    sendResponse({
      connected: isConnected,
      gatewayEnabled,
      serverUrl: activeServerUrl,
      nodes: lastDiscoveredNodes,
    });

    if (!isConnected) {
      connectToNexus();
    }

    // 后台静默扫描并在完成后广播更新
    scanActiveNodes().then((nodes) => {
      broadcastState({ nodes });
    });
    return true;
  }

  if (msg.action === "SCAN_NODES") {
    (async () => {
      if (!isConnected) {
        connectToNexus();
      }
      const nodes = await scanActiveNodes();
      sendResponse({
        connected: isConnected,
        gatewayEnabled,
        serverUrl: activeServerUrl,
        nodes,
      });
    })();
    return true;
  }

  if (msg.action === "RECONNECT") {
    currentWsIndex = 0;
    connectToNexus(true);
    setTimeout(() => {
      sendResponse({
        connected: isConnected,
        gatewayEnabled,
        serverUrl: activeServerUrl,
        nodes: lastDiscoveredNodes,
      });
      scanActiveNodes().then((nodes) => {
        broadcastState({ nodes });
      });
    }, 400);
    return true;
  }

  if (msg.action === "NODE_PAGE_LOADED") {
    scanActiveNodes();
    sendResponse({ ok: true });
    return true;
  }
});

// 初始化启动连接与初次扫描
connectToNexus();
scanActiveNodes();
