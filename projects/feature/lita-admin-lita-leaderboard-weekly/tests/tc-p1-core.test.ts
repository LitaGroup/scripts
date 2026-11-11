/**
 * 项目 3713「Lita Leaderboard Weekly Data」P1 正式执行：用例 #9、#10（D1-D2）、#11、#13、#14、#15（D1-D3）、#17
 *
 * 用例来源：/api/docs/detail/task/20261111/TK-0204/HANDOFF.md（九列用例，17 条）
 * 技术方案：/api/docs/detail/task/20261111/TK-0204/TECH_DESIGN.md（SK4/SK5/SK6/SK8 / L16-L21）
 * 覆盖：#9 分页边界；#10 空数据周（D1-D2）；#11 重置；#13 水果机汇总回归；#14 送礼详情回归；#15 大区组合（D1-D3）；#17 每页条数切换
 * 数据隔离：BD-0 存量只读；不造数、无写操作、无清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… TMPDIR=<可写目录> node tc-p1-core.test.ts [--evidence-dir=...]
 */
import type { Locator } from 'playwright';
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase, norm } from './lib/admin-base.ts';

const RANK_SEQ = Array.from({ length: 20 }, (_, i) => String(i + 1));
const GIFT_HEADERS = ['Rank', 'Ranking Type', 'Nick', 'Locale', 'No', 'User ID', 'Week', 'Week Range', 'Period', 'Total Coins', 'Order Coins', 'Gift Coins'];
const SPIN_HEADERS = ['P&L', 'RTP', 'Details', 'Dismantle', 'Top Spending Room'];
const GIFT_SEND_HEADERS = [
  '送礼用户id', '送礼用户no', '送礼用户nick', '接收用户id', '接收用户no', '接收用户nick',
  '礼物id', '礼物所属分类id', '礼物名称', '礼物类型', '礼物架', '礼物单价', '个数',
  '花费总币数', '房间id', '房间名称', '语言区', '服务完成时间'
];

class P1CoreTest extends AdminBase {
  constructor() {
    super('lita-leaderboard-weekly-p1');
    this.total = 43;
  }

  private async loginAndReport(): Promise<void> {
    await this.login();
    await this.openReportRoute();
  }

  private async openGiftWeek(): Promise<void> {
    await this.openReportRoute();
    await this.setDate('Week', '2026-11-08');
    await this.pickOption('Ranking Type', 'Player Gift Rank');
  }

  private ranks(rows: string[][]): string[] {
    return rows.map((r) => norm(r[0] ?? ''));
  }

  private async clickDisabled(locator: Locator): Promise<string> {
    try {
      await locator.click({ timeout: 2000 });
      return '点击事件已触发';
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not enabled') || msg.includes('disabled') || msg.includes('Timeout')) return '按钮禁用，点击被可操作性检查拒绝';
      throw e;
    }
  }

  protected async run(): Promise<void> {
    // ================= 用例#9 分页导航 =================
    await this.loginAndReport();
    await this.openGiftWeek();
    this.armToast().catch(() => undefined);
    const setup9 = await this.clickQuery();
    const total9 = await this.totalText();
    const page1Rows = await this.tableRows();
    await this.shot('case9-page1');

    await this.goPage(2);
    const page2Rows = await this.tableRows();
    await this.check('用例#9-① 点击页码 2 后页码 2 高亮，列表 20 行', async (): Promise<CheckResult> => {
      const active = await this.activePage();
      return { expect: '页码 2 高亮；20 行', real: `高亮=${active}；行数=${page2Rows.length}；查询HTTP=${setup9}`, pass: active === '2' && page2Rows.length === 20 };
    });

    await this.jumpToPage(4);
    const page4Rows = await this.tableRows();
    const page4Print = this.fingerprint(page4Rows);
    await this.check('用例#9-② 跳页输入 4 后页码 4 高亮，列表 20 行', async (): Promise<CheckResult> => {
      const active = await this.activePage();
      return { expect: '页码 4 高亮；20 行', real: `高亮=${active}；行数=${page4Rows.length}`, pass: active === '4' && page4Rows.length === 20 };
    });

    await this.goPage(1);
    const back1Rows = await this.tableRows();
    const state1 = await this.paginationState();
    await this.check('用例#9-③ 回到页码 1，「上一页」按钮禁用（置灰）', async (): Promise<CheckResult> => {
      const active = await this.activePage();
      return { expect: '页码 1 高亮；上一页禁用', real: `高亮=${active}；上一页禁用=${state1.prevDisabled}`, pass: active === '1' && state1.prevDisabled };
    });

    const prevBtn = this.page!.locator('.el-pagination .btn-prev').first();
    const prevClick = await this.clickDisabled(prevBtn);
    const afterPrevRows = await this.tableRows();
    const afterPrevActive = await this.activePage();
    await this.check('用例#9-④ 点击「上一页」后停留页码 1，列表内容不变', async (): Promise<CheckResult> => {
      const same = this.fingerprint(afterPrevRows) === this.fingerprint(back1Rows);
      return { expect: '页码=1；列表指纹不变', real: `页码=${afterPrevActive}；列表不变=${same}；点击结果=${prevClick}`, pass: afterPrevActive === '1' && same };
    });

    await this.goPage(4);
    const state4 = await this.paginationState();
    await this.check('用例#9-⑤ 点击页码 4 后页码 4 高亮，「下一页」按钮禁用（置灰）', async (): Promise<CheckResult> => {
      const active = await this.activePage();
      return { expect: '页码 4 高亮；下一页禁用', real: `高亮=${active}；下一页禁用=${state4.nextDisabled}`, pass: active === '4' && state4.nextDisabled };
    });

    const nextBtn = this.page!.locator('.el-pagination .btn-next').first();
    const nextClick = await this.clickDisabled(nextBtn);
    const afterNextRows = await this.tableRows();
    const afterNextActive = await this.activePage();
    await this.check('用例#9-⑥ 点击「下一页」后停留页码 4，列表内容不变', async (): Promise<CheckResult> => {
      const same = this.fingerprint(afterNextRows) === this.fingerprint(page4Rows);
      return { expect: '页码=4；列表指纹不变', real: `页码=${afterNextActive}；列表不变=${same}；点击结果=${nextClick}`, pass: afterNextActive === '4' && same };
    });

    const allPages = [page1Rows, page2Rows, page4Rows];
    const typeOk = allPages.every((rows) => rows.every((r) => norm(r[1] ?? '') === 'gift_rank'));
    const weekOk = allPages.every((rows) => rows.every((r) => norm(r[6] ?? '') === '2026-11-02'));
    const total7 = await this.totalText();
    await this.check('用例#9-⑦ 各页 Ranking Type 均为 gift_rank、Week 列均为 2026-11-02（周归一，答复确认），Total 保持 80', async (): Promise<CheckResult> => {
      return { expect: 'Ranking Type=gift_rank；Week 列=2026-11-02（周归一，答复确认）；Total 80', real: `Type一致=${typeOk}；Week一致=${weekOk}；Total=${total7}`, pass: typeOk && weekOk && total7 === 'Total 80' };
    });

    // ================= 用例#10 空数据周（D1-D2） =================
    // 注：2025-01-06 为远期过去周，按技术方案 B5 选择该周验证空态。
    for (const week of ['2026-11-09', '2025-01-06']) {
      const tag = `[数据行${week === '2026-11-09' ? 'D1' : 'D2'}]`;
      await this.openReportRoute();
      await this.setDate('Week', week);
      await this.pickOption('Ranking Type', 'Player Order Rank');
      await this.pickOption('Locale', '印尼语区');
      this.armToast().catch(() => undefined);
      const status = await this.clickQuery();
      const rows = await this.tableRows();
      const empty = await this.emptyText();
      const total = await this.totalText();
      const weekVisible = await this.field('Week').locator('input').first().isVisible().catch(() => false);
      const rankVisible = await this.field('Ranking Type').locator('.el-select').isVisible().catch(() => false);
      const localeVisible = await this.field('Locale').locator('.el-select').isVisible().catch(() => false);
      const queryVisible = await this.page!.getByRole('button', { name: '查询', exact: true }).isVisible().catch(() => false);
      const errors = await this.errorMessageCount();
      await this.shot(`case10-${week}-empty`);

      await this.check(`用例#10-①${tag} 列表 0 行，显示空态提示「暂无数据」`, async (): Promise<CheckResult> => {
        return { expect: '行数=0；空态=暂无数据', real: `HTTP=${status}；行数=${rows.length}；空态=${empty}`, pass: status === 200 && rows.length === 0 && empty.includes('暂无数据') };
      });
      await this.check(`用例#10-②${tag} 分页 Total 0`, async (): Promise<CheckResult> => {
        return { expect: 'Total 0', real: total, pass: total === 'Total 0' };
      });
      await this.check(`用例#10-③${tag} 页面无错误弹窗、无白屏，筛选区与按钮保持可见`, async (): Promise<CheckResult> => {
        const ok = weekVisible && rankVisible && localeVisible && queryVisible && errors === 0;
        return { expect: '筛选区+查询按钮可见；错误提示 0', real: `Week=${weekVisible}，Ranking=${rankVisible}，Locale=${localeVisible}，查询=${queryVisible}，错误提示=${errors}`, pass: ok };
      });
    }

    // ================= 用例#11 重置 =================
    await this.openReportRoute();
    await this.setDate('Week', '2026-11-02');
    await this.pickOption('Ranking Type', 'Player Order Rank');
    await this.pickOption('Locale', '印尼语区');
    this.armToast().catch(() => undefined);
    await this.clickQuery();
    const rowsBeforeReset = await this.rowCount();
    await this.clearToasts();
    const resetToastP = this.armToast();
    const autoQueryP = this.queryFiresWithin(5000);
    await this.clickReset();
    const resetToast = await resetToastP;
    await this.page!.waitForFunction(() => {
      const labels = Array.from(document.querySelectorAll('.query-label'));
      const hit = labels.find((el) => (el.textContent ?? '').includes('Week'));
      const field = hit?.closest('.query-field');
      const el = field?.querySelector('input') as HTMLInputElement | null;
      return !!el && el.value === '';
    }, undefined, { timeout: 10000 }).catch(() => undefined);
    const weekValue = await this.inputValue('Week');
    const rankValue = await this.inputValue('Ranking Type');
    const localeValue = await this.inputValue('Locale');
    const weekPh = await this.placeholder('Week');
    const rankPh = await this.placeholder('Ranking Type');
    const localePh = await this.placeholder('Locale');
    const countText = await this.conditionCountText();
    const empty = await this.emptyText();
    const total = await this.totalText();
    const rowsAfter = await this.rowCount();
    const autoQuery = await autoQueryP;
    await this.shot('case11-after-reset');

    await this.check('用例#11-① 点击重置弹出提示「已重置查询条件」', async (): Promise<CheckResult> => {
      return { expect: '包含 已重置查询条件', real: norm(resetToast), pass: norm(resetToast).includes('已重置查询条件') };
    });
    await this.check('用例#11-② Week/Ranking Type/Locale 均清空并恢复 placeholder', async (): Promise<CheckResult> => {
      const ok = weekValue === '' && rankValue === '' && localeValue === '' &&
        weekPh === '请选择Week' && rankPh === '请选择Ranking Type' && localePh === '请选择Locale';
      return { expect: '三控件清空；placeholder 恢复', real: `值=${weekValue || '∅'}/${rankValue || '∅'}/${localeValue || '∅'}；placeholder=${weekPh}/${rankPh}/${localePh}`, pass: ok };
    });
    await this.check('用例#11-③ 条件计数显示「当前已设置查询条件：0 项」', async (): Promise<CheckResult> => {
      return { expect: '当前已设置查询条件：0 项', real: countText, pass: countText.includes('0 项') };
    });
    await this.check('用例#11-④ 列表清空并显示「请输入查询条件后查看数据」，Total 0', async (): Promise<CheckResult> => {
      const ok = rowsAfter === 0 && empty.includes('请输入查询条件后查看数据') && total === 'Total 0';
      return { expect: '行数=0；提示=请输入查询条件后查看数据；Total 0', real: `重置前行数=${rowsBeforeReset}；重置后行数=${rowsAfter}；提示=${empty}；Total=${total}`, pass: ok };
    });
    await this.check('用例#11-⑤ 不自动重新发起查询（列表不自动出现数据）', async (): Promise<CheckResult> => {
      return { expect: '无 stats/query 自动请求', real: `查询请求出现=${autoQuery}`, pass: !autoQuery };
    });

    // ================= 用例#13 水果机数据-汇总回归 =================
    await this.openByMenu(['数据统计管理', '用户数据'], '水果机数据-汇总', '#/data-stats-manager/user-consumption/game-spin-draw-summary', '用户ID');
    const labels13 = (await this.page!.locator('.query-label').allInnerTexts()).map((t) => norm(t));
    const buttons13 = (await this.page!.locator('.app-main button').allInnerTexts()).map((t) => norm(t)).filter(Boolean);
    await this.setDate('开始日期', '2026-11-01');
    await this.setDate('结束日期', '2026-11-10');
    await this.fillInput('用户ID', '11966854');
    this.armToast().catch(() => undefined);
    const status13 = await this.clickQuery();
    const rows13 = await this.tableRows();
    const total13 = await this.totalText();
    const headers13 = await this.tableHeaders();
    const errors13 = await this.errorMessageCount();
    await this.shot('case13-spin-summary');

    await this.check('用例#13-① 菜单可进入，筛选区「开始日期*/结束日期*/用户ID*」与按钮 查询/重置/导出报表 显示', async (): Promise<CheckResult> => {
      const ok = labels13.join(',') === '开始日期*,结束日期*,用户ID*' &&
        buttons13.includes('查询') && buttons13.includes('重置') && buttons13.includes('导出报表');
      return { expect: '标签=开始日期*/结束日期*/用户ID*；按钮=查询/重置/导出报表', real: `标签=${labels13.join('/')}；按钮=${buttons13.join('/')}`, pass: ok };
    });
    await this.check('用例#13-② 查询返回 1 行，Total 1', async (): Promise<CheckResult> => {
      return { expect: '行数=1；Total 1', real: `HTTP=${status13}；行数=${rows13.length}；Total=${total13}`, pass: status13 === 200 && rows13.length === 1 && total13 === 'Total 1' };
    });
    await this.check('用例#13-③ 结果表显示 P&L/RTP/Details/Dismantle/Top Spending Room 列', async (): Promise<CheckResult> => {
      const ok = headers13.length === 5 && headers13.every((h, i) => h === SPIN_HEADERS[i]);
      return { expect: SPIN_HEADERS.join(' | '), real: headers13.join(' | '), pass: ok };
    });
    await this.check('用例#13-④ 无错误弹窗', async (): Promise<CheckResult> => {
      return { expect: '错误提示 0', real: `错误提示数=${errors13}`, pass: errors13 === 0 };
    });

    // ================= 用例#14 送礼详情回归 =================
    await this.openByMenu(['数据统计管理', '礼物相关数据'], '送礼详情', '#/data-stats-manager/gift-data/gift-send-detail', '房间ID');
    const title14 = norm(await this.page!.getByText('礼物赠送明细查询', { exact: true }).first().innerText().catch(() => ''));
    const labels14 = (await this.page!.locator('.query-label').allInnerTexts()).map((t) => norm(t));
    await this.setDate('开始日期', '2026-10-01');
    await this.setDate('结束日期', '2026-11-10');
    await this.shot('case14-form');
    await this.check('用例#14-① 菜单可进入，页面标题「礼物赠送明细查询」与 7 个筛选标签显示', async (): Promise<CheckResult> => {
      const expectLabels = ['开始日期*', '结束日期*', '送礼用户ID', '接收用户ID', '礼物ID', '语言区', '房间ID'];
      const ok = title14 === '礼物赠送明细查询' && labels14.length === 7 && labels14.every((v, i) => v === expectLabels[i]);
      return { expect: '标题=礼物赠送明细查询；标签=开始日期*/结束日期*/送礼用户ID/接收用户ID/礼物ID/语言区/房间ID', real: `标题=${title14}；标签=${labels14.join('/')}`, pass: ok };
    });

    await this.clearToasts();
    const toast14P = this.armToast();
    const fired14P = this.queryFiresWithin(4000);
    await this.clickQueryNoWait();
    const toast14 = await toast14P;
    const fired14 = await fired14P;
    await this.check('用例#14-② 未填 ID 类条件点击查询提示「送礼用户ID、接收用户ID、礼物ID 至少填写一项」且不发起查询', async (): Promise<CheckResult> => {
      const ok = norm(toast14).includes('送礼用户ID、接收用户ID、礼物ID 至少填写一项') && !fired14;
      return { expect: '提示包含 送礼用户ID、接收用户ID、礼物ID 至少填写一项；无查询请求', real: `提示=${norm(toast14)}；查询请求出现=${fired14}`, pass: ok };
    });

    await this.clearToasts();
    await this.fillInput('送礼用户ID', '11966854');
    this.armToast().catch(() => undefined);
    const status14 = await this.clickQuery();
    const rows14 = await this.tableRows();
    const total14Text = await this.totalText();
    const total14 = Number((total14Text.match(/[\d,]+/) || ['0'])[0].replace(/,/g, ''));
    const pages14 = await this.pagerPages();
    const headers14 = await this.tableHeaders();
    const errors14 = await this.errorMessageCount();
    const lastPageNo = Number(pages14[pages14.length - 1] ?? '0');
    const pagesExpected = Math.ceil(total14 / 20);
    await this.shot('case14-result');

    await this.check('用例#14-③ 查询返回 Total 892 / 45 页 / 第 1 页 20 行（基线漂移，答复确认按实际存量）', async (): Promise<CheckResult> => {
      const ok = status14 === 200 && rows14.length === 20 && total14 === 892 && lastPageNo === 45 && pagesExpected === 45;
      return {
        expect: '按答复确认的实际存量 Total 892、45 页；第 1 页 20 行（文档基线 476/24 已漂移）',
        real: `HTTP=${status14}；Total=${total14}；可见页码=${pages14.join(',')}；末页=${lastPageNo}；按20/页计算页数=${pagesExpected}；第1页行数=${rows14.length}`,
        pass: ok
      };
    });
    await this.check('用例#14-④ 结果表头 18 列与预期一致', async (): Promise<CheckResult> => {
      const ok = headers14.length === 18 && headers14.every((h, i) => h === GIFT_SEND_HEADERS[i]);
      return { expect: GIFT_SEND_HEADERS.join(' | '), real: `${headers14.length} 列：${headers14.join(' | ')}`, pass: ok };
    });
    await this.check('用例#14-⑤ 无错误弹窗', async (): Promise<CheckResult> => {
      return { expect: '错误提示 0', real: `错误提示数=${errors14}`, pass: errors14 === 0 };
    });

    // ================= 用例#15 大区榜单组合（D1-D3） =================
    const combos: Array<{ tag: string; type: string; locale: string | null; total: string; rankMode: 'set' | 'seq' }> = [
      { tag: '[数据行D1]', type: 'Player Order Rank', locale: null, total: 'Total 80', rankMode: 'set' },
      { tag: '[数据行D2]', type: 'User Spend Rank', locale: null, total: 'Total 80', rankMode: 'set' },
      { tag: '[数据行D3]', type: 'Player Gift Rank', locale: '韩国区', total: 'Total 20', rankMode: 'seq' }
    ];
    for (const c of combos) {
      await this.openReportRoute();
      await this.setDate('Week', '2026-11-02');
      await this.pickOption('Ranking Type', c.type);
      if (c.locale) await this.pickOption('Locale', c.locale);
      this.armToast().catch(() => undefined);
      const status = await this.clickQuery();
      const rows = await this.tableRows();
      const total = await this.totalText();
      const locales = Array.from(new Set(this.columnValues(rows, 3)));
      const ranks = this.ranks(rows);
      const rankSetOk = c.rankMode === 'set'
        ? ranks.every((r) => Number(r) >= 1 && Number(r) <= 20)
        : ranks.join(',') === RANK_SEQ.join(',');
      const expectedLocales = c.locale ? ['ko'] : ['in', 'ko', 'ph', 'vi'];
      const localeOk = c.locale
        ? locales.length === 1 && locales[0] === 'ko'
        : expectedLocales.every((l) => locales.includes(l));
      await this.shot(`case15-${c.tag.replace(/[^\w]/g, '')}`);

      await this.check(`用例#15-①${c.tag} 分页 Total 符合预期`, async (): Promise<CheckResult> => {
        return { expect: `${c.total}`, real: `${total}；查询HTTP=${status}`, pass: status === 200 && total === c.total };
      });
      await this.check(`用例#15-②${c.tag} 第 1 页列表 20 行`, async (): Promise<CheckResult> => {
        return { expect: '行数=20', real: `行数=${rows.length}`, pass: rows.length === 20 };
      });
      await this.check(`用例#15-③${c.tag} Locale 列符合预期`, async (): Promise<CheckResult> => {
        return { expect: c.locale ? 'Locale 均为 ko' : 'Locale 含 in/ko/ph/vi', real: `Locale 唯一值=${locales.join(',')}`, pass: localeOk };
      });
      await this.check(`用例#15-④${c.tag} Rank 列符合预期`, async (): Promise<CheckResult> => {
        return { expect: c.rankMode === 'seq' ? 'Rank=1..20' : 'Rank 值域 1-20', real: `Rank 值域=${Math.min(...ranks.map(Number))}-${Math.max(...ranks.map(Number))}；连续=${rankSetOk}`, pass: rankSetOk };
      });
    }

    // ================= 用例#17 每页条数切换 [ASSUMED] =================
    await this.openReportRoute();
    await this.openGiftWeek();
    this.armToast().catch(() => undefined);
    await this.clickQuery();
    const total17Before = await this.totalText();
    await this.switchPageSize(10);
    const rows17 = await this.tableRows();
    const total17 = await this.totalText();
    const pages17 = await this.pagerPages();
    const max17 = await this.page!.locator('.el-pagination__jump input').getAttribute('max').catch(() => '');
    const active17 = await this.activePage();
    const type17 = rows17.every((r) => norm(r[1] ?? '') === 'gift_rank');
    const week17 = rows17.every((r) => norm(r[6] ?? '') === '2026-11-02');
    await this.shot('case17-size-10');

    await this.check('用例#17-① 切换 10/page 后列表变为 10 行', async (): Promise<CheckResult> => {
      return { expect: '行数=10', real: `行数=${rows17.length}`, pass: rows17.length === 10 };
    });
    await this.check('用例#17-② Total 保持 80，页码 1-8 共 8 页', async (): Promise<CheckResult> => {
      const last = pages17[pages17.length - 1];
      const ok = total17Before === 'Total 80' && total17 === 'Total 80' && last === '8' && Number(max17) === 8;
      return { expect: 'Total 80；共 8 页（末页=8，跳页上限=8）', real: `切换前=${total17Before}；切换后=${total17}；可见页码=${pages17.join(',')}；跳页上限=${max17}`, pass: ok };
    });
    await this.check('用例#17-③ 当前页回到第 1 页（页码 1 高亮）', async (): Promise<CheckResult> => {
      return { expect: '高亮=1', real: `高亮=${active17}`, pass: active17 === '1' };
    });
    await this.check('用例#17-④ 各行 Ranking Type 均为 gift_rank、Week 列均为 2026-11-02（周归一，答复确认）', async (): Promise<CheckResult> => {
      return { expect: 'gift_rank；Week 列=2026-11-02（周归一，答复确认）', real: `Type一致=${type17}；Week一致=${week17}`, pass: type17 && week17 };
    });
  }
}

await new P1CoreTest().execute();
