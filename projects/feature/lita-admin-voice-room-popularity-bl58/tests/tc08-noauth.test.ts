/**
 * 项目 BL-0058 / TK-0687：房间人气推荐设置 - 无权限族（用例 #36、#37，qa-noauth 专用）
 * 用例来源：TK-0686 HANDOFF 九列用例；技术方案：/task/20261125/TK-0686/TECH_DESIGN（§1.3 SK-7 无权限族）
 * 覆盖：#36 左侧菜单无目标菜单项；#37 直达目标路由跳 #/404 且无业务控件
 * 数据隔离：qa-noauth 为无权限专用账号，本文件不修改任何权限、不产生业务数据。
 * 运行：TMPDIR=./.tmp-playwright NOAUTH_USERNAME=qa-noauth NOAUTH_PASSWORD=*** node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc08-noauth.test.ts [--case=36]
 */
import { join } from 'node:path';
import { AdminBase, PAGE_URL, UI_BASE } from './lib/admin-base.ts';

class NoauthTest extends AdminBase {
  constructor() {
    super('tc08-noauth', { 36: 1, 37: 2 });
  }

  private stateFile = '';

  protected async run(): Promise<void> {
    await this.act('使用 qa-noauth 真实 UI 登录并保存会话', async () => {
      this.stateFile = join(this.stateDir, 'qa-noauth.json');
      await this.ensureLoginState(process.env.NOAUTH_USERNAME, process.env.NOAUTH_PASSWORD, this.stateFile);
    });
    try {
      if (this.wants(36)) await this.case36();
      if (this.wants(37)) await this.case37();
    } finally {
      await this.closeCasePage();
    }
  }

  private async expandAllMenus(page: import('playwright').Page): Promise<void> {
    const titles = page.locator('.el-submenu__title');
    const count = await titles.count();
    for (let i = 0; i < count; i++) {
      const title = titles.nth(i);
      const expanded = await title.evaluate((el) => el.parentElement?.classList.contains('is-opened') ?? false).catch(() => false);
      if (!expanded) await title.click().catch(() => undefined);
    }
    await page.waitForSelector('.el-menu-item', { timeout: 30000 });
  }

  // ---------------- #36 ----------------

  private async case36(): Promise<void> {
    const page = await this.newCasePage(this.stateFile, false);
    await this.act('用例#36 qa-noauth 登录后展开左侧全部菜单分组', async () => {
      await page.goto(`${UI_BASE}/#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForSelector('.el-menu-item, .el-submenu__title', { timeout: 60000 });
      await this.expandAllMenus(page);
    });
    await this.check('用例#36-① 左侧菜单中不存在「房间人气推荐设置」菜单项', async () => {
      const sidebarText = (await page.locator('.el-menu, .sidebar-container, .el-aside').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      const count = await page.locator('.el-menu-item:has-text("房间人气推荐设置")').count();
      const allItems = (await page.locator('.el-menu-item').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
      await this.shot('case36-noauth-menu');
      return { expect: '目标菜单项 count=0', real: `count=${count}；当前可见菜单项=${allItems.join('、') || '(无)'}；侧栏文本片段=「${sidebarText.slice(0, 200)}」`, pass: count === 0 && !sidebarText.includes('房间人气推荐设置') };
    });
    await this.closeCasePage();
  }

  // ---------------- #37 ----------------

  private async case37(): Promise<void> {
    const page = await this.newCasePage(this.stateFile, false);
    await this.act('用例#37 qa-noauth 直达目标路由', async () => {
      await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => location.hash.includes('/404') || location.hash.includes('/login'), undefined, { timeout: 30000 }).catch(() => undefined);
    });
    const url = page.url();
    const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    await this.check('用例#37-① URL 跳转为 #/404', async () => {
      await this.shot('case37-noauth-404');
      return { expect: 'URL 含 #/404', real: url, pass: url.includes('#/404') };
    });
    await this.check('用例#37-② 页面显示 404 提示且不显示房间人气推荐设置任何筛选框与操作按钮', async () => {
      const userFilter = await page.locator('input[placeholder="USER ID"]').count();
      const addBtn = await page.getByRole('button', { name: '新增人气房间' }).count();
      const has404 = /OOPS|404|not enter this page/i.test(body);
      return { expect: '显示 404 提示；USER ID 筛选=0；新增人气房间按钮=0', real: `404文案=${has404 ? '有' : '无'}；USER ID 筛选=${userFilter}；新增按钮=${addBtn}；正文片段=「${body.slice(0, 160)}」`, pass: has404 && userFilter === 0 && addBtn === 0 };
    });
    await this.closeCasePage();
  }
}

const test = new NoauthTest();
await test.execute();
