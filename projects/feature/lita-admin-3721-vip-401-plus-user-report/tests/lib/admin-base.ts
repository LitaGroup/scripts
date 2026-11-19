/**
 * Lita Admin 3721「>=401用户数据」报表 UI 测试基类。
 *
 * 环境：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 执行机直连 m-api.test.lita.game 的 /admin/*、/api/* 被边缘 WAF 403；仅做网络层同源原样转发：
 *   m-api → https://funbit-mgr.test.cinta.team；/data-main/* 保持直连（不经改写）。
 *   不修改 URL 业务参数、不改写请求/响应体（《ADMIN 测试代码开发规范》R1 例外条款）。
 * - 账号密码仅运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD 注入，不写入代码、日志、证据。
 *
 * 等待策略：全部使用可观测条件（元素可见/输入值/响应事件/loading 消失/表格落定），
 * 不使用固定 sleep 作为断言前置条件。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Response, type Download } from 'playwright';
import { CheckBaseClass } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');
const FWD_BASE = (process.env.SCRIPT_API_BASE ?? 'https://funbit-mgr.test.cinta.team').replace(/\/+$/, '');

export const ROUTE_401 = '#/data-stats-manager/user-consumption/vip-401-plus-user-report';

export function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function mask(text: string): string {
  return text
    .replace(/("accessToken"\s*:\s*")[^"]+/g, '$1***')
    .replace(/(cookie\s*:\s*)[^\n]+/gi, '$1***')
    .replace(/(L-USER-TOKEN\s*:\s*)[^\s,}]+/gi, '$1***')
    .replace(/(token\s*[=:]\s*)[A-Za-z0-9._-]{12,}/gi, '$1***');
}

/** 上海时区当天 yyyy-MM-dd。报表数据日期 = 当天 - 1 天（T+1）。 */
export function shanghaiDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export interface ApiCall {
  seq: number;
  time: string;
  method: string;
  path: string;
  status?: number;
  contentType?: string;
  responseBody?: string;
  responseSize?: number;
}

export interface QueryResult {
  message: string;
  total: number;
  newRequests: number;
  status: number | null;
  elapsedMs: number;
}

export interface DownloadResult {
  filename: string;
  path: string;
  size: number;
}

const SKIP_REQ_HEADERS = new Set([
  'host', 'content-length', 'accept-encoding', 'connection', 'origin', 'referer',
  'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest', 'accept-language', 'priority', 'user-agent'
]);

export abstract class AdminBase extends CheckBaseClass {
  protected readonly slug: string;
  protected readonly evidenceDir: string;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected calls: ApiCall[] = [];
  protected screenshots: string[] = [];
  protected notes: string[] = [];
  protected queryResponses = 0;
  protected lastQueryStatus: number | null = null;
  private callSeq = 0;
  private shotNo = 0;

  constructor(slug: string) {
    super();
    this.slug = slug;
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${stamp()}`)));
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    this.browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
    this.context = await this.browser.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
    await this.installRoutes();
    this.page = await this.context.newPage();
    this.page.on('response', (response) => { void this.capture(response); });
    this.page.on('pageerror', (error) => this.log(`pageerror: ${String(error).slice(0, 200)}`));
    try {
      await super.execute();
    } finally {
      this.writeRunLog();
      await this.browser?.close().catch(() => undefined);
      this.log(`证据目录: ${this.evidenceDir}`);
    }
  }

  /** WAF 同源原样转发：仅网络层，路径/方法/头/体保持一致，不注入响应；/data-main/* 保持直连。 */
  private async installRoutes(): Promise<void> {
    await this.context!.route('https://m-api.test.lita.game/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      try {
        if (url.pathname.startsWith('/data-main/')) {
          const resp = await route.fetch({ timeout: 300000, failOnStatusCode: false });
          const body = await resp.body();
          await route.fulfill({ status: resp.status(), headers: resp.headers(), body });
          return;
        }
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(request.headers())) {
          if (!SKIP_REQ_HEADERS.has(k)) headers[k] = v;
        }
        const target = FWD_BASE + url.pathname + url.search;
        const resp = await route.fetch({
          url: target,
          method: request.method(),
          headers,
          postData: request.method() === 'GET' ? undefined : (request.postData() ?? undefined),
          timeout: 180000,
          failOnStatusCode: false
        });
        const body = await resp.body();
        const respHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(resp.headers())) {
          if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) respHeaders[k] = v;
        }
        respHeaders['access-control-allow-origin'] = '*';
        respHeaders['access-control-expose-headers'] = 'content-disposition,content-type';
        await route.fulfill({ status: resp.status(), headers: respHeaders, body });
      } catch {
        await route.abort();
      }
    });
  }

  private async capture(response: Response): Promise<void> {
    const url = response.url();
    if (!url.includes('m-api.test.lita.game') && !url.includes('data-main')) return;
    const path = url.replace(UI_BASE, '').slice(0, 240);
    if (url.includes('/stats/query') && !url.includes('/download')) {
      this.queryResponses++;
      this.lastQueryStatus = response.status();
    }
    const contentType = response.headers()['content-type'] ?? '';
    let body = '';
    if (contentType.includes('json') || contentType.includes('text')) {
      body = await response.text().catch(() => '');
    }
    this.calls.push({
      seq: ++this.callSeq,
      time: new Date().toISOString(),
      method: response.request().method(),
      path,
      status: response.status(),
      contentType,
      responseBody: mask(body).slice(0, 2000),
      responseSize: body.length
    });
  }

  protected writeRunLog(): void {
    writeFileSync(join(this.evidenceDir, 'run.json'), JSON.stringify({
      slug: this.slug,
      startedAt: new Date().toISOString(),
      screenshots: this.screenshots,
      notes: this.notes,
      apiCalls: this.calls
    }, null, 2), 'utf8');
  }

  /** 真实登录；仅对 5xx/网络类基础设施失败重试一次，凭证错误不重试。 */
  protected async login(user = process.env.ADMIN_USERNAME, pwd = process.env.ADMIN_PASSWORD): Promise<void> {
    if (!user || !pwd) throw new Error('缺少 ADMIN_USERNAME / ADMIN_PASSWORD 运行时环境变量，禁止使用会话桩替代登录');
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.page!.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await this.page!.getByPlaceholder(/username/i).waitFor({ state: 'visible', timeout: 60000 });
        await this.page!.getByPlaceholder(/username/i).fill(user);
        await this.page!.getByPlaceholder(/password/i).fill(pwd);
        const respPromise = this.page!.waitForResponse((r) => r.url().includes('/admin/login'), { timeout: 30000 }).catch(() => null);
        await this.page!.getByRole('button', { name: /login/i }).first().click();
        const loginResp = await respPromise;
        const status = loginResp?.status() ?? 0;
        if (status !== 200) throw new Error(`登录接口 HTTP ${status}`);
        await this.page!.waitForFunction(() => !location.hash.includes('/login'), undefined, { timeout: 60000 });
        await this.page!.waitForSelector('.el-menu-item', { timeout: 60000 });
        return;
      } catch (error) {
        lastError = error as Error;
        const message = lastError.message;
        const infra = /HTTP 5\d\d|Timeout|ECONN|net::|socket|Target page/.test(message);
        if (!infra || attempt === 2) throw lastError;
        this.log(`登录第 ${attempt} 次失败（基础设施类），重试一次：${message}`);
        await this.page!.goto('about:blank').catch(() => undefined);
      }
    }
    throw lastError ?? new Error('登录失败');
  }

  protected async shot(name: string, fullPage = false): Promise<void> {
    const safe = name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 80);
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${safe}.png`);
    await this.page!.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  protected async nav(hash: string): Promise<void> {
    await this.page!.goto(`${UI_BASE}/${hash.startsWith('#') ? '' : '#/'}${hash.replace(/^#?\/?/, '')}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page!.waitForSelector('.app-main', { timeout: 30000 });
  }

  protected async navReport(): Promise<void> {
    await this.page!.goto(`${UI_BASE}/${ROUTE_401}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.waitReportReady();
  }

  protected async waitReportReady(timeout = 60000): Promise<void> {
    await this.page!.locator('.filter-card').first().waitFor({ state: 'visible', timeout });
    await this.page!.locator('.query-field').first().waitFor({ state: 'visible', timeout });
  }

  protected async waitIdle(timeout = 300000): Promise<void> {
    await this.page!.waitForFunction(() => {
      const visible = Array.from(document.querySelectorAll('.el-loading-mask')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      return visible.length === 0;
    }, undefined, { timeout, polling: 200 });
  }

  protected async waitTableSettled(timeout = 300000): Promise<void> {
    await this.page!.waitForFunction(() => {
      const visible = Array.from(document.querySelectorAll('.el-loading-mask')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (visible.length > 0) return false;
      const rows = document.querySelectorAll('.el-table__body-wrapper tbody tr').length;
      const empty = (document.querySelector('.el-table__empty-text')?.textContent ?? '').trim();
      return rows > 0 || empty.length > 0;
    }, undefined, { timeout, polling: 200 });
  }

  /** 展开左侧菜单的指定父级（按标题文本）。 */
  protected async expandMenu(title: string): Promise<void> {
    const node = this.page!.locator('.el-submenu__title', { hasText: title }).first();
    await node.waitFor({ state: 'visible', timeout: 30000 });
    const expanded = await node.evaluate((el) => el.parentElement?.classList.contains('is-opened') ?? false);
    if (!expanded) {
      await node.click();
      await this.page!.waitForFunction((text) => {
        const titles = Array.from(document.querySelectorAll('.el-submenu__title'));
        const hit = titles.find((el) => (el.textContent ?? '').includes(text));
        return !!hit && !!hit.parentElement?.classList.contains('is-opened');
      }, title, { timeout: 15000 });
    }
  }

  /** 展开左侧全部可展开分组（无权限用例用于遍历菜单）。 */
  protected async expandAllMenus(): Promise<void> {
    const titles = await this.page!.locator('.el-submenu__title').allInnerTexts();
    for (const title of titles.map((t) => t.trim()).filter(Boolean)) {
      await this.expandMenu(title).catch(() => undefined);
    }
  }

  protected async menuTexts(): Promise<string[]> {
    return (await this.page!.locator('.el-menu-item').allInnerTexts()).map((t) => t.trim());
  }

  protected async menuAllTexts(): Promise<string[]> {
    const items = await this.page!.locator('.el-menu-item').allInnerTexts();
    const subs = await this.page!.locator('.el-submenu__title').allInnerTexts();
    return [...items, ...subs].map((t) => t.trim());
  }

  private async visibleMessageText(): Promise<string> {
    return this.page!.evaluate(() => {
      const visible = Array.from(document.querySelectorAll('.el-message')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      const last = visible[visible.length - 1];
      return last ? (last.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
    });
  }

  protected async clearMessages(timeout = 15000): Promise<void> {
    await this.page!.waitForFunction(() => {
      const visible = Array.from(document.querySelectorAll('.el-message')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      return visible.length === 0;
    }, undefined, { timeout, polling: 200 }).catch(() => undefined);
  }

  protected async waitMessage(timeout = 300000): Promise<string> {
    await this.page!.waitForFunction(() => {
      const visible = Array.from(document.querySelectorAll('.el-message')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      return visible.some((el) => (el.textContent ?? '').trim().length > 0);
    }, undefined, { timeout, polling: 100 });
    return (await this.visibleMessageText()).trim();
  }

  /** 等待匹配指定文案的提示（重置会先出现「已重置查询条件」，再出现自动查询的「查询完成」）。 */
  protected async waitMessageMatching(pattern: RegExp, timeout = 300000): Promise<string> {
    await this.page!.waitForFunction((source) => {
      const re = new RegExp(source);
      const visible = Array.from(document.querySelectorAll('.el-message')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      return visible.some((el) => re.test((el.textContent ?? '').replace(/\s+/g, ' ').trim()));
    }, pattern.source, { timeout, polling: 100 });
    return this.page!.evaluate((source) => {
      const re = new RegExp(source);
      const visible = Array.from(document.querySelectorAll('.el-message')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      const matched = visible.filter((el) => re.test((el.textContent ?? '').replace(/\s+/g, ' ').trim()));
      const last = matched[matched.length - 1];
      return last ? (last.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
    }, pattern.source);
  }

  /** 点击查询：以响应事件 +页面提示共同判定；校验拦截（无请求）时返回提示文案。 */
  protected async clickQuery(): Promise<QueryResult> {
    await this.clearMessages();
    await this.waitIdle(30000).catch(() => undefined);
    const before = this.queryResponses;
    const startedAt = Date.now();
    const msgPromise = this.waitMessage(300000);
    const respPromise = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 300000 }
    ).catch(() => null);
    await this.page!.getByRole('button', { name: '查询', exact: true }).first().click();
    const first = await Promise.race([
      msgPromise.then((message) => ({ kind: 'msg' as const, message })),
      respPromise.then((resp) => ({ kind: 'resp' as const, resp }))
    ]);
    let message = '';
    let status: number | null = null;
    if (first.kind === 'msg') {
      // 校验拦截为同步提示：应用在 validateAndBuildFilters 内 return，不会发出查询请求。
      message = first.message;
    } else {
      status = first.resp?.status() ?? null;
      message = await msgPromise.catch(() => '');
    }
    const newRequests = this.queryResponses - before;
    if (newRequests > 0) status = this.lastQueryStatus;
    if (status !== null && (status < 200 || status >= 300) && !message) {
      throw new Error(`查询接口 HTTP ${status}`);
    }
    await this.waitIdle(300000);
    if (newRequests > 0) await this.waitTableSettled(300000);
    return { message, total: await this.totalValue(), newRequests, status, elapsedMs: Date.now() - startedAt };
  }

  /** 点击重置：需求 #3435 §3.3 要求按默认条件刷新列表，等待自动查询完成提示。 */
  protected async clickReset(): Promise<QueryResult> {
    await this.clearMessages();
    await this.waitIdle(30000).catch(() => undefined);
    const before = this.queryResponses;
    const startedAt = Date.now();
    const respPromise = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 300000 }
    ).catch(() => null);
    await this.page!.getByRole('button', { name: '重置', exact: true }).first().click();
    const firstMessage = await this.waitMessage(300000).catch(() => '');
    const resp = await Promise.race([
      respPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))
    ]);
    let message = firstMessage;
    if (resp || this.queryResponses > before) {
      message = await this.waitMessageMatching(/查询完成/, 300000).catch(() => firstMessage);
    }
    const newRequests = this.queryResponses - before;
    await this.waitIdle(300000);
    if (newRequests > 0) await this.waitTableSettled(300000);
    return { message, total: await this.totalValue(), newRequests, status: this.lastQueryStatus, elapsedMs: Date.now() - startedAt };
  }

  protected field(label: string) {
    return this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
  }

  protected async fillField(label: string, value: string): Promise<void> {
    const input = this.field(label).locator('input, textarea').first();
    await input.fill(value);
    const handle = await input.elementHandle();
    await this.page!.waitForFunction(([el, v]) => (el as HTMLInputElement).value === v, [handle, value] as const, { timeout: 10000 });
  }

  protected async fieldValue(label: string): Promise<string> {
    return this.field(label).locator('input').first().inputValue();
  }

  protected async pickOption(label: string, optionText: string): Promise<string[]> {
    await this.page!.keyboard.press('Escape').catch(() => undefined);
    await this.page!.locator('.el-select-dropdown:visible').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => undefined);
    const select = this.field(label).locator('.el-select').first();
    await select.click();
    const dropdown = this.page!.locator('.el-select-dropdown:visible').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    const options = (await dropdown.locator('.el-select-dropdown__item').allInnerTexts()).map((t) => t.trim());
    await dropdown.locator('.el-select-dropdown__item', { hasText: optionText }).first().click();
    await dropdown.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    const input = select.locator('input').first();
    const handle = await input.elementHandle();
    await this.page!.waitForFunction(([el, v]) => (el as HTMLInputElement).value === v, [handle, optionText] as const, { timeout: 10000 });
    return options;
  }

  protected async openOptions(label: string): Promise<string[]> {
    await this.page!.keyboard.press('Escape').catch(() => undefined);
    await this.page!.locator('.el-select-dropdown:visible').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => undefined);
    const select = this.field(label).locator('.el-select').first();
    await select.click();
    const dropdown = this.page!.locator('.el-select-dropdown:visible').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    const options = (await dropdown.locator('.el-select-dropdown__item').allInnerTexts()).map((t) => t.trim());
    await this.page!.keyboard.press('Escape');
    await dropdown.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    return options;
  }

  protected async openPageSizeOptions(): Promise<string[]> {
    await this.page!.keyboard.press('Escape').catch(() => undefined);
    await this.page!.locator('.el-select-dropdown:visible').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => undefined);
    const select = this.page!.locator('.el-pagination__sizes .el-select').first();
    await select.click();
    const dropdown = this.page!.locator('.el-select-dropdown:visible').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    const options = (await dropdown.locator('.el-select-dropdown__item').allInnerTexts()).map((t) => t.trim());
    await this.page!.keyboard.press('Escape');
    await dropdown.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    return options;
  }

  protected async pageSize(n: number): Promise<void> {
    await this.page!.keyboard.press('Escape').catch(() => undefined);
    await this.page!.locator('.el-select-dropdown:visible').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => undefined);
    const select = this.page!.locator('.el-pagination__sizes .el-select').first();
    await select.click();
    const dropdown = this.page!.locator('.el-select-dropdown:visible').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    const respPromise = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 300000 }
    ).catch(() => null);
    await dropdown.locator('.el-select-dropdown__item', { hasText: `${n}/page` }).first().click();
    await dropdown.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    await this.page!.waitForFunction((v) => (document.querySelector('.el-pagination__sizes input')?.value ?? '').includes(String(v)), `${n}/page`, { timeout: 120000, polling: 200 });
    await respPromise;
    await this.waitIdle(300000);
    await this.waitTableSettled(300000);
  }

  protected async nextPage(expectedPage: number): Promise<void> {
    const beforeFirst = (await this.tableRows())[0]?.[0] ?? '';
    await this.page!.locator('.el-pagination .btn-next').first().click();
    await this.page!.waitForFunction(({ prev, page }) => {
      const masks = Array.from(document.querySelectorAll('.el-loading-mask')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      const first = document.querySelector('.el-table__body-wrapper tbody tr td')?.textContent?.trim() ?? '';
      const active = document.querySelector('.el-pager li.active')?.textContent?.trim() ?? '';
      return masks.length === 0 && active === String(page) && first !== prev;
    }, { prev: beforeFirst, page: expectedPage }, { timeout: 300000, polling: 300 });
  }

  protected async tableRows(): Promise<string[][]> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').evaluateAll((rows) =>
      rows.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()))
    );
  }

  protected async tableHeaders(): Promise<string[]> {
    return (await this.page!.locator('.el-table__header-wrapper th .cell').allInnerTexts()).map((t) => t.trim());
  }

  protected async totalValue(): Promise<number> {
    const text = await this.page!.locator('.el-pagination__total').innerText().catch(() => '');
    const match = text.replace(/\s+/g, ' ').match(/Total\s+([\d,]+)/i);
    return match ? Number(match[1].replace(/,/g, '')) : 0;
  }

  protected async totalText(): Promise<string> {
    return (await this.page!.locator('.el-pagination__total').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  protected async emptyText(): Promise<string> {
    return (await this.page!.locator('.el-table__empty-text').innerText().catch(() => '')).trim();
  }

  protected async activePage(): Promise<string> {
    return (await this.page!.locator('.el-pager li.active').innerText().catch(() => '')).trim();
  }

  protected async pageSizeLabel(): Promise<string> {
    return this.page!.locator('.el-pagination__sizes .el-select input').first().inputValue().catch(() => '');
  }

  protected async conditionCount(): Promise<number> {
    const text = await this.page!.locator('.filter-tip').innerText().catch(() => '');
    const match = text.match(/当前已设置查询条件[：:]\s*(\d+)\s*项/);
    return match ? Number(match[1]) : -1;
  }

  protected async conditionTip(): Promise<string> {
    return (await this.page!.locator('.filter-tip').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  protected async pageTitle(): Promise<string> {
    return (await this.page!.locator('.filter-card .page-title').first().innerText().catch(() => '')).trim();
  }

  protected async breadcrumb(): Promise<string> {
    return (await this.page!.locator('.el-breadcrumb').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  protected async bodyText(): Promise<string> {
    return (await this.page!.locator('.app-main').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  protected async clickExportAndDownload(): Promise<DownloadResult> {
    await this.clearMessages();
    const downloadPromise = this.page!.waitForEvent('download', { timeout: 300000 });
    const messagePromise = this.waitMessage(300000).catch(() => '');
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).first().click();
    const first = await Promise.race([
      downloadPromise.then((download: Download) => ({ kind: 'download' as const, download })),
      messagePromise.then((message) => ({ kind: 'msg' as const, message }))
    ]);
    if (first.kind === 'msg') {
      throw new Error(`导出未生成文件，页面提示：${first.message}`);
    }
    const filename = first.download.suggestedFilename();
    const target = join(this.evidenceDir, filename);
    await first.download.saveAs(target);
    const size = (await import('node:fs')).statSync(target).size;
    return { filename, path: target, size };
  }

  /** 断言失败瞬间补充截图（满足「失败即证据」）。 */
  protected async checkShot(title: string, fn: () => Promise<{ expect: string; real: string; pass?: boolean; message?: string }>): Promise<void> {
    await this.check(title, async () => {
      const result = await fn();
      const pass = result.pass ?? (result.expect === result.real);
      if (!pass) await this.shot(`FAIL-${title}`).catch(() => undefined);
      return result;
    });
  }
}
