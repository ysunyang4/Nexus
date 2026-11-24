/**
 * Nexus Extension Bridge Pro - Duck.ai Adapter
 */

if (!window.DuckAdapter) {
class DuckAdapter extends (window.BaseAdapter || BaseAdapter) {
  constructor() {
    super(
      "duck-speed",
      "DuckDuckGo AI",
      "快速轻量摘要、即时草案起草"
    );
    this.initialAssistantCount = 0;
    this.initialLastContent = "";
    this.currentPrompt = "";
  }

  canHandle(url) {
    return url.includes("duckduckgo.com") || url.includes("duck.ai");
  }

  checkHealth() {
    const input = document.querySelector("textarea");
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
    return Array.from(document.querySelectorAll("div[class*='message']:not([class*='user']), .markdown"));
  }

  getLatestAssistantText() {
    const msgs = this.getAssistantMessages();
    if (msgs.length === 0) return "";
    const last = msgs[msgs.length - 1];
    return (last.innerText || last.textContent || "").trim();
  }

  async injectPrompt(promptText) {
    this.currentPrompt = promptText.trim();
    const input = document.querySelector("textarea");
    if (!input) {
      throw new Error("Duck.ai 输入框未就绪");
    }

    this.initialAssistantCount = this.getAssistantMessages().length;
    this.initialLastContent = this.getLatestAssistantText();

    this.simulateInput(input, promptText);
    await new Promise((r) => setTimeout(r, 200));

    const sendBtn = this.findSendButton(input, [
      "button[type='submit']",
      "button[aria-label*='Send']",
      "button[aria-label*='发送']",
    ]);

    await this.triggerSubmit(input, sendBtn);
    return true;
  }

  async waitForCompletion(timeoutMs = 90000) {
    const startTime = Date.now();
    let stablePollCount = 0;
    let lastContent = "";

    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (Date.now() - startTime > timeoutMs) {
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
          reject(new Error("Duck.ai 任务超时"));
          return;
        }

        const stopBtn = document.querySelector("button[aria-label*='Stop'], [aria-label*='停止']");
        const currentMessages = this.getAssistantMessages();
        const currentCount = currentMessages.length;
        const currentText = this.getLatestAssistantText();

        const isNewContent =
          currentCount > this.initialAssistantCount ||
          (currentText.length > 0 && currentText !== this.initialLastContent && currentText !== this.currentPrompt);

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
      }, 400);
    });
  }
}
window.DuckAdapter = DuckAdapter;
}
