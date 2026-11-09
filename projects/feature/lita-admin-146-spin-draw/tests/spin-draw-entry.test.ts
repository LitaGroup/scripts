/**
 * 项目 146 / 水果机数据查询：入口与初始空态（SK-01、SK-15）
 * 用例来源：TK-0112 HANDOFF（/task/20261109/TK-0112/HANDOFF）；技术方案：/task/20261109/TK-0112/TECH_DESIGN
 * 覆盖：#1、#2、#41、#42（共 18 个检查点）
 * 数据隔离：全程只读，不造数、不写库；每条用例使用独立页面上下文，初始空态用例使用独立浏览器会话
 * 运行：ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-entry.test.ts
 */
import { SpinDrawAdminBase, ROUTE_SUMMARY, ROUTE_DAILY, normalizeText } from './lib/admin-base.ts';

class SpinDrawEntryTest extends SpinDrawAdminBase {
  constructor() {
    super('spin-draw-entry');
    this.total = 18;
  }

  protected async run(): Promise<void> {
    await this.login();

    // ===== 用例#1 汇总页入口 =====
    await this.act('用例#1 从左侧菜单进入水果机数据-汇总页', async () => {
      await this.openByMenu('水果机数据-汇总', ROUTE_SUMMARY);
    });
    await this.uiCheck('用例#1-① 左侧「水果机数据-汇总」菜单呈选中态', 'case1-1-menu', async () => {
      const active = await this.activeMenu();
      return this.textCheck('水果机数据-汇总', active);
    });
    await this.uiCheck('用例#1-② 地址栏 hash 为汇总页路由', 'case1-2-url', async () => {
      const hash = await this.p.evaluate(() => location.hash);
      return this.textCheck(`#${ROUTE_SUMMARY}`, hash);
    });
    await this.uiCheck('用例#1-③ 面包屑依次显示 Dashboard / 数据统计管理 / 用户数据 / 水果机数据-汇总', 'case1-3-breadcrumb', async () => {
      const crumb = await this.breadcrumb();
      return this.textCheck('Dashboard / 数据统计管理 / 用户数据 / 水果机数据-汇总', crumb);
    });
    await this.uiCheck('用例#1-④ 页面标题显示「水果机数据-汇总」', 'case1-4-title', async () => {
      const title = await this.pageTitle();
      return this.textCheck('水果机数据-汇总', title);
    });
    await this.uiCheck('用例#1-⑤ 查询区显示三项必填与查询/重置按钮', 'case1-5-query', async () => {
      const section = await this.querySection();
      return this.textCheck('开始日期=请选择开始日期;结束日期=请选择结束日期;用户ID=请输入用户ID|按钮:查询,重置', section);
    });

    // ===== 用例#2 按日页入口 =====
    await this.act('用例#2 从左侧菜单进入水果机数据-按日页', async () => {
      await this.openByMenu('水果机数据-按日', ROUTE_DAILY);
    });
    await this.uiCheck('用例#2-① 左侧「水果机数据-按日」菜单呈选中态', 'case2-1-menu', async () => {
      const active = await this.activeMenu();
      return this.textCheck('水果机数据-按日', active);
    });
    await this.uiCheck('用例#2-② 地址栏 hash 为按日页路由', 'case2-2-url', async () => {
      const hash = await this.p.evaluate(() => location.hash);
      return this.textCheck(`#${ROUTE_DAILY}`, hash);
    });
    await this.uiCheck('用例#2-③ 面包屑依次显示 Dashboard / 数据统计管理 / 用户数据 / 水果机数据-按日', 'case2-3-breadcrumb', async () => {
      const crumb = await this.breadcrumb();
      return this.textCheck('Dashboard / 数据统计管理 / 用户数据 / 水果机数据-按日', crumb);
    });
    await this.uiCheck('用例#2-④ 页面标题显示「水果机数据-按日」', 'case2-4-title', async () => {
      const title = await this.pageTitle();
      return this.textCheck('水果机数据-按日', title);
    });
    await this.uiCheck('用例#2-⑤ 查询区显示三项必填与查询/重置按钮', 'case2-5-query', async () => {
      const section = await this.querySection();
      return this.textCheck('开始日期=请选择开始日期;结束日期=请选择结束日期;用户ID=请输入用户ID|按钮:查询,重置', section);
    });

    // ===== 用例#41 汇总页初始空态（独立会话首次进入） =====
    const main = this.saveMainSession();
    const summarySession = await this.newSession();
    try {
      this.useSession(summarySession);
      await this.act('用例#41 首次进入水果机数据-汇总页且未执行查询', async () => {
        await this.openReport(ROUTE_SUMMARY);
      });
      await this.checkInitialEmptyState(41, '汇总');
    } finally {
      await summarySession.close();
      this.restoreMainSession(main);
    }

    // ===== 用例#42 按日页初始空态（独立会话首次进入） =====
    const dailySession = await this.newSession();
    try {
      this.useSession(dailySession);
      await this.act('用例#42 首次进入水果机数据-按日页且未执行查询', async () => {
        await this.openReport(ROUTE_DAILY);
      });
      await this.checkInitialEmptyState(42, '按日');
    } finally {
      await dailySession.close();
      this.restoreMainSession(main);
    }
  }

  private async checkInitialEmptyState(caseNo: number, pageName: string): Promise<void> {
    await this.uiCheck(`用例#${caseNo}-① 三个查询输入框均为空`, `case${caseNo}-1-inputs`, async () => {
      const values = await this.fieldValues();
      return this.textCheck('start=|end=|uid=', `start=${values.start}|end=${values.end}|uid=${values.uid}`);
    });
    await this.uiCheck(`用例#${caseNo}-② 结果区显示「请输入查询条件后查看数据」`, `case${caseNo}-2-empty`, async () => {
      const empty = await this.emptyText();
      return this.textCheck('请输入查询条件后查看数据', empty);
    });
    await this.uiCheck(`用例#${caseNo}-③ 分页显示 Total 0 且结果表无数据行`, `case${caseNo}-3-rows`, async () => {
      const rows = await this.rowCount();
      const total = await this.totalCount();
      return this.textCheck('0 行|Total 0', `${rows} 行|Total ${total}`);
    });
    await this.uiCheck(`用例#${caseNo}-④ 上一页与下一页按钮均为禁用态`, `case${caseNo}-4-pager`, async () => {
      const pager = await this.pager();
      return this.textCheck(
        '上一页禁用=true|下一页禁用=true',
        `上一页禁用=${pager.prevDisabled}|下一页禁用=${pager.nextDisabled}`,
      );
    });
  }
}

await new SpinDrawEntryTest().execute();
