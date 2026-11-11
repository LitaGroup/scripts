/**
 * 项目 3713「Lita Leaderboard Weekly Data」兼容性正式执行：用例 #16 数据行 D2（Edge 最新版）
 *
 * 用例来源：/api/docs/detail/task/20261111/TK-0204/HANDOFF.md（九列用例，17 条）
 * 技术方案：/api/docs/detail/task/20261111/TK-0204/TECH_DESIGN.md（SK9 / B1 / B6）
 * 覆盖：#16-① 基线查询；#16-② 导出 Excel；#16-③ 筛选区/按钮/表头完整可见
 * 数据隔离：BD-0 存量只读；导出文件为本地下载件，留存证据目录。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… TMPDIR=<可写目录> node tc-compat-edge.test.ts [--evidence-dir=...]
 */
import ExcelJS from 'exceljs';
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase, norm } from './lib/admin-base.ts';

const HEADERS = ['Rank', 'Ranking Type', 'Nick', 'Locale', 'No', 'User ID', 'Week', 'Week Range', 'Period', 'Total Coins', 'Order Coins', 'Gift Coins'];
const RANK_SEQ = Array.from({ length: 20 }, (_, i) => String(i + 1));

class CompatEdgeTest extends AdminBase {
  constructor() {
    super('lita-leaderboard-weekly-edge', { channel: 'msedge' });
    this.total = 3;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.openByMenu(['数据统计管理', '用户数据'], 'Lita Leaderboard Weekly Data', '#/data-stats-manager/user-consumption/lita-leaderboard-weekly', 'Week');
    await this.setDate('Week', '2026-11-02');
    await this.pickOption('Ranking Type', 'Player Order Rank');
    await this.pickOption('Locale', '印尼语区');
    this.armToast().catch(() => undefined);
    const status = await this.clickQuery();
    const rows = await this.tableRows();
    const first = rows[0] ?? [];
    const ranks = rows.map((r) => norm(r[0] ?? ''));
    const headers = await this.tableHeaders();
    const weekVisible = await this.field('Week').locator('input').first().isVisible().catch(() => false);
    const rankVisible = await this.field('Ranking Type').locator('.el-select').isVisible().catch(() => false);
    const localeVisible = await this.field('Locale').locator('.el-select').isVisible().catch(() => false);
    const queryVisible = await this.page!.getByRole('button', { name: '查询', exact: true }).isVisible().catch(() => false);
    const resetVisible = await this.page!.getByRole('button', { name: '重置', exact: true }).isVisible().catch(() => false);
    const exportVisible = await this.page!.getByRole('button', { name: '导出报表', exact: true }).isVisible().catch(() => false);
    await this.shot('case16-edge-query');

    await this.check('用例#16-①[数据行D2] Edge 查询返回 20 行、Rank 1-20，第 1 行 Nick/Total Coins 与基线一致', async (): Promise<CheckResult> => {
      const ok = status === 200 && rows.length === 20 && ranks.join(',') === RANK_SEQ.join(',') &&
        norm(first[2] ?? '') === 'AbelKenneth ⚭' && norm(first[9] ?? '') === '508,600';
      return {
        expect: '20 行 Rank 1-20；Top1 Nick=AbelKenneth ⚭，Total Coins=508,600',
        real: `HTTP=${status}，行数=${rows.length}，Rank首末=${ranks[0]}-${ranks[ranks.length - 1]}，Top1匹配=${norm(first[2] ?? '') === 'AbelKenneth ⚭' && norm(first[9] ?? '') === '508,600'}`,
        pass: ok
      };
    });

    const file = await this.downloadExport();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file.path);
    const ws = wb.worksheets[0];
    const excelRows: string[][] = [];
    ws.eachRow((row) => {
      const vals: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { vals[col - 1] = String(cell.value ?? '').trim(); });
      excelRows.push(vals);
    });
    const nonEmpty = excelRows.filter((r) => r.some((v) => (v ?? '') !== '')).length;
    const maxCols = Math.max(...excelRows.map((r) => r.filter((v) => (v ?? '') !== '').length));
    await this.check('用例#16-②[数据行D2] Edge 导出文件 21 行 × 12 列，文件名含「周订单礼物消费榜」', async (): Promise<CheckResult> => {
      const ok = file.name.includes('周订单礼物消费榜') && file.name.endsWith('.xlsx') && nonEmpty === 21 && maxCols === 12;
      return { expect: '文件名含 周订单礼物消费榜；21 行 × 12 列', real: `${file.name}；${nonEmpty} 行 × ${maxCols} 列`, pass: ok };
    });

    await this.check('用例#16-③[数据行D2] Edge 筛选区 3 控件、查询/重置/导出报表按钮、12 列表头完整可见', async (): Promise<CheckResult> => {
      const ok = weekVisible && rankVisible && localeVisible && queryVisible && resetVisible && exportVisible &&
        headers.length === 12 && headers.every((h, i) => h === HEADERS[i]);
      return {
        expect: '3 控件 + 3 按钮 + 12 列表头可见',
        real: `控件=${weekVisible}/${rankVisible}/${localeVisible}，按钮=${queryVisible}/${resetVisible}/${exportVisible}，表头=${headers.length} 列`,
        pass: ok
      };
    });
    await this.shot('case16-edge-export');
  }
}

await new CompatEdgeTest().execute();
