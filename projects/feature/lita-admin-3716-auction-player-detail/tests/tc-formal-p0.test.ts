/**
 * 项目 3716「拍拍模式流水-主播维度」：P0-A（入口/首屏/必填/分页守卫/查询/筛选）
 *
 * 用例来源：/task/20261111/TK-0206/HANDOFF 第 3 节九列表格（22 条）
 * 技术方案：/task/20261111/TK-0206/TECH_DESIGN（实测元素定位/引用式断言映射）
 * 覆盖：用例#1 AUTH-01、#4 INIT-01、#5 VALID-01、#6 VALID-02、#7 GUARD-01、#9 QUERY-01
 * 数据隔离：BD-0 测试环境存量只读（2026-11-10），不造数、无清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-formal-p0.test.ts [--evidence-dir=...]
 */
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;

class P0FormalTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p0-formal');
    this.total = 18;
  }

  /** stats/query 响应计数：仅作技术服务方案§6 附加证据，不参与检查点判定。 */
  private queryCount(): number {
    return this.calls.filter((c) => c.path.includes('/stats/query') && !c.path.includes('download')).length;
  }

  private async openDetail(): Promise<void> {
    await this.nav('/data-stats-manager/voice-room-data/auction-mode-player-detail');
    await this.waitReportReady();
  }

  private async prepareDates(day = '2026-11-10'): Promise<void> {
    await this.setDateValue('开始日期', day);
    await this.setDateValue('结束日期', day);
    await this.waitConditionCount(2);
  }

  private async rows(): Promise<string[][]> {
    return this.tableRows();
  }

  /** 大区控件是否为多选形态。 */
  private async regionIsMultiple(): Promise<boolean> {
    return this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '大区' }) })
      .locator('.el-select').first().evaluate((el) => el.classList.contains('el-select--multiple') || !!el.querySelector('.el-select__tags'));
  }

  /** 首屏/重置后的分页守卫探测：仅当控件可用时执行用户点击，禁用态如实记录。 */
  private async guardProbe(): Promise<string> {
    const before = this.queryCount();
    const state = await this.paginationState();
    let detail = `Total=${state.total}，prevDisabled=${state.prevDisabled}，nextDisabled=${state.nextDisabled}，sizeDisabled=${state.sizeDisabled}`;
    if (state.nextDisabled) {
      detail += '，下一页禁用（用户不可点击）';
    } else {
      await this.page!.locator('.el-pagination .btn-next').first().click();
      await this.waitNoLoading(15000);
      detail += '，已点击下一页';
    }
    if (state.sizeDisabled) {
      detail += '，每页条数选择器禁用（用户不可切换）';
    } else {
      const sel = this.page!.locator('.el-pagination__sizes .el-select').first();
      await sel.click();
      const dropdown = this.page!.locator('.el-select-dropdown:visible').last();
      await dropdown.waitFor({ state: 'visible', timeout: 10000 });
      await dropdown.locator('.el-select-dropdown__item', { hasText: '10/page' }).first().click();
      await this.waitNoLoading(15000);
      detail += '，已切换每页条数为 10';
    }
    detail += `，query 请求增量=${this.queryCount() - before}（附加证据，不参与判定）`;
    return detail;
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- 用例#1 TC-AUTH-01 ----------
    await this.expandMenu('数据统计管理');
    await this.expandMenu('语音房相关数据');
    const menuItem = this.page!.locator('.el-menu-item', { hasText: '拍拍模式流水-主播维度' }).first();
    const menuVisible = (await menuItem.count()) > 0 && (await menuItem.isVisible().catch(() => false));
    await this.shot('auth01-menu-visible');
    await this.check('用例#1-①(TC-AUTH-01) 「语音房相关数据」下可见「拍拍模式流水-主播维度」菜单项', async (): Promise<CheckResult> => {
      return { expect: '菜单项可见', real: `菜单可见=${menuVisible}`, pass: menuVisible };
    });
    await menuItem.click();
    await this.waitReportReady();
    const title = await this.page!.locator('.page-title').innerText().catch(() => '');
    const crumb = await this.breadcrumb();
    const hash = await this.page!.evaluate(() => location.hash);
    await this.shot('auth01-report-opened');
    await this.check('用例#1-②(TC-AUTH-01) 进入报表页，面包屑与页面标题正确', async (): Promise<CheckResult> => {
      const ok = crumb.includes('数据统计管理') && crumb.includes('语音房相关数据') && crumb.includes('拍拍模式流水') &&
        title.replace(/\s+/g, '').includes('拍拍模式流水-主播维度');
      return {
        expect: '面包屑含 数据统计管理/语音房相关数据/拍拍模式流水-主播维度；标题含 拍拍模式流水 - 主播维度',
        real: `面包屑=${crumb}，标题=${title}`,
        pass: ok
      };
    });
    await this.check('用例#1-③(TC-AUTH-01) 地址栏路由为 /#/data-stats-manager/voice-room-data/auction-mode-player-detail', async (): Promise<CheckResult> => {
      return {
        expect: '路由包含 /data-stats-manager/voice-room-data/auction-mode-player-detail',
        real: `hash=${hash}`,
        pass: hash.includes('/data-stats-manager/voice-room-data/auction-mode-player-detail')
      };
    });

    // ---------- 用例#4 TC-INIT-01 ----------
    const entryQ = this.queryCount();
    const empty = await this.emptyText();
    const initState = await this.paginationState();
    const initRows = await this.rows();
    const initLoading = await this.loadingCount();
    await this.shot('init01-initial');
    await this.check('用例#4-①(TC-INIT-01) 表格区显示空态「请输入查询条件后查看数据」', async (): Promise<CheckResult> => {
      return { expect: '空态「请输入查询条件后查看数据」', real: `空态=${empty}`, pass: empty.includes('请输入查询条件后查看数据') };
    });
    await this.check('用例#4-②(TC-INIT-01) 分页显示 Total 0，每页条数与上一页/下一页均禁用', async (): Promise<CheckResult> => {
      return {
        expect: 'Total 0；每页条数/上一页/下一页禁用',
        real: JSON.stringify(initState),
        pass: initState.total.includes('Total 0') && initState.sizeDisabled && initState.prevDisabled && initState.nextDisabled
      };
    });
    await this.check('用例#4-③(TC-INIT-01) 表格区无数据行且无 loading 加载动画', async (): Promise<CheckResult> => {
      return {
        expect: '数据行 0；loading 0',
        real: `数据行=${initRows.length}，loading=${initLoading}，首屏 query 请求=${entryQ}（附加证据）`,
        pass: initRows.length === 0 && initLoading === 0
      };
    });

    // ---------- 用例#5 TC-VALID-01 ----------
    const before1 = this.queryCount();
    await this.page!.locator('button.el-button--primary', { hasText: '查询' }).first().click();
    const msg1 = await this.messageText();
    const empty1 = await this.emptyText();
    const total1 = await this.totalText();
    const rows1 = await this.rows();
    const loading1 = await this.loadingCount();
    await this.shot('valid01-date-required');
    await this.check('用例#5-①(TC-VALID-01) 未选日期点查询，提示「请选择开始日期」', async (): Promise<CheckResult> => {
      return { expect: '提示「请选择开始日期」', real: `提示=${msg1}`, pass: msg1.includes('请选择开始日期') };
    });
    await this.check('用例#5-②(TC-VALID-01) 表格保持空态，无数据行、无 loading', async (): Promise<CheckResult> => {
      return {
        expect: '空态「请输入查询条件后查看数据」；0 行；loading 0',
        real: `空态=${empty1}，行=${rows1.length}，loading=${loading1}`,
        pass: empty1.includes('请输入查询条件后查看数据') && rows1.length === 0 && loading1 === 0
      };
    });
    await this.check('用例#5-③(TC-VALID-01) 分页保持「Total 0」', async (): Promise<CheckResult> => {
      return {
        expect: 'Total 0',
        real: `Total=${total1}，query 请求增量=${this.queryCount() - before1}（附加证据）`,
        pass: total1.includes('Total 0')
      };
    });

    // ---------- 用例#6 TC-VALID-02 ----------
    const beforeDl = this.calls.filter((c) => c.path.includes('/stats/query/download')).length;
    const dlPromise = this.page!.waitForEvent('download', { timeout: 5000 }).then(() => true).catch(() => false);
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const [msg2, downloaded] = await Promise.all([this.messageText(), dlPromise]);
    const empty2 = await this.emptyText();
    const afterDl = this.calls.filter((c) => c.path.includes('/stats/query/download')).length;
    await this.shot('valid02-export-required');
    await this.check('用例#6-①(TC-VALID-02) 未选日期点导出，触发日期必填拦截且不产生下载文件', async (): Promise<CheckResult> => {
      return {
        expect: '页面提示需选择日期；无下载文件',
        real: `提示=${msg2}，下载事件=${downloaded ? '有' : '无'}，download 请求增量=${afterDl - beforeDl}（附加证据）`,
        pass: /请选择.*日期/.test(msg2) && !downloaded
      };
    });
    await this.check('用例#6-②(TC-VALID-02) 表格保持空态「请输入查询条件后查看数据」', async (): Promise<CheckResult> => {
      return { expect: '空态「请输入查询条件后查看数据」', real: `空态=${empty2}`, pass: empty2.includes('请输入查询条件后查看数据') };
    });

    // ---------- 用例#7 TC-GUARD-01 ----------
    const guard1 = await this.guardProbe();
    const emptyG1 = await this.emptyText();
    const stateG1 = await this.paginationState();
    const rowsG1 = await this.rows();
    const loadingG1 = await this.loadingCount();
    await this.shot('guard01-initial');
    await this.check('用例#7-①(TC-GUARD-01) 首屏操作分页/每页条数后表格保持空态、无数据行', async (): Promise<CheckResult> => {
      return {
        expect: '空态「请输入查询条件后查看数据」；0 行',
        real: `${guard1}；空态=${emptyG1}；行=${rowsG1.length}`,
        pass: emptyG1.includes('请输入查询条件后查看数据') && rowsG1.length === 0
      };
    });
    await this.check('用例#7-②(TC-GUARD-01) 分页保持 Total 0，每页条数与上一页/下一页保持禁用', async (): Promise<CheckResult> => {
      return {
        expect: 'Total 0；每页条数/上一页/下一页禁用',
        real: JSON.stringify(stateG1),
        pass: stateG1.total.includes('Total 0') && stateG1.sizeDisabled && stateG1.prevDisabled && stateG1.nextDisabled
      };
    });
    await this.check('用例#7-③(TC-GUARD-01) 无 loading、未刷新出数据', async (): Promise<CheckResult> => {
      return {
        expect: 'loading 0；0 行',
        real: `loading=${loadingG1}；行=${rowsG1.length}；${guard1}`,
        pass: loadingG1 === 0 && rowsG1.length === 0
      };
    });

    // ---------- 用例#9 TC-QUERY-01 ----------
    await this.reset();
    await this.prepareDates('2026-11-10');
    await this.clickQuery();
    await this.pageSize(50);
    const qRows = await this.rows();
    const qTotal = await this.paginationTotal();
    const status = (key: string) => qRows.filter((r) => (r[7] ?? '').includes(key)).length;
    const success = status('结算成功');
    const noSupport = status('无支持者');
    const below = status('金额未达到最低等级');
    const qSum = Math.round(qRows.reduce((acc, r) => acc + num(r[8]), 0) * 100) / 100;
    await this.shot('query01-1110-all');
    await this.check('用例#9-①(TC-QUERY-01) 分页 Total 26 且列表共 26 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 26；26 行', real: `Total=${qTotal}，行=${qRows.length}`, pass: qTotal === 26 && qRows.length === 26 };
    });
    await this.check('用例#9-②(TC-QUERY-01) auction status 分布 15/4/7', async (): Promise<CheckResult> => {
      return {
        expect: '结算成功 15；无支持者 4；金额未达到最低等级 7',
        real: `结算成功=${success}，无支持者=${noSupport}，金额未达到最低等级=${below}`,
        pass: success === 15 && noSupport === 4 && below === 7
      };
    });
    await this.check('用例#9-③(TC-QUERY-01) auction total coins 列合计 445,824.52', async (): Promise<CheckResult> => {
      return { expect: '445824.52', real: qSum.toFixed(2), pass: Math.abs(qSum - 445824.52) < 0.01 };
    });
    await this.check('用例#9-④(TC-QUERY-01) date 列各行显示 2026-11-10~2026-11-10', async (): Promise<CheckResult> => {
      const bad = qRows.filter((r) => r[0] !== '2026-11-10~2026-11-10').length;
      return {
        expect: '26 行 date 均为 2026-11-10~2026-11-10',
        real: `行=${qRows.length}，不符行=${bad}`,
        pass: qRows.length === 26 && bad === 0
      };
    });


  }
}

new P0FormalTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
