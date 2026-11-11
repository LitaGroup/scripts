/**
 * 拍拍模式流水-房间维度：P0 主路径（UI）
 *
 * 用例来源：TK-0207 交付文档 `/task/20261111/TK-0207/HANDOFF`（九列用例 1~18）
 * 技术方案：`/task/20261111/TK-0207/TECH_DESIGN`
 *
 * 覆盖：
 * - 序号1  TC-AUTH-01 有权限账号可见菜单并进入报表页（P0，2 检查点）
 * - 序号4  TC-UI-01 首屏不自动查询并展示初始空态（P0，3 检查点）
 * - 序号5  TC-UI-02 未选日期查询被拦截（P0，2 检查点）
 * - 序号6  TC-UI-03 单日 2026-11-08 查询基线（P0，3 检查点）
 * - 序号9  TC-UI-06 导出 Excel 与页面一致（P0，3 检查点）
 * - 序号10 TC-UI-07 12 列表头完整（P0，2 检查点）
 * - 序号11 TC-FILTER-01 大区单选（P0，2 检查点）
 * - 序号12 TC-FILTER-02 房间 ID 批量（逗号/换行两数据行，各 2 检查点）
 * - 序号13 TC-FILTER-03 单房间指标基线（P0，2 检查点）
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
    this.total = 23;
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
    await this.page!.waitForTimeout(1000);
  }

  private async conditionCount(): Promise<number> {
    const text = await this.page!.locator('.app-main').innerText().catch(() => '');
    const m = text.match(/当前已设置查询条件[：:]\s*(\d+)\s*项/);
    return m ? Number(m[1]) : -1;
  }

  private async setDateExact(label: string, value: string): Promise<void> {
    const field = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
    const input = field.locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.page!.locator('.page-title').first().click().catch(() => undefined);
    await this.page!.waitForTimeout(400);
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- 序号1 TC-AUTH-01 ----------
    const menuItem = this.page!.locator('.el-menu-item', { hasText: '拍拍模式流水-房间维度' }).first();
    const menuVisible = (await menuItem.count()) > 0;
    await this.shot('auth01-menu-visible');
    await this.check('用例#1-①(TC-AUTH-01) 语音房相关数据下可见「拍拍模式流水-房间维度」菜单', async (): Promise<CheckResult> => {
      return {
        expect: '菜单项「拍拍模式流水-房间维度」可见',
        real: `菜单可见=${menuVisible}`,
        pass: menuVisible
      };
    });
    await this.openFromMenu();
    const title = await this.page!.locator('.page-title').innerText().catch(() => '');
    const hash = await this.page!.evaluate(() => location.hash);
    await this.shot('auth01-report-opened');
    await this.check('用例#1-②(TC-AUTH-01) 点击菜单进入报表页，路由含 voice-room-data/auction-mode-room-summary 且标题正确', async (): Promise<CheckResult> => {
      return {
        expect: 'hash 含 voice-room-data/auction-mode-room-summary，标题「拍拍模式流水 - 房间维度」',
        real: `hash=${hash}，页面标题=${title}`,
        pass: hash.includes('voice-room-data/auction-mode-room-summary') && title.includes('拍拍模式流水')
      };
    });

    // ---------- 序号4 TC-UI-01 ----------
    const empty = await this.emptyText();
    const total0 = await this.paginationTotal();
    const rows0 = await this.tableRows();
    const cond0 = await this.conditionCount();
    const q0 = this.queryCount();
    await this.check('用例#4-①(TC-UI-01) 首屏表格区域显示「请输入查询条件后查看数据」', async (): Promise<CheckResult> => {
      return {
        expect: '空态「请输入查询条件后查看数据」',
        real: `空态=${empty}`,
        pass: empty.includes('请输入查询条件后查看数据')
      };
    });
    await this.check('用例#4-②(TC-UI-01) 首屏分页 Total 0 且无数据行', async (): Promise<CheckResult> => {
      return {
        expect: '分页 Total 0，无数据行',
        real: `分页 Total=${total0}，数据行=${rows0.length}`,
        pass: total0 === 0 && rows0.length === 0
      };
    });
    await this.check('用例#4-③(TC-UI-01) 首屏条件计数 0 项且未自动发起查询', async (): Promise<CheckResult> => {
      return {
        expect: '条件计数「当前已设置查询条件：0 项」；首屏未自动查询',
        real: `条件计数=${cond0}，query 请求=${q0}`,
        pass: cond0 === 0 && q0 === 0
      };
    });

    // ---------- 序号5 TC-UI-02 ----------
    const before = this.queryCount();
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    const msg = await this.messageText();
    const empty2 = await this.emptyText();
    const total2 = await this.paginationTotal();
    await this.shot('ui02-date-required');
    await this.check('用例#5-①(TC-UI-02) 未选日期点击查询提示「请选择开始日期」', async (): Promise<CheckResult> => {
      return {
        expect: '提示「请选择开始日期」',
        real: `提示=${msg}`,
        pass: msg.includes('请选择开始日期')
      };
    });
    await this.check('用例#5-②(TC-UI-02) 表格仍为初始空态、Total 0 且未发起查询', async (): Promise<CheckResult> => {
      return {
        expect: '空态「请输入查询条件后查看数据」、Total 0，query 请求增量为 0',
        real: `空态=${empty2}，Total=${total2}，query 请求增量=${this.queryCount() - before}`,
        pass: empty2.includes('请输入查询条件后查看数据') && total2 === 0 && this.queryCount() === before
      };
    });

    // ---------- 序号6 TC-UI-03 ----------
    await this.setDateExact('开始日期', '2026-11-08');
    await this.setDateExact('结束日期', '2026-11-08');
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    await this.shot('ui03-query-1108');
    const rows = await this.tableRows();
    const totalRows = await this.paginationTotal();
    const sum = (idx: number) => rows.reduce((acc, r) => acc + num(r[idx]), 0);
    const totals = {
      sessions: sum(3), ended: sum(4), success: sum(5), failure: sum(6), coins: sum(7)
    };
    await this.check('用例#6-①(TC-UI-03) 2026-11-08 查询返回 18 行、分页 Total 18', async (): Promise<CheckResult> => {
      return {
        expect: '18 行，分页 Total 18',
        real: `表格行=${rows.length}，分页 Total=${totalRows}`,
        pass: rows.length === 18 && totalRows === 18
      };
    });
    await this.check('用例#6-②(TC-UI-03) 合计总场次 35 / 结束 35 / 成功 21 / 失败 14 / 总流水 728,846.40', async (): Promise<CheckResult> => {
      return {
        expect: JSON.stringify(TOTALS),
        real: JSON.stringify(totals),
        pass: totals.sessions === TOTALS.sessions && totals.ended === TOTALS.ended &&
          totals.success === TOTALS.success && totals.failure === TOTALS.failure &&
          Math.abs(totals.coins - TOTALS.coins) < 0.01
      };
    });
    await this.check('用例#6-③(TC-UI-03) 成功+失败=结束（21+14=35）', async (): Promise<CheckResult> => {
      return {
        expect: 'success + failure = ended（21+14=35）',
        real: `success=${totals.success}，failure=${totals.failure}，ended=${totals.ended}，success+failure=${totals.success + totals.failure}`,
        pass: totals.success + totals.failure === totals.ended
      };
    });

    // ---------- 序号10 TC-UI-07 ----------
    const headers = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.check('用例#10-①(TC-UI-07) 表头共 12 列', async (): Promise<CheckResult> => {
      return {
        expect: '表头 12 列',
        real: `表头列数=${headers.length}`,
        pass: headers.length === 12
      };
    });
    await this.check('用例#10-②(TC-UI-07) 12 列名逐项完整，含空格/连字符，无单字母截断', async (): Promise<CheckResult> => {
      return {
        expect: HEADERS.join('|'),
        real: headers.join('|'),
        pass: headers.length === 12 && HEADERS.every((h, i) => headers[i].toLowerCase() === h.toLowerCase()) &&
          !headers.some((h) => h.length === 1)
      };
    });

    // ---------- 序号9 TC-UI-06 ----------
    const dlDir = this.evidenceDir;
    const respPromise = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query/download'), { timeout: 120000 }
    );
    const dlNamePromise = this.page!.waitForEvent('download', { timeout: 120000 }).then((d) => d.suggestedFilename()).catch(() => '');
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const exportResp = await respPromise;
    const suggested = await dlNamePromise;
    const cd = exportResp?.headers()['content-disposition'] ?? '';
    let fileName = suggested;
    if (!fileName) {
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      fileName = m ? decodeURIComponent(m[1]) : '';
    }
    let exportRows = 0;
    let exportCols = 0;
    let exportTotals = { sessions: 0, success: 0, failure: 0, coins: 0 };
    if (exportResp) {
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
      const sumIdx = (i: number) => data.reduce((acc, r) => acc + num(r[i]), 0);
      exportTotals = { sessions: sumIdx(3), success: sumIdx(5), failure: sumIdx(6), coins: sumIdx(7) };
    }
    await this.shot('ui06-export-clicked');
    await this.check('用例#9-①(TC-UI-06) 下载文件名含「拍拍模式流水 - 房间维度」（空格非 +）、后缀 .xlsx', async (): Promise<CheckResult> => {
      const nameOk = /拍拍模式流水\s*-\s*房间维度/.test(fileName);
      return {
        expect: '文件名含「拍拍模式流水 - 房间维度」，空格不被编码为 +，后缀 .xlsx',
        real: `文件名=${fileName}，content-disposition=${cd.slice(0, 200)}`,
        pass: nameOk && fileName.toLowerCase().endsWith('.xlsx') && !fileName.includes('+')
      };
    });
    await this.check('用例#9-②(TC-UI-06) xlsx 为 18 数据行 × 12 列', async (): Promise<CheckResult> => {
      return {
        expect: '18 数据行 × 12 列',
        real: `数据行=${exportRows}，列=${exportCols}`,
        pass: exportRows === 18 && exportCols === 12
      };
    });
    await this.check('用例#9-③(TC-UI-06) xlsx 合计与页面一致（35/21/14/728846.4）', async (): Promise<CheckResult> => {
      return {
        expect: '合计 35/21/14/728846.4',
        real: JSON.stringify(exportTotals),
        pass: exportTotals.sessions === 35 && exportTotals.success === 21 &&
          exportTotals.failure === 14 && Math.abs(exportTotals.coins - TOTALS.coins) < 0.01
      };
    });

    // ---------- 序号13 TC-FILTER-03 ----------
    await this.reset();
    await this.setDateExact('开始日期', '2026-11-02');
    await this.setDateExact('结束日期', '2026-11-09');
    await this.fillField('房间ID', '17100109');
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    await this.shot('filter03-single-room');
    const r3 = await this.tableRows();
    await this.check('用例#13-①(TC-FILTER-03) 单房间 17100109 返回 1 行', async (): Promise<CheckResult> => {
      return {
        expect: '1 行',
        real: `行=${r3.length}，Room id=${JSON.stringify(r3.map((r) => r[1]))}`,
        pass: r3.length === 1 && String(r3[0]?.[1]) === '17100109'
      };
    });
    await this.check('用例#13-②(TC-FILTER-03) 该行指标 9/9/2/7/4004.3/4000/4.3/7/6', async (): Promise<CheckResult> => {
      const cells = r3[0] ?? [];
      const got = {
        sessions: num(cells[3]), ended: num(cells[4]), success: num(cells[5]), failure: num(cells[6]),
        coins: num(cells[7]), successCoins: num(cells[8]), failCoins: num(cells[9]),
        players: num(cells[10]), users: num(cells[11])
      };
      return {
        expect: '9/9/2/7/4004.3/4000/4.3/7/6',
        real: JSON.stringify(got),
        pass: got.sessions === 9 && got.ended === 9 && got.success === 2 && got.failure === 7 &&
          Math.abs(got.coins - 4004.3) < 0.01 && Math.abs(got.successCoins - 4000) < 0.01 &&
          Math.abs(got.failCoins - 4.3) < 0.01 && got.players === 7 && got.users === 6
      };
    });

    // ---------- 序号12 TC-FILTER-02 数据行A：逗号 ----------
    await this.reset();
    await this.setDateExact('开始日期', '2026-11-02');
    await this.setDateExact('结束日期', '2026-11-09');
    await this.fillField('房间ID', '17100109,101040');
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    await this.shot('filter02-room-comma');
    const r2a = await this.tableRows();
    const ids2a = r2a.map((r) => String(r[1]));
    await this.check('用例#12-①[数据行A-逗号](TC-FILTER-02) 返回 2 行', async (): Promise<CheckResult> => {
      return {
        expect: '2 行',
        real: `行=${r2a.length}，Room id=${JSON.stringify(ids2a)}`,
        pass: r2a.length === 2
      };
    });
    await this.check('用例#12-②[数据行A-逗号](TC-FILTER-02) room id 仅 101040/17100109', async (): Promise<CheckResult> => {
      return {
        expect: 'room id 仅 101040 与 17100109',
        real: `Room id=${JSON.stringify(ids2a)}`,
        pass: ids2a.length === 2 && ids2a.every((id) => id === '101040' || id === '17100109') &&
          new Set(ids2a).size === 2
      };
    });

    // ---------- 序号12 TC-FILTER-02 数据行B：换行 ----------
    await this.reset();
    await this.setDateExact('开始日期', '2026-11-02');
    await this.setDateExact('结束日期', '2026-11-09');
    await this.fillField('房间ID', '17100109\n101040');
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    await this.shot('filter02-room-newline');
    const r2b = await this.tableRows();
    const ids2b = r2b.map((r) => String(r[1]));
    await this.check('用例#12-①[数据行B-换行](TC-FILTER-02) 返回 2 行', async (): Promise<CheckResult> => {
      return {
        expect: '2 行',
        real: `行=${r2b.length}，Room id=${JSON.stringify(ids2b)}`,
        pass: r2b.length === 2
      };
    });
    await this.check('用例#12-②[数据行B-换行](TC-FILTER-02) room id 仅 101040/17100109', async (): Promise<CheckResult> => {
      return {
        expect: 'room id 仅 101040 与 17100109',
        real: `Room id=${JSON.stringify(ids2b)}`,
        pass: ids2b.length === 2 && ids2b.every((id) => id === '101040' || id === '17100109') &&
          new Set(ids2b).size === 2
      };
    });

    // ---------- 序号11 TC-FILTER-01 ----------
    await this.reset();
    await this.setDateExact('开始日期', '2026-11-02');
    await this.setDateExact('结束日期', '2026-11-09');
    await this.pickOption('大区', '印尼语区');
    const isMultiple = await this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '大区' }) })
      .locator('.el-select').first().evaluate((el) => el.classList.contains('el-select--multiple') || !!el.querySelector('.el-select__tags'));
    await this.clickQuery();
    await this.page!.waitForTimeout(3000);
    await this.shot('filter01-locale-in');
    const totalIn = await this.paginationTotal();
    await this.check('用例#11-①(TC-FILTER-01) 大区印尼语区查询分页 Total 30', async (): Promise<CheckResult> => {
      return {
        expect: '分页 Total 30（仅 in 大区房间）',
        real: `分页 Total=${totalIn}，当前页行=${(await this.tableRows()).length}`,
        pass: totalIn === 30
      };
    });
    await this.check('用例#11-②(TC-FILTER-01) 大区控件为单选，不出现多选', async (): Promise<CheckResult> => {
      return {
        expect: '大区控件为单选',
        real: `多选控件=${isMultiple}`,
        pass: !isMultiple
      };
    });
  }
}

new P0ReportTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
