/**
 * 拍拍模式流水-房间维度：既有报表回归（UI）
 *
 * 用例来源：TK-0207 交付文档 `/task/20261111/TK-0207/HANDOFF`（九列用例 1~18）
 * 技术方案：`/task/20261111/TK-0207/TECH_DESIGN`
 *
 * 覆盖：
 * - 序号15 TC-REG-01 陪玩师数据报表(New) 分组表头无回归（P1，3 检查点；③ 需数据）
 * - 序号16 TC-REG-02 送礼详情表头无回归（P1，3 检查点；③ 日期交互见 CB-02）
 *
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-reg.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const REG01_HASH = '/data-stats-manager/player-stats/player-data-report-new';
const REG02_HASH = '/data-stats-manager/gift-data/gift-send-detail';

class RegressionTest extends AdminBase {
  constructor() {
    super('auction-room-summary-reg');
    this.total = 6;
  }

  private queryCount(): number {
    return this.calls.filter((c) => c.path.includes('/stats/query')).length;
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

  /** 通过日期面板点选当月第 day 天（送礼详情页日期控件需面板交互）。 */
  private async pickDatePanel(label: string, day: number): Promise<boolean> {
    const field = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) }).first();
    const input = field.locator('input').first();
    await input.click();
    await this.page!.waitForTimeout(1000);
    const panel = this.page!.locator('.el-picker-panel:visible').last();
    try {
      await panel.waitFor({ state: 'visible', timeout: 5000 });
      const td = panel.locator('td.available').filter({ hasText: new RegExp(`^\\s*${day}\\s*$`) }).first();
      if ((await td.count()) === 0) return false;
      await td.click({ timeout: 5000 });
      await this.page!.waitForTimeout(500);
      // 日期面板点选后按 Enter 提交 v-model（实测不按 Enter 时条件计数不更新）
      await input.press('Enter');
      await this.page!.waitForTimeout(800);
      return (await input.inputValue()).length > 0;
    } catch {
      return false;
    }
  }

  private async conditionCount(): Promise<number> {
    const text = await this.page!.locator('.app-main').innerText().catch(() => '');
    const m = text.match(/当前已设置查询条件[：:]\s*(\d+)\s*项/);
    return m ? Number(m[1]) : -1;
  }

  private async headerRows(): Promise<string[]> {
    return (await this.page!.locator('.el-table__header-wrapper tr').allInnerTexts().catch(() => []))
      .map((t) => t.trim()).filter(Boolean);
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- 序号15 TC-REG-01 ----------
    await this.nav(REG01_HASH);
    await this.page!.waitForSelector('.query-field', { timeout: 60000 }).catch(() => undefined);
    await this.page!.waitForTimeout(2000);
    const dimField = this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '数据维度' }) }).first();
    const dimLabel = (await dimField.locator('.query-label').innerText().catch(() => '')).trim();
    let dimOptions: string[] = [];
    try {
      await dimField.locator('.el-select').click();
      await this.page!.waitForTimeout(700);
      dimOptions = (await this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item').allInnerTexts())
        .map((t) => t.trim()).filter(Boolean);
    } catch { /* 选项读取失败时 check 会失败 */ }
    const labels = (await this.page!.locator('.query-field .query-label').allInnerTexts()).map((t) => t.trim());
    await this.shot('reg01-initial');
    await this.check('用例#15-①(TC-REG-01) 「数据维度」为必填，选项含 日维度/汇总', async (): Promise<CheckResult> => {
      return {
        expect: '数据维度为必填（*），选项含 日维度/汇总',
        real: `label=${dimLabel}，options=${JSON.stringify(dimOptions)}`,
        pass: dimLabel.includes('*') && dimOptions.includes('日维度') && dimOptions.includes('汇总')
      };
    });
    const expectLabels = ['数据维度*', '开始日期', '结束日期', '成为陪玩师开始日期', '成为陪玩师结束日期', '大区', '国家', '陪玩ID', '陪玩NO'];
    await this.check('用例#15-②(TC-REG-01) 筛选项共 9 项且文案逐项一致', async (): Promise<CheckResult> => {
      return {
        expect: expectLabels.join('|'),
        real: `${labels.length} 项：${labels.join('|')}`,
        pass: labels.length === 9 && expectLabels.every((l) => labels.includes(l))
      };
    });
    // 按用例步骤：日维度 + 2026-11-08 查询，观察分组表头
    try {
      // 下拉已在读取选项时打开，直接点选「日维度」，避免二次开合导致关闭
      await this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: '日维度' }).first().click();
      await this.page!.waitForTimeout(800);
    } catch { /* 选择失败时 check 会失败 */ }
    this.notes.push(`REG-01 数据维度选择后条件计数=${await this.conditionCount()}`);
    const p1 = await this.pickDatePanel('开始日期', 8);
    const p2 = await this.pickDatePanel('结束日期', 8);
    this.notes.push(`REG-01 日期面板点选：开始=${p1}，结束=${p2}`);
    await this.clickQuery();
    await this.page!.waitForTimeout(4000);
    const reg01Total = await this.paginationTotal();
    const reg01Headers = await this.headerRows();
    const reg01Rows = (await this.tableRows()).length;
    await this.shot('reg01-after-query-1108');
    await this.check('用例#15-③(TC-REG-01) 查询后两级分组表头正常展示', async (): Promise<CheckResult> => {
      const groupOk = reg01Headers.length >= 2 && reg01Headers[0].includes('基础信息') && reg01Headers[0].includes('活跃');
      return {
        expect: '两级分组表头（基础信息/活跃/曝光等）正常展示',
        real: `Total=${reg01Total}，数据行=${reg01Rows}，表头行数=${reg01Headers.length}，表头首行=${JSON.stringify(reg01Headers[0] ?? '')}`,
        pass: groupOk
      };
    });
    // 补充证据（不计检查点）：换 2026-11-02~03 有数据区间，验证分组表头功能
    const p3 = await this.pickDatePanel('开始日期', 2);
    const p4 = await this.pickDatePanel('结束日期', 3);
    this.notes.push(`REG-01 补充区间日期面板点选：开始=${p3}，结束=${p4}`);
    await this.clickQuery();
    await this.page!.waitForTimeout(5000);
    const reg01Total2 = await this.paginationTotal();
    const reg01Headers2 = await this.headerRows();
    await this.shot('reg01-supplement-1102-1103');
    this.notes.push(`REG-01 补充区间 2026-11-02~03：Total=${reg01Total2}，表头行数=${reg01Headers2.length}，首行=${JSON.stringify(reg01Headers2[0] ?? '')}`);

    // ---------- 序号16 TC-REG-02 ----------
    await this.nav(REG02_HASH);
    await this.page!.waitForSelector('.query-field', { timeout: 60000 }).catch(() => undefined);
    await this.page!.waitForTimeout(2000);
    const giftLabels = (await this.page!.locator('.query-field .query-label').allInnerTexts()).map((t) => t.trim());
    const giftFieldCount = await this.page!.locator('.query-field').count();
    await this.shot('reg02-initial');
    const expectGiftLabels = ['开始日期*', '结束日期*', '送礼用户ID', '接收用户ID', '礼物ID', '语言区', '房间ID'];
    await this.check('用例#16-①(TC-REG-02) 筛选项共 7 项', async (): Promise<CheckResult> => {
      return {
        expect: '7 个筛选项',
        real: `筛选项=${giftFieldCount}`,
        pass: giftFieldCount === 7
      };
    });
    await this.check('用例#16-②(TC-REG-02) 7 项筛选项文案与控件正常', async (): Promise<CheckResult> => {
      return {
        expect: expectGiftLabels.join('|'),
        real: giftLabels.join('|'),
        pass: giftLabels.length === 7 && expectGiftLabels.every((l) => giftLabels.includes(l))
      };
    });
    const condBefore = await this.conditionCount();
    const qBefore = this.queryCount();
    const p1Ok = await this.pickDatePanel('开始日期', 8);
    const p2Ok = await this.pickDatePanel('结束日期', 8);
    const condAfterPick = await this.conditionCount();
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    await this.page!.waitForTimeout(4000);
    const qAfter = this.queryCount();
    const giftHeaders = await this.headerRows();
    const giftRows = (await this.tableRows()).length;
    await this.shot('reg02-after-query');
    this.notes.push(`REG-02 日期面板点选：开始=${p1Ok}，结束=${p2Ok}；条件计数 ${condBefore}→${condAfterPick}；query 请求 ${qBefore}→${qAfter}；数据行=${giftRows}`);
    await this.check('用例#16-③(TC-REG-02) 查询后表头正常渲染', async (): Promise<CheckResult> => {
      const keys = ['房间id', '语言区', '服务完成时间'];
      const headerOk = giftHeaders.length > 0 && keys.every((k) => giftHeaders.some((h) => h.toLowerCase().includes(k.toLowerCase())));
      return {
        expect: '表头正常渲染，包含房间id/语言区/服务完成时间',
        real: `表头行数=${giftHeaders.length}，文本=${JSON.stringify(giftHeaders.slice(0, 5))}，query 请求增量=${qAfter - qBefore}，条件计数=${condAfterPick}`,
        pass: headerOk
      };
    });
  }
}

new RegressionTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
