/**
 * Lita Admin 3716「拍拍模式流水-主播维度」UI 测试基类。
 *
 * 环境：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 执行机直连 m-api.test.lita.game 被边缘 WAF 403；仅做网络层同源原样转发：
 *   m-api → https://funbit-mgr.test.cinta.team（/data-main/ 前缀 → https://api.test.cinta.team），
 *   不修改任何业务参数、不注入响应（《ADMIN 测试代码开发规范》R1 例外条款）。
 * - 账号密码仅运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD 注入，不写入代码、日志、证据。
 *
 * 等待策略：全部使用可观测条件（元素可见/输入值/响应事件/loading 消失/表格落定），
 * 不使用固定 sleep 作为断言前置条件。
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
  private lastQueryAt = 0;

  constructor(slug: string) {
    super();
    this.slug = slug;
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${stamp()}`)));
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    this.browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu'] });
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

  /** WAF 同源原样转发：仅网络层，路径/方法/头/体保持一致，不注入响应。 */
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
        // 使用 Playwright 网络栈转发（真实请求，不注入响应），避免 Node fetch 连接池复用导致挂起。
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
    await this.page!.waitForSelector('.el-menu-item', { timeout: 60000 });
  }

  protected async shot(name: string, fullPage = false): Promise<void> {
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${name}.png`);
    await this.page!.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  protected async nav(hash: string): Promise<void> {
    await this.page!.goto(`${UI_BASE}/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page!.waitForSelector('.app-main', { timeout: 30000 });
  }

  /** 等待报表筛选区渲染完成（菜单异步加载/路由懒加载）。 */
  protected async waitReportReady(timeout = 60000): Promise<void> {
    await this.page!.locator('.filter-card').first().waitFor({ state: 'visible', timeout });
    await this.page!.locator('.query-label').first().waitFor({ state: 'visible', timeout });
  }

  /** 等待全部 loading 遮罩消失。 */
  protected async waitNoLoading(timeout = 300000): Promise<void> {
    await this.page!.waitForFunction(() => {
      const visible = Array.from(document.querySelectorAll('.el-loading-mask')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      return visible.length === 0;
    }, undefined, { timeout, polling: 200 });
  }

  /** 等待表格落定：无可见 loading，且出现数据行或空态文案。 */
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

  /** 等待表格数据行数为指定值。 */
  protected async waitRowCount(expected: number, timeout = 300000): Promise<void> {
    await this.page!.waitForFunction((n) => {
      return document.querySelectorAll('.el-table__body-wrapper tbody tr').length === n;
    }, expected, { timeout, polling: 200 });
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
      }, title, { timeout: 10000 });
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

  /** 在指定筛选项（按 .query-label 文本）内填入日期并提交，等待输入框值生效。 */
  protected async setDateValue(label: string, value: string): Promise<boolean> {
    const field = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
    const input = field.locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    const handle = await input.elementHandle();
    await this.page!.waitForFunction(([el, v]) => (el as HTMLInputElement).value === v, [handle, value] as const, { timeout: 10000 });
    await this.page!.keyboard.press('Escape');
    return (await input.inputValue()) === value;
  }

  /**
   * ODPS 查询节流（环境适配）：连续统计查询间隔不足 20s 时后端偶发 502。
   * 仅作为两次查询之间的发送节流，不用于等待页面结果；结果仍由响应事件 + 页面落定条件判定。
   */
  protected async queryCooldown(): Promise<void> {
    if (this.lastQueryAt === 0) return;
    const elapsed = Date.now() - this.lastQueryAt;
    if (elapsed < 20000) await new Promise((resolve) => setTimeout(resolve, 20000 - elapsed));
  }

  protected markQuery(): void {
    this.lastQueryAt = Date.now();
  }

  /**
   * 点击「查询」并等待页面出现新的查询结果。
   * 以页面可观察状态（行数/空态/Total 变化）为主，响应事件仅用于记录状态码与节流；
   * 响应事件偶发漏捕时，只要页面已出现新结果即继续（验证仍由各 check 读取页面完成）。
   */
  protected async clickQuery(): Promise<void> {
    await this.queryCooldown();
    const before = {
      total: await this.totalText(),
      rows: (await this.tableRows()).length,
      empty: await this.emptyText()
    };
    const wait = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 300000 }
    ).then((r) => ({ ok: r.ok(), status: r.status() })).catch((e) => ({ ok: false, status: 0, error: (e as Error).message }));
    await this.waitNoLoading();
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    const domWait = this.page!.waitForFunction(([bt, br, be]) => {
      const masks = Array.from(document.querySelectorAll('.el-loading-mask')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (masks.length > 0) return false;
      const rows = document.querySelectorAll('.el-table__body-wrapper tbody tr').length;
      const empty = (document.querySelector('.el-table__empty-text')?.textContent ?? '').trim();
      const total = (document.querySelector('.el-pagination__total')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (rows > 0 && br === 0) return true;
      if (empty.includes('暂无数据') && !be.includes('暂无数据')) return true;
      if (total !== bt && total.length > 0) return true;
      if (rows !== br) return true;
      return false;
    }, [before.total, before.rows, before.empty] as const, { timeout: 300000, polling: 200 });
    // 响应失败（如 502）快速失败，避免空等页面条件；页面条件先达成时继续按页面结果判定。
    const first = await Promise.race([
      wait.then((r) => ({ kind: 'resp' as const, r })),
      domWait.then(() => ({ kind: 'dom' as const }))
    ]);
    if (first.kind === 'resp' && !first.r.ok) {
      this.markQuery();
      throw new Error(`查询接口 HTTP ${first.r.status}${first.r.error ? ` ${first.r.error}` : ''}`);
    }
    const resp = first.kind === 'resp' ? first.r : null;
    this.markQuery();
    if (resp && !resp.ok) throw new Error(`查询接口 HTTP ${resp.status}${resp.error ? ` ${resp.error}` : ''}`);
    await this.waitTableSettled();
  }

  /** 选择下拉筛选项（按选项文案），等待选中值生效。 */
  protected async pickOption(label: string, optionText: string): Promise<void> {
    const field = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
    const select = field.locator('.el-select').first();
    await select.click();
    const dropdown = this.page!.locator('.el-select-dropdown:visible').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    await dropdown.locator('.el-select-dropdown__item', { hasText: optionText }).first().click();
    await dropdown.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    const input = select.locator('input').first();
    const handle = await input.elementHandle();
    await this.page!.waitForFunction(([el, v]) => (el as HTMLInputElement).value === v, [handle, optionText] as const, { timeout: 10000 });
  }

  /** 在指定筛选项填入文本，等待输入框值生效。 */
  protected async fillField(label: string, value: string): Promise<void> {
    const field = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
    const input = field.locator('input, textarea').first();
    await input.fill(value);
    const handle = await input.elementHandle();
    await this.page!.waitForFunction(([el, v]) => (el as HTMLInputElement).value === v, [handle, value] as const, { timeout: 10000 });
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

  /** 分页总数原文（Total N）。 */
  protected async totalText(): Promise<string> {
    return (await this.page!.locator('.el-pagination__total').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  /** 切换每页条数；等待 query 响应与表格落定。 */
  protected async pageSize(n: number): Promise<void> {
    await this.queryCooldown();
    const sel = this.page!.locator('.el-pagination__sizes .el-select').first();
    await sel.waitFor({ state: 'visible', timeout: 10000 });
    await sel.click();
    const dropdown = this.page!.locator('.el-select-dropdown:visible').last();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    const opt = dropdown.locator('.el-select-dropdown__item', { hasText: `${n}/page` }).first();
    const wait = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 300000 }
    ).catch(() => null);
    await opt.click();
    await dropdown.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    const sizeInput = this.page!.locator('.el-pagination__sizes .el-select input').first();
    const handle = await sizeInput.elementHandle();
    await this.page!.waitForFunction(([el, v]) => {
      const masks = Array.from(document.querySelectorAll('.el-loading-mask')).filter((m) => {
        const rect = (m as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(m);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      return masks.length === 0 && ((el as HTMLInputElement).value ?? '').includes(String(v));
    }, [handle, `${n}/page`] as const, { timeout: 300000, polling: 200 });
    const resp = await wait;
    this.markQuery();
    if (resp && !resp.ok()) throw new Error(`分页查询 HTTP ${resp.status()}`);
    await this.waitTableSettled();
  }

  /** 分页初始/当前状态：Total、上/下一页与每页条数是否禁用。 */
  protected async paginationState(): Promise<{ total: string; prevDisabled: boolean; nextDisabled: boolean; sizeDisabled: boolean }> {
    const total = await this.totalText();
    const prev = this.page!.locator('.el-pagination .btn-prev').first();
    const next = this.page!.locator('.el-pagination .btn-next').first();
    const prevDisabled = (await prev.count()) > 0 && await prev.evaluate((el) => (el as HTMLButtonElement).disabled || el.classList.contains('disabled')).catch(() => false);
    const nextDisabled = (await next.count()) > 0 && await next.evaluate((el) => (el as HTMLButtonElement).disabled || el.classList.contains('disabled')).catch(() => false);
    const size = this.page!.locator('.el-pagination__sizes .el-select').first();
    const sizeDisabled = (await size.count()) > 0 && await size.evaluate((el) =>
      el.classList.contains('is-disabled') || !!el.querySelector('input[disabled]')).catch(() => false);
    return { total, prevDisabled, nextDisabled, sizeDisabled };
  }

  /** 当前可见 loading 遮罩数量。 */
  protected async loadingCount(): Promise<number> {
    return this.page!.locator('.el-loading-mask:visible').count();
  }

  /** 面包屑文本（归一化空白）。 */
  protected async breadcrumb(): Promise<string> {
    return (await this.page!.locator('.el-breadcrumb').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  protected async emptyText(): Promise<string> {
    return (await this.page!.locator('.el-table__empty-text').innerText().catch(() => '')).trim();
  }

  /** 当前已设置查询条件数量；页面未展示计数时返回 -1。 */
  protected async conditionCount(): Promise<number> {
    const text = await this.page!.locator('.app-main').innerText().catch(() => '');
    const m = text.match(/当前已设置查询条件[：:]\s*(\d+)\s*项/);
    return m ? Number(m[1]) : -1;
  }

  /** 等待条件计数达到期望值（日期/筛选录入后的可观测落定条件）。 */
  protected async waitConditionCount(expected: number, timeout = 15000): Promise<void> {
    await this.page!.waitForFunction((n) => {
      const text = document.querySelector('.app-main')?.textContent ?? '';
      const m = text.match(/当前已设置查询条件[：:]\s*(\d+)\s*项/);
      return !!m && Number(m[1]) === n;
    }, expected, { timeout, polling: 200 });
  }

  /** 点击「重置」并等待回到首屏等待空态。 */
  protected async reset(): Promise<void> {
    await this.waitNoLoading();
    await this.page!.getByRole('button', { name: '重置', exact: true }).click();
    await this.page!.getByText('请输入查询条件后查看数据', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
    await this.waitConditionCount(0);
    await this.waitNoLoading(15000);
  }
}
