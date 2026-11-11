/**
 * 项目 3716「拍拍模式流水-主播维度」：P0-C（大区/房间批量/主播批量筛选）
 *
 * 用例来源：/task/20261111/TK-0206/HANDOFF 第 3 节九列表格（22 条）
 * 技术方案：/task/20261111/TK-0206/TECH_DESIGN（§2.1 筛选参数矩阵、§4 定位、§5 断言映射）
 * 覆盖：用例#11 FILTER-01、#12 FILTER-02（数据行 D1 逗号 / D2 换行）、#13 FILTER-03
 * 数据隔离：BD-0 测试环境存量只读（2026-11-10），不造数、无清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-formal-p0-filter.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

class P0FilterTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p0-filter');
    this.total = 10;
  }

  private async prepareDates(day = '2026-11-10'): Promise<void> {
    await this.setDateValue('开始日期', day);
    await this.setDateValue('结束日期', day);
    await this.waitConditionCount(2);
  }

  private async regionIsMultiple(): Promise<boolean> {
    return this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '大区' }) })
      .locator('.el-select').first().evaluate((el) => el.classList.contains('el-select--multiple') || !!el.querySelector('.el-select__tags'));
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- 用例#11 TC-FILTER-01 ----------
    await this.nav('/data-stats-manager/voice-room-data/auction-mode-player-detail');
    await this.waitReportReady();
    await this.prepareDates('2026-11-10');
    await this.pickOption('大区', '印尼语区');
    const multi = await this.regionIsMultiple();
    await this.clickQuery();
    await this.pageSize(50);
    const f1Rows = await this.tableRows();
    const f1Total = await this.paginationTotal();
    const f1Sum = Math.round(f1Rows.reduce((acc, r) => acc + num(r[8]), 0) * 100) / 100;
    await this.shot('filter01-locale-in');
    await this.check('用例#11-①(TC-FILTER-01) 大区控件为单选，不出现多选勾选', async (): Promise<CheckResult> => {
      return { expect: '非多选控件', real: `多选形态=${multi}`, pass: !multi };
    });
    await this.check('用例#11-②(TC-FILTER-01) 分页 Total 23 且列表 23 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 23；23 行', real: `Total=${f1Total}，行=${f1Rows.length}`, pass: f1Total === 23 && f1Rows.length === 23 };
    });
    await this.check('用例#11-③(TC-FILTER-01) auction total coins 列合计 445,756.18', async (): Promise<CheckResult> => {
      return { expect: '445756.18', real: f1Sum.toFixed(2), pass: Math.abs(f1Sum - 445756.18) < 0.01 };
    });

    // ---------- 用例#12 TC-FILTER-02 数据行 D1（逗号） ----------
    await this.reset();
    await this.prepareDates('2026-11-10');
    await this.fillField('房间ID', '10101473,1002');
    await this.waitConditionCount(3);
    await this.clickQuery();
    await this.pageSize(50);
    const d1Rows = await this.tableRows();
    const d1Total = await this.paginationTotal();
    const d1Ids = [...new Set(d1Rows.map((r) => String(r[5])))].sort();
    await this.shot('filter02-d1-comma');
    await this.check('用例#12-①[数据行D1](TC-FILTER-02) 逗号分隔：Total 6 且列表 6 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 6；6 行', real: `Total=${d1Total}，行=${d1Rows.length}`, pass: d1Total === 6 && d1Rows.length === 6 };
    });
    await this.check('用例#12-②[数据行D1](TC-FILTER-02) room id 仅 10101473 与 1002，不出现其它房间', async (): Promise<CheckResult> => {
      return {
        expect: 'room id 集合=[1002,10101473]',
        real: JSON.stringify(d1Ids),
        pass: d1Ids.length === 2 && d1Ids[0] === '1002' && d1Ids[1] === '10101473'
      };
    });

    // ---------- 用例#12 TC-FILTER-02 数据行 D2（换行） ----------
    await this.reset();
    await this.prepareDates('2026-11-10');
    await this.fillField('房间ID', '10101473\n1002');
    await this.waitConditionCount(3);
    await this.clickQuery();
    await this.pageSize(50);
    const d2Rows = await this.tableRows();
    const d2Total = await this.paginationTotal();
    const d2Ids = [...new Set(d2Rows.map((r) => String(r[5])))].sort();
    await this.shot('filter02-d2-newline');
    await this.check('用例#12-①[数据行D2](TC-FILTER-02) 换行分隔：Total 6 且列表 6 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 6；6 行', real: `Total=${d2Total}，行=${d2Rows.length}`, pass: d2Total === 6 && d2Rows.length === 6 };
    });
    await this.check('用例#12-②[数据行D2](TC-FILTER-02) room id 仅 10101473 与 1002，不出现其它房间', async (): Promise<CheckResult> => {
      return {
        expect: 'room id 集合=[1002,10101473]',
        real: JSON.stringify(d2Ids),
        pass: d2Ids.length === 2 && d2Ids[0] === '1002' && d2Ids[1] === '10101473'
      };
    });
    await this.check('用例#12-③[数据行D1/D2](TC-FILTER-02) 逗号与换行两种分隔结果一致（均 6 行、相同房间集合）', async (): Promise<CheckResult> => {
      const same = d1Total === d2Total && d1Rows.length === d2Rows.length && JSON.stringify(d1Ids) === JSON.stringify(d2Ids);
      return {
        expect: '两数据行均 6 行且 room id 集合一致',
        real: `D1 Total=${d1Total}/行=${d1Rows.length}/ids=${JSON.stringify(d1Ids)}；D2 Total=${d2Total}/行=${d2Rows.length}/ids=${JSON.stringify(d2Ids)}`,
        pass: same
      };
    });

    // ---------- 用例#13 TC-FILTER-03 ----------
    await this.reset();
    await this.prepareDates('2026-11-10');
    await this.fillField('主播ID', '322540,7214137');
    await this.waitConditionCount(3);
    await this.clickQuery();
    const f3Rows = await this.tableRows();
    const f3Total = await this.paginationTotal();
    const players = f3Rows.map((r) => String(r[2])).sort();
    await this.shot('filter03-player-batch');
    await this.check('用例#13-①(TC-FILTER-03) 分页 Total 2 且列表 2 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 2；2 行', real: `Total=${f3Total}，行=${f3Rows.length}`, pass: f3Total === 2 && f3Rows.length === 2 };
    });
    await this.check('用例#13-②(TC-FILTER-03) player_id 两行分别为 322540 与 7214137', async (): Promise<CheckResult> => {
      return {
        expect: '[322540,7214137]',
        real: JSON.stringify(players),
        pass: players.length === 2 && players[0] === '322540' && players[1] === '7214137'
      };
    });
  }
}

new P0FilterTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
