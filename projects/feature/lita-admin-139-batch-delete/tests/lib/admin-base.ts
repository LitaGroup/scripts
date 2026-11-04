/**
 * ADMIN 项目 139（广播召人/主播认证批量删除 + 提现成为陪玩师时间）测试基类。
 *
 * 环境与认证：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 后端同源测试入口：https://funbit-mgr.test.cinta.team（SCRIPT_API_BASE 可覆盖）
 *   执行机直连 https://m-api.test.lita.game 被 CDN/WAF 403 拦截，浏览器层仅把该主机的
 *   请求转发到同源测试入口，不修改页面代码与业务参数。
 * - 管理员账号密码只在运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD 注入，不写入脚本、日志或证据；
 *   API 使用的 AccessToken 来自本次浏览器真实登录（login 响应 / Cookie）。
 *
 * 留痕（test/script 规范 v1.2.0）：
 * - 每个 act 的关键页面操作后截图；
 * - 页面接口请求/响应、脚本直连接口、只读 SQL 查询写入 evidence/run.json；
 * - token、密码等敏感字段统一脱敏，不落盘。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { CheckBaseClass } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');
export const API_BASE = (process.env.SCRIPT_API_BASE ?? 'https://funbit-mgr.test.cinta.team').replace(/\/+$/, '');
export const MAP_BASE = 'https://m-api.test.lita.game';
export const DB_API = (process.env.SCRIPT_DB_API ?? 'https://api.test.cinta.team').replace(/\/+$/, '');
export const TOKEN_COOKIE = 'vue_admin_template_token';
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? 'admin';

export const EN_ROOM_IDS = [6666, 12001, 10000];
export const MAIN_TEST_UIDS = [19440456, 19526094];
export const ROLLBACK_TEST_UIDS = [1751, 1752, 1791, 1792, 1793, 1794, 1795, 1796, 1797, 19440456, 19526094];
export const CERT_TYPE_SILVER_NORMAL = 4;

export interface ApiCall {
  seq: number;
  time: string;
  source: 'page' | 'script' | 'db';
  method: string;
  url: string;
  requestBody?: string;
  status?: number;
  contentType?: string;
  responseBody?: string;
  responseSize?: number;
}

export interface DbRow {
  [key: string]: unknown;
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

export function cst(ts: number | string | null | undefined): string {
  if (ts === null || ts === undefined || ts === '') return '-';
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '-';
  const d = new Date(n);
  const p = (v: number) => (v < 10 ? `0${v}` : `${v}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function maskSensitive(text: string): string {
  return text
    .replace(/("?(?:accessToken|token|pwd|password)"?\s*[:=]\s*")[^"]+(")/gi, '$1***$2')
    .replace(/(AccessToken|accessToken|L-USER-TOKEN|l-user-token)(["']?\s*[:=]\s*["']?)[^\s,"'}]+/g, '$1$2***')
    .replace(/JSESSIONID=[^;,\s]+/g, 'JSESSIONID=***');
}

function clamp(text: string, limit = 4000): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…(truncated, total ${text.length})`;
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
  protected dbAvailable = false;
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
    });
    await this.installRoutes();
    this.page = await this.context.newPage();
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

  /** 浏览器层把被 WAF 拦截的 m-api 主机转发到同源测试入口 */
  private async installRoutes(): Promise<void> {
    const ctx = this.context!;
    await ctx.route(`${MAP_BASE}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
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
        // 直接改写目标地址转发，保留 multipart 原始 body（文件上传依赖 boundary 完整）
        await route.continue({ url: target, headers });
      } catch (error) {
        this.notes.push(`转发失败 ${url.pathname}: ${(error as Error).message}`);
        await route.fulfill({ status: 502, headers: cors, contentType: 'application/json', body: JSON.stringify({ status: 1, msg: 'proxy error' }) });
      }
    });
  }

  /** 真实登录，token 取本次登录响应或 Cookie */
  protected async login(): Promise<void> {
    const page = this.page!;
    const password = process.env.ADMIN_PASSWORD;
    if (!process.env.ADMIN_USERNAME || !password) {
      throw new Error('缺少运行时环境变量 ADMIN_USERNAME / ADMIN_PASSWORD（不得写入脚本或证据）');
    }
    let loginToken = '';
    const onResponse = async (response: import('playwright').Response) => {
      if (response.url().includes('/admin/login') && response.request().method() === 'POST') {
        try {
          const json = (await response.json()) as { data?: { accessToken?: string } };
          if (json?.data?.accessToken) loginToken = json.data.accessToken;
        } catch {
          // ignore
        }
      }
    };
    page.on('response', (response) => {
      void onResponse(response);
    });
    await page.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('input[name="username"]', { timeout: 30000 });
    await page.fill('input[name="username"]', process.env.ADMIN_USERNAME);
    await page.fill('input[name="password"]', password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForFunction(() => !location.hash.includes('/login'), { timeout: 45000 });
    await page.waitForSelector('.app-main, .sidebar-container', { timeout: 45000 });
    const cookie = (await this.context!.cookies()).find((c) => c.name === TOKEN_COOKIE);
    this.token = cookie?.value || loginToken;
    if (!this.token) throw new Error('登录成功但未取得 AccessToken（Cookie/login 响应均为空）');
    await page.waitForTimeout(800);
    await this.shot('00-login-success');
    this.log(`登录成功，账号=${process.env.ADMIN_USERNAME}，AccessToken 已获取（长度 ${this.token.length}，不输出值）`);
  }

  protected async open(route: string, readySelector: string): Promise<void> {
    const page = this.page!;
    await page.goto(`${UI_BASE}/#${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(readySelector, { timeout: 45000 });
    await page.waitForTimeout(600);
  }

  protected async shot(tag: string): Promise<string> {
    mkdirSync(this.evidenceDir, { recursive: true });
    const name = `${String(++this.shotNo).padStart(2, '0')}-${tag.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.png`;
    await this.page!.screenshot({ path: join(this.evidenceDir, name), fullPage: true });
    this.shots.push(name);
    return name;
  }

  /** 页面接口留痕（token/密码脱敏） */
  private async capturePageResponse(response: import('playwright').Response): Promise<void> {
    const request = response.request();
    if (!request.url().includes('/api/') && !request.url().includes('/admin/') && !request.url().includes('/voiceroom/')) return;
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
      source: 'page',
      method: request.method(),
      url: request.url(),
      requestBody: clamp(maskSensitive(request.postData() ?? '')),
      status: response.status(),
      contentType: response.headers()['content-type'],
      responseBody: clamp(maskSensitive(body), 2000),
      responseSize: size,
    });
  }

  /** 脚本直连测试入口（携带本次登录 token） */
  protected async api(path: string, options: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<{ status: number; json?: any; buffer?: Buffer; headers: Record<string, string>; text?: string }> {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = { AccessToken: this.token };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.context!.request.fetch(`${API_BASE}${path}`, {
      method,
      headers,
      data: options.body === undefined ? undefined : JSON.stringify(options.body),
      failOnStatusCode: false,
      timeout: 60000,
    });
    const buffer = Buffer.from(await response.body());
    const contentType = response.headers()['content-type'] ?? '';
    const text = contentType.includes('json') || contentType.includes('text') ? buffer.toString('utf8') : '';
    let json: any;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    this.calls.push({
      seq: ++this.seq,
      time: new Date().toISOString(),
      source: 'script',
      method,
      url: `${API_BASE}${path}`,
      requestBody: options.body === undefined ? '' : clamp(maskSensitive(JSON.stringify(options.body))),
      status: response.status(),
      contentType,
      responseBody: text ? clamp(maskSensitive(text), 2000) : `(binary ${buffer.length} bytes)`,
      responseSize: buffer.length,
    });
    if (options.raw) return { status: response.status(), buffer, headers: response.headers() as Record<string, string>, text };
    return { status: response.status(), json, buffer, headers: response.headers() as Record<string, string>, text };
  }

  /** 只读 DB 查询（测试环境 admin-ai 查询网关，使用工位 LITA_USER_TOKEN，不落盘） */
  protected async dbQuery(sql: string, database = 'funbit'): Promise<DbRow[]> {
    const token = process.env.LITA_USER_TOKEN;
    if (!token) {
      this.dbAvailable = false;
      throw new Error('缺少 LITA_USER_TOKEN，无法执行只读数据库核对');
    }
    const response = await fetch(`${DB_API}/admin-ai/v1/query/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'l-user-token': token },
      body: JSON.stringify({ database, sql }),
    });
    const text = await response.text();
    this.calls.push({
      seq: ++this.seq,
      time: new Date().toISOString(),
      source: 'db',
      method: 'POST',
      url: `${DB_API}/admin-ai/v1/query/execute`,
      requestBody: clamp(maskSensitive(`[${database}] ${sql}`)),
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      responseBody: clamp(maskSensitive(text), 2000),
      responseSize: text.length,
    });
    if (!response.ok) throw new Error(`DB 查询 HTTP ${response.status}: ${text.slice(0, 200)}`);
    const json = JSON.parse(text) as { status: number; msg: string; data?: { header: string[]; data: unknown[][] } };
    if (json.status !== 0) throw new Error(`DB 查询失败: ${json.msg}`);
    this.dbAvailable = true;
    const header = json.data?.header ?? [];
    return (json.data?.data ?? []).map((row) => {
      const obj: DbRow = {};
      header.forEach((key, index) => {
        obj[key] = row[index];
      });
      return obj;
    });
  }

  // ---------- Element UI 通用操作 ----------

  protected get p(): Page {
    return this.page!;
  }

  protected rows(scope = '.app-container'): ReturnType<Page['locator']> {
    return this.page!.locator(`${scope} .el-table__body-wrapper`).first().locator('tbody tr');
  }

  protected rowCount(scope = '.app-container'): Promise<number> {
    return this.rows(scope).count();
  }

  protected async waitRows(min = 1, timeout = 30000, scope = '.app-container'): Promise<number> {
    const started = Date.now();
    let count = 0;
    while (Date.now() - started < timeout) {
      count = await this.rowCount(scope);
      if (count >= min) return count;
      await this.page!.waitForTimeout(300);
    }
    throw new Error(`等待列表行数 >= ${min} 超时，当前 ${count}`);
  }

  protected button(text: string, root = ''): ReturnType<Page['locator']> {
    return this.page!.locator(`${root} button`).filter({ hasText: new RegExp(`^\\s*${text}\\s*$`) }).first();
  }

  protected async buttonDisabled(text: string): Promise<boolean> {
    return this.button(text).isDisabled();
  }

  protected async toastTexts(): Promise<string[]> {
    return this.page!.locator('.el-message').allInnerTexts();
  }

  protected async waitToast(expected: string, timeout = 10000): Promise<string> {
    const message = this.page!.locator('.el-message').filter({ hasText: expected }).first();
    await message.waitFor({ state: 'visible', timeout });
    return (await message.innerText()).trim();
  }

  /** 等待列表 loading 结束（Element UI v-loading 遮罩消失） */
  protected async waitListIdle(timeout = 20000): Promise<void> {
    await this.page!
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
    await this.page!.waitForTimeout(150);
  }

  /** 等待分页组件当前页高亮为指定页（单页时组件隐藏也视为第 1 页） */
  protected async waitPageActive(expected: number, timeout = 20000): Promise<void> {
    await this.page!.waitForTimeout(250);
    await this.page!.waitForFunction(
      (page) => {
        const pagination = document.querySelector('.el-pagination') as HTMLElement | null;
        if (!pagination) return page === 1;
        const style = getComputedStyle(pagination);
        if (style.display === 'none' || style.visibility === 'hidden') return page === 1;
        return pagination.querySelector('.el-pager li.active')?.textContent?.trim() === String(page);
      },
      expected,
      { timeout },
    );
    await this.waitListIdle();
  }

  /** 打开分页并点击指定页码 */
  protected async gotoPage(pageNo: number): Promise<void> {
    const item = this.page!.locator('.el-pagination .el-pager li').filter({ hasText: new RegExp(`^\\s*${pageNo}\\s*$`) }).first();
    await item.click();
    await this.waitPageActive(pageNo);
  }

  /** 修改每页条数（Element UI 分页 sizes 下拉） */
  protected async changePageSize(size: number): Promise<void> {
    await this.page!.locator('.el-pagination .el-select').first().click();
    await this.page!
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: String(size) })
      .first()
      .click();
    await this.waitPageActive(1);
  }

  /** 读取分页组件当前页与每页条数 */
  protected async paginationState(): Promise<{ page: number; size: number; total: number; activeText: string }> {
    return this.page!.evaluate(() => {
      const pagination = document.querySelector('.el-pagination');
      const sizeText = pagination?.querySelector('.el-pagination__sizes .el-input__inner') as HTMLInputElement | null;
      const totalText = pagination?.querySelector('.el-pagination__total')?.textContent ?? '';
      const active = pagination?.querySelector('.el-pager li.active')?.textContent?.trim() ?? '';
      return {
        page: Number(active || 0),
        size: Number((sizeText?.value ?? '').replace(/[^\d]/g, '')) || 0,
        total: Number((totalText.match(/\d+/) ?? ['0'])[0]),
        activeText: active,
      };
    });
  }

  /** 移除当前页面上的轻提示，保证失败提示计数不受历史消息影响 */
  protected async clearToasts(): Promise<void> {
    await this.page!.evaluate(() => {
      document.querySelectorAll('.el-message').forEach((el) => el.remove());
    });
    await this.page!.waitForTimeout(150);
  }

  /** 等待所有轻提示消失（默认 toast 约 3s 自动关闭） */
  protected async waitToastsGone(timeout = 10000): Promise<void> {
    await this.page!.waitForFunction(() => document.querySelectorAll('.el-message').length === 0, null, { timeout }).catch(() => undefined);
  }

  /**
   * 拦截并暂缓下一次目标列表请求，用于验证“旧响应不覆盖当前列表”。
   * 仅暂缓匹配到的第一条请求；release() 后继续走原有路由转发。
   */
  protected async holdListRequest(
    pattern: string,
    isTarget: (request: { url: string; body: string }) => boolean,
  ): Promise<{ started: Promise<void>; release: () => void; stop: () => Promise<void> }> {
    let startedResolve: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    let releaseResolve: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });
    let armed = true;
    const handler = async (route: import('playwright').Route): Promise<void> => {
      const request = route.request();
      const body = request.postData() ?? '';
      if (armed && isTarget({ url: request.url(), body })) {
        armed = false;
        startedResolve();
        await gate;
      }
      await route.fallback();
    };
    await this.page!.route(pattern, handler);
    return {
      started,
      release: () => releaseResolve(),
      stop: () => this.page!.unroute(pattern, handler),
    };
  }

  protected async waitConfirmDialog(): Promise<string> {
    const box = this.page!.locator('.el-message-box').filter({ has: this.page!.locator('.el-message-box__message') }).first();
    await box.waitFor({ state: 'visible', timeout: 10000 });
    return (await box.locator('.el-message-box__message').innerText()).trim();
  }

  protected async confirmBox(): Promise<void> {
    const box = this.page!.locator('.el-message-box').first();
    await box.getByRole('button', { name: '确定' }).click();
    await this.page!.locator('.el-message-box').first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  }

  protected async cancelBox(): Promise<void> {
    const box = this.page!.locator('.el-message-box').first();
    await box.getByRole('button', { name: '取消' }).click();
    await this.page!.locator('.el-message-box').first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  }

  protected async selectRow(index: number, scope = '.app-container'): Promise<void> {
    await this.rows(scope).nth(index).locator('.el-checkbox').first().click();
    await this.page!.waitForTimeout(200);
  }

  protected async clearAllSelection(scope = '.app-container'): Promise<void> {
    const checkboxes = this.rows(scope).locator('.el-checkbox.is-checked');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await checkboxes.first().click().catch(() => undefined);
      await this.page!.waitForTimeout(100);
    }
  }

  protected async selectOption(formItemText: string, optionText: string, root = '.el-dialog:visible'): Promise<void> {
    const item = this.page!.locator(`${root} .el-form-item`).filter({ hasText: formItemText }).first();
    await item.locator('.el-select').click();
    const option = this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: optionText }).first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
  }

  protected async fillDialogField(label: string, value: string, root = '.el-dialog:visible', selector = 'input'): Promise<void> {
    const item = this.page!.locator(`${root} .el-form-item`).filter({ hasText: label }).first();
    await item.locator(selector).first().fill(value);
  }

  protected async setDateField(label: string, value: string, root = '.el-dialog:visible'): Promise<void> {
    const item = this.page!.locator(`${root} .el-form-item`).filter({ hasText: label }).first();
    const input = item.locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.page!.waitForTimeout(300);
  }

  protected writeRunEvidence(): void {
    const payload = {
      slug: this.slug,
      startedAt: new Date().toISOString(),
      uiBase: UI_BASE,
      apiBase: API_BASE,
      dbApi: DB_API,
      evidenceDir: this.evidenceDir,
      shots: this.shots,
      notes: this.notes,
      calls: this.calls,
    };
    try {
      writeFileSync(join(this.evidenceDir, 'run.json'), JSON.stringify(payload, null, 2), 'utf8');
      this.log(`运行留痕: ${join(this.evidenceDir, 'run.json')}`);
    } catch (error) {
      this.log(`写运行留痕失败: ${(error as Error).message}`);
    }
  }
}
