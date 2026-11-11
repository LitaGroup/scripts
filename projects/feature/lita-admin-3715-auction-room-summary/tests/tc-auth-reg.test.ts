/**
 * 拍拍模式流水-房间维度：菜单权限与既有报表回归（UI）
 *
 * 覆盖用例：
 * - TC-AUTH-02 无权限账号不可见报表菜单（P1）
 * - TC-AUTH-03 无权限账号直达路由被拦截（P1）
 * - TC-REG-01 既有分组表头报表无回归（P1，陪玩师数据报表(New)）
 * - TC-REG-02 送礼详情报表无回归（P1）
 *
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-auth-reg.test.ts [--evidence-dir=...]
 *
 * 说明：TC-AUTH-01 及报表页 TC-UI、TC-FILTER、TC-EDGE 系列需要 auction-mode-room-summary 权限，
 * 当前测试账号不具备该权限（页面路由守卫跳 404），相关用例按阻塞处理，不在本脚本内伪造通过。
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const REPORT_HASH = '/data-stats-manager/auction-mode-room-summary';

class AuthRegressionTest extends AdminBase {
  constructor() {
    super('auction-room-summary-auth-reg');
    this.total = 6;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.shot('login-dashboard');

    // ---------- TC-AUTH-02 ----------
    await this.expandMenu('数据统计管理');
    await this.expandMenu('语音房相关数据');
    await this.shot('auth02-menu-expanded');
    const menus = await this.menuTexts();
    const reportMenu = menus.filter((t) => t.includes('拍拍模式流水'));
    await this.check('用例#TC-AUTH-02-① 无权限账号菜单树不出现「拍拍模式流水-房间维度」', async (): Promise<CheckResult> => {
      return {
        expect: '菜单项不含「拍拍模式流水-房间维度」',
        real: `菜单项总数=${menus.length}，含「拍拍模式流水」的项=${JSON.stringify(reportMenu)}`,
        pass: reportMenu.length === 0
      };
    });

    // ---------- TC-AUTH-03 ----------
    await this.nav(REPORT_HASH);
    await this.page!.waitForTimeout(1500);
    await this.shot('auth03-direct-route-404');
    const urlAfter = await this.page!.evaluate(() => location.hash);
    const bodyText = (await this.page!.locator('body').innerText()).replace(/\n+/g, ' ');
    const has404 = /OOPS|can not enter|404/i.test(bodyText);
    const isEmpty = bodyText.trim().length === 0;
    await this.check('用例#TC-AUTH-03-① 无权限账号直达路由跳 404 且不展示报表内容', async (): Promise<CheckResult> => {
      return {
        expect: '跳转 404，不展示报表内容（无 .el-table / 无查询条件区）',
        real: `hash=${urlAfter}，404 文案=${has404}，body 长度=${bodyText.length}，页面空=${isEmpty}，表格数=${await this.page!.locator('.el-table').count()}`,
        pass: urlAfter.includes('/404') && has404 && (await this.page!.locator('.el-table').count()) === 0
      };
    });

    // ---------- TC-REG-01 ----------
    await this.nav('/data-stats-manager/player-stats/player-data-report-new');
    await this.page!.waitForSelector('.query-field', { timeout: 30000 }).catch(() => undefined);
    await this.page!.waitForTimeout(1500);
    await this.setDate('开始日期', '2026-11-02');
    await this.setDate('结束日期', '2026-11-03');
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    await this.shot('reg01-player-data-report-new');
    const reg01Body = (await this.page!.locator('body').innerText()).replace(/\n+/g, ' ');
    const reg01NoFilter = reg01Body.includes('当前报表未配置查询条件');
    const reg01Groups = await this.page!.locator('.el-table__header-wrapper tr').allInnerTexts();
    const reg01HasGroupedHeader = reg01Groups.length >= 2;
    const reg01QueryFields = await this.page!.locator('.query-field').count();
    const reg01ConfigCall = this.calls.filter((c) => c.path.includes('config/get') && c.path.includes('player-daily-report')).pop();
    this.notes.push(`REG-01 config/get 摘要: ${reg01ConfigCall?.responseBody ?? '(未捕获)'}`);
    await this.check('用例#TC-REG-01-① 陪玩师数据报表(New) 两级分组表头正常展示', async (): Promise<CheckResult> => {
      return {
        expect: '两级分组表头（基础信息/活跃/曝光等）正常展示',
        real: `表头行数=${reg01Groups.length}，分组表头=${reg01HasGroupedHeader}，表头文本=${JSON.stringify(reg01Groups.slice(0, 3))}`,
        pass: reg01HasGroupedHeader
      };
    });
    await this.check('用例#TC-REG-01-② 陪玩师数据报表(New) 筛选项与数据正常', async (): Promise<CheckResult> => {
      return {
        expect: '筛选项可用、数据正常展示',
        real: `筛选项数量=${reg01QueryFields}，页面提示「当前报表未配置查询条件」=${reg01NoFilter}`,
        pass: reg01QueryFields > 0 && !reg01NoFilter
      };
    });

    // ---------- TC-REG-02 ----------
    await this.nav('/data-stats-manager/gift-send-detail');
    await this.page!.waitForSelector('.query-field', { timeout: 30000 }).catch(() => undefined);
    await this.page!.waitForTimeout(1500);
    await this.setDate('开始日期', '2026-11-02');
    await this.setDate('结束日期', '2026-11-03');
    await this.clickQuery();
    await this.page!.waitForTimeout(2500);
    await this.shot('reg02-gift-send-detail');
    const giftLabels = (await this.page!.locator('.query-field .query-label').allInnerTexts()).map((t) => t.trim());
    const expectLabels = ['开始日期*', '结束日期*', '送礼用户ID', '接收用户ID', '礼物ID', '语言区', '房间ID'];
    await this.check('用例#TC-REG-02-① 送礼详情筛选项完整正常', async (): Promise<CheckResult> => {
      return {
        expect: expectLabels.join('|'),
        real: giftLabels.join('|'),
        pass: expectLabels.every((label) => giftLabels.includes(label))
      };
    });
    const giftHeaders = await this.tableHeaders();
    await this.check('用例#TC-REG-02-② 送礼详情表头正常', async (): Promise<CheckResult> => {
      const keys = ['房间id', '语言区', '服务完成时间'];
      return {
        expect: `表头非空且包含 ${keys.join('/')}`,
        real: `表头数量=${giftHeaders.length}，文本=${JSON.stringify(giftHeaders.slice(0, 20))}`,
        pass: giftHeaders.length > 0 && keys.every((k) => giftHeaders.some((h) => h.toLowerCase().includes(k.toLowerCase())))
      };
    });
  }
}

new AuthRegressionTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
