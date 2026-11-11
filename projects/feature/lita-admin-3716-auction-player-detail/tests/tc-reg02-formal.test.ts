/**
 * 项目 3716 回归：REG-02 陪玩师日报表（player-daily-report）两级分组表头
 *
 * 用例来源：/task/20261111/TK-0206/HANDOFF TC-REG-02
 * 定位说明：`player-daily-report` 为报表 configId；直接路由 /player-stats/player-daily-report 为 404，
 *          实际入口为 /player-stats/player-data-report-new（菜单 Player Data Report(New)，页面标题「陪玩师日报表」）。
 * 数据：日维度 2026-07-01~2026-07-31（存量有数据）；只读，不造数。
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

class Reg02Formal extends AdminBase {
  constructor() { super('reg02-player-daily-report'); this.total = 3; }

  private async setDate(label: string, value: string): Promise<boolean> {
    const field = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
    const input = field.locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.page!.keyboard.press('Escape');
    await this.page!.waitForTimeout(700);
    return (await input.inputValue()) === value;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.nav('/data-stats-manager/player-stats/player-data-report-new');
    await this.page!.waitForSelector('.filter-card', { timeout: 30000 });
    await this.page!.waitForTimeout(2000);

    const title = await this.page!.locator('.page-title').innerText().catch(() => '');
    const hash = await this.page!.evaluate(() => location.hash);
    const filters = (await this.page!.locator('.query-label').allInnerTexts()).map((t) => t.trim());
    await this.check('用例#TC-REG-02-① 进入陪玩师日报表，筛选区含数据维度/开始日期/结束日期/大区/国家/陪玩ID/陪玩NO', async (): Promise<CheckResult> => {
      const need = ['数据维度', '开始日期', '结束日期', '大区', '国家', '陪玩ID', '陪玩NO'];
      const ok = need.every((n) => filters.some((f) => f.includes(n)));
      return { expect: need.join('/'), real: `hash=${hash}，标题=${title}，筛选项=${JSON.stringify(filters)}`, pass: ok };
    });

    const dim = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '数据维度' }) }).first();
    await dim.locator('.el-select').click();
    await this.page!.waitForTimeout(500);
    await this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: '日维度' }).first().click();
    await this.page!.waitForTimeout(400);
    const d1 = await this.setDate('开始日期', '2026-07-01');
    const d2 = await this.setDate('结束日期', '2026-07-31');
    const wait = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'), { timeout: 180000 }
    ).catch(() => null);
    await this.page!.locator('button', { hasText: '查询' }).first().click();
    await wait;
    await this.page!.waitForTimeout(3500);

    const headerRows = await this.page!.locator('.el-table__header-wrapper thead tr').count();
    const headers = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const rows = await this.page!.locator('.el-table__body-wrapper tbody tr').count();
    const empty = await this.page!.locator('.el-table__empty-text').innerText().catch(() => '');
    const totalText = await this.totalText();
    const body = (await this.page!.locator('body').innerText()).slice(0, 800);
    await this.shot('reg02-grouped-header');
    await this.check('用例#TC-REG-02-② 日维度有数据查询后两级分组表头正常展示（父级+子级，对齐不截断）', async (): Promise<CheckResult> => {
      const parents = ['基础信息(Basic Information)', '活跃(Activity)', '曝光(Exposure)', '订单(Orders)', '礼物(Gifts)', '聊天(Chat)', '评价(Feedback)'];
      const parentHit = parents.filter((p) => headers.some((h) => h.includes(p))).length;
      return {
        expect: '表头行≥2；父级分组≥4 个；子级列>7；无单字母列',
        real: `dates=${d1}/${d2}，表头行=${headerRows}，表头列=${headers.length}，父级命中=${parentHit}，单字母=${headers.filter((h) => h.length <= 1).length}，Total=${totalText}`,
        pass: headerRows >= 2 && parentHit >= 4 && headers.length > 7 && !headers.some((h) => h.length <= 1)
      };
    });
    await this.check('用例#TC-REG-02-③ 列表展示数据行（行数大于 0），无报错弹窗', async (): Promise<CheckResult> => {
      const err = /404|无权限|not found|error/i.test(body);
      return { expect: '数据行>0；Total>0；无报错', real: `数据行=${rows}，Total=${totalText}，空态=${empty}，错误=${err}`, pass: rows > 0 && !empty.includes('暂无数据') && !err };
    });
    this.notes.push(`REG-02 route=${hash}; title=${title}; dates=2026-07-01~2026-07-31; headerRows=${headerRows}; headers=${headers.length}; rows=${rows}; total=${totalText}`);
  }
}

new Reg02Formal().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
