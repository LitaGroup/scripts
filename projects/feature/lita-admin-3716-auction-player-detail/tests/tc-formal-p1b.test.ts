/**
 * 项目 3716「拍拍模式流水-主播维度」：P1-B（组合筛选/重置）
 *
 * 用例来源：/task/20261111/TK-0206/HANDOFF 第 3 节九列表格（22 条）
 * 技术方案：/task/20261111/TK-0206/TECH_DESIGN（§2 参数矩阵、§5 断言映射）
 * 覆盖：用例#14 FILTER-04、#15 RESET-01
 * 数据隔离：BD-0 存量只读；不造数、无清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-formal-p1b.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

class P1BFormalTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p1b-formal');
    this.total = 6;
  }

  private async rows(): Promise<string[][]> {
    return this.tableRows();
  }

  private async prepareDates(day = '2026-11-10'): Promise<void> {
    await this.setDateValue('开始日期', day);
    await this.setDateValue('结束日期', day);
    await this.waitConditionCount(2);
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.nav('/data-stats-manager/voice-room-data/auction-mode-player-detail');
    await this.waitReportReady();

    // ---------- 用例#14 TC-FILTER-04 ----------
    await this.reset();
    await this.prepareDates('2026-11-10');
    await this.pickOption('大区', '印尼语区');
    await this.fillField('房间ID', '10101473,1002');
    await this.waitConditionCount(4);
    await this.clickQuery();
    await this.pageSize(50);
    const f4Rows = await this.rows();
    const f4Total = await this.paginationTotal();
    const f4Ids = [...new Set(f4Rows.map((r) => String(r[5])))].sort();
    await this.shot('filter04-locale-room');
    await this.check('用例#14-①(TC-FILTER-04) 大区+房间组合查询 Total 6 且列表 6 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 6；6 行', real: `Total=${f4Total}，行=${f4Rows.length}`, pass: f4Total === 6 && f4Rows.length === 6 };
    });
    await this.check('用例#14-②(TC-FILTER-04) room id 列仅为 10101473 与 1002', async (): Promise<CheckResult> => {
      return {
        expect: '[1002,10101473]',
        real: JSON.stringify(f4Ids),
        pass: f4Ids.length === 2 && f4Ids[0] === '1002' && f4Ids[1] === '10101473'
      };
    });
    await this.check('用例#14-③(TC-FILTER-04) 结果为交集：6 行且 room id 均在交集内', async (): Promise<CheckResult> => {
      return {
        expect: '行数 6 ≤ 单房间 6 且 ≤ 单大区 23；room id 为交集',
        real: `行=${f4Rows.length}，room id=${JSON.stringify(f4Ids)}`,
        pass: f4Rows.length === 6 && f4Rows.length <= 6 && f4Rows.length <= 23 && f4Ids.every((id) => id === '1002' || id === '10101473')
      };
    });

    // ---------- 用例#15 TC-RESET-01 ----------
    await this.reset();
    await this.prepareDates('2026-11-10');
    await this.pickOption('大区', '印尼语区');
    await this.fillField('房间ID', '10101473');
    await this.fillField('主播ID', '322540');
    await this.waitConditionCount(5);
    await this.clickQuery();
    await this.reset();
    const fieldValues: string[] = [];
    let allEmpty = true;
    const fields = this.page!.locator('.query-field');
    for (let i = 0; i < await fields.count(); i++) {
      const f = fields.nth(i);
      const label = (await f.locator('.query-label').innerText().catch(() => '')).trim();
      const vals = await f.locator('input, textarea').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
      if (vals.some((v) => v.trim() !== '')) allEmpty = false;
      fieldValues.push(`${label}=${JSON.stringify(vals)}`);
    }
    const emptyReset = await this.emptyText();
    const stateReset = await this.paginationState();
    const rowsReset = await this.rows();
    await this.shot('reset01-after-reset');
    await this.check('用例#15-①(TC-RESET-01) 日期、大区、房间ID、主播ID 全部清空', async (): Promise<CheckResult> => {
      return {
        expect: '开始日期/结束日期/大区/房间ID/主播ID 均为空',
        real: fieldValues.join('；'),
        pass: allEmpty
      };
    });
    await this.check('用例#15-②(TC-RESET-01) 表格恢复空态「请输入查询条件后查看数据」，无数据行', async (): Promise<CheckResult> => {
      return {
        expect: '空态「请输入查询条件后查看数据」；0 行',
        real: `空态=${emptyReset}，行=${rowsReset.length}`,
        pass: emptyReset.includes('请输入查询条件后查看数据') && rowsReset.length === 0
      };
    });
    await this.check('用例#15-③(TC-RESET-01) 分页恢复 Total 0，每页条数与上一页/下一页禁用', async (): Promise<CheckResult> => {
      return {
        expect: 'Total 0；每页条数/上一页/下一页禁用',
        real: JSON.stringify(stateReset),
        pass: stateReset.total.includes('Total 0') && stateReset.sizeDisabled && stateReset.prevDisabled && stateReset.nextDisabled
      };
    });



  }
}

new P1BFormalTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
