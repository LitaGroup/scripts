/**
 * 项目 146（飞书预警+admin后台增加水果机数据）Admin 水果机数据页面测试基类。
 *
 * 环境与认证：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 执行机直连 https://m-api.test.lita.game 的 /admin/* 与 /api/admin/* 被边缘 WAF 403；
 *   浏览器层仅将这两类路径原样转发到同源测试入口 https://funbit-mgr.test.cinta.team
 *   （R1 例外：不改 URL 业务参数、不改请求/响应体）；/data-main/* 直连 m-api。
 *   2026-11-09 回归时测试网关按目标入口 Host 路由（保留 m-api Host 会被网关返回占位响应），
 *   故转发时移除 Host 头，由目标入口自行填充；业务参数与响应体仍保持原样。
 * - 管理员账号密码只在运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD 注入，不写入脚本、日志或证据。
 *
 * 留痕（test/script 规范 v1.2.0）：
 * - 每个 check 断言后被验证区域截图；
 * - 页面接口请求/响应写入 evidence/run.json（token/密码脱敏）；
 * - 验证点全部读取页面内容，接口仅用于观察等待与留痕，不作为断言依据。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { CheckBaseClass, type CheckResult } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');
export const MAPI_BASE = 'https://m-api.test.lita.game';
export const ADMIN_HOST = (process.env.SCRIPT_ADMIN_HOST ?? 'https://funbit-mgr.test.cinta.team').replace(/\/+$/, '');
export const TOKEN_COOKIE = 'vue_admin_template_token';

export const ROUTE_SUMMARY = '/data-stats-manager/user-consumption/game-spin-draw-summary';
export const ROUTE_DAILY = '/data-stats-manager/user-consumption/game-spin-draw-daily';

export interface ApiCall {
  seq: number;
  time: string;
  source: 'page';
  method: string;
  url: string;
  requestBody?: string;
  status?: number;
  contentType?: string;
  responseBody?: string;
  responseSize?: number;
}

export interface TableSnapshot {
  headers: string[];
  rows: string[][];
  total: number;
  empty: string;
  pager: PagerState;
  masks: number;
}

export interface PagerState {
  size: string;
  total: number;
  pages: string[];
  active: string;
  prevDisabled: boolean;
  nextDisabled: boolean;
}

export interface Session {
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
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

export function maskSensitive(text: string): string {
  return text
    .replace(/("?(?:accessToken|token|pwd|password|sessionUserId)"?\s*[:=]\s*")[^"]+(")/gi, '$1***$2')
    .replace(/(AccessToken|accessToken|L-USER-TOKEN|l-user-token)(["']?\s*[:=]\s*["']?)[^\s,"'}]+/g, '$1$2***')
    .replace(/JSESSIONID=[^;,\s]+/g, 'JSESSIONID=***');
}

function clamp(text: string, limit = 4000): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…(truncated, total ${text.length})`;
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export abstract class SpinDrawAdminBase extends CheckBaseClass {
  protected readonly slug: string;
  protected readonly evidenceDir: string;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected token = '';
  protected calls: ApiCall[] = [];
  protected shots: string[] = [];
  protected notes: string[] = [];
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
      acceptDownloads: false,
      timezoneId: 'Asia/Shanghai',
      locale: 'zh-CN',
    });
    await this.installRoutes(this.context);
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

  /** 仅 /admin/* 与 /api/admin/* 从 m-api 主机原样转发到同源测试入口；其余请求不拦截。 */
  private async installRoutes(context: BrowserContext): Promise<void> {
    await context.route(`${MAPI_BASE}/**`, async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (!pathname.startsWith('/admin/') && !pathname.startsWith('/api/admin/')) {
        await route.continue();
        return;
      }
      const target = request.url().replace(MAPI_BASE, ADMIN_HOST);
      const headers: Record<string, string> = { ...request.headers() };
      for (const key of ['origin', 'referer', 'content-length', 'connection']) delete headers[key];
      // 同源测试网关按目标入口 Host 路由；保留 m-api Host 会命中网关占位响应，故移除后由目标入口填充
      delete headers.host;
      await route.continue({ url: target, headers });
    });
  }

  /** 真实登录并等待工作台；token 只保留长度痕迹。 */
  protected async login(): Promise<void> {
    const page = this.page!;
    const password = process.env.ADMIN_PASSWORD;
    if (!process.env.ADMIN_USERNAME || !password) {
      throw new Error('缺少运行时环境变量 ADMIN_USERNAME / ADMIN_PASSWORD（不得写入脚本或证据）');
    }
    let loginToken = '';
    page.on('response', (response) => {
      if (response.url().includes('/admin/login') && response.request().method() === 'POST') {
        void response
          .json()
          .then((json: { data?: { accessToken?: string } }) => {
            if (json?.data?.accessToken) loginToken = json.data.accessToken;
          })
          .catch(() => undefined);
      }
    });
    await page.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('input[name="username"]', { timeout: 30000 });
    await page.fill('input[name="username"]', process.env.ADMIN_USERNAME);
    await page.fill('input[name="password"]', password);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForFunction(() => !location.hash.includes('/login'), null, { timeout: 60000 });
    await page.waitForSelector('.sidebar-container', { timeout: 60000 });
    const cookie = (await this.context!.cookies()).find((c) => c.name === TOKEN_COOKIE);
    this.token = cookie?.value || loginToken;
    if (!this.token) throw new Error('登录成功但未取得 AccessToken（Cookie/login 响应均为空）');
    this.notes.push(`登录账号=${process.env.ADMIN_USERNAME}，accessToken 长度=${this.token.length}`);
    this.log(`登录成功，账号=${process.env.ADMIN_USERNAME}，AccessToken 已获取（长度 ${this.token.length}）`);
  }

  /** 创建独立浏览器会话（参数化用例每行独立会话）。 */
  protected async newSession(): Promise<Session> {
    const context = await this.browser!.newContext({
      viewport: { width: 1680, height: 1000 },
      acceptDownloads: false,
      timezoneId: 'Asia/Shanghai',
      locale: 'zh-CN',
    });
    await this.installRoutes(context);
    const page = await context.newPage();
    const saved = { context: this.context, page: this.page, token: this.token };
    this.context = context;
    this.page = page;
    try {
      await this.login();
    } finally {
      this.context = saved.context;
      this.page = saved.page;
      this.token = saved.token;
    }
    return {
      context,
      page,
      close: async () => {
        await context.close().catch(() => undefined);
      },
    };
  }

  /** 绑定会话为当前页面，供参数化数据行复用基类操作。 */
  protected useSession(session: Session): void {
    this.context = session.context;
    this.page = session.page;
  }

  /** 保存当前主会话，供参数化数据行切换独立会话后恢复。 */
  protected saveMainSession(): { context: BrowserContext; page: Page; token: string } {
    return { context: this.context!, page: this.page!, token: this.token };
  }

  protected restoreMainSession(saved: { context: BrowserContext; page: Page; token: string }): void {
    this.context = saved.context;
    this.page = saved.page;
    this.token = saved.token;
  }

  protected get p(): Page {
    return this.page!;
  }

  /** 直接打开报表路由并等待查询区渲染。 */
  protected async openReport(route: string): Promise<void> {
    await this.p.goto(`${UI_BASE}/#${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.p.waitForSelector('.query-field', { timeout: 60000 });
    await this.p.waitForSelector('.page-title', { timeout: 30000 });
  }

  /** 从左侧菜单进入目标页（数据统计管理 → 用户数据 → 叶子菜单）。 */
  protected async openByMenu(leaf: string, expectedRoute: string): Promise<void> {
    await this.p.waitForSelector('.sidebar-container .el-menu-item', { timeout: 30000 });
    const menu = this.p.locator('.sidebar-container .el-menu-item', { hasText: leaf }).first();
    if (!(await menu.isVisible().catch(() => false))) {
      for (const sub of ['数据统计管理', '用户数据']) {
        const title = this.p.locator('.sidebar-container .el-submenu__title:visible', { hasText: sub }).first();
        await title.waitFor({ state: 'visible', timeout: 30000 });
        const expanded = await title.evaluate((el) => el.closest('.el-submenu')?.classList.contains('is-opened') ?? false);
        if (!expanded) await title.click();
      }
    }
    await menu.waitFor({ state: 'visible', timeout: 30000 });
    await menu.click();
    await this.p.waitForFunction((route) => location.hash === `#${route}`, expectedRoute, { timeout: 30000 });
    await this.p.waitForFunction(
      (leafText) => (document.querySelector('.app-main .page-title')?.textContent ?? '').trim() === leafText,
      leaf,
      { timeout: 30000 },
    );
    await this.p.waitForSelector('.query-field', { timeout: 60000 });
    await this.p.waitForSelector('.page-title', { timeout: 30000 });
  }

  protected field(label: string) {
    return this.p.locator('.query-field', { has: this.p.locator('.query-label', { hasText: label }) });
  }

  protected async setDate(label: string, value: string): Promise<void> {
    const input = this.field(label).locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.p.keyboard.press('Escape');
    await this.p.waitForFunction(
      ({ labelText, expected }) => {
        const fields = Array.from(document.querySelectorAll('.query-field'));
        const target = fields.find((f) => (f.querySelector('.query-label')?.textContent ?? '').includes(labelText));
        const input = target?.querySelector('input') as HTMLInputElement | null;
        return !!input && input.value === expected;
      },
      { labelText: label, expected: value },
      { timeout: 10000 },
    );
  }

  protected async setUid(value: string): Promise<void> {
    await this.field('用户ID').locator('input').first().fill(value);
  }

  protected async resetForm(): Promise<void> {
    await this.p.getByRole('button', { name: '重置', exact: true }).click();
    await this.p.waitForFunction(
      () => Array.from(document.querySelectorAll('.query-field input')).every((input) => (input as HTMLInputElement).value === ''),
      null,
      { timeout: 10000 },
    );
  }

  /** 点击查询并等待真实查询响应与加载遮罩消失。 */
  protected async query(): Promise<{ status: number; elapsedMs: number }> {
    const started = Date.now();
    const responsePromise = this.p.waitForResponse(
      (item) => item.url().includes('/data-main/admin/stats/query') && item.request().method() === 'POST',
      { timeout: 120000 },
    );
    await this.p.getByRole('button', { name: '查询', exact: true }).click();
    const response = await responsePromise;
    await this.waitListIdle(120000);
    await this.p.waitForSelector('.el-table__header-wrapper th, .el-table__empty-text', { state: 'visible', timeout: 30000 });
    return { status: response.status(), elapsedMs: Date.now() - started };
  }

  /** 点击查询但不假设一定发起请求（必填/非法输入校验场景）。 */
  protected async clickQueryRaw(): Promise<void> {
    await this.p.getByRole('button', { name: '查询', exact: true }).click();
  }

  /** 等待一次查询响应；无响应时在超时后返回 null（用于校验阻断的负向观察）。 */
  protected async waitQueryResponse(timeout = 3000): Promise<boolean> {
    try {
      await this.p.waitForResponse(
        (item) => item.url().includes('/data-main/admin/stats/query') && item.request().method() === 'POST',
        { timeout },
      );
      return true;
    } catch {
      return false;
    }
  }

  protected async waitListIdle(timeout = 120000): Promise<void> {
    await this.p
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('.app-main .el-loading-mask')).every((node) => {
            const mask = node as HTMLElement;
            const style = getComputedStyle(mask);
            return style.display === 'none' || style.visibility === 'hidden' || mask.offsetParent === null;
          }),
        null,
        { timeout },
      )
      .catch(() => undefined);
  }

  protected async clearToasts(): Promise<void> {
    await this.p.evaluate(() => {
      document.querySelectorAll('.el-message').forEach((el) => el.remove());
    });
  }

  protected async lastToast(timeout = 10000): Promise<string> {
    try {
      await this.p.locator('.el-message__content').last().waitFor({ state: 'visible', timeout });
      return normalizeText(await this.p.locator('.el-message__content').last().innerText());
    } catch {
      return '';
    }
  }

  protected async fieldValues(): Promise<{ start: string; end: string; uid: string }> {
    return {
      start: await this.field('开始日期').locator('input').first().inputValue(),
      end: await this.field('结束日期').locator('input').first().inputValue(),
      uid: await this.field('用户ID').locator('input').first().inputValue(),
    };
  }

  protected async pageTitle(): Promise<string> {
    return normalizeText(await this.p.locator('.app-main .page-title').first().innerText());
  }

  protected async breadcrumb(): Promise<string> {
    const items = await this.p.locator('.el-breadcrumb__item').allInnerTexts();
    return items.map((item) => normalizeText(item).replace(/\/$/, '')).join(' / ');
  }

  protected async activeMenu(): Promise<string> {
    const texts = await this.p.locator('.sidebar-container .el-menu-item.is-active').allInnerTexts();
    return texts.map(normalizeText).join(',');
  }

  protected async querySection(): Promise<string> {
    const fields: string[] = [];
    const count = await this.p.locator('.query-field').count();
    for (let i = 0; i < count; i++) {
      const field = this.p.locator('.query-field').nth(i);
      const label = normalizeText(await field.locator('.query-label').innerText());
      const placeholder = await field.locator('input').first().getAttribute('placeholder');
      fields.push(`${label.replace(/\*$/, '')}=${placeholder ?? ''}`);
    }
    const buttons = (await this.p.locator('.app-main button').allInnerTexts())
      .map(normalizeText)
      .filter((text) => ['查询', '重置'].includes(text));
    return `${fields.join(';')}|按钮:${buttons.join(',')}`;
  }

  protected async headers(): Promise<string[]> {
    return (await this.p.locator('.el-table__header-wrapper th').allInnerTexts()).map(normalizeText);
  }

  protected async rows(): Promise<string[][]> {
    return this.p.evaluate(() => {
      const txt = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      return Array.from(document.querySelectorAll('.app-main .el-table__body-wrapper tbody tr')).map((tr) =>
        Array.from(tr.querySelectorAll('td')).map((td) => txt(td)),
      );
    });
  }

  protected async rowCount(): Promise<number> {
    return this.p.locator('.app-main .el-table__body-wrapper tbody tr').count();
  }

  protected async totalCount(): Promise<number> {
    const text = normalizeText(await this.p.locator('.el-pagination__total').first().innerText());
    const match = text.match(/(\d+)/);
    return match ? Number(match[1]) : -1;
  }

  protected async emptyText(): Promise<string> {
    const count = await this.p.locator('.el-table__empty-text').count();
    return count ? normalizeText(await this.p.locator('.el-table__empty-text').first().innerText()) : '';
  }

  protected async pager(): Promise<PagerState> {
    return this.p.evaluate(() => {
      const txt = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const pagination = document.querySelector('.el-pagination');
      const sizeInput = pagination?.querySelector('.el-select input') as HTMLInputElement | null;
      return {
        size: sizeInput?.value ?? '',
        total: Number((txt(pagination?.querySelector('.el-pagination__total') ?? null).match(/\d+/) ?? ['-1'])[0]),
        pages: Array.from(pagination?.querySelectorAll('.el-pager li') ?? []).map((e) => txt(e)),
        active: txt(pagination?.querySelector('.el-pager li.active') ?? null),
        prevDisabled: !!(pagination?.querySelector('.btn-prev') as HTMLButtonElement | null)?.disabled,
        nextDisabled: !!(pagination?.querySelector('.btn-next') as HTMLButtonElement | null)?.disabled,
      };
    });
  }

  protected async snapshot(): Promise<TableSnapshot> {
    return {
      headers: await this.headers(),
      rows: await this.rows(),
      total: await this.totalCount(),
      empty: await this.emptyText(),
      pager: await this.pager(),
      masks: await this.p.locator('.app-main .el-loading-mask').count(),
    };
  }

  /** 等待结果行渲染（行数或 Total 达到预期）。 */
  protected async waitRows(expected: number, timeout = 120000): Promise<void> {
    await this.p.waitForFunction(
      (count) => document.querySelectorAll('.app-main .el-table__body-wrapper tbody tr').length === count,
      expected,
      { timeout },
    );
  }

  protected async gotoNextPage(): Promise<void> {
    await this.p.locator('.el-pagination .btn-next').click();
    await this.waitListIdle(60000);
  }

  protected async gotoPrevPage(): Promise<void> {
    await this.p.locator('.el-pagination .btn-prev').click();
    await this.waitListIdle(60000);
  }

  protected async changePageSize(text: string): Promise<void> {
    await this.p.locator('.el-pagination .el-select').first().click();
    await this.p
      .locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: text })
      .first()
      .click();
    await this.waitListIdle(60000);
  }

  protected async jumpToPage(pageNo: number): Promise<void> {
    const input = this.p.locator('.el-pagination__jump input');
    await input.fill(String(pageNo));
    await input.press('Enter');
    await this.waitListIdle(60000);
  }

  /** 断言后对被验证页面区域截图（JPEG，控制证据体积）。 */
  protected async shot(name: string): Promise<void> {
    const safe = name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 80);
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(3, '0')}-${safe}.jpg`);
    try {
      await this.p.locator('.app-main').screenshot({ path: file, type: 'jpeg', quality: 65 });
      this.shots.push(file);
    } catch (error) {
      this.log(`截图失败 ${name}: ${(error as Error).message}`);
    }
  }

  /** 统一 check 包装：执行断言并在完成后截图（失败也截）。 */
  protected async uiCheck(title: string, shotName: string, fn: () => Promise<CheckResult>): Promise<void> {
    await this.check(title, async () => {
      try {
        return await fn();
      } finally {
        await this.shot(shotName);
      }
    });
  }

  protected textCheck(expect: string, real: string, message?: string): CheckResult {
    return { expect, real, pass: expect === real, message: message ?? (expect === real ? '' : `期望 ${expect}，实际 ${real}`) };
  }

  private async capturePageResponse(response: import('playwright').Response): Promise<void> {
    const request = response.request();
    const url = request.url();
    if (!url.includes('/data-main/') && !url.includes('/admin/')) return;
    if (request.method() === 'OPTIONS') return;
    if (!url.includes('/stats/') && !url.includes('/admin/login') && !url.includes('/admin/init')) return;
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
      url,
      requestBody: clamp(maskSensitive(request.postData() ?? '')),
      status: response.status(),
      contentType: response.headers()['content-type'],
      responseBody: clamp(maskSensitive(body), 3000),
      responseSize: size,
    });
    this.log(`接口留痕: ${request.method()} ${url} | 状态 ${response.status()} | 响应 ${(body ?? '').slice(0, 200).replace(/\s+/g, ' ')}`);
  }

  private writeRunEvidence(): void {
    const payload = {
      slug: this.slug,
      startedAt: new Date().toISOString(),
      uiBase: UI_BASE,
      adminHost: ADMIN_HOST,
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
