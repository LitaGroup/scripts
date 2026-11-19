/**
 * 项目 105 / WO-0035：Admin「游戏入口配置」分页（用例#13~#16）
 * 用例来源：TK-0409 HANDOFF v6 九列用例；技术方案：/task/20261119/TK-0409/TECH_DESIGN（v1.2）
 * 覆盖：#13 页码切换；#14 每页条数 50；#15 Go to 跳页；#16 末页边界
 * 数据隔离：仅只读分页操作，无造数；存量 1003 条只读。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-game-entry-config/tests/tc03-pagination.test.ts
 */
import { GameEntryBase } from './lib/game-entry-base.ts';

class PaginationCase extends GameEntryBase {
  constructor() { super('tc03-pagination'); this.total = 20; }

  private async enterPage(): Promise<void> {
    await this.newSession(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    await this.gotoPageDirect(this.page!);
  }

  private async lastPageNo(): Promise<string> {
    const nums = (await this.page!.locator('.el-pagination .el-pager li.number').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    return nums[nums.length - 1] ?? '';
  }

  protected async run(): Promise<void> {
    // ===== 用例#13 分页页码切换 =====
    await this.act('用例#13 步骤1 进入游戏入口配置页面（默认第 1 页）', async () => {
      await this.enterPage();
      await this.shot('case13-page1', true);
    });
    await this.act('用例#13 步骤2~3 点击分页页码 2 并查看页码高亮与列表', async () => {
      await this.clickPage(2);
      await this.shot('case13-page2', true);
    });
    await this.check('用例#13-① 页码「2」高亮显示（active）', async () => {
      const a = await this.activePage();
      return { expect: '2', real: a, pass: a === '2' };
    });
    await this.check('用例#13-② 列表刷新为第 2 页数据（20 行，首行 UID 与第 1 页首行不同）', async () => {
      const rows = await this.rows();
      const first = rows[0]?.[1] ?? '';
      return { expect: '20 行且首行 UID ≠ 22518445', real: `${rows.length} 行，首行 UID=${first}`, pass: rows.length === 20 && first !== '' && first !== '22518445' };
    });
    await this.check('用例#13-③ 分页 Total 保持 Total 1003 不变', async () => {
      const t = await this.totalText();
      return { expect: 'Total 1003', real: t, pass: t === 'Total 1003' };
    });

    // ===== 用例#14 每页条数切换 =====
    await this.act('用例#14 步骤1 进入游戏入口配置页面（默认 20/page 第 1 页）', async () => {
      await this.enterPage();
      await this.shot('case14-before', true);
    });
    await this.act('用例#14 步骤2~3 点击每页条数选择器并选择 50/page', async () => {
      await this.setPageSize(50);
      await this.shot('case14-50-per-page', true);
    });
    await this.check('用例#14-① 列表刷新显示 50 行', async () => {
      const n = await this.rowCount();
      return { expect: '50', real: String(n), pass: n === 50 };
    });
    await this.check('用例#14-② 当前页回到第 1 页（页码 1 高亮）', async () => {
      const a = await this.activePage();
      return { expect: '1', real: a, pass: a === '1' };
    });
    await this.check('用例#14-③ 分页 Total 不变', async () => {
      const t = await this.totalText();
      return { expect: 'Total 1003', real: t, pass: t === 'Total 1003' };
    });
    await this.check('用例#14-④ 分页页码按 50 行/页重算（总页数=21）', async () => {
      const last = await this.lastPageNo();
      return { expect: '21', real: last, pass: last === '21' };
    });

    // ===== 用例#15 Go to 跳页 =====
    await this.act('用例#15 步骤1 进入游戏入口配置页面（默认第 1 页）', async () => {
      await this.enterPage();
    });
    await this.act('用例#15 步骤2~4 在 Go to 输入 3 并回车后查看页码与列表', async () => {
      await this.goToPage(3);
      await this.shot('case15-page3', true);
    });
    await this.check('用例#15-① 当前页跳转为第 3 页且页码 3 高亮', async () => {
      const a = await this.activePage();
      return { expect: '3', real: a, pass: a === '3' };
    });
    await this.check('用例#15-② 列表显示第 3 页数据（20 行）', async () => {
      const n = await this.rowCount();
      return { expect: '20', real: String(n), pass: n === 20 };
    });

    // ===== 用例#16 末页边界 =====
    await this.act('用例#16 步骤1 进入游戏入口配置页面', async () => {
      await this.enterPage();
    });
    await this.act('用例#16 步骤2~4 在 Go to 输入末页 51 并回车后查看行数与下一页按钮', async () => {
      await this.goToPage(51);
      await this.shot('case16-last-page', true);
    });
    await this.check('用例#16-① 跳转到末页且页码 51 高亮', async () => {
      const a = await this.activePage();
      return { expect: '51', real: a, pass: a === '51' };
    });
    await this.check('用例#16-② 末页列表显示余数行数 3 行', async () => {
      const n = await this.rowCount();
      return { expect: '3', real: String(n), pass: n === 3 };
    });
    await this.check('用例#16-③ 下一页按钮为禁用状态或点击后仍停留末页', async () => {
      const next = this.page!.locator('.el-pagination .btn-next').first();
      const cls = (await next.getAttribute('class').catch(() => '')) ?? '';
      const disabled = /is-disabled/.test(cls) || (await next.isDisabled().catch(() => false));
      if (disabled) return { expect: '下一页禁用', real: `class=${cls}`, pass: true };
      await next.click().catch(() => undefined);
      await this.page!.waitForFunction((prev) => ((document.querySelector('.el-pagination li.number.active')?.textContent ?? '').trim() !== prev), '51', { timeout: 1500 }).catch(() => undefined);
      const a = await this.activePage();
      return { expect: '点击后仍停留末页 51', real: `class=${cls}; active=${a}`, pass: a === '51' };
    });
  }
}

await new PaginationCase().execute();
