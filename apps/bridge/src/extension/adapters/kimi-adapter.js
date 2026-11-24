/**
 * Nexus Extension Bridge Pro - Kimi Adapter
 */

if (!window.KimiAdapter) {
class KimiAdapter extends (window.BaseAdapter || BaseAdapter) {
  constructor() {
    super(
      "kimi-longcontext",
      "Kimi (月之暗面)",
      "超长上下文研读、海量文档提炼、跨文本交叉索引"
    );
    this.initialAssistantCount = 0;
    this.initialLastContent = "";
    this.currentPrompt = "";
  }

  canHandle(url) {
    return (
      url.includes("kimi.com") ||
      url.includes("kimi.moonshot.cn") ||
      url.includes("moonshot.cn")
    );
  }

  checkHealth() {
    const input =
      document.querySelector("div[contenteditable='true']") ||
      document.querySelector(".chat-input-editor") ||
      document.querySelector("textarea") ||
      document.querySelector("div[class*='editor']");
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
    const segments = Array.from(
      document.querySelectorAll(
        "div[class*='segment-content'], div[class*='chat-message']:not([class*='user'])"
      )
    ).filter((el) => {
      const cls = (el.className || "").toString().toLowerCase();
      return !cls.includes("user") && !cls.includes("question") && !cls.includes("prompt");
    });
    if (segments.length > 0) return segments;

    return Array.from(document.querySelectorAll("div[class*='markdown']")).filter((el) => {
      const cls = (el.className || "").toString().toLowerCase();
      return !cls.includes("user") && !cls.includes("question") && !cls.includes("prompt");
    });
  }

  getLatestAssistantText() {
    const msgs = this.getAssistantMessages();
    if (msgs.length === 0) return "";
    const last = msgs[msgs.length - 1];

    try {
      const clone = last.cloneNode(true);
      const thinkingNodes = clone.querySelectorAll(
        "div[class*='think'], div[class*='reason'], div[class*='thought'], .kimi-thinking, details, summary"
      );
      thinkingNodes.forEach((node) => node.remove());

      let text = (clone.innerText || clone.textContent || "").trim();
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      return text;
    } catch {
      let text = (last.innerText || last.textContent || "").trim();
      return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    }
  }

  async startNewChat() {
    // 寻找 Kimi 专属“新建会话 Ctrl K”按钮
    const btn = Array.from(document.querySelectorAll("button, div[role='button'], a, span")).find((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      return text.includes("新建会话") || text.includes("新会话");
    });
    if (btn) {
      this.virtualClick(btn);
      await new Promise((r) => setTimeout(r, 400));
      return true;
    }
    // 快捷键降级
    try {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          code: "KeyK",
          keyCode: 75,
          which: 75,
          ctrlKey: true,
          bubbles: true,
        })
      );
      await new Promise((r) => setTimeout(r, 400));
      return true;
    } catch {}
    return super.startNewChat();
  }

  async deleteCurrentChat() {
    // 寻找 Kimi 左侧列表当前活动会话
    const activeItem = document.querySelector(
      "div[class*='active'], div[class*='selected'], div[aria-selected='true'], li[class*='active']"
    );
    if (activeItem) {
      const moreBtn = activeItem.querySelector(
        "button, div[role='button'], svg, [class*='more'], [class*='menu'], [class*='action']"
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
    return super.deleteCurrentChat();
  }

  async injectPrompt(promptText) {
    this.currentPrompt = promptText.trim();
    const input =
      document.querySelector("div[contenteditable='true']") ||
      document.querySelector(".chat-input-editor") ||
      document.querySelector("div[class*='editor']") ||
      document.querySelector("textarea");
    if (!input) {
      throw new Error("Kimi 输入框未就绪");
    }

    // 记录基准快照
    this.initialAssistantCount = this.getAssistantMessages().length;
    this.initialLastContent = this.getLatestAssistantText();

    this.simulateInput(input, promptText);
    await new Promise((r) => setTimeout(r, 300));

    // 全面检索发送按钮
    const sendBtn = this.findSendButton(input, [
      "div[class*='send-button']",
      "button[class*='send-button']",
      "div[class*='sendBtn']",
      "button[class*='sendBtn']",
      "div[class*='SendButton']",
      "button[class*='SendButton']",
      "div[class*='send-icon']",
      "div[class*='sendIcon']",
      "button[aria-label*='发送']",
      "div[role='button'][aria-label*='发送']",
      "button[data-testid*='send']",
      "div[data-testid*='send']",
      "div[class*='chat-input'] div[role='button']:has(svg)",
      "div[class*='chat-input'] button:has(svg)",
      "div[class*='editor-container'] button:has(svg)",
      "div[class*='input-box'] button:has(svg)",
    ]);

    await this.triggerSubmit(input, sendBtn);
    return true;
  }

  async waitForCompletion(timeoutMs = 120000) {
    const startTime = Date.now();
    let stablePollCount = 0;
    let lastContent = "";

    return new Promise((resolve, reject) => {
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
          reject(new Error("Kimi 任务超时 (已达 " + Math.round(timeoutMs / 1000) + " 秒上限)"));
          return;
        }

        // 精准检测输入区域内 Kimi 是否处于生成状态（发送按钮变更为停止按钮）
        const stopBtn = document.querySelector(
          "div[class*='chat-input'] [aria-label*='停止'], div[class*='chat-input'] button[class*='stop'], div[class*='stop-btn'], button[class*='stop'], button[data-testid*='stop']"
        );

        const currentMessages = this.getAssistantMessages();
        const currentCount = currentMessages.length;
        const currentText = this.getLatestAssistantText();

        const isNewContent =
          currentCount > this.initialAssistantCount ||
          (currentText.length > 0 && currentText !== this.initialLastContent && currentText !== this.currentPrompt);

        // 快速失败保护：超过 4.5s 输入框依然有文本且未开启生成
        if (elapsed > 4500 && !isNewContent && !stopBtn) {
          const curInput = document.querySelector("div[contenteditable='true'], .chat-input-editor, textarea");
          const curVal = curInput ? (curInput.innerText || curInput.textContent || "").trim() : "";
          if (curVal.length > 0 && curVal.includes(this.currentPrompt.slice(0, 15))) {
            clearInterval(interval);
            reject(new Error("Kimi 页面未接受发送指令（输入框内容未清空，发送按钮可能处于禁用状态）"));
            return;
          }
        }

        if (isNewContent && currentText.length > 0) {
          if (stopBtn) {
            stablePollCount = 0;
            lastContent = currentText;
            return;
          }

          // Kimi 生成完毕标志：检查最后一条消息所在区域是否出现复制按钮或操作条
          const lastMsg = currentMessages[currentMessages.length - 1];
          const turn = lastMsg ? (lastMsg.closest?.("div[class*='segment'], div[class*='chat-item'], div[class*='turn']") || lastMsg.parentElement || lastMsg) : null;
          const hasActionBar = turn ? Boolean(
            turn.querySelector(
              "button[aria-label*='复制'], [title*='复制'], div[class*='action'] svg, div[class*='operation']"
            )
          ) : false;

          if (currentText === lastContent) {
            stablePollCount++;
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
      }, 250);
    });
  }
}
window.KimiAdapter = KimiAdapter;
}
