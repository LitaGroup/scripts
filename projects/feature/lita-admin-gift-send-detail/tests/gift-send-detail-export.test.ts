/**
 * 送礼详情导出（UI）
 *
 * 覆盖：
 * 1. 合法条件导出 xlsx：文件名、表头、数据与筛选条件一致
 * 2. 非法条件（仅日期+语言区）不导出并提示至少填写一项
 * 3. 日期缺失不导出并提示请选择开始日期
 *
 * 运行：node gift-send-detail-export.test.ts [--evidence-dir=...]
 */
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminReportBase, SENDER_ID } from './lib/admin-report.ts';

class ExportTest extends AdminReportBase {
  constructor() {
    super('gift-send-detail-export');
    this.total = 5;
  }

  protected async run(): Promise<void> {
    await this.ensureSession();
    await this.openReport();
    await this.shot('page-loaded');

    // 1. 合法导出
    await this.setDate('开始日期', '2026-11-02');
    await this.setDate('结束日期', '2026-11-03');
    await this.setText('送礼用户ID', SENDER_ID);
    const downloadPromise = this.page!.waitForEvent('download', { timeout: 60000 });
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const download = await downloadPromise;
    const file = await download.path();
    const suggested = download.suggestedFilename();
    await this.page!.waitForTimeout(1000);
    await this.shot('export-valid');

    await this.check('合法条件导出：触发下载且文件名为 xlsx', async (): Promise<CheckResult> => {
      return {
        expect: '下载文件名以 .xlsx 结尾且包含「礼物赠送明细查询」',
        real: suggested,
        pass: suggested.endsWith('.xlsx') && suggested.includes('礼物赠送明细查询'),
      };
    });

    await this.check('合法条件导出：下载请求携带正确的日期与送礼用户条件', async (): Promise<CheckResult> => {
      const call = this.downloadCalls().at(-1);
      const payload = JSON.parse(call?.requestBody ?? '{}');
      const expect = { start_dt: '2026-11-02', end_dt: '2026-11-03', sender_id: SENDER_ID };
      return {
        expect: JSON.stringify(expect),
        real: JSON.stringify(payload.conditions ?? {}),
        pass: JSON.stringify(payload.conditions ?? {}) === JSON.stringify(expect) && call?.status === 200,
      };
    });

    await this.check('合法条件导出：xlsx 表头 18 列，首行送礼用户ID 正确', async (): Promise<CheckResult> => {
      if (!file) throw new Error('下载文件路径为空');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(readFileSync(file));
      const sheet = workbook.worksheets[0];
      const headers: string[] = [];
      sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value ?? '').trim()));
      const row: string[] = [];
      sheet.getRow(2).eachCell((cell) => row.push(String(cell.value ?? '').trim()));
      const expectHeaders = this.expectHeaders();
      return {
        expect: `${expectHeaders} / 首行送礼用户id=${SENDER_ID}`,
        real: `${headers.join('|')} / ${row.slice(0, 3).join(',')}`,
        pass: headers.join('|') === expectHeaders && row[0] === SENDER_ID && row.length > 0,
      };
    });

    // 2. 非法：仅日期+语言区
    await this.clickReset();
    await this.setDate('开始日期', '2026-11-02');
    await this.setDate('结束日期', '2026-11-03');
    await this.setLocale('韩国区');
    const downloadsBefore = this.downloadCalls().length;
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const anyOfMsg = await this.messageText();
    await this.shot('export-invalid-anyof');
    await this.check('仅日期+语言区导出：提示至少填写一项且不导出', async (): Promise<CheckResult> => {
      return {
        expect: '至少一项提示 / 新增下载请求=0',
        real: `${anyOfMsg} / 新增下载请求=${this.downloadCalls().length - downloadsBefore}`,
        pass: anyOfMsg.includes('送礼用户ID、接收用户ID、礼物ID 至少填写一项') && this.downloadCalls().length === downloadsBefore,
      };
    });
    await this.clearMessages();

    // 3. 非法：日期缺失
    await this.clickReset();
    await this.setText('送礼用户ID', SENDER_ID);
    const downloadsBefore2 = this.downloadCalls().length;
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const dateMsg = await this.messageText();
    await this.shot('export-invalid-date');
    await this.check('日期缺失导出：提示请选择开始日期且不导出', async (): Promise<CheckResult> => {
      return {
        expect: '请选择开始日期 / 新增下载请求=0',
        real: `${dateMsg} / 新增下载请求=${this.downloadCalls().length - downloadsBefore2}`,
        pass: dateMsg.includes('请选择开始日期') && this.downloadCalls().length === downloadsBefore2,
      };
    });

    await this.shot('export-done');
  }
}

await new ExportTest().execute();
