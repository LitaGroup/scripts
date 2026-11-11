/**
 * Lita Admin 项目 3713「Lita Leaderboard Weekly Data」UI 测试基类。
 *
 * 环境：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 执行机直连 m-api.test.lita.game 被边缘 WAF 403；仅做网络层同源原样转发：
 *   m-api → https://funbit-mgr.test.cinta.team（/data-main/ 前缀 → https://api.test.cinta.team），
 *   不修改任何业务参数、不注入响应（R1 例外条款，仅网络层转发）。
 * - 账号密码仅运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD 注入，不写入代码、日志、证据。
 * - 运行前建议 TMPDIR 指向可写目录（工位 /tmp 配额满会导致浏览器下载/截图写盘失败）。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Response, type Download } from 'playwright';
import { CheckBaseClass, type CheckResult } from '../../../../../src/base/CheckBaseClass.ts';

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

export const norm = (v: string): string => (v ?? '').replace(/[\u200B-\u200F\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
export const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

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
  private readonly channel: 'chrome' | 'msedge' | undefined;

  constructor(slug: string, opts: { channel?: 'chrome' | 'msedge' } = {}) {
    super();
    this.slug = slug;
    this.channel = opts.channel;
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${stamp()}`)));
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    this.browser = await chromium.launch({
      headless: true,
      ...(this.channel ? { channel: this.channel } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    this.context = await this.browser.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
    await this.installRoutes();
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(20000);
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
    if (url.includes('/download')) return; // 下载流不读取响应体，交给浏览器 download 事件
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
      channel: this.channel ?? 'chromium',
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
    await this.page!.waitForFunction(() => document.querySelectorAll('.el-submenu__title').length > 5, undefined, { timeout: 30000 });
  }

  protected async shot(name: string, fullPage = false): Promise<void> {
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${name}.png`);
    await this.page!.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  protected async shotElement(name: string, selector: string): Promise<void> {
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${name}.png`);
    await this.page!.locator(selector).first().screenshot({ path: file });
    this.screenshots.push(file);
  }

  /** 断言失败时自动补失败现场截图（R13）。 */
  protected async check(title: string, fn: () => CheckResult | Promise<CheckResult>): Promise<void> {
    let failed = false;
    await super.check(title, async () => {
      const r = await fn();
      const pass = r.pass ?? r.expect === r.real;
      if (!pass) failed = true;
      return r;
    });
    if (failed) {
      await this.shot(`FAIL-${title.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 70)}`).catch(() => undefined);
    }
  }

  protected async nav(hash: string): Promise<void> {
    await this.page!.goto(`${UI_BASE}/#${hash}`, { waitUntil: 'domcontentloaded' });
  }

  /** 展开左侧菜单的指定父级（按标题文本）。 */
  protected async expandMenu(title: string): Promise<void> {
    const node = this.page!.locator('.el-submenu__title', { hasText: title }).first();
    await node.waitFor({ state: 'visible', timeout: 20000 });
    const expanded = await node.evaluate((el) => el.parentElement?.classList.contains('is-opened') ?? false).catch(() => false);
    if (!expanded) {
      await node.click();
      await this.page!.waitForFunction(
        (t) => {
          const titles = Array.from(document.querySelectorAll('.el-submenu__title'));
          const hit = titles.find((el) => (el.textContent ?? '').includes(t));
          return !!hit && !!hit.parentElement?.classList.contains('is-opened');
        },
        title,
        { timeout: 15000 }
      );
    }
  }

  /** 展开父级菜单并点击叶子菜单，等待路由切换与筛选区加载。 */
  protected async openByMenu(parents: string[], leaf: string, expectHash?: string, readyText?: string): Promise<void> {
    for (const parent of parents) await this.expandMenu(parent);
    const item = this.page!.locator('.el-menu-item', { hasText: leaf }).first();
    await item.waitFor({ state: 'visible', timeout: 20000 });
    await item.click();
    if (expectHash) {
      await this.page!.waitForFunction((h) => location.hash === h, expectHash, { timeout: 30000 });
    }
    if (readyText) {
      await this.page!.locator('.query-label', { hasText: readyText }).first().waitFor({ state: 'visible', timeout: 30000 });
    }
    await this.page!.locator('.query-field').first().waitFor({ state: 'visible', timeout: 30000 });
  }

  /** 直达报表路由并用页面「重置」清空筛选项（保证用例间状态隔离），等待筛选区渲染。 */
  protected async openReportRoute(): Promise<void> {
    const target = '#/data-stats-manager/user-consumption/lita-leaderboard-weekly';
    const current = await this.page!.evaluate(() => location.hash).catch(() => '');
    if (current !== target) {
      await this.nav('/data-stats-manager/user-consumption/lita-leaderboard-weekly');
    }
    try {
      await this.page!.locator('.query-field').first().waitFor({ state: 'visible', timeout: 30000 });
    } catch {
      // 基础设施瞬断时整页重载一次（不改变用例步骤与断言）
      await this.page!.reload({ waitUntil: 'domcontentloaded' });
      await this.page!.locator('.query-field').first().waitFor({ state: 'visible', timeout: 30000 });
    }
    await this.page!.getByText('周订单礼物消费榜', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
    await this.clickReset();
    await this.page!.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll('.query-label'));
      const hit = labels.find((el) => (el.textContent ?? '').includes('Week'));
      const field = hit?.closest('.query-field');
      const el = field?.querySelector('input') as HTMLInputElement | null;
      return !!el && el.value === '';
    }, undefined, { timeout: 15000 });
    await this.clearToasts();
  }

  protected async menuItemVisible(leaf: string): Promise<boolean> {
    const item = this.page!.locator('.el-menu-item', { hasText: leaf }).first();
    return (await item.count()) > 0 && await item.isVisible().catch(() => false);
  }

  /** 等待所有 toast 消失，避免捕获到上一条提示。 */
  protected async clearToasts(): Promise<void> {
    await this.page!.waitForFunction(() => document.querySelectorAll('.el-message').length === 0, undefined, { timeout: 8000 }).catch(() => undefined);
  }

  /** 在触发动作前挂起 toast 捕获（提示约 3 秒消失，必须即时捕获）。 */
  protected armToast(timeout = 20000): Promise<string> {
    return this.page!.waitForSelector('.el-message', { state: 'visible', timeout })
      .then(async () => (await this.page!.locator('.el-message').last().innerText()).trim())
      .catch(() => 'NO-TOAST');
  }

  /** 按 .query-label 定位筛选项容器。 */
  protected field(label: string) {
    return this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
  }

  /** 日期框：fill + Enter + blur，并确认值已提交。 */
  protected async setDate(label: string, value: string): Promise<void> {
    const input = this.field(label).locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await input.blur().catch(() => undefined);
    await this.page!.waitForFunction(
      ({ l, v }) => {
        const labels = Array.from(document.querySelectorAll('.query-label'));
        const hit = labels.find((el) => (el.textContent ?? '').includes(l));
        const field = hit?.closest('.query-field');
        const el = field?.querySelector('input') as HTMLInputElement | null;
        return !!el && el.value === v;
      },
      { l: label, v: value },
      { timeout: 10000 }
    );
  }

  /** 文本输入框。 */
  protected async fillInput(label: string, value: string): Promise<void> {
    const input = this.field(label).locator('input').first();
    await input.click();
    await input.fill(value);
    await input.blur().catch(() => undefined);
  }

  /** 下拉选择（按选项精确文案）。 */
  protected async pickOption(label: string, optionText: string): Promise<void> {
    await this.field(label).locator('.el-select').click();
    const dropdown = this.page!.locator('.el-select-dropdown:visible').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    const opt = dropdown.locator('.el-select-dropdown__item').filter({ hasText: new RegExp(`^\\s*${optionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first();
    await opt.click();
    await this.page!.waitForFunction(
      ({ l, v }) => {
        const labels = Array.from(document.querySelectorAll('.query-label'));
        const hit = labels.find((el) => (el.textContent ?? '').includes(l));
        const field = hit?.closest('.query-field');
        const el = field?.querySelector('input') as HTMLInputElement | null;
        return !!el && el.value === v;
      },
      { l: label, v: optionText },
      { timeout: 10000 }
    );
  }

  protected async inputValue(label: string): Promise<string> {
    return (await this.field(label).locator('input').first().inputValue().catch(() => '')).trim();
  }

  protected async placeholder(label: string): Promise<string> {
    return (await this.field(label).locator('input').first().getAttribute('placeholder').catch(() => '')) ?? '';
  }

  /** 点击「查询」并等待实际 stats/query 响应（超时 120s 覆盖 ODPS 慢查询）。 */
  protected async clickQuery(): Promise<number> {
    const resp = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 120000 }
    ).catch(() => null);
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    const hit = await resp;
    return hit ? hit.status() : 0;
  }

  /** 仅点击「查询」，不等待响应（用于必填拦截 no_side_effect 场景）。 */
  protected async clickQueryNoWait(): Promise<void> {
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
  }

  /** 观察 [ms] 内是否出现 stats/query 请求；返回 true 表示出现（即不应出现的副作用）。 */
  protected async queryFiresWithin(ms = 4000): Promise<boolean> {
    return this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: ms }
    ).then(() => true).catch(() => false);
  }

  protected queryResponseCount(): number {
    return this.calls.filter((c) => c.path.includes('/stats/query') && !c.path.includes('download')).length;
  }

  protected async tableHeaders(): Promise<string[]> {
    return (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts())
      .map((t) => norm(t)).filter(Boolean);
  }

  protected async tableRows(): Promise<string[][]> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').evaluateAll((rows) =>
      rows.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()))
    );
  }

  protected async rowCount(): Promise<number> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').count();
  }

  protected async emptyText(): Promise<string> {
    return norm(await this.page!.locator('.el-table__empty-text').innerText().catch(() => ''));
  }

  protected async totalText(): Promise<string> {
    return norm(await this.page!.locator('.el-pagination__total').innerText().catch(() => ''));
  }

  protected async pagerPages(): Promise<string[]> {
    return (await this.page!.locator('.el-pager li').allInnerTexts()).map((t) => norm(t)).filter(Boolean);
  }

  protected async activePage(): Promise<string> {
    return norm(await this.page!.locator('.el-pager li.active').first().innerText().catch(() => ''));
  }

  protected async paginationState(): Promise<{ prevDisabled: boolean; nextDisabled: boolean }> {
    const prev = this.page!.locator('.el-pagination .btn-prev').first();
    const next = this.page!.locator('.el-pagination .btn-next').first();
    const prevDisabled = (await prev.count()) > 0 && await prev.evaluate((el) => (el as HTMLButtonElement).disabled || el.classList.contains('disabled')).catch(() => false);
    const nextDisabled = (await next.count()) > 0 && await next.evaluate((el) => (el as HTMLButtonElement).disabled || el.classList.contains('disabled')).catch(() => false);
    return { prevDisabled, nextDisabled };
  }

  /** 点击页码并等待查询响应与页码高亮。 */
  protected async goPage(n: number): Promise<number> {
    const resp = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 120000 }
    ).catch(() => null);
    await this.page!.locator('.el-pager li').filter({ hasText: new RegExp(`^${n}$`) }).first().click();
    const hit = await resp;
    await this.page!.waitForFunction((v) => {
      const el = document.querySelector('.el-pager li.active');
      return !!el && (el.textContent ?? '').trim() === String(v);
    }, n, { timeout: 15000 });
    return hit ? hit.status() : 0;
  }

  /** 跳页输入框输入页码并回车。 */
  protected async jumpToPage(n: number): Promise<number> {
    const input = this.page!.locator('.el-pagination__jump input').first();
    const resp = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 120000 }
    ).catch(() => null);
    await input.fill(String(n));
    await input.press('Enter');
    const hit = await resp;
    await this.page!.waitForFunction((v) => {
      const el = document.querySelector('.el-pager li.active');
      return !!el && (el.textContent ?? '').trim() === String(v);
    }, n, { timeout: 15000 });
    return hit ? hit.status() : 0;
  }

  /** 切换每页条数。 */
  protected async switchPageSize(n: number): Promise<number> {
    await this.page!.locator('.el-pagination__sizes .el-select').first().click();
    const dropdown = this.page!.locator('.el-select-dropdown:visible').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    const opt = dropdown.locator('.el-select-dropdown__item').filter({ hasText: new RegExp(`^\\s*${n}/page\\s*$`) }).first();
    const resp = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 120000 }
    ).catch(() => null);
    await opt.click();
    const hit = await resp;
    return hit ? hit.status() : 0;
  }

  /** 点击「重置」。 */
  protected async clickReset(): Promise<void> {
    await this.page!.getByRole('button', { name: '重置', exact: true }).click();
  }

  /** 点击「导出报表」并保存浏览器下载件。 */
  protected async downloadExport(): Promise<{ name: string; path: string }> {
    const dlP: Promise<Download | null> = this.page!.waitForEvent('download', { timeout: 180000 }).catch(() => null);
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const dl = await dlP;
    if (!dl) throw new Error('导出报表 180s 内未触发浏览器下载');
    const name = dl.suggestedFilename();
    const path = join(this.evidenceDir, name);
    await dl.saveAs(path);
    return { name, path };
  }

  protected async messageContains(fragment: string): Promise<boolean> {
    const text = await this.page!.locator('.app-main').innerText();
    return text.includes(fragment);
  }

  protected async conditionCountText(): Promise<string> {
    const text = await this.page!.locator('.app-main').innerText();
    return (text.match(/当前已设置查询条件[:：][^\n]*/) || [''])[0];
  }

  /** 错误提示（期望不出现的场景使用）。 */
  protected async errorMessageCount(): Promise<number> {
    return this.page!.locator('.el-message--error').count();
  }

  /** 读取表格某列全部文本。 */
  protected columnValues(rows: string[][], index: number): string[] {
    return rows.map((r) => norm(r[index] ?? ''));
  }

  /** 行指纹（Rank + Nick），用于判断列表内容是否变化。 */
  protected fingerprint(rows: string[][]): string {
    return rows.map((r) => r.slice(0, 3).join('|')).join('\n');
  }
}
