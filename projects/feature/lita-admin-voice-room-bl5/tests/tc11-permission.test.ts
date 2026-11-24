/**
 * 项目 BL-0005 / TK-0443：权限基线（qa-noauth）
 * 用例来源：TK-0442 HANDOFF 九列用例 #65/#66/#67；技术方案：TECH_DESIGN §5 断言映射、§6.7 账号标注
 * 覆盖：#65 左侧菜单不可见；#66 直达房间管理 URL 被拒；#67 直达房间推荐管理 URL 被拒
 * 数据隔离：仅使用无权限专用账号 qa-noauth 登录与访问，不为其或角色开启任何权限
 * 运行：ADMIN_NOAUTH_USERNAME=… ADMIN_NOAUTH_PASSWORD=*** node projects/feature/lita-admin-voice-room-bl5/tests/tc11-permission.test.ts
 */
import { VoiceRoomBase, MANAGER_HASH, RECOMMEND_HASH } from './lib/voice-room-base.ts';
import { UI_BASE } from './lib/admin-base.ts';
import { type Page } from 'playwright';

class PermissionTest extends VoiceRoomBase {
  constructor() { super('tc11-permission'); this.total = 12; }

  private async menuTextsOf(page: Page): Promise<string[]> {
    return (await page.locator('.el-menu-item, .el-submenu__title').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  private async directVisit(page: Page, hash: string): Promise<{ url: string; text: string; business: number; back: boolean }> {
    await page.goto(`${UI_BASE}/#${hash}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => location.hash.includes('/404'), undefined, { timeout: 30000 }).catch(() => undefined);
    const url = await page.evaluate(() => location.hash);
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    const business = await page.locator('input[placeholder="房间名称"], button:has-text("批量导出"), button:has-text("新建语音房")').count();
    const back = (await page.getByText('Back to home', { exact: false }).count()) > 0;
    return { url, text, business, back };
  }

  protected async run(): Promise<void> {
    let page!: Page;
    await this.act('以无权限账号 qa-noauth 登录（不开启任何权限）', async () => {
      page = await this.newSession(process.env.ADMIN_NOAUTH_USERNAME, process.env.ADMIN_NOAUTH_PASSWORD, 'ADMIN_NOAUTH_USERNAME');
      this.shared.menus = await this.menuTextsOf(page);
      await this.shotOn(page, 'case65-noauth-menus', true);
    });

    // ---------------- 用例#65 ----------------
    await this.check('用例#65-① 左侧菜单不存在「房间管理」', async () => {
      const menus = this.shared.menus as string[];
      const hit = menus.filter((m) => m.includes('房间管理'));
      return { expect: '无「房间管理」菜单', real: hit.length === 0 ? '无' : `存在：${hit.join('、')}`, pass: hit.length === 0 };
    });
    await this.check('用例#65-② 左侧菜单不存在「房间推荐管理」', async () => {
      const menus = this.shared.menus as string[];
      const hit = menus.filter((m) => m.includes('房间推荐管理'));
      return { expect: '无「房间推荐管理」菜单', real: hit.length === 0 ? '无' : `存在：${hit.join('、')}`, pass: hit.length === 0 };
    });
    await this.check('用例#65-③ 左侧菜单不存在「语音房管理」分组', async () => {
      const menus = this.shared.menus as string[];
      const hit = menus.filter((m) => m.includes('语音房管理'));
      return { expect: '无「语音房管理」分组', real: hit.length === 0 ? '无' : `存在：${hit.join('、')}`, pass: hit.length === 0 };
    });

    // ---------------- 用例#66 ----------------
    await this.act('用例#66 qa-noauth 直达房间管理 URL', async () => {
      this.shared.c66 = await this.directVisit(page, MANAGER_HASH);
      await this.shotOn(page, 'case66-404-manager', true);
    });
    await this.check('用例#66-① 页面地址变为 #/404', async () => {
      const info = this.shared.c66 as { url: string };
      return { expect: '#/404', real: info.url, pass: info.url.endsWith('#/404') };
    });
    await this.check('用例#66-② 页面显示 OOPS! 提示与 Back to home 按钮', async () => {
      const info = this.shared.c66 as { text: string; back: boolean };
      const ok = info.text.includes('OOPS!') && info.text.includes('The webmaster said that you can not enter this page') && info.back;
      return {
        expect: '含 OOPS! 与 The webmaster said that you can not enter this page... 及 Back to home 按钮',
        real: `含OOPS=${info.text.includes('OOPS!')}；含提示语=${info.text.includes('The webmaster said that you can not enter this page')}；Back to home=${info.back}`,
        pass: ok
      };
    });
    await this.check('用例#66-③ 页面不显示房间管理筛选区、列表与业务按钮', async () => {
      const info = this.shared.c66 as { business: number };
      return { expect: '业务控件数=0', real: `业务控件数=${info.business}`, pass: info.business === 0 };
    });

    // ---------------- 用例#67 ----------------
    await this.act('用例#67 qa-noauth 直达房间推荐管理 URL', async () => {
      this.shared.c67 = await this.directVisit(page, RECOMMEND_HASH);
      await this.shotOn(page, 'case67-404-recommend', true);
    });
    await this.check('用例#67-① 页面地址变为 #/404', async () => {
      const info = this.shared.c67 as { url: string };
      return { expect: '#/404', real: info.url, pass: info.url.endsWith('#/404') };
    });
    await this.check('用例#67-② 页面显示 OOPS! 提示与 Back to home 按钮', async () => {
      const info = this.shared.c67 as { text: string; back: boolean };
      const ok = info.text.includes('OOPS!') && info.text.includes('The webmaster said that you can not enter this page') && info.back;
      return {
        expect: '含 OOPS! 与 The webmaster said that you can not enter this page... 及 Back to home 按钮',
        real: `含OOPS=${info.text.includes('OOPS!')}；含提示语=${info.text.includes('The webmaster said that you can not enter this page')}；Back to home=${info.back}`,
        pass: ok
      };
    });
    await this.check('用例#67-③ 页面不显示推荐管理筛选区、列表与业务按钮', async () => {
      const info = this.shared.c67 as { business: number };
      return { expect: '业务控件数=0', real: `业务控件数=${info.business}`, pass: info.business === 0 };
    });

    await this.act('关闭 qa-noauth 会话', async () => {
      await this.closeContext(page);
    });
  }
}

await new PermissionTest().execute();
