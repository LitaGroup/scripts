/**
 * Appium 资源：基于 W3C WebDriver 协议的 Appium HTTP 客户端（零三方依赖，使用全局 fetch）。
 *
 * - 服务地址来自环境变量 SCRIPT_APPIUM_URL，默认 http://127.0.0.1:4723/
 *   （本地无 Appium 环境时，可使用内部服务器 http://172.20.1.79:4723/）
 * - 仅实现脚本所需的最小指令集：会话管理、元素查找/点击/输入、页面源码、截图等。
 */

export interface AppiumCapabilities {
  platformName: 'Android' | 'iOS';
  'appium:automationName'?: string;
  'appium:app'?: string;
  'appium:appPackage'?: string;
  'appium:appActivity'?: string;
  'appium:bundleId'?: string;
  'appium:udid'?: string;
  'appium:deviceName'?: string;
  'appium:noReset'?: boolean;
  'appium:newCommandTimeout'?: number;
  [key: string]: unknown;
}

/** 定位器：[using, value]，配合 by.xxx 使用 */
export type Locator = [using: string, value: string];

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

function xpathLiteral(s: string): string {
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return 'concat(' + s.split("'").map((p) => `'${p}'`).join(`, "'", `) + ')';
}

/** 常用定位器（同时兼容 Android 与 iOS 的属性命名） */
export const by = {
  id: (id: string): Locator => ['id', id],
  accessibilityId: (id: string): Locator => ['accessibility id', id],
  xpath: (xp: string): Locator => ['xpath', xp],
  /** 按可见文本精确定位（匹配 Android text/content-desc 与 iOS label/name） */
  text: (t: string): Locator => {
    const l = xpathLiteral(t);
    return ['xpath', `//*[@text=${l} or @content-desc=${l} or @label=${l} or @name=${l}]`];
  },
  /** 按可见文本模糊定位 */
  textContains: (t: string): Locator => {
    const l = xpathLiteral(t);
    return ['xpath', `//*[contains(@text,${l}) or contains(@content-desc,${l}) or contains(@label,${l}) or contains(@name,${l})]`];
  },
};

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class AppiumResource {
  private readonly baseUrl: string;
  private sessionId: string | null = null;

  constructor(baseUrl: string = process.env.SCRIPT_APPIUM_URL ?? 'http://127.0.0.1:4723/') {
    this.baseUrl = baseUrl;
  }

  get isActive(): boolean {
    return this.sessionId !== null;
  }

  /** 创建会话，返回 sessionId */
  async createSession(capabilities: AppiumCapabilities): Promise<string> {
    if (this.sessionId) throw new Error('Appium 会话已存在，请先 deleteSession()');
    const value = (await this.request(
      'POST',
      'session',
      { capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } },
      120_000,
    )) as { sessionId?: string } | null;
    const sid = value?.sessionId;
    if (!sid) throw new Error('Appium 创建会话失败：响应中无 sessionId');
    this.sessionId = sid;
    // 隐式等待置 0：存在性判断立即返回，等待逻辑由 waitFor 显式轮询
    await this.setImplicitWait(0);
    return sid;
  }

  async deleteSession(): Promise<void> {
    if (!this.sessionId) return;
    const sid = this.sessionId;
    this.sessionId = null;
    await this.request('DELETE', `session/${sid}`);
  }

  async setImplicitWait(ms: number): Promise<void> {
    await this.request('POST', `session/${this.sid()}/timeouts`, { implicit: ms });
  }

  // ---------- 元素操作 ----------

  async findElement(locator: Locator): Promise<string> {
    const value = (await this.request('POST', `session/${this.sid()}/element`, {
      using: locator[0],
      value: locator[1],
    })) as Record<string, string>;
    const id = value?.[ELEMENT_KEY] ?? value?.ELEMENT;
    if (!id) throw new Error(`元素未找到: ${locator[0]}=${locator[1]}`);
    return id;
  }

  async findElements(locator: Locator): Promise<string[]> {
    const value = (await this.request('POST', `session/${this.sid()}/elements`, {
      using: locator[0],
      value: locator[1],
    })) as Record<string, string>[];
    return (value ?? []).map((e) => e[ELEMENT_KEY] ?? e.ELEMENT).filter(Boolean);
  }

  /** 元素是否存在（隐式等待为 0，立即返回） */
  async exists(locator: Locator): Promise<boolean> {
    return (await this.findElements(locator)).length > 0;
  }

  /** 轮询等待元素出现，超时返回 false（轮询间隔默认 200ms，特殊情况可单独设置） */
  async waitFor(locator: Locator, timeoutMs = 10_000, intervalMs = 200): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    do {
      if (await this.exists(locator)) return true;
      await sleep(intervalMs);
    } while (Date.now() < deadline);
    return false;
  }

  /** 点击元素（页面切换期间元素可能失效/瞬时不存在，自动重试一次） */
  async click(locator: Locator): Promise<void> {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const id = await this.findElement(locator);
        await this.request('POST', `session/${this.sid()}/element/${id}/click`, {});
        return;
      } catch (e) {
        lastErr = e as Error;
        if (attempt === 0 && /does not exist in DOM anymore|stale|could not be located/i.test(lastErr.message)) {
          await sleep(200);
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr;
  }

  /**
   * 输入文本（先聚焦并清空，再通过 W3C Actions 键盘逐字输入）。
   * 注意：UiAutomator2 的 /value（sendKeys）在部分输入框上会静默失败，故统一走 Actions。
   */
  async input(locator: Locator, text: string): Promise<void> {
    const id = await this.findElement(locator);
    await this.request('POST', `session/${this.sid()}/element/${id}/click`, {}); // 聚焦
    await sleep(200);
    await this.request('POST', `session/${this.sid()}/element/${id}/clear`, {});
    const keyActions: Record<string, string>[] = [];
    for (const ch of text) {
      keyActions.push({ type: 'keyDown', value: ch }, { type: 'keyUp', value: ch });
    }
    await this.request('POST', `session/${this.sid()}/actions`, {
      actions: [{ type: 'key', id: 'keyboard', actions: keyActions }],
    });
    await this.request('DELETE', `session/${this.sid()}/actions`); // 释放输入状态
  }

  async textOf(locator: Locator): Promise<string> {
    const id = await this.findElement(locator);
    const value = await this.request('GET', `session/${this.sid()}/element/${id}/text`);
    return String(value ?? '');
  }

  async isDisplayed(locator: Locator): Promise<boolean> {
    const ids = await this.findElements(locator);
    if (ids.length === 0) return false;
    try {
      return (await this.request('GET', `session/${this.sid()}/element/${ids[0]}/displayed`)) === true;
    } catch {
      return false;
    }
  }

  // ---------- 页面 / 设备 ----------

  /** 当前页面 XML 源码（用于状态检测、调试） */
  async source(): Promise<string> {
    return String(await this.request('GET', `session/${this.sid()}/source`) ?? '');
  }

  async back(): Promise<void> {
    await this.request('POST', `session/${this.sid()}/back`, {});
  }

  /** 当前 Activity（Android；失败或 iOS 返回空字符串） */
  async currentActivity(): Promise<string> {
    try {
      return String((await this.execute('mobile: getCurrentActivity', [])) ?? '');
    } catch {
      return '';
    }
  }

  /** 键盘是否弹出 */
  async isKeyboardShown(): Promise<boolean> {
    try {
      return Boolean(await this.execute('mobile: isKeyboardShown', []));
    } catch {
      return false;
    }
  }

  /**
   * 隐藏软键盘（输入后、点击被键盘遮挡的按钮前调用）。
   * 密码框/安全键盘等场景 mobile: hideKeyboard 可能失效，此时回退为 BACK 键收起
   * （先通过 isKeyboardShown 确认键盘仍在才按，避免误触发页面返回）。
   */
  async hideKeyboard(): Promise<void> {
    try {
      await this.execute('mobile: hideKeyboard', []);
      await sleep(200); // 等待收起动画
      if (await this.isKeyboardShown()) {
        await this.execute('mobile: pressKey', [{ keycode: 4 }]); // KEYCODE_BACK
        await sleep(200);
      }
    } catch {
      // 键盘未弹出时忽略
    }
  }

  /** 执行 Appium mobile: 扩展命令（如 mobile: activateApp / mobile: terminateApp） */
  async execute(script: string, args: unknown[] = []): Promise<unknown> {
    return this.request('POST', `session/${this.sid()}/execute/sync`, { script, args });
  }

  /** 当前窗口尺寸 */
  async windowRect(): Promise<{ width: number; height: number }> {
    const v = (await this.request('GET', `session/${this.sid()}/window/rect`)) as { width: number; height: number };
    return { width: v.width, height: v.height };
  }

  /**
   * 向上滑动（列表向下滚动），percent 为滑动距离占滑动区域高度比例。
   * 滑动区域限制在屏幕中段（25%~75%），避开顶部状态栏与底部系统手势区。
   */
  async swipeUp(percent = 0.9): Promise<void> {
    await this.swipe('up', percent);
  }

  /** 向下滑动（列表向上滚动） */
  async swipeDown(percent = 0.9): Promise<void> {
    await this.swipe('down', percent);
  }

  /** 在可滚动容器内滑动（优先于全屏滑动，避免误触系统手势） */
  async swipeInElement(locator: Locator, direction: 'up' | 'down', percent = 0.9): Promise<void> {
    const elementId = await this.findElement(locator);
    await this.execute('mobile: swipeGesture', [{ elementId, direction, percent }]);
  }

  private async swipe(direction: 'up' | 'down', percent: number): Promise<void> {
    const { width, height } = await this.windowRect();
    const left = Math.round(width * 0.15);
    const top = Math.round(height * 0.25);
    await this.execute('mobile: swipeGesture', [
      { left, top, width: width - left * 2, height: Math.round(height * 0.5), direction, percent },
    ]);
  }

  /** 截图，返回 base64（PNG） */
  async screenshotBase64(): Promise<string> {
    return String(await this.request('GET', `session/${this.sid()}/screenshot`) ?? '');
  }

  // ---------- 内部 ----------

  private sid(): string {
    if (!this.sessionId) throw new Error('Appium 会话未创建，请先 createSession()');
    return this.sessionId;
  }

  private async request(method: string, path: string, body?: unknown, timeoutMs = 60_000): Promise<unknown> {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : this.baseUrl + '/';
    const url = new URL(path, base);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new Error(`appium ${method} ${url} 请求失败: ${(e as Error).message}`);
    }
    let data: { value?: unknown } | null = null;
    try {
      data = (await res.json()) as { value?: unknown };
    } catch {
      // 非 JSON 响应
    }
    const value = data?.value;
    const err = value && typeof value === 'object' && 'error' in value ? (value as { error?: string; message?: string }) : null;
    if (!res.ok || err) {
      const msg = String(err?.message ?? res.statusText).split('\n')[0].slice(0, 300);
      throw new Error(`appium ${method} ${path} 失败: ${msg}`);
    }
    return value;
  }
}
