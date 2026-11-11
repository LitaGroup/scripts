/**
 * 拍拍模式流水-房间维度：P1/P2 用例（UI）
 *
 * 用例来源：TK-0207 交付文档 `/task/20261111/TK-0207/HANDOFF`（九列用例 1~18）
 * 技术方案：`/task/20261111/TK-0207/TECH_DESIGN`
 *
 * 覆盖：
 * - 序号7  TC-UI-04 分页（P1，3 检查点）
 * - 序号8  TC-UI-05 重置（P1，2 检查点）
 * - 序号14 TC-FILTER-04 大区+房间组合（P1，2 检查点）
 * - 序号17 TC-EDGE-01 无数据区间（P2，3 检查点）
 * - 序号18 TC-EDGE-02 超长房间 ID（P2，3 检查点）
 *
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-p1-edge.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const REPORT_HASH = '/data-stats-manager/voice-room-data/auction-mode-room-summary';

class P1EdgeTest extends AdminBase {
  constructor() {
    super('auction-room-summary-p1-edge');
    this.total = 13;
  }

  private async openReport(): Promise<void> {
    await this.nav(REPORT_HASH);
    await this.page!.waitForSelector('.filter-card', { timeout: 60000 });
    await this.page!.waitForTimeout(1500);
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

  private async query(): Promise<void> {
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
  }

  private async reset(): Promise<void> {
    await this.page!.getByRole('button', { name: '重置', exact: true }).click();
    await this.page!.waitForTimeout(1200);
  }

  private async conditionCount(): Promise<number> {
    const text = await this.page!.locator('.app-main').innerText().catch(() => '');
    const m = text.match(/当前已设置查询条件[：:]\s*(\d+)\s*项/);
    return m ? Number(m[1]) : -1;
  }

  private async pageSizeOptions(): Promise<string[]> {
    await this.page!.locator('.box-pagination .el-select').first().click();
    await this.page!.waitForTimeout(600);
    const items = (await this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item').allInnerTexts())
      .map((t) => t.trim()).filter(Boolean);
    await this.page!.keyboard.press('Escape');
    await this.page!.waitForTimeout(300);
    return items;
  }

  private async nextPage(): Promise<void> {
    const wait = this.page!.waitForResponse(
      (r) => r.url().includes('/stats/query') && !r.url().includes('download'),
      { timeout: 120000 }
    ).catch(() => null);
    await this.page!.locator('.box-pagination .btn-next').first().click();
    await wait;
    await this.page!.waitForTimeout(2000);
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- 序号7 TC-UI-04 分页 ----------
    await this.openReport();
    await this.setDateExact('开始日期', '2026-11-02');
    await this.setDateExact('结束日期', '2026-11-09');
    await this.pickOption('大区', '印尼语区');
    await this.query();
    const total30 = await this.paginationTotal();
    const page1 = (await this.tableRows()).map((r) => String(r[1]));
    const sizeOptions = await this.pageSizeOptions();
    await this.nextPage();
    const page2 = (await this.tableRows()).map((r) => String(r[1]));
    await this.shot('ui04-pagination-page2');
    const union = new Set([...page1, ...page2]);
    const overlap = page1.filter((id) => page2.includes(id));
    await this.check('用例#7-①(TC-UI-04) 大区印尼语区查询分页 Total 30', async (): Promise<CheckResult> => {
      return {
        expect: '分页 Total 30',
        real: `分页 Total=${total30}`,
        pass: total30 === 30
      };
    });
    await this.check('用例#7-②(TC-UI-04) 20/页时第 1 页 20 行、第 2 页 10 行，两页 room id 不重复、合计 30 房', async (): Promise<CheckResult> => {
      return {
        expect: '第1页 20 行、第2页 10 行，两页唯一房间 30，无重复',
        real: `第1页=${page1.length}，第2页=${page2.length}，唯一=${union.size}，重复=${JSON.stringify(overlap)}`,
        pass: page1.length === 20 && page2.length === 10 && union.size === 30 && overlap.length === 0
      };
    });
    await this.check('用例#7-③(TC-UI-04) 每页条数可选 10/20/30/50', async (): Promise<CheckResult> => {
      const expected = ['10/page', '20/page', '30/page', '50/page'];
      const normalized = sizeOptions.map((s) => s.replace(/\s+/g, ''));
      return {
        expect: expected.join('/'),
        real: JSON.stringify(sizeOptions),
        pass: expected.every((e) => normalized.includes(e.replace(/\s+/g, '')))
      };
    });

    // ---------- 序号8 TC-UI-05 重置 ----------
    await this.reset();
    await this.setDateExact('开始日期', '2026-11-08');
    await this.setDateExact('结束日期', '2026-11-08');
    await this.query();
    const beforeRows = await this.tableRows();
    await this.reset();
    const values = await this.page!.locator('.query-field input, .query-field textarea').evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement | HTMLTextAreaElement).value)
    );
    const empty = await this.emptyText();
    const totalAfterReset = await this.paginationTotal();
    const condAfterReset = await this.conditionCount();
    await this.shot('ui05-reset');
    await this.check('用例#8-①(TC-UI-05) 重置后开始/结束日期、房间ID、大区 4 控件均清空', async (): Promise<CheckResult> => {
      return {
        expect: '4 个筛选控件值均为空',
        real: `重置前数据行=${beforeRows.length}，重置后控件值=${JSON.stringify(values)}`,
        pass: values.length >= 4 && values.every((v) => v === '')
      };
    });
    await this.check('用例#8-②(TC-UI-05) 重置后表格回初始空态、Total 0、条件计数 0 项', async (): Promise<CheckResult> => {
      return {
        expect: '空态「请输入查询条件后查看数据」、Total 0、条件计数 0',
        real: `空态=${empty}，Total=${totalAfterReset}，条件计数=${condAfterReset}`,
        pass: empty.includes('请输入查询条件后查看数据') && totalAfterReset === 0 && condAfterReset === 0
      };
    });

    // ---------- 序号14 TC-FILTER-04 大区+房间组合 ----------
    await this.reset();
    await this.setDateExact('开始日期', '2026-11-02');
    await this.setDateExact('结束日期', '2026-11-09');
    await this.pickOption('大区', '印尼语区');
    await this.fillField('房间ID', '17100109,101040');
    await this.query();
    const r4 = await this.tableRows();
    const ids4 = r4.map((r) => String(r[1]));
    await this.shot('filter04-locale-room');
    await this.check('用例#14-①(TC-FILTER-04) 大区 in + 房间 17100109,101040 返回 1 行', async (): Promise<CheckResult> => {
      return {
        expect: '返回 1 行',
        real: `行=${r4.length}，Room id=${JSON.stringify(ids4)}`,
        pass: r4.length === 1
      };
    });
    await this.check('用例#14-②(TC-FILTER-04) room id 仅 101040（17100109 非 in 大区被排除）', async (): Promise<CheckResult> => {
      return {
        expect: 'Room id=101040',
        real: `Room id=${JSON.stringify(ids4)}`,
        pass: ids4.length === 1 && ids4[0] === '101040'
      };
    });

    // ---------- 序号17 TC-EDGE-01 无数据区间 ----------
    await this.reset();
    await this.setDateExact('开始日期', '2026-01-01');
    await this.setDateExact('结束日期', '2026-01-02');
    await this.clickQuery();
    const msgE1 = await this.messageText();
    await this.page!.waitForTimeout(2000);
    const rE1 = await this.tableRows();
    const totalE1 = await this.paginationTotal();
    const emptyE1 = await this.emptyText();
    const bodyE1 = (await this.page!.locator('body').innerText()).replace(/\n+/g, ' ');
    await this.shot('edge01-empty-range');
    await this.check('用例#17-①(TC-EDGE-01) 无数据区间返回 0 行、Total 0', async (): Promise<CheckResult> => {
      return {
        expect: '返回 0 行，分页 Total 0',
        real: `行=${rE1.length}，分页 Total=${totalE1}`,
        pass: rE1.length === 0 && totalE1 === 0
      };
    });
    await this.check('用例#17-②(TC-EDGE-01) 表格显示「暂无数据」', async (): Promise<CheckResult> => {
      return {
        expect: '空态「暂无数据」',
        real: `空态=${emptyE1}`,
        pass: emptyE1.includes('暂无数据')
      };
    });
    await this.check('用例#17-③(TC-EDGE-01) 提示「查询完成，共 0 条」且页面无报错', async (): Promise<CheckResult> => {
      const hasError = /error|失败|异常|500/i.test(bodyE1);
      return {
        expect: '提示「查询完成，共 0 条」，页面无报错',
        real: `提示=${msgE1}，页面含错误文案=${hasError}`,
        pass: msgE1.includes('查询完成') && msgE1.includes('0') && !hasError
      };
    });

    // ---------- 序号18 TC-EDGE-02 超长房间 ID ----------
    await this.reset();
    await this.setDateExact('开始日期', '2026-11-02');
    await this.setDateExact('结束日期', '2026-11-09');
    const ids = Array.from({ length: 101 }, (_, i) => String(99900001 + i)).join(',');
    await this.fillField('房间ID', ids);
    await this.clickQuery();
    const msgE2 = await this.messageText();
    await this.page!.waitForTimeout(2000);
    const rE2 = await this.tableRows();
    const totalE2 = await this.paginationTotal();
    const emptyE2 = await this.emptyText();
    const bodyE2 = (await this.page!.locator('body').innerText()).replace(/\n+/g, ' ');
    const errorMsg = await this.page!.locator('.el-message--error').count();
    const tableCount = await this.page!.locator('.el-table').count();
    await this.shot('edge02-long-room-ids');
    await this.check('用例#18-①(TC-EDGE-02) 101 个房间 ID 查询返回 0 行、「暂无数据」', async (): Promise<CheckResult> => {
      return {
        expect: '0 行，空态「暂无数据」',
        real: `行=${rE2.length}，Total=${totalE2}，空态=${emptyE2}`,
        pass: rE2.length === 0 && totalE2 === 0 && emptyE2.includes('暂无数据')
      };
    });
    await this.check('用例#18-②(TC-EDGE-02) 提示「查询完成，共 0 条」', async (): Promise<CheckResult> => {
      return {
        expect: '提示「查询完成，共 0 条」',
        real: `提示=${msgE2}`,
        pass: msgE2.includes('查询完成') && msgE2.includes('0')
      };
    });
    await this.check('用例#18-③(TC-EDGE-02) 页面不报错、不白屏', async (): Promise<CheckResult> => {
      return {
        expect: '无错误提示、表格区域存在、页面正文非空',
        real: `错误提示=${errorMsg}，表格数=${tableCount}，正文长度=${bodyE2.length}`,
        pass: errorMsg === 0 && tableCount > 0 && bodyE2.length > 50
      };
    });
  }
}

new P1EdgeTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
