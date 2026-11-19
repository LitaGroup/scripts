/**
 * 项目3721 / >=401用户数据报表：无权限族（qa-noauth）
 * 用例来源：/task/20261119/TK-0339/HANDOFF（九列用例 v5）；技术方案：/task/20261119/TK-0339/TECH_DESIGN
 * 覆盖：#30 无本报表菜单；#31 直达 URL 被拒（#/404）且无查询/导出入口
 * 红线：任何情况下不为 qa-noauth 或其角色开启本需求权限；如发现已有权限即基线污染并上报。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3721-vip-401-plus-user-report/tests/tc08-noauth.test.ts
 */
import { AdminBase, ROUTE_401, UI_BASE } from './lib/admin-base.ts';

class Tc08Noauth extends AdminBase {
  constructor() {
    super('tc08-noauth');
    this.total = 5;
  }

  protected async run(): Promise<void> {
    await this.act('qa-noauth 登录 Admin（不改变任何权限）', async () => {
      const user = process.env.ADMIN_NOAUTH_USERNAME ?? 'qa-noauth';
      const pwd = process.env.ADMIN_NOAUTH_PASSWORD ?? process.env.ADMIN_PASSWORD;
      await this.login(user, pwd);
      await this.shot('noauth-dashboard', true);
    });

    // ===== 用例#30 =====
    await this.act('用例#30 记录 qa-noauth 可见菜单并展开全部分组查找本报表菜单', async () => {
      await this.expandAllMenus();
      this.notes.push(`noauth-menu=${JSON.stringify(await this.menuAllTexts())}`);
      await this.shot('case30-noauth-menu', true);
    });
    const menuTexts = JSON.parse(this.notes.find((n) => n.startsWith('noauth-menu='))!.slice('noauth-menu='.length)) as string[];
    await this.checkShot('用例#30-① 左侧菜单（含全部已展开分组）中不存在「>=401用户数据」菜单项', async () => {
      const hits = menuTexts.filter((text) => text.includes('>=401用户数据'));
      return { expect: '菜单中无「>=401用户数据」', real: hits.length ? `命中 ${JSON.stringify(hits)}` : `已检查 ${menuTexts.length} 个菜单项/分组，无命中`, pass: hits.length === 0 };
    });
    await this.checkShot('用例#30-② 如实记录 qa-noauth 实际可见菜单基线', async () => ({
      expect: '记录可见菜单（非空）',
      real: JSON.stringify(menuTexts),
      pass: menuTexts.length > 0
    }));

    // ===== 用例#31 =====
    await this.act('用例#31 qa-noauth 直达 >=401用户数据 报表 URL', async () => {
      await this.page!.goto(`${UI_BASE}/${ROUTE_401}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page!.waitForFunction(() => location.hash.includes('/404'), { timeout: 20000 }).catch(() => undefined);
      await this.page!.waitForFunction(() => (document.body?.innerText ?? '').includes('Back to home'), { timeout: 20000 }).catch(() => undefined);
      this.notes.push(`noauth-url=${this.page!.url()}`);
      this.notes.push(`noauth-body=${JSON.stringify((await this.page!.locator('body').innerText()).slice(0, 500))}`);
      await this.shot('case31-noauth-404', true);
    });
    const noauthUrl = this.notes.find((n) => n.startsWith('noauth-url='))!.slice('noauth-url='.length);
    const noauthBody = JSON.parse(this.notes.find((n) => n.startsWith('noauth-body='))!.slice('noauth-body='.length)) as string;
    await this.checkShot('用例#31-① 页面跳转至 404，地址为 #/404', async () => ({
      expect: '地址包含 #/404',
      real: noauthUrl,
      pass: noauthUrl.includes('#/404')
    }));
    await this.checkShot('用例#31-② 页面显示 404 无法访问提示（含 OOPS! 与 Back to home）', async () => ({
      expect: '含「OOPS!」与「Back to home」',
      real: noauthBody,
      pass: noauthBody.includes('OOPS!') && noauthBody.includes('Back to home')
    }));
    await this.checkShot('用例#31-③ 页面无查询/重置/导出报表按钮与报表筛选区/数据展示', async () => {
      const buttons: string[] = [];
      for (const name of ['查询', '重置', '导出报表']) {
        if (await this.page!.getByRole('button', { name, exact: true }).count()) buttons.push(name);
      }
      const filterCard = await this.page!.locator('.filter-card').count();
      const table = await this.page!.locator('.el-table').count();
      return { expect: '无查询/重置/导出报表按钮、无筛选区与数据表', real: `按钮=${JSON.stringify(buttons)}、filter-card=${filterCard}、el-table=${table}`, pass: buttons.length === 0 && filterCard === 0 && table === 0 };
    });
  }
}

await new Tc08Noauth().execute();
