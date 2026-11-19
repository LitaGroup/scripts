/**
 * 项目3721 / >=401用户数据报表：排序与分页
 * 用例来源：/task/20261119/TK-0339/HANDOFF（九列用例 v5）；技术方案：/task/20261119/TK-0339/TECH_DESIGN
 * 覆盖：#21 默认排序；#22 表头不可排序；#23 默认 20/页；#24 每页条数选项；#25 切换 50/页；
 *       #26 翻页
 * 数据隔离：只读存量；不造数、无清理；证据仅本机 evidence 目录（脱敏）。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3721-vip-401-plus-user-report/tests/tc05-pagination.test.ts
 */
import { AdminBase } from './lib/admin-base.ts';

class Tc05Pagination extends AdminBase {
  constructor() {
    super('tc05-pagination');
    this.total = 16;
  }

  private findTie(rows: string[][]): { pair: string[][]; index: number } | null {
    for (let i = 0; i + 1 < rows.length; i++) {
      if (rows[i][4] === rows[i + 1][4] && rows[i][7] === rows[i + 1][7]) return { pair: [rows[i], rows[i + 1]], index: i };
    }
    return null;
  }

  protected async run(): Promise<void> {
    await this.act('qa-ai 登录并进入 >=401用户数据 报表', async () => {
      await this.login();
      await this.navReport();
      this.notes.push(`case21-query=${JSON.stringify(await this.clickQuery())}`);
      await this.shot('case21-default-query', true);
    });

    // ===== 用例#21 =====
    const rows21 = await this.tableRows();
    await this.checkShot('用例#21-① 第 5 列 VIP Level 自上而下为降序', async () => {
      const vips = rows21.map((row) => Number(row[4]));
      const bad: string[] = [];
      for (let i = 1; i < vips.length; i++) if (vips[i] > vips[i - 1]) bad.push(`${i}:${vips[i - 1]}→${vips[i]}`);
      return { expect: '非递增（降序）', real: bad.length ? `逆序位置 ${JSON.stringify(bad.slice(0, 5))}` : JSON.stringify(vips.slice(0, 10)), pass: bad.length === 0 };
    });
    await this.checkShot('用例#21-② VIP 相同的相邻行按 Last Login Date 降序', async () => {
      const bad: string[] = [];
      let pairs = 0;
      for (let i = 0; i + 1 < rows21.length; i++) {
        if (rows21[i][4] === rows21[i + 1][4]) {
          pairs++;
          if (rows21[i][7] < rows21[i + 1][7]) bad.push(`${i}:${rows21[i][7]}→${rows21[i + 1][7]}`);
        }
      }
      return { expect: '同 VIP 相邻行登录日期非递增', real: bad.length ? `逆序 ${JSON.stringify(bad.slice(0, 5))}` : `同 VIP 相邻对 ${pairs} 组均降序`, pass: bad.length === 0 };
    });
    await this.act('用例#21 查找第 5、8 列均相同的相邻行（无则在后续页/末页查找）', async () => {
      let tie = this.findTie(rows21);
      let page = 1;
      let scannedPages = 1;
      while (!tie && scannedPages < 6) {
        page = scannedPages + 1;
        await this.nextPage(page);
        scannedPages++;
        tie = this.findTie(await this.tableRows());
      }
      if (!tie) {
        const pagerTexts = (await this.page!.locator('.el-pager li').allInnerTexts()).map((t) => Number(t.trim())).filter((n) => Number.isInteger(n) && n > 0);
        const last = Math.max(...pagerTexts);
        if (last > scannedPages) {
          await this.page!.locator('.el-pager li', { hasText: new RegExp(`^${last}$`) }).first().click();
          await this.page!.waitForFunction((n) => (document.querySelector('.el-pager li.active')?.textContent ?? '').trim() === String(n), last, { timeout: 300000, polling: 300 });
          await this.waitIdle(300000);
          await this.waitTableSettled(300000);
          page = last;
          tie = this.findTie(await this.tableRows());
        }
      }
      this.notes.push(`case21-tie=${JSON.stringify({ page, tie })}`);
      await this.shot('case21-tie-scan', true);
    });
    const tie21 = JSON.parse(this.notes.find((n) => n.startsWith('case21-tie='))!.slice('case21-tie='.length)) as { page: number; tie: { pair: string[][]; index: number } | null };
    await this.checkShot('用例#21-③ 第 5、8 列均相同的相邻行按 User ID 升序', async () => {
      if (!tie21.tie) return { expect: '存在并列行时 User ID 升序', real: '已扫描首页至第 5 页及末页，未发现第 5/8 列均相同的相邻行', pass: true };
      const [a, b] = tie21.tie.pair;
      return { expect: `${a[0]} < ${b[0]}`, real: `${a[0]} vs ${b[0]}（第 ${tie21.page} 页）`, pass: Number(a[0]) < Number(b[0]) };
    });

    // ===== 用例#22 =====
    const rowsBefore22 = await this.tableRows();
    const total22 = await this.totalValue();
    const queryCount22 = this.queryResponses;
    await this.act('用例#22 依次点击第 1/5/8 列表头单元格', async () => {
      for (const index of [0, 4, 7]) {
        await this.page!.locator('.el-table__header-wrapper th').nth(index).click();
      }
    });
    const rowsAfter22 = await this.tableRows();
    const totalAfter22 = await this.totalValue();
    await this.checkShot('用例#22-① 表头无排序箭头/排序图标', async () => {
      const carets = await this.page!.locator('.el-table__header-wrapper .sort-caret').count();
      const wrappers = await this.page!.locator('.el-table__header-wrapper .caret-wrapper').count();
      const sortable = await this.page!.locator('.el-table__header-wrapper th.sortable').count();
      return { expect: '无排序箭头/图标', real: `sort-caret=${carets}、caret-wrapper=${wrappers}、sortable th=${sortable}`, pass: carets === 0 && wrappers === 0 && sortable === 0 };
    });
    await this.checkShot('用例#22-② 点击表头后行顺序与 Total 不变且不触发排序', async () => ({
      expect: '行顺序/Total 不变、无新查询',
      real: `数据一致=${JSON.stringify(rowsBefore22) === JSON.stringify(rowsAfter22)}；Total ${total22}→${totalAfter22}；新查询=${this.queryResponses - queryCount22}`,
      pass: JSON.stringify(rowsBefore22) === JSON.stringify(rowsAfter22) && total22 === totalAfter22 && this.queryResponses === queryCount22
    }));

    // ===== 用例#23 =====
    await this.act('用例#23 恢复默认查询并读取每页条数/行数/页码', async () => {
      await this.clickReset();
      await this.shot('case23-default-page-size', true);
    });
    const size23 = await this.pageSizeLabel();
    const rows23 = await this.tableRows();
    const pager23 = (await this.page!.locator('.el-pager li').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.checkShot('用例#23-① 每页条数选择器当前值为「20/page」', async () => ({
      expect: '20/page',
      real: size23,
      pass: size23 === '20/page'
    }));
    await this.checkShot('用例#23-② 当前页显示 20 行数据', async () => ({
      expect: '20 行',
      real: `${rows23.length} 行`,
      pass: rows23.length === 20
    }));
    await this.checkShot('用例#23-③ 页码组件展示多个页码', async () => ({
      expect: '页码数量 >1',
      real: JSON.stringify(pager23),
      pass: pager23.filter((t) => /^\d+$/.test(t)).length > 1
    }));

    // ===== 用例#24 =====
    await this.act('用例#24 展开每页条数选择器读取选项', async () => {
      this.notes.push(`case24-options=${JSON.stringify(await this.openPageSizeOptions())}`);
      await this.shot('case24-page-size-options', true);
    });
    const options24 = JSON.parse(this.notes.find((n) => n.startsWith('case24-options='))!.slice('case24-options='.length)) as string[];
    await this.checkShot('用例#24-① 选项列表为「20/page」「50/page」「100/page」三项', async () => ({
      expect: JSON.stringify(['20/page', '50/page', '100/page']),
      real: JSON.stringify(options24),
      pass: JSON.stringify(options24) === JSON.stringify(['20/page', '50/page', '100/page'])
    }));
    await this.checkShot('用例#24-② 当前选中项为「20/page」', async () => ({
      expect: '20/page',
      real: await this.pageSizeLabel(),
      pass: (await this.pageSizeLabel()) === '20/page'
    }));

    // ===== 用例#25 =====
    await this.act('用例#25 翻至第 2 页后切换每页条数为 50', async () => {
      await this.clickReset();
      const totalBefore = await this.totalValue();
      await this.nextPage(2);
      await this.pageSize(50);
      await this.page!.waitForFunction(() => document.querySelectorAll('.el-table__body-wrapper tbody tr').length === 50, undefined, { timeout: 300000, polling: 300 });
      this.notes.push(`case25=${JSON.stringify({ totalBefore, totalAfter: await this.totalValue(), rows: (await this.tableRows()).length, active: await this.activePage() })}`);
      await this.shot('case25-50-per-page', true);
    });
    const case25 = JSON.parse(this.notes.find((n) => n.startsWith('case25='))!.slice('case25='.length)) as { totalBefore: number; totalAfter: number; rows: number; active: string };
    await this.checkShot('用例#25-① 切换后当前页显示 50 行数据', async () => ({
      expect: '50 行',
      real: `${case25.rows} 行`,
      pass: case25.rows === 50
    }));
    await this.checkShot('用例#25-② 页码高亮回到「1」', async () => ({
      expect: '1',
      real: case25.active,
      pass: case25.active === '1'
    }));
    await this.checkShot('用例#25-③ 分页 Total 与切换前一致', async () => ({
      expect: `${case25.totalBefore}`,
      real: `${case25.totalAfter}`,
      pass: case25.totalBefore === case25.totalAfter
    }));

    // ===== 用例#26 =====
    await this.act('用例#26 恢复默认 20/页并翻至第 2 页', async () => {
      await this.clickReset();
      await this.pageSize(20);
      const page1Ids = (await this.tableRows()).map((row) => row[0]);
      const totalBefore = await this.totalValue();
      await this.nextPage(2);
      const page2Ids = (await this.tableRows()).map((row) => row[0]);
      this.notes.push(`case26=${JSON.stringify({ page1Ids, page2Ids, totalBefore, totalAfter: await this.totalValue(), active: await this.activePage() })}`);
      await this.shot('case26-page2', true);
    });
    const case26 = JSON.parse(this.notes.find((n) => n.startsWith('case26='))!.slice('case26='.length)) as {
      page1Ids: string[]; page2Ids: string[]; totalBefore: number; totalAfter: number; active: string;
    };
    await this.checkShot('用例#26-① 页码组件高亮显示「2」', async () => ({
      expect: '2',
      real: case26.active,
      pass: case26.active === '2'
    }));
    await this.checkShot('用例#26-② 第 2 页 User ID 与第 1 页无重复', async () => {
      const overlap = case26.page2Ids.filter((id) => case26.page1Ids.includes(id));
      return { expect: '无重复', real: overlap.length ? `重复 ${JSON.stringify(overlap.slice(0, 5))}` : `第1页 ${case26.page1Ids.length} 个、第2页 ${case26.page2Ids.length} 个，无重复`, pass: overlap.length === 0 };
    });
    await this.checkShot('用例#26-③ 分页 Total 与第 1 页一致', async () => ({
      expect: `${case26.totalBefore}`,
      real: `${case26.totalAfter}`,
      pass: case26.totalBefore === case26.totalAfter
    }));
  }
}

await new Tc05Pagination().execute();
