/**
 * 项目3721 / >=401用户数据报表：入口与页面框架
 * 用例来源：/task/20261119/TK-0339/HANDOFF（九列用例 v5）；技术方案：/task/20261119/TK-0339/TECH_DESIGN
 * 覆盖：#1 菜单入口；#2 页面框架与筛选默认状态；#3 独立报表入口
 * 数据隔离：只读存量；不造数、无清理；证据仅本机 evidence 目录（脱敏）。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3721-vip-401-plus-user-report/tests/tc01-entry.test.ts
 */
import { AdminBase, ROUTE_401, UI_BASE } from './lib/admin-base.ts';

class Tc01Entry extends AdminBase {
  constructor() {
    super('tc01-entry');
    this.total = 11;
  }

  protected async run(): Promise<void> {
    await this.act('qa-ai 登录 Admin', async () => {
      await this.login();
      await this.shot('login-dashboard', true);
    });

    // ===== 用例#1 =====
    await this.act('用例#1 展开菜单并进入 >=401用户数据 报表', async () => {
      await this.expandMenu('数据统计管理');
      await this.expandMenu('用户数据');
      const leaf = this.page!.locator('.el-menu-item', { hasText: '>=401用户数据' }).first();
      await leaf.waitFor({ state: 'visible', timeout: 30000 });
      await leaf.click();
      await this.waitReportReady();
    });
    await this.checkShot('用例#1-① 「用户数据」菜单下显示叶子菜单项「>=401用户数据」', async () => {
      const visible = await this.page!.locator('.el-menu-item', { hasText: '>=401用户数据' }).first().isVisible();
      return { expect: '叶子菜单项「>=401用户数据」可见', real: visible ? '可见' : '不可见', pass: visible };
    });
    await this.checkShot('用例#1-② 路由为 #/data-stats-manager/user-consumption/vip-401-plus-user-report', async () => {
      const url = this.page!.url();
      return { expect: ROUTE_401, real: url, pass: url.includes(ROUTE_401) };
    });
    await this.checkShot('用例#1-③ 浏览器标签标题为「>=401用户数据 - Lita Admin」', async () => {
      const title = await this.page!.title();
      return { expect: '>=401用户数据 - Lita Admin', real: title, pass: title === '>=401用户数据 - Lita Admin' };
    });

    // ===== 用例#2 =====
    await this.act('用例#2 重新进入页面并读取标题/提示区/筛选默认值/按钮', async () => {
      await this.navReport();
      await this.shot('case2-page-frame', true);
    });
    await this.checkShot('用例#2-① 页面标题「>=401用户数据」且面包屑层级正确', async () => {
      const title = await this.pageTitle();
      const crumb = await this.breadcrumb();
      const pass = title === '>=401用户数据'
        && crumb.includes('数据统计管理') && crumb.includes('用户数据') && crumb.includes('>=401用户数据');
      return { expect: '标题「>=401用户数据」；面包屑含 数据统计管理/用户数据/>=401用户数据', real: `标题「${title}」；面包屑「${crumb}」`, pass };
    });
    await this.checkShot('用例#2-② 提示区显示 Data Time 与 Metric Definitions 文案', async () => {
      const text = await this.bodyText();
      const pass = text.includes('Data Time: 数据截至昨日') && text.includes('Metric Definitions') && text.includes('【报表需求】>=401用户数据');
      return { expect: '含「Data Time: 数据截至昨日」与「Metric Definitions: 【报表需求】>=401用户数据」', real: text.slice(0, 300), pass };
    });
    await this.checkShot('用例#2-③ VIP等级下限/上限输入框默认为空', async () => {
      const start = await this.fieldValue('VIP等级下限');
      const end = await this.fieldValue('VIP等级上限');
      return { expect: '两个输入框均为空', real: `下限「${start}」 上限「${end}」`, pass: start === '' && end === '' };
    });
    await this.checkShot('用例#2-④ 最近活跃默认 360天、大区默认为空', async () => {
      const activity = await this.fieldValue('最近活跃');
      const region = await this.fieldValue('大区');
      return { expect: '最近活跃=360天；大区为空', real: `最近活跃「${activity}」；大区「${region}」`, pass: activity === '360天' && region === '' };
    });
    await this.checkShot('用例#2-⑤ 查询/重置/导出报表三个按钮均可见', async () => {
      const names = ['查询', '重置', '导出报表'];
      const states: string[] = [];
      for (const name of names) states.push(`${name}:${await this.page!.getByRole('button', { name, exact: true }).first().isVisible()}`);
      return { expect: '查询/重置/导出报表均可见', real: states.join('；'), pass: states.every((s) => s.endsWith('true')) };
    });

    // ===== 用例#3 =====
    await this.act('用例#3 记录 >=401用户数据 路由并通过菜单进入 VIP User information base', async () => {
      await this.navReport();
      const reportUrl = this.page!.url();
      const reportText = await this.bodyText();
      await this.expandMenu('用户crm系统');
      const vipBase = this.page!.locator('.el-menu-item', { hasText: 'VIP User information base' }).first();
      await vipBase.waitFor({ state: 'visible', timeout: 30000 });
      await vipBase.click();
      await this.page!.waitForFunction((prev) => location.href !== prev, reportUrl, { timeout: 30000 });
      await this.page!.locator('.app-main').waitFor({ state: 'visible', timeout: 30000 });
      await this.page!.waitForFunction(() => !document.querySelector('.el-loading-mask'), undefined, { timeout: 120000 }).catch(() => undefined);
      this.notes.push(`reportUrl=${reportUrl}`);
      this.notes.push(`vipBaseUrl=${this.page!.url()}`);
      this.notes.push(`reportText=${reportText.slice(0, 120)}`);
      await this.shot('case3-vip-user-information-base', true);
    });
    await this.checkShot('用例#3-① 「>=401用户数据」地址为独立报表路由', async () => {
      const reportUrl = this.notes.find((n) => n.startsWith('reportUrl='))?.slice('reportUrl='.length) ?? '';
      return { expect: ROUTE_401, real: reportUrl, pass: reportUrl.includes(ROUTE_401) };
    });
    await this.checkShot('用例#3-② 「VIP User information base」为另一路由的独立页面', async () => {
      const reportUrl = this.notes.find((n) => n.startsWith('reportUrl='))?.slice('reportUrl='.length) ?? '';
      const vipUrl = this.page!.url();
      const pass = vipUrl !== reportUrl && !vipUrl.includes('vip-401-plus-user-report');
      return { expect: '两页面路由不同且 VIP User information base 非本报表路由', real: `本报表「${reportUrl}」；VIP User information base「${vipUrl}」`, pass };
    });
    await this.checkShot('用例#3-③ 「VIP User information base」页面可正常打开（非 404）', async () => {
      const url = this.page!.url();
      const text = await this.bodyText();
      const not404 = !url.includes('#/404') && !text.includes('OOPS!');
      const hasContent = text.length > 50;
      return { expect: '非 404 且页面主体有内容', real: `url=${url}；正文长度=${text.length}；404=${!not404}`, pass: not404 && hasContent };
    });
  }
}

await new Tc01Entry().execute();
