/**
 * Lita Admin 3718「直播PK场次数据」UI 测试基类（项目内私有，基于平台 ADMIN 范式演进，不跨项目 import）。
 *
 * 环境：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 执行机直连 m-api.test.lita.game 被边缘 WAF 403；仅做网络层同源原样转发：
 *   /data-main/* → https://api.test.cinta.team，其它 /admin/* → https://funbit-mgr.test.cinta.team，
 *   不修改任何业务参数、不注入响应（ADMIN 测试代码开发规范 R1 例外，报告与代码均声明）。
 * - 账号密码仅运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD 注入，不写入代码、日志、证据。
 *
 * 约定：
 * - 业务操作用 act()，验证点用 check()；check 标题必须带「用例#N-①」标记。
 * - 断言一律读取页面内容；接口留痕只用于排查与前置/清理，不作为验证点。
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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

export function slugTime(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function mask(text: string): string {
  return text
    .replace(/("accessToken"\s*:\s*")[^"]+/g, '$1***')
    .replace(/(cookie\s*:\s*)[^\n]+/gi, '$1***')
    .replace(/(L-USER-TOKEN\s*:\s*)[^\s,}]+/gi, '$1***')
    .replace(/(accesstoken["']?\s*:\s*["'])[^"']+/gi, '$1***')
    .replace(/vue_admin_template_token=[^;\s]+/g, 'vue_admin_template_token=***');
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

export interface DownloadResult {
  filename: string;
  buffer: Buffer;
  downloadEvented: boolean;
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
  protected pageErrors: string[] = [];
  protected consoleErrors: string[] = [];
  private callSeq = 0;
  private shotNo = 0;
  private downloadBuffers = new Map<string, Buffer>();

  constructor(slug: string) {
    super();
    this.slug = slug;
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${slugTime()}`)));
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.newContext();
    this.page = await this.context.newPage();
    this.bindPage(this.page);
    try {
      await super.execute();
    } finally {
      this.writeRunLog();
      await this.browser?.close().catch(() => undefined);
      this.log(`证据目录: ${this.evidenceDir}`);
    }
  }

  protected async newContext(): Promise<BrowserContext> {
    const context = await this.browser!.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
    await this.installRoutes(context);
    return context;
  }

  private bindPage(page: Page): void {
    page.on('response', (response) => { void this.capture(response); });
    page.on('pageerror', (error) => { this.pageErrors.push(mask(error.message).slice(0, 300)); });
    page.on('console', (msg) => { if (msg.type() === 'error') this.consoleErrors.push(mask(msg.text()).slice(0, 300)); });
    page.on('download', (download) => {
      // blob 下载取消时由导出响应体兜底留证（见 captureDownload 注释）；此事件只用于文件名证据。
      const key = download.suggestedFilename();
      download.failure().then((failure) => {
        if (failure) this.notes.push(`下载事件未落盘（${failure}）：${key}`);
      }).catch(() => undefined);
    });
  }

  private async installRoutes(context: BrowserContext): Promise<void> {
    await context.route('https://m-api.test.lita.game/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers())) {
        if (!SKIP_REQ_HEADERS.has(k)) headers[k] = v;
      }
      // funbit-mgr 的 /admin/init 携带 accesstoken 会 404（无 token 返回 200 空体）；
      // 该接口仅用于会话初始化，去掉该请求头不改变业务参数与响应内容（R1 同源转发声明）。
      if (url.pathname === '/admin/init') delete headers['accesstoken'];
      const target = (url.pathname.startsWith('/data-main/') ? DATA_MAIN_BASE : FWD_BASE) + url.pathname + url.search;
      try {
        const resp = await fetch(target, {
          method: request.method(),
          headers,
          body: request.method() === 'GET' ? undefined : request.postData()
        });
        const body = Buffer.from(await resp.arrayBuffer());
        if (url.pathname.includes('/stats/query/download')) {
          const disposition = resp.headers.get('content-disposition') ?? '';
          this.downloadBuffers.set(disposition, body);
        }
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
      status: response.status(),
      contentType,
      responseBody: mask(body).slice(0, 1200),
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

  protected async login(user = process.env.ADMIN_USERNAME, pwd = process.env.ADMIN_PASSWORD, page = this.page!): Promise<void> {
    if (!user || !pwd) throw new Error('缺少 ADMIN_USERNAME / ADMIN_PASSWORD 运行时环境变量，禁止使用会话桩替代登录');
    await page.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('input[name="username"]', { timeout: 60000 });
    await page.locator('input[name="username"]').fill(user);
    await page.locator('input[name="password"]').fill(pwd);
    const respPromise = page.waitForResponse((r) => r.url().includes('/admin/login'), { timeout: 30000 });
    await page.locator('button', { hasText: /^Login$/ }).first().click();
    const resp = await respPromise;
    const body = await resp.text().catch(() => '');
    if (resp.status() !== 200 || !/"status":"0"/.test(body)) {
      throw new Error(`登录失败：HTTP ${resp.status()} ${mask(body).slice(0, 200)}`);
    }
    await page.waitForFunction(() => !location.hash.includes('/login'), undefined, { timeout: 30000 });
    await page.waitForSelector('.el-menu-item', { timeout: 30000 });
  }

  protected async loginAs(user: string, pwd: string): Promise<Page> {
    const context = await this.newContext();
    const page = await context.newPage();
    this.bindPage(page);
    await this.login(user, pwd, page);
    return page;
  }

  protected async closeExtraPage(page: Page): Promise<void> {
    await page.context().close().catch(() => undefined);
  }

  protected async shot(name: string, fullPage = false): Promise<void> {
    if (!this.page) return;
    const safe = name.replace(/[^\w\u4e00-\u9fa5#①-⑳-]/g, '_').slice(0, 80);
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${safe}.png`);
    await this.page!.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  protected async shotOn(page: Page, name: string, fullPage = false): Promise<void> {
    const safe = name.replace(/[^\w\u4e00-\u9fa5#①-⑳-]/g, '_').slice(0, 80);
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${safe}.png`);
    await page.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  protected async waitApp(page = this.page!): Promise<void> {
    await page.locator('.app-main').waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForFunction(() => (document.querySelector('.app-main')?.textContent ?? '').trim().length > 0, undefined, { timeout: 30000 });
  }

  protected async openReport(hash: string): Promise<void> {
    await this.page!.goto(`${UI_BASE}/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.waitApp();
  }

  /** 展开一级/二级菜单（按标题文本）。 */
  protected async expandMenu(title: string): Promise<void> {
    const node = this.page!.locator('.el-submenu__title', { hasText: new RegExp(`^\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first();
    await node.waitFor({ state: 'attached', timeout: 30000 });
    const opened = await node.evaluate((el) => el.parentElement?.classList.contains('is-opened') ?? false).catch(() => false);
    if (!opened) {
      await node.scrollIntoViewIfNeeded();
      await node.click();
      await this.page!.waitForFunction(
        (t) => {
          const el = [...document.querySelectorAll('.el-submenu__title')].find((x) => (x.textContent ?? '').trim() === t);
          return !!el && !!el.parentElement?.classList.contains('is-opened');
        },
        title,
        { timeout: 10000 }
      );
    }
  }

  /** 菜单项可见数量（只统计实际可见的项）。 */
  protected async visibleMenuItems(text: string): Promise<number> {
    return this.page!.locator('.el-menu-item:visible', { hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).count();
  }

  protected async clickMenuItem(text: string): Promise<void> {
    const item = this.page!.locator('.el-menu-item:visible', { hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first();
    await item.scrollIntoViewIfNeeded().catch(() => undefined);
    await item.click();
  }

  protected queryField(label: string) {
    return this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
  }

  protected async queryFields(): Promise<Array<{ label: string; required: boolean; tag: string; placeholder: string; value: string }>> {
    return this.page!.locator('.query-field').evaluateAll((fields) => fields.map((f) => {
      const input = f.querySelector('input,textarea') as HTMLInputElement | HTMLTextAreaElement | null;
      return {
        label: (f.querySelector('.query-label')?.textContent ?? '').trim(),
        required: !!f.querySelector('.required-mark'),
        tag: input?.tagName ?? '',
        placeholder: input?.getAttribute('placeholder') ?? '',
        value: input?.value ?? ''
      };
    }));
  }

  protected async setDate(label: string, value: string): Promise<void> {
    const field = this.queryField(label);
    const input = field.locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.page!.keyboard.press('Escape');
    await this.page!.waitForFunction(
      ({ l, v }) => {
        const fields = [...document.querySelectorAll('.query-field')];
        const f = fields.find((x) => (x.querySelector('.query-label')?.textContent ?? '').includes(l));
        const i = f?.querySelector('input') as HTMLInputElement | undefined;
        return i?.value === v;
      },
      { l: label, v: value },
      { timeout: 10000 }
    );
  }

  protected async fillByPlaceholder(placeholder: string, value: string): Promise<void> {
    const input = this.page!.getByPlaceholder(placeholder, { exact: true }).first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.page!.keyboard.press('Escape');
    await this.page!.waitForFunction(
      ({ ph, v }) => {
        const el = [...document.querySelectorAll('input')].find((i) => i.getAttribute('placeholder') === ph) as HTMLInputElement | undefined;
        return el?.value === v;
      },
      { ph: placeholder, v: value },
      { timeout: 10000 }
    );
  }

  protected async setDateRange(start: string, end: string): Promise<void> {
    const inputs = this.page!.locator('.el-date-editor--daterange input');
    await inputs.nth(0).click();
    await inputs.nth(0).fill(start);
    await inputs.nth(0).press('Enter');
    await inputs.nth(1).fill(end);
    await inputs.nth(1).press('Enter');
    await this.page!.keyboard.press('Escape');
    await this.page!.waitForFunction(
      ({ s, e }) => {
        const list = [...document.querySelectorAll('.el-date-editor--daterange input')] as HTMLInputElement[];
        return list[0]?.value === s && list[1]?.value === e;
      },
      { s: start, e: end },
      { timeout: 10000 }
    );
  }

  protected async pickOption(label: string, optionText: string): Promise<void> {
    const field = this.queryField(label);
    await field.locator('.el-select').first().click();
    const option = this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: new RegExp(`^\\s*${optionText}\\s*$`) }).first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
    await this.page!.waitForFunction(
      ({ l, v }) => {
        const fields = [...document.querySelectorAll('.query-field')];
        const f = fields.find((x) => (x.querySelector('.query-label')?.textContent ?? '').includes(l));
        const i = f?.querySelector('input') as HTMLInputElement | undefined;
        return (i?.value ?? '').trim() === v;
      },
      { l: label, v: optionText },
      { timeout: 10000 }
    );
  }

  protected async fillField(label: string, value: string): Promise<void> {
    const field = this.queryField(label);
    const input = field.locator('input, textarea').first();
    await input.fill(value);
    await this.page!.waitForFunction(
      ({ l, v }) => {
        const fields = [...document.querySelectorAll('.query-field')];
        const f = fields.find((x) => (x.querySelector('.query-label')?.textContent ?? '').includes(l));
        const i = f?.querySelector('input,textarea') as HTMLInputElement | HTMLTextAreaElement | undefined;
        return i?.value === v;
      },
      { l: label, v: value },
      { timeout: 10000 }
    );
  }

  protected async clickQuery(timeout = 120000): Promise<number> {
    const run = async (): Promise<number> => {
      const wait = this.page!.waitForResponse(
        (r) => (r.url().includes('/stats/query') || r.url().includes('/admin-main/')) && !r.url().includes('download'),
        { timeout }
      ).catch(() => null);
      await this.page!.getByRole('button', { name: '查询', exact: true }).click();
      const resp = await wait;
      await this.waitQuerySettled();
      return resp?.status() ?? 0;
    };
    let status = await run();
    if (status === 502) {
      this.notes.push(`查询首次返回 HTTP 502（基础设施），按规范重试一次：${new Date().toISOString()}`);
      await this.page!.waitForTimeout(3000);
      status = await run();
      this.notes.push(`HTTP 502 重试结果：${status}`);
    }
    return status;
  }

  /** 查询后等待 loading 消失与提示出现（web-first，不固定 sleep）。 */
  protected async waitQuerySettled(): Promise<void> {
    await this.page!.locator('.el-loading-mask').first().waitFor({ state: 'hidden', timeout: 120000 }).catch(() => undefined);
    await this.page!.locator('.el-message').last().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  }

  protected async clickReset(): Promise<void> {
    const wait = this.page!.waitForResponse((r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 8000 }).catch(() => null);
    await this.page!.getByRole('button', { name: '重置', exact: true }).click();
    await wait;
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

  protected async messageCount(text: string): Promise<number> {
    return this.page!.locator('.el-message', { hasText: text }).count();
  }

  protected async errorDialogs(): Promise<string[]> {
    return this.page!.locator('.el-message--error:visible, .el-message-box:visible').allInnerTexts().catch(() => []);
  }

  protected async headers(): Promise<Array<{ text: string; colspan: number; rowspan: number }>> {
    return this.page!.locator('.el-table__header-wrapper th').evaluateAll((ths) => ths.map((th) => ({
      text: (th.textContent ?? '').trim(),
      colspan: (th as HTMLTableCellElement).colSpan,
      rowspan: (th as HTMLTableCellElement).rowSpan
    })));
  }

  protected async headerTexts(): Promise<string[]> {
    return (await this.headers()).map((h) => h.text).filter(Boolean);
  }

  protected async rows(): Promise<string[][]> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').evaluateAll((trs) => trs.map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim())
    ));
  }

  protected async rowCount(): Promise<number> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').count();
  }

  protected async emptyText(): Promise<string> {
    return (await this.page!.locator('.el-table__empty-text').innerText().catch(() => '')).trim();
  }

  protected async totalText(): Promise<string> {
    return (await this.page!.locator('.el-pagination__total').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  protected async pagerNumbers(): Promise<string[]> {
    return (await this.page!.locator('.el-pager li').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  protected async paginationDisabled(): Promise<{ prev: boolean; next: boolean; size: boolean }> {
    const prev = this.page!.locator('.el-pagination .btn-prev').first();
    const next = this.page!.locator('.el-pagination .btn-next').first();
    const size = this.page!.locator('.el-pagination__sizes .el-select').first();
    const isDis = async (loc: typeof prev) => (await loc.count()) > 0 && await loc.evaluate((el) => (el as HTMLButtonElement).disabled || el.classList.contains('is-disabled') || el.classList.contains('disabled')).catch(() => false);
    return { prev: await isDis(prev), next: await isDis(next), size: (await size.count()) > 0 && await size.evaluate((el) => el.classList.contains('is-disabled')).catch(() => false) };
  }

  protected async pageSize(n: number): Promise<void> {
    const sel = this.page!.locator('.el-pagination__sizes .el-select').first();
    await sel.waitFor({ state: 'visible', timeout: 10000 });
    await sel.click();
    const option = this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: `${n}/page` }).first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    const wait = this.page!.waitForResponse((r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 120000 }).catch(() => null);
    await option.click();
    await wait;
    await this.waitQuerySettled();
  }

  protected async firstRowSignature(): Promise<string> {
    const row = this.page!.locator('.el-table__body-wrapper tbody tr').first();
    if (!(await row.count())) return '';
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
  }

  protected async gotoPage(n: number): Promise<void> {
    const before = await this.firstRowSignature();
    await this.page!.locator('.el-pager li', { hasText: new RegExp(`^\\s*${n}\\s*$`) }).first().click();
    await this.page!.waitForFunction(
      (prev) => {
        const tr = document.querySelector('.el-table__body-wrapper tbody tr');
        const now = tr ? (tr as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '';
        return now !== '' && now !== prev;
      },
      before,
      { timeout: 180000 }
    );
    await this.page!.locator('.el-loading-mask').first().waitFor({ state: 'hidden', timeout: 180000 }).catch(() => undefined);
  }

  protected async nextPage(): Promise<void> {
    await this.gotoPage((await this.pagerNumbers()).indexOf(String((await this.pagerNumbers()).length)) + 2);
  }

  /** 点击导出并按响应体留证；下载事件仅作文件名证据（headless-shell 的 blob 下载会取消）。 */
  protected async clickDownload(buttonName: RegExp | string, timeout = 120000): Promise<DownloadResult> {
    const dlP = this.page!.waitForEvent('download', { timeout }).catch(() => null);
    await this.page!.getByRole('button', { name: buttonName }).first().click();
    const dl = await dlP;
    if (!dl) throw new Error(`点击「${String(buttonName)}」未触发文件下载`);
    const file = await dl.path().catch(() => null);
    if (!file) throw new Error(`下载文件无法落盘：${dl.suggestedFilename()}`);
    return { filename: dl.suggestedFilename(), buffer: readFileSync(file), downloadEvented: true };
  }

  protected async exportDownload(timeout = 120000): Promise<DownloadResult> {
    this.downloadBuffers.clear();
    const respPromise = this.page!.waitForResponse((r) => r.url().includes('/stats/query/download'), { timeout }).catch(() => null);
    const dlPromise = this.page!.waitForEvent('download', { timeout }).catch(() => null);
    await this.page!.getByRole('button', { name: /导出报表|^导出$/ }).first().click();
    const resp = await respPromise;
    const dl = await dlPromise;
    if (resp) {
      const buffer = await resp.body();
      const disposition = resp.headers()['content-disposition'] ?? '';
      const filename = (dl?.suggestedFilename()) || decodeURIComponent((disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? disposition.match(/filename="?([^";]+)"?/)?.[1] ?? '').trim());
      return { filename, buffer, downloadEvented: !!dl };
    }
    if (dl) {
      const stream = await dl.createReadStream().catch(() => null);
      if (stream) {
        const chunks: Buffer[] = [];
        for await (const ch of stream) chunks.push(ch as Buffer);
        return { filename: dl.suggestedFilename(), buffer: Buffer.concat(chunks), downloadEvented: true };
      }
    }
    throw new Error('导出未触发下载或未捕获到导出响应');
  }

  protected async apiCall(path: string, method = 'GET', body?: unknown): Promise<{ status: number; text: string }> {
    return this.page!.evaluate(async ({ p, m, b }) => {
      const m0 = document.cookie.match(/vue_admin_template_token=([^;]+)/);
      const token = m0 ? m0[1] : '';
      const r = await fetch('https://m-api.test.lita.game' + p, {
        method: m,
        headers: { accesstoken: token, 'Content-Type': 'application/json' },
        body: b === undefined ? undefined : JSON.stringify(b)
      });
      return { status: r.status, text: (await r.text()).slice(0, 500000) };
    }, { p: path, m: method, b: body });
  }
}
