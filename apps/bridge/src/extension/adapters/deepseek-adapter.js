/**
 * Nexus Extension Bridge Pro - DeepSeek Adapter
 */

if (!window.DeepSeekAdapter) {
class DeepSeekAdapter extends (window.BaseAdapter || BaseAdapter) {
  constructor() {
    super(
      "deepseek-reasoner",
      "DeepSeek R1 (深度求索)",
      "复杂算法编程、形式化数学推导、深度逻辑链推理"
    );
    this.initialAssistantCount = 0;
    this.initialLastContent = "";
    this.currentPrompt = "";
  }

  canHandle(url) {
    return url.includes("chat.deepseek.com") || url.includes("deepseek.com");
  }

  checkHealth() {
    const isLogin =
      window.location.href.includes("/login") ||
      Boolean(document.querySelector("div[class*='login-modal'], div[class*='auth-modal']"));

    if (isLogin) {
      return {
        nodeId: this.nodeId,
        displayName: this.displayName,
        status: "UNAUTHORIZED",
        bestFor: this.bestFor,
        ready: false,
      };
    }

    const input =
      document.querySelector("#chat-input") ||
      document.querySelector("textarea") ||
      document.querySelector("[contenteditable='true']");
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
    return Array.from(document.querySelectorAll(".ds-markdown, .chat-message-content, .markdown"));
  }

  getLatestAssistantText() {
    const msgs = this.getAssistantMessages();
    if (msgs.length === 0) return "";
    const last = msgs[msgs.length - 1];

    // Clone node to safely strip thinking container and reasoning blocks
    try {
      const clone = last.cloneNode(true);
      const thinkingNodes = clone.querySelectorAll(
        ".ds-thinking, div[class*='thinking'], div[class*='thought'], div[class*='reasoning'], details, summary"
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
    // 寻找 DeepSeek 专属“开启新对话”按钮
    const btn = Array.from(document.querySelectorAll("button, div[role='button'], a, span")).find((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      const cls = (el.className || "").toString().toLowerCase();
      return (
        text === "开启新对话" ||
        text === "新建对话" ||
        text.includes("New chat") ||
        cls.includes("new-chat") ||
        cls.includes("new_chat")
      );
    });
    if (btn) {
      this.virtualClick(btn);
      await new Promise((r) => setTimeout(r, 600));
      return true;
    }
    return super.startNewChat();
  }

  async deleteCurrentChat() {
    const activeItem = document.querySelector(
      "div[class*='active'], div[class*='selected'], div[aria-selected='true'], li[class*='active']"
    );
    if (activeItem) {
      const moreBtn = activeItem.querySelector(
        "button, div[role='button'], svg, [class*='more'], [class*='menu']"
      );
      if (moreBtn) {
        this.virtualClick(moreBtn);
        await new Promise((r) => setTimeout(r, 200));

        const deleteOption = Array.from(
          document.querySelectorAll("div[role='menuitem'], button, div[class*='menu'] div, span")
        ).find((el) => {
          const t = (el.innerText || el.textContent || "").trim();
          return t === "删除" || t.includes("Delete");
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
      document.querySelector("#chat-input") ||
      document.querySelector("textarea") ||
      document.querySelector("[contenteditable='true']");
    if (!input) {
      throw new Error("DeepSeek 输入框未就绪");
    }

    // Baseline snapshot
    this.initialAssistantCount = this.getAssistantMessages().length;
    this.initialLastContent = this.getLatestAssistantText();

    this.simulateInput(input, promptText);
    await new Promise((r) => setTimeout(r, 300));

    // Precise send button discovery
    const sendBtn = this.findSendButton(input, [
      "#chat-input-send-button",
      "div[role='button'][aria-label*='发送']",
      "div[class*='send-button']",
      "div[class*='_send_']",
      "div[role='button']:has(.ds-icon-arrow-up)",
      "div[class*='ds-icon-button']:has(svg)",
    ]);

    await this.triggerSubmit(input, sendBtn);
    return true;
  }

  async waitForCompletion(timeoutMs = 150000) {
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
          reject(new Error("DeepSeek 任务超时"));
          return;
        }

        // Check if generating
        const stopBtn = document.querySelector(
          "div[role='button'][aria-label*='Stop'], .ds-icon-stop, [aria-label*='停止']"
        );

        const currentMessages = this.getAssistantMessages();
        const currentCount = currentMessages.length;
        const currentText = this.getLatestAssistantText();

        const isNewContent =
          currentCount > this.initialAssistantCount ||
          (currentText.length > 0 && currentText !== this.initialLastContent && currentText !== this.currentPrompt);

        // 快速失败保护：超过 4.5s 输入框依然有文本且未开启生成
        if (elapsed > 4500 && !isNewContent && !stopBtn) {
          const curInput = document.querySelector("#chat-input, textarea");
          const curVal = curInput ? (curInput.value || curInput.innerText || "").trim() : "";
          if (curVal.length > 0 && curVal.includes(this.currentPrompt.slice(0, 15))) {
            clearInterval(interval);
            reject(new Error("DeepSeek 页面未接受发送指令（输入框内容未清空，发送按钮可能处于禁用状态）"));
            return;
          }
        }

        if (isNewContent && currentText.length > 0) {
          if (stopBtn) {
            stablePollCount = 0;
            lastContent = currentText;
            return;
          }

          if (currentText === lastContent) {
            stablePollCount++;
            if (stablePollCount >= 3) {
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
      }, 350);
    });
  }
  }
  window.DeepSeekAdapter = DeepSeekAdapter;
}
