/**
 * 项目 3716「拍拍模式流水-主播维度」：P1-B（既有报表回归）
 *
 * 用例来源：/task/20261111/TK-0206/HANDOFF 第 3 节九列表格（22 条）
 * 技术方案：/task/20261111/TK-0206/TECH_DESIGN（§2.4 回归参数矩阵、§5 断言映射）
 * 覆盖：用例#19 REG-01、#20 REG-02
 * 数据隔离：BD-0 存量只读；不造数、无清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-formal-p2.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

class P2FormalTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p2-formal');
    this.total = 6;
  }

  private async openDetail(): Promise<void> {
    await this.nav('/data-stats-manager/voice-room-data/auction-mode-player-detail');
    await this.waitReportReady();
  }

  private async prepareDates(day = '2026-11-10'): Promise<void> {
    await this.setDateValue('开始日期', day);
    await this.setDateValue('结束日期', day);
    await this.waitConditionCount(2);
  }

  private async rows(): Promise<string[][]> {
    return this.tableRows();
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- 用例#19 TC-REG-01 ----------
    await this.nav('/data-stats-manager/voice-room-data/auction-mode-room-summary');
    await this.waitReportReady();
    await this.setDateValue('开始日期', '2026-11-08');
    await this.setDateValue('结束日期', '2026-11-08');
    await this.waitConditionCount(2);
    await this.clickQuery();
    const regHeaders = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const regHeaderRows = await this.page!.locator('.el-table__header-wrapper thead tr').count();
    const regRows = await this.rows();
    const regTotal = await this.paginationTotal();
    const sum = (i: number) => Math.round(regRows.reduce((acc, r) => acc + num(r[i]), 0) * 100) / 100;
    await this.shot('reg01-room-summary-1108');
    await this.check('用例#19-①(TC-REG-01) 12 列表头完整，连字符列名不被误拆/不串列', async (): Promise<CheckResult> => {
      const lower = regHeaders.map((h) => h.toLowerCase());
      const hyphen = ['total auction sessions - end', 'total auction sessions - success', 'total auction sessions - failure', 'auction coins - success', 'auction coins - failure'];
      const ok = regHeaders.length === 12 && regHeaderRows === 1 && hyphen.every((h) => lower.includes(h)) && !regHeaders.some((h) => h.length <= 1);
      return {
        expect: '12 列、单行平铺、连字符列名完整',
        real: `列=${regHeaders.length}，表头行=${regHeaderRows}，表头=${lower.join('|')}`,
        pass: ok
      };
    });
    await this.check('用例#19-②(TC-REG-01) 列表 18 行且分页 Total 18', async (): Promise<CheckResult> => {
      return { expect: '18 行；Total 18', real: `行=${regRows.length}，Total=${regTotal}`, pass: regRows.length === 18 && regTotal === 18 };
    });
    await this.check('用例#19-③(TC-REG-01) 合计 35/21/14/728,846.40', async (): Promise<CheckResult> => {
      const got = { sessions: sum(3), success: sum(5), failure: sum(6), coins: sum(7) };
      return {
        expect: 'total auction sessions=35；success=21；failure=14；auction total coins=728846.40',
        real: JSON.stringify(got),
        pass: got.sessions === 35 && got.success === 21 && got.failure === 14 && Math.abs(got.coins - 728846.4) < 0.01
      };
    });

    // ---------- 用例#20 TC-REG-02 ----------
    await this.nav('/data-stats-manager/player-stats/player-data-report-new');
    await this.waitReportReady();
    // SPA 路由切换时旧页面筛选区可能短暂残留：等待 PDR 专有「数据维度」筛选项出现后再读取。
    await this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '数据维度' }) })
      .first().waitFor({ state: 'visible', timeout: 30000 });
    const pdrFilters = (await this.page!.locator('.query-label').allInnerTexts()).map((t) => t.trim());
    await this.check('用例#20-①(TC-REG-02) 筛选区含数据维度/开始日期/结束日期/大区/国家/陪玩ID/陪玩NO', async (): Promise<CheckResult> => {
      const need = ['数据维度', '开始日期', '结束日期', '大区', '国家', '陪玩ID', '陪玩NO'];
      const ok = need.every((n) => pdrFilters.some((f) => f.includes(n)));
      return {
        expect: need.join('/'),
        real: JSON.stringify(pdrFilters),
        pass: ok
      };
    });
    await this.pickOption('数据维度', '日维度');
    await this.setDateValue('开始日期', '2026-07-01');
    await this.setDateValue('结束日期', '2026-07-31');
    await this.clickQuery();
    const pdrHeaderRows = await this.page!.locator('.el-table__header-wrapper thead tr').count();
    const pdrHeaders = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim());
    const pdrLeaf = pdrHeaders.filter(Boolean);
    const pdrRows = await this.rows();
    const pdrEmpty = await this.emptyText();
    const pdrTotal = await this.paginationTotal();
    const pdrParentGroups = await this.page!.locator('.el-table__header-wrapper thead tr').first().locator('th').evaluateAll((ths) =>
      ths.map((th) => ({ text: (th.textContent ?? '').trim(), colspan: (th as HTMLTableCellElement).colSpan, rowspan: (th as HTMLTableCellElement).rowSpan }))
        .filter((x) => x.colspan > 1 || x.rowspan > 1)
    );
    await this.shot('reg02-player-daily');
    await this.check('用例#20-②(TC-REG-02) 查询后表头呈两级分组结构，分组对齐、不串列、不截断', async (): Promise<CheckResult> => {
      const noTruncate = pdrLeaf.length > 0 && pdrLeaf.every((h) => h.length > 1);
      const structured = pdrHeaderRows >= 2 && pdrParentGroups.length > 0 && noTruncate;
      return {
        expect: '表头行≥2、存在父级分组列，叶子列名完整不截断',
        real: `表头行=${pdrHeaderRows}，叶子列=${pdrLeaf.length}，父级分组=${JSON.stringify(pdrParentGroups).slice(0, 500)}`,
        pass: structured
      };
    });
    await this.check('用例#20-③(TC-REG-02) 列表展示数据行（行数大于 0），无报错弹窗', async (): Promise<CheckResult> => {
      const errMsg = await this.page!.locator('.el-message--error').count();
      return {
        expect: '数据行>0；无报错弹窗',
        real: `数据行=${pdrRows.length}，Total=${pdrTotal}，空态=${pdrEmpty}，错误弹窗=${errMsg}`,
        pass: pdrRows.length > 0 && errMsg === 0
      };
    });
  }
}

new P2FormalTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
