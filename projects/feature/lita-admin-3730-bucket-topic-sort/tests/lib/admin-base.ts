/**
 * 项目 3730「ADMIN 调整群分桶的排序」UI 测试基类。
 *
 * 环境：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 执行机直连 m-api.test.lita.game 被边缘 WAF 403（登录/init 均 403），按《ADMIN 测试代码开发规范》R1 例外做
 *   浏览器层同源原样转发：/admin/* 与其它前缀 → https://funbit-mgr.test.cinta.team；
 *   /admin-main/*、/data-main/* → https://api.test.cinta.team（平台网关）。
 *   /admin-main/* 在平台网关上要求 l-user-token + l-user-id 鉴权头，转发时以本次真实登录会话的
 *   accesstoken / 会话用户 id 做等价头映射（同一会话身份，不改 URL、业务参数与响应体；仅网络层鉴权适配，
 *   已在 TEST_REPORT/EVIDENCE 声明）。不 mock、不注入任何响应。
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
const GATEWAY_BASE = (process.env.SCRIPT_DATA_MAIN_BASE ?? 'https://api.test.cinta.team').replace(/\/+$/, '');

export const BUCKET_LIST_HASH = '#/system-cloud-control/bucket-group/list';
export const BUCKET_LIST_URL = `${UI_BASE}/${BUCKET_LIST_HASH}`;

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
    .replace(/("l-user-token"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/(cookie\s*:\s*)[^\n]+/gi, '$1***');
}

export interface ApiCall {
  seq: number;
  time: string;
  method: string;
  path: string;
  status?: number;
  responseBody?: string;
  responseSize?: number;
}

const SKIP_REQ_HEADERS = new Set([
  'host', 'content-length', 'accept-encoding', 'connection', 'origin', 'referer',
  'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest', 'accept-language', 'priority', 'user-agent'
]);

export interface BucketRow {
  topic: string;
  description: string;
  ruleCount: string;
  createTime: string;
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
  protected messages: string[] = [];
  private callSeq = 0;
  private shotNo = 0;
  private loginUserId = '1';

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

  /** WAF 同源原样转发（仅网络层；不改 URL 业务参数、不改请求/响应体）。 */
  private async installRoutes(): Promise<void> {
    await this.context!.route('https://m-api.test.lita.game/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers())) {
        if (!SKIP_REQ_HEADERS.has(k)) headers[k] = v;
      }
      const isGateway = url.pathname.startsWith('/admin-main/') || url.pathname.startsWith('/data-main/');
      if (isGateway && headers['accesstoken']) {
        // 平台网关 /admin-main/* 要求 l-user-token + l-user-id；等价映射本次真实登录会话，不引入其它身份。
        headers['l-user-token'] = headers['accesstoken'];
        headers['l-user-id'] = this.loginUserId;
      }
      const target = (isGateway ? GATEWAY_BASE : FWD_BASE) + url.pathname + url.search;
      try {
        const resp = await route.fetch({
          url: target,
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
    if (url.includes('/admin/login')) {
      try {
        const parsed = JSON.parse(body) as { data?: { id?: string | number; sessionUserId?: string | number } };
        const uid = parsed.data?.sessionUserId ?? parsed.data?.id;
        if (uid !== undefined) this.loginUserId = String(uid);
      } catch { /* 登录响应非 JSON 时保持默认，不影响后续页面执行 */ }
    }
    this.calls.push({
      seq: ++this.callSeq,
      time: new Date().toISOString(),
      method: response.request().method(),
      path: url.replace(UI_BASE, '').slice(0, 200),
      status: response.status(),
      responseBody: mask(body).slice(0, 800),
      responseSize: body.length
    });
  }

  protected writeRunLog(): void {
    writeFileSync(join(this.evidenceDir, 'run.json'), JSON.stringify({
      slug: this.slug,
      startedAt: new Date().toISOString(),
      screenshots: this.screenshots,
      notes: this.notes,
      messages: this.messages,
      apiCalls: this.calls
    }, null, 2), 'utf8');
  }

  /** 真实登录（浏览器表单），登录接口非 200 即失败，不做会话桩。 */
  protected async login(user: string, password: string): Promise<void> {
    if (!user || !password) throw new Error('缺少运行时账号环境变量，禁止使用会话桩替代登录');
    await this.page!.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page!.waitForSelector('input', { timeout: 60000 });
    await this.page!.getByPlaceholder(/username/i).fill(user);
    await this.page!.getByPlaceholder(/password/i).fill(password);
    const respP = this.page!.waitForResponse((r) => r.url().includes('/admin/login'), { timeout: 60000 });
    await this.page!.getByRole('button', { name: /login/i }).first().click();
    const resp = await respP;
    if (resp.status() !== 200) throw new Error(`登录接口 HTTP ${resp.status()}`);
    await this.page!.waitForFunction(() => !location.hash.includes('/login'), undefined, { timeout: 60000 });
    await this.page!.waitForSelector('.el-menu-item', { timeout: 60000 });
  }

  protected async shot(name: string, fullPage = false): Promise<void> {
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${name}.png`);
    await this.page!.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  /** 对被验证元素截图（关键检查点留痕）。 */
  protected async shotEl(selector: string, name: string): Promise<void> {
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${name}.png`);
    try {
      await this.page!.locator(selector).first().screenshot({ path: file });
    } catch {
      await this.page!.screenshot({ path: file, fullPage: true });
    }
    this.screenshots.push(file);
  }

  /** 收集当前可见的 Element 消息（Toast 瞬态提示，动作后立即读取）。 */
  protected async drainMessages(): Promise<string[]> {
    const texts = (await this.page!.locator('.el-message').allInnerTexts().catch(() => []))
      .map((t) => t.trim()).filter(Boolean);
    for (const t of texts) {
      if (!this.messages.includes(t)) this.messages.push(t);
    }
    return texts;
  }

  /** 本次运行累计的提示文案（含所有瞬态消息）。 */
  protected allMessages(): string[] {
    return [...this.messages];
  }

  /** 登录后经左侧菜单进入「系统控制 - 分桶分群 - 桶的清单」。 */
  /** 展开左侧子菜单（已展开时不重复点击，避免手风琴折叠）。 */
  protected async openSubmenu(title: string): Promise<void> {
    const titleLoc = this.page!.locator('.el-submenu__title', { hasText: title }).first();
    await titleLoc.waitFor({ state: 'visible', timeout: 30000 });
    const opened = await titleLoc.evaluate((el) => !!el.parentElement?.classList.contains('is-opened'));
    if (opened) return;
    await titleLoc.click();
    await this.page!.waitForFunction((text) => {
      const el = Array.from(document.querySelectorAll('.el-submenu__title')).find((n) => (n.textContent ?? '').includes(text));
      return !!el && !!el.parentElement?.classList.contains('is-opened');
    }, title, { timeout: 15000 });
  }

  protected async openBucketListViaMenu(): Promise<void> {
    await this.openSubmenu('系统控制');
    await this.openSubmenu('分桶分群');
    const leaf = this.page!.locator('.el-menu-item', { hasText: '桶的清单' }).first();
    await leaf.waitFor({ state: 'visible', timeout: 15000 });
    await leaf.click();
    await this.page!.waitForFunction(() => location.hash.includes('/system-cloud-control/bucket-group/list'), undefined, { timeout: 30000 });
    await this.waitTableSettled();
    await this.waitRowsPresent();
  }

  /** 等待列表出现数据行（页面数据渲染完成；用于导航后避免把加载中的空表误判为最终状态）。 */
  protected async waitRowsPresent(timeout = 30000): Promise<void> {
    await this.page!.waitForFunction(() => document.querySelectorAll('.el-table__body-wrapper tbody tr').length > 0, undefined, { timeout, polling: 150 });
  }

  /** 经地址栏直达分桶列表（仅无权限族/直达场景使用）。 */
  protected async gotoBucketListByUrl(): Promise<void> {
    await this.page!.goto(BUCKET_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page!.waitForFunction(() => !location.hash.includes('/login'), undefined, { timeout: 30000 });
  }

  /** 等待表格落定：无可见 loading，且出现数据行或空态文案。 */
  protected async waitTableSettled(timeout = 60000): Promise<void> {
    await this.page!.waitForFunction(() => {
      const masks = Array.from(document.querySelectorAll('.el-loading-mask')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (masks.length > 0) return false;
      const rows = document.querySelectorAll('.el-table__body-wrapper tbody tr').length;
      const empty = (document.querySelector('.el-table__empty-text')?.textContent ?? '').trim();
      return rows > 0 || empty.length > 0;
    }, undefined, { timeout, polling: 150 });
  }

  /** 读取表格数据行（主表，二维文本）。 */
  protected async readRows(): Promise<string[][]> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').evaluateAll((trs) =>
      trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()))
    );
  }

  /** 表格 Topic 列自上而下显示值。 */
  protected async readTopics(): Promise<string[]> {
    return (await this.readRows()).map((cells) => cells[0] ?? '');
  }

  /** 表格显示值快照（Topic/描述/规则数/创建时间）。 */
  protected async readSnapshot(): Promise<BucketRow[]> {
    return (await this.readRows()).map((cells) => ({
      topic: cells[0] ?? '',
      description: cells[1] ?? '',
      ruleCount: cells[2] ?? '',
      createTime: cells[3] ?? ''
    }));
  }

  /** 表头序列（主表 + 右固定列「操作」）。 */
  protected async readHeaders(): Promise<string[]> {
    const main = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const fixed = (await this.page!.locator('.el-table__fixed-header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    return [...main, ...fixed];
  }

  protected async emptyText(): Promise<string> {
    return (await this.page!.locator('.el-table__empty-text').innerText().catch(() => '')).trim();
  }

  protected async paginationCount(): Promise<number> {
    return this.page!.locator('.el-pagination').count();
  }

  protected async paginationVisible(): Promise<boolean> {
    const loc = this.page!.locator('.el-pagination');
    if ((await loc.count()) === 0) return false;
    return loc.first().isVisible();
  }

  /** 分页可点击控件（页码/上一页/下一页）数量。 */
  protected async pagerControlCount(): Promise<number> {
    return this.page!.locator('.el-pagination .el-pager li, .el-pagination .btn-prev, .el-pagination .btn-next').count();
  }

  /** 表头排序控件数量（caret/sort-trigger/is-sortable）。 */
  protected async sortControlCount(): Promise<number> {
    return this.page!.locator('.el-table__header-wrapper .caret-wrapper, .el-table__header-wrapper .sort-trigger, .el-table__header-wrapper th.is-sortable, .el-table__fixed-header-wrapper .caret-wrapper').count();
  }

  /** 点击表头（按列名）。 */
  protected async clickHeader(name: string): Promise<void> {
    await this.page!.locator('.el-table__header-wrapper th', { hasText: name }).first().click();
  }

  protected async keywordInput(): Promise<void> {
    await this.page!.locator('input[placeholder="Topic 关键词（前端过滤）"]').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  protected async fillKeyword(value: string): Promise<void> {
    const input = this.page!.locator('input[placeholder="Topic 关键词（前端过滤）"]').first();
    await input.fill(value);
    const handle = await input.elementHandle();
    await this.page!.waitForFunction(([el, v]) => (el as HTMLInputElement).value === v, [handle, value] as const, { timeout: 15000 });
  }

  protected async keywordValue(): Promise<string> {
    return this.page!.locator('input[placeholder="Topic 关键词（前端过滤）"]').first().inputValue();
  }

  protected async clickSearch(): Promise<void> {
    await this.page!.getByRole('button', { name: 'Search' }).first().click();
    await this.waitTableSettled();
    await this.drainMessages();
  }

  protected async clickReset(): Promise<void> {
    const wait = this.page!.waitForResponse((r) => r.url().includes('/admin-main/bucket/topic/list'), { timeout: 60000 }).catch(() => null);
    await this.page!.getByRole('button', { name: 'Reset' }).first().click();
    await wait;
    await this.waitTableSettled();
    await this.drainMessages();
  }

  protected async openAddDialog(): Promise<void> {
    await this.page!.getByRole('button', { name: '新增 Topic' }).first().click();
    await this.page!.locator('.el-dialog__title', { hasText: '新增 Topic' }).first().waitFor({ state: 'visible', timeout: 15000 });
  }

  protected async fillAddForm(topic: string, description: string): Promise<void> {
    const dialog = this.page!.locator('.el-dialog').filter({ has: this.page!.locator('.el-dialog__title', { hasText: '新增 Topic' }) }).first();
    await dialog.locator('input[placeholder="不可重复，如 user-voice-ai-call"]').fill(topic);
    await dialog.locator('textarea[placeholder="可选，topic 描述"]').fill(description);
  }

  /** 提交新增表单并等待结果（弹窗关闭或错误提示），不做静默兜底。 */
  protected async submitAdd(): Promise<void> {
    const dialog = this.page!.locator('.el-dialog').filter({ has: this.page!.locator('.el-dialog__title', { hasText: '新增 Topic' }) }).first();
    const respP = this.page!.waitForResponse((r) => r.url().includes('/admin-main/bucket/topic/add'), { timeout: 60000 }).catch(() => null);
    await dialog.getByRole('button', { name: '确定' }).first().click();
    const resp = await respP;
    if (resp && !resp.ok()) throw new Error(`新增接口 HTTP ${resp.status()}`);
    const closed = await dialog.waitFor({ state: 'hidden', timeout: 15000 }).then(() => true).catch(() => false);
    if (!closed) {
      const msgs = await this.drainMessages();
      throw new Error(`新增未完成：${msgs.join(' / ') || '弹窗未关闭'}`);
    }
    await this.waitTableSettled();
    await this.drainMessages();
  }

  protected async addTopic(topic: string, description: string): Promise<void> {
    await this.openAddDialog();
    await this.fillAddForm(topic, description);
    await this.submitAdd();
  }

  protected async dialogVisible(): Promise<boolean> {
    const dialog = this.page!.locator('.el-dialog').filter({ has: this.page!.locator('.el-dialog__title', { hasText: '新增 Topic' }) }).first();
    if ((await dialog.count()) === 0) return false;
    return dialog.isVisible();
  }

  protected async cancelAddDialog(): Promise<void> {
    const dialog = this.page!.locator('.el-dialog').filter({ has: this.page!.locator('.el-dialog__title', { hasText: '新增 Topic' }) }).first();
    await dialog.getByRole('button', { name: '取消' }).first().click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
  }

  /** 行内按钮定位：主表第 n 行的操作列在右固定表内，按行下标对应。 */
  private async fixedRowByTopic(topic: string): Promise<ReturnType<Page['locator']>> {
    const topics = await this.readTopics();
    const idx = topics.indexOf(topic);
    if (idx < 0) throw new Error(`列表未找到行：${topic}`);
    const fixedRows = this.page!.locator('.el-table__fixed-right .el-table__fixed-body-wrapper tbody tr');
    const count = await fixedRows.count();
    if (count !== topics.length) throw new Error(`固定列行数(${count})与主表行数(${topics.length})不一致`);
    return fixedRows.nth(idx);
  }

  /** 点击行内「删除」并等待二次确认弹窗，返回弹窗原文。 */
  protected async clickDelete(topic: string): Promise<string> {
    const row = await this.fixedRowByTopic(topic);
    await row.getByRole('button', { name: '删除' }).first().click();
    const box = this.page!.locator('.el-message-box');
    await box.waitFor({ state: 'visible', timeout: 15000 });
    return (await box.innerText()).replace(/\s*\n\s*/g, ' ').trim();
  }

  protected async confirmDelete(): Promise<void> {
    const box = this.page!.locator('.el-message-box');
    const respP = this.page!.waitForResponse((r) => r.url().includes('/admin-main/bucket/topic/delete'), { timeout: 60000 }).catch(() => null);
    await box.getByRole('button', { name: '确认删除' }).first().click();
    const resp = await respP;
    if (resp && !resp.ok()) throw new Error(`删除接口 HTTP ${resp.status()}`);
    await box.waitFor({ state: 'hidden', timeout: 15000 });
    await this.waitTableSettled();
    await this.drainMessages();
  }

  protected async cancelDelete(): Promise<void> {
    const box = this.page!.locator('.el-message-box');
    await box.getByRole('button', { name: '取消' }).first().click();
    await box.waitFor({ state: 'hidden', timeout: 15000 });
    await this.drainMessages();
  }

  /** 点击行内「详情」并等待详情路由。 */
  protected async clickDetail(topic: string): Promise<void> {
    const row = await this.fixedRowByTopic(topic);
    await row.getByRole('button', { name: '详情' }).first().click();
    await this.page!.waitForFunction(() => location.hash.includes('/bucket-group/detail'), undefined, { timeout: 30000 });
  }

  /** 无权限账号登录后的菜单文本（全量）。 */
  protected async sidebarText(): Promise<string> {
    const side = this.page!.locator('.sidebar-container');
    if ((await side.count()) === 0) return '';
    return side.innerText();
  }

  protected async menuItemVisible(text: string): Promise<boolean> {
    const loc = this.page!.locator('.el-menu-item', { hasText: text });
    if ((await loc.count()) === 0) return false;
    return loc.first().isVisible().catch(() => false);
  }

  protected async submenuVisible(text: string): Promise<boolean> {
    const loc = this.page!.locator('.el-submenu__title', { hasText: text });
    if ((await loc.count()) === 0) return false;
    return loc.first().isVisible().catch(() => false);
  }

  /** 当前可见错误提示（Request failed / 请先登录 / 失败 / 异常 / 未授权 等）。 */
  protected errorMessages(): string[] {
    return this.messages.filter((t) => /request failed|请先登录|失败|异常|未授权|error/i.test(t));
  }

  /** 页面通用文本（正文）。 */
  protected async bodyText(): Promise<string> {
    return (await this.page!.locator('body').innerText()).replace(/\s*\n\s*/g, ' | ').trim();
  }
}
