/**
 * 项目 3716「拍拍模式流水-主播维度」：P0 主路径（UI）
 *
 * 用例来源：/task/20261111/TK-0189/TEST_CASES（需求方唯一用例输入）
 * 技术方案：/task/20261111/TK-0201/TECH_DESIGN（本任务实测采集）
 * 覆盖：
 * - TC-AUTH-01 有权限账号可见菜单并进入报表页（P0）
 * - TC-UI-01 首屏不自动查询并展示空态（P0）
 * - TC-UI-02 未选日期查询被拦截（P0）
 * - TC-UI-03 单日查询结果与基线一致（P0）
 * - TC-UI-06 导出 Excel 与页面一致（P0）
 * - TC-UI-07 17 列表头完整（P0）
 * - TC-UI-08 数据单元格渲染正确（P0）
 * - TC-FILTER-01 大区单选筛选生效（P0）
 * - TC-FILTER-02 房间 ID 批量筛选生效（P0）
 * - TC-FILTER-03 陪玩师 ID 批量筛选生效（P0）
 * 数据隔离：只读查询 2026-11-10 存量数据，不造数、不清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-p0-report.test.ts [--evidence-dir=...]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const HEADERS = [
  'date', 'sale_batch_no', 'player_id', 'player_no', 'player_nick', 'room id', 'room nick',
  'auction status', 'auction total coins', 'number of users in auction', 'winner user_id',
  'winner user_no', 'winner user_nick', 'winner user_total price', 'auction success - date&time',
  'relationship type', 'relationship level'
];
const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

class P0ReportTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p0');
    this.total = 21;
  }

  private queryCount(): number {
    return this.calls.filter((c) => c.path.includes('/stats/query') && !c.path.includes('download')).length;
  }

  private async openFromMenu(): Promise<void> {
    await this.expandMenu('数据统计管理');
    await this.expandMenu('语音房相关数据');
    await this.page!.locator('.el-menu-item', { hasText: '拍拍模式流水-主播维度' }).first().click();
    await this.page!.waitForSelector('.filter-card', { timeout: 30000 });
    await this.page!.waitForTimeout(1200);
  }

  private async reset(): Promise<void> {
    await this.page!.getByRole('button', { name: '重置', exact: true }).click();
    await this.page!.waitForTimeout(1000);
  }

  private async pickDates(day = 10): Promise<void> {
    await this.pickDate('开始日期', day);
    await this.pickDate('结束日期', day);
  }

  private async clickPage2(): Promise<void> {
    const wait = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 120000 }
    ).catch(() => null);
    await this.page!.locator('.el-pager li.number', { hasText: '2' }).first().click();
    await wait;
    await this.page!.waitForTimeout(1800);
  }

  private async rowsOnPage(): Promise<string[][]> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').evaluateAll((rows) =>
      rows.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()))
    );
  }

  /** 读取当前查询的全部分页行（用于合计/分布断言）。 */
  private async allRows(total: number): Promise<string[][]> {
    const rows = await this.rowsOnPage();
    if (total <= rows.length) return rows;
    const pages = Math.ceil(total / rows.length);
    for (let i = 1; i < pages; i++) {
      const wait = this.page!.waitForResponse(
        (r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 120000 }
      ).catch(() => null);
      await this.page!.locator('.el-pager li.number', { hasText: String(i + 1) }).first().click();
      await wait;
      await this.page!.waitForTimeout(1800);
      rows.push(...(await this.rowsOnPage()));
    }
    return rows;
  }

  private singleSelect(): Promise<boolean> {
    return this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '大区' }) })
      .locator('.el-select').first().evaluate((el) => el.classList.contains('el-select--multiple') || !!el.querySelector('.el-select__tags'));
  }

  /** 补充核验：分页/每页条数守卫，返回实际动作与 query 请求增量。 */
  private async paginationGuard(): Promise<string> {
    const before = this.queryCount();
    const exists = await this.page!.locator('.el-pagination').count();
    if (!exists) return `分页组件未渲染（无数据），无法触发；query 请求=0`;
    let detail = `分页组件已渲染`;
    const size = this.page!.locator('.el-pagination__sizes .el-select').first();
    if (await size.count()) {
      await size.click();
      const opt = this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: '10/page' }).first();
      if (await opt.count()) {
        await opt.click();
        await this.page!.waitForTimeout(1500);
      }
      this.page!.keyboard.press('Escape').catch(() => undefined);
      detail += `，切换每页条数后 query 增量=${this.queryCount() - before}`;
    }
    const p2 = this.page!.locator('.el-pager li.number', { hasText: '2' }).first();
    if (await p2.count()) {
      const disabled = await p2.evaluate((el) => el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true').catch(() => true);
      if (!disabled) {
        const b2 = this.queryCount();
        await p2.click();
        await this.page!.waitForTimeout(1500);
        detail += `，点击分页后 query 增量=${this.queryCount() - b2}`;
      }
    }
    return detail;
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- TC-AUTH-01 ----------
    await this.expandMenu('数据统计管理');
    await this.expandMenu('语音房相关数据');
    const menuItem = this.page!.locator('.el-menu-item', { hasText: '拍拍模式流水-主播维度' }).first();
    const menuVisible = (await menuItem.count()) > 0 && (await menuItem.isVisible().catch(() => false));
    await this.shot('auth01-menu-visible');
    await this.check('用例#TC-AUTH-01-① 有权限账号可见「拍拍模式流水-主播维度」菜单', async (): Promise<CheckResult> => {
      return {
        expect: '数据统计管理 → 语音房相关数据 下可见「拍拍模式流水-主播维度」菜单',
        real: `菜单可见=${menuVisible}`,
        pass: menuVisible
      };
    });
    await this.openFromMenu();
    const title = await this.page!.locator('.page-title').innerText().catch(() => '');
    const hash = await this.page!.evaluate(() => location.hash);
    await this.shot('auth01-report-opened');
    await this.check('用例#TC-AUTH-01-② 点击菜单可进入主播维度报表页', async (): Promise<CheckResult> => {
      return {
        expect: '进入 /data-stats-manager/voice-room-data/auction-mode-player-detail，页面标题为「拍拍模式流水 - 主播维度」',
        real: `hash=${hash}，页面标题=${title}`,
        pass: hash.includes('/data-stats-manager/voice-room-data/auction-mode-player-detail') &&
          title.replace(/\s+/g, '').includes('拍拍模式流水-主播维度')
      };
    });

    // ---------- TC-UI-01（含首屏分页守卫补充核验） ----------
    const entryQueries = this.queryCount();
    const empty = await this.emptyText();
    const guardEntry = await this.paginationGuard();
    await this.shot('ui01-initial-empty');
    await this.check('用例#TC-UI-01-① 首屏不自动发起查询', async (): Promise<CheckResult> => {
      return {
        expect: '首次加载 query 请求 0 次（含尝试切换每页条数/点击分页后仍为 0）',
        real: `首屏 query 请求=${entryQueries}，操作后 query 请求=${this.queryCount()}；${guardEntry}`,
        pass: entryQueries === 0 && this.queryCount() === 0
      };
    });
    await this.check('用例#TC-UI-01-② 表格区域提示「请输入查询条件后查看数据」', async (): Promise<CheckResult> => {
      return {
        expect: '空态文案「请输入查询条件后查看数据」',
        real: `空态=${empty}`,
        pass: empty.includes('请输入查询条件后查看数据')
      };
    });

    // ---------- TC-UI-02 ----------
    const before2 = this.queryCount();
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    const msg = await this.messageText();
    await this.page!.waitForTimeout(800);
    await this.shot('ui02-date-required');
    await this.check('用例#TC-UI-02-① 未选日期点查询提示选择开始日期', async (): Promise<CheckResult> => {
      return {
        expect: '提示包含「请选择开始日期」',
        real: `提示=${msg}`,
        pass: msg.includes('请选择开始日期')
      };
    });
    await this.check('用例#TC-UI-02-② 未选日期查询不发出查询请求', async (): Promise<CheckResult> => {
      return {
        expect: 'query 请求增量 0',
        real: `query 请求增量=${this.queryCount() - before2}`,
        pass: this.queryCount() === before2
      };
    });

    // ---------- TC-UI-03 ----------
    await this.pickDates(10);
    const q1 = this.queryCount();
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    await this.shot('ui03-query-1110-page1');
    const page1 = await this.rowsOnPage();
    const total26 = await this.paginationTotal();
    await this.clickPage2();
    await this.shot('ui03-query-1110-page2');
    const page2 = await this.rowsOnPage();
    const all = [...page1, ...page2];
    const statusCount = (key: string) => all.filter((r) => (r[7] ?? '').includes(key)).length;
    const success = statusCount('结算成功');
    const noSupport = statusCount('无支持者');
    const below = statusCount('金额未达到最低等级');
    const sumCoins = Math.round(all.reduce((acc, r) => acc + num(r[8]), 0) * 100) / 100;
    await this.check('用例#TC-UI-03-① 2026-11-10 查询返回 26 行且分页总数 26', async (): Promise<CheckResult> => {
      return {
        expect: '26 行；分页 Total 26',
        real: `第1页=${page1.length} 行，第2页=${page2.length} 行，合计=${all.length}，分页 Total=${total26}，query 增量=${this.queryCount() - q1}`,
        pass: all.length === 26 && total26 === 26
      };
    });
    await this.check('用例#TC-UI-03-② 结算状态分布：结算成功 15 / 无支持者 4 / 金额未达到最低等级 7', async (): Promise<CheckResult> => {
      return {
        expect: '结算成功=15，无支持者=4，金额未达到最低等级=7',
        real: `结算成功=${success}，无支持者=${noSupport}，金额未达到最低等级=${below}，状态其它=${all.length - success - noSupport - below}`,
        pass: success === 15 && noSupport === 4 && below === 7
      };
    });
    await this.check('用例#TC-UI-03-③ 总流水 445,824.52', async (): Promise<CheckResult> => {
      return {
        expect: '445824.52',
        real: `${sumCoins.toFixed(2)}`,
        pass: Math.abs(sumCoins - 445824.52) < 0.01
      };
    });

    // ---------- TC-UI-07 ----------
    const headers = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.shot('ui07-table-headers');
    await this.check('用例#TC-UI-07-① 17 列表头完整、列序与预期一致且无单字母截断/分组错位', async (): Promise<CheckResult> => {
      const normalized = headers.map((h) => h.toLowerCase());
      return {
        expect: HEADERS.join('|'),
        real: `${normalized.join('|')}（共 ${headers.length} 列）`,
        pass: headers.length === 17 && HEADERS.every((h, i) => normalized[i] === h) && !headers.some((h) => h.length <= 1)
      };
    });

    // ---------- TC-UI-08 ----------
    const first = page1[0] ?? [];
    const expectedFirst = {
      date: '2026-11-10~2026-11-10', batch: 'YDA1A1794322778A24706644UF160426',
      playerId: '322540', playerNo: '1366411', roomId: '10101473', status: '结算成功，关系已处理',
      coins: 38915.06, bidders: 5, winnerId: '21264129', winnerNo: '26806849', winnerPrice: 37997,
      time: '2026-11-10 23:05:35', type: 'cp', level: 2
    };
    await this.shot('ui08-first-row');
    await this.check('用例#TC-UI-08-① 首行各字段与接口基线一致且不串列', async (): Promise<CheckResult> => {
      const ok = first.length === 17 &&
        first[0] === expectedFirst.date && first[1] === expectedFirst.batch &&
        first[2] === expectedFirst.playerId && first[3] === expectedFirst.playerNo &&
        first[4].length > 0 && first[5] === expectedFirst.roomId && first[6].length > 0 &&
        first[7] === expectedFirst.status && Math.abs(num(first[8]) - expectedFirst.coins) < 0.01 &&
        num(first[9]) === expectedFirst.bidders && first[10] === expectedFirst.winnerId &&
        first[11] === expectedFirst.winnerNo && first[12].length > 0 &&
        Math.abs(num(first[13]) - expectedFirst.winnerPrice) < 0.01 && first[14] === expectedFirst.time &&
        first[15] === expectedFirst.type && num(first[16]) === expectedFirst.level;
      return {
        expect: '首行 date/批次/主播ID.编号/房间/状态/流水/竞价人数/得标用户/时间/关系类型.等级 与接口基线一致，昵称非空',
        real: JSON.stringify(first),
        pass: ok
      };
    });

    // ---------- TC-UI-06 ----------
    const dlDir = this.evidenceDir;
    const respPromise = this.page!.waitForResponse((r) => r.url().includes('/stats/query/download'), { timeout: 120000 });
    const dlNamePromise = this.page!.waitForEvent('download', { timeout: 120000 }).then((d) => d.suggestedFilename()).catch(() => '');
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const exportResp = await respPromise;
    const suggested = await dlNamePromise;
    const cd = exportResp.headers()['content-disposition'] ?? '';
    let fileName = suggested;
    if (!fileName) {
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      fileName = m ? decodeURIComponent(m[1]) : '';
    }
    const buf = Buffer.from(await exportResp.body());
    const xlsxPath = join(dlDir, `export-20261110-${Date.now()}.xlsx`);
    writeFileSync(xlsxPath, buf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);
    const ws = wb.worksheets[0];
    const excelRows: string[][] = [];
    ws.eachRow((row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => values.push(String(cell.value ?? '')));
      excelRows.push(values);
    });
    const dataStart = excelRows.findIndex((r) => /^\d{4}-\d{2}-\d{2}~/.test(r[0] ?? ''));
    const dataRows = dataStart >= 0 ? excelRows.slice(dataStart) : [];
    const excelSum = Math.round(dataRows.reduce((acc, r) => acc + num(r[8]), 0) * 100) / 100;
    const headerRows = dataStart >= 0 ? dataStart : 0;
    await this.shot('ui06-export-clicked');
    await this.check('用例#TC-UI-06-① 导出文件名含「拍拍模式流水 - 主播维度」', async (): Promise<CheckResult> => {
      return {
        expect: '文件名含「拍拍模式流水 - 主播维度」',
        real: `文件名=${fileName}；Content-Disposition=${cd}`,
        pass: /拍拍模式流水\s*-\s*主播维度/.test(fileName)
      };
    });
    await this.check('用例#TC-UI-06-② 导出内容 26 行数据 × 17 列且数据未错位', async (): Promise<CheckResult> => {
      const firstExport = dataRows[0] ?? [];
      const sameAsPage = first.length === 17 && firstExport.length === 17 && first.every((v, i) => (firstExport[i] ?? '').trim() === v);
      return {
        expect: '26 行数据 × 17 列；首行与页面首行一致',
        real: `数据行=${dataRows.length}，列=${ws.columnCount}，表头行=${headerRows}，导出首行=${JSON.stringify(firstExport.slice(0, 3))}…，与页面首行一致=${sameAsPage}`,
        pass: dataRows.length === 26 && ws.columnCount === 17 && sameAsPage
      };
    });
    await this.check('用例#TC-UI-06-③ 导出关键合计与页面一致（总流水 445,824.52）', async (): Promise<CheckResult> => {
      return {
        expect: '445824.52',
        real: `${excelSum.toFixed(2)}`,
        pass: Math.abs(excelSum - 445824.52) < 0.01
      };
    });
    this.notes.push(`导出表头 ${headerRows} 行；第15列「auction success - date&time」在导出中被 EasyExcel 按 " - " 分层为两行，列数仍为 17，数据未错位`);

    // ---------- TC-FILTER-01 ----------
    await this.reset();
    await this.pickDates(10);
    await this.pickOption('大区', '印尼语区');
    const isMultiple = await this.singleSelect();
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    await this.shot('filter01-locale-in');
    const t1 = await this.paginationTotal();
    const r1 = await this.allRows(t1);
    const sum1 = Math.round(r1.reduce((acc, r) => acc + num(r[8]), 0) * 100) / 100;
    await this.check('用例#TC-FILTER-01-① 大区选择 in（印尼语区）返回 23 行', async (): Promise<CheckResult> => {
      return {
        expect: '23 行；分页 Total 23',
        real: `行=${r1.length}，分页 Total=${t1}`,
        pass: r1.length === 23 && t1 === 23
      };
    });
    await this.check('用例#TC-FILTER-01-② 大区控件为单选，不出现多选', async (): Promise<CheckResult> => {
      return {
        expect: '单选控件（无 el-select--multiple / tags）',
        real: `多选=${isMultiple}`,
        pass: !isMultiple
      };
    });
    await this.check('用例#TC-FILTER-01-③ 大区 in 总流水 445,756.18', async (): Promise<CheckResult> => {
      return {
        expect: '445756.18',
        real: `${sum1.toFixed(2)}`,
        pass: Math.abs(sum1 - 445756.18) < 0.01
      };
    });

    // ---------- TC-FILTER-02 ----------
    await this.reset();
    await this.pickDates(10);
    await this.fillField('房间ID', '10101473,1002');
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    await this.shot('filter02-room-batch');
    const r2 = await this.rowsOnPage();
    const t2 = await this.paginationTotal();
    const ids2 = [...new Set(r2.map((r) => String(r[5])))].sort();
    await this.check('用例#TC-FILTER-02-① 房间 ID 批量筛选返回 6 行', async (): Promise<CheckResult> => {
      return {
        expect: '6 行；分页 Total 6',
        real: `行=${r2.length}，分页 Total=${t2}`,
        pass: r2.length === 6 && t2 === 6
      };
    });
    await this.check('用例#TC-FILTER-02-② 仅返回 10101473 与 1002 两个房间，不含其它房间', async (): Promise<CheckResult> => {
      return {
        expect: 'Room id 集合=[1002,10101473]',
        real: `Room id 集合=${JSON.stringify(ids2)}`,
        pass: ids2.length === 2 && ids2[0] === '1002' && ids2[1] === '10101473'
      };
    });

    // ---------- TC-FILTER-03 ----------
    await this.reset();
    await this.pickDates(10);
    await this.fillField('主播ID', '322540,7214137');
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    await this.shot('filter03-player-batch');
    const r3 = await this.rowsOnPage();
    const t3 = await this.paginationTotal();
    const players = r3.map((r) => String(r[2])).sort();
    await this.check('用例#TC-FILTER-03-① 陪玩师/主播 ID 批量筛选返回 2 行', async (): Promise<CheckResult> => {
      return {
        expect: '2 行；分页 Total 2',
        real: `行=${r3.length}，分页 Total=${t3}`,
        pass: r3.length === 2 && t3 === 2
      };
    });
    await this.check('用例#TC-FILTER-03-② player_id 分别为 322540、7214137', async (): Promise<CheckResult> => {
      return {
        expect: '[322540,7214137]',
        real: JSON.stringify(players),
        pass: players.length === 2 && players[0] === '322540' && players[1] === '7214137'
      };
    });

    // ---------- 返回房间维度 / 重置后分页守卫补充核验 ----------
    await this.reset();
    const guardReset = await this.paginationGuard();
    this.notes.push(`重置后分页/每页条数守卫：${guardReset}`);
    await this.shot('guard-after-reset');
    this.notes.push(`首屏分页守卫：${guardEntry}`);
  }
}

new P0ReportTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
