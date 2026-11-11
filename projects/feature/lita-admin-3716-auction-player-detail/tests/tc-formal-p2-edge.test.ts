/**
 * 项目 3716「拍拍模式流水-主播维度」：P2（异常场景）
 *
 * 用例来源：/task/20261111/TK-0206/HANDOFF 第 3 节九列表格（22 条）
 * 技术方案：/task/20261111/TK-0206/TECH_DESIGN（§5 断言映射）
 * 覆盖：用例#21 EDGE-01、#22 EDGE-02
 * 数据隔离：BD-0 存量只读；不造数、无清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-formal-p2-edge.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

class P2EdgeTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p2-edge');
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

    // ---------- 用例#21 TC-EDGE-01 ----------
    await this.openDetail();
    await this.setDateValue('开始日期', '2026-01-01');
    await this.setDateValue('结束日期', '2026-01-02');
    await this.waitConditionCount(2);
    await this.clickQuery();
    const edgeRows = await this.rows();
    const edgeEmpty = await this.emptyText();
    const edgeTotal = await this.paginationTotal();
    const edgeFilter = await this.page!.locator('.filter-card').count();
    const edgeErrMsg = await this.page!.locator('.el-message--error').count();
    const edgeBodyLen = (await this.page!.locator('body').innerText()).length;
    await this.shot('edge01-no-data');
    await this.check('用例#21-①(TC-EDGE-01) 无数据区间返回 0 行，空态「暂无数据」', async (): Promise<CheckResult> => {
      return {
        expect: '0 行；空态「暂无数据」',
        real: `行=${edgeRows.length}，空态=${edgeEmpty}`,
        pass: edgeRows.length === 0 && edgeEmpty.includes('暂无数据')
      };
    });
    await this.check('用例#21-②(TC-EDGE-01) 分页显示 Total 0', async (): Promise<CheckResult> => {
      return { expect: 'Total 0', real: `Total=${edgeTotal}`, pass: edgeTotal === 0 };
    });
    await this.check('用例#21-③(TC-EDGE-01) 页面无报错提示、不白屏', async (): Promise<CheckResult> => {
      return {
        expect: '无错误弹窗/错误页；筛选区仍在',
        real: `错误弹窗=${edgeErrMsg}，筛选区=${edgeFilter}，正文长度=${edgeBodyLen}`,
        pass: edgeErrMsg === 0 && edgeFilter > 0 && edgeBodyLen > 50
      };
    });

    // ---------- 用例#22 TC-EDGE-02 ----------
    await this.reset();
    await this.prepareDates('2026-11-10');
    const ids = Array.from({ length: 100 }, (_, i) => String(1002 + i)).join(',');
    await this.fillField('房间ID', ids);
    await this.waitConditionCount(3);
    await this.clickQuery();
    const e2Rows = await this.rows();
    const e2Empty = await this.emptyText();
    const e2Total = await this.paginationTotal();
    const e2Filter = await this.page!.locator('.filter-card').count();
    const e2ErrMsg = await this.page!.locator('.el-message--error').count();
    const e2BodyLen = (await this.page!.locator('body').innerText()).length;
    await this.shot('edge02-long-ids');
    await this.check('用例#22-①(TC-EDGE-02) 100+ 房间 ID 查询后页面不白屏、不崩溃', async (): Promise<CheckResult> => {
      return {
        expect: '页面仍可用，筛选区存在且正文非空',
        real: `筛选区=${e2Filter}，正文长度=${e2BodyLen}`,
        pass: e2Filter > 0 && e2BodyLen > 50
      };
    });
    await this.check('用例#22-②(TC-EDGE-02) 无报错弹窗/错误页，表格呈现数据行或空态「暂无数据」', async (): Promise<CheckResult> => {
      const stateOk = e2Rows.length > 0 || e2Empty.includes('暂无数据');
      return {
        expect: '无报错；数据行>0 或空态「暂无数据」',
        real: `错误弹窗=${e2ErrMsg}，行=${e2Rows.length}，空态=${e2Empty}`,
        pass: e2ErrMsg === 0 && stateOk
      };
    });
    await this.check('用例#22-③(TC-EDGE-02) 分页显示 Total N（N 为大于等于 0 的整数）', async (): Promise<CheckResult> => {
      const text = await this.totalText();
      const m = text.match(/Total\s+([\d,]+)/i);
      return {
        expect: 'Total N，N≥0',
        real: `Total 文本=${text}，数值=${m ? m[1] : 'N/A'}`,
        pass: !!m && Number(m[1].replace(/,/g, '')) >= 0
      };
    });


  }
}

new P2EdgeTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
