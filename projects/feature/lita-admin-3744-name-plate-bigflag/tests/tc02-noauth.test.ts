/**
 * 项目 3744 / BL-0057：铭牌管理「是否是大铭牌」字段级独立权限 — 无页面权限族（#11/#12）。
 * 用例来源：TK-0764 HANDOFF v3；技术方案：/98-tasks/20261127/764/TECH_DESIGN（v2）§8 断言映射。
 * 覆盖：#11 qa-noauth 菜单不展示「特效管理/铭牌管理」；#12 qa-noauth 直达路由跳转 #/404 且不展示列表。
 * 数据隔离：qa-noauth 为零权限专用账号，本文件全程只登录/浏览，不对其账号或角色做任何权限变更。
 * 运行：TMPDIR=./.tmp-playwright NOAUTH_USERNAME=qa-noauth NOAUTH_PASSWORD=*** \
 *       node projects/feature/lita-admin-3744-name-plate-bigflag/tests/tc02-noauth.test.ts [--case=11]
 */
import { AdminBase, PAGE_URL, delay } from './lib/admin-base.ts';

const CP: Record<number, number> = { 11: 1, 12: 2 };

class NoAuthRunner extends AdminBase {
  constructor() {
    super('tk0768-noauth', CP);
  }

  protected async run(): Promise<void> {
    const user = process.env.NOAUTH_USERNAME;
    const pwd = process.env.NOAUTH_PASSWORD;
    if (!user || !pwd) throw new Error('缺少 NOAUTH_USERNAME/NOAUTH_PASSWORD 运行时环境变量');
    await this.ensureLoginState(user, pwd, this.noauthStateFile, 'qa-noauth');
    const page = await this.newCasePage(this.noauthStateFile, '#/dashboard', { waitTable: false });
    await this.waitMenuSettled(page);
    // 等待权限菜单异步加载稳定（条件轮询，不盲等）
    const started = Date.now();
    while (Date.now() - started < 3000) {
      const n = await page.locator('.el-menu-item, .el-submenu__title').count();
      if (n > 0) break;
      await delay(200);
    }

    if (this.wants(11)) {
      await this.check('用例#11-① 左侧菜单不展示「特效管理」分组及「铭牌管理」叶子项', async () => {
        const items = (await page.locator('.el-menu-item:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
        const groups = (await page.locator('.el-submenu__title:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
        const hasFx = groups.includes('特效管理') || items.includes('特效管理');
        const hasNp = items.includes('铭牌管理');
        return { expect: '无「特效管理」且无「铭牌管理」', real: `groups=${groups.join('|')};items=${items.join('|')}`, pass: !hasFx && !hasNp };
      });
      await this.shot('case11-noauth-menu', true, page);
    }

    if (this.wants(12)) {
      await this.check('用例#12-① qa-noauth 直达铭牌管理路由跳转 404 页', async () => {
        await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => location.hash.includes('/404'), undefined, { timeout: 20000 }).catch(() => undefined);
        const url = page.url();
        const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
        return { expect: 'URL 含 #/404 且展示 OOPS 无权访问提示', real: `url=${url};body=${body.slice(0, 120)}`, pass: url.includes('/404') && /OOPS|can not enter|无权/.test(body) };
      });
      await this.check('用例#12-② 404 页不展示铭牌管理列表任何数据', async () => {
        const tableCount = await page.locator('.el-table').count();
        const tableVisible = tableCount > 0 ? await page.locator('.el-table').first().isVisible().catch(() => false) : false;
        const headers = tableVisible ? await page.locator('.el-table__header-wrapper th').allInnerTexts().catch(() => []) : [];
        const hasNpHeader = headers.some((h) => h.includes('是否是大铭牌'));
        return { expect: '无列表且无「是否是大铭牌」表头', real: `tableCount=${tableCount};tableVisible=${tableVisible};headers=${headers.join('/')}`, pass: !tableVisible && !hasNpHeader };
      });
      await this.shot('case12-404', true, page);
    }
  }
}

const runner = new NoAuthRunner();
await runner.execute();
