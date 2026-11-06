/**
 * 项目139 / 非 UI 核验附录：N-D1-OBSERVE、N-D2-FE、N-D2-BE、N-D3-ENV
 *
 * 用例来源：TK-0083 HANDOFF「非 UI 核验清单」；技术方案：TK-0083 TECH_DESIGN §4/§5。
 * 说明：本脚本不替代任何 UI 用例判定；N-A3/N-A5/N-B3/N-B5 已在广播/主播脚本中执行。
 * 运行（仓库根目录，凭证运行时注入）：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** LITA_USER_TOKEN=*** \
 *   node projects/feature/lita-admin-139-batch-delete/tests/non-ui-verification.test.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdminBase, MAP_BASE, UI_BASE, API_BASE, cst } from './lib/admin-base.ts';

const OFFICIAL_SLUGS = new Set([
  'broad-config-47cases',
  'anchor-certification-47cases',
  'withdraw-become-player-time-47cases',
  'non-ui-verification',
]);

class NonUiVerification extends AdminBase {
  private baselineConsole: Array<{ type: string; text: string; url: string }> = [];
  private entryHtml = '';
  private entryScript = '';
  private health: any = null;
  private processStart = '';
  private directApiStatus = 0;
  private directApiBody = '';

  constructor() {
    super('non-ui-verification');
    this.total = 4;
  }

  private async fetchText(url: string): Promise<{ status: number; text: string }> {
    const response = await fetch(url, { redirect: 'manual' });
    return { status: response.status, text: await response.text() };
  }

  private aggregateEvidence(): { consoleErrors: Array<{ slug: string; text: string; url: string }>; http500: Array<{ slug: string; method: string; url: string; status: number }>; other5xx: Array<{ slug: string; method: string; url: string; status: number }>; runs: number } {
    const root = join(process.cwd(), 'evidence');
    const consoleErrors: Array<{ slug: string; text: string; url: string }> = [];
    const http500: Array<{ slug: string; method: string; url: string; status: number }> = [];
    const other5xx: Array<{ slug: string; method: string; url: string; status: number }> = [];
    let runs = 0;
    let dirs: string[] = [];
    try {
      dirs = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
      return { consoleErrors, http500, other5xx, runs };
    }
    for (const dir of dirs) {
      let payload: any;
      try {
        payload = JSON.parse(readFileSync(join(root, dir, 'run.json'), 'utf8'));
      } catch {
        continue;
      }
      if (!OFFICIAL_SLUGS.has(String(payload.slug))) continue;
      runs++;
      for (const entry of payload.consoleEntries ?? []) {
        if (entry.type === 'error') consoleErrors.push({ slug: String(payload.slug), text: String(entry.text), url: String(entry.url ?? '') });
      }
      for (const call of payload.calls ?? []) {
        const status = Number(call.status);
        if (status === 500) http500.push({ slug: String(payload.slug), method: String(call.method), url: String(call.url), status });
        else if (status > 500) other5xx.push({ slug: String(payload.slug), method: String(call.method), url: String(call.url), status });
      }
    }
    return { consoleErrors, http500, other5xx, runs };
  }

  async run(): Promise<void> {
    await this.act('管理员真实登录并获取本次会话 token', async () => {
      await this.login();
    });
    // 登录页 console 作为基线；随后三页只读查询用于 D1 采样
    this.baselineConsole = this.consoleEntries.filter((entry) => entry.type === 'error').map((entry) => ({ type: entry.type, text: entry.text, url: entry.url }));

    await this.act('N-D1 打开三个被测页面完成只读查询', async () => {
      await this.open('/voice-room/voice-room-broad-config', '.app-container');
      await this.waitRows(1);
      await this.open('/voice-room/anchor-certification', '.app-container');
      await this.waitRows(1);
      await this.open('/review/withdrawal', '.app-container');
      await this.waitRows(1);
      await this.shot('D1-三页只读查询');
    });

    let consoleResult: { consoleErrors: Array<{ slug: string; text: string; url: string }>; http500: Array<{ slug: string; method: string; url: string; status: number }>; other5xx: Array<{ slug: string; method: string; url: string; status: number }>; runs: number } = { consoleErrors: [], http500: [], other5xx: [], runs: 0 };
    await this.act('N-D1 汇总本轮全部 UI 脚本的 console 与 HTTP 状态留痕', async () => {
      consoleResult = this.aggregateEvidence();
      this.log(`D1 聚合 runs=${consoleResult.runs};consoleErrors=${consoleResult.consoleErrors.length};http500=${consoleResult.http500.length};other5xx=${consoleResult.other5xx.length}`);
    });
    const baselineTexts = new Set(this.baselineConsole.map((entry) => entry.text));
    const newErrors = consoleResult.consoleErrors.filter((entry) => !baselineTexts.has(entry.text));
    await this.check('N-D1-OBSERVE 相对基线无新增 console error，全部业务接口无 HTTP 500', async () => ({
      expect: '新增 console error=0;HTTP 500=0',
      real: `baseline=${this.baselineConsole.length};aggregatedRuns=${consoleResult.runs};newConsoleErrors=${newErrors.length};http500=${consoleResult.http500.length};other5xx=${consoleResult.other5xx.length};detail=${JSON.stringify(newErrors.slice(0, 3))}${consoleResult.http500.length ? ';500=' + JSON.stringify(consoleResult.http500.slice(0, 3)) : ''}${consoleResult.other5xx.length ? ';other5xx=' + JSON.stringify(consoleResult.other5xx.slice(0, 3)) : ''}`,
      pass: newErrors.length === 0 && consoleResult.http500.length === 0 && consoleResult.runs >= 1,
    }));

    await this.act('N-D2-FE 只读获取前端入口 HTML 并提取 script hash', async () => {
      const response = await this.fetchText(`${UI_BASE}/`);
      this.entryHtml = response.text;
      const match = response.text.match(/<script[^>]+src=["']([^"']*index-[^"']+\.js)["']/i);
      this.entryScript = match?.[1] ?? '';
      writeFileSync(join(this.evidenceDir, `entry-${Date.now()}.html`), response.text, 'utf8');
      this.log(`D2-FE HTTP=${response.status};script=${this.entryScript};bytes=${response.text.length}`);
      await this.shot('D2-前端入口');
    });
    await this.check('N-D2-FE 部署前端 hash 与任务声明 index-cddef5cd.js 一致', async () => ({
      expect: 'index-cddef5cd.js',
      real: this.entryScript ? this.entryScript.split('/').pop() ?? this.entryScript : '未提取到入口 script',
      pass: (this.entryScript.split('/').pop() ?? '') === 'index-cddef5cd.js',
    }));

    await this.act('N-D2-BE 读取 funbit-mgr 健康、进程启动时间与构建信息', async () => {
      const health = await this.fetchText(`${API_BASE}/actuator/health`);
      try {
        this.health = JSON.parse(health.text);
      } catch {
        this.health = { raw: health.text.slice(0, 200) };
      }
      const prometheus = await this.fetchText(`${API_BASE}/actuator/prometheus`);
      const match = prometheus.text.match(/process_start_time_seconds\{application="funbit-mgr",?\}\s+([0-9.E]+)/);
      const seconds = match ? Number(match[1]) : NaN;
      this.processStart = Number.isFinite(seconds) ? cst(seconds * 1000) : '未取得';
      const info = await this.fetchText(`${API_BASE}/actuator/info`);
      writeFileSync(join(this.evidenceDir, `health-${Date.now()}.json`), JSON.stringify({ health: this.health, processStart: this.processStart, info: info.text.slice(0, 2000) }, null, 2), 'utf8');
      this.log(`D2-BE health=${JSON.stringify(this.health)};start=${this.processStart};info=${info.text.slice(0, 200)}`);
      await this.shot('D2-后端健康');
    });
    await this.check('N-D2-BE 可证明后端部署 commit 与声明 funbit-api b5ad323d / lita-public f53a2c75 一致', async () => ({
      expect: '存在可核对的构建/部署 commit 证据且两个 commit 均一致',
      real: `health=${this.health?.status ?? '未知'};processStart=${this.processStart};构建/部署 commit 证据=未提供（未核实，不以进程时间反推 commit）`,
      pass: false,
    }));

    await this.act('N-D3-ENV 分别探测 m-api 直连与 funbit-mgr 同源入口', async () => {
      try {
        const response = await fetch(`${MAP_BASE}/`, { redirect: 'manual' });
        this.directApiStatus = response.status;
        this.directApiBody = (await response.text()).slice(0, 300);
      } catch (error) {
        this.directApiStatus = 0;
        this.directApiBody = (error as Error).message;
      }
      this.log(`D3 m-api direct=${this.directApiStatus};body=${this.directApiBody.replace(/\n/g, ' ').slice(0, 120)};funbit-mgr health=${this.health?.status ?? '未知'}`);
      await this.shot('D3-环境限制');
    });
    await this.check('N-D3-ENV m-api 直连 403 与 funbit-mgr 同源入口可用均被记录，403 不记为业务结果', async () => ({
      expect: 'm-api=403;funbit-mgr=200/UP',
      real: `m-api=${this.directApiStatus};funbit-mgr health=${this.health?.status ?? '未知'};body=${this.directApiBody.replace(/\n/g, ' ').slice(0, 80)}`,
      pass: this.directApiStatus === 403 && this.health?.status === 'UP',
    }));
  }
}

await new NonUiVerification().execute();
