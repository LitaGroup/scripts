/**
 * Lita Admin 3715「拍拍模式流水-房间维度」UI 测试基类。
 *
 * 环境：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 执行机直连 m-api.test.lita.game 被边缘 WAF 403；仅做网络层同源原样转发：
 *   m-api → https://funbit-mgr.test.cinta.team（/data-main/ 前缀 → https://api.test.cinta.team），
 *   不修改任何业务参数、不注入响应。
 * - 账号密码仅运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD 注入，不写入代码、日志、证据。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { CheckBaseClass } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');
const FWD_BASE = (process.env.SCRIPT_API_BASE ?? 'https://funbit-mgr.test.cinta.team').replace(/\/+$/, '');
const DATA_MAIN_BASE = (process.env.SCRIPT_DATA_MAIN_BASE ?? 'https://api.test.cinta.team').replace(/\/+$/, '');

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
    .replace(/(L-USER-TOKEN\s*:\s*)[^\s,}]+/gi, '$1***');
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
  private callSeq = 0;
  private shotNo = 0;

  constructor(slug: string) {
    super();
    this.slug = slug;
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${stamp()}`)));
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({ viewport: { width: 1680, height: 1050 } });
    await this.installRoutes();
    this.page = await this.context.newPage();
    this.page.on('response', (response) => { void this.capture(response); });
    try {
      await super.execute();
    } finally {
      this.writeRunLog();
      await this.browser?.close().catch(() => undefined);
      this.log(`证据目录: ${this.evidenceDir}`);
    }
  }

  private async installRoutes(): Promise<void> {
    await this.context!.route('https://m-api.test.lita.game/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers())) {
        if (!SKIP_REQ_HEADERS.has(k)) headers[k] = v;
      }
      const target = (url.pathname.startsWith('/data-main/') ? DATA_MAIN_BASE : FWD_BASE) + url.pathname + url.search;
      try {
        const resp = await fetch(target, {
          method: request.method(),
          headers,
          body: request.method() === 'GET' ? undefined : request.postData()
        });
        const body = Buffer.from(await resp.arrayBuffer());
        const respHeaders: Record<string, string> = {};
        resp.headers.forEach((v, k) => {
          if (!['content-length', 'content-encoding', 'transfer-encoding'].includes(k)) respHeaders[k] = v;
        });
        respHeaders['access-control-allow-origin'] = '*';
        respHeaders['access-control-expose-headers'] = 'content-disposition,content-type';
        await route.fulfill({ status: resp.status, headers: respHeaders, body });
      } catch {
        await route.abort();
      }
    });
  }

  private async capture(response: Response): Promise<void> {
    const url = response.url();
    if (!url.includes('m-api.test.lita.game') && !url.includes('data-main')) return;
    let body = '';
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('json') || contentType.includes('text')) {
      body = await response.text().catch(() => '');
    }
    this.calls.push({
      seq: ++this.callSeq,
      time: new Date().toISOString(),
      method: response.request().method(),
      path: url.replace(UI_BASE, '').slice(0, 200),
      status: response.status(),
      contentType,
      responseBody: mask(body).slice(0, 1500),
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

  protected async login(): Promise<void> {
    const user = process.env.ADMIN_USERNAME;
    const pwd = process.env.ADMIN_PASSWORD;
    if (!user || !pwd) throw new Error('缺少 ADMIN_USERNAME / ADMIN_PASSWORD 运行时环境变量，禁止使用会话桩替代登录');
    await this.page!.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page!.waitForSelector('input', { timeout: 60000 });
    await this.page!.getByPlaceholder(/username/i).fill(user);
    await this.page!.getByPlaceholder(/password/i).fill(pwd);
    const resp = this.page!.waitForResponse((r) => r.url().includes('/admin/login'), { timeout: 30000 });
    await this.page!.getByRole('button', { name: /login/i }).first().click();
    const loginResp = await resp;
    if (loginResp.status() !== 200) throw new Error(`登录接口 HTTP ${loginResp.status()}`);
    await this.page!.waitForFunction(() => !location.hash.includes('/login'), undefined, { timeout: 30000 });
    await this.page!.waitForTimeout(1200);
  }

  protected async shot(name: string, fullPage = false): Promise<void> {
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${name}.png`);
    await this.page!.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  protected async nav(hash: string): Promise<void> {
    await this.page!.goto(`${UI_BASE}/#${hash}`, { waitUntil: 'domcontentloaded' });
    await this.page!.waitForTimeout(1500);
  }

  /** 展开左侧菜单的指定父级（按标题文本）。 */
  protected async expandMenu(title: string): Promise<void> {
    const node = this.page!.locator('.el-submenu__title', { hasText: title }).first();
    if ((await node.count()) === 0) return;
    const expanded = await node.evaluate((el) => el.parentElement?.classList.contains('is-opened') ?? false).catch(() => false);
    if (!expanded) {
      await node.click();
      await this.page!.waitForTimeout(700);
    }
  }

  /** 读取当前页面所有菜单项文本。 */
  protected async menuTexts(): Promise<string[]> {
    return (await this.page!.locator('.el-menu-item').allInnerTexts()).map((t) => t.trim());
  }

  protected async messageText(): Promise<string> {
    const loc = this.page!.locator('.el-message').last();
    try {
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      return (await loc.innerText()).trim();
    } catch {
      return '';
    }
  }

  protected async tableHeaders(): Promise<string[]> {
    return (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  /** 在指定筛选项（按 .query-label 文本）内填入日期并回车确认。 */
  protected async setDate(label: string, value: string): Promise<void> {
    const field = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
    if ((await field.count()) === 0) return;
    const input = field.locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.page!.keyboard.press('Escape');
    await this.page!.waitForTimeout(300);
  }

  /** 点击「查询」并等待 stats/query 响应（失败不重试）。 */
  protected async clickQuery(): Promise<void> {
    const wait = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 120000 }
    ).catch(() => null);
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    await wait;
  }

  /** 通过日期面板选择当月第 day 天（避免直接 fill 不提交 v-model）。 */
  protected async pickDate(label: string, day: number): Promise<void> {
    const field = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
    const input = field.locator('input').first();
    await input.click();
    await this.page!.waitForTimeout(900);
    const panel = this.page!.locator('.el-picker-panel').last();
    try {
      await panel.waitFor({ state: 'visible', timeout: 5000 });
      const cell = panel.locator('.el-date-table td.available .cell')
        .filter({ hasText: new RegExp(`^${day}$`) }).first();
      await cell.click({ timeout: 5000 });
      await this.page!.waitForTimeout(400);
      return;
    } catch {
      // 面板不可用时的兜底：键盘输入并回车提交，点击标题失焦（不回退）
    }
    const yyyy = new Date().getFullYear();
    const mm = String(new Date().getMonth() + 1).padStart(2, '0');
    await input.fill(`${yyyy}-${mm}-${String(day).padStart(2, '0')}`);
    await input.press('Enter');
    await this.page!.waitForTimeout(500);
    await this.page!.locator('.page-title').first().click().catch(() => undefined);
    await this.page!.waitForTimeout(300);
  }

  /** 选择下拉筛选项（按选项文案）。 */
  protected async pickOption(label: string, optionText: string): Promise<void> {
    const field = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
    await field.locator('.el-select').click();
    await this.page!.waitForTimeout(500);
    await this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: optionText }).first().click();
    await this.page!.waitForTimeout(400);
  }

  /** 在指定筛选项填入文本。 */
  protected async fillField(label: string, value: string): Promise<void> {
    const field = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
    const input = field.locator('input, textarea').first();
    await input.fill(value);
    await this.page!.waitForTimeout(200);
  }

  /** 读取表格数据行（二维文本数组）。 */
  protected async tableRows(): Promise<string[][]> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').evaluateAll((rows) =>
      rows.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()))
    );
  }

  protected async paginationTotal(): Promise<number> {
    const text = await this.page!.locator('.box-pagination').innerText().catch(() => '');
    const m = text.replace(/\s+/g, ' ').match(/Total\s+([\d,]+)/i);
    return m ? Number(m[1].replace(/,/g, '')) : 0;
  }

  protected async emptyText(): Promise<string> {
    return (await this.page!.locator('.el-table__empty-text').innerText().catch(() => '')).trim();
  }
}
