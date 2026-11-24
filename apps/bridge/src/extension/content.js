/**
 * Nexus Extension Bridge Pro - Content Script Coordinator
 */

(() => {
  // 1. 防重保护：按 Extension Runtime ID 隔离，确保扩展重载后能成功初始化新监听器
  const currentRuntimeId = (chrome.runtime && chrome.runtime.id) || "nexus";
  if (window.__NEXUS_CONTENT_INITIALIZED_ID__ === currentRuntimeId) {
    return;
  }
  window.__NEXUS_CONTENT_INITIALIZED_ID__ = currentRuntimeId;
  window.__NEXUS_CONTENT_INITIALIZED__ = true;

  const adapters = [
    new window.ChatGPTAdapter(),
    new window.ClaudeAdapter(),
    new window.DeepSeekAdapter(),
    new window.KimiAdapter(),
    new window.DoubaoAdapter(),
    new window.DuckAdapter(),
  ];

  const currentUrl = window.location.href;
  const activeAdapter = adapters.find((a) => a.canHandle(currentUrl));

  if (!activeAdapter) {
    return;
  }

  // 2. 监听来自 Background Service Worker 的指令
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "HEALTH_CHECK") {
      try {
        const health = activeAdapter.checkHealth();
        sendResponse({ success: true, health });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (request.action === "EXECUTE_TASK") {
      const taskId = request.taskId || request.requestId || ("task_" + Date.now());
      (async () => {
        // 1. 每 3 秒向 Background 发送保活心跳，维持 Service Worker 存活并报告进度
        const keepaliveTimer = setInterval(() => {
          try {
            chrome.runtime.sendMessage({
              action: "TASK_RUNNING_KEEPALIVE",
              taskId,
              requestId: request.requestId,
              nodeId: activeAdapter.nodeId,
              timestamp: Date.now(),
            }).catch(() => {});
          } catch {}
        }, 3000);

        const replyResult = (payload) => {
          clearInterval(keepaliveTimer);
          const fullPayload = {
            ...payload,
            taskId,
            requestId: request.requestId,
          };
          try {
            sendResponse(fullPayload);
          } catch {}
          // 2. 双重直推：无论 sendResponse 端口是否因长耗时挂起，均通过广播确保 Background 接收
          try {
            chrome.runtime.sendMessage({
              action: "TASK_FINISHED_PUSH",
              ...fullPayload,
            }).catch(() => {});
          } catch {}
        };

        try {
          const isNewChat = Boolean(request.newChat || request.taskAction === "new_chat");
          const isDeleteChat = Boolean(request.deleteCurrentChat || request.taskAction === "delete_chat");
          const prompt = (request.prompt || "").trim();

          // 开启全新对话
          if (isNewChat) {
            await activeAdapter.startNewChat();
            await new Promise((r) => setTimeout(r, 600));

            // 若仅要求开启新对话而无实际提问指令
            if (!prompt || prompt.length === 0) {
              replyResult({
                success: true,
                nodeId: activeAdapter.nodeId,
                content: `已成功在 [${activeAdapter.displayName}] 开启全新对话会话。`,
                action: "new_chat",
              });
              return;
            }
          }

          // 删除当前对话
          if (isDeleteChat && (!prompt || prompt.length === 0)) {
            const deleted = await activeAdapter.deleteCurrentChat();
            replyResult({
              success: deleted,
              nodeId: activeAdapter.nodeId,
              content: deleted
                ? `已成功在 [${activeAdapter.displayName}] 删除并清理当前活动历史会话。`
                : `未能定位或删除 [${activeAdapter.displayName}] 当前会话（可能已是空会话）。`,
              action: "delete_chat",
            });
            return;
          }

          // 正常派发任务指令
          await activeAdapter.injectPrompt(prompt);
          const result = await activeAdapter.waitForCompletion(request.timeoutMs || 180000, {
            fireAndForget: Boolean(request.fireAndForget || activeAdapter.nodeId === "doubao-pro"),
          });

          // 若任务完成后要求删除当前会话以清理现场
          if (isDeleteChat) {
            try {
              await activeAdapter.deleteCurrentChat();
            } catch {}
          }

          replyResult({
            success: true,
            nodeId: activeAdapter.nodeId,
            content: result.content,
          });
        } catch (err) {
          replyResult({
            success: false,
            nodeId: activeAdapter.nodeId,
            error: err.message || String(err),
          });
        }
      })();
      return true; // 保持异步消息通道开放
    }
  });

  // 3. Web Lock 永驻保活：告知 Chromium/Edge 本页面有常驻工作锁，阻止进入休眠状态
  if (typeof navigator !== "undefined" && navigator.locks && navigator.locks.request) {
    try {
      navigator.locks.request("nexus_active_node_keepalive", { mode: "shared" }, () => {
        return new Promise(() => {}); // 保持共享锁永不释放
      }).catch(() => {});
    } catch {}
  }

  // 4. 定期保活心跳：每 25 秒与 Background 通信，阻止后台标签页被冷冻
  setInterval(() => {
    try {
      chrome.runtime.sendMessage({
        action: "NODE_KEEPALIVE",
        nodeId: activeAdapter.nodeId,
        url: window.location.href,
      }).catch(() => {});
    } catch {}
  }, 25000);

  // 页面加载完成后向 Background 登记一次
  try {
    const health = activeAdapter.checkHealth();
    chrome.runtime.sendMessage({
      action: "NODE_PAGE_LOADED",
      health,
      url: window.location.href,
    });
  } catch {}
})();
