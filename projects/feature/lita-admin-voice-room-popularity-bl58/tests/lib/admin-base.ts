/**
 * 项目 BL-0058「Admin 房间人气推荐设置」UI 测试基类（项目内私有，基于平台 ADMIN 范式演进，不跨项目 import）。
 *
 * 用例来源：TK-0686 HANDOFF 九列用例（37 条）；技术方案：/task/20261125/TK-0686/TECH_DESIGN。
 * 环境：UI https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）；执行机直连 m-api.test.lita.game
 *       （实测未登录 401 而非 WAF 403），默认不启用 WAF 转发；如未来需转发，设置 ENABLE_WAF_FORWARD=1，
 *       按 /admin|/api|/voiceroom -> SCRIPT_API_BASE、/data-main -> SCRIPT_DB_API 原样透传（不改请求/响应体）。
 * 账号：qa-ai（常规）/ qa-noauth（无权限专用），密码仅运行时通过环境变量注入，不写入代码、日志、证据与报告。
 * 会话：每个测试进程按账号真实 UI 登录 1 次并保存 storageState；每条用例通过 newContext({ storageState })
 *       创建独立上下文，杜绝用例间 Cookie/Storage 串扰。
 * 等待：全部使用可观测条件（页面响应/元素可见/loading 消失/表格落定），不使用固定 sleep 作为断言前置。
 */
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { CheckBaseClass } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');
const FWD_BASE = (process.env.SCRIPT_API_BASE ?? 'https://funbit-mgr.test.cinta.team').replace(/\/+$/, '');
const DB_BASE = (process.env.SCRIPT_DB_API ?? 'https://api.test.cinta.team').replace(/\/+$/, '');
export const PAGE_HASH = '#/voice-room/voice-room-popularity-recommend';
export const PAGE_URL = `${UI_BASE}/${PAGE_HASH}`;
export const LIST_API = '/api/voiceroom/recommend/list';
export const UPLOAD_API = '/api/voiceroom/recommend/upload';

const TMP_ROOT = resolve(process.env.TMPDIR ?? join(process.cwd(), '.tmp-playwright'));
mkdirSync(TMP_ROOT, { recursive: true });
process.env.TMPDIR = TMP_ROOT;

const SKIP_HEADERS = new Set(['host', 'content-length', 'accept-encoding', 'connection', 'origin', 'referer', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest', 'accept-language', 'priority', 'user-agent']);

export function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function mask(text: string): string {
  return text
    .replace(/("accessToken"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/("accesstoken"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/("pwd"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/("password"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/(cookie\s*:\s*)[^\n]+/gi, '$1***')
    .replace(/vue_admin_template_token=[^;\s]+/g, 'vue_admin_template_token=***')
    .replace(/("token"\s*:\s*")[^"]+/gi, '$1***');
}

export interface ApiCall {
  seq: number;
  time: string;
  method: string;
  path: string;
  status?: number;
  requestBody?: string;
  responseBody?: string;
}

export interface CleanupTask {
  title: string;
  fn: () => Promise<void> | void;
}

/** 解析 --case=1,3；未指定返回空集合（表示全量）。 */
export function parseSelectedCases(): Set<number> {
  const raw = arg('case', '');
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0));
}

export abstract class AdminBase extends CheckBaseClass {
  protected readonly slug: string;
  protected readonly evidenceDir: string;
  protected selected: Set<number> = new Set();
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected calls: ApiCall[] = [];
  protected screenshots: string[] = [];
  protected notes: string[] = [];
  protected pageErrors: string[] = [];
  protected cleanupTasks: CleanupTask[] = [];
  protected cleanupResults: Array<{ title: string; ok: boolean; message: string }> = [];
  protected readonly stateDir: string;
  private callSeq = 0;
  private shotNo = 0;
  private startedAt = new Date().toISOString();

  /**
   * @param slug 证据目录标识
   * @param checkpoints 用例# -> 检查点数（含参数化数据行展开），用于 --case 过滤时精确计算 total
   */
  constructor(slug: string, checkpoints: Record<number, number>) {
    super();
    this.slug = slug;
    this.selected = parseSelectedCases();
    const all = Object.keys(checkpoints).map(Number);
    if (this.selected.size > 0) {
      for (const n of this.selected) {
        if (!(n in checkpoints)) throw new Error(`--case=${n} 不属于本文件（可用：${all.join(',')}）`);
      }
    }
    const keys = this.selected.size > 0 ? [...this.selected] : all;
    this.total = keys.reduce((sum, n) => sum + (checkpoints[n] ?? 0), 0);
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${stamp()}`)));
    this.stateDir = resolve(arg('state-dir', join(TMP_ROOT, 'bl58-state')));
    mkdirSync(this.evidenceDir, { recursive: true });
    mkdirSync(this.stateDir, { recursive: true });
  }

  /** 当前进程是否应执行用例 n。 */
  protected wants(n: number): boolean {
    return this.selected.size === 0 || this.selected.has(n);
  }

  protected needAny(cases: number[]): boolean {
    return cases.some((n) => this.wants(n));
  }

  async execute(): Promise<void> {
    this.startedAt = new Date().toISOString();
    this.browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'] });
    try {
      await super.execute();
    } finally {
      await this.runCleanup();
      this.writeRunLog();
      await this.context?.close().catch(() => undefined);
      await this.browser?.close().catch(() => undefined);
      this.log(`证据目录: ${this.evidenceDir}`);
    }
  }

  // ---------------- 登录与会话 ----------------

  /** 真实 UI 登录一次并保存 storageState；不做任何会话桩。基础设施 401/403/5xx 允许重试（保留首次失败记录）。 */
  protected async loginAndSaveState(user: string | undefined, pwd: string | undefined, stateFile: string): Promise<void> {
    if (!user || !pwd) throw new Error('缺少运行时账号环境变量（ADMIN_USERNAME/ADMIN_PASSWORD 或 NOAUTH_USERNAME/NOAUTH_PASSWORD）');
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const ctx = await this.browser!.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
      await this.installRoutes(ctx);
      const page = await ctx.newPage();
      try {
        await page.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForSelector('input[name="username"]', { timeout: 60000 });
        await page.locator('input[name="username"]').fill(user);
        await page.locator('input[name="password"]').fill(pwd);
        const respPromise = page.waitForResponse((r) => r.url().includes('/admin/login'), { timeout: 60000 });
        await page.locator('button.el-button--primary').first().click();
        const resp = await respPromise;
        const body = await resp.text().catch(() => '');
        if (resp.status() !== 200 || !/"status"\s*:\s*"?0"?/.test(body)) {
          throw new Error(`登录失败：HTTP ${resp.status()} body=${mask(body).slice(0, 200)}`);
        }
        await page.waitForFunction(() => !location.hash.includes('/login'), undefined, { timeout: 90000 });
        await page.waitForSelector('.el-menu-item, .el-submenu__title', { timeout: 90000 });
        await ctx.storageState({ path: stateFile });
        this.log(`登录成功并保存会话：${user} -> ${stateFile.replace(/\\/g, '/')}（第 ${attempt} 次尝试）`);
        return;
      } catch (e) {
        lastError = e as Error;
        this.notes.push(`登录第 ${attempt} 次失败：${lastError.message}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 5000));
      } finally {
        await ctx.close().catch(() => undefined);
      }
    }
    throw new Error(`登录失败（已重试 3 次）：${lastError?.message ?? 'unknown'}`);
  }

  /** 正式执行可先集中登录一次，各测试文件通过 REUSE_STATE=1 复用同一真实会话（30 分钟内有效）。 */
  protected async ensureLoginState(user: string | undefined, pwd: string | undefined, stateFile: string): Promise<void> {
    if (process.env.REUSE_STATE === '1' && existsSync(stateFile)) {
      const age = Date.now() - statSync(stateFile).mtimeMs;
      if (age < 30 * 60 * 1000) {
        this.log(`复用已保存会话：${stateFile.replace(/\\/g, '/')}（${Math.round(age / 1000)}s 前登录）`);
        return;
      }
    }
    await this.loginAndSaveState(user, pwd, stateFile);
  }

  /** 创建一条用例专属的独立浏览器上下文（共享已保存登录态，零串扰）。 */
  protected async newCasePage(stateFile: string, goto = true): Promise<Page> {
    if (!existsSync(stateFile)) throw new Error(`缺少 storageState 文件：${stateFile}`);
    await this.closeCasePage();
    this.context = await this.browser!.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true, storageState: stateFile });
    await this.installRoutes(this.context);
    this.page = await this.context.newPage();
    this.bindPage(this.page);
    if (goto) {
      await this.page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await this.waitListReady(this.page);
    }
    return this.page;
  }

  protected async closeCasePage(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.page = null;
  }

  /** WAF 同源原样转发（默认不启用；仅当 m-api 出现 403 时设置 ENABLE_WAF_FORWARD=1）。 */
  private async installRoutes(ctx: BrowserContext): Promise<void> {
    if (process.env.ENABLE_WAF_FORWARD !== '1') return;
    await ctx.route('https://m-api.test.lita.game/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers())) {
        if (!SKIP_HEADERS.has(k)) headers[k] = v;
      }
      const target = url.pathname.startsWith('/data-main/') ? DB_BASE : FWD_BASE;
      try {
        const body = request.postDataBuffer();
        const resp = await route.fetch({
          url: target + url.pathname + url.search,
          method: request.method(),
          headers,
          postData: body ?? undefined,
          timeout: 120000,
          failOnStatusCode: false
        });
        const respBody = await resp.body();
        const respHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(resp.headers())) {
          if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) respHeaders[k] = v;
        }
        respHeaders['access-control-allow-origin'] = '*';
        await route.fulfill({ status: resp.status(), headers: respHeaders, body: respBody });
      } catch (e) {
        this.notes.push(`WAF 转发失败 ${url.pathname}: ${(e as Error).message}`);
        await route.abort();
      }
    });
    this.notes.push('已启用 WAF 同源原样转发（R1 例外，未修改请求/响应体）');
  }

  private bindPage(page: Page): void {
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
    const req = response.request();
    this.calls.push({
      seq: ++this.callSeq,
      time: new Date().toISOString(),
      method: req.method(),
      path: url.replace('https://m-api.test.lita.game', '').slice(0, 240),
      status: response.status(),
      requestBody: mask(req.postData() ?? '').slice(0, 600),
      responseBody: mask(body).slice(0, 1500)
    });
  }

  private writeRunLog(): void {
    writeFileSync(join(this.evidenceDir, 'run.json'), JSON.stringify({
      slug: this.slug,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      selectedCases: [...this.selected],
      total: this.total,
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

  // ---------------- 截图 ----------------

  protected async shot(name: string, fullPage = true, page: Page | null = null): Promise<void> {
    const target = page ?? this.page!;
    const safe = name.replace(/[^\w\u4e00-\u9fa5#①-⑳()[\].-]/g, '_').slice(0, 90);
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${safe}.png`);
    await target.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  protected async shotEl(selector: string, name: string, page: Page | null = null): Promise<void> {
    const target = page ?? this.page!;
    const safe = name.replace(/[^\w\u4e00-\u9fa5#①-⑳()[\].-]/g, '_').slice(0, 90);
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${safe}.png`);
    try {
      await target.locator(selector).first().screenshot({ path: file });
    } catch {
      await target.screenshot({ path: file, fullPage: true });
    }
    this.screenshots.push(file);
  }

  // ---------------- 列表与筛选 ----------------

  protected async waitListReady(page: Page): Promise<void> {
    await page.locator('.el-table__header-wrapper th').first().waitFor({ state: 'visible', timeout: 90000 });
    await this.waitTableSettled(page);
  }

  protected async waitNoLoading(page: Page, timeout = 60000): Promise<void> {
    const loc = page.locator('.el-loading-mask:visible');
    if (await loc.count() === 0) return;
    await loc.first().waitFor({ state: 'hidden', timeout }).catch(() => undefined);
  }

  protected async waitTableSettled(page: Page, timeout = 60000): Promise<void> {
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
  }

  protected async clickAndWaitList(page: Page, locator: ReturnType<Page['locator']>, timeout = 90000): Promise<void> {
    const respP = page.waitForResponse((r) => r.url().includes(LIST_API), { timeout }).catch(() => null);
    await locator.first().click();
    await respP;
    await this.waitNoLoading(page, timeout);
    await this.waitTableSettled(page, timeout);
  }

  protected async fillPlaceholder(page: Page, placeholder: string, value: string): Promise<void> {
    const input = page.locator(`input[placeholder="${placeholder}"]`).first();
    await input.click();
    await input.fill(value);
    await page.waitForFunction(({ ph, v }) => {
      const el = [...document.querySelectorAll('input')].find((i) => i.getAttribute('placeholder') === ph) as HTMLInputElement | undefined;
      return el?.value === v;
    }, { ph: placeholder, v: value }, { timeout: 10000 });
  }

  protected async clearPlaceholder(page: Page, placeholder: string): Promise<void> {
    const input = page.locator(`input[placeholder="${placeholder}"]`).first();
    await input.click();
    await input.fill('');
  }

  protected async selectOption(page: Page, scope: ReturnType<Page['locator']>, placeholder: string, option: string): Promise<string[]> {
    await scope.locator(`.el-select:has(input[placeholder="${placeholder}"])`).first().click();
    const dd = page.locator('.el-select-dropdown:not([style*="display: none"])').last();
    await dd.waitFor({ state: 'visible', timeout: 8000 });
    const options = (await dd.locator('.el-select-dropdown__item').allInnerTexts()).map((t) => t.trim());
    await dd.locator('.el-select-dropdown__item').filter({ hasText: new RegExp(`^${escapeRegExp(option)}$`) }).first().click();
    await dd.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined);
    return options;
  }

  protected async openDropdownOptions(page: Page, scope: ReturnType<Page['locator']>, placeholder: string): Promise<string[]> {
    await scope.locator(`.el-select:has(input[placeholder="${placeholder}"])`).first().click();
    const dd = page.locator('.el-select-dropdown:not([style*="display: none"])').last();
    await dd.waitFor({ state: 'visible', timeout: 8000 });
    return (await dd.locator('.el-select-dropdown__item').allInnerTexts()).map((t) => t.trim());
  }

  protected async clickVisibleOption(page: Page, option: string): Promise<void> {
    const dd = page.locator('.el-select-dropdown:not([style*="display: none"])').last();
    await dd.locator('.el-select-dropdown__item').filter({ hasText: new RegExp(`^${escapeRegExp(option)}$`) }).first().click();
    await dd.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined);
  }

  protected async closeDropdown(page: Page): Promise<void> {
    await page.keyboard.press('Escape');
    await page.locator('.el-dialog__title, .el-table__header-wrapper').first().click({ timeout: 5000 }).catch(() => undefined);
    await page.locator('.el-select-dropdown:not([style*="display: none"])').last().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
  }

  protected async search(page: Page): Promise<void> {
    await this.clickAndWaitList(page, page.getByRole('button', { name: 'Search' }));
  }

  protected async resetFilters(page: Page): Promise<void> {
    await this.clickAndWaitList(page, page.getByRole('button', { name: 'Reset Filters' }));
  }

  protected async readRows(page: Page = this.page!): Promise<string[][]> {
    return page.locator('.el-table__body-wrapper tbody tr').evaluateAll((trs) => trs.map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim())
    ));
  }

  protected async rowCount(page: Page = this.page!): Promise<number> {
    return page.locator('.el-table__body-wrapper tbody tr').count();
  }

  protected async emptyText(page: Page = this.page!): Promise<string> {
    const loc = page.locator('.el-table__empty-text');
    if (await loc.count() === 0) return '';
    if (!(await loc.first().isVisible().catch(() => false))) return '';
    return (await loc.first().innerText({ timeout: 3000 }).catch(() => '')).trim();
  }

  /** 分页 Total；无分页时按当前行数（0 行即 0）。仅读页面 DOM。 */
  protected async totalCount(page: Page = this.page!): Promise<number> {
    const totalLoc = page.locator('.el-pagination__total');
    if (await totalLoc.count() > 0 && await totalLoc.first().isVisible().catch(() => false)) {
      const t = await totalLoc.first().innerText({ timeout: 3000 }).catch(() => '');
      const m = t.match(/([\d,]+)/);
      if (m) return Number(m[1].replace(/,/g, ''));
    }
    const pag = page.locator('.el-pagination');
    if (await pag.count() > 0 && await pag.first().isVisible().catch(() => false)) {
      const text = (await pag.first().innerText({ timeout: 3000 }).catch(() => '')).replace(/\s+/g, ' ');
      const m = text.match(/Total\s+([\d,]+)/i);
      if (m) return Number(m[1].replace(/,/g, ''));
    }
    return this.rowCount(page);
  }

  protected async paginationText(page: Page = this.page!): Promise<string> {
    const pag = page.locator('.el-pagination');
    if (await pag.count() === 0 || !(await pag.first().isVisible().catch(() => false))) return '';
    return (await pag.first().innerText({ timeout: 3000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  protected async pageNumbers(page: Page = this.page!): Promise<string[]> {
    return (await page.locator('.el-pager li').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  protected async gotoPage(page: Page, n: number): Promise<void> {
    await this.clickAndWaitList(page, page.locator('.el-pager li').filter({ hasText: new RegExp(`^${n}$`) }).first());
  }

  protected async setPageSize(page: Page, size: number): Promise<void> {
    await page.locator('.el-pagination__sizes .el-input__inner').first().click();
    const dd = page.locator('.el-select-dropdown:not([style*="display: none"])').last();
    await dd.waitFor({ state: 'visible', timeout: 8000 });
    await dd.locator('.el-select-dropdown__item').filter({ hasText: new RegExp(`^${size}/page$`) }).first().click();
    await this.waitNoLoading(page);
    await this.waitTableSettled(page);
  }

  // ---------------- 提示、弹窗与操作 ----------------

  protected async drainToasts(page: Page = this.page!): Promise<string[]> {
    return (await page.locator('.el-message').allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
  }

  protected async waitToastContains(keyword: string, timeout = 8000, page: Page = this.page!): Promise<string> {
    await page.waitForFunction((kw) => {
      const texts = Array.from(document.querySelectorAll('.el-message__content, .el-message')).map((el) => (el.textContent ?? '').trim());
      return texts.some((t) => t.includes(kw));
    }, keyword, { timeout, polling: 100 });
    return (await page.locator('.el-message').allInnerTexts()).map((t) => t.trim()).join(' | ');
  }

  protected async openCreateDialog(page: Page = this.page!): Promise<ReturnType<Page['locator']>> {
    await page.getByRole('button', { name: '新增人气房间' }).first().click();
    const dlg = page.locator('.el-dialog__wrapper:visible').first();
    await dlg.waitFor({ state: 'visible', timeout: 10000 });
    return dlg;
  }

  protected async openBatchDialog(page: Page = this.page!): Promise<ReturnType<Page['locator']>> {
    await page.getByRole('button', { name: '批量新增人气房间' }).first().click();
    const dlg = page.locator('.el-dialog__wrapper:visible').first();
    await dlg.waitFor({ state: 'visible', timeout: 10000 });
    return dlg;
  }

  protected async closeDialog(dlg: ReturnType<Page['locator']>, button = '取 消'): Promise<void> {
    if (await dlg.isVisible().catch(() => false)) {
      await dlg.locator(`button:has-text("${button}")`).first().click().catch(() => undefined);
      await dlg.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    }
  }

  protected async dialogLabels(dlg: ReturnType<Page['locator']>): Promise<string[]> {
    return (await dlg.locator('.el-form-item__label').allInnerTexts()).map((t) => t.trim());
  }

  protected async dialogItemCount(dlg: ReturnType<Page['locator']>, label: string): Promise<number> {
    return dlg.locator(`.el-form-item:has(.el-form-item__label:text-is("${label}"))`).count();
  }

  protected async dialogFill(dlg: ReturnType<Page['locator']>, label: string, value: string): Promise<void> {
    await dlg.locator(`.el-form-item:has(.el-form-item__label:text-is("${label}")) input`).first().fill(value);
  }

  protected async dialogSelect(page: Page, dlg: ReturnType<Page['locator']>, placeholder: string, option: string): Promise<string[]> {
    return this.selectOption(page, dlg, placeholder, option);
  }

  protected async submitCreateDialog(page: Page, dlg: ReturnType<Page['locator']>): Promise<void> {
    await dlg.locator('button:has-text("确 定")').first().click();
    await Promise.race([
      dlg.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined),
      page.waitForFunction(() => document.querySelectorAll('.el-message').length > 0, undefined, { timeout: 15000 }).catch(() => undefined)
    ]);
  }

  /** 通过新增弹窗创建一条配置；失败（弹窗未关闭）抛出并带提示。 */
  protected async createRecommendation(page: Page, opts: { locale: string; type: string; roomId?: string; userId?: string; weight?: string }): Promise<void> {
    const dlg = await this.openCreateDialog(page);
    try {
      await this.dialogSelect(page, dlg, '请选择区域', opts.locale);
      await this.dialogSelect(page, dlg, '请选择推荐类型', opts.type);
      if (opts.roomId) await this.dialogFill(dlg, 'ROOM ID', opts.roomId);
      if (opts.userId) await this.dialogFill(dlg, 'USER ID', opts.userId);
      if (opts.weight) await this.dialogFill(dlg, '权重', opts.weight);
      await this.submitCreateDialog(page, dlg);
      const hidden = await dlg.waitFor({ state: 'hidden', timeout: 8000 }).then(() => true).catch(() => false);
      if (!hidden) {
        const toasts = (await this.drainToasts(page)).join(' | ');
        throw new Error(`新增未成功（弹窗未关闭）：${toasts || '无提示'}`);
      }
    } finally {
      await this.closeDialog(dlg).catch(() => undefined);
    }
  }

  /** 行删除（含二次确认），等待提示或列表更新。 */
  protected async deleteRow(page: Page, rowIndex: number): Promise<string> {
    const row = page.locator('.el-table__body-wrapper tbody tr').nth(rowIndex);
    await row.locator('button:has-text("删除")').first().click();
    const box = page.locator('.el-message-box__wrapper:visible').first();
    let confirmText = '';
    if (await box.count() > 0) {
      confirmText = (await box.innerText()).replace(/\s+/g, ' ').trim();
      await box.locator('.el-message-box__btns button.el-button--primary').first().click();
      await box.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    }
    await page.waitForFunction(() => {
      const texts = Array.from(document.querySelectorAll('.el-message')).map((el) => (el.textContent ?? '').trim());
      return texts.some((t) => t.includes('操作成功') || t.includes('删除'));
    }, undefined, { timeout: 15000, polling: 100 }).catch(() => undefined);
    return confirmText;
  }

  /** 批量删除当前页全部行（逐行勾选后点击批量删除）。 */
  protected async batchDeleteAll(page: Page): Promise<number> {
    const count = await this.rowCount(page);
    for (let i = 0; i < count; i++) {
      await page.locator('.el-table__body-wrapper tbody tr').nth(i).locator('.el-checkbox').first().click();
    }
    const btn = page.getByRole('button', { name: '批量删除' }).first();
    await btn.click();
    const box = page.locator('.el-message-box__wrapper:visible').first();
    if (await box.count() > 0) {
      await box.locator('.el-message-box__btns button.el-button--primary').first().click();
      await box.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    }
    await page.waitForFunction(() => {
      const texts = Array.from(document.querySelectorAll('.el-message')).map((el) => (el.textContent ?? '').trim());
      return texts.some((t) => t.includes('操作成功'));
    }, undefined, { timeout: 15000, polling: 100 }).catch(() => undefined);
    return count;
  }

  /** 通过列表筛选定位自建行并清理（按当前筛选结果逐行删除；仅用于本任务自建数据）。 */
  protected async cleanupRowsByFilter(page: Page = this.page!): Promise<void> {
    if (!this.page) return;
    const count = await this.rowCount(page);
    for (let i = count - 1; i >= 0; i--) {
      await this.deleteRow(page, i).catch(() => undefined);
    }
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
