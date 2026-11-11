/**
 * 项目 3715 / TK-0219 补验：无权限账号菜单与路由隔离（TC-AUTH-02 / TC-AUTH-03）
 *
 * 用例来源：`/task/20261111/TK-0207/HANDOFF` 九列用例序号 2、3（2026-11-11 验收通过）
 * 技术方案：`/task/20261111/TK-0207/TECH_DESIGN`（SK-1 入口查看族 / §5 断言映射）
 * 覆盖：
 * - 序号2 TC-AUTH-02【P1】无权限账号展开「语音房相关数据」不出现「拍拍模式流水-房间维度」（①）
 * - 序号3 TC-AUTH-03【P1】无权限账号直达报表路由跳 404 且不展示报表（①②）
 *
 * 账号：TK-0212 创建的 qa-noauth-3715（非 admin，role 27，无 auction-mode-room-summary 权限）；
 *      凭证仅运行时通过 ADMIN_USERNAME / ADMIN_PASSWORD 注入，不写入代码、日志或证据。
 * 数据隔离：只读页面，不造写业务数据，无清理项。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-auth-unauth.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase, UI_BASE } from './lib/admin-base.ts';

const REPORT_HASH = '/data-stats-manager/auction-mode-room-summary';
const REPORT_MENU = '拍拍模式流水-房间维度';
const GROUP_MENU = '语音房相关数据';

class UnauthAuthTest extends AdminBase {
  constructor() {
    super('auction-room-summary-auth-unauth');
    this.total = 3;
  }

  /** 读取「语音房相关数据」分组下的叶子菜单项文本。 */
  private async groupMenuItems(): Promise<string[]> {
    const group = this.page!
      .locator('.el-submenu', { has: this.page!.locator('.el-submenu__title', { hasText: GROUP_MENU }) })
      .first();
    return (await group.locator('.el-menu-item').allInnerTexts()).map((text) => text.trim()).filter(Boolean);
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.page!.locator('.el-submenu__title').first().waitFor({ state: 'visible', timeout: 30000 });
    await this.shot('01-auth-login-dashboard');

    // ---------- 序号2 TC-AUTH-02 ----------
    await this.act('展开「数据统计管理 → 语音房相关数据」并读取分组菜单', async () => {
      await this.expandMenu('数据统计管理');
      await this.expandMenu(GROUP_MENU);
      await this.page!.locator('.el-menu-item').first().waitFor({ state: 'visible', timeout: 15000 });
    });
    const groupItems = await this.groupMenuItems();
    await this.shot('02-auth02-voice-room-menu');
    await this.check('用例#2-① 无权限账号「语音房相关数据」下不出现「拍拍模式流水-房间维度」', async (): Promise<CheckResult> => {
      const hits = groupItems.filter((text) => text.includes(REPORT_MENU));
      return {
        expect: `「${GROUP_MENU}」分组下不含「${REPORT_MENU}」`,
        real: `分组菜单项=${JSON.stringify(groupItems)}；命中「${REPORT_MENU}」=${hits.length} 项`,
        pass: hits.length === 0
      };
    });

    // ---------- 序号3 TC-AUTH-03 ----------
    await this.act('地址栏直达报表路由并等待落地页', async () => {
      await this.page!.goto(`${UI_BASE}/#${REPORT_HASH}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await this.page!.waitForFunction(() => location.hash.includes('/404'), undefined, { timeout: 15000 });
    });
    const hashAfter = await this.page!.evaluate(() => location.hash);
    const bodyText = (await this.page!.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    const tableCount = await this.page!.locator('.app-main .el-table').count();
    const queryFieldCount = await this.page!.locator('.app-main .query-field').count();
    const reportTitleCount = await this.page!.locator('.page-title', { hasText: '拍拍模式流水 - 房间维度' }).count();
    await this.shot('03-auth03-direct-route');
    await this.check('用例#3-① 无权限账号直达报表路由跳转 #/404', async (): Promise<CheckResult> => {
      return {
        expect: '落地路由包含 #/404',
        real: `实际 hash=${hashAfter}`,
        pass: hashAfter.includes('/404')
      };
    });
    await this.check('用例#3-② 直达路由不展示报表表格与查询区', async (): Promise<CheckResult> => {
      return {
        expect: '报表表格数=0 且查询区筛选项=0，不出现报表标题',
        real: `表格数=${tableCount}，查询筛选项=${queryFieldCount}，报表标题数=${reportTitleCount}，页面文案=${bodyText.slice(0, 160)}`,
        pass: tableCount === 0 && queryFieldCount === 0 && reportTitleCount === 0
      };
    });
  }
}

new UnauthAuthTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
