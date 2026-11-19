/**
 * 项目 105 / WO-0035：Admin「游戏入口配置」导出（用例#37~#39）
 * 用例来源：TK-0409 HANDOFF v6 九列用例；技术方案：/task/20261119/TK-0409/TECH_DESIGN（v1.2）
 * 覆盖：#37 无条件导出（8 列/文件名/全量 1003 行/无副作用）；#38 UID 条件导出；#39 日期条件导出
 * 数据隔离：导出为只读下载；#38 自建 UID 用后页面删除；存量 1003 条只读。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-game-entry-config/tests/tc07-export.test.ts
 */
import { GameEntryBase } from './lib/game-entry-base.ts';
import type { ExportResult } from './lib/game-entry-base.ts';

const U1 = '19440456';
const STOCK_DATE = '2026-10-19';
const EXPECTED_HEADERS = ['User Id', 'User No', 'Locale', 'Country Code', 'Country Name', 'VIP Level', 'Create Time', 'Create By'];

class ExportCase extends GameEntryBase {
  constructor() { super('tc07-export'); this.total = 18; }

  private async enterPage(): Promise<void> {
    await this.newSession(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    await this.gotoPageDirect(this.page!);
  }

  private async ensureAbsent(uid: string): Promise<void> {
    await this.queryByUid(uid);
    if ((await this.rowCount()) > 0) await this.deleteFiltered(true);
  }

  private async addUid(uid: string): Promise<void> {
    await this.openAddDialog();
    await this.submitAdd(uid);
    await this.closeAddDialog();
  }

  private async cleanupUid(uid: string): Promise<void> {
    await this.queryByUid(uid);
    if ((await this.rowCount()) > 0) await this.deleteFiltered(true);
  }

  private filenameOk(name: string): boolean {
    return /^game_entry_whitelist_\d+\.xlsx$/.test(name);
  }

  protected async run(): Promise<void> {
    // ===== 用例#37 无条件导出 =====
    await this.act('用例#37 步骤1~3 进入页面（无筛选）并点击导出全部，等待下载完成', async () => {
      await this.enterPage();
      this.beforeTotal = await this.totalText();
      this.beforeRows = await this.rowCount();
      this.exportResult = await this.exportAll();
      this.noteEvidence(this.exportResult.savedTo);
      await this.shot('case37-after-export', true);
    });
    await this.check('用例#37-① 浏览器下载文件名形如 game_entry_whitelist_{时间戳}.xlsx', async () => {
      return { expect: 'game_entry_whitelist_{时间戳}.xlsx', real: this.exportResult!.filename, pass: this.filenameOk(this.exportResult!.filename) };
    });
    await this.check('用例#37-② 文件表头共 8 列：User Id/User No/Locale/Country Code/Country Name/VIP Level/Create Time/Create By', async () => {
      const h = this.exportResult!.headers;
      return { expect: EXPECTED_HEADERS.join(' | '), real: h.join(' | '), pass: JSON.stringify(h) === JSON.stringify(EXPECTED_HEADERS) };
    });
    await this.check('用例#37-③ 文件数据行数=1003（导出全部有效白名单，不受页面每页 20 行分页限制）', async () => {
      const n = this.exportResult!.rowCount;
      return { expect: '1003（且 ≠ 20）', real: String(n), pass: n === 1003 && n !== 20 };
    });
    await this.check('用例#37-④ 导出后页面列表与 Total 无变化', async () => {
      const [n, t] = [await this.rowCount(), await this.totalText()];
      return { expect: `${this.beforeRows} 行 / ${this.beforeTotal}`, real: `${n} 行 / ${t}`, pass: n === this.beforeRows && t === this.beforeTotal };
    });

    // ===== 用例#38 UID 条件导出 =====
    await this.act(`用例#38 前置 确认 ${U1} 不在白名单并页面添加`, async () => {
      await this.newSession(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
      await this.gotoPageDirect(this.page!);
      await this.ensureAbsent(U1);
      await this.addUid(U1);
    });
    await this.act(`用例#38 步骤2~3 输入 ${U1} 查询（列表 1 行）`, async () => {
      await this.queryByUid(U1);
      await this.shot('case38-filtered-list', true);
    });
    await this.act('用例#38 步骤4~5 点击导出全部并等待下载完成，打开文件核对', async () => {
      this.exportResult = await this.exportAll();
      this.noteEvidence(this.exportResult.savedTo);
      this.dumpJson('case38-export-summary.json', {
        filename: this.exportResult.filename,
        rowCount: this.exportResult.rowCount,
        firstUserIds: this.exportResult.userIds.slice(0, 3),
        headers: this.exportResult.headers
      });
    });
    await this.check('用例#38-① 文件名形如 game_entry_whitelist_{时间戳}.xlsx', async () => {
      return { expect: 'game_entry_whitelist_{时间戳}.xlsx', real: this.exportResult!.filename, pass: this.filenameOk(this.exportResult!.filename) };
    });
    await this.check(`用例#38-② 文件数据行数=1 且该行 User Id=${U1}（按当前筛选导出）`, async () => {
      const r = this.exportResult!;
      return {
        expect: `1 行且 User Id=${U1}`,
        real: `${r.rowCount} 行；前 3 个 User Id=${r.userIds.slice(0, 3).join(',')}`,
        pass: r.rowCount === 1 && r.userIds[0] === U1
      };
    });
    await this.check('用例#38-③ 文件表头 8 列与用例#37-②一致', async () => {
      const h = this.exportResult!.headers;
      return { expect: EXPECTED_HEADERS.join(' | '), real: h.join(' | '), pass: JSON.stringify(h) === JSON.stringify(EXPECTED_HEADERS) };
    });
    await this.act(`用例#38 清理 页面删除自建 ${U1}`, async () => { await this.cleanupUid(U1); });

    // ===== 用例#39 日期范围条件导出 =====
    await this.act('用例#39 步骤1~2 进入页面并选择存量日期 2026-10-19 为起止日期', async () => {
      await this.enterPage();
      await this.clickReset();
      await this.pickDateRange(STOCK_DATE, STOCK_DATE);
    });
    await this.act('用例#39 步骤3~4 查询并记录分页 Total', async () => {
      await this.clickQuery();
      this.pageTotalForDate = await this.totalNumber();
      this.beforeRows = await this.rowCount();
      await this.shot('case39-stock-date-list', true);
    });
    await this.act('用例#39 步骤5~6 点击导出全部并打开文件核对', async () => {
      this.exportResult = await this.exportAll();
      this.noteEvidence(this.exportResult.savedTo);
      this.dumpJson('case39-export-summary.json', {
        filename: this.exportResult.filename,
        rowCount: this.exportResult.rowCount,
        pageTotal: this.pageTotalForDate,
        firstCreateTimes: this.exportResult.createTimes.slice(0, 3),
        outOfRange: this.exportResult.createTimes.filter((t) => !t.startsWith(STOCK_DATE)).length
      });
    });
    await this.check('用例#39-① 文件名形如 game_entry_whitelist_{时间戳}.xlsx', async () => {
      return { expect: 'game_entry_whitelist_{时间戳}.xlsx', real: this.exportResult!.filename, pass: this.filenameOk(this.exportResult!.filename) };
    });
    await this.check('用例#39-② 文件数据行数=页面查询时 Total 显示值', async () => {
      const r = this.exportResult!;
      return { expect: String(this.pageTotalForDate), real: String(r.rowCount), pass: r.rowCount === this.pageTotalForDate };
    });
    await this.check(`用例#39-③ 文件所有行 Create Time 均在所选日期 ${STOCK_DATE} 内`, async () => {
      const r = this.exportResult!;
      const bad = r.createTimes.filter((t) => !t.startsWith(STOCK_DATE));
      return { expect: `全部以 ${STOCK_DATE} 开头`, real: `共 ${r.createTimes.length} 行，范围外 ${bad.length} 行；范围外样例 ${bad.slice(0, 3).join(' | ')}`, pass: bad.length === 0 };
    });
  }

  private exportResult: ExportResult | null = null;
  private beforeRows = 0;
  private beforeTotal = '';
  private pageTotalForDate = -1;
}

await new ExportCase().execute();
