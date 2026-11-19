/**
 * 项目 105 / WO-0035「Admin 游戏入口配置」UI 测试基类。
 *
 * 用例来源：TK-0409 HANDOFF v6 九列用例（41 条）；技术方案：/task/20261119/TK-0409/TECH_DESIGN（v1.2）。
 * 环境：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 执行机直连 m-api.test.lita.game 被边缘 WAF 403，按《ADMIN 测试代码开发规范》R1 例外做浏览器层
 *   同源原样转发到 https://funbit-mgr.test.cinta.team（不改 URL 业务参数、不改请求/响应体；仅网络层转发）。
 * - 账号密码仅运行时通过 ADMIN_USERNAME/ADMIN_PASSWORD（qa-ai）与 NOAUTH_USERNAME/NOAUTH_PASSWORD（qa-noauth）注入，
 *   不写入代码、日志、证据。
 *
 * 等待策略：全部使用可观测条件（元素可见/输入值生效/响应事件/loading 消失/表格落定），不依赖固定 sleep。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { CheckBaseClass } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');
const FWD_BASE = (process.env.SCRIPT_API_BASE ?? 'https://funbit-mgr.test.cinta.team').replace(/\/+$/, '');
export const PAGE_HASH = '#/diamond-admin/game-entry-config';
export const PAGE_URL = `${UI_BASE}/${PAGE_HASH}`;

export function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** 今日日期（本机时区，与浏览器一致）：yyyy-MM-dd */
export function today(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function mask(text: string): string {
  return text
    .replace(/("accessToken"\s*:\s*")[^"]+/g, '$1***')
    .replace(/("l-user-token"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/(cookie\s*:\s*)[^\n]+/gi, '$1***')
    .replace(/(accessToken=)[^;\s]+/g, '$1***');
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
  protected lastDeleteFeedback = '';
  private extraContexts: BrowserContext[] = [];
  private callSeq = 0;
  private shotNo = 0;
  private startedAt = new Date().toISOString();

  constructor(slug: string) {
    super();
    this.slug = slug;
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${stamp()}`)));
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    this.startedAt = new Date().toISOString();
    this.browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
    try {
      await super.execute();
    } finally {
      for (const ctx of this.extraContexts) await ctx.close().catch(() => undefined);
      this.writeRunLog();
      await this.browser?.close().catch(() => undefined);
      this.log(`证据目录: ${this.evidenceDir}`);
    }
  }

  /** 为单条用例创建全新浏览器上下文（用例间强隔离），并完成真实登录。 */
  protected async newSession(user: string, password: string): Promise<Page> {
    if (!user || !password) throw new Error('缺少运行时账号环境变量，禁止使用会话桩替代登录');
    await this.closeSession();
    this.context = await this.browser!.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
    await this.installRoutes(this.context);
    this.page = await this.context.newPage();
    this.page.on('response', (response) => { void this.capture(response); });
    await this.login(this.page, user, password);
    return this.page;
  }

  /** 额外登录一个独立上下文（用例#30 双会话）。 */
  protected async addExtraSession(user: string, password: string): Promise<Page> {
    if (!user || !password) throw new Error('缺少运行时账号环境变量，禁止使用会话桩替代登录');
    const ctx = await this.browser!.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
    await this.installRoutes(ctx);
    this.extraContexts.push(ctx);
    const pg = await ctx.newPage();
    pg.on('response', (response) => { void this.capture(response); });
    await this.login(pg, user, password);
    return pg;
  }

  /** 额外创建一个与当前上下文共享登录态（克隆 storageState）的独立上下文（用例#30 双会话）。
   *  说明：同账号再次登录会使前一会话失效，故采用克隆当前真实登录态而非二次登录；两个上下文相互独立、共享同一真实会话。 */
  protected async addExtraSessionFromState(): Promise<Page> {
    if (!this.context) throw new Error('当前无登录上下文，无法创建共享登录态的会话');
    const state = await this.context.storageState();
    const ctx = await this.browser!.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true, storageState: state });
    await this.installRoutes(ctx);
    this.extraContexts.push(ctx);
    const pg = await ctx.newPage();
    pg.on('response', (response) => { void this.capture(response); });
    return pg;
  }

  protected async closeSession(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.page = null;
  }

  /** WAF 同源原样转发（仅网络层；不改 URL 业务参数、不改请求/响应体）。 */
  private async installRoutes(ctx: BrowserContext): Promise<void> {
    await ctx.route('https://m-api.test.lita.game/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers())) {
        if (!SKIP_REQ_HEADERS.has(k)) headers[k] = v;
      }
      try {
        const resp = await route.fetch({
          url: FWD_BASE + url.pathname + url.search,
          method: request.method(),
          headers,
          postData: request.method() === 'GET' ? undefined : (request.postData() ?? undefined),
          timeout: 120000,
          failOnStatusCode: false
        });
        const body = await resp.body();
        const respHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(resp.headers())) {
          if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) respHeaders[k] = v;
        }
        respHeaders['access-control-allow-origin'] = '*';
        await route.fulfill({ status: resp.status(), headers: respHeaders, body });
      } catch {
        await route.abort();
      }
    });
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
      path: url.replace('https://m-api.test.lita.game', '').slice(0, 200),
      status: response.status(),
      requestBody: req.postData() ? mask(req.postData()!).slice(0, 500) : '',
      responseBody: mask(body).slice(0, 800)
    });
  }

  protected writeRunLog(): void {
    writeFileSync(join(this.evidenceDir, 'run.json'), JSON.stringify({
      slug: this.slug,
      startedAt: this.startedAt,
      screenshots: this.screenshots,
      apiCalls: this.calls
    }, null, 2), 'utf8');
  }

  /** 真实登录（浏览器表单），登录接口非 200 即失败，不做会话桩。 */
  protected async login(pg: Page, user: string, password: string): Promise<void> {
    await pg.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pg.waitForSelector('input', { timeout: 60000 });
    await pg.getByPlaceholder(/username/i).fill(user);
    await pg.getByPlaceholder(/password/i).fill(password);
    const respP = pg.waitForResponse((r) => r.url().includes('/admin/login'), { timeout: 60000 });
    await pg.getByRole('button', { name: /login/i }).first().click();
    const resp = await respP;
    if (resp.status() !== 200) throw new Error(`登录接口 HTTP ${resp.status()}`);
    await pg.waitForFunction(() => !location.hash.includes('/login'), undefined, { timeout: 60000 });
    await pg.waitForSelector('.el-menu-item', { timeout: 60000 });
  }

  protected async shot(name: string, fullPage = false, pg: Page | null = null): Promise<void> {
    const target = pg ?? this.page!;
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${name}.png`);
    await target.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  /** 对被验证元素截图（关键检查点留痕）。 */
  protected async shotEl(selector: string, name: string, pg: Page | null = null): Promise<void> {
    const target = pg ?? this.page!;
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${name}.png`);
    try {
      await target.locator(selector).first().screenshot({ path: file });
    } catch {
      await target.screenshot({ path: file, fullPage: true });
    }
    this.screenshots.push(file);
  }

  /** 收集当前可见的 Element 消息（Toast 瞬态提示，动作后立即读取）。 */
  protected async drainMessages(pg: Page | null = null): Promise<string[]> {
    const target = pg ?? this.page!;
    return (await target.locator('.el-message').allInnerTexts().catch(() => []))
      .map((t) => t.trim()).filter(Boolean);
  }

  /** 页面通用文本（正文，已压缩空白）。 */
  protected async bodyText(pg: Page | null = null): Promise<string> {
    const target = pg ?? this.page!;
    return (await target.locator('body').innerText()).replace(/\s*\n\s*/g, ' | ').trim();
  }
}
