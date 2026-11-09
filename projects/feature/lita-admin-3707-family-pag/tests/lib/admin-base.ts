/**
 * ADMIN 项目 3707（家族群聊背景 PAG 上传与展示）测试基类。
 *
 * 环境与认证：
 * - UI：https://admin.test.lita.game（SCRIPT_UI_BASE 可覆盖）
 * - 后端同源测试入口：https://funbit-mgr.test.cinta.team（SCRIPT_API_BASE 可覆盖）
 *   执行机直连 https://m-api.test.lita.game 返回 HTTP 403 Access Denied（CDN/WAF）；
 *   浏览器层仅把该主机的请求原样转发到同源测试入口，不修改页面代码与业务参数（规范 R1 例外）。
 * - 管理员账号密码只在运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD 注入，不写入脚本、日志或证据。
 *
 * 留痕（test/script 规范 v1.2.0）：
 * - 关键页面操作与每个检查点断言后截图；
 * - 页面接口请求/响应与 console error / pageerror / requestfailed 写入 evidence/run.json；
 * - token、密码等敏感字段统一脱敏，不落盘。
 *
 * 断言边界：
 * - 所有验证点均读取页面内容（DOM/可见文本/页面资源地址/渲染帧），不读取接口响应、不执行 SQL；
 * - 页面接口留痕只用于证据索引，不作为任何检查点的判定依据。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Response } from 'playwright';
import { CheckBaseClass } from '../../../../../src/base/CheckBaseClass.ts';

export const UI_BASE = (process.env.SCRIPT_UI_BASE ?? 'https://admin.test.lita.game').replace(/\/+$/, '');
export const API_BASE = (process.env.SCRIPT_API_BASE ?? 'https://funbit-mgr.test.cinta.team').replace(/\/+$/, '');
export const MAP_BASE = 'https://m-api.test.lita.game';
export const TOKEN_COOKIE = 'vue_admin_template_token';
export const FAMILY_BACKGROUND_HASH = '#/effect-manager/family-background';

export interface ApiCall {
  seq: number;
  time: string;
  source: 'page';
  method: string;
  url: string;
  status?: number;
  contentType?: string;
  responseBody?: string;
  responseSize?: number;
}

export interface ConsoleEntry {
  type: string;
  text: string;
  time: string;
}

export interface PngImage {
  width: number;
  height: number;
  channels: number;
  data: Buffer;
}

export interface FrameDiff {
  changed: number;
  total: number;
  ratio: number;
  maxDelta: number;
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

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function maskSensitive(text: string): string {
  return text
    .replace(/("?(?:accessToken|token|pwd|password)"?\s*[:=]\s*")[^"]+(")/gi, '$1***$2')
    .replace(/(AccessToken|accessToken|L-USER-TOKEN|l-user-token)(["']?\s*[:=]\s*["']?)[^\s,"'}]+/g, '$1$2***')
    .replace(/JSESSIONID=[^;,\s]+/g, 'JSESSIONID=***');
}

export function clamp(text: string, limit = 2000): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…(truncated, total ${text.length})`;
}

/** 解析 Chromium 截图 PNG（8bit RGB/RGBA，非隔行）为像素缓冲，用于渲染帧比对 */
export function decodePng(buf: Buffer): PngImage {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 截图');
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`不支持的 PNG 位深 ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`不支持的 PNG 颜色类型 ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`不支持的 PNG 过滤类型 ${filter}`);
      }
      cur[x] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width, height, channels, data: out };
}

/** 两帧像素差异：单像素三通道差值之和 > 12 视为变化 */
export function diffPng(a: PngImage, b: PngImage): FrameDiff {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`帧尺寸不一致 ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  const ch = a.channels;
  let changed = 0;
  let total = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.data.length; i += ch) {
    const da =
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (da > 12) changed++;
    if (da > maxDelta) maxDelta = da;
    total++;
  }
  return { changed, total, ratio: +((changed / total) * 100).toFixed(2), maxDelta };
}

/** 画面是否非空白：统计亮度分布与颜色数量（用于无内容/纯色预览判定） */
export function pngStats(img: PngImage): { min: number; max: number; std: number; colors: number } {
  const ch = img.channels;
  let min = 255;
  let max = 0;
  let sum = 0;
  let sum2 = 0;
  const colors = new Set<number>();
  for (let i = 0; i < img.data.length; i += ch) {
    const r = img.data[i];
    const g = ch >= 3 ? img.data[i + 1] : r;
    const b = ch >= 3 ? img.data[i + 2] : r;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
    sum += lum;
    sum2 += lum * lum;
    colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
  }
  const n = img.width * img.height;
  const mean = sum / n;
  return {
    min: +min.toFixed(1),
    max: +max.toFixed(1),
    std: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(1),
    colors: colors.size,
  };
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
  protected consoleErrors: ConsoleEntry[] = [];
  protected pageErrors: string[] = [];
  protected requestFailures: { url: string; method: string; failure: string }[] = [];
  protected badResponses: { time: string; method: string; url: string; status: number }[] = [];
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
    this.installPageObservers(this.page);
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

  /** 浏览器层把被 WAF 拦截的 m-api 主机原样转发到同源测试入口（不修改业务参数） */
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
        await route.continue({ url: target, headers });
      } catch (error) {
        this.notes.push(`WAF 同源转发失败 ${url.pathname}: ${(error as Error).message}`);
        await route.fulfill({ status: 502, headers: cors, contentType: 'application/json', body: JSON.stringify({ status: 1, msg: 'proxy error' }) });
      }
    });
  }

  private installPageObservers(page: Page): void {
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      this.consoleErrors.push({ type: message.type(), text: message.text(), time: new Date().toISOString() });
    });
    page.on('pageerror', (error) => {
      this.pageErrors.push(error.message);
    });
    page.on('response', (response) => {
      if (response.status() >= 400) {
        this.badResponses.push({
          time: new Date().toISOString(),
          method: response.request().method(),
          url: response.url(),
          status: response.status(),
        });
      }
    });
    page.on('requestfailed', (request) => {
      const failure = request.failure();
      this.requestFailures.push({ url: request.url(), method: request.method(), failure: failure?.errorText ?? 'unknown' });
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
    page.on('response', async (response) => {
      if (response.url().includes('/admin/login') && response.request().method() === 'POST') {
        try {
          const json = (await response.json()) as { data?: { accessToken?: string } };
          if (json?.data?.accessToken) loginToken = json.data.accessToken;
        } catch {
          // 登录响应非 JSON 时忽略，token 仍从 Cookie 获取
        }
      }
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
    await this.shot('00-login-success');
    this.log(`登录成功，账号=${process.env.ADMIN_USERNAME}，AccessToken 已获取（长度 ${this.token.length}，不输出值）`);
  }

  protected async shot(tag: string): Promise<string> {
    mkdirSync(this.evidenceDir, { recursive: true });
    const name = `${String(++this.shotNo).padStart(2, '0')}-${tag.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.png`;
    await this.page!.screenshot({ path: join(this.evidenceDir, name), fullPage: true });
    this.shots.push(name);
    return name;
  }

  /** 对指定元素截图留痕（关键验证点） */
  protected async shotLocator(locator: Locator, tag: string): Promise<string> {
    mkdirSync(this.evidenceDir, { recursive: true });
    const name = `${String(++this.shotNo).padStart(2, '0')}-${tag.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.png`;
    await locator.screenshot({ path: join(this.evidenceDir, name), timeout: 30000 });
    this.shots.push(name);
    return name;
  }

  /** 页面接口留痕（仅证据，不作断言依据；token/密码脱敏） */
  private async capturePageResponse(response: Response): Promise<void> {
    const request = response.request();
    const url = response.url();
    if (!url.includes('/api/') && !url.includes('/admin/') && !url.includes('/common/giftFileUpload')) return;
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
      url,
      status: response.status(),
      contentType: response.headers()['content-type'],
      responseBody: clamp(maskSensitive(body)),
      responseSize: size,
    });
  }

  // ---------- 页面通用 ----------

  protected get p(): Page {
    return this.page!;
  }

  protected async waitListIdle(timeout = 20000): Promise<void> {
    await this.p
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
  }

  /** 列表行（主表，不含固定右列） */
  protected rows(): Locator {
    return this.p.locator('.app-container .el-table__body-wrapper tbody tr.el-table__row');
  }

  /** 固定右列（操作列）行 */
  protected fixedRightRows(): Locator {
    return this.p.locator('.app-container .el-table__fixed-right .el-table__fixed-body-wrapper tbody tr.el-table__row');
  }

  protected async rowCount(): Promise<number> {
    return this.rows().count();
  }

  /** 主表表头文本（主表 + 固定右列） */
  protected async headerTexts(): Promise<string[]> {
    const main = await this.p.locator('.app-container .el-table__header-wrapper').first().locator('th').allInnerTexts();
    const fixed = await this.p.locator('.app-container .el-table__fixed-right th').allInnerTexts();
    return [...main, ...fixed].map((t) => t.trim()).filter((t) => t.length > 0);
  }

  protected button(text: string, root = ''): Locator {
    return this.p
      .locator(`${root} button`)
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`) })
      .first();
  }

  protected async listTotal(): Promise<{ total: number; text: string; rows: number }> {
    const info = await this.p.evaluate(() => {
      const el = document.querySelector('.el-pagination__total');
      const text = el?.textContent?.trim() ?? '';
      const m = text.match(/\d+/);
      const rows = document.querySelectorAll('.app-container .el-table__body-wrapper tbody tr.el-table__row').length;
      // 分页组件在单页时 hide-on-single-page 隐藏，此时以列表行数作为记录数
      return { text, total: m ? Number(m[0]) : rows, rows };
    });
    return info;
  }

  /** 等待一次列表查询完成（以列表请求响应事件为界，不做响应断言） */
  protected async waitListResponse(action: () => Promise<void>, timeout = 45000): Promise<void> {
    await Promise.all([
      this.p.waitForResponse((r) => r.url().includes('/api/family/chatBackgroundList') && r.request().method() === 'GET', { timeout }),
      action(),
    ]);
    await this.waitListIdle();
  }

  protected async searchByName(name: string): Promise<void> {
    const input = this.p.locator('.app-container input[placeholder="背景名称"]').first();
    await input.fill(name);
    await this.waitListResponse(async () => {
      await this.button('Search', '.app-container').click();
    });
  }

  protected async resetSearch(): Promise<void> {
    await this.p.locator('.app-container input[placeholder="背景ID"]').first().fill('');
    await this.p.locator('.app-container input[placeholder="背景名称"]').first().fill('');
    await this.waitListResponse(async () => {
      await this.button('Search', '.app-container').click();
    });
  }

  /** 列表单元格：0=背景ID 1=背景名称 2=背景缩略图 3=背景图 */
  protected cell(rowIndex: number, colIndex: number): Locator {
    return this.rows().nth(rowIndex).locator('td').nth(colIndex);
  }

  // ---------- 弹窗 ----------

  protected dialog(): Locator {
    return this.p.locator('.el-dialog:visible').first();
  }

  protected async visibleDialogCount(): Promise<number> {
    return this.p.locator('.el-dialog:visible').count();
  }

  protected async dialogTitle(): Promise<string> {
    return (await this.dialog().locator('.el-dialog__title').first().innerText()).trim();
  }

  protected formItem(label: string): Locator {
    return this.dialog()
      .locator('.el-form-item')
      .filter({ has: this.p.locator('.el-form-item__label', { hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) }) })
      .first();
  }

  protected async openAdd(): Promise<void> {
    await this.button('Add', '.app-container').click();
    await this.dialog().waitFor({ state: 'visible', timeout: 15000 });
    await this.p.waitForFunction(() => {
      const dlg = document.querySelector('.el-dialog__wrapper:not([style*="display: none"]) .el-dialog__title');
      return dlg?.textContent?.trim() === 'Add';
    }, null, { timeout: 15000 });
  }

  protected async openEdit(rowIndex = 0): Promise<void> {
    await this.fixedRightRows().nth(rowIndex).locator('button').filter({ hasText: /^\s*Edit\s*$/ }).first().click();
    await this.dialog().waitFor({ state: 'visible', timeout: 15000 });
    await this.p.waitForFunction(() => {
      const dlg = document.querySelector('.el-dialog__wrapper:not([style*="display: none"]) .el-dialog__title');
      return dlg?.textContent?.trim() === 'Edit';
    }, null, { timeout: 15000 });
  }

  protected async closeDialogByCancel(): Promise<void> {
    await this.dialog().locator('button').filter({ hasText: /^\s*Cancel\s*$/ }).first().click();
    await this.p.waitForFunction(() => document.querySelectorAll('.el-dialog:visible').length === 0, null, { timeout: 15000 }).catch(() => undefined);
  }

  protected async confirmDialog(): Promise<void> {
    await this.dialog().locator('button').filter({ hasText: /^\s*Confirm\s*$/ }).first().click();
  }

  /** 当前上传区域预览的资源地址（canvas 取组件 src，静态取 img src，视频取 video src） */
  protected async currentPreviewSrc(label: string): Promise<string> {
    return this.formItem(label).evaluate((item) => {
      const canvas = item.querySelector('canvas.pag-canvas') as unknown as { __vue__?: { src?: string } } | null;
      if (canvas?.__vue__?.src) return canvas.__vue__.src;
      const img = item.querySelector('img');
      if (img?.getAttribute('src')) return img.getAttribute('src') ?? '';
      const video = item.querySelector('video');
      return video?.getAttribute('src') ?? '';
    });
  }

  /**
   * 上传文件：等待页面自身的上传请求完成（只等待事件，不断言响应），
   * 并等待该上传区域的预览资源地址切换为新地址（避免读到替换前的旧预览）。
   */
  protected async uploadFile(label: string, file: string): Promise<void> {
    const input = this.formItem(label).locator('input[type=file]').first();
    const prev = await this.currentPreviewSrc(label);
    await Promise.all([
      this.p.waitForResponse((r) => r.url().includes('/common/giftFileUpload'), { timeout: 120000 }),
      input.setInputFiles(file),
    ]);
    await this.p.waitForFunction(
      ({ target, previous }) => {
        const dialogs = Array.from(document.querySelectorAll('.el-dialog__wrapper')).filter((w) => {
          const el = w as HTMLElement;
          const style = getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        });
        const dlg = dialogs[0]?.querySelector('.el-dialog');
        if (!dlg) return false;
        const item = Array.from(dlg.querySelectorAll('.el-form-item')).find(
          (el) => el.querySelector('.el-form-item__label')?.textContent?.trim() === target,
        );
        if (!item) return false;
        const canvas = item.querySelector('canvas.pag-canvas') as unknown as { __vue__?: { src?: string } } | null;
        const src =
          canvas?.__vue__?.src ??
          item.querySelector('img')?.getAttribute('src') ??
          item.querySelector('video')?.getAttribute('src') ??
          '';
        return src !== '' && src !== previous;
      },
      { target: label, previous: prev },
      { timeout: 90000 },
    );
  }

  /** 等待上传区域出现 PAG 预览 canvas */
  protected async waitPagPreview(label: string, timeout = 60000): Promise<Locator> {
    const item = this.formItem(label);
    await item.locator('canvas.pag-canvas').first().waitFor({ state: 'visible', timeout });
    return item;
  }

  /** 等待上传区域出现静态图片并完成解码 */
  protected async waitImagePreview(label: string, timeout = 60000): Promise<{ src: string; naturalWidth: number }> {
    const item = this.formItem(label);
    const img = item.locator('img').first();
    await img.waitFor({ state: 'visible', timeout });
    await this.p.waitForFunction(
      () => {
        const dlg = document.querySelector('.el-dialog__wrapper:not([style*="display: none"]) .el-dialog');
        if (!dlg) return false;
        return Array.from(dlg.querySelectorAll('img')).every((im) => (im as HTMLImageElement).complete);
      },
      null,
      { timeout: 30000 },
    );
    const src = (await img.getAttribute('src')) ?? '';
    const naturalWidth = await img.evaluate((im) => (im as HTMLImageElement).naturalWidth);
    return { src, naturalWidth };
  }

  /** 采样同一元素的多帧截图，返回最大帧差（用于 PAG 持续播放判定） */
  protected async measureFrames(locator: Locator, timeout = 8000, interval = 250): Promise<FrameDiff> {
    const first = decodePng(await locator.screenshot({ timeout: 20000 }));
    let best: FrameDiff = { changed: 0, total: first.width * first.height, ratio: 0, maxDelta: 0 };
    const started = Date.now();
    while (Date.now() - started < timeout) {
      await this.p.waitForTimeout(interval); // 采样间隔（动画帧比对），不是就绪等待
      const current = decodePng(await locator.screenshot({ timeout: 20000 }));
      const d = diffPng(first, current);
      if (d.ratio > best.ratio) best = d;
      if (best.ratio >= 0.3 && best.maxDelta >= 20) return best;
    }
    return best;
  }

  /** 页面渲染元素自身的资源地址（PAG 预览为 canvas，地址取组件当前 src，仍是页面内容） */
  protected async mediaSrc(locator: Locator): Promise<string> {
    return locator.evaluate((el) => {
      if (el.tagName === 'CANVAS') {
        const vue = (el as unknown as { __vue__?: { src?: string; $props?: { src?: string } } }).__vue__;
        return vue?.src ?? vue?.$props?.src ?? '';
      }
      return (el as HTMLImageElement).getAttribute('src') ?? (el as HTMLImageElement).src ?? '';
    });
  }

  /** 去除 query/hash 的页面资源地址 */
  protected cleanUrl(url: string): string {
    return url.split('#')[0].split('?')[0];
  }

  /** 自基准点起新增的 PAG 加载失败 console 记录 */
  protected pagFailuresSince(mark: number): string[] {
    return this.consoleErrors
      .slice(mark)
      .map((item) => item.text)
      .filter((text) => text.includes('PAG加载失败') || text.includes('PAG 加载失败'));
  }

  protected consoleMark(): number {
    return this.consoleErrors.length;
  }

  protected writeRunEvidence(): void {
    const payload = {
      slug: this.slug,
      finishedAt: new Date().toISOString(),
      uiBase: UI_BASE,
      apiBase: API_BASE,
      evidenceDir: this.evidenceDir,
      shots: this.shots,
      notes: this.notes,
      calls: this.calls,
      consoleErrors: this.consoleErrors,
      pageErrors: this.pageErrors,
      requestFailures: this.requestFailures,
      badResponses: this.badResponses,
    };
    try {
      writeFileSync(join(this.evidenceDir, 'run.json'), JSON.stringify(payload, null, 2), 'utf8');
      this.log(`运行留痕: ${join(this.evidenceDir, 'run.json')}`);
    } catch (error) {
      this.log(`写运行留痕失败: ${(error as Error).message}`);
    }
  }
}
