/**
 * 项目 3715 / TK-0219 补验：既有报表回归（TC-REG-01 / TC-REG-02）
 *
 * 用例来源：`/task/20261111/TK-0207/HANDOFF` 九列用例序号 15、16（2026-11-11 验收通过）
 * 技术方案：`/task/20261111/TK-0207/TECH_DESIGN`（SK-8 回归族 / §3 回归页定位 / §5 断言映射）
 * 覆盖：
 * - 序号15 TC-REG-01【P1】陪玩师日报表：数据维度必填/选项（①）、9 筛选项（②）、
 *   查询后两级分组表头正常展示（③）。③ 按任务要求使用有数据区间 2026-07-01~07-31 验证；
 *   用例原步骤的 2026-11-08 仍先执行并记录为 Total 0（环境存量差异，见 RUNS）。
 * - 序号16 TC-REG-02【P1】送礼详情：7 筛选项（①）、筛选项文案与控件正常（②）、
 *   查询后表头正常渲染（③）。③ 按 TK-0213 结论以「日期面板点选 2026-11-08 + 送礼用户ID 6360225」重跑。
 *
 * 数据隔离：只读存量数据，不造写业务数据，无清理项。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-reg.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase, UI_BASE } from './lib/admin-base.ts';

const REG01_HASH = '/data-stats-manager/player-stats/player-data-report-new';
const REG02_HASH = '/data-stats-manager/gift-data/gift-send-detail';
const REG01_DATA_START = '2026-07-01';
const REG01_DATA_END = '2026-07-31';
const REG01_CASE_DATE = '2026-11-08';
const REG02_CASE_DATE = '2026-11-08';
const REG02_SENDER_ID = '6360225';

class RegressionTest extends AdminBase {
  constructor() {
    super('auction-room-summary-reg');
    this.total = 6;
  }

  private field(label: string) {
    return this.page!
      .locator('.query-field', { has: this.page!.locator('.query-label', { hasText: label }) })
      .first();
  }

  /** 等待指定筛选项输入框的值等于目标值（web-first，不用固定 sleep）。 */
  private async waitFieldValue(label: string, value: string): Promise<void> {
    await this.page!.waitForFunction(
      ({ label, value }) => {
        const fields = Array.from(document.querySelectorAll('.query-field'));
        const target = fields.find((el) => (el.querySelector('.query-label')?.textContent ?? '').includes(label));
        const input = target?.querySelector('input') as HTMLInputElement | null;
        return !!input && input.value === value;
      },
      { label, value },
      { timeout: 10000 }
    );
  }

  /** 直接输入日期并回车提交（用于 REG-01 跨月区间）。 */
  private async setDateByInput(label: string, value: string): Promise<void> {
    const input = this.field(label).locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.page!.keyboard.press('Escape');
    await this.waitFieldValue(label, value);
  }

  /** 通过日期面板点选当月第 day 天（REG-02 用例明确要求面板点选）。 */
  private async pickDateByPanel(label: string, day: number, expected: string): Promise<string> {
    if ((await this.page!.locator('.el-picker-panel:visible').count()) > 0) {
      await this.page!.keyboard.press('Escape');
      await this.page!.locator('.el-picker-panel:visible').first().waitFor({ state: 'hidden', timeout: 5000 });
    }
    const input = this.field(label).locator('input').first();
    await input.click();
    const panel = this.page!.locator('.el-picker-panel:visible').last();
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await panel
      .locator('td.available')
      .filter({ hasText: new RegExp(`^\\s*${day}\\s*$`) })
      .first()
      .click();
    await this.waitFieldValue(label, expected);
    const value = await input.inputValue();
    await this.page!.keyboard.press('Escape');
    await this.page!.locator('.el-picker-panel:visible').first().waitFor({ state: 'hidden', timeout: 5000 });
    return value;
  }

  private async setText(label: string, value: string): Promise<void> {
    const input = this.field(label).locator('input, textarea').first();
    await input.fill(value);
    await this.waitFieldValue(label, value);
  }

  private async conditionCount(): Promise<number> {
    const text = await this.page!.locator('.app-main').innerText();
    const match = text.match(/当前已设置查询条件[：:]\s*(\d+)\s*项/);
    return match ? Number(match[1]) : -1;
  }

  private async headerRows(): Promise<string[]> {
    return (await this.page!.locator('.el-table__header-wrapper thead tr').allInnerTexts())
      .map((text) => text.trim())
      .filter(Boolean);
  }

  private async headerCells(): Promise<string[]> {
    return (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts())
      .map((text) => text.trim())
      .filter(Boolean);
  }

  private async waitQueryTotal(total: number): Promise<void> {
    await this.page!
      .locator('.box-pagination .el-pagination__total')
      .filter({ hasText: new RegExp(`Total\\s+${total}(\\D|$)`) })
      .first()
      .waitFor({ state: 'visible', timeout: 60000 });
  }

  private async queryAndCapture(timeout = 240000): Promise<{ payload: Record<string, unknown>; body: Record<string, unknown> }> {
    const responsePromise = this.page!.waitForResponse(
      (response) => response.url().includes('/stats/query') && !response.url().includes('download'),
      { timeout }
    );
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    const response = await responsePromise;
    const payload = JSON.parse(response.request().postData() ?? '{}') as Record<string, unknown>;
    const body = (await response.json()) as Record<string, unknown>;
    const total = Number((body as { data?: { total?: number } }).data?.total ?? 0);
    await this.waitQueryTotal(total);
    return { payload, body };
  }

  private async openReport(hash: string, markerLabel: string, expectedCount: number): Promise<void> {
    await this.page!.goto(`${UI_BASE}/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page!.waitForFunction(
      ({ marker, count }) => {
        const labels = Array.from(document.querySelectorAll('.query-label')).map((el) => (el.textContent ?? '').trim());
        return labels.length === count && labels.some((label) => label.includes(marker));
      },
      { marker: markerLabel, count: expectedCount },
      { timeout: 60000 }
    );
  }

  protected async run(): Promise<void> {
    await this.login();

    // ==================== 序号15 TC-REG-01 ====================
    await this.act('进入「数据统计管理 → 陪玩师相关数据 → Player Data Report(New)」', async () => {
      await this.openReport(REG01_HASH, '数据维度', 9);
    });
    const reg01Labels = (await this.page!.locator('.query-field .query-label').allInnerTexts()).map((text) => text.trim());
    const dimField = this.field('数据维度');
    const dimLabel = (await dimField.locator('.query-label').innerText()).trim();
    await dimField.locator('.el-select').click();
    const dimDropdown = this.page!.locator('.el-select-dropdown:visible').last();
    await dimDropdown.waitFor({ state: 'visible', timeout: 10000 });
    const dimOptions = (await dimDropdown.locator('.el-select-dropdown__item').allInnerTexts()).map((text) => text.trim());
    await this.shot('01-reg01-initial');
    await this.check('用例#15-① 「数据维度」为必填（*），选项含 日维度/汇总', async (): Promise<CheckResult> => {
      return {
        expect: '数据维度 label 含 *；选项含 日维度、汇总',
        real: `label=${dimLabel}；options=${JSON.stringify(dimOptions)}`,
        pass: dimLabel.includes('*') && dimOptions.includes('日维度') && dimOptions.includes('汇总')
      };
    });
    const expectReg01Labels = [
      '数据维度*',
      '开始日期',
      '结束日期',
      '成为陪玩师开始日期',
      '成为陪玩师结束日期',
      '大区',
      '国家',
      '陪玩ID',
      '陪玩NO'
    ];
    await this.check('用例#15-② 筛选项共 9 项且文案逐项一致', async (): Promise<CheckResult> => {
      return {
        expect: `9 项：${expectReg01Labels.join('|')}`,
        real: `${reg01Labels.length} 项：${reg01Labels.join('|')}`,
        pass: reg01Labels.length === 9 && JSON.stringify(reg01Labels) === JSON.stringify(expectReg01Labels)
      };
    });

    await this.act('选择「日维度」，按用例日期 2026-11-08 查询并记录存量表现', async () => {
      await dimDropdown.locator('.el-select-dropdown__item', { hasText: '日维度' }).first().click();
      await this.setDateByInput('开始日期', REG01_CASE_DATE);
      await this.setDateByInput('结束日期', REG01_CASE_DATE);
    });
    const caseDateQuery = await this.queryAndCapture();
    const caseDateTotal = Number((caseDateQuery.body as { data?: { total?: number } }).data?.total ?? 0);
    const caseDateHeaders = await this.headerCells();
    await this.shot('02-reg01-case-date-1108');
    this.notes.push(
      `REG-01 用例日期 ${REG01_CASE_DATE}：Total=${caseDateTotal}，表头列=${caseDateHeaders.length}；` +
      `payload=${JSON.stringify(caseDateQuery.payload)}`
    );

    await this.act(`改用有数据区间 ${REG01_DATA_START}~${REG01_DATA_END} 查询`, async () => {
      await this.setDateByInput('开始日期', REG01_DATA_START);
      await this.setDateByInput('结束日期', REG01_DATA_END);
    });
    const dataQuery = await this.queryAndCapture();
    const dataTotal = Number((dataQuery.body as { data?: { total?: number; headers?: unknown[] } }).data?.total ?? 0);
    const headerRowTexts = await this.headerRows();
    const allHeaderCells = await this.headerCells();
    const parentCells = (await this.page!.locator('.el-table__header-wrapper thead tr').first().locator('th').allInnerTexts())
      .map((text) => text.trim())
      .filter(Boolean);
    const bodyRows = await this.page!.locator('.el-table__body-wrapper tbody tr').count();
    await this.shot('03-reg01-grouped-header');
    this.notes.push(
      `REG-01 有数据区间 ${REG01_DATA_START}~${REG01_DATA_END}：Total=${dataTotal}，表头行=${headerRowTexts.length}，` +
      `th 总数=${allHeaderCells.length}，父级分组=${JSON.stringify(parentCells)}，数据行=${bodyRows}；` +
      `payload=${JSON.stringify(dataQuery.payload)}`
    );
    await this.check('用例#15-③ 查询后两级分组表头正常展示', async (): Promise<CheckResult> => {
      const requiredParents = ['基础信息', '活跃', '曝光', '订单', '礼物', '聊天', '评价'];
      const parentHit = requiredParents.filter((name) => parentCells.some((text) => text.includes(name)));
      const singleChar = allHeaderCells.filter((text) => text.length <= 1);
      return {
        expect: '表头行=2；父级分组含 基础信息/活跃/曝光/订单/礼物/聊天/评价；子级列完整无单字母截断',
        real: `区间=${REG01_DATA_START}~${REG01_DATA_END}，Total=${dataTotal}，表头行=${headerRowTexts.length}，` +
          `th 总数=${allHeaderCells.length}，父级=${JSON.stringify(parentCells)}，父级命中=${parentHit.length}/7，` +
          `单字母列=${JSON.stringify(singleChar)}，数据行=${bodyRows}`,
        pass:
          headerRowTexts.length === 2 &&
          parentHit.length === requiredParents.length &&
          allHeaderCells.length > parentCells.length &&
          singleChar.length === 0
      };
    });

    // ==================== 序号16 TC-REG-02 ====================
    await this.act('进入「数据统计管理 → 礼物相关数据 → 送礼详情」', async () => {
      await this.openReport(REG02_HASH, '送礼用户ID', 7);
    });
    const giftFieldCount = await this.page!.locator('.query-field').count();
    const giftLabels = (await this.page!.locator('.query-field .query-label').allInnerTexts()).map((text) => text.trim());
    const giftControls = await this.page!.locator('.query-field').evaluateAll((fields) =>
      fields.map((field) => {
        const control = field.querySelector('input, textarea, .el-select');
        const rect = control?.getBoundingClientRect();
        return {
          label: (field.querySelector('.query-label')?.textContent ?? '').trim(),
          control: control ? control.tagName.toLowerCase() + (control.className ? `.${String(control.className).split(' ')[0]}` : '') : '',
          visible: !!rect && rect.width > 0 && rect.height > 0,
          disabled: !!control && (control as HTMLInputElement).disabled === true,
          readOnly: !!control && (control as HTMLInputElement).readOnly === true
        };
      })
    );
    await this.shot('04-reg02-initial');
    await this.check('用例#16-① 筛选项共 7 项', async (): Promise<CheckResult> => {
      return {
        expect: '7 个筛选项',
        real: `筛选项=${giftFieldCount}，labels=${JSON.stringify(giftLabels)}`,
        pass: giftFieldCount === 7
      };
    });
    const expectGiftLabels = ['开始日期*', '结束日期*', '送礼用户ID', '接收用户ID', '礼物ID', '语言区', '房间ID'];
    await this.check('用例#16-② 7 项筛选项文案与控件正常', async (): Promise<CheckResult> => {
      const bad = giftControls.filter((item) => !item.control || !item.visible || item.disabled || item.readOnly);
      return {
        expect: `labels 逐项=${expectGiftLabels.join('|')}；7 项控件均可见/可用`,
        real: `labels=${JSON.stringify(giftLabels)}；控件=${JSON.stringify(giftControls)}；异常项=${JSON.stringify(bad)}`,
        pass:
          giftLabels.length === 7 &&
          JSON.stringify(giftLabels) === JSON.stringify(expectGiftLabels) &&
          bad.length === 0
      };
    });

    // 用例步骤：日期经面板点选 2026-11-08；TK-0213 结论：送礼详情 requiredAnyOf 需至少一项 ID。
    let caseDateQueries = 0;
    this.page!.on('request', (request) => {
      if (request.url().includes('/stats/query') && !request.url().includes('download')) caseDateQueries++;
    });
    const startValue = await this.pickDateByPanel('开始日期', 8, REG02_CASE_DATE);
    const endValue = await this.pickDateByPanel('结束日期', 8, REG02_CASE_DATE);
    const condBefore = await this.conditionCount();
    const qBefore = caseDateQueries;
    const blockedMessageLocator = this.page!.locator('.el-message').filter({ hasText: '至少填写一项' }).last();
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    await blockedMessageLocator.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
    const blockedMessage = (await blockedMessageLocator.innerText().catch(() => '')).trim();
    this.notes.push(
      `REG-02 仅日期查询（复现原阻塞）：日期=${startValue}/${endValue}，条件计数=${condBefore}，` +
      `query 增量=${caseDateQueries - qBefore}，必填提示=${JSON.stringify(blockedMessage)}`
    );
    await this.setDateByInput('开始日期', REG02_CASE_DATE);
    await this.setDateByInput('结束日期', REG02_CASE_DATE);
    await this.setText('送礼用户ID', REG02_SENDER_ID);
    const condWithId = await this.conditionCount();
    const query = await this.queryAndCapture();
    const giftHeaderRows = await this.headerRows();
    const giftHeaders = await this.headerCells();
    const giftRows = await this.page!.locator('.el-table__body-wrapper tbody tr').count();
    const giftTotal = Number((query.body as { data?: { total?: number } }).data?.total ?? 0);
    await this.shot('05-reg02-after-query');
    this.notes.push(
      `REG-02 补填 ID 后查询：日期=${REG02_CASE_DATE}，送礼用户ID=${REG02_SENDER_ID}，条件计数=${condWithId}，` +
      `Total=${giftTotal}，表头列=${giftHeaders.length}，数据行=${giftRows}，payload=${JSON.stringify(query.payload)}`
    );
    await this.check('用例#16-③ 查询后表头正常渲染', async (): Promise<CheckResult> => {
      const keyColumns = ['房间id', '语言区', '服务完成时间'];
      const keyHit = keyColumns.filter((key) => giftHeaders.some((text) => text.toLowerCase().includes(key.toLowerCase())));
      return {
        expect: '查询成功且有数据，表头正常渲染（含房间id/语言区/服务完成时间）',
        real: `日期=${REG02_CASE_DATE}，送礼用户ID=${REG02_SENDER_ID}，Total=${giftTotal}，表头行=${giftHeaderRows.length}，` +
          `表头列=${giftHeaders.length}，关键列命中=${JSON.stringify(keyHit)}，数据行=${giftRows}`,
        pass:
          giftTotal > 0 &&
          giftHeaderRows.length >= 1 &&
          giftHeaders.length > 0 &&
          keyHit.length === keyColumns.length &&
          giftRows > 0
      };
    });
  }
}

new RegressionTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
