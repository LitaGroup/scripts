/**
 * 项目 3730 / TK-0322 用例集：无权限隔离（用例 #13、#14、#15）
 * 用例来源：TK-0322 HANDOFF v5；技术方案：/task/20261117/TK-0322/TECH_DESIGN
 * 覆盖：#13 qa-noauth 菜单无系统控制/分桶分群/桶的清单（①~③）；#14 直达路由跳 404 且无数据泄露（①~③）；
 *       #15 直达被拒后无新增/搜索/删除等分桶操作入口（①~③）
 * 数据隔离：仅只读观察，无造数；账号 qa-noauth（无权限专用，任何情况下不为其开启权限）
 * 运行：NOAUTH_USERNAME=… NOAUTH_PASSWORD=… node projects/feature/lita-admin-3730-bucket-topic-sort/tests/tc07-noauth-permission.test.ts
 */
import { BUCKET_LIST_HASH, AdminBase } from './lib/admin-base.ts';

class BucketNoAuthCase extends AdminBase {
  constructor() {
    super('bucket-topic-sort-tc07');
  }

  protected async run(): Promise<void> {
    this.total = 9;

    await this.act('qa-noauth 真实登录 Admin', async () => {
      const user = process.env.NOAUTH_USERNAME ?? process.env.ADMIN_USERNAME ?? '';
      const pwd = process.env.NOAUTH_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '';
      await this.login(user, pwd);
    });

    const loginHash = await this.page!.evaluate(() => location.hash);
    const sidebarText = await this.sidebarText();
    const systemVisible = await this.submenuVisible('系统控制');
    const leafVisible = await this.menuItemVisible('桶的清单');

    await this.check('用例#13-① 登录成功进入 dashboard', async () => {
      await this.shot('case13-dashboard');
      return {
        expect: '登录后路由含 #/dashboard',
        real: loginHash,
        pass: loginHash.includes('#/dashboard')
      };
    });

    await this.check('用例#13-② 左侧菜单不显示「系统控制」一级分组', async () => {
      await this.shot('case13-menu');
      return {
        expect: '「系统控制」菜单不可见',
        real: `可见=${systemVisible}；菜单首部=${sidebarText.replace(/\s*\n\s*/g, ' | ').slice(0, 120)}`,
        pass: !systemVisible
      };
    });

    await this.check('用例#13-③ 菜单全文不包含「分桶分群」与「桶的清单」', async () => {
      return {
        expect: '菜单文本不含「分桶分群」「桶的清单」',
        real: `含分桶分群=${sidebarText.includes('分桶分群')}；含桶的清单=${sidebarText.includes('桶的清单')}；桶的清单菜单可见=${leafVisible}`,
        pass: !sidebarText.includes('分桶分群') && !sidebarText.includes('桶的清单') && !leafVisible
      };
    });

    await this.act('qa-noauth 在地址栏直达分桶列表路由', async () => {
      await this.gotoBucketListByUrl();
      await this.page!.waitForFunction(() => location.hash.includes('/404'), undefined, { timeout: 30000 });
    });

    const directHash = await this.page!.evaluate(() => location.hash);
    const body = await this.bodyText();
    const tableCount = await this.page!.locator('.el-table').count();
    const rowCount = await this.page!.locator('.el-table__body-wrapper tbody tr').count();
    const pageButtons = (await this.page!.locator('.app-main button').allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean);

    await this.check('用例#14-① 地址栏路由为 #/404', async () => {
      await this.shot('case14-404');
      return { expect: '#/404', real: directHash, pass: directHash.endsWith('#/404') };
    });

    await this.check('用例#14-② 页面显示 404 内容：OOPS! / The webmaster said… / Back to home', async () => {
      const backControl = this.page!.locator('text=Back to home').first();
      const backTag = (await backControl.count()) > 0 ? await backControl.evaluate((el) => el.tagName.toLowerCase()).catch(() => '') : '';
      await this.shot('case14-404-content');
      return {
        expect: '含 OOPS!、The webmaster said that you can not enter this page...、Back to home',
        real: `OOPS=${body.includes('OOPS!')}；webmaster 文案=${body.includes('The webmaster said that you can not enter this page')}；Back to home=${body.includes('Back to home')}（元素标签 ${backTag || '未找到'}）`,
        pass: body.includes('OOPS!') && body.includes('The webmaster said that you can not enter this page') && body.includes('Back to home')
      };
    });

    await this.check('用例#14-③ 页面不渲染分桶列表内容（无表头表格、无数据行）', async () => {
      return {
        expect: '无分桶表格与数据行',
        real: `el-table 数量=${tableCount}；数据行=${rowCount}；含 Topic 表头=${body.includes('Topic')}`,
        pass: tableCount === 0 && rowCount === 0 && !body.includes('规则数')
      };
    });

    await this.act('qa-noauth 再次直达分桶列表路由并观察操作入口', async () => {
      await this.gotoBucketListByUrl();
      await this.page!.waitForFunction(() => location.hash.includes('/404'), undefined, { timeout: 30000 });
    });

    await this.check('用例#15-① 页面无「新增 Topic」「Search」「Reset」按钮', async () => {
      const addBtn = await this.page!.getByRole('button', { name: '新增 Topic' }).count();
      const searchBtn = await this.page!.getByRole('button', { name: 'Search' }).count();
      const resetBtn = await this.page!.getByRole('button', { name: 'Reset' }).count();
      await this.shot('case15-no-buttons');
      return {
        expect: '新增 Topic / Search / Reset 按钮数量均为 0',
        real: `新增 Topic=${addBtn}；Search=${searchBtn}；Reset=${resetBtn}；页面按钮=${pageButtons.join(',') || '无'}`,
        pass: addBtn === 0 && searchBtn === 0 && resetBtn === 0
      };
    });

    await this.check('用例#15-② 无详情/删除等行操作按钮', async () => {
      const detailBtn = await this.page!.getByRole('button', { name: '详情' }).count();
      const deleteBtn = await this.page!.getByRole('button', { name: '删除' }).count();
      return {
        expect: '详情 / 删除 按钮数量均为 0',
        real: `详情=${detailBtn}；删除=${deleteBtn}`,
        pass: detailBtn === 0 && deleteBtn === 0
      };
    });

    await this.check('用例#15-③ 左侧菜单仍无「桶的清单」入口', async () => {
      const sidebar = await this.sidebarText();
      const visible = await this.menuItemVisible('桶的清单');
      return {
        expect: '左侧菜单无「桶的清单」入口',
        real: `404 页面左侧侧边栏存在=${sidebar.length > 0}；「桶的清单」菜单可见=${visible}；含文本=${sidebar.includes('桶的清单')}`,
        pass: !visible && !sidebar.includes('桶的清单')
      };
    });

    this.log(`目标路由：${BUCKET_LIST_HASH}`);
  }
}

await new BucketNoAuthCase().execute();
