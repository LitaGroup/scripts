/**
 * 项目3718 / Admin 直播PK场次数据：入口与权限（用例 #1~#3）
 * 用例来源：/task/20261111/TK-0209/HANDOFF（九列用例 18 条）；技术方案：/task/20261111/TK-0209/TECH_DESIGN（SK1、BD-02、BD-03）
 * 覆盖：#1 有权限菜单进入（8 检查点）；#2 受限账号菜单不可见（3）；#3 受限账号直达拦截（3）
 * 数据隔离：不造 PK 业务数据；仅按 BD-03 在权限管理页面创建临时受限角色/账号，运行结束用管理接口删除并复核。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc01-entry.test.ts
 */
import { AdminBase, mask } from './lib/admin-base.ts';

const TARGET_HASH = '#/data-stats-manager/live-data/live-pk-player-detail';

class EntryTest extends AdminBase {
  private roleName = '';
  private accountName = '';
  private accountPassword = '';
  private restrictedPage: import('playwright').Page | null = null;

  constructor() {
    super('live-pk-entry');
    this.total = 14;
    const ts = Date.now().toString().slice(-6);
    this.roleName = `qa-tk220r${ts}`;
    this.accountName = `qa-tk220a${ts}`;
    this.accountPassword = `Tk220!${Math.random().toString(36).slice(2, 10)}`;
  }

  protected async run(): Promise<void> {
    try {
      await this.runCase();
    } finally {
      await this.cleanupRestricted();
    }
  }

  private async runCase(): Promise<void> {
    await this.login();
    await this.act('用例#1 前置：经左侧菜单进入直播PK场次数据', async () => {
      await this.expandMenu('数据统计管理');
      await this.expandMenu('直播相关数据');
    });
    await this.page!.locator('.el-menu-item', { hasText: /^\s*直播PK场次数据\s*$/ }).first().waitFor({ state: 'visible', timeout: 15000 });
    const menuVisible = await this.visibleMenuItems('直播PK场次数据');
    await this.act('用例#1 步骤：点击菜单项「直播PK场次数据」', async () => {
      await this.clickMenuItem('直播PK场次数据');
      await this.page!.waitForFunction(() => location.hash.includes('live-pk-player-detail'), undefined, { timeout: 15000 });
      await this.waitApp();
    });

    await this.check('用例#1-① 「直播相关数据」子菜单中可见「直播PK场次数据」菜单项', async () => ({
      expect: '可见菜单项数=1',
      real: `可见菜单项数=${menuVisible}`,
      pass: menuVisible === 1
    }));
    await this.shot('用例#1-①');
    await this.check('用例#1-② 地址栏路由为 #/data-stats-manager/live-data/live-pk-player-detail', async () => {
      const hash = await this.page!.evaluate(() => location.hash);
      return { expect: TARGET_HASH, real: hash, pass: hash === TARGET_HASH };
    });
    await this.shot('用例#1-②');
    await this.check('用例#1-③ 页内标题显示「PK模式陪玩师明细」', async () => {
      const title = (await this.page!.locator('.app-main h1, .app-main h2, .app-main h3, .app-main .page-title').first().innerText().catch(() => '')).trim();
      return { expect: 'PK模式陪玩师明细', real: title, pass: title === 'PK模式陪玩师明细' };
    });
    await this.shot('用例#1-③');
    await this.check('用例#1-④ 筛选区显示 5 个筛选项', async () => {
      const count = await this.page!.locator('.query-field').count();
      return { expect: '5', real: String(count), pass: count === 5 };
    });
    await this.shot('用例#1-④');
    await this.check('用例#1-⑤ 筛选项标签依次为 开始日期*、结束日期*、大区、陪玩师ID、陪玩师NO', async () => {
      const labels = await this.page!.locator('.query-field .query-label').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
      const expect = ['开始日期*', '结束日期*', '大区', '陪玩师ID', '陪玩师NO'];
      return { expect: expect.join('|'), real: labels.join('|'), pass: JSON.stringify(labels) === JSON.stringify(expect) };
    });
    await this.shot('用例#1-⑤');
    await this.check('用例#1-⑥ 「查询」「重置」「导出报表」三个按钮可见', async () => {
      const result: string[] = [];
      for (const name of ['查询', '重置', '导出报表']) {
        result.push(`${name}=${await this.page!.getByRole('button', { name, exact: true }).first().isVisible().catch(() => false)}`);
      }
      return { expect: '查询=true|重置=true|导出报表=true', real: result.join('|'), pass: result.every((x) => x.endsWith('true')) };
    });
    await this.shot('用例#1-⑥');
    await this.check('用例#1-⑦ 表格区显示「请输入查询条件后查看数据」', async () => {
      const text = await this.emptyText();
      return { expect: '请输入查询条件后查看数据', real: text, pass: text === '请输入查询条件后查看数据' };
    });
    await this.shot('用例#1-⑦');
    await this.check('用例#1-⑧ 分页显示 Total 0', async () => {
      const total = await this.totalText();
      return { expect: 'Total 0', real: total, pass: total === 'Total 0' };
    });
    await this.shot('用例#1-⑧');

    // BD-03：页面级构造临时受限角色与账号（权限配置为任务唯一授权的写操作）
    await this.act('BD-03 前置：权限管理页面创建临时受限角色', async () => {
      await this.createRole(this.roleName);
    });
    await this.act('BD-03 前置：创建临时受限账号并绑定角色', async () => {
      await this.createAccount(this.accountName, this.accountPassword, this.roleName);
    });
    await this.act('BD-03 就绪确认：受限账号登录后可见兄弟报表、不可见目标菜单', async () => {
      this.restrictedPage = await this.loginAs(this.accountName, this.accountPassword);
      await this.waitApp(this.restrictedPage);
      await this.expandMenuOn(this.restrictedPage, '数据统计管理');
      await this.expandMenuOn(this.restrictedPage, '直播相关数据');
    });
    const p2 = this.restrictedPage;
    if (!p2) throw new Error('受限账号就绪失败，用例#2/#3 无法继续');

    await this.check('用例#2-① 「直播相关数据」子菜单中不显示「直播PK场次数据」菜单项', async () => {
      const count = await p2.locator('.el-menu-item:visible', { hasText: /^\s*直播PK场次数据\s*$/ }).count();
      return { expect: '可见菜单项数=0', real: `可见菜单项数=${count}`, pass: count === 0 };
    });
    await this.shotOn(p2, '用例#2-①');
    await this.check('用例#2-② 「单次开播时长」「周榜单数据」「直播间日数据」「直播间流水」菜单项可见', async () => {
      const names = ['单次开播时长', '周榜单数据', '直播间日数据', '直播间流水'];
      const seen: string[] = [];
      for (const name of names) {
        if (await p2.locator('.el-menu-item:visible', { hasText: new RegExp(`^\\s*${name}\\s*$`) }).count() > 0) seen.push(name);
      }
      return { expect: names.join('|'), real: seen.join('|'), pass: seen.length === 4 };
    });
    await this.shotOn(p2, '用例#2-②');
    await this.check('用例#2-③ 进入「单次开播时长」路由 #/data-stats-manager/live-data/single-live-duration', async () => {
      await p2.locator('.el-menu-item:visible', { hasText: /^\s*单次开播时长\s*$/ }).first().click();
      await p2.waitForFunction(() => location.hash.includes('single-live-duration'), undefined, { timeout: 15000 });
      await this.waitApp(p2);
      const hash = await p2.evaluate(() => location.hash);
      return { expect: '#/data-stats-manager/live-data/single-live-duration', real: hash, pass: hash === '#/data-stats-manager/live-data/single-live-duration' };
    });
    await this.shotOn(p2, '用例#2-③');

    await this.act('用例#3 步骤：受限账号地址栏直达目标报表路由', async () => {
      await p2.goto(`${new URL(this.page!.url()).origin}/#/data-stats-manager/live-data/live-pk-player-detail`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p2.waitForFunction(() => {
        const main = document.querySelector('.app-main');
        return !!main && (main.textContent ?? '').trim().length > 0;
      }, undefined, { timeout: 20000 });
    });
    const directHash = await p2.evaluate(() => location.hash);
    const directText = (await p2.locator('.app-main').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 120);
    this.notes.push(`用例#3 直接访问实际拦截形态：hash=${directHash}；页面文本=${directText}`);

    await this.check('用例#3-① 页面不渲染「PK模式陪玩师明细」报表内容（无筛选区/无数据表格）', async () => {
      const fields = await p2.locator('.query-field').count();
      return {
        expect: '筛选区 .query-field 数=0（拦截形态：无权限提示/404/跳转其他页）',
        real: `.query-field=${fields}；实际形态 hash=${directHash}，文本=${directText || '(空)'}`,
        pass: fields === 0
      };
    });
    await this.shotOn(p2, '用例#3-①');
    await this.check('用例#3-② 页面不显示任何报表数据行', async () => {
      const rows = await p2.locator('.el-table__body-wrapper tbody tr').count();
      return { expect: '数据行=0', real: `数据行=${rows}`, pass: rows === 0 };
    });
    await this.shotOn(p2, '用例#3-②');
    await this.act('用例#3 步骤：尝试展开左侧菜单观察「直播相关数据」子菜单', async () => {
      const menuLoaded = await p2.locator('.el-submenu__title').first().waitFor({ state: 'attached', timeout: 10000 }).then(() => true).catch(() => false);
      if (menuLoaded) {
        await this.expandMenuOn(p2, '数据统计管理');
        await this.expandMenuOn(p2, '直播相关数据');
      }
      this.notes.push(`用例#3 菜单渲染状态：${menuLoaded ? '已渲染并展开' : '直达后侧边菜单未渲染（页面停留加载/欢迎态）'}`);
    });
    await this.check('用例#3-③ 「直播相关数据」子菜单中不显示「直播PK场次数据」', async () => {
      const count = await p2.locator('.el-menu-item:visible', { hasText: /^\s*直播PK场次数据\s*$/ }).count();
      const menuRendered = await p2.locator('.el-submenu__title').count() > 0;
      return { expect: '可见菜单项数=0', real: `可见菜单项数=${count}；侧边菜单${menuRendered ? '已渲染' : '未渲染'}`, pass: count === 0 };
    });
    await this.shotOn(p2, '用例#3-③');
  }

  private async expandMenuOn(page: import('playwright').Page, title: string): Promise<void> {
    const node = page.locator('.el-submenu__title', { hasText: new RegExp(`^\\s*${title}\\s*$`) }).first();
    await node.waitFor({ state: 'attached', timeout: 30000 });
    const opened = await node.evaluate((el) => el.parentElement?.classList.contains('is-opened') ?? false).catch(() => false);
    if (!opened) {
      await node.scrollIntoViewIfNeeded();
      await node.click();
      await page.waitForFunction(
        (t) => {
          const el = [...document.querySelectorAll('.el-submenu__title')].find((x) => (x.textContent ?? '').trim() === t);
          return !!el && !!el.parentElement?.classList.contains('is-opened');
        },
        title,
        { timeout: 10000 }
      );
    }
  }

  private async createRole(role: string): Promise<void> {
    const page = this.page!;
    await this.openPermissionPage(page);
    await page.getByRole('button', { name: 'New Role' }).first().click();
    const dlg = page.locator('.el-dialog:visible').first();
    await dlg.waitFor({ state: 'visible', timeout: 10000 });
    await dlg.locator('input:visible').first().fill(role);
    await dlg.locator('textarea').first().fill('TK-0220 执行阶段临时受限角色（用后删除）');
    const node = dlg.locator('.el-tree-node__content', { hasText: '数据统计管理' }).first();
    await node.locator('.el-checkbox__input').click();
    await this.ensureTreeExpanded(dlg, node, '数据统计管理');
    let live = dlg.locator('.el-tree-node__content:visible', { hasText: '直播相关数据' }).first();
    if (!(await live.count())) {
      await this.ensureTreeExpanded(dlg, node, '数据统计管理');
      live = dlg.locator('.el-tree-node__content:visible', { hasText: '直播相关数据' }).first();
    }
    await this.ensureTreeExpanded(dlg, live, '直播相关数据');
    const pk = dlg.locator('.el-tree-node__content:visible', { hasText: '直播PK场次数据' }).first();
    await pk.waitFor({ state: 'visible', timeout: 10000 });
    const cls = (await pk.locator('.el-checkbox').getAttribute('class')) ?? '';
    if (cls.includes('is-checked')) {
      await pk.locator('.el-checkbox__input').click();
    }
    const save = page.waitForResponse((r) => r.url().includes('/addRole'), { timeout: 20000 }).catch(() => null);
    await dlg.getByRole('button', { name: /Confirm/i }).last().click();
    const resp = await save;
    if (!resp) throw new Error('创建临时角色未收到 addRole 响应');
    const body = await resp.text();
    if (resp.status() !== 200 || !/"status":"0"/.test(body)) throw new Error(`创建临时角色失败：HTTP ${resp.status()} ${mask(body).slice(0, 200)}`);
    const roles = await this.listAdmin('roles');
    if (!roles.some((r) => r.name === role)) throw new Error(`临时角色创建后就绪确认失败：${role}`);
  }

  private async openPermissionPage(page: import('playwright').Page): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.goto(`${new URL(page.url() || 'https://admin.test.lita.game').origin}/#/permission/role`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.waitApp(page);
      const ok = await page.waitForFunction(() => {
        const rows = document.querySelectorAll('.el-table__body-wrapper tbody tr').length;
        const box = [...document.querySelectorAll('.el-message-box')].some((b) => (b as HTMLElement).offsetWidth > 0);
        return rows > 0 || box;
      }, undefined, { timeout: 20000 }).then(() => true).catch(() => false);
      const boxVisible = await page.locator('.el-message-box:visible').count().catch(() => 0);
      if (boxVisible > 0) {
        const text = (await page.locator('.el-message-box:visible').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
        this.notes.push(`权限管理页面提示：${text.slice(0, 120)}；重试 ${attempt + 1}`);
        await page.locator('.el-message-box:visible').first().getByRole('button').last().click().catch(() => undefined);
        await page.waitForTimeout(1000);
        continue;
      }
      if (ok) return;
    }
    throw new Error('权限管理页面未加载出角色数据（两次尝试）');
  }

  private async ensureTreeExpanded(dlg: import('playwright').Locator, content: import('playwright').Locator, label: string): Promise<void> {
    if (!(await content.count())) return;
    const icon = content.locator('.el-tree-node__expand-icon').first();
    if (!(await icon.count())) return;
    const cls = (await icon.getAttribute('class')) ?? '';
    if (!cls.includes('expanded')) {
      await icon.click();
      await this.page!.waitForFunction(
        (t) => {
          const d = [...document.querySelectorAll('.el-dialog')].find((x) => (x as HTMLElement).offsetWidth > 0);
          const nodes = [...(d?.querySelectorAll('.el-tree-node__content') ?? [])];
          const n = nodes.find((x) => (x.textContent ?? '').trim() === t);
          return !!n && !!(n as HTMLElement).offsetWidth;
        },
        label,
        { timeout: 10000 }
      ).catch(() => undefined);
    }
  }

  private async createAccount(account: string, password: string, role: string): Promise<void> {
    const page = this.page!;
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.waitApp(page);
    await page.waitForFunction(() => document.querySelectorAll('.el-table__body-wrapper tbody tr').length > 0, undefined, { timeout: 20000 });
    const btn = page.getByRole('button', { name: 'New Account' }).first();
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    const dlg = page.locator('.el-dialog:visible').first();
    await dlg.waitFor({ state: 'visible', timeout: 10000 });
    await dlg.locator('input[placeholder="Account"]').fill(account);
    await dlg.locator('input[placeholder="Password"]').fill(password);
    let roleNode = dlg.locator('.el-tree-node__content', { hasText: role }).first();
    if (!(await roleNode.count())) {
      await dlg.getByRole('button', { name: /Cancel/i }).last().click().catch(() => undefined);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.waitApp(page);
      await page.waitForFunction(() => document.querySelectorAll('.el-table__body-wrapper tbody tr').length > 0, undefined, { timeout: 20000 });
      const btn2 = page.getByRole('button', { name: 'New Account' }).first();
      await btn2.scrollIntoViewIfNeeded(); await btn2.click();
      const dlg2 = page.locator('.el-dialog:visible').first();
      await dlg2.locator('input[placeholder="Account"]').fill(account);
      await dlg2.locator('input[placeholder="Password"]').fill(password);
      roleNode = dlg2.locator('.el-tree-node__content', { hasText: role }).first();
      await roleNode.waitFor({ state: 'visible', timeout: 15000 });
      await roleNode.locator('.el-checkbox__input').click();
      const save2 = page.waitForResponse((r) => r.url().includes('/addAccount'), { timeout: 20000 }).catch(() => null);
      await dlg2.getByRole('button', { name: /Confirm/i }).last().click();
      const resp2 = await save2;
      if (!resp2) throw new Error('创建临时账号未收到 addAccount 响应');
      const body2 = await resp2.text();
      if (resp2.status() !== 200 || !/"status":"0"/.test(body2)) throw new Error(`创建临时账号失败：HTTP ${resp2.status()} ${mask(body2).slice(0, 200)}`);
      if (!(await this.listAdmin('accounts')).some((a) => a.account === account)) throw new Error(`临时账号创建后就绪确认失败：${account}`);
      return;
    }
    await roleNode.locator('.el-checkbox__input').click();
    const save = page.waitForResponse((r) => r.url().includes('/addAccount'), { timeout: 20000 }).catch(() => null);
    await dlg.getByRole('button', { name: /Confirm/i }).last().click();
    const resp = await save;
    if (!resp) throw new Error('创建临时账号未收到 addAccount 响应');
    const body = await resp.text();
    if (resp.status() !== 200 || !/"status":"0"/.test(body)) throw new Error(`创建临时账号失败：HTTP ${resp.status()} ${mask(body).slice(0, 200)}`);
    await page.waitForResponse((r) => r.url().includes('/getAccounts'), { timeout: 10000 }).catch(() => null);
    const accounts = await this.listAdmin('accounts');
    if (!accounts.some((a) => a.account === account)) throw new Error(`临时账号创建后就绪确认失败：${account}`);
  }

  private async listAdmin(kind: 'roles' | 'accounts'): Promise<Array<{ key: string; name?: string; account?: string }>> {
    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.apiCall(`/api/admin/get${kind === 'roles' ? 'Roles' : 'Accounts'}`);
        const json = JSON.parse(res.text);
        if (res.status === 200 && json.status === '0') return json.data ?? [];
        lastError = `HTTP ${res.status} ${json.msg ?? ''}`;
      } catch (e) {
        lastError = (e as Error).message;
      }
      await this.page!.waitForTimeout(800);
    }
    throw new Error(`读取 ${kind} 失败：${lastError}`);
  }

  private async cleanupRestricted(): Promise<void> {
    try {
      if (this.restrictedPage) await this.closeExtraPage(this.restrictedPage);
      if (!this.page) return;
      const accounts = await this.listAdmin('accounts').catch(() => []);
      for (const a of accounts.filter((x) => x.account === this.accountName)) {
        await this.apiCall(`/api/admin/deleteAccount/${a.key}`, 'DELETE');
      }
      const roles = await this.listAdmin('roles').catch(() => []);
      for (const r of roles.filter((x) => x.name === this.roleName)) {
        await this.apiCall(`/api/admin/deleteRole/${r.key}`, 'DELETE');
      }
      const afterAccounts = await this.listAdmin('accounts').catch(() => []);
      const afterRoles = await this.listAdmin('roles').catch(() => []);
      this.notes.push(`权限清理：账号=${afterAccounts.some((a) => a.account === this.accountName) ? '残留' : '已删除'}；角色=${afterRoles.some((r) => r.name === this.roleName) ? '残留' : '已删除'}`);
    } catch (e) {
      this.notes.push(`权限清理异常：${(e as Error).message}`);
    }
  }
}

new EntryTest().execute();
