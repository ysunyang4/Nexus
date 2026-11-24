/**
 * Nexus Extension Bridge Pro - Claude (Web) Adapter
 */

if (!window.ClaudeAdapter) {
class ClaudeAdapter extends (window.BaseAdapter || BaseAdapter) {
  constructor() {
    super(
      "claude-worker",
      "Claude 3.7 Sonnet",
      "同构草案生成、并行脚手架、重构分析"
    );
    this.initialAssistantCount = 0;
    this.initialLastContent = "";
    this.currentPrompt = "";
  }

  canHandle(url) {
    return url.includes("claude.ai");
  }

  checkHealth() {
    const input = document.querySelector("div[contenteditable='true'], .ProseMirror, textarea");
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
      document.querySelectorAll("[data-is-streaming], .font-claude-message, div[class*='message']:not([class*='user'])")
    );
  }

  getLatestAssistantText() {
    const msgs = this.getAssistantMessages();
    if (msgs.length === 0) return "";
    const last = msgs[msgs.length - 1];
    return (last.innerText || last.textContent || "").trim();
  }

  async injectPrompt(promptText) {
    this.currentPrompt = promptText.trim();
    const input = document.querySelector("div[contenteditable='true'], .ProseMirror, textarea");
    if (!input) {
      throw new Error("Claude 输入框未就绪");
    }

    this.initialAssistantCount = this.getAssistantMessages().length;
    this.initialLastContent = this.getLatestAssistantText();

    this.simulateInput(input, promptText);
    await new Promise((r) => setTimeout(r, 400));

    const sendBtn = this.findSendButton(input, [
      "button[aria-label*='Send']",
      "button[aria-label*='发送']",
      "button[data-testid='send-button']",
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
          // 超时保底救生员：若已超时但页面已有回复，直接返回避免假超时
          const fallbackText = this.getLatestAssistantText();
          if (fallbackText && fallbackText.length > 0 && fallbackText !== this.currentPrompt) {
            resolve({
              success: true,
              nodeId: this.nodeId,
              content: fallbackText,
            });
            return;
          }
          reject(new Error("Claude 任务超时"));
          return;
        }

        const stopBtn = document.querySelector(
          "button[aria-label*='Stop' i], button[aria-label*='停止'], button[data-testid*='stop']"
        );
        const currentMessages = this.getAssistantMessages();
        const currentCount = currentMessages.length;
        const currentText = this.getLatestAssistantText();

        const isNewContent =
          currentCount > this.initialAssistantCount ||
          (currentText.length > 0 && currentText !== this.initialLastContent && currentText !== this.currentPrompt);

        // 快速失败保护：超过 4.5s 输入框依然有文本且未开启生成
        if (elapsed > 4500 && !isNewContent && !stopBtn) {
          const curInput = document.querySelector("div[contenteditable='true'], .ProseMirror, textarea");
          const curVal = curInput ? (curInput.innerText || curInput.textContent || "").trim() : "";
          if (curVal.length > 0 && curVal.includes(this.currentPrompt.slice(0, 15))) {
            clearInterval(interval);
            reject(new Error("Claude 页面未接受发送指令（输入框内容未清空，发送按钮可能处于禁用状态）"));
            return;
          }
        }

        const lastMsg = currentMessages.length > 0 ? currentMessages[currentMessages.length - 1] : null;
        const turn = lastMsg ? (lastMsg.closest?.("[data-testid*='chat-turn'], article, div[class*='turn']") || lastMsg.parentElement || lastMsg) : null;
        const hasActionBar = turn ? Boolean(
          turn.querySelector("button[aria-label*='Copy' i], button[aria-label*='复制'], button[data-testid*='thumbs']")
        ) : false;

        if (isNewContent && currentText.length > 0) {
          if (stopBtn && !hasActionBar) {
            stablePollCount = 0;
            lastContent = currentText;
            return;
          }

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
      }, 300);
    });
  }
}
window.ClaudeAdapter = ClaudeAdapter;
}
