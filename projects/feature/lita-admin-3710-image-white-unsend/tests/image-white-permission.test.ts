/**
 * 项目 3710 / TK-0136：用例 #17 无 user-image-white 权限访问 + NU-01 三接口权限拒绝
 * 用例来源：/task/20261109/TK-0135/HANDOFF #17；技术方案 §7 NU-01
 * 覆盖：#17-①/②/③；NU-01-①/②/③（非 UI 附录）
 * 数据隔离：仅使用专用无权限账号登录与只读/无效目标接口调用；不产生业务数据
 * 运行：NOPERM_USERNAME=… NOPERM_PASSWORD=*** node projects/feature/lita-admin-3710-image-white-unsend/tests/image-white-permission.test.ts
 */
import { AdminBase, WHITE_HASH, UI_BASE } from './lib/admin-base.ts';

const CASE_TOTAL = 6;

interface AccessCheck {
  status: number;
  body: string;
  json?: { status?: string | number; msg?: string };
}

class ImageWhitePermissionTest extends AdminBase {
  constructor() {
    super('lita-admin-3710-image-white-permission');
  }

  protected async run(): Promise<void> {
    this.total = CASE_TOTAL;
    const username = process.env.NOPERM_USERNAME;
    const password = process.env.NOPERM_PASSWORD;
    if (!username || !password) {
      throw new Error('缺少 NOPERM_USERNAME / NOPERM_PASSWORD（无 user-image-white 权限的专用账号，运行时注入）');
    }
    await this.act('登录无 user-image-white 权限的专用账号', async () => {
      await this.login(username, password);
    });

    // #17-① 用户管理下不显示用户发图片白名单菜单
    let menuItems: string[] = [];
    await this.act('用例#17 步骤：展开用户管理菜单', async () => {
      const submenu = this.p.locator('.sidebar-container .el-submenu__title').filter({ hasText: /^\s*用户管理\s*$/ }).first();
      await submenu.waitFor({ state: 'visible', timeout: 15000 });
      await submenu.click();
      await this.p.locator('.sidebar-container .el-menu-item').filter({ hasText: /用户工具/ }).first().waitFor({ state: 'visible', timeout: 10000 });
      menuItems = (await this.p.locator('.sidebar-container .el-menu-item').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
      await this.shot('case17-user-manager-menu');
    });
    const imageWhiteMenu = this.p.locator('.sidebar-container .el-menu-item').filter({ hasText: /用户发图片白名单/ });
    const imageWhiteMenuCount = await imageWhiteMenu.count();
    await this.check('用例#17-① 用户管理下不显示用户发图片白名单菜单', async () => ({
      expect: '0 个「用户发图片白名单」菜单项',
      real: `${imageWhiteMenuCount} 个；用户管理下=[${menuItems.filter((t) => t !== 'Dashboard').join(',')}]`,
      pass: imageWhiteMenuCount === 0 && menuItems.some((t) => t.includes('用户工具')),
    }));

    // #17-②/③ 直达路由
    await this.act('用例#17 步骤：新标签页直达目标路由', async () => {
      const page = await this.newPage();
      await page.goto(`${UI_BASE}/${WHITE_HASH}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction((target) => location.hash !== target, WHITE_HASH, { timeout: 8000 }).catch(() => undefined);
      await this.shot('case17-direct-url', page);
      const state = await page.evaluate(() => ({
        hash: location.hash,
        title: document.title,
        hasLocale: document.querySelectorAll('input[placeholder="Locale"]').length,
        hasId: document.querySelectorAll('input[placeholder="ID"]').length,
        hasNo: document.querySelectorAll('input[placeholder="NO"]').length,
        headers: Array.from(document.querySelectorAll('.app-container .el-table__header-wrapper th')).map((th) => (th.textContent ?? '').trim()).filter(Boolean),
        rows: document.querySelectorAll('.app-container .el-table__body-wrapper tbody tr.el-table__row').length,
        body: (document.querySelector('.app-main')?.textContent ?? '').slice(0, 200),
      }));
      (this as unknown as { directState: typeof state }).directState = state;
      await page.close();
    });
    const directState = (this as unknown as { directState?: { hash: string; title: string; hasLocale: number; hasId: number; hasNo: number; headers: string[]; rows: number; body: string } }).directState;
    await this.check('用例#17-② 直达后不显示页面标题及 Locale/ID/NO 筛选区', async () => ({
      expect: 'hash≠目标路由；Locale/ID/NO=0',
      real: `hash=${directState?.hash ?? '(missing)'},title=${directState?.title ?? ''},Locale=${directState?.hasLocale ?? -1},ID=${directState?.hasId ?? -1},NO=${directState?.hasNo ?? -1}`,
      pass: directState !== undefined && directState.hash !== WHITE_HASH && directState.hasLocale === 0 && directState.hasId === 0 && directState.hasNo === 0 && !directState.title.includes('用户发图片白名单'),
    }));
    await this.check('用例#17-③ 不展示白名单七列表格及任何白名单数据', async () => ({
      expect: '七列表头=0；数据行=0',
      real: `headers=[${directState?.headers.join('|') ?? ''}],rows=${directState?.rows ?? -1}`,
      pass: (directState?.headers.length ?? 1) === 0 && (directState?.rows ?? 1) === 0,
    }));

    // NU-01 三接口业务体拒绝
    const list = await this.apiCall('GET', '/api/userImageWhite/list?page=1&rows=10');
    const add = await this.apiCall('POST', '/api/userImageWhite/addList', { userIds: [999999999] });
    const del = await this.apiCall('POST', '/api/userImageWhite/delete', { userId: 999999999 });
    await this.check('NU-01-① 无权限时 list 返回 status=1,msg=无权限', async () => this.nuResult('list', list));
    await this.check('NU-01-② 无权限时 addList 返回 status=1,msg=无权限', async () => this.nuResult('addList', add));
    await this.check('NU-01-③ 无权限时 delete 返回 status=1,msg=无权限', async () => this.nuResult('delete', del));
  }

  private async apiCall(method: 'GET' | 'POST', path: string, data?: unknown): Promise<AccessCheck> {
    const res = method === 'GET'
      ? await this.context!.request.get(`https://funbit-mgr.test.cinta.team${path}`, { headers: { accessToken: this.token } })
      : await this.context!.request.post(`https://funbit-mgr.test.cinta.team${path}`, { headers: { accessToken: this.token, 'Content-Type': 'application/json' }, data });
    const body = await res.text();
    let json: AccessCheck['json'];
    try { json = JSON.parse(body) as AccessCheck['json']; } catch { json = undefined; }
    return { status: res.status(), body, json };
  }

  private nuResult(name: string, result: AccessCheck): { expect: string; real: string; pass: boolean } {
    const status = result.json?.status;
    const msg = result.json?.msg;
    return {
      expect: 'status=1, msg=无权限',
      real: `${name}: HTTP ${result.status}, status=${status}, msg=${msg}, body=${result.body.slice(0, 200)}`,
      pass: String(status) === '1' && msg === '无权限',
    };
  }
}

await new ImageWhitePermissionTest().execute();
