/**
 * 项目 105 / WO-0035：Admin「游戏入口配置」列表与筛选（用例#4~#12）
 * 用例来源：TK-0409 HANDOFF v6 九列用例；技术方案：/task/20261119/TK-0409/TECH_DESIGN（v1.2）
 * 覆盖：#4 默认加载；#5 资料字段显示（数据行A/B）；#6 UID 无结果；#7 重置；#8 UID 精确查询；
 *       #9 添加时间查询；#10 未来日期空结果；#11 组合查询；#12 非法 UID 输入
 * 数据隔离：仅页面级 add/delete；自建 UID（19440456/13365989/8268067/7446886/7433600/7423160）用后页面删除；
 *           存量 1003 条只读，不执行批量/条件删除。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-game-entry-config/tests/tc02-list-filter.test.ts
 */
import { GameEntryBase } from './lib/game-entry-base.ts';
import type { Page } from 'playwright';

const U1 = '19440456';
const EXISTING_WITH_PROFILE = '5519';
const EXISTING_NO_PROFILE = '22518445';
const NONEXIST = '999999999999';

class ListFilterCase extends GameEntryBase {
  constructor() { super('tc02-list-filter'); this.total = 54; }

  private async ensureAbsent(uid: string): Promise<void> {
    await this.queryByUid(uid);
    if ((await this.rowCount()) > 0) {
      await this.deleteFiltered(true);
    }
  }

  private async addUids(text: string) {
    await this.openAddDialog();
    const result = await this.submitAdd(text);
    await this.closeAddDialog();
    return result;
  }

  private async cleanupUid(uid: string): Promise<void> {
    await this.queryByUid(uid);
    if ((await this.rowCount()) > 0) {
      await this.deleteFiltered(true);
    }
  }

  private async enterPage(account: 'qa-ai' | 'qa-noauth' = 'qa-ai'): Promise<Page> {
    const user = account === 'qa-ai' ? (process.env.ADMIN_USERNAME ?? '') : (process.env.NOAUTH_USERNAME ?? 'qa-noauth');
    const pwd = account === 'qa-ai' ? (process.env.ADMIN_PASSWORD ?? '') : (process.env.NOAUTH_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '');
    const page = await this.newSession(user, pwd);
    if (account === 'qa-ai') await this.gotoPageDirect(page);
    return page;
  }

  protected async run(): Promise<void> {
    // ===== 用例#4 默认加载 =====
    await this.act('用例#4 步骤1 登录 qa-ai 并经菜单进入游戏入口配置页面', async () => {
      await this.newSession(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
      await this.openViaMenu(this.page!);
      await this.shot('case4-default-list', true);
    });
    await this.act('用例#4 步骤2 不设置筛选条件等待列表加载完成', async () => {
      await this.waitTableSettled(this.page!);
    });
    await this.check('用例#4-① 不点击查询列表自动显示数据行（默认每页 20 行）', async () => {
      const rows = await this.rowCount();
      return { expect: '20', real: String(rows), pass: rows === 20 };
    });
    await this.check('用例#4-② 分页 Total 显示 Total 1003', async () => {
      const total = await this.totalText();
      return { expect: 'Total 1003', real: total, pass: total === 'Total 1003' };
    });
    await this.check('用例#4-③ 列头依次为勾选框/用户 UID/用户 No/大区/国家/VIP 等级/添加时间/添加人/操作', async () => {
      const h = await this.headers();
      const expect = ['', '用户 UID', '用户 No', '大区', '国家', 'VIP 等级', '添加时间', '添加人', '操作'];
      return { expect: expect.join(' | '), real: h.join(' | '), pass: JSON.stringify(h) === JSON.stringify(expect) };
    });
    await this.check('用例#4-④ 列表第一行添加时间 ≥ 最后一行添加时间（按添加时间倒序）', async () => {
      const rows = await this.rows();
      const first = rows[0]?.[6] ?? '';
      const last = rows[rows.length - 1]?.[6] ?? '';
      return { expect: `首行 ${first} ≥ 末行 ${last}`, real: `${first} / ${last}`, pass: rows.length === 20 && first >= last };
    });
    await this.check('用例#4-⑤ 添加时间格式为 yyyy-MM-dd HH:mm:ss', async () => {
      const rows = await this.rows();
      const times = rows.map((r) => r[6] ?? '');
      const bad = times.filter((t) => !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t));
      return { expect: '20 行时间均为 yyyy-MM-dd HH:mm:ss', real: `异常 ${bad.length} 行: ${bad.slice(0, 3).join(',')}`, pass: times.length === 20 && bad.length === 0 };
    });
    await this.check('用例#4-⑥ 每行操作列显示删除按钮', async () => {
      const n = await this.page!.locator('.el-table__body-wrapper tbody tr td:nth-child(9) button', { hasText: '删除' }).count();
      return { expect: '20', real: String(n), pass: n === 20 };
    });

    // ===== 用例#5 用户资料字段显示（数据行A/B） =====
    await this.act('用例#5 步骤1 进入游戏入口配置页面', async () => {
      await this.enterPage();
    });
    await this.act(`用例#5 步骤2~4 输入 ${EXISTING_WITH_PROFILE} 并查询（数据行A）`, async () => {
      await this.queryByUid(EXISTING_WITH_PROFILE);
      await this.shot('case5-A-profile');
    });
    await this.check(`用例#5[数据行A]-① 列表显示 1 行且用户 UID=${EXISTING_WITH_PROFILE}`, async () => {
      const rows = await this.rows();
      return { expect: `1 行, UID=${EXISTING_WITH_PROFILE}`, real: `rows=${rows.length}, UID=${rows[0]?.[1] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === EXISTING_WITH_PROFILE };
    });
    await this.check('用例#5[数据行A]-② 用户 No/大区/国家/VIP 等级显示该用户资料值', async () => {
      const c = (await this.rows())[0] ?? [];
      const vals = { userNo: c[2], region: c[3], country: c[4], vip: c[5] };
      const ok = !!vals.userNo && !!vals.region && !!vals.country && !!vals.vip;
      return { expect: '用户 No/大区/国家/VIP 等级均非空（如 1375679/印尼(in)/Indonesia/711）', real: JSON.stringify(vals), pass: ok };
    });
    await this.act(`用例#5 步骤5~7 清空并输入 ${EXISTING_NO_PROFILE} 查询（数据行B）`, async () => {
      await this.queryByUid(EXISTING_NO_PROFILE);
      await this.shot('case5-B-no-profile');
    });
    await this.check(`用例#5[数据行B]-③ 列表显示 1 行且用户 UID=${EXISTING_NO_PROFILE}`, async () => {
      const rows = await this.rows();
      return { expect: `1 行, UID=${EXISTING_NO_PROFILE}`, real: `rows=${rows.length}, UID=${rows[0]?.[1] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === EXISTING_NO_PROFILE };
    });
    await this.check('用例#5[数据行B]-④ 用户 No/国家/VIP 等级为空白，大区按实际数据显示', async () => {
      const c = (await this.rows())[0] ?? [];
      const vals = { userNo: c[2] ?? '', region: c[3] ?? '', country: c[4] ?? '', vip: c[5] ?? '' };
      const ok = vals.userNo === '' && vals.country === '' && vals.vip === '' && vals.region !== '';
      return { expect: '用户 No/国家/VIP 为空且大区非空', real: JSON.stringify(vals), pass: ok };
    });

    // ===== 用例#6 UID 不存在查询 =====
    await this.act('用例#6 步骤1 进入游戏入口配置页面', async () => { await this.enterPage(); });
    await this.act(`用例#6 步骤2~3 输入 ${NONEXIST} 并点击查询`, async () => {
      await this.queryByUid(NONEXIST);
      await this.shot('case6-no-data', true);
    });
    await this.check('用例#6-① 列表不显示数据行', async () => {
      const n = await this.rowCount();
      return { expect: '0', real: String(n), pass: n === 0 };
    });
    await this.check('用例#6-② 列表区域显示空态文本 No Data', async () => {
      const e = await this.emptyText();
      return { expect: 'No Data', real: e, pass: e === 'No Data' };
    });
    await this.check('用例#6-③ 分页 Total 显示 Total 0', async () => {
      const t = await this.totalText();
      return { expect: 'Total 0', real: t, pass: t === 'Total 0' };
    });

    // ===== 用例#7 重置 =====
    await this.act('用例#7 步骤1~3 进入页面并构造带条件查询（无结果）', async () => {
      await this.enterPage();
      await this.queryByUid(NONEXIST);
    });
    await this.act('用例#7 步骤4~5 点击重置并查看筛选框与列表', async () => {
      await this.clickReset();
      await this.shot('case7-after-reset', true);
    });
    await this.check('用例#7-① 用户 UID 输入框清空', async () => {
      const v = await this.uidValue();
      return { expect: '', real: v, pass: v === '' };
    });
    await this.check('用例#7-② 添加开始日期/结束日期输入框清空', async () => {
      const [s, e] = await this.dateValues();
      return { expect: '"" / ""', real: `"${s}" / "${e}"`, pass: s === '' && e === '' };
    });
    await this.check('用例#7-③ 列表恢复默认查询结果（20 行、Total 1003）', async () => {
      const [n, t] = [await this.rowCount(), await this.totalText()];
      return { expect: '20 行 / Total 1003', real: `${n} 行 / ${t}`, pass: n === 20 && t === 'Total 1003' };
    });

    // ===== 用例#8 UID 精确查询 =====
    await this.act('用例#8 步骤1 进入游戏入口配置页面', async () => { await this.enterPage(); });
    await this.act(`用例#8 步骤2~3 输入 ${EXISTING_WITH_PROFILE} 并查询`, async () => {
      await this.queryByUid(EXISTING_WITH_PROFILE);
      await this.shot('case8-exact-query', true);
    });
    await this.check(`用例#8-① 列表仅显示 1 行且用户 UID=${EXISTING_WITH_PROFILE}`, async () => {
      const rows = await this.rows();
      return { expect: `1 行, UID=${EXISTING_WITH_PROFILE}`, real: `rows=${rows.length}, UID=${rows[0]?.[1] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === EXISTING_WITH_PROFILE };
    });
    await this.check('用例#8-② 分页 Total 显示 Total 1', async () => {
      const t = await this.totalText();
      return { expect: 'Total 1', real: t, pass: t === 'Total 1' };
    });
    await this.check('用例#8-③ 每页条数选择器保持 20/page 不变', async () => {
      const v = await this.pageSizeValue();
      return { expect: '20/page', real: v, pass: v === '20/page' };
    });

    // ===== 用例#9 添加时间范围查询（起止同日） =====
    await this.act(`用例#9 前置 确认测试 UID ${U1} 不在白名单（残留则页面清理）`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
    });
    await this.act(`用例#9 前置造数 页面添加 ${U1}`, async () => {
      await this.addUids(U1);
    });
    await this.act('用例#9 步骤2~4 选择当天为起止日期并查询', async () => {
      await this.clickReset();
      await this.pickDateRange(this.today, this.today);
      await this.clickQuery();
      await this.shot('case9-date-range', true);
    });
    await this.check(`用例#9-① 列表结果行数>0 且包含 ${U1} 所在行`, async () => {
      const rows = await this.rows();
      const has = rows.some((r) => r[1] === U1);
      return { expect: `含 ${U1}`, real: `rows=${rows.length}, uids=${rows.map((r) => r[1]).join(',')}`, pass: rows.length > 0 && has };
    });
    await this.check('用例#9-② 所有可见行添加时间均为所选日期当天', async () => {
      const rows = await this.rows();
      const bad = rows.map((r) => r[6] ?? '').filter((t) => !t.startsWith(this.today));
      return { expect: `全部以 ${this.today} 开头`, real: `异常 ${bad.length} 行: ${bad.slice(0, 3).join(',')}`, pass: rows.length > 0 && bad.length === 0 };
    });
    await this.check('用例#9-③ 分页 Total 显示该日期范围总数（>0 且 ≤1003）', async () => {
      const t = await this.totalNumber();
      return { expect: '0 < Total ≤ 1003', real: `Total ${t}`, pass: t > 0 && t <= 1003 };
    });
    await this.act(`用例#9 清理 页面删除自建 ${U1}`, async () => {
      await this.cleanupUid(U1);
    });

    // ===== 用例#10 未来日期无匹配 =====
    await this.act('用例#10 步骤1 进入游戏入口配置页面', async () => { await this.enterPage(); });
    await this.act('用例#10 步骤2~3 日期面板切换至 2030 年 1 月并选择 1~2 日', async () => {
      await this.clickReset();
      await this.pickDateRange('2030-01-01', '2030-01-02');
    });
    await this.act('用例#10 步骤4 点击查询', async () => {
      await this.clickQuery();
      await this.shot('case10-future-empty', true);
    });
    await this.check('用例#10-① 列表不显示数据行', async () => {
      const n = await this.rowCount();
      return { expect: '0', real: String(n), pass: n === 0 };
    });
    await this.check('用例#10-② 空态显示 No Data', async () => {
      const e = await this.emptyText();
      return { expect: 'No Data', real: e, pass: e === 'No Data' };
    });
    await this.check('用例#10-③ 分页 Total 显示 Total 0', async () => {
      const t = await this.totalText();
      return { expect: 'Total 0', real: t, pass: t === 'Total 0' };
    });

    // ===== 用例#11 组合查询 =====
    await this.act(`用例#11 前置 确认 ${U1} 不在白名单并页面添加`, async () => {
      await this.enterPage();
      await this.ensureAbsent(U1);
      await this.addUids(U1);
    });
    await this.act('用例#11 步骤2~4 输入 UID 并选择当天为起止日期后查询', async () => {
      await this.clickReset();
      await this.fillUid(U1);
      await this.pickDateRange(this.today, this.today);
      await this.clickQuery();
      await this.shot('case11-combined', true);
    });
    await this.check(`用例#11-① 列表仅显示 1 行且用户 UID=${U1}`, async () => {
      const rows = await this.rows();
      return { expect: `1 行, UID=${U1}`, real: `rows=${rows.length}, UID=${rows[0]?.[1] ?? ''}`, pass: rows.length === 1 && rows[0]?.[1] === U1 };
    });
    await this.check('用例#11-② 分页 Total 显示 Total 1', async () => {
      const t = await this.totalText();
      return { expect: 'Total 1', real: t, pass: t === 'Total 1' };
    });
    await this.act(`用例#11 清理 页面删除自建 ${U1}`, async () => { await this.cleanupUid(U1); });

    // ===== 用例#12 非法 UID 输入 =====
    await this.act('用例#12 步骤1 进入游戏入口配置页面', async () => { await this.enterPage(); });
    await this.act('用例#12 步骤2 在用户 UID 输入框输入 abc', async () => {
      await this.fillUid('abc');
    });
    await this.act('用例#12 步骤3 点击查询并观察页面反馈', async () => {
      await this.clickQuery();
      await this.page!.waitForFunction(() => !!document.querySelector('.el-message__content'), undefined, { timeout: 2000 }).catch(() => undefined);
      await this.drainMessages();
      await this.shot('case12-invalid-uid', true);
    });
    await this.check('用例#12-① 页面显示参数错误的中文提示（明确 UID 非法语义）', async () => {
      const body = await this.bodyText();
      const toast = (await this.page!.locator('.el-message').allInnerTexts()).join(' / ');
      const hit = /(参数错误|格式错误|非法|请输入[^。]{0,10}(数字|UID))/i.test(`${toast} || ${body}`);
      return { expect: '显示 UID 非法/参数错误中文提示', real: `toast=「${toast}」; bodyHasError=${hit}`, pass: hit };
    });
    await this.check('用例#12-② 列表不显示未筛选的全量默认结果（非法条件不被忽略）', async () => {
      const n = await this.rowCount();
      const t = await this.totalNumber();
      const full = n === 20 && t === 1003;
      return { expect: '列表非全量默认结果（非 20 行 / Total≠1003）', real: `${n} 行 / Total ${t}`, pass: !full };
    });
    await this.check('用例#12-③ 分页 Total 不显示全量总数', async () => {
      const t = await this.totalText();
      return { expect: 'Total ≠ Total 1003', real: t, pass: t !== 'Total 1003' };
    });
  }
}

await new ListFilterCase().execute();
