/**
 * ADMIN 项目 3710（私信-用户发图&撤回 / Admin 部分）测试基类。
 *
 * 环境与认证：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 后端同源测试入口：https://funbit-mgr.test.cinta.team（SCRIPT_API_BASE 可覆盖）
 *   执行机直连 https://m-api.test.lita.game 返回 HTTP 403（CDN/WAF）；
 *   浏览器层仅把该主机的请求原样转发到同源测试入口，不修改页面代码与业务参数（规范 R1 例外）。
 * - Admin 账号密码只在运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD 注入；无权限账号用
 *   NOPERM_USERNAME / NOPERM_PASSWORD 注入。不写入脚本、日志或证据。
 *
 * 留痕（test/script 规范 v1.2.0）：
 * - 关键页面操作与每个检查点断言后截图；
 * - 页面接口请求/响应与 console error / pageerror / requestfailed 写入 evidence/run.json；
 * - token、密码等敏感字段统一脱敏，不落盘。
 *
 * 断言边界：
 * - 所有验证点均读取页面内容（DOM/可见文本/表格单元格/提示 toast），不读取接口响应、不执行 SQL；
 * - 页面接口留痕、SQL 只读结果仅用于前置就绪、清理核对与证据索引，不作为任何检查点判定依据。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Response } from 'playwright';
import { CheckBaseClass } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');
export const API_BASE = (process.env.SCRIPT_API_BASE ?? 'https://funbit-mgr.test.cinta.team').replace(/\/+$/, '');
export const MAP_BASE = 'https://m-api.test.lita.game';
export const TOKEN_COOKIE = 'vue_admin_template_token';

export const WHITE_HASH = '#/user-manager/user-image-white';
export const CONVO_HASH = '#/play-manager/player-convo';
export const SESSION_HASH = '#/white-list/user-im-white-list';
export const PLAYER_LIST_HASH = '#/play-manager-index';

export interface ApiCall {
  seq: number;
  time: string;
  method: string;
  url: string;
  status?: number;
  contentType?: string;
  responseBody?: string;
  responseSize?: number;
}

export interface ConsoleEntry {
  type: string;
  text: string;
  time: string;
}

export interface PaginationInfo {
  totalText: string;
  total: number;
  pageSize: string;
  current: string;
  pages: string[];
  rows: number;
}

export interface Candidate {
  id: number;
  no: string;
  nick: string;
  locale: string;
}

export interface WhiteRow {
  locale: string;
  id: string;
  no: string;
  nick: string;
  addTime: string;
  operator: string;
  action: string;
}

export interface ConvoRow {
  cells: string[];
  type: string;
  content: string;
  sendTime: string;
}

export interface SessionRow {
  userId: string;
  createTime: string;
  opUser: string;
  action: string;
}

export interface ToastResult {
  texts: string[];
  errors: string[];
}

export function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function maskSensitive(text: string): string {
  return text
    .replace(/("?(?:accessToken|token|pwd|password)"?\s*[:=]\s*")[^"]+(")/gi, '$1***$2')
    .replace(/(AccessToken|accessToken|L-USER-TOKEN|l-user-token)(["']?\s*[:=]\s*["']?)[^\s,"'}]+/g, '$1$2***')
    .replace(/JSESSIONID=[^;,\s]+/g, 'JSESSIONID=***');
}

export function clamp(text: string, limit = 2000): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…(truncated, total ${text.length})`;
}

export function setEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export abstract class AdminBase extends CheckBaseClass {
  protected readonly slug: string;
  protected readonly evidenceDir: string;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected token = '';
  protected calls: ApiCall[] = [];
  protected shots: string[] = [];
  protected notes: string[] = [];
  protected consoleErrors: ConsoleEntry[] = [];
  protected pageErrors: string[] = [];
  protected requestFailures: { url: string; method: string; failure: string }[] = [];
  protected badResponses: { time: string; method: string; url: string; status: number }[] = [];
  private seq = 0;
  private shotNo = 0;

  constructor(slug: string) {
    super();
    this.slug = slug;
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${stamp()}`)));
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      viewport: { width: 1680, height: 1000 },
      acceptDownloads: true,
      timezoneId: 'Asia/Shanghai',
      locale: 'zh-CN',
      serviceWorkers: 'block',
    });
    await this.installRoutes();
    this.page = await this.context.newPage();
    this.installPageObservers(this.page);
    this.page.on('response', (response) => {
      void this.capturePageResponse(response);
    });
    try {
      await super.execute();
    } finally {
      this.writeRunEvidence();
      await this.browser?.close().catch(() => undefined);
      this.log(`证据目录: ${this.evidenceDir}`);
    }
  }

  protected abstract run(): Promise<void>;

  /** 浏览器层把被 WAF 拦截的 m-api 主机原样转发到同源测试入口（不修改业务参数） */
  private async installRoutes(): Promise<void> {
    const ctx = this.context!;
    await ctx.route(`${MAP_BASE}/**`, async (route) => {
      const request = route.request();
      const cors = {
        'access-control-allow-origin': UI_BASE,
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
        'access-control-expose-headers': 'content-disposition,content-type',
      };
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      const target = request.url().replace(MAP_BASE, API_BASE);
      const headers: Record<string, string> = { ...request.headers() };
      for (const key of ['host', 'origin', 'referer', 'content-length', 'connection']) delete headers[key];
      try {
        await route.continue({ url: target, headers });
      } catch (error) {
        this.notes.push(`WAF 同源转发失败 ${request.url()}: ${(error as Error).message}`);
        await route.fulfill({ status: 502, headers: cors, contentType: 'application/json', body: JSON.stringify({ status: 1, msg: 'proxy error' }) });
      }
    });
  }

  protected installPageObservers(page: Page): void {
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      this.consoleErrors.push({ type: message.type(), text: message.text(), time: new Date().toISOString() });
    });
    page.on('pageerror', (error) => {
      this.pageErrors.push(error.message);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        this.badResponses.push({
          time: new Date().toISOString(),
          method: response.request().method(),
          url: response.url(),
          status: response.status(),
        });
      }
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      this.requestFailures.push({ url: request.url(), method: request.method(), failure: failure?.errorText ?? 'unknown' });
    });
  }

  /** 真实登录，token 取本次登录响应或 Cookie */
  protected async login(username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD): Promise<void> {
    const page = this.p;
    if (!username || !password) {
      throw new Error('缺少运行时环境变量 ADMIN_USERNAME / ADMIN_PASSWORD（不得写入脚本或证据）');
    }
    let loginToken = '';
    page.on('response', async (response) => {
      if (response.url().includes('/admin/login') && response.request().method() === 'POST') {
        try {
          const json = (await response.json()) as { data?: { accessToken?: string } };
          if (json?.data?.accessToken) loginToken = json.data.accessToken;
        } catch {
          // 登录响应非 JSON 时忽略，token 仍从 Cookie 获取
        }
      }
    });
    await page.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('input[name="username"]', { timeout: 30000 });
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForFunction(() => !location.hash.includes('/login'), { timeout: 45000 });
    await page.waitForSelector('.app-main, .sidebar-container', { timeout: 45000 });
    const cookie = (await this.context!.cookies()).find((c) => c.name === TOKEN_COOKIE);
    this.token = cookie?.value || loginToken;
    if (!this.token) throw new Error('登录成功但未取得 AccessToken（Cookie/login 响应均为空）');
    await this.shot('00-login-success');
    this.log(`登录成功，账号=${username}，AccessToken 已获取（长度 ${this.token.length}，不输出值）`);
  }

  protected async newPage(): Promise<Page> {
    const page = await this.context!.newPage();
    this.installPageObservers(page);
    page.on('response', (response) => {
      void this.capturePageResponse(response);
    });
    return page;
  }

  protected async shot(tag: string, page: Page | null = null): Promise<string> {
    mkdirSync(this.evidenceDir, { recursive: true });
    const name = `${String(++this.shotNo).padStart(2, '0')}-${tag.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.png`;
    await (page ?? this.p).screenshot({ path: join(this.evidenceDir, name), fullPage: true });
    this.shots.push(name);
    return name;
  }

  /** 对指定元素截图留痕（关键验证点） */
  protected async shotLocator(locator: Locator, tag: string): Promise<string> {
    mkdirSync(this.evidenceDir, { recursive: true });
    const name = `${String(++this.shotNo).padStart(2, '0')}-${tag.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.png`;
    await locator.screenshot({ path: join(this.evidenceDir, name), timeout: 30000 });
    this.shots.push(name);
    return name;
  }

  /** 页面接口留痕（仅证据，不作断言依据；token/密码脱敏） */
  private async capturePageResponse(response: Response): Promise<void> {
    const request = response.request();
    const url = response.url();
    if (!url.includes('/api/') && !url.includes('/admin/')) return;
    if (request.method() === 'OPTIONS') return;
    let body = '';
    let size = 0;
    try {
      const buffer = await response.body();
      size = buffer.length;
      const type = response.headers()['content-type'] ?? '';
      body = type.includes('json') || type.includes('text') ? buffer.toString('utf8') : `(binary ${size} bytes, ${type})`;
    } catch {
      body = '(body unavailable)';
    }
    this.calls.push({
      seq: ++this.seq,
      time: new Date().toISOString(),
      method: request.method(),
      url,
      status: response.status(),
      contentType: response.headers()['content-type'],
      responseBody: clamp(maskSensitive(body)),
      responseSize: size,
    });
  }

  // ---------- 页面通用 ----------

  protected get p(): Page {
    return this.page!;
  }

  protected async waitListIdle(timeout = 20000): Promise<void> {
    await this.p
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('.el-loading-mask')).every((node) => {
            const mask = node as HTMLElement;
            const style = getComputedStyle(mask);
            return style.display === 'none' || style.visibility === 'hidden' || mask.offsetParent === null;
          }),
        null,
        { timeout },
      )
      .catch(() => undefined);
  }

  protected async gotoHash(hash: string, reload = true, page: Page | null = null): Promise<void> {
    const target = page ?? this.p;
    await target.goto(`${UI_BASE}/${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (reload) await target.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await target.waitForSelector('.app-container', { timeout: 30000 });
    await this.waitListIdle();
  }

  protected button(text: string, root = '.app-container'): Locator {
    return this.p
      .locator(`${root} button`)
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`) })
      .first();
  }

  protected async clickButton(text: string, root = '.app-container'): Promise<void> {
    await this.button(text, root).click();
  }

  protected async fillByPlaceholder(placeholder: string, value: string, root = '.app-container'): Promise<void> {
    await this.p.locator(`${root} input[placeholder="${placeholder}"]`).first().fill(value);
  }

  protected async waitInputValue(placeholder: string, value: string, timeout = 5000): Promise<void> {
    await this.p
      .waitForFunction(
        ({ ph, val }) => {
          const el = document.querySelector(`.app-container input[placeholder="${ph}"]`) as HTMLInputElement | null;
          return el?.value === val;
        },
        { ph: placeholder, val: value },
        { timeout },
      )
      .catch(() => undefined);
  }

  /** 主表数据行 */
  protected rows(): Locator {
    return this.p.locator('.app-container .el-table__body-wrapper tbody tr.el-table__row');
  }

  /** 固定列数据行 */
  protected fixedRows(): Locator {
    return this.p.locator('.app-container .el-table__fixed tbody tr.el-table__row');
  }

  protected async rowCells(): Promise<string[][]> {
    return this.rows().evaluateAll((trs) =>
      trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim())),
    );
  }

  protected async headerTexts(): Promise<string[]> {
    const texts = await this.p.locator('.app-container .el-table__header-wrapper th').allInnerTexts();
    return texts.map((t) => t.trim()).filter((t) => t.length > 0);
  }

  protected async listTotal(): Promise<PaginationInfo> {
    const info = await this.p.evaluate(() => {
      const totalEl = document.querySelector('.el-pagination__total');
      const totalText = totalEl?.textContent?.trim() ?? '';
      const m = totalText.match(/\d+/);
      const rows = document.querySelectorAll('.app-container .el-table__body-wrapper tbody tr.el-table__row').length;
      const sizeInput = document.querySelector('.el-pagination__sizes input') as HTMLInputElement | null;
      const active = document.querySelector('.el-pager li.active, .el-pager li.is-active');
      const pages = Array.from(document.querySelectorAll('.el-pager li')).map((li) => (li.textContent ?? '').trim());
      return {
        totalText,
        total: m ? Number(m[0]) : rows,
        pageSize: sizeInput?.value ?? '',
        current: (active?.textContent ?? '').trim(),
        pages,
        rows,
      };
    });
    return info;
  }

  /** 等待指定列表接口响应并完成 loading */
  protected async waitListResponse(partial: string, action: () => Promise<void>, timeout = 45000): Promise<void> {
    await Promise.all([
      this.p.waitForResponse((r) => r.url().includes(partial) && r.request().method() === 'GET', { timeout }),
      action(),
    ]);
    await this.waitListIdle();
  }

  /** 等待指定接口响应（任意方法） */
  protected async waitApi(partial: string, action: () => Promise<void>, timeout = 45000): Promise<void> {
    await Promise.all([
      this.p.waitForResponse((r) => r.url().includes(partial), { timeout }),
      action(),
    ]);
  }

  protected async clearToasts(timeout = 6000): Promise<void> {
    await this.p
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('.el-message')).every((node) => {
            const el = node as HTMLElement;
            const style = getComputedStyle(el);
            return style.display === 'none' || style.visibility === 'hidden' || el.getBoundingClientRect().height === 0;
          }),
        null,
        { timeout },
      )
      .catch(() => undefined);
  }

  protected async readToasts(timeout = 8000): Promise<ToastResult> {
    try {
      await this.p.locator('.el-message').first().waitFor({ state: 'visible', timeout });
    } catch {
      return { texts: [], errors: [] };
    }
    const texts = (await this.p.locator('.el-message').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const errors = (await this.p.locator('.el-message--error').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    return { texts, errors };
  }

  protected async readConfirmBox(): Promise<{ text: string; buttons: string[] }> {
    await this.p.locator('.el-message-box').first().waitFor({ state: 'visible', timeout: 10000 });
    return this.p.locator('.el-message-box').first().evaluate((box) => ({
      text: (box.querySelector('.el-message-box__message')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      buttons: Array.from(box.querySelectorAll('button')).map((b) => (b.textContent ?? '').trim()).filter(Boolean),
    }));
  }

  protected async clickConfirmBox(text = '确定'): Promise<void> {
    await this.p
      .locator('.el-message-box:visible button')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`) })
      .first()
      .click();
  }

  /** el-select 选择（按可见 label 精确匹配） */
  protected async selectByLabel(placeholder: string, label: string, root = '.app-container'): Promise<void> {
    await this.p.locator(`${root} input[placeholder="${placeholder}"]`).first().click();
    await this.p
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) })
      .first()
      .click();
  }

  /** 清空 el-select（点击 clearable 图标） */
  protected async clearSelect(placeholder: string, root = '.app-container'): Promise<void> {
    const select = this.p.locator(`${root} .el-select`).filter({ has: this.p.locator(`input[placeholder="${placeholder}"]`) }).first();
    await select.hover();
    const clear = select.locator('.el-select__caret.el-icon-circle-close');
    if ((await clear.count()) > 0) {
      await clear.first().click();
    } else {
      throw new Error(`未能找到 ${placeholder} 的 clear 图标`);
    }
    await this.waitInputValue(placeholder, '');
  }

  protected async selectPageSize(label: string, root = '.app-container'): Promise<void> {
    const select = this.p.locator(`${root} .el-pagination .el-select`).first();
    await select.click();
    await this.p
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) })
      .first()
      .click();
  }

  protected async clickPager(pageNo: string): Promise<void> {
    await this.p.locator('.el-pager li').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(pageNo)}\\s*$`) }).first().click();
    await this.waitListIdle();
  }

  // ---------- 用户发图片白名单 ----------

  protected async gotoWhite(): Promise<void> {
    await this.gotoHash(WHITE_HASH);
    await this.p.waitForSelector('.app-container input[placeholder="ID"]', { timeout: 30000 });
    await this.waitListIdle();
  }

  protected async whiteOpenAdd(): Promise<void> {
    await this.clickButton('添加');
    await this.p.locator('.el-dialog:visible').first().waitFor({ state: 'visible', timeout: 15000 });
    await this.p.waitForFunction(
      () => Array.from(document.querySelectorAll('.el-dialog__title')).some((el) => (el.textContent ?? '').trim() === '添加用户发图片白名单'),
      null,
      { timeout: 10000 },
    );
  }

  protected async whiteAdd(uidsText: string): Promise<ToastResult> {
    await this.clearToasts();
    await this.whiteOpenAdd();
    const dialog = this.p.locator('.el-dialog:visible').first();
    await dialog.locator('textarea').first().fill(uidsText);
    const listWait = this.p.waitForResponse((r) => r.url().includes('/api/userImageWhite/list') && r.request().method() === 'GET', { timeout: 120000 }).catch(() => null);
    const addWait = this.p.waitForResponse((r) => r.url().includes('/api/userImageWhite/addList'), { timeout: 120000 }).catch(() => null);
    await dialog.locator('button').filter({ hasText: /^\s*确认\s*$/ }).first().click();
    await addWait;
    const toast = await this.readToasts(20000);
    await listWait;
    await this.waitListIdle();
    return toast;
  }

  /** 前端拦截场景（格式错误/超量）：不等待 addList 响应，只读页面提示 */
  protected async whiteAttemptAdd(uidsText: string): Promise<ToastResult> {
    await this.clearToasts();
    await this.whiteOpenAdd();
    const dialog = this.p.locator('.el-dialog:visible').first();
    await dialog.locator('textarea').first().fill(uidsText);
    await dialog.locator('button').filter({ hasText: /^\s*确认\s*$/ }).first().click();
    return this.readToasts(15000);
  }

  protected async whiteCancelAdd(): Promise<void> {
    const dialog = this.p.locator('.el-dialog:visible').first();
    if ((await dialog.count()) > 0) {
      await dialog.locator('button').filter({ hasText: /^\s*取消\s*$/ }).first().click();
      await this.p.waitForFunction(() => document.querySelectorAll('.el-dialog:visible').length === 0, null, { timeout: 10000 }).catch(() => undefined);
    }
  }

  protected async whiteSearch(filters: { locale?: string; id?: string; no?: string }): Promise<void> {
    if (filters.locale !== undefined) await this.selectByLabel('Locale', filters.locale);
    if (filters.id !== undefined) await this.fillByPlaceholder('ID', filters.id);
    if (filters.no !== undefined) await this.fillByPlaceholder('NO', filters.no);
    await this.waitListResponse('/api/userImageWhite/list', async () => {
      await this.clickButton('Search');
    });
  }

  protected async whiteClearSelects(): Promise<void> {
    await this.clearSelect('Locale');
  }

  protected async whiteReset(): Promise<void> {
    await this.waitListResponse('/api/userImageWhite/list', async () => {
      await this.clickButton('Reset Filters');
    });
  }

  protected async whiteRows(): Promise<WhiteRow[]> {
    const cells = await this.rowCells();
    return cells.map((c) => ({
      locale: c[0] ?? '',
      id: c[1] ?? '',
      no: c[2] ?? '',
      nick: c[3] ?? '',
      addTime: c[4] ?? '',
      operator: c[5] ?? '',
      action: c[6] ?? '',
    }));
  }

  protected async whiteTotal(): Promise<PaginationInfo> {
    return this.listTotal();
  }

  protected async whiteDeleteRow(index = 0): Promise<{ confirm: { text: string; buttons: string[] }; toast: ToastResult }> {
    await this.clearToasts();
    const row = this.rows().nth(index);
    await row.locator('button').filter({ hasText: /^\s*删除\s*$/ }).first().click();
    const confirm = await this.readConfirmBox();
    await this.shot(`white-delete-confirm-${Date.now()}`);
    const delWait = this.p.waitForResponse((r) => r.url().includes('/api/userImageWhite/delete'), { timeout: 45000 }).catch(() => null);
    const listWait = this.p.waitForResponse((r) => r.url().includes('/api/userImageWhite/list') && r.request().method() === 'GET', { timeout: 45000 }).catch(() => null);
    await this.clickConfirmBox('确定');
    await delWait;
    const toast = await this.readToasts(15000);
    await listWait;
    await this.waitListIdle();
    return { confirm, toast };
  }

  /** 清理用：跳过 toast/截图，只完成删除与列表刷新 */
  protected async whiteDeleteRowQuick(index = 0): Promise<void> {
    const row = this.rows().nth(index);
    await row.locator('button').filter({ hasText: /^\s*删除\s*$/ }).first().click();
    await this.p.locator('.el-message-box').first().waitFor({ state: 'visible', timeout: 10000 });
    const delWait = this.p.waitForResponse((r) => r.url().includes('/api/userImageWhite/delete'), { timeout: 45000 }).catch(() => null);
    const listWait = this.p.waitForResponse((r) => r.url().includes('/api/userImageWhite/list') && r.request().method() === 'GET', { timeout: 45000 }).catch(() => null);
    await this.clickConfirmBox('确定');
    await delWait;
    await listWait;
    await this.waitListIdle();
  }

  protected async whiteDeleteById(id: string): Promise<{ confirm: { text: string; buttons: string[] }; toast: ToastResult } | null> {
    await this.gotoWhite();
    await this.whiteSearch({ id });
    const rows = await this.whiteRows();
    if (rows.length === 0) return null;
    return this.whiteDeleteRow(0);
  }

  /** 按 Operator 清理本轮测试新增行（保护其他操作人的数据） */
  protected async whiteCleanupByOperator(operator: string, max = 620): Promise<{ deleted: number; blockedBy: string }> {
    await this.gotoWhite();
    const initial = await this.whiteTotal();
    if (initial.rows === 0) {
      this.log('图片白名单当前无数据，无需清理');
      return { deleted: 0, blockedBy: '' };
    }
    if ((await this.p.locator('.el-pagination .el-select').count()) > 0) {
      await this.waitListResponse('/api/userImageWhite/list', async () => {
        await this.selectPageSize('50/page');
      });
    }
    let deleted = 0;
    for (;;) {
      const total = await this.whiteTotal();
      if (total.rows === 0) break;
      const rows = await this.whiteRows();
      if (rows.length === 0) break;
      if (rows[0].operator !== operator) {
        this.log(`清理停止：首行 Operator=${rows[0].operator} 非本轮账号 ${operator}`);
        return { deleted, blockedBy: rows[0].operator };
      }
      await this.whiteDeleteRowQuick(0);
      deleted++;
      if (deleted > max) throw new Error(`清理行数超过上限 ${max}`);
      if (deleted % 50 === 0) this.log(`已清理图片白名单测试行 ${deleted}`);
    }
    this.log(`图片白名单测试行清理完成：${deleted}`);
    return { deleted, blockedBy: '' };
  }

  // ---------- 陪玩师聊天记录 ----------

  protected async gotoConvo(): Promise<void> {
    await this.gotoHash(CONVO_HASH);
    await this.p.waitForSelector('.app-container input[placeholder="Player ID"]', { timeout: 30000 });
    await this.waitListIdle();
  }

  protected async convoReadDates(): Promise<{ start: string; end: string }> {
    return this.p.evaluate(() => ({
      start: (document.querySelector('.app-container input[placeholder="开始日期"]') as HTMLInputElement | null)?.value ?? '',
      end: (document.querySelector('.app-container input[placeholder="结束日期"]') as HTMLInputElement | null)?.value ?? '',
    }));
  }

  protected async convoSetDates(start: string, end: string): Promise<void> {
    const s = this.p.locator('.app-container input[placeholder="开始日期"]').first();
    const e = this.p.locator('.app-container input[placeholder="结束日期"]').first();
    await s.click();
    await s.fill(start);
    await this.p.keyboard.press('Enter');
    await this.waitInputValue('开始日期', start);
    await e.click();
    await e.fill(end);
    await this.p.keyboard.press('Enter');
    await this.waitInputValue('结束日期', end);
  }

  protected async convoOpenTypeOptions(): Promise<string[]> {
    await this.p.locator('.app-container input[placeholder="Message type"]').first().click();
    await this.p.locator('.el-select-dropdown:visible .el-select-dropdown__item').first().waitFor({ state: 'visible', timeout: 10000 });
    const options = (await this.p.locator('.el-select-dropdown:visible .el-select-dropdown__item').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.p.keyboard.press('Escape');
    await this.p.waitForFunction(() => document.querySelectorAll('.el-select-dropdown:visible').length === 0, null, { timeout: 5000 }).catch(() => undefined);
    return options;
  }

  protected async convoSelectType(label: string): Promise<void> {
    await this.p.locator('.app-container input[placeholder="Message type"]').first().click();
    await this.p
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) })
      .first()
      .click();
  }

  protected async convoSearch(opts: { playerId?: string; userId?: string; type?: string; start?: string; end?: string; wait?: boolean }): Promise<void> {
    if (opts.start !== undefined && opts.end !== undefined) await this.convoSetDates(opts.start, opts.end);
    if (opts.playerId !== undefined) await this.fillByPlaceholder('Player ID', opts.playerId);
    if (opts.userId !== undefined) await this.fillByPlaceholder('User ID', opts.userId);
    if (opts.type) await this.convoSelectType(opts.type);
    if (opts.wait === false) {
      await this.clickButton('Search');
      return;
    }
    await this.waitListResponse('/api/player/message/list', async () => {
      await this.clickButton('Search');
    }, 45000);
  }

  protected async convoRows(): Promise<ConvoRow[]> {
    const cells = await this.rowCells();
    return cells.map((c) => ({ cells: c, type: c[11] ?? '', content: c[10] ?? '', sendTime: c[12] ?? '' }));
  }

  protected async convoDefaults(): Promise<Record<string, string>> {
    return this.p.evaluate(() => {
      const get = (ph: string) => (document.querySelector(`.app-container input[placeholder="${ph}"]`) as HTMLInputElement | null)?.value ?? '(missing)';
      return {
        player: get('Player ID'),
        user: get('User ID'),
        paid: get('Has user paid?'),
        firstPaid: get('First chat paid?'),
        cinta: get('Cinta user?'),
        type: get('Message type'),
      };
    });
  }

  // ---------- 用户会话限制白名单 ----------

  protected async gotoSession(): Promise<void> {
    await this.gotoHash(SESSION_HASH);
    await this.p.waitForSelector('.app-container input[placeholder="USER ID"]', { timeout: 30000 });
    await this.waitListIdle();
  }

  protected async sessionRows(): Promise<SessionRow[]> {
    const main = await this.rowCells();
    const fixed = await this.fixedRows().evaluateAll((trs) =>
      trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim())),
    );
    return main.map((cells, i) => ({
      userId: fixed[i]?.[0] ?? '',
      createTime: cells[1] ?? '',
      opUser: cells[2] ?? '',
      action: cells[3] ?? '',
    }));
  }

  protected async sessionTotal(): Promise<PaginationInfo> {
    return this.listTotal();
  }

  protected async sessionSearch(id: string): Promise<void> {
    await this.fillByPlaceholder('USER ID', id);
    await this.waitListResponse('/api/imUserWhite/list', async () => {
      await this.clickButton('Search');
    });
  }

  protected async sessionReset(): Promise<void> {
    await this.clickButton('Reset Filters');
    await this.waitInputValue('USER ID', '');
  }

  protected async sessionAdd(uidsText: string): Promise<ToastResult> {
    await this.clearToasts();
    await this.clickButton('批量新增白名单人员');
    const dialog = this.p.locator('.el-dialog:visible').first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
    await dialog.locator('textarea').first().fill(uidsText);
    const addWait = this.p.waitForResponse((r) => r.url().includes('/api/imUserWhite/addList'), { timeout: 45000 }).catch(() => null);
    const nav = this.p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
    await dialog.locator('button').filter({ hasText: /^\s*Confirm\s*$/ }).first().click();
    await addWait;
    const toast = await this.readToasts(8000);
    // 页面在 addList 成功后约 1 秒 reload；等导航事件与默认列表
    await nav;
    await this.p.waitForSelector('.app-container input[placeholder="USER ID"]', { timeout: 30000 });
    await this.waitListIdle();
    return toast;
  }

  protected async sessionDeleteFirstRow(): Promise<{ confirm: { text: string; buttons: string[] }; toast: ToastResult }> {
    await this.clearToasts();
    const row = this.rows().first();
    await row.locator('button').filter({ hasText: /^\s*删除\s*$/ }).first().click();
    const confirm = await this.readConfirmBox();
    const delWait = this.p.waitForResponse((r) => r.url().includes('/api/imUserWhite/delete'), { timeout: 45000 }).catch(() => null);
    const listWait = this.p.waitForResponse((r) => r.url().includes('/api/imUserWhite/list') && r.request().method() === 'GET', { timeout: 45000 }).catch(() => null);
    await this.clickConfirmBox('确定');
    await delWait;
    const toast = await this.readToasts(10000);
    await listWait;
    await this.waitListIdle();
    return { confirm, toast };
  }

  /** 会话限制白名单历史集合：读第 1 页与第 2 页的 USER ID 集合 */
  protected async sessionHistory(): Promise<{ total: number; ids: string[]; page1: string[]; page2: string[] }> {
    await this.gotoSession();
    const info = await this.sessionTotal();
    const page1Rows = await this.sessionRows();
    const page1 = page1Rows.map((r) => r.userId).filter(Boolean);
    let page2: string[] = [];
    if (info.pages.includes('2')) {
      await this.waitListResponse('/api/imUserWhite/list', async () => {
        await this.clickPager('2');
      });
      page2 = (await this.sessionRows()).map((r) => r.userId).filter(Boolean);
      await this.waitListResponse('/api/imUserWhite/list', async () => {
        await this.clickPager('1');
      });
    }
    return { total: info.total, ids: [...page1, ...page2], page1, page2 };
  }

  // ---------- 真实用户样本（陪玩师管理列表，只读） ----------

  protected async collectCandidates(count = 600): Promise<Candidate[]> {
    await this.gotoHash(PLAYER_LIST_HASH);
    await this.p.waitForSelector('.app-container .el-table', { timeout: 30000 });
    await this.waitListResponse('/api/playmanager/list', async () => {
      await this.selectPageSize('50/page');
    }, 30000);

    const out: Candidate[] = [];
    const seen = new Set<number>();
    for (let page = 1; page <= 30 && out.length < count; page++) {
      if (page > 1) {
        const next = this.p.locator('.el-pagination .btn-next').first();
        if ((await next.isDisabled().catch(() => true))) break;
        await this.waitListResponse('/api/playmanager/list', async () => {
          await next.click();
        });
      }
      const fixed = await this.fixedRows().evaluateAll((trs) =>
        trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim())),
      );
      const main = await this.rowCells();
      for (let i = 0; i < fixed.length; i++) {
        const idPart = (fixed[i]?.[1] ?? '').split('/')[0].trim();
        const id = Number(idPart);
        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
        const nick = (fixed[i]?.[1] ?? '').split('/')[1]?.trim() ?? '';
        const no = fixed[i]?.[2] ?? '';
        const locale = main[i]?.[14] ?? '';
        if (!no) continue;
        seen.add(id);
        out.push({ id, no, nick, locale });
        if (out.length >= count) break;
      }
    }
    writeFileSync(join(this.evidenceDir, 'candidates.json'), JSON.stringify(out, null, 2), 'utf8');
    this.log(`真实用户样本采集完成：${out.length} 个（已写入 candidates.json）`);
    if (out.length < count) throw new Error(`真实用户样本不足：需要 ${count}，实际 ${out.length}`);
    return out;
  }

  // ---------- 直连接口（仅前置/非 UI 核验，不用于 UI 检查点） ----------

  protected async apiGet(path: string): Promise<{ status: number; body: string }> {
    const res = await this.context!.request.get(`${API_BASE}${path}`, { headers: { accessToken: this.token } });
    return { status: res.status(), body: await res.text() };
  }

  protected async apiPost(path: string, data: unknown): Promise<{ status: number; body: string }> {
    const res = await this.context!.request.post(`${API_BASE}${path}`, {
      headers: { accessToken: this.token, 'Content-Type': 'application/json' },
      data,
    });
    return { status: res.status(), body: await res.text() };
  }

  protected writeRunEvidence(): void {
    const payload = {
      slug: this.slug,
      finishedAt: new Date().toISOString(),
      uiBase: UI_BASE,
      apiBase: API_BASE,
      evidenceDir: this.evidenceDir,
      shots: this.shots,
      notes: this.notes,
      calls: this.calls,
      consoleErrors: this.consoleErrors,
      pageErrors: this.pageErrors,
      requestFailures: this.requestFailures,
      badResponses: this.badResponses,
    };
    try {
      writeFileSync(join(this.evidenceDir, 'run.json'), JSON.stringify(payload, null, 2), 'utf8');
      this.log(`运行留痕: ${join(this.evidenceDir, 'run.json')}`);
    } catch (error) {
      this.log(`写运行留痕失败: ${(error as Error).message}`);
    }
  }
}
