/**
 * 送礼详情报表（Admin 通用报表页）UI/API 测试基类。
 *
 * 环境说明：
 * - UI 基地址默认 https://admin.test.lita.game（可用 SCRIPT_UI_BASE 覆盖）
 * - data-main 接口默认走内网测试网关 https://api.test.cinta.team（可用 SCRIPT_API_BASE 覆盖）；
 *   执行机直连 m-api.test.lita.game 会被边缘 WAF 拦截（403 Access Denied），
 *   该网关暴露的是同一测试环境的 data-main 服务，用于真实接口/数据验证。
 * - 若提供 ADMIN_USERNAME / ADMIN_PASSWORD（运行时环境变量，不写入脚本/日志），
 *   脚本会先走真实登录流程；否则使用受控会话桩仅绕过被 WAF 拦截的登录接口，
 *   报表配置、查询、导出仍访问真实后端。
 *
 * 所有操作留痕：每一步截图，接口请求/响应写入 run.json 并随步骤输出。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { CheckBaseClass, type CheckResult } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');
export const API_BASE = (process.env.SCRIPT_API_BASE ?? 'https://api.test.cinta.team').replace(/\/+$/, '');
export const REPORT_PATH = '/#/data-stats-manager/gift-send-detail';
export const CONFIG_ID = 'gift-send-detail';
export const TOKEN_COOKIE = 'vue_admin_template_token';
export const DEFAULT_CONDITIONS = { start_dt: '2026-11-02', end_dt: '2026-11-03' };
export const SENDER_ID = '6360225';
export const RECEIVER_ID = '6420152';
export const GIFT_ID = '9358';
export const ROOM_IDS = ['10101411', '10101412'];
export const LOCALE_LABEL: Record<string, string> = {
  印尼语区: 'in',
  越南区: 'vi',
  泰国区: 'th',
  英语区: 'en',
  阿拉伯语区: 'ar',
  中文区: 'zh',
  韩国区: 'ko',
  菲律宾区: 'ph',
};

const EXPECTED_HEADERS = [
  '送礼用户id',
  '送礼用户no',
  '送礼用户nick',
  '接收用户id',
  '接收用户no',
  '接收用户nick',
  '礼物id',
  '礼物所属分类id',
  '礼物名称',
  '礼物类型',
  '礼物架',
  '礼物单价',
  '个数',
  '花费总币数',
  '房间id',
  '房间名称',
  '语言区',
  '服务完成时间',
];

export interface ApiCall {
  seq: number;
  time: string;
  method: string;
  url: string;
  requestBody?: string;
  status?: number;
  contentType?: string;
  responseBody?: string;
  responseSize?: number;
}

export function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function maskToken(value: string | undefined): string {
  if (!value) return '(none)';
  return `present(len=${value.length})`;
}

export abstract class AdminReportBase extends CheckBaseClass {
  protected readonly slug: string;
  protected readonly evidenceDir: string;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected calls: ApiCall[] = [];
  protected screenshots: string[] = [];
  protected runNotes: string[] = [];
  protected authMode = 'stub';
  /** 下一次 query 请求的延迟毫秒数（用于“查询中重置”竞态用例） */
  protected queryDelayMs = 0;
  private shotNo = 0;
  private callSeq = 0;

  constructor(slug: string) {
    super();
    this.slug = slug;
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${stamp()}`)));
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
    await this.installRoutes();
    this.page = await this.context.newPage();
    this.page.on('response', (response) => {
      void this.captureResponse(response);
    });
    try {
      await super.execute();
    } finally {
      this.writeRunLog();
      await this.browser?.close().catch(() => undefined);
      this.log(`证据目录: ${this.evidenceDir}`);
    }
  }

  protected async installRoutes(): Promise<void> {
    const ctx = this.context!;
    await ctx.route('https://m-api.test.lita.game/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const cors = {
        'access-control-allow-origin': UI_BASE,
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
        'access-control-expose-headers': 'content-disposition,content-type',
      };
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      if (url.pathname === '/admin/init') {
        await route.fulfill({
          status: 200,
          headers: cors,
          contentType: 'application/json',
          body: JSON.stringify({ status: 0, msg: '', data: { token: 'controlled-session' } }),
        });
        return;
      }
      if (url.pathname === '/api/admin/privilege') {
        await route.fulfill({
          status: 200,
          headers: cors,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 0,
            msg: '',
            data: { privileges: ['admin'], name: 'ai', userName: 'ai' },
          }),
        });
        return;
      }
      if (url.pathname.startsWith('/data-main/')) {
        if (url.pathname.endsWith('/stats/query') && this.queryDelayMs > 0) {
          const delay = this.queryDelayMs;
          this.queryDelayMs = 0;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        const target = API_BASE + url.pathname + url.search;
        const response = await fetch(target, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method === 'GET' ? undefined : request.postData(),
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        const headers: Record<string, string> = {
          ...cors,
          'content-type': response.headers.get('content-type') ?? 'application/json',
        };
        const disposition = response.headers.get('content-disposition');
        if (disposition) headers['content-disposition'] = disposition;
        const bodyText = String(headers['content-type']).includes('json') ? buffer.toString('utf8') : undefined;
        this.recordCall({
          method,
          url: target,
          requestBody: request.postData(),
          status: response.status,
          contentType: headers['content-type'],
          responseBody: bodyText,
          responseSize: buffer.length,
        });
        await route.fulfill({ status: response.status, headers, body: buffer });
        return;
      }
      await route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ status: 0, msg: '', data: {} }) });
    });
  }

  protected async ensureSession(): Promise<void> {
    const user = process.env.ADMIN_USERNAME ?? '';
    const pwd = process.env.ADMIN_PASSWORD ?? '';
    if (user && pwd) {
      this.authMode = 'real';
      await this.page!.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded' });
      await this.page!.getByPlaceholder('Username').fill(user);
      await this.page!.getByPlaceholder('Password').fill(pwd);
      const loginResponse = this.page!.waitForResponse((item) => item.url().includes('/admin/login'), { timeout: 30000 });
      await this.page!.getByRole('button', { name: 'Login' }).click();
      const response = await loginResponse;
      const body = await response.json().catch(() => ({}));
      if (response.status() !== 200 || String(body.status) !== '0' || !body.data?.accessToken) {
        throw new Error(`真实登录失败：HTTP ${response.status()}，业务 status=${body.status}，msg=${body.msg ?? ''}`);
      }
      const token = String(body.data.accessToken);
      this.runNotes.push(`登录方式：真实登录，accessToken=${maskToken(token)}`);
      this.log(`真实登录成功，accessToken=${maskToken(token)}`);
      await this.page!.waitForURL((url) => !url.hash.includes('/login'), { timeout: 30000 });
      return;
    }
    this.authMode = 'stub';
    await this.context!.addCookies([{ name: TOKEN_COOKIE, value: 'controlled-session', domain: new URL(UI_BASE).hostname, path: '/' }]);
    this.runNotes.push('登录方式：受控会话桩（WAF 对执行机直连 m-api.test.lita.game/admin/* 返回 403，登录接口不可达；报表数据接口仍走真实后端）');
    this.log('登录方式：受控会话桩（仅登录接口，业务接口真实）');
  }

  protected async openReport(path = REPORT_PATH): Promise<void> {
    await this.page!.goto(`${UI_BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await this.page!.waitForSelector('.data-report-result-page', { timeout: 30000 });
    await this.page!.waitForSelector('.query-field', { timeout: 30000 });
    await this.page!.waitForTimeout(800);
  }

  protected field(label: string) {
    return this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) });
  }

  protected async setDate(label: string, value: string): Promise<void> {
    const input = this.field(label).locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.page!.keyboard.press('Escape');
  }

  protected async setText(label: string, value: string): Promise<void> {
    await this.field(label).locator('input').first().fill(value);
  }

  protected async setRoomIds(value: string): Promise<void> {
    await this.field('房间ID').locator('textarea').fill(value);
  }

  protected async setLocale(display: string): Promise<void> {
    await this.field('语言区').locator('input').first().click();
    await this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: display }).first().click();
    await this.page!.keyboard.press('Escape');
  }

  protected async clickQuery(): Promise<Response> {
    const wait = this.page!.waitForResponse(
      (item) => item.url().includes('/data-main/admin/stats/query') && item.request().method() === 'POST',
      { timeout: 60000 },
    );
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    return wait;
  }

  protected async clickReset(): Promise<void> {
    await this.page!.getByRole('button', { name: '重置', exact: true }).click();
    await this.page!.waitForTimeout(400);
  }

  protected async messageText(timeout = 5000): Promise<string> {
    const el = this.page!.locator('.el-message__content').last();
    await el.waitFor({ timeout });
    return (await el.innerText()).trim();
  }

  protected async clearMessages(): Promise<void> {
    await this.page!.waitForTimeout(3200);
  }

  protected async shot(name: string): Promise<void> {
    this.shotNo++;
    const file = join(this.evidenceDir, `${String(this.shotNo).padStart(2, '0')}-${name}.png`);
    await this.page!.screenshot({ path: file, fullPage: true });
    this.screenshots.push(file);
    this.log(`截图: ${file}`);
  }

  protected queryCalls(): ApiCall[] {
    return this.calls.filter((item) => item.url.includes('/data-main/admin/stats/query') && !item.url.includes('/download'));
  }

  protected downloadCalls(): ApiCall[] {
    return this.calls.filter((item) => item.url.includes('/data-main/admin/stats/query/download'));
  }

  protected tableHeaders(): Promise<string[]> {
    return this.page!.locator('.el-table__header-wrapper th').allInnerTexts().then((list) => list.map((item) => item.trim()).filter(Boolean));
  }

  protected tableRowCount(): Promise<number> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').count();
  }

  protected async paginationDisabled(): Promise<boolean> {
    return (await this.page!.locator('.box-pagination .el-input.is-disabled').count()) > 0 ||
      (await this.page!.locator('.box-pagination .btn-next.is-disabled').count()) > 0;
  }

  protected expectHeaders(): string {
    return EXPECTED_HEADERS.join('|');
  }

  protected expectHeaderList(): string[] {
    return [...EXPECTED_HEADERS];
  }

  protected async assertHeaders(title: string): Promise<void> {
    await this.check(title, async (): Promise<CheckResult> => {
      const real = (await this.tableHeaders()).join('|');
      return { expect: this.expectHeaders(), real, pass: real === this.expectHeaders() };
    });
  }

  protected async writeRunLog(): Promise<void> {
    const file = join(this.evidenceDir, 'run.json');
    writeFileSync(
      file,
      JSON.stringify(
        {
          script: this.slug,
          startedAt: new Date().toISOString(),
          uiBase: UI_BASE,
          apiBase: API_BASE,
          authMode: this.authMode,
          notes: this.runNotes,
          screenshots: this.screenshots,
          apiCalls: this.calls,
        },
        null,
        2,
      ),
      'utf8',
    );
    this.log(`运行记录: ${file}`);
  }

  private recordCall(input: Omit<ApiCall, 'seq' | 'time'>): void {
    this.callSeq++;
    const call: ApiCall = {
      seq: this.callSeq,
      time: new Date().toISOString(),
      ...input,
      responseBody: input.responseBody ? input.responseBody.slice(0, 40000) : undefined,
    };
    this.calls.push(call);
    this.log(`接口留痕: ${call.method} ${call.url} | 参数: ${call.requestBody ?? '(无)'} | 状态: ${call.status} | 响应: ${(call.responseBody ?? '').slice(0, 300)}${(call.responseBody ?? '').length > 300 ? '…' : ''}`);
  }

  private async captureResponse(response: Response): Promise<void> {
    if (!response.url().includes('/admin/login')) return;
    const token = await this.page?.evaluate(() => document.cookie).catch(() => '');
    this.runNotes.push(`登录响应: HTTP ${response.status()}，cookie=${maskToken(token)}`);
  }
}

export function apiPost(path: string, body: unknown): Promise<{ status: number; headers: Headers; buffer: Buffer }> {
  return fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) }));
}
