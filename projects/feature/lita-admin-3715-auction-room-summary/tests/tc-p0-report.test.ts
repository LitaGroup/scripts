/**
 * 拍拍模式流水-房间维度：P0 主路径（UI）
 *
 * 覆盖用例（项目 3715 / 提测 51）：
 * - TC-AUTH-01 有权限账号可见菜单并进入报表页（P0）
 * - TC-UI-01 首屏不自动查询并展示空态（P0）
 * - TC-UI-02 未选日期查询被拦截（P0）
 * - TC-UI-03 单日查询结果与基线一致（P0）
 * - TC-UI-06 导出 Excel 与页面一致（P0）
 * - TC-UI-07 12 列表头完整（P0）
 * - TC-FILTER-01 大区单选筛选生效（P0）
 * - TC-FILTER-02 房间 ID 批量筛选生效（P0）
 * - TC-FILTER-03 单房间指标基线（P0）
 *
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-p0-report.test.ts [--evidence-dir=...]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const TOTALS = { sessions: 35, ended: 35, success: 21, failure: 14, coins: 728846.4 };
const HEADERS = [
  'Date', 'Room id', 'Room nick',
  'Total Auction Sessions', 'Total Auction Sessions - End',
  'Total Auction Sessions - Success', 'Total Auction Sessions - Failure',
  'Auction Total coins', 'Auction coins - Success', 'Auction coins - Failure',
  'Number of players in Auction', 'Number of users in Auction'
];
const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

class P0ReportTest extends AdminBase {
  constructor() {
    super('auction-room-summary-p0');
    this.total = 11;
  }

  private queryCount(): number {
    return this.calls.filter((c) => c.path.includes('/stats/query') && !c.path.includes('download')).length;
  }

  private async openFromMenu(): Promise<void> {
    await this.expandMenu('数据统计管理');
    await this.expandMenu('语音房相关数据');
    await this.page!.locator('.el-menu-item', { hasText: '拍拍模式流水-房间维度' }).first().click();
    await this.page!.waitForTimeout(4000);
    await this.page!.waitForSelector('.filter-card', { timeout: 30000 });
    await this.page!.waitForTimeout(1000);
  }

  private async reset(): Promise<void> {
    await this.page!.getByRole('button', { name: '重置', exact: true }).click();
    await this.page!.waitForTimeout(800);
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- TC-AUTH-01 ----------
    const menuItem = this.page!.locator('.el-menu-item', { hasText: '拍拍模式流水-房间维度' }).first();
    const menuVisible = (await menuItem.count()) > 0;
    await this.shot('auth01-menu-visible');
    await this.openFromMenu();
    const title = await this.page!.locator('.page-title').innerText().catch(() => '');
    const hash = await this.page!.evaluate(() => location.hash);
    await this.shot('auth01-report-opened');
    await this.check('用例#TC-AUTH-01-① 有权限账号可见菜单并进入报表页', async (): Promise<CheckResult> => {
      return {
        expect: '菜单可见「拍拍模式流水-房间维度」，点击进入报表页',
        real: `菜单可见=${menuVisible}，hash=${hash}，页面标题=${title}`,
        pass: menuVisible && hash.includes('auction-mode-room-summary') && title.includes('拍拍模式流水')
      };
    });

    // ---------- TC-UI-01 ----------
    const empty = await this.emptyText();
    await this.check('用例#TC-UI-01-① 首屏不自动查询且提示「请输入查询条件后查看数据」', async (): Promise<CheckResult> => {
      return {
        expect: '不自动发起查询；空态「请输入查询条件后查看数据」',
        real: `query 请求=${this.queryCount()}，空态=${empty}`,
        pass: this.queryCount() === 0 && empty.includes('请输入查询条件后查看数据')
      };
    });

    // ---------- TC-UI-02 ----------
    const before = this.queryCount();
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    const msg = await this.messageText();
    await this.shot('ui02-date-required');
    await this.check('用例#TC-UI-02-① 未选日期查询被拦截并提示选择开始日期', async (): Promise<CheckResult> => {
      return {
        expect: '提示「请选择开始日期」，不发查询请求',
        real: `提示=${msg}，query 请求增量=${this.queryCount() - before}`,
        pass: msg.includes('请选择开始日期') && this.queryCount() === before
      };
    });

    // ---------- TC-UI-03 ----------
    await this.pickDate('开始日期', 8);
    await this.pickDate('结束日期', 8);
    const q1 = this.queryCount();
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    await this.shot('ui03-query-1108');
    const rows = await this.tableRows();
    const rows18 = rows.length === 18 && (await this.paginationTotal()) === 18;
    const sum = (idx: number) => rows.reduce((acc, r) => acc + num(r[idx]), 0);
    const totals = {
      sessions: sum(3), ended: sum(4), success: sum(5), failure: sum(6), coins: sum(7)
    };
    await this.check('用例#TC-UI-03-① 2026-11-08 查询返回 18 行', async (): Promise<CheckResult> => {
      return { expect: '18 行', real: `表格行=${rows.length}，分页 Total=${await this.paginationTotal()}，query 请求增量=${this.queryCount() - q1}`, pass: rows18 };
    });
    await this.check('用例#TC-UI-03-② 合计总场次 35 / 结束 35 / 成功 21 / 失败 14 / 总流水 728,846.40 且成功+失败=结束', async (): Promise<CheckResult> => {
      return {
        expect: JSON.stringify(TOTALS),
        real: JSON.stringify(totals),
        pass: totals.sessions === TOTALS.sessions && totals.ended === TOTALS.ended && totals.success === TOTALS.success &&
          totals.failure === TOTALS.failure && Math.abs(totals.coins - TOTALS.coins) < 0.01 &&
          totals.success + totals.failure === totals.ended
      };
    });

    // ---------- TC-UI-07 ----------
    const headers = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.check('用例#TC-UI-07-① 12 列表头完整且无单字母截断', async (): Promise<CheckResult> => {
      return {
        expect: HEADERS.join('|'),
        real: headers.join('|'),
        pass: headers.length === 12 && HEADERS.every((h, i) => headers[i].toLowerCase() === h.toLowerCase()) && !headers.some((h) => h.length === 1)
      };
    });

    // ---------- TC-UI-06 ----------
    const dlDir = this.evidenceDir;
    const respPromise = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query/download'), { timeout: 120000 }
    );
    const dlNamePromise = this.page!.waitForEvent('download', { timeout: 120000 }).then((d) => d.suggestedFilename()).catch(() => '');
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const exportResp = await respPromise;
    const suggested = await dlNamePromise;
    let fileName = '';
    let exportRows = 0;
    let exportCols = 0;
    let exportTotals = { sessions: 0, success: 0, failure: 0, coins: 0 };
    if (exportResp) {
      const cd = exportResp.headers()['content-disposition'] ?? '';
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      fileName = suggested || (m ? decodeURIComponent(m[1]) : '');
      const buf = Buffer.from(await exportResp.body());
      const path = join(dlDir, `export-${Date.now()}.xlsx`);
      writeFileSync(path, buf);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(path);
      const ws = wb.worksheets[0];
      exportCols = ws.columnCount;
      const excelRows: string[][] = [];
      ws.eachRow((row) => {
        const values: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => values.push(String(cell.value ?? '')));
        excelRows.push(values);
      });
      // 导出文件含 2 行表头（分组表头），数据行从第 3 行开始
      const data = excelRows.slice(2).filter((r) => r.some((v) => v !== ''));
      exportRows = data.length;
      this.notes.push(`导出表头行: ${JSON.stringify(excelRows.slice(0, 2).map((r) => r.slice(0, 3)))}`);
      const sumIdx = (i: number) => data.reduce((acc, r) => acc + num(r[i]), 0);
      exportTotals = { sessions: sumIdx(3), success: sumIdx(5), failure: sumIdx(6), coins: sumIdx(7) };
    }
    await this.shot('ui06-export-clicked');
    await this.check('用例#TC-UI-06-① 导出文件名含「拍拍模式流水 - 房间维度」，18 行 × 12 列且合计与页面一致', async (): Promise<CheckResult> => {
      const nameOk = /拍拍模式流水\s*-\s*房间维度/.test(fileName);
      const totalsOk = exportTotals.sessions === TOTALS.sessions && exportTotals.success === TOTALS.success &&
        exportTotals.failure === TOTALS.failure && Math.abs(exportTotals.coins - TOTALS.coins) < 0.01;
      return {
        expect: '文件名含「拍拍模式流水 - 房间维度」；18 行 × 12 列；合计 35/21/14/728,846.40',
        real: `文件名=${fileName}，行=${exportRows}，列=${exportCols}，合计=${JSON.stringify(exportTotals)}`,
        pass: nameOk && exportRows === 18 && exportCols === 12 && totalsOk
      };
    });

    // ---------- TC-FILTER-03 ----------
    await this.reset();
    await this.pickDate('开始日期', 2);
    await this.pickDate('结束日期', 9);
    await this.fillField('房间ID', '17100109');
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    await this.shot('filter03-single-room');
    const r3 = await this.tableRows();
    await this.check('用例#TC-FILTER-03-① 单房间 17100109 返回 1 行且指标与基线一致', async (): Promise<CheckResult> => {
      const cells = r3[0] ?? [];
      const got = { sessions: num(cells[3]), ended: num(cells[4]), success: num(cells[5]), failure: num(cells[6]),
        coins: num(cells[7]), successCoins: num(cells[8]), failCoins: num(cells[9]) };
      return {
        expect: '1 行；9/9/2/7/4,004.30/4,000.00/4.30，Room id=17100109',
        real: `行=${r3.length}，${JSON.stringify(got)}，Room id=${cells[1]}`,
        pass: r3.length === 1 && String(cells[1]) === '17100109' && got.sessions === 9 && got.ended === 9 &&
          got.success === 2 && got.failure === 7 && Math.abs(got.coins - 4004.3) < 0.01 &&
          Math.abs(got.successCoins - 4000) < 0.01 && Math.abs(got.failCoins - 4.3) < 0.01
      };
    });

    // ---------- TC-FILTER-02 ----------
    await this.reset();
    await this.pickDate('开始日期', 2);
    await this.pickDate('结束日期', 9);
    await this.fillField('房间ID', '17100109,101040');
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    await this.shot('filter02-room-batch');
    const r2 = await this.tableRows();
    const ids2 = r2.map((r) => String(r[1]));
    await this.check('用例#TC-FILTER-02-① 房间 ID 批量筛选仅返回指定房间', async (): Promise<CheckResult> => {
      return {
        expect: '仅返回 17100109/101040（有数据的行），不返回其它房间',
        real: `行=${r2.length}，Room id=${JSON.stringify(ids2)}`,
        pass: r2.length > 0 && r2.length <= 2 && ids2.every((id) => id === '17100109' || id === '101040')
      };
    });

    // ---------- TC-FILTER-01 ----------
    await this.reset();
    await this.pickDate('开始日期', 2);
    await this.pickDate('结束日期', 9);
    await this.pickOption('大区', '印尼语区');
    const isMultiple = await this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '大区' }) })
      .locator('.el-select').first().evaluate((el) => el.classList.contains('el-select--multiple') || !!el.querySelector('.el-select__tags'));
    await this.clickQuery();
    await this.page!.waitForTimeout(3000);
    await this.shot('filter01-locale-in');
    const r1 = await this.tableRows();
    await this.check('用例#TC-FILTER-01-① 大区 in 单选取数生效（30 房）且控件非多选', async (): Promise<CheckResult> => {
      return {
        expect: '仅返回 in 大区房间 30 行；大区控件为单选',
        real: `当前页行=${r1.length}，分页 Total=${await this.paginationTotal()}，多选控件=${isMultiple}`,
        pass: (await this.paginationTotal()) === 30 && !isMultiple
      };
    });
  }
}

new P0ReportTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
