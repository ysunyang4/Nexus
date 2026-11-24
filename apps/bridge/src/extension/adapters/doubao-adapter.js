/**
 * Nexus Extension Bridge Pro - Doubao Adapter
 */

if (!window.DoubaoAdapter) {
class DoubaoAdapter extends (window.BaseAdapter || BaseAdapter) {
  constructor() {
    super(
      "doubao-pro",
      "豆包 (字节跳动)",
      "原生中文优化、极速构思、本土化表达"
    );
    this.initialAssistantCount = 0;
    this.initialLastContent = "";
    this.currentPrompt = "";
  }

  canHandle(url) {
    return url.includes("doubao.com");
  }

  checkHealth() {
    const input = document.querySelector("textarea, div[contenteditable='true']");
    const isReady = Boolean(input);
    return {
      nodeId: this.nodeId,
      displayName: this.displayName,
      status: isReady ? "ONLINE" : "STANDBY",
      bestFor: this.bestFor,
      ready: isReady,
    };
  }

  getAssistantMessages() {
    return Array.from(
      document.querySelectorAll(
        "div[class*='chat-message-assistant'], div[class*='segment-assistant'], div[class*='markdown'], div[data-testid='message_text'], div[class*='message-content']:not([class*='user'])"
      )
    ).filter((el) => {
      const cls = (el.className || "").toString().toLowerCase();
      return !cls.includes("user") && !cls.includes("question") && !cls.includes("prompt");
    });
  }

  getLatestAssistantText() {
    const msgs = this.getAssistantMessages();
    if (msgs.length === 0) return "";
    const last = msgs[msgs.length - 1];
    return (last.innerText || last.textContent || "").trim();
  }

  async startNewChat() {
    // 寻找豆包“开启新对话”或“新对话”按钮
    const candidates = Array.from(document.querySelectorAll("button, div[role='button'], a, span")).filter((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      const testid = (el.getAttribute("data-testid") || "").toLowerCase();
      return (
        text === "开启新对话" ||
        text === "新对话" ||
        text === "新建对话" ||
        text === "新建会话" ||
        testid.includes("new_chat") ||
        testid.includes("new-chat")
      );
    });

    if (candidates.length > 0) {
      this.virtualClick(candidates[0]);
      await new Promise((r) => setTimeout(r, 400));
      return true;
    }
    return super.startNewChat();
  }

  async deleteCurrentChat() {
    // 寻找豆包左侧会话列表中的当前项
    const activeItem = document.querySelector(
      "div[class*='active'], div[class*='selected'], div[aria-selected='true'], li[class*='active']"
    );
    if (activeItem) {
      const moreBtn = activeItem.querySelector(
        "button, div[role='button'], svg, [class*='more'], [class*='menu'], [class*='operation']"
      );
      if (moreBtn) {
        this.virtualClick(moreBtn);
        await new Promise((r) => setTimeout(r, 200));

        const deleteOption = Array.from(
          document.querySelectorAll("div[role='menuitem'], button, div[class*='menu'] div, span")
        ).find((el) => {
          const t = (el.innerText || el.textContent || "").trim();
          return t === "删除" || t.includes("删除会话");
        });

        if (deleteOption) {
          this.virtualClick(deleteOption);
          await new Promise((r) => setTimeout(r, 250));

          const confirmBtn = Array.from(document.querySelectorAll("button, div[role='button']")).find((el) => {
            const t = (el.innerText || el.textContent || "").trim();
            return t === "确定" || t === "确认" || t === "删除";
          });

          if (confirmBtn) {
            this.virtualClick(confirmBtn);
            await new Promise((r) => setTimeout(r, 300));
            return true;
          }
        }
      }
    }
    return false;
  }

  async injectPrompt(promptText) {
    this.currentPrompt = promptText.trim();
    const input = document.querySelector("textarea, div[contenteditable='true']");
    if (!input) {
      throw new Error("豆包输入框未就绪");
    }

    // Baseline snapshot
    this.initialAssistantCount = this.getAssistantMessages().length;
    this.initialLastContent = this.getLatestAssistantText();

    this.simulateInput(input, promptText);
    await new Promise((r) => setTimeout(r, 250));

    // Precise send button discovery
    const sendBtn = this.findSendButton(input, [
      "button[data-testid='chat_input_send_button']",
      "button[id*='send']",
      "div[class*='send-btn']",
      "button[class*='send-btn']",
      "button[aria-label*='发送']",
      "div[role='button'][aria-label*='发送']",
      "button[data-testid*='send']",
      "div[class*='chat-input'] button",
      "div[class*='input-container'] button:has(svg)",
    ]);

    await this.triggerSubmit(input, sendBtn);
    return true;
  }

  async waitForCompletion(timeoutMs = 120000, options = {}) {
    if (options.fireAndForget || this.fireAndForget) {
      return {
        success: true,
        nodeId: this.nodeId,
        content: "[已成功派发至豆包] 任务已在豆包网页端后台运行（即发即弃，零 Token 消耗）。",
      };
    }
    const startTime = Date.now();
    let stablePollCount = 0;
    let lastContent = "";

    return new Promise((resolve, reject) => {
      // 优化轮询频次为 150ms，显著提升返回响应速度
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs) {
          clearInterval(interval);
          const fallbackText = this.getLatestAssistantText();
          if (fallbackText && fallbackText.length > 0 && fallbackText !== this.currentPrompt) {
            resolve({
              success: true,
              nodeId: this.nodeId,
              content: fallbackText,
            });
            return;
          }
          reject(new Error("豆包任务超时 (已达 " + Math.round(timeoutMs / 1000) + " 秒上限)"));
          return;
        }

        // 精准检测输入区域内豆包是否处于生成状态（停止按钮仅存在于输入框或发送区域）
        const stopBtn = document.querySelector(
          "button[data-testid='chat_input_stop_button'], div[class*='chat-input'] [aria-label*='停止'], div[class*='input-container'] [aria-label*='停止'], button[class*='stop-btn'], div[class*='send-btn-stop'], button[data-testid*='stop']"
        );

        const currentMessages = this.getAssistantMessages();
        const currentCount = currentMessages.length;
        const currentText = this.getLatestAssistantText();

        const isNewContent =
          currentCount > this.initialAssistantCount ||
          (currentText.length > 0 && currentText !== this.initialLastContent && currentText !== this.currentPrompt);

        // 快速失败保护：超过 4.5s 输入框依然有文本且未开启生成
        if (elapsed > 4500 && !isNewContent && !stopBtn) {
          const curInput = document.querySelector("textarea, div[contenteditable='true']");
          const curVal = curInput ? (curInput.value || curInput.innerText || "").trim() : "";
          if (curVal.length > 0 && curVal.includes(this.currentPrompt.slice(0, 15))) {
            clearInterval(interval);
            reject(new Error("豆包页面未接受发送指令（输入框内容未清空，发送按钮可能处于禁用状态）"));
            return;
          }
        }

        if (isNewContent && currentText.length > 0) {
          if (stopBtn) {
            stablePollCount = 0;
            lastContent = currentText;
            return;
          }

          // 快速就绪检测：停止按钮已消失，且消息下方复制/操作栏已渲染，说明已彻底生成完毕
          const lastMsg = currentMessages[currentMessages.length - 1];
          const turn = lastMsg ? (lastMsg.closest?.("[data-testid*='message_turn'], div[class*='message-item'], div[class*='turn']") || lastMsg.parentElement || lastMsg) : null;
          const hasActionBar = turn ? Boolean(
            turn.querySelector(
              "[data-testid='message_action_bar'], div[class*='feedback'], button[aria-label*='复制'], button[title*='复制'], div[class*='actions']"
            )
          ) : false;

          if (currentText === lastContent) {
            stablePollCount++;
            // 若操作栏已就绪只需稳定 1 次（150ms），否则稳定 2 次（300ms），极速返回
            const threshold = hasActionBar ? 1 : 2;
            if (stablePollCount >= threshold) {
              clearInterval(interval);
              resolve({
                success: true,
                nodeId: this.nodeId,
                content: currentText,
              });
              return;
            }
          } else {
            stablePollCount = 0;
            lastContent = currentText;
          }
        }
      }, 150);
    });
  }
}
window.DoubaoAdapter = DoubaoAdapter;
}
