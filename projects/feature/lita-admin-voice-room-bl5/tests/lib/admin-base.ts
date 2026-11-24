/**
 * Lita Admin「语音房优化 BL-0005」UI 测试基类（项目内私有，基于平台 ADMIN 范式演进，不跨项目 import）。
 *
 * 环境：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）；执行机可直连 m-api.test.lita.game，
 *   本次未启用任何 WAF 转发（无 route/fulfill 改写被测链路）。
 * - 账号密码仅运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD（无权限账号 ADMIN_NOAUTH_USERNAME / ADMIN_NOAUTH_PASSWORD）
 *   注入，不写入代码、日志、证据与报告。
 *
 * 约定：
 * - 业务操作用 act()，验证点用 check()；check 标题必须带「用例#N-①」标记。
 * - 断言一律读取页面内容；接口留痕只用于排查与前置/清理辅助，不作为验证点。
 * - 等待一律绑定可观测条件（元素可见/响应到达/loading 消失/表格落定），不使用固定 sleep 作为断言前置。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { CheckBaseClass } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');

export function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

export function slugTime(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 时间格式 yyyy-MM-dd HH:mm:ss（页面时间控件与列表展示格式）。 */
export function fmtTime(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function mask(text: string): string {
  return text
    .replace(/("accessToken"\s*:\s*")[^"]+/g, '$1***')
    .replace(/(cookie\s*:\s*)[^\n]+/gi, '$1***')
    .replace(/(l-user-token\s*:\s*)[^\s,}]+/gi, '$1***')
    .replace(/(accesstoken\s*:\s*)[^\s,}]+/gi, '$1***')
    .replace(/vue_admin_template_token=[^;\s]+/g, 'vue_admin_template_token=***');
}

export interface ApiCall {
  seq: number;
  time: string;
  method: string;
  path: string;
  requestBody?: string;
  status?: number;
  contentType?: string;
  responseBody?: string;
  responseSize?: number;
}

export interface CleanupTask {
  title: string;
  fn: () => Promise<void> | void;
}

export abstract class AdminBase extends CheckBaseClass {
  protected readonly slug: string;
  protected readonly evidenceDir: string;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected calls: ApiCall[] = [];
  protected screenshots: string[] = [];
  protected notes: string[] = [];
  protected shared: Record<string, unknown> = {};
  protected pageErrors: string[] = [];
  protected cleanupTasks: CleanupTask[] = [];
  protected cleanupResults: Array<{ title: string; ok: boolean; message: string }> = [];
  private callSeq = 0;
  private shotNo = 0;

  constructor(slug: string) {
    super();
    this.slug = slug;
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${slugTime()}`)));
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
    this.page = await this.context.newPage();
    this.bindPage(this.page);
    try {
      await super.execute();
    } finally {
      await this.runCleanup();
      this.writeRunLog();
      await this.browser?.close().catch(() => undefined);
      this.log(`证据目录: ${this.evidenceDir}`);
    }
  }

  protected bindPage(page: Page): void {
    page.on('response', (response) => { void this.capture(response); });
    page.on('pageerror', (error) => { this.pageErrors.push(mask(error.message).slice(0, 300)); });
  }

  private async capture(response: Response): Promise<void> {
    const url = response.url();
    if (!url.includes('m-api.test.lita.game')) return;
    let body = '';
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('json') || contentType.includes('text')) {
      body = await response.text().catch(() => '');
    }
    this.calls.push({
      seq: ++this.callSeq,
      time: new Date().toISOString(),
      method: response.request().method(),
      path: url.replace(UI_BASE, '').slice(0, 240),
      requestBody: mask(response.request().postData() ?? '').slice(0, 600),
      status: response.status(),
      contentType,
      responseBody: mask(body).slice(0, 1200),
      responseSize: body.length
    });
  }

  private writeRunLog(): void {
    writeFileSync(join(this.evidenceDir, 'run.json'), JSON.stringify({
      slug: this.slug,
      startedAt: new Date().toISOString(),
      screenshots: this.screenshots,
      notes: this.notes,
      pageErrors: this.pageErrors,
      cleanup: this.cleanupResults,
      apiCalls: this.calls
    }, null, 2), 'utf8');
  }

  protected addCleanup(title: string, fn: () => Promise<void> | void): void {
    this.cleanupTasks.push({ title, fn });
  }

  /** 清理在 done 之后静默执行（不产生 act/check 记录），结果写入 evidence/run.json。 */
  private async runCleanup(): Promise<void> {
    for (const task of this.cleanupTasks.reverse()) {
      try {
        await task.fn();
        this.cleanupResults.push({ title: task.title, ok: true, message: '' });
        this.log(`清理完成：${task.title}`);
      } catch (e) {
        const message = (e as Error).message;
        this.cleanupResults.push({ title: task.title, ok: false, message });
        this.log(`清理失败：${task.title} - ${message}`);
      }
    }
  }

  protected async login(user = process.env.ADMIN_USERNAME, pwd = process.env.ADMIN_PASSWORD, page = this.page!): Promise<void> {
    if (!user || !pwd) throw new Error('缺少 ADMIN_USERNAME / ADMIN_PASSWORD 运行时环境变量，禁止使用会话桩替代登录');
    let last = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        this.notes.push(`登录第 ${attempt + 1} 次尝试（首次失败：${last}）`);
        await page.waitForTimeout(5000);
      }
      await page.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('input[name="username"]', { timeout: 60000 });
      await page.locator('input[name="username"]').fill(user);
      await page.locator('input[name="password"]').fill(pwd);
      const respPromise = page.waitForResponse((r) => r.url().includes('/admin/login'), { timeout: 30000 }).catch(() => null);
      await page.locator('button', { hasText: /^Login$/ }).first().click();
      const resp = await respPromise;
      if (!resp) { last = '登录请求超时未响应'; continue; }
      const body = await resp.text().catch(() => '');
      if (resp.status() !== 200 || !/"status":"0"/.test(body)) {
        last = `HTTP ${resp.status()} ${mask(body).slice(0, 120)}`;
        continue;
      }
      await page.waitForFunction(() => !location.hash.includes('/login'), undefined, { timeout: 30000 });
      await page.waitForSelector('.el-menu-item', { timeout: 30000 });
      return;
    }
    throw new Error(`登录失败（已重试 1 次）：${last}`);
  }

  /** 独立上下文登录（用于 qa-noauth 无权限基线，不与主账号共享会话）。 */
  protected async newSession(user: string | undefined, pwd: string | undefined, nickname: string): Promise<Page> {
    if (!user || !pwd) throw new Error(`缺少 ${nickname} 运行时账号环境变量`);
    const context = await this.browser!.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
    const page = await context.newPage();
    this.bindPage(page);
    await this.login(user, pwd, page);
    return page;
  }

  /** 关闭附加标签页（详情页与主页面同属一个 context，不能关闭 context）。 */
  protected async closeSession(page: Page): Promise<void> {
    if (page === this.page) return;
    await page.close().catch(() => undefined);
  }

  /** 关闭独立登录会话（qa-noauth 专用 context）。 */
  protected async closeContext(page: Page): Promise<void> {
    if (page === this.page) return;
    await page.context().close().catch(() => undefined);
  }

  protected async shot(name: string, fullPage = false): Promise<void> {
    if (!this.page) return;
    const safe = name.replace(/[^\w\u4e00-\u9fa5#①-⑳()[\]-]/g, '_').slice(0, 80);
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${safe}.png`);
    await this.page.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  protected async shotOn(page: Page, name: string, fullPage = false): Promise<void> {
    const safe = name.replace(/[^\w\u4e00-\u9fa5#①-⑳()[\]-]/g, '_').slice(0, 80);
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${safe}.png`);
    await page.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  protected async waitApp(page = this.page!): Promise<void> {
    await page.locator('.app-main').waitFor({ state: 'visible', timeout: 30000 });
  }

  /** 等待可见 loading 遮罩消失（web-first）。 */
  protected async waitNoLoading(page = this.page!, timeout = 60000): Promise<void> {
    await page.locator('.el-loading-mask:visible').first().waitFor({ state: 'hidden', timeout }).catch(() => undefined);
  }

  /** 等待表格落定：无可见 loading，且出现数据行或空态文案；连续两次读取一致。 */
  protected async waitTableSettled(page = this.page!, timeout = 60000): Promise<void> {
    await page.waitForFunction(() => {
      const masks = Array.from(document.querySelectorAll('.el-loading-mask')).filter((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
      });
      if (masks.length > 0) return false;
      const rows = document.querySelectorAll('.el-table__body-wrapper tbody tr').length;
      const empty = (document.querySelector('.el-table__empty-text')?.textContent ?? '').trim();
      return rows > 0 || empty.length > 0;
    }, undefined, { timeout, polling: 200 });
    let prev = '';
    for (let i = 0; i < 20; i++) {
      const now = await page.evaluate(() => {
        const tr = document.querySelector('.el-table__body-wrapper tbody tr');
        return tr ? (tr as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : 'EMPTY';
      });
      if (now === prev) return;
      prev = now;
      await page.waitForTimeout(200);
    }
  }

  protected async messageText(page = this.page!): Promise<string> {
    const loc = page.locator('.el-message').last();
    try {
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      return (await loc.innerText()).trim();
    } catch {
      return '';
    }
  }

  /** 读取并确认 el-message-box 二次确认弹窗；返回弹窗文案。 */
  protected async confirmMessageBox(page = this.page!, accept = true): Promise<string> {
    const box = page.locator('.el-message-box__wrapper:visible').first();
    await box.waitFor({ state: 'visible', timeout: 10000 });
    const text = (await box.innerText()).replace(/\s+/g, ' ').trim();
    const primary = box.locator('.el-message-box__btns button.el-button--primary').first();
    const secondary = box.locator('.el-message-box__btns button:not(.el-button--primary)').last();
    const target = accept ? primary : secondary;
    await target.click();
    await box.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    return text;
  }

  protected async tableHeaderTexts(page = this.page!): Promise<string[]> {
    return (await page.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim());
  }

  protected async tableRows(page = this.page!): Promise<string[][]> {
    return page.locator('.el-table__body-wrapper tbody tr').evaluateAll((trs) => trs.map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim())
    ));
  }

  protected async tableRowCount(page = this.page!): Promise<number> {
    return page.locator('.el-table__body-wrapper tbody tr').count();
  }

  protected async emptyText(page = this.page!): Promise<string> {
    return (await page.locator('.el-table__empty-text').innerText().catch(() => '')).trim();
  }

  /** 分页总数：优先读取 el-pagination 的 Total 文案；无分页时回退为当前行数。 */
  protected async totalCount(page = this.page!): Promise<number> {
    const text = (await page.locator('.el-pagination').innerText().catch(() => '')).replace(/\s+/g, ' ');
    const m = text.match(/Total\s+([\d,]+)/i);
    if (m) return Number(m[1].replace(/,/g, ''));
    return this.tableRowCount(page);
  }

  protected async totalText(page = this.page!): Promise<string> {
    return (await page.locator('.el-pagination').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  protected async buttonDisabled(page: Page, name: string): Promise<boolean> {
    const btn = page.getByRole('button', { name }).first();
    return btn.evaluate((el) => (el as HTMLButtonElement).disabled || el.classList.contains('is-disabled'));
  }

  protected async fillPlaceholder(page: Page, placeholder: string, value: string): Promise<void> {
    const input = page.getByPlaceholder(placeholder, { exact: true }).first();
    await input.click();
    await input.fill(value);
    await page.waitForFunction(({ ph, v }) => {
      const el = [...document.querySelectorAll('input')].find((i) => i.getAttribute('placeholder') === ph) as HTMLInputElement | undefined;
      return el?.value === v;
    }, { ph: placeholder, v: value }, { timeout: 10000 });
  }

  protected async clearPlaceholder(page: Page, placeholder: string): Promise<void> {
    const input = page.getByPlaceholder(placeholder, { exact: true }).first();
    await input.click();
    await input.fill('');
  }

  /** 点击按钮并等待列表接口响应（响应事件仅用于等待与留痕，判定仍读取页面）。 */
  protected async clickAndWaitResponse(page: Page, locator: ReturnType<Page['locator']>, urlFragment: string, timeout = 60000): Promise<number> {
    const respPromise = page.waitForResponse((r) => r.url().includes(urlFragment), { timeout }).catch(() => null);
    await locator.first().click();
    const resp = await respPromise;
    await this.waitTableSettled(page, timeout);
    return resp?.status() ?? 0;
  }
}
