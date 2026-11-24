/**
 * Nexus Extension Bridge Pro - ChatGPT Adapter
 */

if (!window.ChatGPTAdapter) {
class ChatGPTAdapter extends (window.BaseAdapter || BaseAdapter) {
  constructor() {
    super(
      "gpt-omni",
      "ChatGPT (GPT-4o / Omni)",
      "通用架构设计、代码审查、深度对话"
    );
    this.initialAssistantCount = 0;
    this.initialLastContent = "";
    this.currentPrompt = "";
  }

  canHandle(url) {
    return url.includes("chatgpt.com") || url.includes("chat.openai.com");
  }

  checkHealth() {
    const isLogin =
      window.location.pathname.startsWith("/auth") ||
      window.location.href.includes("login") ||
      Boolean(document.querySelector("button[data-testid='login-button'], a[href*='login']"));

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
      document.querySelector("#prompt-textarea") ||
      document.querySelector("textarea") ||
      document.querySelector("div[contenteditable='true']");
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
    // 1. 优先匹配 markdown 正文容器（ChatGPT 仅对助手回复渲染 .markdown/.prose，用户消息绝无此类）
    const mds = Array.from(document.querySelectorAll(".markdown, div[class*='markdown'], .prose"));
    if (mds.length > 0) return mds;

    // 2. 匹配明确标有助手身份的容器
    const turns = Array.from(
      document.querySelectorAll(
        "[data-message-author-role='assistant'], div[class*='agent-turn'], [data-testid*='assistant']"
      )
    );
    if (turns.length > 0) return turns;

    // 3. 对话 turn 容器，但必须严格过滤掉包含用户发送内容的节点
    const allTurns = Array.from(document.querySelectorAll("article[data-testid*='conversation-turn'], article"));
    const filteredTurns = allTurns.filter((turn) => {
      if (turn.querySelector("[data-message-author-role='user'], [data-testid*='user']")) return false;
      const text = (turn.innerText || "").trim();
      if (this.currentPrompt && text.startsWith(this.currentPrompt.slice(0, 30))) return false;
      return true;
    });
    if (filteredTurns.length > 0) return filteredTurns;

    return [];
  }

  getLatestAssistantText() {
    const msgs = this.getAssistantMessages();
    if (msgs.length === 0) return "";
    const last = msgs[msgs.length - 1];

    // 优先提取内部正文 markdown 节点，杜绝混入底部操作按钮文本
    const md = last.querySelector ? (last.querySelector(".markdown, .prose, div[class*='markdown']") || last) : last;
    let text = (md.innerText || md.textContent || "").trim();

    // 清理末尾附加的操作栏按钮文字
    text = text
      .replace(/\n+(?:复制代码|复制|分享|朗读|重新生成|Bad response|Good response|Copy code|Copy|Share|Read aloud|Regenerate)\s*$/i, "")
      .trim();
    return text;
  }

  hasFinishedActionBar() {
    const msgs = this.getAssistantMessages();
    if (msgs.length === 0) return false;
    const lastMsg = msgs[msgs.length - 1];

    // 严格限制在最后一条助手消息自身所在的回合容器内，杜绝多轮会话中历史消息操作栏导致误判
    const turn =
      (lastMsg.closest && (
        lastMsg.closest("article[data-testid*='conversation-turn']") ||
        lastMsg.closest("article") ||
        lastMsg.closest("div[class*='agent-turn']")
      )) ||
      lastMsg.parentElement?.parentElement ||
      lastMsg;

    if (!turn || !turn.querySelector) return false;

    const actionEl = turn.querySelector(
      "button[data-testid*='copy'], [aria-label*='复制'], [aria-label*='Copy' i], button[data-testid*='good-response'], button[data-testid*='thumbs-up'], button[data-testid*='bad-response'], button[aria-label*='重新生成'], button[aria-label*='Regenerate' i], button[aria-label*='朗读'], button[aria-label*='Read aloud' i]"
    );
    return Boolean(actionEl);
  }

  isStopButtonActive() {
    const stopBtn = document.querySelector(
      "button[data-testid='stop-button'], button[aria-label*='Stop' i], button[aria-label*='停止生成'], button[aria-label*='停止']"
    );
    if (!stopBtn) return false;
    if (stopBtn.disabled || stopBtn.getAttribute("aria-disabled") === "true") return false;
    if (stopBtn.offsetParent === null) return false;
    try {
      const style = window.getComputedStyle(stopBtn);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    } catch {}
    return true;
  }

  async startNewChat() {
    const candidates = Array.from(
      document.querySelectorAll(
        "a[href='/'], a[href='https://chatgpt.com/'], button[data-testid*='new-chat'], button[aria-label*='新聊天'], button[aria-label*='New chat' i], [data-testid*='create-new-chat']"
      )
    );
    for (const el of candidates) {
      const text = (el.innerText || el.textContent || "").trim();
      const label = (el.getAttribute("aria-label") || "").trim();
      const testid = (el.getAttribute("data-testid") || "").toLowerCase();
      if (
        text.includes("新聊天") ||
        text.includes("New chat") ||
        label.includes("新聊天") ||
        label.includes("New chat") ||
        testid.includes("new-chat") ||
        testid.includes("create-new-chat")
      ) {
        this.virtualClick(el);
        await new Promise((r) => setTimeout(r, 800));
        return true;
      }
    }

    // 快捷键降级：ChatGPT 原生新建对话快捷键 Ctrl+Shift+O
    try {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "O",
          code: "KeyO",
          keyCode: 79,
          which: 79,
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        })
      );
      await new Promise((r) => setTimeout(r, 600));
      return true;
    } catch {}

    return super.startNewChat();
  }

  async exitVoiceModeIfActive() {
    // 检查页面是否正处于语音对话模式或麦克风监听状态（截图中带 X 的蓝色按钮或退出按钮）
    const voiceButtons = Array.from(
      document.querySelectorAll(
        "button[aria-label*='Close voice' i], button[aria-label*='Exit voice' i], button[aria-label*='Cancel' i], button[aria-label*='退出语音'], button[aria-label*='关闭语音'], button[aria-label*='取消'], button[data-testid*='close-voice'], div[class*='voice'] button"
      )
    );
    for (const btn of voiceButtons) {
      const label = (btn.getAttribute("aria-label") || btn.getAttribute("data-testid") || btn.innerText || "").toLowerCase();
      if (
        label.includes("close") ||
        label.includes("exit") ||
        label.includes("cancel") ||
        label.includes("退出") ||
        label.includes("关闭") ||
        label.includes("取消") ||
        btn.querySelector("svg")
      ) {
        this.virtualClick(btn);
        await new Promise((r) => setTimeout(r, 400));
        return true;
      }
    }
    return false;
  }

  async injectPrompt(promptText) {
    this.currentPrompt = promptText.trim();

    // 0. 优先退出任何意外激活的语音模式
    await this.exitVoiceModeIfActive();

    const input =
      document.querySelector("#prompt-textarea") ||
      document.querySelector("div.ProseMirror[role='textbox']") ||
      document.querySelector("textarea") ||
      document.querySelector("div[contenteditable='true']");
    if (!input) {
      throw new Error("ChatGPT 输入框未就绪");
    }

    this.initialAssistantCount = this.getAssistantMessages().length;
    this.initialLastContent = this.getLatestAssistantText();

    input.focus({ preventScroll: true });

    // 1. 针对 ChatGPT 官方 ProseMirror 编辑器深度注入（杜绝文字消失或 React 未监听）
    const isProseMirror =
      input.classList.contains("ProseMirror") ||
      input.id === "prompt-textarea" ||
      input.getAttribute("role") === "textbox" ||
      input.isContentEditable;

    if (isProseMirror) {
      // 构造 ProseMirror 标准 HTML 段落结构
      const safeHtml = promptText
        .split("\n")
        .map((line) => {
          const escaped = line
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return escaped.length === 0 ? "<p><br></p>" : `<p>${escaped}</p>`;
        })
        .join("");

      input.innerHTML = safeHtml;

      // 派发原生 input 与 change 事件（驱动 ProseMirror 内部 Document 树与 React 状态双重同步）
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true, cancelable: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));

      // 附加一次 insertText InputEvent 增强容错
      try {
        const inputEvt = new InputEvent("input", {
          bubbles: true,
          composed: true,
          cancelable: true,
          inputType: "insertText",
          data: promptText,
        });
        input.dispatchEvent(inputEvt);
      } catch {}

      // 光标定位至末尾
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {}
    } else {
      this.simulateInput(input, promptText);
    }

    // 2. 轮询查找并等待真实发送按钮变为可用状态（最多轮询等待 2.5 秒，保证 React 状态就绪）
    const preferredSendSelectors = [
      "button[data-testid='send-button']",
      "button[data-testid='fruitjuice-send-button']",
      "#composer-submit-button",
      "button[aria-label*='Send prompt' i]",
      "button[aria-label*='发送提示']",
      "button[aria-label*='发送消息']",
      "button[aria-label='Send' i]",
      "button[aria-label='发送']",
    ];

    let clicked = false;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 2500) {
      let sendBtn = null;
      for (const sel of preferredSendSelectors) {
        const btn = document.querySelector(sel);
        if (btn) {
          const label = (btn.getAttribute("aria-label") || "").toLowerCase();
          const testid = (btn.getAttribute("data-testid") || "").toLowerCase();
          if (
            label.includes("voice") ||
            label.includes("语音") ||
            label.includes("mic") ||
            label.includes("麦克风") ||
            testid.includes("voice")
          ) {
            continue;
          }
          sendBtn = btn;
          break;
        }
      }

      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute("aria-disabled") !== "true") {
        this.virtualClick(sendBtn);
        if (typeof sendBtn.click === "function") {
          sendBtn.click();
        }
        clicked = true;
        break;
      }

      await new Promise((r) => setTimeout(r, 120));
    }

    // 3. 若轮询超时未能检测到活跃发送按钮，降级尝试表单原生提交与 Enter 派发
    if (!clicked) {
      const form = input.closest ? input.closest("form") : null;
      if (form && typeof form.requestSubmit === "function") {
        try {
          form.requestSubmit();
          clicked = true;
        } catch {}
      }
      if (!clicked) {
        this.dispatchEnter(input);
      }
    }

    return true;
  }

  async waitForCompletion(timeoutMs = 180000) {
    const startTime = Date.now();
    let stablePollCount = 0;
    let lastContent = "";

    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeoutMs) {
          clearInterval(interval);
          // 超时保底救生员：如果页面上其实已经存在有效回复，即使到达超时也直接 resolve 返回，杜绝假超时报错！
          const fallbackText = this.getLatestAssistantText();
          if (fallbackText && fallbackText.length > 0 && fallbackText !== this.currentPrompt) {
            resolve({
              success: true,
              nodeId: this.nodeId,
              content: fallbackText,
            });
            return;
          }
          reject(new Error("ChatGPT 任务超时 (超过 " + Math.round(timeoutMs / 1000) + " 秒)"));
          return;
        }

        const currentMessages = this.getAssistantMessages();
        const currentCount = currentMessages.length;
        const currentText = this.getLatestAssistantText();

        const isNewContent =
          currentText.length > 0 &&
          (currentCount > this.initialAssistantCount || currentText !== this.initialLastContent) &&
          currentText !== this.currentPrompt;

        // 快速失败保护（Fast Failure Guard）：若超过 4.5 秒输入框依然残留完整提示词且未进入生成态，立即早退
        if (elapsed > 4500 && !isNewContent) {
          const curInput = document.querySelector("#prompt-textarea, textarea, div[contenteditable='true']");
          const curInputVal = curInput ? (curInput.innerText || curInput.value || "").trim() : "";
          if (curInputVal.length > 0 && curInputVal.includes(this.currentPrompt.slice(0, 15))) {
            clearInterval(interval);
            reject(
              new Error(
                "ChatGPT 页面未接受发送指令（输入框内容未清空，发送按钮可能处于禁用状态或页面被弹窗阻挡，请检查该标签页）"
              )
            );
            return;
          }
        }

        if (isNewContent) {
          const hasFinishedActions = this.hasFinishedActionBar();
          // 如果当前回复已渲染出复制等操作栏，证明流式绝对已终止，无需再受停止按钮残留影响
          const isGenerating = !hasFinishedActions && this.isStopButtonActive();

          if (isGenerating) {
            stablePollCount = 0;
            lastContent = currentText;
            return;
          }

          if (currentText === lastContent) {
            stablePollCount++;
            // 若操作栏已就绪，1 次采样（200ms）即可闪电完成；若无操作栏，采样 3 次（600ms）确保流式彻底停止
            const requiredCount = hasFinishedActions ? 1 : 3;
            if (stablePollCount >= requiredCount) {
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
      }, 200);
    });
  }
}
window.ChatGPTAdapter = ChatGPTAdapter;
}
