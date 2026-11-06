/**
 * 项目139 / 缺陷 #233 修复回归：广播召人配置「上传模版」选择文件不再向页面根路径 POST（405）
 *
 * 用例来源：TK-0096 任务输入（缺陷 #233 回归范围）；技术方案：TK-0083 TECH_DESIGN §2 BD-IMPORT / §3 用例#8 断言映射、
 *           TK-0092 既有脚本 broad-config-47cases.test.ts 的 L-B / L-B-IMPORT / L-DIALOG 定位。
 * 覆盖（回归项，非新增用例）：
 *   - 导入核心：选择文件后无根路径 POST、无 405/新增 console error；Confirm 后仅 1 次 uploadBroad；导入成功且列表生成配置。
 *   - 页面轻量冒烟：页面加载、列表查询、多选列与批量删除入口/禁用态、单条删除。
 *   - console 基线：仅登录 `/admin/init` 404 为已知基线，本轮新增 console error 应为 0。
 * 数据隔离：仅英语区测试房间 6666（预检必须无既有配置）；每个阶段登记本脚本创建的 roomId，finally 仅清理本脚本登记数据。
 * 运行（仓库根目录，凭证运行时注入）：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** \
 *   node projects/feature/lita-admin-139-batch-delete/tests/broad-import-233-regression.test.ts
 */
import ExcelJS from 'exceljs';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdminBase, EN_ROOM_IDS, UI_BASE } from './lib/admin-base.ts';

const ROOM_ID = EN_ROOM_IDS[0];

interface PageRequest {
  time: number;
  method: string;
  url: string;
}

interface BaselineInfo {
  entryJs: string;
  lastModified: string;
}

class BroadImport233Regression extends AdminBase {
  private created: number[] = [];
  private pageRequests: PageRequest[] = [];
  private tempFile = '';
  private baseline: BaselineInfo = { entryJs: '', lastModified: '' };

  constructor() {
    super('broad-import-233-regression');
    this.total = 14;
  }

  // ---------- 数据准备/清理（仅前置与清理，不作验证点） ----------

  private async broadData(query = ''): Promise<{ total: number; rows: any[] }> {
    const response = await this.api(`/api/voiceroom/broad/list?page=1&rows=200${query}`);
    if (String(response.json?.status) !== '0') throw new Error(`广播列表接口失败: ${response.json?.msg}`);
    const data = response.json?.data ?? {};
    return { total: Number(data.total ?? 0), rows: data.data ?? [] };
  }

  private async exists(roomId: number): Promise<boolean> {
    return (await this.broadData(`&roomId=${roomId}`)).rows.length > 0;
  }

  /** 预检：房间必须存在且为英语区，避免覆盖非测试房间 */
  private async assertEnglishRoom(roomId: number): Promise<void> {
    const response = await this.api(`/api/voiceroom/voiceRoomList?page=1&rows=10&roomId=${roomId}`);
    if (String(response.json?.status) !== '0') throw new Error(`房间查询接口失败: ${response.json?.msg}`);
    const rooms = response.json?.data?.data ?? [];
    const hit = rooms.find((room: any) => String(room.roomId) === String(roomId));
    if (!hit) throw new Error(`预检失败：房间 ${roomId} 不存在`);
    if (hit.locale !== 'en') throw new Error(`预检失败：房间 ${roomId} 非英语区（locale=${hit.locale}）`);
  }

  private async assertAbsent(roomId: number): Promise<void> {
    if (await this.exists(roomId)) throw new Error(`预检冲突：房间 ${roomId} 已存在广播召人配置，停止执行`);
  }

  private async addViaApi(roomId: number, priority: number, userNum: number): Promise<void> {
    await this.assertEnglishRoom(roomId);
    await this.assertAbsent(roomId);
    const response = await this.api('/api/voiceroom/broad/add', {
      method: 'POST',
      body: { roomId, priority, userNum, isNotity: '0', opUser: this.operator },
    });
    if (String(response.json?.status) !== '0') throw new Error(`API 新增房间 ${roomId} 失败: ${response.json?.msg}`);
    const after = await this.broadData(`&roomId=${roomId}`);
    if (after.rows.length !== 1) throw new Error(`新增后房间 ${roomId} 记录数应为 1，实际 ${after.rows.length}`);
    if (!this.created.includes(roomId)) this.created.push(roomId);
  }

  private async batchDeleteViaApi(ids: number[]): Promise<void> {
    if (!ids.length) return;
    const response = await this.api('/api/voiceroom/broad/batchDelete', { method: 'POST', body: { roomIds: ids } });
    if (String(response.json?.status) !== '0') throw new Error(`清理广播数据失败: ${response.json?.msg}`);
    this.created = this.created.filter((id) => !ids.includes(id));
  }

  private async openBroad(): Promise<void> {
    await this.open('/voice-room/voice-room-broad-config', '.app-container');
    await this.waitRows(1);
  }

  private rowByRoom(roomId: number) {
    return this.rows().filter({ hasText: String(roomId) }).first();
  }

  private async rowFields(roomId: number): Promise<{ count: number; priority: string; userNum: string }> {
    const rows = (await this.broadData(`&roomId=${roomId}`)).rows;
    const row = rows[0];
    return {
      count: rows.length,
      priority: String(row?.priority ?? ''),
      userNum: String(row?.userNum ?? ''),
    };
  }

  // ---------- 部署基线（非 UI，仅版本确认） ----------

  private async verifyDeployment(): Promise<void> {
    const response = await fetch(`${UI_BASE}/`, { headers: { 'cache-control': 'no-cache' } });
    if (!response.ok) throw new Error(`入口 HTML 获取失败: HTTP ${response.status}`);
    const html = await response.text();
    const match = html.match(/\/static\/(index-[a-f0-9]+\.js)/);
    this.baseline = {
      entryJs: match?.[1] ?? '未找到入口 JS',
      lastModified: response.headers.get('last-modified') ?? '未提供',
    };
    this.notes.push(`部署基线：entryHtml=${UI_BASE}/；entryJs=${this.baseline.entryJs}；Last-Modified=${this.baseline.lastModified}`);
  }

  // ---------- console 基线 ----------

  /** 已知登录基线：/admin/init 404 不属于本轮新增 console error */
  private isKnownConsoleBaseline(entry: { type: string; text: string; url: string }): boolean {
    if (entry.type !== 'error') return false;
    if (entry.url.includes('/admin/init') && /404/.test(entry.text)) return true;
    // Sentry 将 /admin/init 404 包装为 JS error 上报，文本不含 URL，但明确为 init request 404
    return /Error during init request/i.test(entry.text) && /404/.test(entry.text);
  }

  private consoleErrorsSince(index: number) {
    return this.consoleEntries.slice(index).filter((entry) => entry.type === 'error');
  }

  private newConsoleErrors() {
    return this.consoleEntries.filter((entry) => entry.type === 'error' && !this.isKnownConsoleBaseline(entry));
  }

  private newBadResponses() {
    return this.badResponses.filter((entry) => !(entry.url.includes('/admin/init') && entry.status === 404));
  }

  private isRootPost(request: PageRequest): boolean {
    try {
      const url = new URL(request.url);
      return request.method === 'POST' && url.origin === new URL(UI_BASE).origin && url.pathname === '/';
    } catch {
      return false;
    }
  }

  private async rootPostWithin(ms: number): Promise<PageRequest | null> {
    try {
      const request = await this.p.waitForRequest(
        (req) => req.method() === 'POST' && new URL(req.url()).origin === new URL(UI_BASE).origin && new URL(req.url()).pathname === '/',
        { timeout: ms },
      );
      return { time: Date.now(), method: request.method(), url: request.url() };
    } catch {
      return null;
    }
  }

  async run(): Promise<void> {
    try {
      await this.act('管理员真实登录并获取本次会话 token', async () => {
        await this.login();
        this.p.on('request', (request) => {
          this.pageRequests.push({ time: Date.now(), method: request.method(), url: request.url() });
        });
      });

      await this.act('复核前端部署入口与构建基线', async () => {
        await this.verifyDeployment();
      });
      await this.check('基线-① 前端入口 JS 为本轮目标构建 index-305af3b6.js', async () => ({
        expect: 'index-305af3b6.js',
        real: this.baseline.entryJs,
        pass: this.baseline.entryJs === 'index-305af3b6.js',
      }));
      const lastModifiedMs = Date.parse(this.baseline.lastModified);
      await this.check('基线-② 入口 HTML Last-Modified 不早于修复构建时间 2026-11-06 16:30:00（CST）', async () => ({
        expect: '>=2026-11-06 16:30:00 CST',
        real: Number.isFinite(lastModifiedMs) ? new Date(lastModifiedMs).toISOString() : this.baseline.lastModified,
        pass: Number.isFinite(lastModifiedMs) && lastModifiedMs >= Date.parse('2026-11-06T08:30:00Z'),
      }));

      // ==================== 冒烟：页面加载与列表查询 ====================
      let pageState = { container: false, headers: [] as string[], rowCount: 0 };
      let queryState = { count: -1, priority: '', userNum: '', visible: false };
      await this.act('冒烟 造数房间 6666（33/11）并打开广播召人配置，按 ROOM ID 查询', async () => {
        await this.addViaApi(ROOM_ID, 33, 11);
        await this.openBroad();
        pageState = {
          container: await this.p.locator('.app-container').isVisible(),
          headers: await this.headerTexts(),
          rowCount: await this.rowCount(),
        };
        await this.fillByPlaceholder('ROOM ID', String(ROOM_ID));
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        const fields = await this.rowFields(ROOM_ID);
        queryState = {
          ...fields,
          visible: await this.rowByRoom(ROOM_ID).isVisible(),
        };
        await this.shot('冒烟-列表查询');
        await this.rowByRoom(ROOM_ID).screenshot({ path: join(this.evidenceDir, '冒烟-目标行.png') }).catch(() => undefined);
      });
      const requiredHeaders = ['', '房间ID', '房间名称', '大区', '优先级', '日广播邀请人数', '变更日期', '变更人', '操作'];
      await this.check('冒烟-S1-① 页面加载正常：内容区可见且表头完整', async () => ({
        expect: requiredHeaders.join('|'),
        real: pageState.headers.join('|'),
        pass:
          pageState.container === true &&
          requiredHeaders.every((header, index) => pageState.headers[index] === header) &&
          pageState.headers.length === requiredHeaders.length,
      }));
      await this.check('冒烟-S1-② 列表查询正常：按 ROOM ID 仅显示 1 条房间 6666 配置且字段为 33/11', async () => ({
        expect: 'count=1;priority=33;userNum=11;visible=true',
        real: `count=${queryState.count};priority=${queryState.priority};userNum=${queryState.userNum};visible=${queryState.visible}`,
        pass: queryState.count === 1 && queryState.priority === '33' && queryState.userNum === '11' && queryState.visible === true,
      }));

      // ==================== 冒烟：多选列与批量删除入口/禁用态 ====================
      let selectionState = { visible: false, before: true, afterSelect: true, afterUnselect: true, checked: -1 };
      await this.act('冒烟 检查多选列与批量删除按钮禁用态，勾选/取消一行但不执行删除', async () => {
        const checkbox = this.rows().first().locator('.el-checkbox').first();
        const before = await this.buttonDisabled('批量删除');
        await this.selectRow(0);
        const afterSelect = await this.buttonDisabled('批量删除');
        const checked = await this.checkedRowCount();
        await this.shot('冒烟-勾选一行');
        await this.selectRow(0);
        const afterUnselect = await this.buttonDisabled('批量删除');
        selectionState = {
          visible: await checkbox.isVisible(),
          before,
          afterSelect,
          afterUnselect,
          checked,
        };
      });
      await this.check('冒烟-S2-① 多选列可见，未勾选时「批量删除」按钮禁用', async () => ({
        expect: 'visible=true;disabled=true',
        real: `visible=${selectionState.visible};disabled=${selectionState.before}`,
        pass: selectionState.visible === true && selectionState.before === true,
      }));
      await this.check('冒烟-S2-② 勾选 1 行后「批量删除」启用，取消勾选后恢复禁用', async () => ({
        expect: 'checked=1;afterSelect=false;afterUnselect=true',
        real: `checked=${selectionState.checked};afterSelect=${selectionState.afterSelect};afterUnselect=${selectionState.afterUnselect}`,
        pass: selectionState.checked === 1 && selectionState.afterSelect === false && selectionState.afterUnselect === true,
      }));

      // ==================== 冒烟：单条删除 ====================
      let deleteState = { toast: '', pageCount: -1, dataCount: -1, errorToast: -1 };
      await this.act('冒烟 点击目标行「删除」并在确认框确认', async () => {
        // 页面单条删除使用原生 confirm()，Playwright 默认自动取消，必须先注册接受
        this.p.once('dialog', (dialog) => void dialog.accept());
        await this.rowByRoom(ROOM_ID).getByRole('button', { name: '删除' }).click();
        await this.confirmIfPresent();
        deleteState.toast = await this.waitToast('Operation succeed');
        await this.waitListIdle();
        deleteState.pageCount = await this.rowByRoom(ROOM_ID).count();
        deleteState.dataCount = (await this.broadData(`&roomId=${ROOM_ID}`)).rows.length;
        deleteState.errorToast = await this.errorToastCount();
        this.created = this.created.filter((id) => id !== ROOM_ID);
        await this.shot('冒烟-单条删除后');
      });
      await this.check('冒烟-S3-① 单条删除正常：出现成功提示，目标记录从列表与数据中删除，无错误提示', async () => ({
        expect: 'toast=Operation succeed;pageCount=0;dataCount=0;errorToast=0',
        real: `toast=${deleteState.toast};pageCount=${deleteState.pageCount};dataCount=${deleteState.dataCount};errorToast=${deleteState.errorToast}`,
        pass:
          deleteState.toast === 'Operation succeed' &&
          deleteState.pageCount === 0 &&
          deleteState.dataCount === 0 &&
          deleteState.errorToast === 0,
      }));

      // ==================== #233 核心回归：导入选择文件 ====================
      let fileSelected = false;
      let rootPost: PageRequest | null = null;
      let consoleAtSelect = 0;
      let badAtSelect = 0;
      let selectionErrors: { type: string; text: string; url: string }[] = [];
      let selectionBad405: { method: string; url: string; status: number }[] = [];
      await this.act('#233 预检房间 6666 无配置，打开「上传模版」并选择 1 条配置的 xlsx', async () => {
        await this.assertAbsent(ROOM_ID);
        await this.openBroad();
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Sheet1');
        sheet.addRow(['房间ID', '优先级', '日广播邀请人数']);
        sheet.addRow([ROOM_ID, 12, 30]);
        this.tempFile = join(this.evidenceDir, `broad-import-233-${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(this.tempFile);

        await this.button('上传模版').click();
        const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '通过文件批量广播召人配置' }).last();
        await dialog.waitFor({ state: 'visible', timeout: 10000 });
        consoleAtSelect = this.consoleEntries.length;
        badAtSelect = this.badResponses.length;
        const rootPostProbe = this.rootPostWithin(2500);
        await dialog.locator('input[type="file"]').setInputFiles(this.tempFile);
        const fileName = this.tempFile.split('/').pop()!;
        await dialog.getByText(fileName, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
        fileSelected = true;
        // 负向断言观察：等待可能出现的根路径 POST 事件并留出 console/响应落痕时间（超时即视为未发生）
        rootPost = await rootPostProbe;
        selectionErrors = this.consoleErrorsSince(consoleAtSelect);
        selectionBad405 = this.badResponses.slice(badAtSelect).filter((item) => item.status === 405);
        this.log(`选择文件后：根路径POST=${rootPost ? rootPost.url : '无'}；console error=${selectionErrors.length}；HTTP405=${selectionBad405.length}`);
        await this.shot('#233-选择文件后');
        await dialog.screenshot({ path: join(this.evidenceDir, '#233-上传弹窗-已选择文件.png') }).catch(() => undefined);
      });
      await this.check('#233-① 选择文件后无任何向页面根路径的 POST（原缺陷路径）', async () => ({
        expect: 'rootPost=0',
        real: `fileSelected=${fileSelected};rootPost=${rootPost ? `${rootPost.method} ${rootPost.url}` : '0'}`,
        pass: fileSelected === true && rootPost === null,
      }));
      await this.check('#233-② 选择文件后 console 无 405、无新增 error，且无 405 响应', async () => ({
        expect: 'consoleError=0;http405=0',
        real: `consoleError=${selectionErrors.length};http405=${selectionBad405.length}${selectionErrors.length ? `;errors=${selectionErrors.map((e) => e.text).join(' || ')}` : ''}`,
        pass: selectionErrors.length === 0 && selectionBad405.length === 0,
      }));

      // ==================== #233 核心回归：Confirm 导入 ====================
      let uploadRequests = 0;
      let uploadResponse = { status: 0, body: '' };
      let importToast = '';
      let importRow = { count: -1, priority: '', userNum: '' };
      let importVisible = false;
      await this.act('#233 点击 Confirm 导入并等待成功提示与列表刷新', async () => {
        const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '通过文件批量广播召人配置' }).last();
        await dialog.waitFor({ state: 'visible', timeout: 10000 });
        const responsePromise = this.p
          .waitForResponse((item) => item.url().includes('/api/voiceroom/broad/uploadBroad') && item.request().method() === 'POST', {
            timeout: 60000,
          })
          .catch(() => null);
        await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
        const response = await responsePromise;
        if (!response) throw new Error('未捕获 /api/voiceroom/broad/uploadBroad 响应');
        uploadResponse = { status: response.status(), body: (await response.text()).slice(0, 2000) };
        this.created.push(ROOM_ID);
        importToast = await this.waitToast('上传成功');
        await this.waitListIdle();
        await this.fillByPlaceholder('ROOM ID', String(ROOM_ID));
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        importRow = await this.rowFields(ROOM_ID);
        importVisible = await this.rowByRoom(ROOM_ID).isVisible();
        const uploadCalls = this.pageRequests.filter((item) => item.url.includes('/api/voiceroom/broad/uploadBroad') && item.method === 'POST');
        uploadRequests = uploadCalls.length;
        this.log(`Confirm 后：uploadBroad 请求数=${uploadRequests}；响应 HTTP=${uploadResponse.status}；body=${uploadResponse.body}`);
        await this.shot('#233-导入成功列表');
        await this.rowByRoom(ROOM_ID).screenshot({ path: join(this.evidenceDir, '#233-导入目标行.png') }).catch(() => undefined);
      });
      let uploadJson: any = {};
      try {
        uploadJson = JSON.parse(uploadResponse.body);
      } catch {
        uploadJson = {};
      }
      await this.check('#233-③ 点击 Confirm 后仅 1 次调用 /api/voiceroom/broad/uploadBroad 且响应成功', async () => ({
        expect: 'requests=1;http=200;status=0',
        real: `requests=${uploadRequests};http=${uploadResponse.status};status=${String(uploadJson.status ?? '')};msg=${String(uploadJson.msg ?? '')}`,
        pass: uploadRequests === 1 && uploadResponse.status === 200 && String(uploadJson.status) === '0',
      }));
      await this.check('#233-④ 导入成功提示「上传成功」', async () => ({
        expect: '上传成功!',
        real: importToast,
        pass: importToast === '上传成功!',
      }));
      await this.check('#233-⑤ 列表刷新生成 1 条房间 6666 配置，优先级 12、日广播邀请人数 30', async () => ({
        expect: 'count=1;priority=12;userNum=30;visible=true',
        real: `count=${importRow.count};priority=${importRow.priority};userNum=${importRow.userNum};visible=${importVisible}`,
        pass: importRow.count === 1 && importRow.priority === '12' && importRow.userNum === '30' && importVisible === true,
      }));

      // ==================== 全流程 console / HTTP 基线 ====================
      await this.act('#233 汇总全流程 console 与 HTTP 异常（排除登录 /admin/init 404 基线）', async () => {
        const rootPosts = this.pageRequests.filter((item) => this.isRootPost(item));
        const uploadCalls = this.pageRequests.filter((item) => item.url.includes('/api/voiceroom/broad/uploadBroad') && item.method === 'POST');
        const lines = [
          '# #233 回归网络与 console 留痕（脱敏）',
          '',
          `- 执行时间：${new Date().toISOString()}`,
          `- 前端入口：${this.baseline.entryJs}（Last-Modified ${this.baseline.lastModified}）`,
          `- 页面请求总数（登录后采集）：${this.pageRequests.length}`,
          `- 向页面根路径的 POST 数：${rootPosts.length}`,
          `- uploadBroad POST 数：${uploadCalls.length}`,
          `- console 总条目：${this.consoleEntries.length}；已知 /admin/init 404 基线：${this.consoleEntries.filter((item) => this.isKnownConsoleBaseline(item)).length}；新增 error：${this.newConsoleErrors().length}`,
          `- HTTP >=400 总条目：${this.badResponses.length}；排除 /admin/init 404 后新增：${this.newBadResponses().length}`,
          '',
          '## 页面请求（登录后）',
          '',
          '| 时间 | 方法 | URL |',
          '| --- | --- | --- |',
          ...this.pageRequests.map((item) => `| ${new Date(item.time).toISOString()} | ${item.method} | ${item.url} |`),
          '',
          '## console error / warning',
          '',
          '| 时间 | 类型 | 基线 | 文本 | 位置 |',
          '| --- | --- | --- | --- | --- |',
          ...this.consoleEntries.map(
            (item) => `| ${item.time ?? '-'} | ${item.type} | ${this.isKnownConsoleBaseline(item) ? '已知 /admin/init 404' : '新增'} | ${item.text.replace(/\n/g, ' ').slice(0, 300)} | ${item.url} |`,
          ),
          '',
          '## HTTP >=400',
          '',
          '| 时间 | 方法 | URL | 状态 |',
          '| --- | --- | --- | --- |',
          ...this.badResponses.map((item) => `| ${item.time} | ${item.method} | ${item.url} | ${item.status} |`),
        ];
        writeFileSync(join(this.evidenceDir, 'network-233.md'), lines.join('\n'), 'utf8');
        this.notes.push(`network-233.md 已生成：根路径POST=${rootPosts.length}；uploadBroad=${uploadCalls.length}`);
        this.notes.push(
          `console 总条目=${this.consoleEntries.length}；已知基线=${this.consoleEntries.filter((item) => this.isKnownConsoleBaseline(item)).length}；新增 error=${this.newConsoleErrors().length}`,
        );
        this.notes.push(`HTTP >=400 总条目=${this.badResponses.length}；排除 /admin/init 404 后新增=${this.newBadResponses().length}`);
        await this.shot('#233-回归结束页面');
      });
      const newErrors = this.newConsoleErrors();
      const newBad = this.newBadResponses();
      await this.check('#233-⑥ 全流程新增 console error 为 0（登录 /admin/init 404 为已知基线）', async () => ({
        expect: 'newConsoleError=0',
        real: `newConsoleError=${newErrors.length}${newErrors.length ? `;entries=${newErrors.map((e) => `${e.text}@${e.url}`).join(' || ')}` : ''}`,
        pass: newErrors.length === 0,
      }));
      await this.check('#233-⑦ 全流程无新增 HTTP 4xx/5xx 异常（排除 /admin/init 404 基线）', async () => ({
        expect: 'newHttpError=0',
        real: `newHttpError=${newBad.length}${newBad.length ? `;entries=${newBad.map((e) => `${e.status} ${e.method} ${e.url}`).join(' || ')}` : ''}`,
        pass: newBad.length === 0,
      }));

      // ==================== 清理 ====================
      await this.act('#233 清理导入的测试配置并确认无残留', async () => {
        await this.batchDeleteViaApi([ROOM_ID]);
        const residual = (await this.broadData(`&roomId=${ROOM_ID}`)).rows.length;
        if (residual !== 0) throw new Error(`清理后房间 ${ROOM_ID} 仍有 ${residual} 条配置`);
        this.log(`清理完成：房间 ${ROOM_ID} 残留=0`);
      });
    } finally {
      if (this.tempFile) rmSync(this.tempFile, { force: true });
      for (const roomId of [...this.created]) {
        try {
          await this.batchDeleteViaApi([roomId]);
        } catch (error) {
          this.log(`finally 清理房间 ${roomId} 失败: ${(error as Error).message}`);
        }
      }
      const residual = await this.broadData(`&roomId=${ROOM_ID}`).then((data) => data.rows.length).catch(() => -1);
      this.log(`finally 残留检查：房间 ${ROOM_ID} 记录数=${residual}`);
    }
  }
}

const instance = new BroadImport233Regression();
await instance.execute();
