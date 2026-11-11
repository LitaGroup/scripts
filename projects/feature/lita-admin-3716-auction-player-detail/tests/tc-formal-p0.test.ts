/**
 * 项目 3716「拍拍模式流水-主播维度」正式轮：P0 13 条（UI）
 *
 * 用例来源：/task/20261111/TK-0206/HANDOFF（合规用例编写产出，22 条）
 * 技术方案：/task/20261111/TK-0206/TECH_DESIGN（实测元素定位/断言映射）
 * 覆盖：AUTH-01、INIT-01、VALID-01、VALID-02、GUARD-01、GUARD-02、QUERY-01、
 *       FILTER-01、FILTER-02（D1/D2）、FILTER-03、EXPORT-01、DISP-01、DISP-02
 * 数据隔离：BD-0 存量只读，2026-11-10 数据；不造数、无清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-formal-p0.test.ts [--evidence-dir=...]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const HEADERS = [
  'date', 'sale_batch_no', 'player_id', 'player_no', 'player_nick', 'room id', 'room nick',
  'auction status', 'auction total coins', 'number of users in auction', 'winner user_id',
  'winner user_no', 'winner user_nick', 'winner user_total price', 'auction success - date&time',
  'relationship type', 'relationship level'
];
const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
const norm = (v: string): string => (v ?? '').replace(/[\u200B-\u200F\uFEFF]/g, '').replace(/\s+/g, ' ').trim();

class P0FormalTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p0-formal');
    this.total = 26;
  }

  private queryCount(): number {
    return this.calls.filter((c) => c.path.includes('/stats/query') && !c.path.includes('download')).length;
  }

  private async openFromMenu(): Promise<void> {
    await this.expandMenu('数据统计管理');
    await this.expandMenu('语音房相关数据');
    await this.page!.locator('.el-menu-item', { hasText: '拍拍模式流水-主播维度' }).first().click();
    await this.page!.waitForSelector('.filter-card', { timeout: 30000 });
    await this.page!.waitForTimeout(1200);
  }

  private async reset(): Promise<void> {
    await this.page!.getByRole('button', { name: '重置', exact: true }).click();
    await this.page!.waitForTimeout(1000);
  }

  private async setDates(day = 10): Promise<void> {
    await this.pickDate('开始日期', day);
    await this.pickDate('结束日期', day);
  }

  private async rows(): Promise<string[][]> {
    return this.page!.locator('.el-table__body-wrapper tbody tr').evaluateAll((rs) =>
      rs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()))
    );
  }

  private async switchSizeNoWait(n: number): Promise<boolean> {
    const sel = this.page!.locator('.el-pagination__sizes .el-select').first();
    if ((await sel.count()) === 0) return false;
    const disabled = await sel.evaluate((el) => el.classList.contains('is-disabled') || !!el.querySelector('input[disabled]')).catch(() => true);
    if (disabled) return false;
    await sel.click();
    const opt = this.page!.locator('.el-select-dropdown:visible .el-select-dropdown__item', { hasText: `${n}/page` }).first();
    if ((await opt.count()) === 0) return false;
    await opt.click();
    await this.page!.waitForTimeout(1500);
    return true;
  }

  private async guardProbe(): Promise<string> {
    const before = this.queryCount();
    const st = await this.paginationState();
    let detail = `Total=${st.total}，prevDisabled=${st.prevDisabled}，nextDisabled=${st.nextDisabled}，sizeDisabled=${st.sizeDisabled}`;
    if (!st.nextDisabled) {
      await this.page!.locator('.el-pagination .btn-next').first().click();
      await this.page!.waitForTimeout(1500);
      detail += '，已点击下一页';
    } else {
      detail += '，下一页禁用未触发';
    }
    const switched = await this.switchSizeNoWait(10);
    detail += switched ? '，已切换每页条数' : '，每页条数禁用未触发';
    detail += `，query 请求增量=${this.queryCount() - before}`;
    return detail;
  }

  private async singleSelect(): Promise<boolean> {
    return this.page!.locator('.query-field', { has: this.page!.locator('.query-label', { hasText: '大区' }) })
      .locator('.el-select').first().evaluate((el) => el.classList.contains('el-select--multiple') || !!el.querySelector('.el-select__tags'));
  }

  protected async run(): Promise<void> {
    await this.login();

    // ---------- TC-AUTH-01 ----------
    await this.expandMenu('数据统计管理');
    await this.expandMenu('语音房相关数据');
    const menuItem = this.page!.locator('.el-menu-item', { hasText: '拍拍模式流水-主播维度' }).first();
    const menuVisible = (await menuItem.count()) > 0 && (await menuItem.isVisible().catch(() => false));
    await this.shot('auth01-menu-visible');
    await this.check('用例#TC-AUTH-01-① 「语音房相关数据」下可见「拍拍模式流水-主播维度」菜单项', async (): Promise<CheckResult> => {
      return { expect: '菜单项可见', real: `菜单可见=${menuVisible}`, pass: menuVisible };
    });
    await this.openFromMenu();
    const title = await this.page!.locator('.page-title').innerText().catch(() => '');
    const crumb = await this.breadcrumb();
    const hash = await this.page!.evaluate(() => location.hash);
    await this.shot('auth01-report-opened');
    await this.check('用例#TC-AUTH-01-② 进入报表页，面包屑与标题正确', async (): Promise<CheckResult> => {
      const ok = crumb.includes('数据统计管理') && crumb.includes('语音房相关数据') && crumb.includes('拍拍模式流水') &&
        title.replace(/\s+/g, '').includes('拍拍模式流水-主播维度');
      return { expect: '面包屑含 数据统计管理/语音房相关数据/拍拍模式流水-主播维度；标题含拍拍模式流水 - 主播维度', real: `面包屑=${crumb}，标题=${title}`, pass: ok };
    });
    await this.check('用例#TC-AUTH-01-③ 地址栏路由为 /#/data-stats-manager/voice-room-data/auction-mode-player-detail', async (): Promise<CheckResult> => {
      return { expect: '路由包含 /data-stats-manager/voice-room-data/auction-mode-player-detail', real: `hash=${hash}`, pass: hash.includes('/data-stats-manager/voice-room-data/auction-mode-player-detail') };
    });

    // ---------- TC-INIT-01 ----------
    const entryQ = this.queryCount();
    const empty = await this.emptyText();
    const initState = await this.paginationState();
    const initRows = await this.rows();
    const initLoading = await this.loadingCount();
    await this.shot('init01-initial');
    await this.check('用例#TC-INIT-01-① 表格区显示空态「请输入查询条件后查看数据」', async (): Promise<CheckResult> => {
      return { expect: '空态文案', real: `空态=${empty}`, pass: empty.includes('请输入查询条件后查看数据') };
    });
    await this.check('用例#TC-INIT-01-② 分页显示 Total 0，每页条数与上一页/下一页均禁用', async (): Promise<CheckResult> => {
      return { expect: 'Total 0；size/prev/next 禁用', real: JSON.stringify(initState), pass: initState.total.includes('Total 0') && initState.sizeDisabled && initState.prevDisabled && initState.nextDisabled };
    });
    await this.check('用例#TC-INIT-01-③ 无数据行且无 loading 加载动画', async (): Promise<CheckResult> => {
      return { expect: '数据行 0；loading 0；首屏 query=0', real: `数据行=${initRows.length}，loading=${initLoading}，query=${entryQ}`, pass: initRows.length === 0 && initLoading === 0 && entryQ === 0 };
    });

    // ---------- TC-VALID-01 ----------
    const before1 = this.queryCount();
    await this.page!.locator('button.el-button--primary', { hasText: '查询' }).first().click();
    const msg1 = await this.messageText();
    const empty1 = await this.emptyText();
    const total1 = await this.totalText();
    await this.shot('valid01-date-required');
    await this.check('用例#TC-VALID-01-① 未选日期点查询，提示「请选择开始日期」', async (): Promise<CheckResult> => {
      return { expect: '提示包含 请选择开始日期', real: `提示=${msg1}`, pass: msg1.includes('请选择开始日期') };
    });
    await this.check('用例#TC-VALID-01-② 表格保持空态，无数据行、无 loading', async (): Promise<CheckResult> => {
      const rows = await this.rows(); const loading = await this.loadingCount();
      return { expect: '空态；0 行；loading 0', real: `空态=${empty1}，行=${rows.length}，loading=${loading}`, pass: empty1.includes('请输入查询条件后查看数据') && rows.length === 0 && loading === 0 };
    });
    await this.check('用例#TC-VALID-01-③ 分页保持 Total 0 且未发出查询请求', async (): Promise<CheckResult> => {
      return { expect: 'Total 0；query 增量 0', real: `Total=${total1}，query 增量=${this.queryCount() - before1}`, pass: total1.includes('Total 0') && this.queryCount() === before1 };
    });

    // ---------- TC-VALID-02 ----------
    const beforeDl = this.calls.filter((c) => c.path.includes('/stats/query/download')).length;
    const dlPromise = this.page!.waitForEvent('download', { timeout: 2500 }).catch(() => null);
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const msg2 = await this.messageText();
    const dl = await dlPromise;
    await this.page!.waitForTimeout(300);
    const empty2 = await this.emptyText();
    const afterDl = this.calls.filter((c) => c.path.includes('/stats/query/download')).length;
    await this.shot('valid02-export-required');
    await this.check('用例#TC-VALID-02-① 未选日期点导出，触发必填拦截且不下载文件', async (): Promise<CheckResult> => {
      return { expect: '提示需选择日期；无下载；download 请求增量 0', real: `提示=${msg2}，下载=${dl ? '有' : '无'}，download 增量=${afterDl - beforeDl}`, pass: msg2.length > 0 && dl === null && afterDl === beforeDl };
    });
    await this.check('用例#TC-VALID-02-② 表格保持空态「请输入查询条件后查看数据」', async (): Promise<CheckResult> => {
      return { expect: '空态文案', real: `空态=${empty2}`, pass: empty2.includes('请输入查询条件后查看数据') };
    });

    // ---------- TC-GUARD-01 ----------
    const guard1 = await this.guardProbe();
    const emptyG1 = await this.emptyText();
    const stateG1 = await this.paginationState();
    const rowsG1 = await this.rows();
    const loadingG1 = await this.loadingCount();
    await this.shot('guard01-initial');
    await this.check('用例#TC-GUARD-01-① 首屏操作分页/每页条数后表格保持空态、无数据行', async (): Promise<CheckResult> => {
      return { expect: '空态；0 行', real: `${guard1}；空态=${emptyG1}；行=${rowsG1.length}`, pass: emptyG1.includes('请输入查询条件后查看数据') && rowsG1.length === 0 };
    });
    await this.check('用例#TC-GUARD-01-② 分页保持 Total 0，每页条数与上一页/下一页保持禁用', async (): Promise<CheckResult> => {
      return { expect: 'Total 0；size/prev/next 禁用', real: JSON.stringify(stateG1), pass: stateG1.total.includes('Total 0') && stateG1.sizeDisabled && stateG1.prevDisabled && stateG1.nextDisabled };
    });
    await this.check('用例#TC-GUARD-01-③ 无 loading、未刷新出数据且无新增 query 请求', async (): Promise<CheckResult> => {
      return { expect: 'loading 0；query 增量 0', real: `loading=${loadingG1}；${guard1}`, pass: loadingG1 === 0 && guard1.includes('query 请求增量=0') };
    });

    // ---------- TC-QUERY-01 ----------
    await this.reset();
    await this.setDates(10);
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    await this.pageSize(50);
    const qRows = await this.rows();
    const qTotal = await this.paginationTotal();
    const status = (key: string) => qRows.filter((r) => (r[7] ?? '').includes(key)).length;
    const success = status('结算成功');
    const noSupport = status('无支持者');
    const below = status('金额未达到最低等级');
    const qSum = Math.round(qRows.reduce((acc, r) => acc + num(r[8]), 0) * 100) / 100;
    await this.shot('query01-1110-all');
    await this.check('用例#TC-QUERY-01-① Total 26 且列表共 26 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 26；26 行', real: `Total=${qTotal}，行=${qRows.length}`, pass: qTotal === 26 && qRows.length === 26 };
    });
    await this.check('用例#TC-QUERY-01-② auction status 分布 15/4/7', async (): Promise<CheckResult> => {
      return { expect: '结算成功15，无支持者4，金额未达到最低等级7', real: `结算成功=${success}，无支持者=${noSupport}，金额未达到最低等级=${below}`, pass: success === 15 && noSupport === 4 && below === 7 };
    });
    await this.check('用例#TC-QUERY-01-③ auction total coins 合计 445,824.52', async (): Promise<CheckResult> => {
      return { expect: '445824.52', real: `${qSum.toFixed(2)}`, pass: Math.abs(qSum - 445824.52) < 0.01 };
    });
    await this.check('用例#TC-QUERY-01-④ date 列每行为 2026-11-10~2026-11-10', async (): Promise<CheckResult> => {
      const bad = qRows.filter((r) => r[0] !== '2026-11-10~2026-11-10').length;
      return { expect: '26 行 date 均为 2026-11-10~2026-11-10', real: `不符行=${bad}`, pass: qRows.length === 26 && bad === 0 };
    });

    // ---------- TC-FILTER-01 ----------
    await this.reset();
    await this.setDates(10);
    await this.pickOption('大区', '印尼语区');
    const multi = await this.singleSelect();
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    await this.pageSize(50);
    const f1Rows = await this.rows();
    const f1Total = await this.paginationTotal();
    const f1Sum = Math.round(f1Rows.reduce((acc, r) => acc + num(r[8]), 0) * 100) / 100;
    await this.shot('filter01-locale-in');
    await this.check('用例#TC-FILTER-01-① 大区控件为单选，无多选勾选/标签', async (): Promise<CheckResult> => {
      return { expect: '非多选', real: `多选=${multi}`, pass: !multi };
    });
    await this.check('用例#TC-FILTER-01-② Total 23 且列表 23 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 23；23 行', real: `Total=${f1Total}，行=${f1Rows.length}`, pass: f1Total === 23 && f1Rows.length === 23 };
    });
    await this.check('用例#TC-FILTER-01-③ auction total coins 合计 445,756.18', async (): Promise<CheckResult> => {
      return { expect: '445756.18', real: `${f1Sum.toFixed(2)}`, pass: Math.abs(f1Sum - 445756.18) < 0.01 };
    });

    // ---------- TC-FILTER-02（D1 逗号） ----------
    await this.reset();
    await this.setDates(10);
    await this.fillField('房间ID', '10101473,1002');
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    await this.pageSize(50);
    const d1Rows = await this.rows();
    const d1Total = await this.paginationTotal();
    const d1Ids = [...new Set(d1Rows.map((r) => String(r[5])))].sort();
    await this.shot('filter02-d1-comma');
    await this.check('用例#TC-FILTER-02-① D1 逗号分隔：Total 6 且列表 6 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 6；6 行', real: `Total=${d1Total}，行=${d1Rows.length}`, pass: d1Total === 6 && d1Rows.length === 6 };
    });
    await this.check('用例#TC-FILTER-02-② D1 room id 仅 10101473 与 1002，不出现其它房间', async (): Promise<CheckResult> => {
      return { expect: 'Room id 集合=[1002,10101473]', real: JSON.stringify(d1Ids), pass: d1Ids.length === 2 && d1Ids[0] === '1002' && d1Ids[1] === '10101473' };
    });

    // ---------- TC-FILTER-02（D2 换行） ----------
    await this.reset();
    await this.setDates(10);
    await this.fillField('房间ID', '10101473\n1002');
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    await this.pageSize(50);
    const d2Rows = await this.rows();
    const d2Total = await this.paginationTotal();
    const d2Ids = [...new Set(d2Rows.map((r) => String(r[5])))].sort();
    await this.shot('filter02-d2-newline');
    await this.check('用例#TC-FILTER-02-③ D1 逗号与 D2 换行结果一致（均 6 行、相同房间集合）', async (): Promise<CheckResult> => {
      const same = d1Total === d2Total && d1Rows.length === d2Rows.length && JSON.stringify(d1Ids) === JSON.stringify(d2Ids);
      return { expect: '两数据行均 6 行且 room id 集合一致', real: `D1 Total=${d1Total}/行=${d1Rows.length}/ids=${JSON.stringify(d1Ids)}；D2 Total=${d2Total}/行=${d2Rows.length}/ids=${JSON.stringify(d2Ids)}`, pass: same };
    });

    // ---------- TC-FILTER-03 ----------
    await this.reset();
    await this.setDates(10);
    await this.fillField('主播ID', '322540,7214137');
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    const f3Rows = await this.rows();
    const f3Total = await this.paginationTotal();
    const players = f3Rows.map((r) => String(r[2])).sort();
    await this.shot('filter03-player-batch');
    await this.check('用例#TC-FILTER-03-① Total 2 且列表 2 行', async (): Promise<CheckResult> => {
      return { expect: 'Total 2；2 行', real: `Total=${f3Total}，行=${f3Rows.length}`, pass: f3Total === 2 && f3Rows.length === 2 };
    });
    await this.check('用例#TC-FILTER-03-② player_id 分别为 322540 与 7214137', async (): Promise<CheckResult> => {
      return { expect: '[322540,7214137]', real: JSON.stringify(players), pass: players.length === 2 && players[0] === '322540' && players[1] === '7214137' };
    });

    // ---------- TC-DISP-01 / TC-DISP-02（同一次自包含查询） ----------
    await this.reset();
    await this.setDates(10);
    await this.clickQuery();
    await this.page!.waitForTimeout(2000);
    const headers = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const headerRows = await this.page!.locator('.el-table__header-wrapper thead tr').count();
    const dRows = await this.rows();
    const first = dRows[0] ?? [];
    await this.shot('disp01-headers');
    await this.check('用例#TC-DISP-01-① 表头共 17 列且列名与顺序正确', async (): Promise<CheckResult> => {
      const got = headers.map((h) => h.toLowerCase());
      return { expect: HEADERS.join('|'), real: `${got.join('|')}（${headers.length} 列）`, pass: headers.length === 17 && HEADERS.every((h, i) => got[i] === h) };
    });
    await this.check('用例#TC-DISP-01-② 各列名完整展示，不截断、无单字母列、不串列', async (): Promise<CheckResult> => {
      return { expect: '17 列均非空且无单字母列', real: `列数=${headers.length}，单字母=${headers.filter((h) => h.length <= 1).length}，空列=${headers.filter((h) => !h).length}`, pass: headers.length === 17 && !headers.some((h) => h.length <= 1) };
    });
    await this.check('用例#TC-DISP-01-③ auction success - date&time 为单一完整列名，未被拆为分组表头', async (): Promise<CheckResult> => {
      const has = headers.map((h) => h.toLowerCase()).includes('auction success - date&time');
      return { expect: '列名存在且表头为单行平铺', real: `存在=${has}，表头行=${headerRows}`, pass: has && headerRows === 1 };
    });
    await this.check('用例#TC-DISP-02-① 首行 sale_batch_no = YDA1A1794322778A24706644UF160426', async (): Promise<CheckResult> => {
      return { expect: 'YDA1A1794322778A24706644UF160426', real: first[1] ?? '', pass: (first[1] ?? '') === 'YDA1A1794322778A24706644UF160426' };
    });
    await this.check('用例#TC-DISP-02-② 首行 player_id=322540、player_no=1366411、player_nick=Lavieenbluu', async (): Promise<CheckResult> => {
      return { expect: '322540 / 1366411 / Lavieenbluu', real: `${first[2]} / ${first[3]} / ${norm(first[4])}`, pass: first[2] === '322540' && first[3] === '1366411' && norm(first[4]) === 'Lavieenbluu' };
    });
    await this.check('用例#TC-DISP-02-③ 首行 room id=10101473、status=结算成功，关系已处理、coins=38915.06、bidders=5', async (): Promise<CheckResult> => {
      return { expect: '10101473 / 结算成功，关系已处理 / 38915.06 / 5', real: `${first[5]} / ${first[7]} / ${first[8]} / ${first[9]}`, pass: first[5] === '10101473' && first[7] === '结算成功，关系已处理' && Math.abs(num(first[8]) - 38915.06) < 0.01 && num(first[9]) === 5 };
    });
    await this.check('用例#TC-DISP-02-④ 首行 winner user_id=21264129、price=37997、time=2026-11-10 23:05:35、type=cp、level=2', async (): Promise<CheckResult> => {
      return { expect: '21264129 / 37997 / 2026-11-10 23:05:35 / cp / 2', real: `${first[10]} / ${first[13]} / ${first[14]} / ${first[15]} / ${first[16]}`, pass: first[10] === '21264129' && Math.abs(num(first[13]) - 37997) < 0.01 && first[14] === '2026-11-10 23:05:35' && first[15] === 'cp' && num(first[16]) === 2 };
    });

    // ---------- TC-EXPORT-01 ----------
    const respPromise = this.page!.waitForResponse((r) => r.url().includes('/stats/query/download'), { timeout: 120000 });
    const dlNamePromise = this.page!.waitForEvent('download', { timeout: 120000 }).then((d) => d.suggestedFilename()).catch(() => '');
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const exportResp = await respPromise;
    const suggested = await dlNamePromise;
    const cd = exportResp.headers()['content-disposition'] ?? '';
    let fileName = suggested;
    if (!fileName) {
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      fileName = m ? decodeURIComponent(m[1]) : '';
    }
    const buf = Buffer.from(await exportResp.body());
    const xlsxPath = join(this.evidenceDir, `export-20261110-${Date.now()}.xlsx`);
    writeFileSync(xlsxPath, buf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);
    const ws = wb.worksheets[0];
    const excelRows: string[][] = [];
    ws.eachRow((row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => values.push(String(cell.value ?? '')));
      excelRows.push(values);
    });
    const dataStart = excelRows.findIndex((r) => /^\d{4}-\d{2}-\d{2}~/.test(r[0] ?? ''));
    const dataRows = dataStart >= 0 ? excelRows.slice(dataStart) : [];
    const excelSum = Math.round(dataRows.reduce((acc, r) => acc + num(r[8]), 0) * 100) / 100;
    const sameFirst = first.length === 17 && (dataRows[0] ?? []).length === 17 && first.every((v, i) => norm((dataRows[0] ?? [])[i] ?? '') === norm(v));
    await this.shot('export01-clicked');
    await this.check('用例#TC-EXPORT-01-① 下载文件名含「拍拍模式流水 - 主播维度」（.xlsx）', async (): Promise<CheckResult> => {
      return { expect: '文件名含报表名且为 .xlsx', real: `文件名=${fileName}`, pass: /拍拍模式流水\s*-\s*主播维度/.test(fileName) && /\.xlsx$/i.test(fileName) };
    });
    await this.check('用例#TC-EXPORT-01-② 导出 17 列 × 26 个数据行，列名与列序与页面一致', async (): Promise<CheckResult> => {
      const header = HEADERS.map((_, i) => {
        const a = ((excelRows[0] ?? [])[i] ?? '').trim();
        const b = ((excelRows[1] ?? [])[i] ?? '').trim();
        if (a && b && a.toLowerCase() !== b.toLowerCase() && !a.toLowerCase().includes(b.toLowerCase())) {
          return `${a} - ${b}`.replace(/\s+/g, ' ').trim().toLowerCase();
        }
        return a.toLowerCase();
      });
      const headerOk = HEADERS.every((h, i) => header[i] === h);
      return { expect: '17 列 × 26 数据行；列名/列序与页面一致', real: `列=${ws.columnCount}，数据行=${dataRows.length}，表头行=${dataStart}，表头匹配=${headerOk}`, pass: ws.columnCount === 17 && dataRows.length === 26 && headerOk };
    });
    await this.check('用例#TC-EXPORT-01-③ Auction Total coins 合计 445,824.52，与页面一致', async (): Promise<CheckResult> => {
      return { expect: '445824.52', real: `${excelSum.toFixed(2)}`, pass: Math.abs(excelSum - 445824.52) < 0.01 };
    });
    await this.check('用例#TC-EXPORT-01-④ 数据不错列：导出首行 17 字段与页面首行一致', async (): Promise<CheckResult> => {
      return { expect: '导出首行与页面首行 17 字段一致', real: `一致=${sameFirst}；导出首行=${JSON.stringify((dataRows[0] ?? []).slice(0, 3))}…`, pass: sameFirst };
    });

    this.notes.push(`导出表头行=${dataStart}；列=${ws.columnCount}；数据行=${dataRows.length}`);
  }
}

new P0FormalTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
