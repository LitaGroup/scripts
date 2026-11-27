/**
 * 项目 3744 / BL-0057：铭牌管理「是否是大铭牌」字段级独立权限 UI 测试基类（项目内私有，基于平台标准 ADMIN 基类范式演进，不跨项目 import）。
 *
 * 用例来源：TK-0764 HANDOFF v3（13 条九列用例）；技术方案：/98-tasks/20261127/764/TECH_DESIGN（v2）。
 * 环境：UI https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）。
 * 网关：本环境直连 m-api.test.lita.game 返回 401/403，默认启用 WAF 同源原样转发（ENABLE_WAF_FORWARD=0 可关闭）：
 *       /admin/*、/api/*、/voiceroom/*、/common/* -> SCRIPT_API_BASE（funbit-mgr），/data-main/* -> SCRIPT_DB_API；
 *       转发仅删除 host/content-length 等传输头，不改请求/响应体，并在 run.json 留痕（R1 唯一例外）。
 * 账号：qa-ai（admin 正向/管理侧）、qa-noauth（零权限，仅 #11/#12，绝不改权）。
 *       字段级专用角色/账号 qa_bigflag_<runId> / qa_bigflag_user_<runId> 按需求方 A 方案在测试环境页面级构造，
 *       运行态密码仅保存在 TMPDIR 临时状态文件（600，不提交、不写入证据/报告），执行结束删除账号与角色。
 * 会话：每账号真实 UI 登录 1 次并保存 storageState；每条用例通过 newContext({ storageState }) 独立上下文，杜绝串扰。
 * 断言：全部读取页面实时 DOM；禁止接口/SQL 断言、mock 业务接口、固定盲等待、force 点击、吞错与放宽断言。
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync, chmodSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { CheckBaseClass } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');
const FWD_BASE = (process.env.SCRIPT_API_BASE ?? 'https://funbit-mgr.test.cinta.team').replace(/\/+$/, '');
const DB_BASE = (process.env.SCRIPT_DB_API ?? 'https://api.test.cinta.team').replace(/\/+$/, '');
export const PAGE_HASH = '#/effect-manager/name-plate';
export const PAGE_URL = `${UI_BASE}/${PAGE_HASH}`;
export const ROLE_HASH = '#/permission/role';
export const ROLE_URL = `${UI_BASE}/${ROLE_HASH}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP_ROOT = resolve(process.env.TMPDIR ?? join(process.cwd(), '.tmp-playwright'));
mkdirSync(TMP_ROOT, { recursive: true });
process.env.TMPDIR = TMP_ROOT;

const SKIP_HEADERS = new Set(['host', 'content-length', 'accept-encoding', 'connection']);

export function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function mask(text: string): string {
  return text
    .replace(/("accessToken"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/("accesstoken"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/("pwd"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/("password"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/("token"\s*:\s*")[^"]+/gi, '$1***')
    .replace(/(cookie\s*:\s*)[^\n]+/gi, '$1***')
    .replace(/vue_admin_template_token=[^;\s]+/g, 'vue_admin_template_token=***');
}

/** 解析 --case=1,3；未指定返回空集合（表示本文件全部）。 */
export function parseSelectedCases(): Set<number> {
  const raw = arg('case', '');
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0));
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface PlateRecord {
  desc: string;
  id: string;
  bigFlag: '是' | '否';
  type: string;
  runCase: number;
  createdAt: string;
}

export interface RunState {
  runId: string;
  roleName: string;
  userName: string;
  specialPassword: string;
  createdRole: boolean;
  createdAccount: boolean;
  plates: Record<string, PlateRecord>;
  notes: string[];
}

export function statePathFor(runId: string): string {
  return join(TMP_ROOT, 'qa-bigflag-state', `state-${runId}.json`);
}

export function loadRunState(runId: string): RunState {
  const file = statePathFor(runId);
  if (existsSync(file)) {
    const s = JSON.parse(readFileSync(file, 'utf8')) as RunState;
    s.plates ??= {};
    s.notes ??= [];
    return s;
  }
  return {
    runId,
    roleName: `qa_bigflag_${runId}`,
    userName: `qa_bigflag_user_${runId}`,
    specialPassword: '',
    createdRole: false,
    createdAccount: false,
    plates: {},
    notes: [],
  };
}

export function saveRunState(state: RunState): void {
  const file = statePathFor(state.runId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
  chmodSync(file, 0o600);
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

export abstract class AdminBase extends CheckBaseClass {
  protected readonly slug: string;
  protected readonly runId: string;
  protected readonly evidenceDir: string;
  protected readonly state: RunState;
  protected selected: Set<number> = new Set();
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected calls: ApiCall[] = [];
  protected screenshots: string[] = [];
  protected notes: string[] = [];
  protected pageErrors: string[] = [];
  protected cleanupResults: Array<{ title: string; ok: boolean; message: string }> = [];
  protected readonly aiStateFile: string;
  protected readonly noauthStateFile: string;
  protected readonly specialStateFile: string;
  private callSeq = 0;
  private shotNo = 0;
  private startedAt = new Date().toISOString();
  private cleanupTasks: Array<{ title: string; fn: () => Promise<void> | void }> = [];

  /**
   * @param slug 证据目录标识
   * @param checkpoints 用例# -> 检查点数（参数化数据行已展开），用于 --case 过滤时精确计算 total
   */
  constructor(slug: string, checkpoints: Record<number, number>) {
    super();
    this.slug = slug;
    this.runId = arg('run-id', stamp());
    this.selected = parseSelectedCases();
    const all = Object.keys(checkpoints).map(Number);
    if (this.selected.size > 0) {
      for (const n of this.selected) {
        if (!(n in checkpoints)) throw new Error(`--case=${n} 不属于本文件（可用：${all.join(',')}）`);
      }
    }
    const keys = this.selected.size > 0 ? [...this.selected] : all;
    this.total = keys.reduce((sum, n) => sum + (checkpoints[n] ?? 0), 0);
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `${slug}-${this.runId}-${stamp()}`)));
    this.state = loadRunState(this.runId);
    mkdirSync(this.evidenceDir, { recursive: true });
    this.aiStateFile = join(TMP_ROOT, 'qa-bigflag-state', `ai-${this.runId}.json`);
    this.noauthStateFile = join(TMP_ROOT, 'qa-bigflag-state', `noauth-${this.runId}.json`);
    this.specialStateFile = join(TMP_ROOT, 'qa-bigflag-state', `special-${this.runId}.json`);
    mkdirSync(dirname(this.aiStateFile), { recursive: true });
  }

  protected wants(n: number): boolean {
    return this.selected.size === 0 || this.selected.has(n);
  }

  protected checkpointCount(n: number): number {
    return 0;
  }

  async execute(): Promise<void> {
    this.startedAt = new Date().toISOString();
    this.browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'] });
    try {
      await super.execute();
    } finally {
      await this.runCleanup();
      this.writeRunLog();
      await this.context?.close().catch(() => undefined);
      await this.browser?.close().catch(() => undefined);
      this.log(`证据目录: ${this.evidenceDir.replace(/\\/g, '/')}`);
    }
  }

  // ---------------- 登录与会话 ----------------

  /** 真实 UI 登录一次并保存 storageState；仅对基础设施类失败（非断言）重试，且保留每次失败记录。 */
  protected async loginAndSaveState(user: string | undefined, pwd: string | undefined, stateFile: string, label: string): Promise<void> {
    if (!user || !pwd) throw new Error(`缺少运行时账号环境变量（${label}）`);
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const ctx = await this.browser!.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true });
      await this.installRoutes(ctx);
      const page = await ctx.newPage();
      try {
        await page.goto(`${UI_BASE}/#/login`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForSelector('input[name="username"]', { timeout: 60000 });
        await page.locator('input[name="username"]').fill(user);
        await page.locator('input[name="password"]').fill(pwd);
        const respPromise = page.waitForResponse((r) => r.url().includes('/admin/login'), { timeout: 60000 });
        await page.locator('button.el-button--primary').first().click();
        const resp = await respPromise;
        const body = await resp.text().catch(() => '');
        if (resp.status() !== 200 || !/"status"\s*:\s*"?0"?/.test(body)) {
          throw new Error(`登录失败：HTTP ${resp.status()} body=${mask(body).slice(0, 200)}`);
        }
        await page.waitForFunction(() => !location.hash.includes('/login'), undefined, { timeout: 60000 });
        await page.waitForSelector('.el-menu-item', { timeout: 60000 });
        await ctx.storageState({ path: stateFile });
        this.log(`登录成功并保存会话：${label}（第 ${attempt} 次尝试）`);
        return;
      } catch (e) {
        lastError = e as Error;
        this.notes.push(`登录 ${label} 第 ${attempt} 次失败：${lastError.message}`);
        if (attempt < 2) await delay(5000);
      } finally {
        await ctx.close().catch(() => undefined);
      }
    }
    throw new Error(`登录失败（${label}，已尝试 2 次）：${lastError?.message ?? 'unknown'}`);
  }

  protected async ensureLoginState(user: string | undefined, pwd: string | undefined, stateFile: string, label: string): Promise<void> {
    if (process.env.REUSE_STATE === '1' && existsSync(stateFile)) {
      const age = Date.now() - statSync(stateFile).mtimeMs;
      if (age < 30 * 60 * 1000) {
        this.log(`复用已保存会话：${label}（${Math.round(age / 1000)}s 前登录）`);
        return;
      }
    }
    await this.loginAndSaveState(user, pwd, stateFile, label);
  }

  /** 创建一条用例专属的独立浏览器上下文（共享已保存登录态，零串扰）。 */
  protected async newCasePage(stateFile: string, hash: string, options: { waitTable?: boolean; waitMenu?: boolean } = {}): Promise<Page> {
    if (!existsSync(stateFile)) throw new Error(`缺少 storageState 文件：${stateFile}`);
    await this.closeCasePage();
    this.context = await this.browser!.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true, storageState: stateFile });
    await this.installRoutes(this.context);
    this.page = await this.context.newPage();
    this.bindPage(this.page);
    await this.page.goto(`${UI_BASE}/${hash}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (options.waitTable !== false) await this.waitTableReady(this.page);
    if (options.waitMenu) await this.waitMenuSettled(this.page);
    return this.page;
  }

  /** 额外上下文（用于 #9 等需两个账号同时在线的场景）；调用方负责关闭。 */
  protected async newAuxPage(stateFile: string, hash: string): Promise<{ ctx: BrowserContext; page: Page }> {
    if (!existsSync(stateFile)) throw new Error(`缺少 storageState 文件：${stateFile}`);
    const ctx = await this.browser!.newContext({ viewport: { width: 1680, height: 1050 }, acceptDownloads: true, storageState: stateFile });
    await this.installRoutes(ctx);
    const page = await ctx.newPage();
    this.bindPage(page);
    await page.goto(`${UI_BASE}/${hash}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    return { ctx, page };
  }

  protected async closeCasePage(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    this.page = null;
  }

  /** WAF 同源原样转发（R1 唯一例外；默认启用，因为本环境直连 m-api 返回 401/403）。 */
  private async installRoutes(ctx: BrowserContext): Promise<void> {
    if (process.env.ENABLE_WAF_FORWARD === '0') return;
    await ctx.route('https://m-api.test.lita.game/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers())) {
        if (!SKIP_HEADERS.has(k.toLowerCase())) headers[k] = v;
      }
      const target = url.pathname.startsWith('/data-main/') ? DB_BASE : FWD_BASE;
      try {
        const body = request.postDataBuffer();
        const resp = await route.fetch({
          url: target + url.pathname + url.search,
          method: request.method(),
          headers,
          postData: body ?? undefined,
          timeout: 120000,
          failOnStatusCode: false,
        });
        const respBody = await resp.body();
        const respHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(resp.headers())) {
          if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) respHeaders[k] = v;
        }
        respHeaders['access-control-allow-origin'] = '*';
        await route.fulfill({ status: resp.status(), headers: respHeaders, body: respBody });
      } catch (e) {
        this.notes.push(`WAF 转发失败 ${url.pathname}: ${(e as Error).message}`);
        await route.abort();
      }
    });
    this.notes.push('已启用 WAF 同源原样转发（R1 例外，未修改请求/响应体）');
  }

  private bindPage(page: Page): void {
    page.on('response', (response) => { void this.capture(response); });
    page.on('pageerror', (error) => { this.pageErrors.push(mask(error.message).slice(0, 300)); });
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
      path: url.replace('https://m-api.test.lita.game', '').slice(0, 300),
      status: response.status(),
      requestBody: mask(req.postData() ?? '').slice(0, 3000),
      responseBody: mask(body).slice(0, 2000),
    });
  }

  private writeRunLog(): void {
    writeFileSync(join(this.evidenceDir, 'run.json'), JSON.stringify({
      slug: this.slug,
      runId: this.runId,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      selectedCases: [...this.selected],
      total: this.total,
      screenshots: this.screenshots,
      notes: this.notes,
      pageErrors: this.pageErrors,
      cleanup: this.cleanupResults,
      stateSummary: {
        roleName: this.state.roleName,
        userName: this.state.userName,
        createdRole: this.state.createdRole,
        createdAccount: this.state.createdAccount,
        plates: Object.values(this.state.plates).map((p) => ({ desc: p.desc, id: p.id, bigFlag: p.bigFlag, type: p.type, runCase: p.runCase })),
      },
      apiCalls: this.calls,
    }, null, 2), 'utf8');
  }

  protected addCleanup(title: string, fn: () => Promise<void> | void): void {
    this.cleanupTasks.push({ title, fn });
  }

  private async runCleanup(): Promise<void> {
    for (const task of this.cleanupTasks.reverse()) {
      try {
        await task.fn();
        this.cleanupResults.push({ title: task.title, ok: true, message: '' });
        this.log(`清理完成：${task.title}`);
      } catch (e) {
        const message = (e as Error).message;
        this.cleanupResults.push({ title: task.title, ok: false, message });
        this.log(`清理失败：${task.title} - ${message}`);
      }
    }
  }

  // ---------------- 截图 ----------------

  protected async shot(name: string, fullPage = true, page: Page | null = null): Promise<void> {
    const target = page ?? this.page!;
    const safe = name.replace(/[^\w\u4e00-\u9fa5#①-⑳()[\].-]/g, '_').slice(0, 90);
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${safe}.png`);
    await target.screenshot({ path: file, fullPage });
    this.screenshots.push(file);
  }

  protected async shotEl(locator: string, name: string, page: Page | null = null): Promise<void> {
    const target = page ?? this.page!;
    const safe = name.replace(/[^\w\u4e00-\u9fa5#①-⑳()[\].-]/g, '_').slice(0, 90);
    const file = join(this.evidenceDir, `${String(++this.shotNo).padStart(2, '0')}-${safe}.png`);
    try {
      await target.locator(locator).first().screenshot({ path: file });
    } catch {
      await target.screenshot({ path: file, fullPage: true });
    }
    this.screenshots.push(file);
  }

  // ---------------- 菜单/列表 ----------------

  protected async waitMenuSettled(page: Page, timeout = 20000): Promise<void> {
    await page.locator('.el-menu-item, .el-submenu__title').first().waitFor({ state: 'visible', timeout });
    const started = Date.now();
    let last = -1;
    let stable = 0;
    while (Date.now() - started < timeout) {
      const count = await page.locator('.el-menu-item, .el-submenu__title').count();
      if (count === last) stable++; else { stable = 0; last = count; }
      if (stable >= 6 && Date.now() - started > 1500) return;
      await delay(250);
    }
  }

  protected async waitNoLoading(page: Page, timeout = 60000): Promise<void> {
    const loc = page.locator('.el-loading-mask:visible');
    if (await loc.count() === 0) return;
    await loc.first().waitFor({ state: 'hidden', timeout }).catch(() => undefined);
  }

  protected async waitTableReady(page: Page, timeout = 90000): Promise<void> {
    await page.locator('.el-table__header-wrapper th').first().waitFor({ state: 'visible', timeout });
    await this.waitTableSettled(page, timeout);
  }

  protected async waitTableSettled(page: Page, timeout = 60000): Promise<void> {
    await page.waitForFunction(() => {
      const masks = Array.from(document.querySelectorAll('.el-loading-mask')).filter((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
      });
      if (masks.length > 0) return false;
      const rows = document.querySelectorAll('.el-table__body-wrapper tbody tr').length;
      const empty = (document.querySelector('.el-table__empty-text')?.textContent ?? '').trim();
      return rows > 0 || empty.length > 0;
    }, undefined, { timeout, polling: 200 });
  }

  /** 点击后等待一次真实业务请求（GET/POST 均可，排除登录/权限基础请求）并等待表格落定；不做固定 sleep。 */
  protected async clickAndWaitNetwork(page: Page, locator: ReturnType<Page['locator']>, timeout = 15000): Promise<void> {
    const respP = page.waitForResponse((r) => {
      const u = r.url();
      return u.includes('m-api.test.lita.game') && !/\/admin\/login|\/api\/admin\/privilege/.test(u);
    }, { timeout }).catch(() => null);
    await locator.first().click();
    await respP;
    await this.waitNoLoading(page, timeout);
    await this.waitTableSettled(page, 30000);
  }

  protected async gotoNamePlate(page: Page): Promise<void> {
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await this.waitTableReady(page);
  }

  protected async gotoRoles(page: Page): Promise<void> {
    await page.goto(ROLE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.locator('.el-table__header-wrapper th').first().waitFor({ state: 'visible', timeout: 90000 });
    await this.waitNoLoading(page);
    await this.waitTableSettled(page);
    // 角色表与账号表同页：两表首行均出现后才算就绪（防只等第一张表造成账号误判缺失）
    await page.locator('.el-table').nth(1).locator('.el-table__body-wrapper tbody tr').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
  }

  /** 导航到铭牌管理：兼容专用角色菜单为顶层「铭牌管理」或 qa-ai 的「特效管理」分组两种渲染。 */
  protected async navigateToNamePlate(page: Page): Promise<string> {
    const group = page.locator('.el-submenu__title:visible').filter({ hasText: '特效管理' }).first();
    if (await group.count() > 0) {
      await group.click();
      await delay(300);
      const item = page.locator('.el-menu-item:visible').filter({ hasText: /^铭牌管理$/ }).first();
      await item.waitFor({ state: 'visible', timeout: 10000 });
      await this.clickAndWaitNetwork(page, item);
      await this.waitTableReady(page);
      return 'menu:特效管理>铭牌管理';
    }
    const item = page.locator('.el-menu-item:visible').filter({ hasText: /^铭牌管理$/ }).first();
    await item.waitFor({ state: 'visible', timeout: 10000 });
    await this.clickAndWaitNetwork(page, item);
    await this.waitTableReady(page);
    return 'menu:铭牌管理(顶层)';
  }

  protected async tableHeaders(page: Page = this.page!, index = 0): Promise<string[]> {
    return (await page.locator('.el-table').nth(index).locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim());
  }

  protected async rows(page: Page = this.page!, index = 0): Promise<string[][]> {
    return page.locator('.el-table').nth(index).locator('.el-table__body-wrapper tbody tr').evaluateAll((trs) => trs.map((tr) =>
      Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim())
    ));
  }

  protected async tableRow(page: Page, desc: string, index = 0): Promise<ReturnType<Page['locator']>> {
    return page.locator('.el-table').nth(index).locator('.el-table__body-wrapper tbody tr').filter({ hasText: desc }).first();
  }

  protected async totalCount(page: Page = this.page!): Promise<number> {
    const totalLoc = page.locator('.el-pagination__total');
    if (await totalLoc.count() > 0 && await totalLoc.first().isVisible().catch(() => false)) {
      const t = await totalLoc.first().innerText({ timeout: 3000 }).catch(() => '');
      const m = t.match(/([\d,]+)/);
      if (m) return Number(m[1].replace(/,/g, ''));
    }
    return page.locator('.el-table__body-wrapper tbody tr').count();
  }

  protected async paginationText(page: Page = this.page!): Promise<string> {
    const pag = page.locator('.el-pagination');
    if (await pag.count() === 0 || !(await pag.first().isVisible().catch(() => false))) return '';
    return (await pag.first().innerText({ timeout: 3000 }).catch(() => '')).replace(/\s+/g, ' ').trim();
  }

  protected async searchByDesc(page: Page, desc: string): Promise<void> {
    const input = page.locator('input[placeholder="Des"]').first();
    await input.click();
    await input.fill(desc);
    await this.clickAndWaitNetwork(page, page.getByRole('button', { name: 'Search' }));
  }

  protected async resetFilters(page: Page): Promise<void> {
    await this.clickAndWaitNetwork(page, page.getByRole('button', { name: 'Reset Filters' }));
  }

  protected async searchInputValue(page: Page): Promise<string> {
    return page.locator('input[placeholder="Des"]').first().inputValue();
  }

  // ---------------- 提示与弹窗 ----------------

  protected async toasts(page: Page): Promise<string[]> {
    return (await page.locator('.el-message').allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);
  }

  protected async visibleDialog(page: Page): Promise<ReturnType<Page['locator']>> {
    const dlg = page.locator('.el-dialog__wrapper:visible').last();
    await dlg.waitFor({ state: 'visible', timeout: 15000 });
    return dlg;
  }

  protected dialogItem(dlg: ReturnType<Page['locator']>, page: Page, label: string): ReturnType<Page['locator']> {
    return dlg.locator('.el-form-item').filter({ has: page.locator(`.el-form-item__label:text-is("${label}")`) }).first();
  }

  protected async dialogLabels(dlg: ReturnType<Page['locator']>): Promise<string[]> {
    return (await dlg.locator('.el-form-item__label').allInnerTexts()).map((t) => t.trim());
  }

  protected async openAddDialog(page: Page): Promise<ReturnType<Page['locator']>> {
    await page.getByRole('button', { name: '添加铭牌' }).first().click();
    const dlg = await this.visibleDialog(page);
    await dlg.locator('.el-dialog__title:text-is("New")').first().waitFor({ state: 'visible', timeout: 10000 });
    return dlg;
  }

  protected async openEditDialog(page: Page, desc: string): Promise<ReturnType<Page['locator']>> {
    const row = await this.tableRow(page, desc);
    await row.locator('button:has-text("编辑")').first().click();
    const dlg = await this.visibleDialog(page);
    await dlg.locator('.el-dialog__title:text-is("Edit")').first().waitFor({ state: 'visible', timeout: 10000 });
    return dlg;
  }

  protected async selectElOption(page: Page, scope: ReturnType<Page['locator']>, selectLocator: ReturnType<Page['locator']>, option: string): Promise<string[]> {
    await selectLocator.first().click();
    const dd = page.locator('.el-select-dropdown:not([style*="display: none"])').last();
    await dd.waitFor({ state: 'visible', timeout: 8000 });
    const options = (await dd.locator('.el-select-dropdown__item').allInnerTexts()).map((t) => t.trim());
    await dd.locator('.el-select-dropdown__item').filter({ hasText: new RegExp(`^${escapeRegExp(option)}$`) }).first().click();
    await dd.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined);
    return options;
  }

  protected async plateTypeOptions(page: Page, dlg: ReturnType<Page['locator']>): Promise<string[]> {
    const item = this.dialogItem(dlg, page, '铭牌类型');
    await item.locator('.el-select').first().click();
    const dd = page.locator('.el-select-dropdown:not([style*="display: none"])').last();
    await dd.waitFor({ state: 'visible', timeout: 8000 });
    const options = (await dd.locator('.el-select-dropdown__item').allInnerTexts()).map((t) => t.trim());
    await page.keyboard.press('Escape');
    await dd.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
    return options;
  }

  protected async bigFlagChecked(page: Page, dlg: ReturnType<Page['locator']>): Promise<string> {
    const item = this.dialogItem(dlg, page, '是否是大铭牌');
    return (await item.locator('.el-radio.is-checked').allInnerTexts().catch(() => [])).map((t) => t.trim()).join('|');
  }

  protected async uploadImages(page: Page, dlg: ReturnType<Page['locator']>): Promise<void> {
    const icon = this.dialogItem(dlg, page, '铭牌icon').locator('input[type="file"]').first();
    const thumb = this.dialogItem(dlg, page, '铭牌缩略图').locator('input[type="file"]').first();
    const asset = (name: string) => join(__dirname, '..', 'assets', name);
    const up1 = page.waitForResponse((r) => r.url().includes('/common/giftFileUpload'), { timeout: 60000 });
    await icon.setInputFiles(asset('qa_bigflag_icon.png'));
    await up1;
    const up2 = page.waitForResponse((r) => r.url().includes('/common/giftFileUpload'), { timeout: 60000 });
    await thumb.setInputFiles(asset('qa_bigflag_thumb.png'));
    await up2;
    // 自定义铭牌类型会额外出现「背景图片」上传项（必填，后端校验「必须提交相关资源」）
    const bgItem = this.dialogItem(dlg, page, '背景图片');
    if (await bgItem.count() > 0) {
      const bgInput = bgItem.locator('input[type="file"]').first();
      const up3 = page.waitForResponse((r) => r.url().includes('/common/giftFileUpload'), { timeout: 60000 });
      await bgInput.setInputFiles(asset('qa_bigflag_bg.png'));
      await up3;
      await bgItem.locator('img.avatar').first().waitFor({ state: 'visible', timeout: 15000 });
    }
    await this.dialogItem(dlg, page, '铭牌icon').locator('img.avatar').first().waitFor({ state: 'visible', timeout: 15000 });
    await this.dialogItem(dlg, page, '铭牌缩略图').locator('img.avatar').first().waitFor({ state: 'visible', timeout: 15000 });
  }

  /** 提交弹窗：轮询弹窗关闭；若出现错误提示则带提示抛出（不吞错）。 */
  protected async submitDialog(page: Page, dlg: ReturnType<Page['locator']>, timeout = 20000): Promise<string> {
    await dlg.locator('button:has-text("Confirm")').first().click();
    const started = Date.now();
    let toastText = '';
    while (Date.now() - started < timeout) {
      if (!(await dlg.isVisible().catch(() => false))) return toastText;
      const texts = await this.toasts(page);
      const err = texts.find((t) => /失败|错误|必须|请|不能|异常/.test(t));
      if (err) throw new Error(`提交失败提示：${err}`);
      if (texts.length > 0) toastText = texts.join(' | ');
      await delay(150);
    }
    throw new Error(`提交后弹窗未关闭（${timeout}ms），提示：${(await this.toasts(page)).join(' | ') || '无'}`);
  }

  protected async cancelDialog(page: Page, dlg: ReturnType<Page['locator']>): Promise<void> {
    if (await dlg.isVisible().catch(() => false)) {
      await dlg.locator('button:has-text("Cancel")').first().click();
      await dlg.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    }
  }

  protected async createPlate(page: Page, opts: {
    desc: string;
    type: string;
    bigFlag?: '是' | '否';
    runCase: number;
    sort?: string;
    width?: string;
    height?: string;
  }): Promise<PlateRecord> {
    const dlg = await this.openAddDialog(page);
    let created = false;
    try {
      const options = await this.plateTypeOptions(page, dlg);
      if (!options.includes(opts.type)) throw new Error(`铭牌类型下拉不存在「${opts.type}」，实际选项：${options.join('/')}`);
      await this.selectElOption(page, dlg, this.dialogItem(dlg, page, '铭牌类型').locator('.el-select'), opts.type);
      await this.dialogItem(dlg, page, '铭牌描述').locator('input').first().fill(opts.desc);
      await this.dialogItem(dlg, page, '铭牌排序').locator('input').first().fill(opts.sort ?? '99');
      await this.dialogItem(dlg, page, '铭牌宽度').locator('input').first().fill(opts.width ?? '250');
      await this.dialogItem(dlg, page, '铭牌高度').locator('input').first().fill(opts.height ?? '70');
      await this.uploadImages(page, dlg);
      if (opts.bigFlag) {
        await this.dialogItem(dlg, page, '是否是大铭牌').locator('.el-radio').filter({ hasText: new RegExp(`^${opts.bigFlag}$`) }).first().click();
      }
      await this.shot(`add-${opts.desc}`, true, page);
      await this.submitDialog(page, dlg);
      created = true;
    } finally {
      if (!created) await this.cancelDialog(page, dlg).catch(() => undefined);
    }
    await this.searchByDesc(page, opts.desc);
    const rows = await this.rows(page);
    const hit = rows.find((r) => r[1] === opts.desc);
    if (!hit) throw new Error(`新增后按描述搜索未找到行：${opts.desc}`);
    const record: PlateRecord = {
      desc: opts.desc,
      id: hit[0],
      bigFlag: (hit[7] as '是' | '否'),
      type: hit[6],
      runCase: opts.runCase,
      createdAt: new Date().toISOString(),
    };
    this.state.plates[opts.desc] = record;
    saveRunState(this.state);
    return record;
  }

  protected async ensurePlate(page: Page, key: string, opts: { desc: string; type: string; bigFlag: '是' | '否'; runCase: number }): Promise<PlateRecord> {
    const existing = this.state.plates[opts.desc];
    if (existing) {
      await this.searchByDesc(page, opts.desc);
      const rows = await this.rows(page);
      const hit = rows.find((r) => r[1] === opts.desc);
      if (hit) return { ...existing, id: hit[0], bigFlag: (hit[7] as '是' | '否'), type: hit[6] };
    }
    const rec = await this.createPlate(page, { ...opts, sort: '99' });
    return rec;
  }

  // ---------------- 权限管理页 ----------------

  protected roleRow(page: Page, roleName: string): ReturnType<Page['locator']> {
    return page.locator('.el-table').first().locator('.el-table__body-wrapper tbody tr').filter({ hasText: roleName }).first();
  }

  protected accountRow(page: Page, userName: string): ReturnType<Page['locator']> {
    return page.locator('.el-table').nth(1).locator('.el-table__body-wrapper tbody tr').filter({ hasText: userName }).first();
  }

  protected async createRoleIfMissing(page: Page, roleName: string): Promise<boolean> {
    await this.gotoRoles(page);
    if (await this.roleRow(page, roleName).count() > 0) return false;
    await page.getByRole('button', { name: 'New Role' }).first().click();
    const dlg = await this.visibleDialog(page);
    await dlg.locator('.el-dialog__title:text-is("New Role")').first().waitFor({ state: 'visible', timeout: 10000 });
    await this.dialogItem(dlg, page, 'Name').locator('input').first().fill(roleName);
    const desc = this.dialogItem(dlg, page, 'Desc').locator('input, textarea').first();
    if (await desc.count() > 0) await desc.fill('qa bigflag permission test');
    await this.submitDialog(page, dlg);
    this.state.createdRole = true;
    saveRunState(this.state);
    await this.waitTableSettled(page);
    await this.roleRow(page, roleName).waitFor({ state: 'visible', timeout: 30000 });
    return true;
  }

  protected async createAccountIfMissing(page: Page, userName: string, password: string, roleName: string): Promise<boolean> {
    await this.gotoRoles(page);
    if (await this.accountRow(page, userName).count() > 0) return false;
    await page.getByRole('button', { name: 'New Account' }).first().click();
    const dlg = page.locator('.el-dialog__wrapper:visible').filter({ has: page.locator('.el-dialog__title:text-is("New Account")') }).first();
    await dlg.waitFor({ state: 'visible', timeout: 15000 });
    await this.dialogItem(dlg, page, 'Account').locator('input').first().fill(userName);
    await this.dialogItem(dlg, page, 'Password').locator('input').first().fill(password);
    const desc = this.dialogItem(dlg, page, 'Desc').locator('input, textarea').first();
    if (await desc.count() > 0) await desc.fill('qa bigflag test user');
    const roleNode = dlg.locator('.el-tree-node__content').filter({ has: page.locator(`.el-tree-node__label:text-is("${roleName}")`) }).first();
    await roleNode.waitFor({ state: 'visible', timeout: 15000 });
    await roleNode.locator('.el-checkbox').first().click();
    await this.submitDialog(page, dlg);
    this.state.createdAccount = true;
    saveRunState(this.state);
    await this.waitTableSettled(page);
    await this.accountRow(page, userName).waitFor({ state: 'visible', timeout: 30000 });
    return true;
  }

  /** 确保专用角色/账号存在，并建立「有页面权限、无字段 key」基线。 */
  protected async ensureSpecialReady(page: Page): Promise<void> {
    if (!this.state.specialPassword) {
      this.state.specialPassword = `Qa${Math.random().toString(36).slice(2, 10)}!9`;
      saveRunState(this.state);
    }
    await this.createRoleIfMissing(page, this.state.roleName);
    await this.createAccountIfMissing(page, this.state.userName, this.state.specialPassword, this.state.roleName);
    await this.ensureBaseline(page);
  }

  protected async openEditRole(page: Page, roleName: string): Promise<ReturnType<Page['locator']>> {
    await this.gotoRoles(page);
    const row = this.roleRow(page, roleName);
    await row.waitFor({ state: 'visible', timeout: 30000 });
    await row.locator('button:has-text("Edit")').first().click();
    const dlg = await this.visibleDialog(page);
    await dlg.locator('.el-dialog__title:text-is("Edit Role")').first().waitFor({ state: 'visible', timeout: 15000 });
    return dlg;
  }

  protected async expandTree(dlg: ReturnType<Page['locator']>, page: Page, label: string): Promise<void> {
    const node = dlg.locator('.el-tree-node__content').filter({ has: page.locator(`.el-tree-node__label:text-is("${label}")`) }).first();
    await node.waitFor({ state: 'visible', timeout: 20000 });
    const icon = node.locator('.el-tree-node__expand-icon').first();
    const cls = (await icon.getAttribute('class')) ?? '';
    if (!cls.includes('expanded')) {
      await icon.click();
      await delay(500);
    }
  }

  protected treeNode(dlg: ReturnType<Page['locator']>, page: Page, label: string): ReturnType<Page['locator']> {
    return dlg.locator('.el-tree-node__content').filter({ has: page.locator(`.el-tree-node__label:text-is("${label}")`) }).first();
  }

  protected async treeState(dlg: ReturnType<Page['locator']>, page: Page, label: string): Promise<'checked' | 'indeterminate' | 'unchecked'> {
    const node = this.treeNode(dlg, page, label);
    const box = node.locator('.el-checkbox').first();
    const cls = (await box.getAttribute('class')) ?? '';
    const inputCls = (await box.locator('.el-checkbox__input').getAttribute('class')) ?? '';
    if (cls.includes('is-checked') || inputCls.includes('is-checked')) return 'checked';
    if (inputCls.includes('is-indeterminate')) return 'indeterminate';
    return 'unchecked';
  }

  protected async setTreeChecked(dlg: ReturnType<Page['locator']>, page: Page, label: string, want: boolean): Promise<void> {
    const state = await this.treeState(dlg, page, label);
    if ((state === 'checked') === want) return;
    const box = this.treeNode(dlg, page, label).locator('.el-checkbox').first();
    await box.click();
    await delay(300);
  }

  /** 将「铭牌管理」父节点置为未勾选（清除其全部子节点），用于字段 key-only 场景。 */
  protected async clearMenuSubtree(dlg: ReturnType<Page['locator']>, page: Page): Promise<void> {
    const label = '铭牌管理';
    for (let i = 0; i < 4; i++) {
      const st = await this.treeState(dlg, page, label);
      if (st === 'unchecked') return;
      await this.treeNode(dlg, page, label).locator('.el-checkbox').first().click();
      await delay(400);
    }
    throw new Error('无法将「铭牌管理」父节点置为未勾选');
  }

  protected async prepareRoleTree(page: Page, dlg: ReturnType<Page['locator']>): Promise<void> {
    await this.expandTree(dlg, page, '特效管理');
    await this.expandTree(dlg, page, '铭牌管理');
    await this.treeNode(dlg, page, '铭牌管理页面').waitFor({ state: 'visible', timeout: 15000 });
    await this.treeNode(dlg, page, '添加铭牌「是否是大铭牌」').waitFor({ state: 'visible', timeout: 15000 });
  }

  /** 建立「页面可见 + 字段 key 未勾选」基线：父节点勾选（含 effect-manager），仅取消字段 key。 */
  protected async ensureBaseline(page: Page): Promise<void> {
    const dlg = await this.openEditRole(page, this.state.roleName);
    try {
      await this.prepareRoleTree(page, dlg);
      const parent = await this.treeState(dlg, page, '铭牌管理');
      if (parent !== 'checked') {
        await this.treeNode(dlg, page, '铭牌管理').locator('.el-checkbox').first().click();
        await delay(400);
      }
      await this.setTreeChecked(dlg, page, '添加铭牌「是否是大铭牌」', false);
      if (await this.treeState(dlg, page, '铭牌管理页面') !== 'checked') {
        await this.setTreeChecked(dlg, page, '铭牌管理页面', true);
      }
      await this.shot('role-baseline', true, page);
      await this.submitDialog(page, dlg);
    } finally {
      await this.cancelDialog(page, dlg).catch(() => undefined);
    }
  }

  /** 勾选/取消字段 key（页面节点保持勾选）。 */
  protected async setFieldKey(page: Page, want: boolean): Promise<void> {
    const dlg = await this.openEditRole(page, this.state.roleName);
    try {
      await this.prepareRoleTree(page, dlg);
      await this.setTreeChecked(dlg, page, '添加铭牌「是否是大铭牌」', want);
      await this.shot(`role-field-${want ? 'on' : 'off'}`, true, page);
      await this.submitDialog(page, dlg);
    } finally {
      await this.cancelDialog(page, dlg).catch(() => undefined);
    }
  }

  /** #13 专用：仅保留字段 key，取消页面节点与父菜单节点。 */
  protected async setFieldOnly(page: Page): Promise<void> {
    const dlg = await this.openEditRole(page, this.state.roleName);
    try {
      await this.prepareRoleTree(page, dlg);
      await this.clearMenuSubtree(dlg, page);
      await this.setTreeChecked(dlg, page, '铭牌管理页面', false);
      await this.setTreeChecked(dlg, page, '添加铭牌「是否是大铭牌」', true);
      const states = {
        parent: await this.treeState(dlg, page, '铭牌管理'),
        page: await this.treeState(dlg, page, '铭牌管理页面'),
        field: await this.treeState(dlg, page, '添加铭牌「是否是大铭牌」'),
      };
      this.notes.push(`#13 权限树状态：${JSON.stringify(states)}`);
      await this.shot('role-field-only', true, page);
      await this.submitDialog(page, dlg);
    } finally {
      await this.cancelDialog(page, dlg).catch(() => undefined);
    }
  }

  protected async deleteAccountIfAny(page: Page, userName: string): Promise<void> {
    await this.gotoRoles(page);
    const row = this.accountRow(page, userName);
    if (await row.count() === 0) return;
    await row.locator('button:has-text("Delete")').first().click();
    const box = page.locator('.el-message-box__wrapper:visible').first();
    await box.waitFor({ state: 'visible', timeout: 10000 });
    await box.locator('.el-message-box__btns button.el-button--primary').first().click();
    await box.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
    await this.waitTableSettled(page);
    await this.accountRow(page, userName).waitFor({ state: 'detached', timeout: 30000 }).catch(() => undefined);
  }

  protected async deleteRoleIfAny(page: Page, roleName: string): Promise<void> {
    await this.gotoRoles(page);
    const row = this.roleRow(page, roleName);
    if (await row.count() === 0) return;
    await row.locator('button:has-text("Delete")').first().click();
    const box = page.locator('.el-message-box__wrapper:visible').first();
    await box.waitFor({ state: 'visible', timeout: 10000 });
    await box.locator('.el-message-box__btns button.el-button--primary').first().click();
    await box.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
    await this.waitTableSettled(page);
    await this.roleRow(page, roleName).waitFor({ state: 'detached', timeout: 30000 }).catch(() => undefined);
  }

  /** 专用账号重新登录（真实 UI 登录并刷新 storageState）。 */
  protected async reloginSpecial(): Promise<void> {
    await this.loginAndSaveState(this.state.userName, this.state.specialPassword, this.specialStateFile, '专用账号');
  }

  /** 在专用账号页面打开添加弹窗并返回「是否是大铭牌」表单项数量。 */
  protected async openSpecialAddDialog(page: Page): Promise<{ dlg: ReturnType<Page['locator']>; hasField: boolean; labels: string[] }> {
    const dlg = await this.openAddDialog(page);
    const hasField = await this.dialogItem(dlg, page, '是否是大铭牌').count() > 0;
    const labels = await this.dialogLabels(dlg);
    return { dlg, hasField, labels };
  }

  protected async cleanupSpecial(page: Page): Promise<void> {
    try {
      await this.ensureBaseline(page);
    } catch (e) {
      this.notes.push(`恢复角色基线失败：${(e as Error).message}`);
    }
    await this.deleteAccountIfAny(page, this.state.userName).catch((e) => this.notes.push(`删除专用账号失败：${(e as Error).message}`));
    await this.deleteRoleIfAny(page, this.state.roleName).catch((e) => this.notes.push(`删除专用角色失败：${(e as Error).message}`));
    this.state.createdAccount = false;
    this.state.createdRole = false;
    saveRunState(this.state);
  }
}
