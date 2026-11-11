/**
 * 项目 3716「拍拍模式流水-主播维度」：P1 重点回归与补充
 *
 * 用例来源：/task/20261111/TK-0189/TEST_CASES
 * 覆盖：
 * - TC-UI-04 分页展示正常（P1）
 * - TC-UI-05 重置清空条件与结果（P1）
 * - TC-FILTER-04 大区与房间组合筛选（P1）
 * - TC-REG-01 房间维度报表无回归（P1，重点回归）
 * 数据隔离：只读查询存量数据，不造数、不清理。
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

class P1ExtraTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p1');
    this.total = 7;
  }

  private async openDetail(): Promise<void> {
    await this.nav('/data-stats-manager/voice-room-data/auction-mode-player-detail');
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

  private async rows(): Promise<string[][]> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').evaluateAll((rs) =>
      rs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()))
    );
  }

  private async allRows(total: number): Promise<string[][]> {
    const rows = await this.rows();
    if (total <= rows.length) return rows;
    const pages = Math.ceil(total / rows.length);
    for (let i = 1; i < pages; i++) {
      const wait = this.page!.waitForResponse(
        (r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 120000 }
      ).catch(() => null);
      await this.page!.locator('.el-pager li.number', { hasText: String(i + 1) }).first().click();
      await wait;
      await this.page!.waitForTimeout(1800);
      rows.push(...(await this.rows()));
    }
    return rows;
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- TC-UI-04 ----------
    await this.openDetail();
    await this.pickDates(10);
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    const total = await this.paginationTotal();
    const page1 = await this.rows();
    const wait2 = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 120000 }
    ).catch(() => null);
    await this.page!.locator('.el-pager li.number', { hasText: '2' }).first().click();
    await wait2;
    await this.page!.waitForTimeout(1800);
    const page2 = await this.rows();
    await this.shot('ui04-pagination-page2');
    await this.check('用例#TC-UI-04-① 分页总数 26 且页码 2 可正常切换', async (): Promise<CheckResult> => {
      return { expect: '分页 Total 26；第1页 20 行、第2页 6 行', real: `Total=${total}，第1页=${page1.length}，第2页=${page2.length}`, pass: total === 26 && page1.length === 20 && page2.length === 6 };
    });
    await this.check('用例#TC-UI-04-② 翻页后数据不重复、不丢失', async (): Promise<CheckResult> => {
      const all = [...page1, ...page2];
      const batches = all.map((r) => r[1]);
      const unique = new Set(batches);
      return { expect: '合并 26 行，批次号无重复且总数 26', real: `合并=${all.length}，唯一批次=${unique.size}`, pass: all.length === 26 && unique.size === 26 };
    });

    // ---------- TC-UI-05 ----------
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
    const emptyAfterReset = await this.emptyText();
    await this.shot('ui05-after-reset');
    await this.check('用例#TC-UI-05-① 重置后日期、大区、房间 ID、主播 ID 条件清空', async (): Promise<CheckResult> => {
      return { expect: '所有筛选项值为空', real: fieldValues.join('；'), pass: allEmpty };
    });
    await this.check('用例#TC-UI-05-② 重置后表格清空并恢复「请输入查询条件后查看数据」', async (): Promise<CheckResult> => {
      const rowCount = await this.page!.locator('.el-table__body-wrapper tbody tr').count();
      return { expect: '数据行 0；空态文案「请输入查询条件后查看数据」', real: `数据行=${rowCount}，空态=${emptyAfterReset}`, pass: rowCount === 0 && emptyAfterReset.includes('请输入查询条件后查看数据') };
    });

    // ---------- TC-FILTER-04 ----------
    await this.pickDates(10);
    await this.pickOption('大区', '印尼语区');
    await this.fillField('房间ID', '10101473,1002');
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    const total4 = await this.paginationTotal();
    const r4 = await this.allRows(total4);
    const ids4 = [...new Set(r4.map((r) => String(r[5])))].sort();
    await this.shot('filter04-locale-room');
    await this.check('用例#TC-FILTER-04-① 大区 in + 房间 10101473,1002 组合筛选仅返回同时满足条件的行', async (): Promise<CheckResult> => {
      return {
        expect: '页面行数=分页 Total，且 Room id 仅含 1002/10101473',
        real: `行=${r4.length}，Total=${total4}，Room id 集合=${JSON.stringify(ids4)}`,
        pass: r4.length === total4 && ids4.length > 0 && ids4.every((id) => id === '1002' || id === '10101473')
      };
    });

    // ---------- TC-REG-01 ----------
    await this.nav('/data-stats-manager/voice-room-data/auction-mode-room-summary');
    await this.page!.waitForSelector('.filter-card', { timeout: 30000 });
    await this.page!.waitForTimeout(1500);
    await this.pickDate('开始日期', 8);
    await this.pickDate('结束日期', 8);
    await this.clickQuery();
    await this.page!.waitForTimeout(3000);
    const regHeaders = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const headerRowCount = await this.page!.locator('.el-table__header-wrapper thead tr').count();
    const regRows = await this.rows();
    const sum = (i: number) => regRows.reduce((acc, r) => acc + num(r[i]), 0);
    await this.shot('reg01-room-summary-1108');
    await this.check('用例#TC-REG-01-① 房间维度报表可进入，12 列分组表头正常', async (): Promise<CheckResult> => {
      return { expect: '12 列表头，分组表头行数≥1，表头无单字母截断', real: `列=${regHeaders.length}，表头行=${headerRowCount}，表头=${regHeaders.join('|')}`, pass: regHeaders.length === 12 && !regHeaders.some((h) => h.length <= 1) };
    });
    await this.check('用例#TC-REG-01-② 2026-11-08 返回 18 行且合计 35/21/14/728,846.40 正常', async (): Promise<CheckResult> => {
      const got = { sessions: sum(3), ended: sum(4), success: sum(5), failure: sum(6), coins: Math.round(sum(7) * 100) / 100 };
      const ok = regRows.length === 18 && got.sessions === 35 && got.ended === 35 && got.success === 21 && got.failure === 14 && Math.abs(got.coins - 728846.4) < 0.01;
      return { expect: '18 行；35/35/21/14/728846.40', real: `${regRows.length} 行；${JSON.stringify(got)}`, pass: ok };
    });


  }
}

new P1ExtraTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
