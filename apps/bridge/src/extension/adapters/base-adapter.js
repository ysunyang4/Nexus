/**
 * Nexus Extension Bridge Pro - Base Adapter
 * Standard interface for all model web endpoints.
 * Guarantees zero OS-level mouse movement and zero focus hijacking.
 */

if (!window.BaseAdapter) {
class BaseAdapter {
  constructor(nodeId, displayName, bestFor) {
    this.nodeId = nodeId;
    this.displayName = displayName;
    this.bestFor = bestFor;
  }

  canHandle(url) {
    return false;
  }

  checkHealth() {
    return {
      nodeId: this.nodeId,
      displayName: this.displayName,
      status: "OFFLINE",
      bestFor: this.bestFor,
      ready: false,
    };
  }

  async injectPrompt(promptText) {
    throw new Error("injectPrompt not implemented");
  }

  async waitForCompletion(timeoutMs = 120000) {
    throw new Error("waitForCompletion not implemented");
  }

  /**
   * Starts a brand new conversation session on the target AI platform.
   */
  async startNewChat() {
    // 1. Try finding new chat buttons in sidebar or top bar
    const candidates = Array.from(document.querySelectorAll("button, div[role='button'], a")).filter((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      const label = (el.getAttribute("aria-label") || "").trim();
      const title = (el.getAttribute("title") || "").trim();
      return (
        text === "新建会话" ||
        text === "开启新对话" ||
        text === "新建对话" ||
        text === "新对话" ||
        text.includes("New chat") ||
        text.includes("New Chat") ||
        label.includes("New chat") ||
        label.includes("新建") ||
        title.includes("新建")
      );
    });

    if (candidates.length > 0) {
      this.virtualClick(candidates[0]);
      await new Promise((r) => setTimeout(r, 500));
      return true;
    }

    // 2. Fallback: Ctrl+K shortcut
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

    return false;
  }

  /**
   * Deletes / removes the active chat session from sidebar history.
   */
  async deleteCurrentChat() {
    const activeItem = document.querySelector(
      "div[class*='active'], div[class*='selected'], div[aria-selected='true'], li[class*='active']"
    );
    if (!activeItem) return false;

    const actionBtn = activeItem.querySelector("button, div[role='button'], svg, [class*='more'], [class*='menu']");
    if (actionBtn) {
      this.virtualClick(actionBtn);
      await new Promise((r) => setTimeout(r, 200));

      const deleteOption = Array.from(
        document.querySelectorAll("div[role='menuitem'], button, div[class*='menu'] div, span")
      ).find((el) => {
        const t = (el.innerText || el.textContent || "").trim();
        return t === "删除" || t.includes("删除会话") || t.includes("Delete");
      });

      if (deleteOption) {
        this.virtualClick(deleteOption);
        await new Promise((r) => setTimeout(r, 250));

        const confirmBtn = Array.from(document.querySelectorAll("button, div[role='button']")).find((el) => {
          const t = (el.innerText || el.textContent || "").trim();
          return t === "确定" || t === "确认" || t === "删除" || t === "Confirm" || t === "Delete";
        });

        if (confirmBtn) {
          this.virtualClick(confirmBtn);
          await new Promise((r) => setTimeout(r, 300));
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Helper: Injects text into a textarea or contenteditable element without moving the physical mouse.
   * Completely clears previous text first to prevent duplicates.
   */
  simulateInput(element, text) {
    if (!element) return false;
    element.focus({ preventScroll: true });

    // 1. 原生 Textarea / Input (DeepSeek、部分表单等)
    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      element.value = "";
      const nativeSetter =
        Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set ||
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

      if (nativeSetter) {
        nativeSetter.call(element, text);
      } else {
        element.value = text;
      }
      element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true, composed: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true, composed: true }));
      return true;
    }

    // 2. 富文本 ContentEditable (ChatGPT ProseMirror, Claude, Kimi, 豆包, Lexical)
    if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
      element.focus({ preventScroll: true });

      // 定位内部段落或光标目标
      const targetNode = element.querySelector("p") || element;
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(targetNode);
        selection.removeAllRanges();
        selection.addRange(range);
      } catch {}

      // 尝试通过剪贴板事件直接模拟原生粘贴（ProseMirror / Lexical / Slate 最原生的事件管道）
      let pasteSucceeded = false;
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          composed: true,
          clipboardData: dt,
        });
        element.dispatchEvent(pasteEvent);
        const curVal = (element.innerText || element.textContent || "").trim();
        if (curVal.length > 0 && curVal.includes(text.slice(0, 10))) {
          pasteSucceeded = true;
        }
      } catch {}

      // 次优降级：execCommand insertText
      if (!pasteSucceeded) {
        try {
          document.execCommand("delete", false, null);
          pasteSucceeded = document.execCommand("insertText", false, text);
        } catch {}
      }

      // 第三级降级：beforeinput 事件
      if (!pasteSucceeded) {
        try {
          const beforeInput = new InputEvent("beforeinput", {
            inputType: "insertText",
            data: text,
            bubbles: true,
            cancelable: true,
            composed: true,
          });
          element.dispatchEvent(beforeInput);
        } catch {}
      }

      // 若依旧无字符，最后兜底写 textContent
      const finalVal = (element.innerText || element.textContent || "").trim();
      if (finalVal.length === 0) {
        if (element.querySelector("p")) {
          element.querySelector("p").textContent = text;
        } else {
          element.textContent = text;
        }
      }

      // 派发 input 与 change 事件驱动 React / Vue 状态更新
      element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true, composed: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true, composed: true }));
      return true;
    }

    return false;
  }

  /**
   * Helper: Dispatches full Enter keyboard sequence (keydown, keypress, keyup).
   * Compatible with ProseMirror, Slate, Lexical, React synthetic events.
   */
  dispatchEnter(element) {
    if (!element) return;
    element.focus({ preventScroll: true });

    const eventInit = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      charCode: 13,
      bubbles: true,
      cancelable: true,
      composed: true,
      isComposing: false,
      view: window,
    };

    element.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    element.dispatchEvent(new KeyboardEvent("keypress", eventInit));
    element.dispatchEvent(new KeyboardEvent("keyup", eventInit));
  }

  /**
   * Helper: Clicks an element via DOM event (0 mouse movement).
   * Triggers PointerEvents, MouseEvents, and native click().
   */
  virtualClick(element) {
    if (!element) return false;

    // Dispatch PointerEvents first for modern React/Radix components
    try {
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, composed: true, view: window }));
    } catch {}
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, composed: true, view: window }));

    try {
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, composed: true, view: window }));
    } catch {}
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, composed: true, view: window }));

    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, view: window }));

    if (typeof element.click === "function") {
      try {
        element.click();
      } catch {}
    }
    return true;
  }

  /**
   * Helper: Locates the send button scoped to the input area or via specific selectors.
   * NEVER queries broad selectors like 'button:has(svg)' globally across the whole document.
   */
  findSendButton(input, preferredSelectors = []) {
    // 1. 首选站点专用选择器
    for (const sel of preferredSelectors) {
      try {
        const found = document.querySelector(sel);
        if (found) {
          return found;
        }
      } catch {}
    }

    if (!input) return null;

    // 2. 向上在输入框容器内部寻找（最多溯源 6 层）
    let curr = input;
    for (let i = 0; i < 6; i++) {
      if (!curr || curr === document.body) break;
      curr = curr.parentElement;
      if (!curr) break;

      const forbiddenTerms = [
        "上传", "upload", "附件", "file", "项目", "插件", "client",
        "语音", "voice", "mic", "麦克风", "microphone", "audio", "speech", "talk", "dictat",
        "画布", "canvas", "搜索", "search", "关闭", "close", "取消", "cancel",
        "深度思考", "think", "联网", "web"
      ];

      // 寻找含有 send/发送/submit 特征的按钮（必须排除任何语音/麦克风/工具按钮）
      const candidates = Array.from(
        curr.querySelectorAll(
          "button, div[role='button'], div[class*='send'], div[class*='Send'], button[class*='send'], [aria-label*='发送'], [aria-label*='Send'], [data-testid*='send'], button[type='submit']"
        )
      ).filter((el) => {
        if (el === input || input.contains(el)) return false;
        const text = (el.getAttribute("aria-label") || el.getAttribute("data-testid") || el.innerText || el.title || "").toLowerCase();
        if (forbiddenTerms.some((t) => text.includes(t))) return false;
        return true;
      });

      if (candidates.length > 0) {
        return candidates[candidates.length - 1];
      }

      // 寻找包含 SVG 图标的操作按钮，必须严格过滤非发送类按钮
      const svgButtons = Array.from(curr.querySelectorAll("button:has(svg), div[role='button']:has(svg)")).filter(
        (btn) => {
          if (btn === input || input.contains(btn)) return false;
          const text = (btn.getAttribute("aria-label") || btn.getAttribute("data-testid") || btn.innerText || btn.title || "").toLowerCase();
          if (forbiddenTerms.some((t) => text.includes(t))) {
            return false;
          }
          return true;
        }
      );

      if (svgButtons.length > 0) {
        return svgButtons[svgButtons.length - 1];
      }
    }

    return null;
  }

  /**
   * 强化版单义互斥提交器：
   * 1. 2000ms 强制防抖锁，杜绝任何外部重复调用；
   * 2. 优先点击发送按钮，一旦点击生效立即终止，严禁触发多次提交；
   * 3. 彻底移除点击 SVG 图标与无条件回车重复派发，彻底根绝 3/3 连发！
   */
  async triggerSubmit(input, sendBtn) {
    const now = Date.now();
    if (this._lastSubmitTime && now - this._lastSubmitTime < 2000) {
      console.warn(`[Nexus BaseAdapter] 拦截到 2 秒内的重复提交调用，已自动过滤`);
      return false;
    }
    this._lastSubmitTime = now;

    let submitted = false;

    // 1. 如果找到发送按钮，执行原子点击
    if (sendBtn) {
      // 若按钮为 disabled，给 React 渲染 300ms 宽限期使其解除禁用
      if (sendBtn.disabled || sendBtn.getAttribute("aria-disabled") === "true") {
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 80));
          if (!sendBtn.disabled && sendBtn.getAttribute("aria-disabled") !== "true") {
            break;
          }
        }
      }

      try {
        sendBtn.removeAttribute("disabled");
        sendBtn.setAttribute("aria-disabled", "false");
      } catch {}

      this.virtualClick(sendBtn);

      // 观察 250ms：检测输入框是否已被清空，或页面是否进入流式生成状态
      await new Promise((r) => setTimeout(r, 250));

      const inputVal = input ? (input.value || input.innerText || "").trim() : "";
      if (inputVal.length === 0 || (this.currentPrompt && !inputVal.includes(this.currentPrompt.slice(0, 15)))) {
        // 输入框已清空或已被重置，证明按钮点击已 100% 成功提交，立刻退出！
        submitted = true;
        return true;
      }
    }

    // 2. 只有在按钮点击未能触发（输入框依旧原封不动包含原内容）时，才作为单次备用降级派发回车
    if (!submitted && input) {
      this.dispatchEnter(input);
      await new Promise((r) => setTimeout(r, 200));
      const inputVal = (input.value || input.innerText || "").trim();
      if (inputVal.length === 0 || (this.currentPrompt && !inputVal.includes(this.currentPrompt.slice(0, 15)))) {
        submitted = true;
        return true;
      }
    }

    // 3. 若有表单且上面均未生效，做最后一次尝试
    if (!submitted && input) {
      const form = input.closest("form");
      if (form) {
        try {
          form.requestSubmit();
        } catch {}
      }
    }

    return true;
  }
  }
  window.BaseAdapter = BaseAdapter;
}
