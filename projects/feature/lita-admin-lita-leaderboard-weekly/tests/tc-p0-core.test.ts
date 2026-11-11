/**
 * 项目 3713「Lita Leaderboard Weekly Data」P0 正式执行：用例 #1、#3、#4、#5、#6（D1-D3）、#7（D1-D2）、#8、#12
 *
 * 用例来源：/api/docs/detail/task/20261111/TK-0204/HANDOFF.md（九列用例，17 条）
 * 技术方案：/api/docs/detail/task/20261111/TK-0204/TECH_DESIGN.md（SK1-SK9 / L01-L21 / 断言映射）
 * 覆盖：#1 菜单导航；#3 空条件必填拦截；#4 仅 RankingType 拦截；#5 仅 Week 拦截；
 *       #6 三榜单印尼语区基线（D1-D3）；#7 周四/周日周归一（D1-D2）；#8 不选 Locale 80 行 4 页；#12 导出 Excel 核对
 * 数据隔离：BD-0 存量只读（2026-11-02 / 2026-11-08 周分区）；不造数、无写操作、无清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… TMPDIR=<可写目录> node tc-p0-core.test.ts [--evidence-dir=...]
 */
import ExcelJS from 'exceljs';
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase, norm, num } from './lib/admin-base.ts';

const HEADERS = ['Rank', 'Ranking Type', 'Nick', 'Locale', 'No', 'User ID', 'Week', 'Week Range', 'Period', 'Total Coins', 'Order Coins', 'Gift Coins'];
const EXPORT_HEADERS = ['rank', 'ranking type', 'nick', 'locale', 'no', 'user id', 'week', 'week range', 'period', 'total coins', 'order coins', 'gift coins'];
const WEEK = '2026-11-02';
const WEEK_RANGE = '2026-11-02 ~ 2026-11-08';
const RANK_SEQ = Array.from({ length: 20 }, (_, i) => String(i + 1));

interface RankRow {
  row: string;
  type: string;
  nick: string;
  total: string;
  order: string;
  gift: string;
  typeCol: string;
}

const RANK_ROWS: RankRow[] = [
  { row: 'D1', type: 'Player Order Rank', nick: 'AbelKenneth ⚭', total: '508,600', order: '0', gift: '0', typeCol: 'order_rank' },
  { row: 'D2', type: 'Player Gift Rank', nick: 'ASELL⁰⁷⁰⁷', total: '2,401,099', order: '0', gift: '0', typeCol: 'gift_rank' },
  { row: 'D3', type: 'User Spend Rank', nick: 'EleanoreShanete', total: '2,151,806', order: '803,903', gift: '1,347,903', typeCol: 'spend_rank' }
];

class P0CoreTest extends AdminBase {
  constructor() {
    super('lita-leaderboard-weekly-p0');
    this.total = 51;
  }

  private async loginAndOpenReport(): Promise<void> {
    await this.login();
    await this.openReportRoute();
  }

  private async shotTable(name: string): Promise<void> {
    await this.page!.locator('.el-table').first().screenshot({ path: `${this.evidenceDir}/${name}.png` });
    this.screenshots.push(`${this.evidenceDir}/${name}.png`);
  }

  private rowsEqual(rows: string[][], idx: number, value: string): boolean {
    return rows.length > 0 && rows.every((r) => norm(r[idx] ?? '') === value);
  }

  private nonIncreasing(rows: string[][]): { ok: boolean; detail: string } {
    const totals = rows.map((r) => num(r[9] ?? ''));
    let ok = true;
    let tieOk = true;
    for (let i = 1; i < totals.length; i++) {
      if (totals[i] > totals[i - 1]) ok = false;
      if (totals[i] === totals[i - 1]) {
        if (num(rows[i][5] ?? '') <= num(rows[i - 1][5] ?? '')) tieOk = false;
      }
    }
    return { ok: ok && tieOk, detail: `首值=${totals[0]}，末值=${totals[totals.length - 1]}，非递增=${ok}，并列UserID升序=${tieOk}` };
  }

  protected async run(): Promise<void> {
    // ================= 用例#1 菜单导航 =================
    await this.login();
    await this.expandMenu('数据统计管理');
    await this.expandMenu('用户数据');
    const leaf = this.page!.locator('.el-menu-item', { hasText: 'Lita Leaderboard Weekly Data' }).first();
    const leafVisible = (await leaf.count()) > 0 && await leaf.isVisible().catch(() => false);
    const underUserData = await leaf.evaluate((el) => {
      const sub = el.closest('.el-submenu');
      const title = sub?.querySelector('.el-submenu__title')?.textContent ?? '';
      return title.includes('用户数据');
    }).catch(() => false);
    await this.shot('case1-menu-expanded');
    await this.check('用例#1-① 「用户数据」子菜单显示「Lita Leaderboard Weekly Data」项', async (): Promise<CheckResult> => {
      return { expect: '用户数据子菜单内可见叶子菜单', real: `可见=${leafVisible}，归属用户数据子菜单=${underUserData}`, pass: leafVisible && underUserData };
    });

    await leaf.click();
    await this.page!.locator('.query-field').first().waitFor({ state: 'visible', timeout: 30000 });
    const hash = await this.page!.evaluate(() => location.hash);
    await this.check('用例#1-② 点击后地址栏路由为 #/data-stats-manager/user-consumption/lita-leaderboard-weekly', async (): Promise<CheckResult> => {
      const ok = hash === '#/data-stats-manager/user-consumption/lita-leaderboard-weekly';
      return { expect: '#/data-stats-manager/user-consumption/lita-leaderboard-weekly', real: hash, pass: ok };
    });

    const titleVisible = await this.page!.getByText('周订单礼物消费榜', { exact: true }).first().isVisible().catch(() => false);
    const weekVisible = await this.field('Week').locator('input').first().isVisible().catch(() => false);
    const rankVisible = await this.field('Ranking Type').locator('.el-select').isVisible().catch(() => false);
    const localeVisible = await this.field('Locale').locator('.el-select').isVisible().catch(() => false);
    const queryVisible = await this.page!.getByRole('button', { name: '查询', exact: true }).isVisible().catch(() => false);
    const resetVisible = await this.page!.getByRole('button', { name: '重置', exact: true }).isVisible().catch(() => false);
    const exportVisible = await this.page!.getByRole('button', { name: '导出报表', exact: true }).isVisible().catch(() => false);
    await this.shot('case1-report-loaded');
    await this.check('用例#1-③ 页面显示标题「周订单礼物消费榜」、Week/Ranking Type/Locale 控件与查询/重置/导出报表按钮', async (): Promise<CheckResult> => {
      const ok = titleVisible && weekVisible && rankVisible && localeVisible && queryVisible && resetVisible && exportVisible;
      return {
        expect: '标题+3 控件+3 按钮全部可见',
        real: `标题=${titleVisible}，Week=${weekVisible}，Ranking=${rankVisible}，Locale=${localeVisible}，查询=${queryVisible}，重置=${resetVisible}，导出=${exportVisible}`,
        pass: ok
      };
    });

    const unconfigured = await this.page!.getByText('当前报表未配置查询条件').count();
    await this.check('用例#1-④ 页面不显示「当前报表未配置查询条件」', async (): Promise<CheckResult> => {
      return { expect: '不显示该提示', real: `匹配元素数=${unconfigured}`, pass: unconfigured === 0 };
    });

    // ================= 用例#3 空条件必填拦截 =================
    await this.openReportRoute();
    const count3 = await this.conditionCountText();
    const toast3P = this.armToast();
    const fired3P = this.queryFiresWithin(4000);
    await this.clickQueryNoWait();
    const toast3 = await toast3P;
    const fired3 = await fired3P;
    const empty3 = await this.emptyText();
    const total3 = await this.totalText();
    const count3After = await this.conditionCountText();
    await this.shot('case3-empty-required');
    await this.check('用例#3-① 未选任何条件点击查询弹出必填提示「请选择Week」', async (): Promise<CheckResult> => {
      return { expect: '提示包含 请选择Week', real: norm(toast3), pass: norm(toast3).includes('请选择Week') };
    });
    await this.check('用例#3-② 不发起查询：列表保持「请输入查询条件后查看数据」，Total 0', async (): Promise<CheckResult> => {
      return {
        expect: '无 stats/query 请求；等待提示可见；Total 0',
        real: `查询请求出现=${fired3}，列表提示=${empty3}，Total=${total3}`,
        pass: !fired3 && empty3.includes('请输入查询条件后查看数据') && total3 === 'Total 0'
      };
    });
    await this.check('用例#3-③ 条件计数保持「当前已设置查询条件：0 项」', async (): Promise<CheckResult> => {
      const ok = count3.includes('0 项') && count3After.includes('0 项');
      return { expect: '当前已设置查询条件：0 项', real: `点击前=${count3}；点击后=${count3After}`, pass: ok };
    });

    // ================= 用例#4 仅选 Ranking Type =================
    await this.openReportRoute();
    await this.pickOption('Ranking Type', 'Player Order Rank');
    const toast4P = this.armToast();
    const fired4P = this.queryFiresWithin(4000);
    await this.clickQueryNoWait();
    const toast4 = await toast4P;
    const fired4 = await fired4P;
    const empty4 = await this.emptyText();
    const total4 = await this.totalText();
    await this.shot('case4-week-missing');
    await this.check('用例#4-① 仅选 Ranking Type 点击查询弹出必填提示「请选择Week」', async (): Promise<CheckResult> => {
      return { expect: '提示包含 请选择Week', real: norm(toast4), pass: norm(toast4).includes('请选择Week') };
    });
    await this.check('用例#4-② 不发起查询：列表保持「请输入查询条件后查看数据」，Total 0', async (): Promise<CheckResult> => {
      return {
        expect: '无 stats/query 请求；等待提示可见；Total 0',
        real: `查询请求出现=${fired4}，列表提示=${empty4}，Total=${total4}`,
        pass: !fired4 && empty4.includes('请输入查询条件后查看数据') && total4 === 'Total 0'
      };
    });

    // ================= 用例#5 仅选 Week =================
    await this.openReportRoute();
    await this.setDate('Week', WEEK);
    const toast5P = this.armToast();
    const fired5P = this.queryFiresWithin(4000);
    await this.clickQueryNoWait();
    const toast5 = await toast5P;
    const fired5 = await fired5P;
    const empty5 = await this.emptyText();
    const total5 = await this.totalText();
    await this.shot('case5-ranking-missing');
    await this.check('用例#5-① 仅选 Week 点击查询弹出必填提示「请选择Ranking Type」', async (): Promise<CheckResult> => {
      return { expect: '提示包含 请选择Ranking Type', real: norm(toast5), pass: norm(toast5).includes('请选择Ranking Type') };
    });
    await this.check('用例#5-② 不发起查询：列表保持「请输入查询条件后查看数据」，Total 0', async (): Promise<CheckResult> => {
      return {
        expect: '无 stats/query 请求；等待提示可见；Total 0',
        real: `查询请求出现=${fired5}，列表提示=${empty5}，Total=${total5}`,
        pass: !fired5 && empty5.includes('请输入查询条件后查看数据') && total5 === 'Total 0'
      };
    });

    // ================= 用例#6 三榜单基线（D1-D3） =================
    for (const data of RANK_ROWS) {
      const tag = `[数据行${data.row}]`;
      await this.openReportRoute();
      await this.setDate('Week', WEEK);
      await this.pickOption('Ranking Type', data.type);
      await this.pickOption('Locale', '印尼语区');
      const toastP = this.armToast();
      const qStatus = this.clickQuery();
      const toast = await toastP;
      const status = await qStatus;
      const rows = await this.tableRows();
      const total = await this.totalText();
      const pages = await this.pagerPages();
      const headers = await this.tableHeaders();
      const ranks = this.columnValues(rows, 0);
      const first = rows[0] ?? [];
      const order = this.nonIncreasing(rows);
      await this.shot(`case6-${data.row}-after-query`);
      await this.shotTable(`case6-${data.row}-table`);

      await this.check(`用例#6-①${tag} 查询完成提示「查询完成，共 20 条」`, async (): Promise<CheckResult> => {
        return { expect: '包含 查询完成，共 20 条', real: `HTTP=${status}，提示=${norm(toast)}`, pass: status === 200 && norm(toast).includes('查询完成，共 20 条') };
      });
      await this.check(`用例#6-②${tag} 列表 20 行且 Rank 列 1-20 连续`, async (): Promise<CheckResult> => {
        const ok = rows.length === 20 && ranks.join(',') === RANK_SEQ.join(',');
        return { expect: '行数=20，Rank=1..20', real: `行数=${rows.length}，Rank=${ranks.join(',')}`, pass: ok };
      });
      await this.check(`用例#6-③${tag} 第 1 行 Nick 与 Total Coins 符合基线`, async (): Promise<CheckResult> => {
        const ok = norm(first[2] ?? '') === data.nick && norm(first[9] ?? '') === data.total;
        return { expect: `Nick=${data.nick}，Total Coins=${data.total}`, real: `Nick匹配=${norm(first[2] ?? '') === data.nick}，TotalCoins匹配=${norm(first[9] ?? '') === data.total}`, pass: ok };
      });
      await this.check(`用例#6-④${tag} 第 1 行 Order Coins 与 Gift Coins 符合基线`, async (): Promise<CheckResult> => {
        const ok = norm(first[10] ?? '') === data.order && norm(first[11] ?? '') === data.gift;
        return { expect: `Order Coins=${data.order}，Gift Coins=${data.gift}`, real: `实际=${norm(first[10] ?? '')}/${norm(first[11] ?? '')}`, pass: ok };
      });
      await this.check(`用例#6-⑤${tag} Week/Week Range/Period/Locale/Ranking Type 列全部符合预期`, async (): Promise<CheckResult> => {
        const okWeek = this.rowsEqual(rows, 6, WEEK);
        const okRange = this.rowsEqual(rows, 7, WEEK_RANGE);
        const okPeriod = this.rowsEqual(rows, 8, 'weekly');
        const okLocale = this.rowsEqual(rows, 3, 'in');
        const okType = this.rowsEqual(rows, 1, data.typeCol);
        return {
          expect: `Week=${WEEK}；Week Range=${WEEK_RANGE}；Period=weekly；Locale=in；Ranking Type=${data.typeCol}`,
          real: `Week=${okWeek}，Range=${okRange}，Period=${okPeriod}，Locale=${okLocale}，Type=${okType}`,
          pass: okWeek && okRange && okPeriod && okLocale && okType
        };
      });
      await this.check(`用例#6-⑥${tag} 分页 Total 20 且仅 1 页`, async (): Promise<CheckResult> => {
        const ok = total === 'Total 20' && pages.length === 1 && pages[0] === '1';
        return { expect: 'Total 20；页码仅 1', real: `Total=${total}；页码=${pages.join(',')}`, pass: ok };
      });
      await this.check(`用例#6-⑦${tag} 表头 12 列与预期一致`, async (): Promise<CheckResult> => {
        const ok = headers.length === 12 && headers.every((h, i) => h === HEADERS[i]);
        return { expect: HEADERS.join(' | '), real: headers.join(' | '), pass: ok };
      });
      await this.check(`用例#6-⑧${tag} Total Coins 列逐行非递增（并列按 User ID 升序）`, async (): Promise<CheckResult> => {
        return { expect: 'Total Coins 非递增；并列 User ID 升序', real: order.detail, pass: order.ok };
      });
    }

    // ================= 用例#7 周归一（D1-D2） =================
    for (const day of ['2026-11-05', '2026-11-08']) {
      const tag = `[数据行${day === '2026-11-05' ? 'D1' : 'D2'}]`;
      await this.openReportRoute();
      await this.setDate('Week', day);
      await this.pickOption('Ranking Type', 'Player Order Rank');
      await this.pickOption('Locale', '印尼语区');
      this.armToast().catch(() => undefined);
      const status = await this.clickQuery();
      const rows = await this.tableRows();
      const total = await this.totalText();
      const ranks = this.columnValues(rows, 0);
      const first = rows[0] ?? [];
      await this.shot(`case7-${day}-after-query`);
      await this.check(`用例#7-①${tag} 20 行 Rank 1-20，第 1 行 Nick/Total Coins 与 B1 一致`, async (): Promise<CheckResult> => {
        const ok = status === 200 && rows.length === 20 && ranks.join(',') === RANK_SEQ.join(',') &&
          norm(first[2] ?? '') === 'AbelKenneth ⚭' && norm(first[9] ?? '') === '508,600';
        return { expect: '20 行 Rank 1-20；Top1 Nick/Total Coins 与 B1 一致', real: `HTTP=${status}，行数=${rows.length}，Rank首末=${ranks[0]}-${ranks[ranks.length - 1]}，Top1匹配=${norm(first[2] ?? '') === 'AbelKenneth ⚭' && norm(first[9] ?? '') === '508,600'}`, pass: ok };
      });
      await this.check(`用例#7-②${tag} Week 列全部显示 2026-11-02（归一到周一）`, async (): Promise<CheckResult> => {
        return { expect: `全部=${WEEK}`, real: `Week 列唯一值=${Array.from(new Set(this.columnValues(rows, 6))).join(',')}`, pass: this.rowsEqual(rows, 6, WEEK) };
      });
      await this.check(`用例#7-③${tag} Week Range 列全部显示 2026-11-02 ~ 2026-11-08`, async (): Promise<CheckResult> => {
        return { expect: `全部=${WEEK_RANGE}`, real: `Week Range 唯一值=${Array.from(new Set(this.columnValues(rows, 7))).join(',')}`, pass: this.rowsEqual(rows, 7, WEEK_RANGE) };
      });
      await this.check(`用例#7-④${tag} 分页 Total 20`, async (): Promise<CheckResult> => {
        return { expect: 'Total 20', real: total, pass: total === 'Total 20' };
      });
    }

    // ================= 用例#8 不选 Locale：80 行 4 页 =================
    await this.openReportRoute();
    await this.setDate('Week', '2026-11-08');
    await this.pickOption('Ranking Type', 'Player Gift Rank');
    this.armToast().catch(() => undefined);
    const status8 = await this.clickQuery();
    const page1 = await this.tableRows();
    const total8 = await this.totalText();
    const pages8 = await this.pagerPages();
    await this.shot('case8-page1');
    const pageRows: string[][][] = [page1];
    const pageCounts: number[] = [page1.length];
    for (const n of [2, 3, 4]) {
      await this.goPage(n);
      const rows = await this.tableRows();
      pageRows.push(rows);
      pageCounts.push(rows.length);
    }
    await this.shot('case8-page4');
    const all8 = pageRows.flat();
    const locales = this.columnValues(all8, 3);
    const localeCount = (code: string) => locales.filter((v) => v === code).length;
    await this.check('用例#8-① 分页 Total 80、共 4 页、每页 20 行', async (): Promise<CheckResult> => {
      const ok = status8 === 200 && total8 === 'Total 80' && pages8.join(',') === '1,2,3,4' && pageCounts.every((c) => c === 20);
      return { expect: 'Total 80；页码 1-4；每页 20 行', real: `HTTP=${status8}，Total=${total8}，页码=${pages8.join(',')}，每页行数=${pageCounts.join('/')}`, pass: ok };
    });
    await this.check('用例#8-② 4 页合计 80 行，Locale 列 in/ko/ph/vi 各 20 行', async (): Promise<CheckResult> => {
      const ok = all8.length === 80 && ['in', 'ko', 'ph', 'vi'].every((l) => localeCount(l) === 20);
      return { expect: '80 行；in/ko/ph/vi 各 20 行', real: `行数=${all8.length}；in=${localeCount('in')}，ko=${localeCount('ko')}，ph=${localeCount('ph')}，vi=${localeCount('vi')}`, pass: ok };
    });
    await this.check('用例#8-③ 每个 Locale 的 Rank 集合均为 1-20 连续（各 locale 独立排名）', async (): Promise<CheckResult> => {
      const detail: string[] = [];
      let ok = true;
      for (const loc of ['in', 'ko', 'ph', 'vi']) {
        const ranks = all8.filter((r) => norm(r[3] ?? '') === loc).map((r) => norm(r[0] ?? '')).sort((a, b) => Number(a) - Number(b));
        const hit = ranks.join(',') === RANK_SEQ.join(',');
        if (!hit) ok = false;
        detail.push(`${loc}:${ranks.join(',')}`);
      }
      return { expect: '每个 locale Rank=1..20', real: detail.join('；'), pass: ok };
    });

    // ================= 用例#12 导出 =================
    await this.openReportRoute();
    await this.setDate('Week', WEEK);
    await this.pickOption('Ranking Type', 'Player Order Rank');
    await this.pickOption('Locale', '印尼语区');
    this.armToast().catch(() => undefined);
    const status12 = await this.clickQuery();
    const pageRows12 = await this.tableRows();
    const filterBefore = {
      week: await this.inputValue('Week'),
      rank: await this.inputValue('Ranking Type'),
      locale: await this.inputValue('Locale')
    };
    await this.shot('case12-before-export');
    const file = await this.downloadExport();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file.path);
    const ws = wb.worksheets[0];
    const excelRows: string[][] = [];
    ws.eachRow((row) => {
      const vals: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { vals[col - 1] = String(cell.value ?? '').trim(); });
      excelRows.push(vals);
    });
    const headerRow = excelRows[0] ?? [];
    const firstData = excelRows[1] ?? [];
    const pageFirst = pageRows12[0] ?? [];
    const filterAfter = {
      week: await this.inputValue('Week'),
      rank: await this.inputValue('Ranking Type'),
      locale: await this.inputValue('Locale')
    };
    const rowsAfter = await this.rowCount();
    await this.shot('case12-after-export');

    await this.check('用例#12-① 浏览器下载 .xlsx 文件且文件名含「周订单礼物消费榜」', async (): Promise<CheckResult> => {
      const ok = file.name.endsWith('.xlsx') && file.name.includes('周订单礼物消费榜');
      return { expect: '文件名为 .xlsx 且含 周订单礼物消费榜', real: file.name, pass: ok };
    });
    await this.check('用例#12-② 文件共 21 行 × 12 列（1 行表头 + 20 行数据）', async (): Promise<CheckResult> => {
      const nonEmpty = excelRows.filter((r) => r.some((v) => (v ?? '') !== '')).length;
      const maxCols = Math.max(...excelRows.map((r) => r.filter((v) => (v ?? '') !== '').length));
      return { expect: '21 行 × 12 列', real: `${nonEmpty} 行 × ${maxCols} 列`, pass: nonEmpty === 21 && maxCols === 12 };
    });
    await this.check('用例#12-③ 表头为导出小写列名 rank/ranking type/.../gift coins', async (): Promise<CheckResult> => {
      const got = headerRow.map((v) => norm(v)).filter(Boolean);
      const ok = got.length === 12 && got.every((h, i) => h === EXPORT_HEADERS[i]);
      return { expect: EXPORT_HEADERS.join(' | '), real: got.join(' | '), pass: ok };
    });
    await this.check('用例#12-④ 数据行数值与页面同条件列表一致（第 1 行）', async (): Promise<CheckResult> => {
      const pairs = [
        ['rank', norm(firstData[0] ?? ''), norm(pageFirst[0] ?? '')],
        ['ranking type', norm(firstData[1] ?? ''), norm(pageFirst[1] ?? '')],
        ['nick', norm(firstData[2] ?? ''), norm(pageFirst[2] ?? '')],
        ['locale', norm(firstData[3] ?? ''), norm(pageFirst[3] ?? '')],
        ['no', norm(firstData[4] ?? ''), norm(pageFirst[4] ?? '')],
        ['user id', norm(firstData[5] ?? ''), norm(pageFirst[5] ?? '')],
        ['week', norm(firstData[6] ?? ''), norm(pageFirst[6] ?? '')],
        ['week range', norm(firstData[7] ?? ''), norm(pageFirst[7] ?? '')],
        ['period', norm(firstData[8] ?? ''), norm(pageFirst[8] ?? '')],
        ['total coins', String(num(firstData[9] ?? '')), String(num(pageFirst[9] ?? ''))],
        ['order coins', String(num(firstData[10] ?? '')), String(num(pageFirst[10] ?? ''))],
        ['gift coins', String(num(firstData[11] ?? '')), String(num(pageFirst[11] ?? ''))]
      ];
      const bad = pairs.filter(([, a, b]) => a !== b).map(([k, a, b]) => `${k}:${a}≠${b}`);
      const ok = bad.length === 0 && norm(firstData[6] ?? '') === WEEK && norm(firstData[9] ?? '') === '508600';
      return { expect: '12 列逐列一致；week=2026-11-02；total coins=508600', real: bad.length === 0 ? '12 列全部一致' : `不一致项=${bad.join('；')}`, pass: ok };
    });
    await this.check('用例#12-⑤ 导出后页面列表与筛选条件不变', async (): Promise<CheckResult> => {
      const ok = rowsAfter === 20 && filterAfter.week === filterBefore.week && filterAfter.rank === filterBefore.rank && filterAfter.locale === filterBefore.locale;
      return {
        expect: `行数=20；Week/Ranking/Locale 保持 ${filterBefore.week}/${filterBefore.rank}/${filterBefore.locale}`,
        real: `行数=${rowsAfter}；Week=${filterAfter.week}；Ranking=${filterAfter.rank}；Locale=${filterAfter.locale}；查询HTTP=${status12}`,
        pass: ok
      };
    });
  }
}

await new P0CoreTest().execute();
