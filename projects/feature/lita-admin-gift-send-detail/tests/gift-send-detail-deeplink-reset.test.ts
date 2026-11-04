/**
 * 送礼详情深链预填与重置（UI）
 *
 * 覆盖：
 * 1. ?uid=<userId> 预填送礼用户ID，不自动查询、分页禁用
 * 2. 预填后补日期可手动查询
 * 3. 重置：清空条件、清空结果、分页禁用、不自动查询
 * 4. 其他通用报表页面（直播间日数据）不受影响
 *
 * 运行：node gift-send-detail-deeplink-reset.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminReportBase, REPORT_PATH, SENDER_ID } from './lib/admin-report.ts';

class DeepLinkResetTest extends AdminReportBase {
  constructor() {
    super('gift-send-detail-deeplink-reset');
    this.total = 12;
  }

  protected async run(): Promise<void> {
    await this.ensureSession();
    await this.openReport(`${REPORT_PATH}?uid=${SENDER_ID}`);
    await this.shot('deeplink-loaded');

    await this.check('深链 ?uid=：送礼用户ID 预填为 6360225', async (): Promise<CheckResult> => {
      const value = await this.field('送礼用户ID').locator('input').first().inputValue();
      return { expect: SENDER_ID, real: value, pass: value === SENDER_ID };
    });

    await this.check('深链 ?uid=：不自动查询，表格为空、分页禁用', async (): Promise<CheckResult> => {
      const rows = await this.tableRowCount();
      const disabled = await this.paginationDisabled();
      return {
        expect: 'query 请求=0，rows=0，分页禁用',
        real: `query 请求=${this.queryCalls().length}，rows=${rows}，分页禁用=${disabled}`,
        pass: this.queryCalls().length === 0 && rows === 0 && disabled,
      };
    });

    // 补日期后手动查询
    await this.setDate('开始日期', '2026-11-02');
    await this.setDate('结束日期', '2026-11-03');
    const response = await this.clickQuery();
    const body = await response.json();
    await this.page!.waitForTimeout(600);
    await this.shot('deeplink-query');
    await this.check('深链预填后补日期查询：total=1 且送礼用户一致', async (): Promise<CheckResult> => {
      const row = body.data?.data?.[0] ?? [];
      const headers = (body.data?.headers ?? []) as Array<{ name: string }>;
      const index = headers.findIndex((item) => item.name === '送礼用户id');
      return {
        expect: `total=1，送礼用户id=${SENDER_ID}`,
        real: `total=${body.data?.total}，送礼用户id=${row[index]}，rows=${await this.tableRowCount()}`,
        pass: body.data?.total === 1 && String(row[index]) === SENDER_ID,
      };
    });

    // 重置
    const callsBefore = this.queryCalls().length;
    await this.clickReset();
    const resetValues = await this.page!.locator('.query-field input, .query-field textarea').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement).value).filter(Boolean),
    );
    await this.shot('after-reset');

    await this.check('重置：清空全部查询条件', async (): Promise<CheckResult> => {
      return { expect: '[]', real: JSON.stringify(resetValues), pass: resetValues.length === 0 };
    });

    await this.check('重置：清空表格且分页禁用', async (): Promise<CheckResult> => {
      const rows = await this.tableRowCount();
      const disabled = await this.paginationDisabled();
      return { expect: 'rows=0，分页禁用', real: `rows=${rows}，分页禁用=${disabled}`, pass: rows === 0 && disabled };
    });

    await this.check('重置：不自动查询', async (): Promise<CheckResult> => {
      return { expect: '新增 query 请求=0', real: `新增 query 请求=${this.queryCalls().length - callsBefore}`, pass: this.queryCalls().length === callsBefore };
    });

    // 查询中重置：迟到响应不得恢复结果/分页
    await this.setDate('开始日期', '2026-11-02');
    await this.setDate('结束日期', '2026-11-03');
    await this.setText('送礼用户ID', SENDER_ID);
    this.queryDelayMs = 4000;
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    await this.page!.waitForTimeout(600);
    await this.clickReset();
    await this.page!.waitForTimeout(5000);
    await this.shot('reset-in-flight');

    await this.check('查询中重置：迟到响应后表格保持为空', async (): Promise<CheckResult> => {
      const rows = await this.tableRowCount();
      return { expect: 'rows=0', real: `rows=${rows}`, pass: rows === 0 };
    });

    await this.check('查询中重置：迟到响应后分页保持禁用', async (): Promise<CheckResult> => {
      const disabled = await this.paginationDisabled();
      return { expect: '分页禁用', real: `分页禁用=${disabled}`, pass: disabled };
    });

    await this.check('查询中重置：迟到响应后无查询成功提示', async (): Promise<CheckResult> => {
      const success = await this.page!.locator('.el-message__content', { hasText: '查询完成' }).count();
      return { expect: '查询完成提示=0', real: `查询完成提示=${success}`, pass: success === 0 };
    });

    // 其他通用报表页面（独立页面，非通用报表组件）
    const callsBeforeOther = this.queryCalls().length;
    await this.page!.goto(`${this.page!.url().split('#')[0]}#/data-stats-manager/room-day-data`, { waitUntil: 'domcontentloaded' });
    await this.page!.waitForSelector('.el-table', { timeout: 30000 });
    await this.page!.waitForTimeout(1500);
    await this.shot('other-report-page');

    await this.check('其他报表页面（直播间日数据）正常加载', async (): Promise<CheckResult> => {
      const title = await this.page!.title();
      const headers = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((item) => item.trim()).filter(Boolean);
      const errors = await this.page!.locator('.el-message--error').count();
      return {
        expect: '标题含「直播间日数据」，表头含 Date/Room ID，无错误提示',
        real: `title=${title}，headers=${headers.slice(0, 8).join('|')}，errorMessages=${errors}`,
        pass: title.includes('直播间日数据') && headers.includes('Date') && headers.includes('Room ID') && errors === 0,
      };
    });

    await this.check('其他报表页面：导航不触发送礼详情查询', async (): Promise<CheckResult> => {
      return {
        expect: '新增送礼详情 query 请求=0',
        real: `新增 query 请求=${this.queryCalls().length - callsBeforeOther}`,
        pass: this.queryCalls().length === callsBeforeOther,
      };
    });

    await this.check('其他报表页面：不残留送礼详情筛选项', async (): Promise<CheckResult> => {
      const text = await this.page!.locator('body').innerText();
      return {
        expect: '不含「送礼用户ID」「礼物ID」筛选项',
        real: `含送礼用户ID=${text.includes('送礼用户ID')}，含礼物ID=${text.includes('礼物ID')}`,
        pass: !text.includes('送礼用户ID') && !text.includes('礼物ID'),
      };
    });

    await this.shot('deeplink-reset-done');
  }
}

await new DeepLinkResetTest().execute();
