/**
 * 送礼详情页面加载与必填校验（UI）
 *
 * 覆盖：
 * 1. 页面标题、筛选项、按钮、初始空表与分页禁用、首次进入不自动查询
 * 2. 日期必填：开始/结束日期为空时提示且不发请求
 * 3. 三选一：仅日期+语言区 / 仅日期+房间ID 查询与导出均提示且不发请求
 * 4. 语言区枚举与重置入口可用
 *
 * 运行：node gift-send-detail-page-validation.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminReportBase, LOCALE_LABEL, SENDER_ID, ROOM_IDS } from './lib/admin-report.ts';

class PageValidationTest extends AdminReportBase {
  constructor() {
    super('gift-send-detail-page-validation');
    this.total = 12;
  }

  protected async run(): Promise<void> {
    await this.ensureSession();
    await this.openReport();
    await this.shot('page-loaded');

    await this.check('页面标题为「送礼详情」且路由正确', async (): Promise<CheckResult> => {
      const title = await this.page!.title();
      const hash = await this.page!.evaluate(() => location.hash);
      return {
        expect: '送礼详情 - Lita Admin / #/data-stats-manager/gift-send-detail',
        real: `${title} / ${hash}`,
        pass: title.includes('送礼详情') && hash.includes('/data-stats-manager/gift-send-detail'),
      };
    });

    await this.check('筛选项完整：开始日期*、结束日期*、送礼用户ID、接收用户ID、礼物ID、语言区、房间ID', async (): Promise<CheckResult> => {
      const labels = (await this.page!.locator('.query-field .query-label').allInnerTexts()).map((item) => item.trim());
      const expect = ['开始日期*', '结束日期*', '送礼用户ID', '接收用户ID', '礼物ID', '语言区', '房间ID'];
      return { expect: expect.join('|'), real: labels.join('|'), pass: labels.join('|') === expect.join('|') };
    });

    await this.check('操作按钮：查询、重置、导出报表', async (): Promise<CheckResult> => {
      const names = (await this.page!.getByRole('button').allInnerTexts()).map((item) => item.trim()).filter(Boolean);
      const expect = ['查询', '重置', '导出报表'];
      return { expect: expect.join('|'), real: names.join('|'), pass: expect.every((name) => names.includes(name)) };
    });

    await this.check('首次进入：表格为空、分页禁用、不自动查询', async (): Promise<CheckResult> => {
      const rows = await this.tableRowCount();
      const disabled = await this.paginationDisabled();
      const calls = this.queryCalls().length;
      return {
        expect: 'rows=0，分页禁用，query 请求=0',
        real: `rows=${rows}，分页禁用=${disabled}，query 请求=${calls}`,
        pass: rows === 0 && disabled && calls === 0,
      };
    });

    // 1) 日期为空
    await this.setText('送礼用户ID', SENDER_ID);
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    const dateEmptyMsg = await this.messageText();
    await this.shot('date-required');
    await this.check('日期为空：提示「请选择开始日期」且不发查询请求', async (): Promise<CheckResult> => {
      return {
        expect: '请选择开始日期 / query 请求=0',
        real: `${dateEmptyMsg} / query 请求=${this.queryCalls().length}`,
        pass: dateEmptyMsg.includes('请选择开始日期') && this.queryCalls().length === 0,
      };
    });
    await this.clearMessages();

    // 2) 仅开始日期
    await this.setDate('开始日期', '2026-11-02');
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    const endEmptyMsg = await this.messageText();
    await this.shot('end-date-required');
    await this.check('仅开始日期：提示「请选择结束日期」且不发查询请求', async (): Promise<CheckResult> => {
      return {
        expect: '请选择结束日期 / query 请求=0',
        real: `${endEmptyMsg} / query 请求=${this.queryCalls().length}`,
        pass: endEmptyMsg.includes('请选择结束日期') && this.queryCalls().length === 0,
      };
    });
    await this.clearMessages();

    // 3) 日期 + 语言区（三选一缺失）
    await this.setDate('结束日期', '2026-11-03');
    await this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '送礼用户ID' }) }).locator('input').first().fill('');
    await this.setLocale('韩国区');
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    const anyOfMsg = await this.messageText();
    await this.shot('anyof-locale-only');
    await this.check('仅日期+语言区：提示「送礼用户ID、接收用户ID、礼物ID 至少填写一项」且不发请求', async (): Promise<CheckResult> => {
      return {
        expect: '送礼用户ID、接收用户ID、礼物ID 至少填写一项 / query 请求=0',
        real: `${anyOfMsg} / query 请求=${this.queryCalls().length}`,
        pass: anyOfMsg.includes('送礼用户ID、接收用户ID、礼物ID 至少填写一项') && this.queryCalls().length === 0,
      };
    });

    // 4) 同一条件下导出：提示且不发下载请求
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const exportMsg = await this.messageText();
    await this.shot('anyof-locale-export');
    await this.check('仅日期+语言区导出：提示至少一项且不发下载请求', async (): Promise<CheckResult> => {
      return {
        expect: '至少一项提示 / download 请求=0',
        real: `${exportMsg} / download 请求=${this.downloadCalls().length}`,
        pass: exportMsg.includes('送礼用户ID、接收用户ID、礼物ID 至少填写一项') && this.downloadCalls().length === 0,
      };
    });
    await this.clearMessages();

    // 5) 重置后日期 + 房间ID
    await this.clickReset();
    await this.setDate('开始日期', '2026-11-02');
    await this.setDate('结束日期', '2026-11-03');
    await this.setRoomIds(ROOM_IDS.join('\n'));
    await this.page!.getByRole('button', { name: '查询', exact: true }).click();
    const roomMsg = await this.messageText();
    await this.shot('anyof-room-only');
    await this.check('仅日期+房间ID：提示至少一项且不发查询请求', async (): Promise<CheckResult> => {
      return {
        expect: '至少一项提示 / query 请求=0',
        real: `${roomMsg} / query 请求=${this.queryCalls().length}`,
        pass: roomMsg.includes('送礼用户ID、接收用户ID、礼物ID 至少填写一项') && this.queryCalls().length === 0,
      };
    });

    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const roomExportMsg = await this.messageText();
    await this.shot('anyof-room-export');
    await this.check('仅日期+房间ID导出：提示至少一项且不发下载请求', async (): Promise<CheckResult> => {
      return {
        expect: '至少一项提示 / download 请求=0',
        real: `${roomExportMsg} / download 请求=${this.downloadCalls().length}`,
        pass: roomExportMsg.includes('送礼用户ID、接收用户ID、礼物ID 至少填写一项') && this.downloadCalls().length === 0,
      };
    });
    await this.clearMessages();

    // 6) 语言区枚举
    await this.clickReset();
    await this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '语言区' }) }).locator('input').first().click();
    await this.page!.waitForTimeout(400);
    const options = await this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item').allInnerTexts();
    await this.shot('locale-options');
    await this.page!.keyboard.press('Escape');
    await this.check('语言区枚举：8 个语言区可选', async (): Promise<CheckResult> => {
      const expect = Object.keys(LOCALE_LABEL);
      return { expect: expect.join('|'), real: options.join('|'), pass: expect.every((name) => options.includes(name)) };
    });

    await this.check('重置入口可用且清空查询条件', async (): Promise<CheckResult> => {
      const values = await this.page!.locator('.query-field input, .query-field textarea').evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value).filter(Boolean));
      return { expect: '条件为空', real: JSON.stringify(values), pass: values.length === 0 };
    });

    await this.shot('page-validation-done');
  }
}

await new PageValidationTest().execute();
