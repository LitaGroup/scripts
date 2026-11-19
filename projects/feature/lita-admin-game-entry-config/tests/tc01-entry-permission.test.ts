/**
 * 项目 105 / WO-0035：Admin「游戏入口配置」入口与权限（用例#1~#3）
 * 用例来源：TK-0409 HANDOFF v6 九列用例；技术方案：/task/20261119/TK-0409/TECH_DESIGN（v1.2）
 * 覆盖：#1 有权限菜单导航进入；#2 无权限菜单不可见；#3 无权限直达 URL 被拒
 * 数据隔离：仅只读观察（菜单/路由/页面要素），无造数；#2/#3 使用 qa-noauth（任何情况下不为其开权限）
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… NOAUTH_USERNAME=… NOAUTH_PASSWORD=… node projects/feature/lita-admin-game-entry-config/tests/tc01-entry-permission.test.ts
 */
import { GameEntryBase } from './lib/game-entry-base.ts';

class EntryPermissionCase extends GameEntryBase {
  constructor() { super('tc01-entry-permission'); this.total = 17; }

  protected async run(): Promise<void> {
    // ===== 用例#1 有权限账号菜单导航进入 =====
    await this.act('用例#1 步骤1~2 qa-ai 真实登录 Admin', async () => {
      await this.newSession(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
      await this.shot('case1-after-login');
    });
    await this.act('用例#1 步骤3 点击左侧菜单「游戏配置」菜单组', async () => {
      const group = this.page!.locator('.el-submenu__title', { hasText: '游戏配置' }).first();
      await group.waitFor({ state: 'visible', timeout: 30000 });
      if (!(await group.evaluate((el) => !!el.parentElement?.classList.contains('is-opened')))) await group.click();
      await this.page!.waitForFunction(() => {
        const el = Array.from(document.querySelectorAll('.el-submenu__title')).find((n) => (n.textContent ?? '').includes('游戏配置'));
        return !!el && !!el.parentElement?.classList.contains('is-opened');
      }, undefined, { timeout: 15000 });
    });
    await this.act('用例#1 步骤4 点击「游戏入口配置」菜单项', async () => {
      await this.openViaMenu(this.page!);
      await this.shot('case1-page');
    });

    await this.check('用例#1-① 「游戏配置」组展开且显示「游戏入口配置」菜单项', async () => {
      const item = this.page!.locator('.el-menu-item', { hasText: '游戏入口配置' }).first();
      const visible = await item.isVisible().catch(() => false);
      const text = (await item.innerText().catch(() => '')).trim();
      await this.shotEl('.el-menu-item:has-text("游戏入口配置")', 'case1-menu-item');
      return { expect: '菜单项可见且文案=游戏入口配置', real: `visible=${visible}; text=${text}`, pass: visible && text.includes('游戏入口配置') };
    });
    await this.check('用例#1-② 页面打开且浏览器地址为 /#/diamond-admin/game-entry-config', async () => {
      const hash = await this.urlHash();
      return { expect: '#/diamond-admin/game-entry-config', real: hash, pass: hash.includes('#/diamond-admin/game-entry-config') };
    });
    await this.check('用例#1-③ 面包屑显示「游戏配置 / 游戏入口配置」', async () => {
      const crumbs = await this.breadcrumbs();
      await this.shotEl('.el-breadcrumb', 'case1-breadcrumb');
      return {
        expect: 'Dashboard / 游戏配置 / 游戏入口配置',
        real: crumbs.join(' / '),
        pass: crumbs.length >= 3 && crumbs[1].includes('游戏配置') && crumbs[2].includes('游戏入口配置')
      };
    });
    await this.check('用例#1-④ 页面显示筛选框、查询/重置/添加/删除/导出按钮、列表与分页', async () => {
      const uid = await this.page!.locator('input[placeholder="用户 UID"]').isVisible().catch(() => false);
      const dates = await this.page!.locator('.el-date-editor input').count();
      const names = ['查询', '重置', '添加用户', '删除选中', '删除筛选结果', '导出全部'];
      const buttons: Record<string, boolean> = {};
      for (const n of names) buttons[n] = await this.page!.getByRole('button', { name: n }).first().isVisible().catch(() => false);
      const table = await this.page!.locator('.el-table').first().isVisible().catch(() => false);
      const pager = await this.page!.locator('.el-pagination').first().isVisible().catch(() => false);
      await this.shot('case1-page-elements');
      const ok = uid && dates === 2 && names.every((n) => buttons[n]) && table && pager;
      return {
        expect: 'UID 输入框 + 2 个日期输入框 + 6 个按钮 + 列表 + 分页均可见',
        real: `uid=${uid}; dates=${dates}; buttons=${JSON.stringify(buttons)}; table=${table}; pagination=${pager}`,
        pass: ok
      };
    });

    // ===== 用例#2 无权限账号左侧菜单无入口 =====
    await this.act('用例#2 步骤1~2 qa-noauth 真实登录 Admin', async () => {
      await this.newSession(process.env.NOAUTH_USERNAME ?? 'qa-noauth', process.env.NOAUTH_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '');
    });
    await this.act('用例#2 步骤3~4 展开全部左侧菜单分组并查找目标菜单', async () => {
      const groups = this.page!.locator('.el-submenu__title');
      const n = await groups.count();
      for (let i = 0; i < n; i++) {
        const g = groups.nth(i);
        if (!(await g.isVisible().catch(() => false))) continue;
        const opened = await g.evaluate((el) => !!el.parentElement?.classList.contains('is-opened'));
        if (!opened) await g.click().catch(() => undefined);
      }
      await this.page!.waitForFunction(() => {
        const titles = Array.from(document.querySelectorAll('.el-submenu__title')).filter((el) => (el as HTMLElement).offsetParent !== null);
        const opened = titles.filter((el) => !!el.parentElement?.classList.contains('is-opened'));
        return titles.length === 0 || opened.length === titles.length;
      }, undefined, { timeout: 5000 }).catch(() => undefined);
      await this.shot('case2-noauth-menu', true);
    });
    await this.check('用例#2-① 登录成功进入 Dashboard', async () => {
      const hash = await this.urlHash();
      return { expect: 'url 含 #/dashboard', real: hash, pass: hash.includes('#/dashboard') };
    });
    await this.check('用例#2-② 左侧菜单无「游戏配置」分组', async () => {
      const text = await this.menuText();
      const hasGroup = await this.page!.locator('.el-submenu__title', { hasText: '游戏配置' }).count() > 0;
      return { expect: '无游戏配置分组', real: `submenuCount=${hasGroup}; menuText=${text.slice(0, 400)}`, pass: !hasGroup };
    });
    await this.check('用例#2-③ 左侧菜单不存在「游戏入口配置」菜单项', async () => {
      const count = await this.page!.locator('.el-menu-item', { hasText: '游戏入口配置' }).count();
      const text = await this.menuText();
      await this.shotEl('.sidebar-container', 'case2-sidebar');
      return { expect: '无游戏入口配置菜单项', real: `count=${count}; menuText=${text.slice(0, 400)}`, pass: count === 0 && !text.includes('游戏入口配置') };
    });

    // ===== 用例#3 无权限账号直达 URL 被拒 =====
    await this.act('用例#3 步骤1 使用 qa-noauth 登录并停留在系统内页面', async () => {
      await this.newSession(process.env.NOAUTH_USERNAME ?? 'qa-noauth', process.env.NOAUTH_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '');
    });
    await this.act('用例#3 步骤2~3 地址栏输入目标 URL 并等待加载完成', async () => {
      await this.gotoPageDirect(this.page!);
      await this.page!.waitForFunction(() => location.hash.includes('/404'), undefined, { timeout: 8000 }).catch(() => undefined);
      await this.shot('case3-direct-404', true);
    });
    await this.check('用例#3-① 页面不展示游戏入口配置筛选区、列表与操作按钮', async () => {
      const uid = await this.page!.locator('input[placeholder="用户 UID"]').count();
      const table = await this.page!.locator('.el-table').count();
      const add = await this.page!.getByRole('button', { name: '添加用户' }).count();
      return { expect: 'UID 输入框/列表/添加按钮数量均为 0', real: `uid=${uid}; table=${table}; add=${add}`, pass: uid === 0 && table === 0 && add === 0 };
    });
    await this.check('用例#3-② 显示 404 拒绝页且含 OOPS! 与 The webmaster said that you can not enter this page', async () => {
      const { body } = await this.is404Page();
      const ok = body.includes('OOPS!') && body.includes('The webmaster said that you can not enter this page');
      return { expect: '含 OOPS! 与 The webmaster said that you can not enter this page', real: body.slice(0, 500), pass: ok };
    });
    await this.check('用例#3-③ 浏览器地址变为 404 页路由', async () => {
      const { hash } = await this.is404Page();
      return { expect: 'url 含 /404', real: hash, pass: hash.includes('/404') };
    });
  }
}

await new EntryPermissionCase().execute();
