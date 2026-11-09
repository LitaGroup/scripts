/**
 * 项目 146 / 水果机数据：重置、加载态与分页（SK-13、SK-14、SK-16）
 * 用例来源：TK-0112 HANDOFF（/task/20261109/TK-0112/HANDOFF）；技术方案：/task/20261109/TK-0112/TECH_DESIGN
 * 覆盖：#37、#38、#39、#40、#43、#44、#45（共 23 个检查点）
 * 数据隔离：全程只读，复用 BD-01/BD-03 现有样本；不造数、不写库
 * 运行：ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-reset-loading-pagination.test.ts
 */
import { SpinDrawAdminBase, ROUTE_SUMMARY, ROUTE_DAILY } from './lib/admin-base.ts';

class SpinDrawResetLoadingPaginationTest extends SpinDrawAdminBase {
  constructor() {
    super('spin-draw-reset-loading-pagination');
    // 37:4；38:4；39:3；40:3；43:3；44:3；45:3
    this.total = 4 + 4 + 3 + 3 + 3 + 3 + 3;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.case37();
    await this.case38();
    await this.case39();
    await this.case40();
    await this.case43();
    await this.case44();
    await this.case45();
  }

  private async prepareQuery(route: string, start: string, end: string, uid: string): Promise<void> {
    await this.openReport(route);
    if ((await this.fieldValues()).start !== '') await this.resetForm();
    await this.setDate('开始日期', start);
    await this.setDate('结束日期', end);
    await this.setUid(uid);
    await this.query();
    await this.waitListIdle();
  }

  private async checkReset(caseNo: number, route: string, pageName: string): Promise<void> {
    let toast = '';
    await this.act(`用例#${caseNo} 已有查询结果后点击重置（${pageName}）`, async () => {
      await this.prepareQuery(route, '2026-11-08', '2026-11-08', '17612704');
      await this.p.waitForSelector('.el-table__body-wrapper tbody tr', { timeout: 60000 });
      await this.clearToasts();
      await this.p.getByRole('button', { name: '重置', exact: true }).click();
      await this.p.waitForFunction(
        () => Array.from(document.querySelectorAll('.query-field input')).every((input) => (input as HTMLInputElement).value === ''),
        null,
        { timeout: 10000 },
      );
      toast = await this.lastToast(10000);
    });
    await this.uiCheck(`用例#${caseNo}-① 开始日期、结束日期、用户ID三个输入框均为空`, `case${caseNo}-1-inputs`, async () => {
      const values = await this.fieldValues();
      return this.textCheck('start=|end=|uid=', `start=${values.start}|end=${values.end}|uid=${values.uid}`);
    });
    await this.uiCheck(`用例#${caseNo}-② Toast 提示「已重置查询条件」`, `case${caseNo}-2-toast`, async () => {
      return this.textCheck('已重置查询条件', toast);
    });
    await this.uiCheck(`用例#${caseNo}-③ 原查询结果被清空且分页显示 Total 0`, `case${caseNo}-3-clear`, async () => {
      const rows = await this.rowCount();
      const total = await this.totalCount();
      return this.textCheck('0 行|Total 0', `${rows} 行|Total ${total}`);
    });
    await this.uiCheck(`用例#${caseNo}-④ 结果区显示「请输入查询条件后查看数据」`, `case${caseNo}-4-empty`, async () => {
      return this.textCheck('请输入查询条件后查看数据', await this.emptyText());
    });
  }

  private async case37(): Promise<void> {
    await this.checkReset(37, ROUTE_SUMMARY, '水果机数据-汇总');
  }

  private async case38(): Promise<void> {
    await this.checkReset(38, ROUTE_DAILY, '水果机数据-按日');
  }

  private async checkLoading(caseNo: number, route: string, pageName: string): Promise<void> {
    let maskAppeared = false;
    let maskGone = false;
    let rows: number = -1;
    let total: number = -1;
    let values: { start: string; end: string; uid: string } = { start: '', end: '', uid: '' };
    await this.act(`用例#${caseNo} ${pageName}慢报表查询观察加载遮罩`, async () => {
      await this.openReport(route);
      if ((await this.fieldValues()).start !== '') await this.resetForm();
      await this.setDate('开始日期', '2026-11-08');
      await this.setDate('结束日期', '2026-11-08');
      await this.setUid('17612704');
      const visiblePromise = this.p
        .waitForSelector('.app-main .el-loading-mask', { state: 'visible', timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      const responsePromise = this.p.waitForResponse(
        (item) => item.url().includes('/data-main/admin/stats/query') && item.request().method() === 'POST',
        { timeout: 120000 },
      );
      await this.clickQueryRaw();
      maskAppeared = await visiblePromise;
      await responsePromise;
      maskGone = await this.p
        .waitForSelector('.app-main .el-loading-mask', { state: 'hidden', timeout: 90000 })
        .then(() => true)
        .catch(() => false);
      await this.p.waitForSelector('.el-table__header-wrapper th', { timeout: 30000 });
      await this.waitListIdle(120000);
      rows = await this.rowCount();
      total = await this.totalCount();
      values = await this.fieldValues();
    });
    await this.uiCheck(`用例#${caseNo}-① 点击查询后结果区出现加载遮罩`, `case${caseNo}-1-mask-show`, async () => {
      return this.textCheck('加载遮罩出现=true', `加载遮罩出现=${maskAppeared}`);
    });
    await this.uiCheck(`用例#${caseNo}-② 加载结束后遮罩消失`, `case${caseNo}-2-mask-hide`, async () => {
      return this.textCheck('加载遮罩消失=true', `加载遮罩消失=${maskGone}`);
    });
    await this.uiCheck(`用例#${caseNo}-③ 遮罩消失后显示 1 行结果且查询条件保持`, `case${caseNo}-3-result`, async () => {
      const real = `${rows} 行|Total ${total}|${values.start}～${values.end}|UID=${values.uid}`;
      return this.textCheck(`1 行|Total 1|2026-11-08～2026-11-08|UID=17612704`, real);
    });
  }

  private async case39(): Promise<void> {
    await this.checkLoading(39, ROUTE_SUMMARY, '水果机数据-汇总');
  }

  private async case40(): Promise<void> {
    await this.checkLoading(40, ROUTE_DAILY, '水果机数据-按日');
  }

  private async case43(): Promise<void> {
    let page1Rows: string[][] = [];
    let page2Rows: string[][] = [];
    let page1Again: string[][] = [];
    let page1Pager = await this.pager();
    let page2Pager = await this.pager();
    let page1AgainPager = await this.pager();
    const main = this.saveMainSession();
    const session = await this.newSession();
    try {
      this.useSession(session);
      await this.act('用例#43 查询 25 条按日结果并翻页', async () => {
        await this.prepareQuery(ROUTE_DAILY, '2026-10-15', '2026-11-08', '15164495');
        await this.waitRows(20);
        page1Rows = await this.rows();
        page1Pager = await this.pager();
        await this.gotoNextPage();
        await this.waitRows(5);
        page2Rows = await this.rows();
        page2Pager = await this.pager();
        await this.gotoPrevPage();
        await this.waitRows(20);
        page1Again = await this.rows();
        page1AgainPager = await this.pager();
      });
    } finally {
      await session.close();
      this.restoreMainSession(main);
    }
    await this.uiCheck('用例#43-① 首次查询 Total 25，第 1 页 20 行且日期 2026-10-15～2026-11-03', 'case43-1-page1', async () => {
      const real = `${page1Pager.total} 条|${page1Rows.length} 行|${page1Rows[0]?.[0]}～${page1Rows[page1Rows.length - 1]?.[0]}|上一页禁用=${page1Pager.prevDisabled}|下一页禁用=${page1Pager.nextDisabled}`;
      return this.textCheck('25 条|20 行|2026-10-15～2026-11-03|上一页禁用=true|下一页禁用=false', real);
    });
    await this.uiCheck('用例#43-② 下一页第 2 页 5 行且日期 2026-11-04～2026-11-08', 'case43-2-page2', async () => {
      const real = `${page2Pager.total} 条|${page2Rows.length} 行|${page2Rows[0]?.[0]}～${page2Rows[page2Rows.length - 1]?.[0]}|页码=${page2Pager.active}|上一页禁用=${page2Pager.prevDisabled}|下一页禁用=${page2Pager.nextDisabled}`;
      return this.textCheck('25 条|5 行|2026-11-04～2026-11-08|页码=2|上一页禁用=false|下一页禁用=true', real);
    });
    await this.uiCheck('用例#43-③ 上一页回到第 1 页并重新显示 20 行', 'case43-3-back', async () => {
      const real = `${page1Again.length} 行|${page1Again[0]?.[0]}～${page1Again[page1Again.length - 1]?.[0]}|页码=${page1AgainPager.active}`;
      return this.textCheck('20 行|2026-10-15～2026-11-03|页码=1', real);
    });
  }

  private async case44(): Promise<void> {
    let state: { size: string; total: number; rows: string[][]; pager: Awaited<ReturnType<SpinDrawAdminBase['pager']>> } | null = null;
    const main = this.saveMainSession();
    const session = await this.newSession();
    try {
      this.useSession(session);
      await this.act('用例#44 查询 25 条结果并切换每页 10 条', async () => {
        await this.prepareQuery(ROUTE_DAILY, '2026-10-15', '2026-11-08', '15164495');
        await this.waitRows(20);
        await this.changePageSize('10/page');
        await this.waitRows(10);
        await this.p.waitForFunction(() => document.querySelectorAll('.el-pagination .el-pager li').length === 3, null, { timeout: 30000 });
        state = { size: (await this.pager()).size, total: await this.totalCount(), rows: await this.rows(), pager: await this.pager() };
      });
    } finally {
      await session.close();
      this.restoreMainSession(main);
    }
    await this.uiCheck('用例#44-① 分页大小显示 10/page 且 Total 25 不变', 'case44-1-size', async () => {
      return this.textCheck('10/page|Total 25', `${state?.size}|Total ${state?.total}`);
    });
    await this.uiCheck('用例#44-② 当前为第 1 页且显示 10 行，Date 从 2026-10-15 至 2026-10-24', 'case44-2-rows', async () => {
      const rows = state?.rows ?? [];
      return this.textCheck(
        '1|10 行|2026-10-15～2026-10-24',
        `${state?.pager.active}|${rows.length} 行|${rows[0]?.[0]}～${rows[rows.length - 1]?.[0]}`,
      );
    });
    await this.uiCheck('用例#44-③ 页码显示 1、2、3，页码 1 选中，上一页禁用、下一页可用', 'case44-3-pager', async () => {
      const pager = state?.pager;
      const real = `${pager?.pages.join(',')}|选中=${pager?.active}|上一页禁用=${pager?.prevDisabled}|下一页禁用=${pager?.nextDisabled}`;
      return this.textCheck('1,2,3|选中=1|上一页禁用=true|下一页禁用=false', real);
    });
  }

  private async case45(): Promise<void> {
    let rows: string[][] = [];
    let pager = await this.pager();
    const main = this.saveMainSession();
    const session = await this.newSession();
    try {
      this.useSession(session);
      await this.act('用例#45 查询 25 条结果并通过 Go to 跳转第 2 页', async () => {
        await this.prepareQuery(ROUTE_DAILY, '2026-10-15', '2026-11-08', '15164495');
        await this.waitRows(20);
        await this.jumpToPage(2);
        await this.waitRows(5);
        rows = await this.rows();
        pager = await this.pager();
      });
    } finally {
      await session.close();
      this.restoreMainSession(main);
    }
    await this.uiCheck('用例#45-① 页码 2 呈选中态', 'case45-1-active', async () => {
      return this.textCheck('2', pager.active);
    });
    await this.uiCheck('用例#45-② 第 2 页显示 5 行，Date 依次为 2026-11-04～2026-11-08', 'case45-2-rows', async () => {
      return this.textCheck(
        '2026-11-04,2026-11-05,2026-11-06,2026-11-07,2026-11-08',
        rows.map((row) => row[0]).join(','),
      );
    });
    await this.uiCheck('用例#45-③ Total 25 不变，上一页可用、下一页禁用', 'case45-3-pager', async () => {
      return this.textCheck(
        'Total 25|上一页禁用=false|下一页禁用=true',
        `Total ${pager.total}|上一页禁用=${pager.prevDisabled}|下一页禁用=${pager.nextDisabled}`,
      );
    });
  }
}

await new SpinDrawResetLoadingPaginationTest().execute();
