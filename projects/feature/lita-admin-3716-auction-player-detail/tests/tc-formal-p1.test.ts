/**
 * 项目 3716「拍拍模式流水-主播维度」：P1-A（分页/查询后重置守卫）
 *
 * 用例来源：/task/20261111/TK-0206/HANDOFF 第 3 节九列表格（22 条）
 * 技术方案：/task/20261111/TK-0206/TECH_DESIGN（§2 参数矩阵、§5 断言映射）
 * 覆盖：用例#10 PAGE-01、#8 GUARD-02
 * 数据隔离：BD-0 存量只读；不造数、无清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-formal-p1.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

class P1FormalTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p1-formal');
    this.total = 7;
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

  private queryCount(): number {
    return this.calls.filter((c) => c.path.includes('/stats/query') && !c.path.includes('download')).length;
  }

  /** 翻到第 page 页：等待分页激活项与表格落定（响应可选）。 */
  private async gotoPage(page: number): Promise<void> {
    await this.queryCooldown();
    const wait = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 300000 }
    ).catch(() => null);
    await this.page!.locator('.el-pager li.number', { hasText: String(page) }).first().click();
    await wait;
    this.markQuery();
    await this.page!.waitForFunction((n) => {
      const active = document.querySelector('.el-pager li.is-active, .el-pager li.active')?.textContent?.trim();
      return active === String(n);
    }, page, { timeout: 30000 });
    await this.waitTableSettled();
  }

  /** 分页守卫探测：仅当控件可用时执行用户点击，禁用态如实记录。 */
  private async guardProbe(): Promise<string> {
    const before = this.queryCount();
    const state = await this.paginationState();
    let detail = `Total=${state.total}，prevDisabled=${state.prevDisabled}，nextDisabled=${state.nextDisabled}，sizeDisabled=${state.sizeDisabled}`;
    if (state.nextDisabled) {
      detail += '，下一页禁用（用户不可点击）';
    } else {
      await this.page!.locator('.el-pagination .btn-next').first().click();
      await this.waitNoLoading(15000);
      detail += '，已点击下一页';
    }
    if (state.sizeDisabled) {
      detail += '，每页条数选择器禁用（用户不可切换）';
    } else {
      const sel = this.page!.locator('.el-pagination__sizes .el-select').first();
      await sel.click();
      const dropdown = this.page!.locator('.el-select-dropdown:visible').last();
      await dropdown.waitFor({ state: 'visible', timeout: 10000 });
      await dropdown.locator('.el-select-dropdown__item', { hasText: '10/page' }).first().click();
      await this.waitNoLoading(15000);
      detail += '，已切换每页条数为 10';
    }
    detail += `，query 请求增量=${this.queryCount() - before}（附加证据，不参与判定）`;
    return detail;
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- 用例#10 TC-PAGE-01 ----------
    await this.openDetail();
    await this.prepareDates('2026-11-10');
    await this.clickQuery();
    const totalDefault = await this.paginationTotal();
    const page1 = await this.rows();
    await this.gotoPage(2);
    const page2 = await this.rows();
    const set2 = new Set([...page1, ...page2].map((r) => r[1]));
    await this.pageSize(50);
    const page50 = await this.rows();
    const set50 = new Set(page50.map((r) => r[1]));
    await this.shot('page01-page2');
    await this.check('用例#10-①(TC-PAGE-01) 分页总数始终显示 Total 26', async (): Promise<CheckResult> => {
      const totalAfter = await this.paginationTotal();
      return {
        expect: 'Total 26（默认每页与切换 50/page 后一致）',
        real: `默认 Total=${totalDefault}，切换 50 后 Total=${totalAfter}`,
        pass: totalDefault === 26 && totalAfter === 26
      };
    });
    await this.check('用例#10-②(TC-PAGE-01) 第1页 20 行 + 第2页 6 行，sale_batch_no 无重复且覆盖 26 个批次', async (): Promise<CheckResult> => {
      return {
        expect: '第1页 20 行、第2页 6 行；合并 26 个不重复批次',
        real: `第1页=${page1.length}，第2页=${page2.length}，合并=${page1.length + page2.length}，唯一批次=${set2.size}`,
        pass: page1.length === 20 && page2.length === 6 && set2.size === 26
      };
    });
    await this.check('用例#10-③(TC-PAGE-01) 切换每页 50 后单页 26 行，批次集合与翻页一致，无重复无丢失', async (): Promise<CheckResult> => {
      const same = page50.length === 26 && set50.size === 26 && [...set50].every((b) => set2.has(b));
      return {
        expect: '单页 26 行；批次集合与翻页一致',
        real: `单页=${page50.length}，唯一批次=${set50.size}，与翻页集合一致=${same}`,
        pass: same
      };
    });

    // ---------- 用例#8 TC-GUARD-02 ----------
    await this.reset();
    await this.prepareDates('2026-11-10');
    await this.clickQuery();
    const g2RowsBeforeQueryReset = await this.rows();
    await this.reset();
    const g2EmptyBefore = await this.emptyText();
    const g2RowsBefore = await this.rows();
    const g2StateBefore = await this.paginationState();
    const g2Probe = await this.guardProbe();
    const g2EmptyAfter = await this.emptyText();
    const g2RowsAfter = await this.rows();
    const g2StateAfter = await this.paginationState();
    const g2Loading = await this.loadingCount();
    await this.shot('guard02-after-reset');
    await this.check('用例#8-①(TC-GUARD-02) 查询后重置，表格恢复空态「请输入查询条件后查看数据」且无数据行', async (): Promise<CheckResult> => {
      return {
        expect: '重置后空态「请输入查询条件后查看数据」；0 行',
        real: `查询返回行=${g2RowsBeforeQueryReset.length}；重置后空态=${g2EmptyBefore}，行=${g2RowsBefore.length}`,
        pass: g2EmptyBefore.includes('请输入查询条件后查看数据') && g2RowsBefore.length === 0
      };
    });
    await this.check('用例#8-②(TC-GUARD-02) 重置后操作分页/每页条数，表格仍为空态、无数据行', async (): Promise<CheckResult> => {
      return {
        expect: '操作后仍为空态；0 行',
        real: `操作=${g2Probe}；空态=${g2EmptyAfter}；行=${g2RowsAfter.length}`,
        pass: g2EmptyAfter.includes('请输入查询条件后查看数据') && g2RowsAfter.length === 0
      };
    });
    await this.check('用例#8-③(TC-GUARD-02) 分页保持 Total 0，每页条数与上一页/下一页保持禁用', async (): Promise<CheckResult> => {
      return {
        expect: 'Total 0；每页条数/上一页/下一页禁用',
        real: `重置后=${JSON.stringify(g2StateBefore)}；操作后=${JSON.stringify(g2StateAfter)}`,
        pass: g2StateAfter.total.includes('Total 0') && g2StateAfter.sizeDisabled && g2StateAfter.prevDisabled && g2StateAfter.nextDisabled
      };
    });
    await this.check('用例#8-④(TC-GUARD-02) 页面无 loading、未刷新出数据', async (): Promise<CheckResult> => {
      return {
        expect: 'loading 0；0 行',
        real: `loading=${g2Loading}；行=${g2RowsAfter.length}；${g2Probe}`,
        pass: g2Loading === 0 && g2RowsAfter.length === 0
      };
    });
  }
}

new P1FormalTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
