/**
 * 项目3718 / Admin 直播PK场次数据：筛选校验、空态与重置（用例 #4、#5、#9、#10、#12）
 * 用例来源：/task/20261111/TK-0209/HANDOFF；技术方案：/task/20261111/TK-0209/TECH_DESIGN（SK2、SK4、SK6）
 * 覆盖：#4 缺开始日期（5）；#5 缺结束日期（5）；#9 韩国区+2026-10 空态（5）；#10 ID+NO 无交集空态（5）；#12 重置（6）
 * 数据隔离：纯查询，不造数；不修改任何业务数据。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc02-filter.test.ts
 */
import { AdminBase } from './lib/admin-base.ts';

const HASH = '/data-stats-manager/live-data/live-pk-player-detail';

class FilterTest extends AdminBase {
  constructor() {
    super('live-pk-filter');
    this.total = 26;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.openReport(HASH);

    // 用例#4：只填结束日期 + 大区
    await this.act('用例#4 步骤：结束日期=2026-11-10、大区=印尼语区，点击查询', async () => {
      await this.setDate('结束日期', '2026-11-10');
      await this.pickOption('大区', '印尼语区');
    });
    let noQuery = this.watchQuery(2500);
    await this.act('用例#4 步骤：点击「查询」', async () => {
      await this.page!.getByRole('button', { name: '查询', exact: true }).click();
      await this.page!.locator('.el-message').last().waitFor({ state: 'visible', timeout: 10000 });
    });
    let msg = await this.messageText();
    await this.check('用例#4-① 出现提示「请选择开始日期」', async () => ({ expect: '请选择开始日期', real: msg, pass: msg === '请选择开始日期' }));
    await this.shot('用例#4-①');
    await this.check('用例#4-② 表格区保持「请输入查询条件后查看数据」', async () => {
      const text = await this.emptyText();
      return { expect: '请输入查询条件后查看数据', real: text, pass: text === '请输入查询条件后查看数据' };
    });
    await this.shot('用例#4-②');
    await this.check('用例#4-③ 表格无数据行', async () => {
      const rows = await this.rowCount();
      return { expect: '0', real: String(rows), pass: rows === 0 };
    });
    await this.shot('用例#4-③');
    await this.check('用例#4-④ 分页显示 Total 0', async () => {
      const total = await this.totalText();
      return { expect: 'Total 0', real: total, pass: total === 'Total 0' };
    });
    await this.shot('用例#4-④');
    await this.check('用例#4-⑤ 未发起查询：无查询请求、无 loading、无「查询完成」提示', async () => {
      const fired = await noQuery;
      const loading = await this.page!.locator('.el-loading-mask:visible').count();
      const success = await this.page!.locator('.el-message', { hasText: '查询完成' }).count();
      return { expect: 'queryRequest=false|loading=0|查询完成=0', real: `queryRequest=${fired}|loading=${loading}|查询完成=${success}`, pass: !fired && loading === 0 && success === 0 };
    });
    await this.shot('用例#4-⑤');

    // 用例#5：只填开始日期 + 大区
    await this.act('用例#5 步骤：重置后开始日期=2026-11-01、大区=印尼语区', async () => {
      await this.clickReset();
      await this.page!.locator('.el-table__empty-text').waitFor({ state: 'visible', timeout: 10000 });
      await this.setDate('开始日期', '2026-11-01');
      await this.pickOption('大区', '印尼语区');
    });
    noQuery = this.watchQuery(2500);
    await this.act('用例#5 步骤：点击「查询」', async () => {
      await this.page!.getByRole('button', { name: '查询', exact: true }).click();
      await this.page!.locator('.el-message').last().waitFor({ state: 'visible', timeout: 10000 });
    });
    msg = await this.messageText();
    await this.check('用例#5-① 出现提示「请选择结束日期」', async () => ({ expect: '请选择结束日期', real: msg, pass: msg === '请选择结束日期' }));
    await this.shot('用例#5-①');
    await this.check('用例#5-② 表格区保持「请输入查询条件后查看数据」', async () => {
      const text = await this.emptyText();
      return { expect: '请输入查询条件后查看数据', real: text, pass: text === '请输入查询条件后查看数据' };
    });
    await this.shot('用例#5-②');
    await this.check('用例#5-③ 表格无数据行', async () => {
      const rows = await this.rowCount();
      return { expect: '0', real: String(rows), pass: rows === 0 };
    });
    await this.shot('用例#5-③');
    await this.check('用例#5-④ 分页显示 Total 0', async () => {
      const total = await this.totalText();
      return { expect: 'Total 0', real: total, pass: total === 'Total 0' };
    });
    await this.shot('用例#5-④');
    await this.check('用例#5-⑤ 未发起查询：无查询请求、无 loading、无「查询完成」提示', async () => {
      const fired = await noQuery;
      const loading = await this.page!.locator('.el-loading-mask:visible').count();
      const success = await this.page!.locator('.el-message', { hasText: '查询完成' }).count();
      return { expect: 'queryRequest=false|loading=0|查询完成=0', real: `queryRequest=${fired}|loading=${loading}|查询完成=${success}`, pass: !fired && loading === 0 && success === 0 };
    });
    await this.shot('用例#5-⑤');

    // 用例#9：韩国区 + 2026-10 空态
    await this.act('用例#9 步骤：查询 2026-10-01~2026-10-31 + 韩国区', async () => {
      await this.clickReset();
      await this.setDate('开始日期', '2026-10-01');
      await this.setDate('结束日期', '2026-10-31');
      await this.pickOption('大区', '韩国区');
      await this.clickQuery();
    });
    msg = await this.messageText();
    await this.check('用例#9-① 出现提示「查询完成，共 0 条」', async () => ({ expect: '查询完成，共 0 条', real: msg, pass: msg === '查询完成，共 0 条' }));
    await this.shot('用例#9-①');
    await this.check('用例#9-② 表格显示空态文案「暂无数据」', async () => {
      const text = await this.emptyText();
      return { expect: '暂无数据', real: text, pass: text === '暂无数据' };
    });
    await this.shot('用例#9-②');
    await this.check('用例#9-③ 表格无数据行', async () => {
      const rows = await this.rowCount();
      return { expect: '0', real: String(rows), pass: rows === 0 };
    });
    await this.shot('用例#9-③');
    await this.check('用例#9-④ 分页显示 Total 0', async () => {
      const total = await this.totalText();
      return { expect: 'Total 0', real: total, pass: total === 'Total 0' };
    });
    await this.shot('用例#9-④');
    await this.check('用例#9-⑤ 页面无错误提示', async () => {
      const errors = await this.errorDialogs();
      return { expect: '0', real: `${errors.length}${errors.length ? ':' + errors.join(' / ').slice(0, 100) : ''}`, pass: errors.length === 0 };
    });
    await this.shot('用例#9-⑤');

    // 用例#10：ID ∩ NO 无交集
    await this.act('用例#10 步骤：查询 2026-11-01~11-10 + 印尼语区 + 陪玩师ID=450400 + 陪玩师NO=1', async () => {
      await this.clickReset();
      await this.setDate('开始日期', '2026-11-01');
      await this.setDate('结束日期', '2026-11-10');
      await this.pickOption('大区', '印尼语区');
      await this.fillField('陪玩师ID', '450400');
      await this.fillField('陪玩师NO', '1');
      await this.clickQuery();
    });
    msg = await this.messageText();
    await this.check('用例#10-① 出现提示「查询完成，共 0 条」', async () => ({ expect: '查询完成，共 0 条', real: msg, pass: msg === '查询完成，共 0 条' }));
    await this.shot('用例#10-①');
    await this.check('用例#10-② 表格显示空态文案「暂无数据」', async () => {
      const text = await this.emptyText();
      return { expect: '暂无数据', real: text, pass: text === '暂无数据' };
    });
    await this.shot('用例#10-②');
    await this.check('用例#10-③ 表格无数据行', async () => {
      const rows = await this.rowCount();
      return { expect: '0', real: String(rows), pass: rows === 0 };
    });
    await this.shot('用例#10-③');
    await this.check('用例#10-④ 分页显示 Total 0', async () => {
      const total = await this.totalText();
      return { expect: 'Total 0', real: total, pass: total === 'Total 0' };
    });
    await this.shot('用例#10-④');
    await this.check('用例#10-⑤ 页面无错误提示', async () => {
      const errors = await this.errorDialogs();
      return { expect: '0', real: `${errors.length}${errors.length ? ':' + errors.join(' / ').slice(0, 100) : ''}`, pass: errors.length === 0 };
    });
    await this.shot('用例#10-⑤');

    // 用例#12：查询后重置
    await this.act('用例#12 步骤：查询 2026-11-01~11-10 + 印尼语区 + 陪玩师ID=450400', async () => {
      await this.clickReset();
      await this.setDate('开始日期', '2026-11-01');
      await this.setDate('结束日期', '2026-11-10');
      await this.pickOption('大区', '印尼语区');
      await this.fillField('陪玩师ID', '450400');
      await this.clickQuery();
    });
    await this.page!.locator('.el-message').last().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
    noQuery = this.watchQuery(2500);
    await this.act('用例#12 步骤：点击「重置」', async () => {
      await this.page!.getByRole('button', { name: '重置', exact: true }).click();
      await this.page!.locator('.el-table__empty-text').waitFor({ state: 'visible', timeout: 10000 });
    });
    await this.check('用例#12-① 开始日期、结束日期恢复为空且显示 placeholder', async () => {
      const s = this.queryField('开始日期').locator('input').first();
      const e = this.queryField('结束日期').locator('input').first();
      const sv = await s.inputValue(); const ev = await e.inputValue();
      const sp = await s.getAttribute('placeholder'); const ep = await e.getAttribute('placeholder');
      return { expect: '开始=空/请选择开始日期；结束=空/请选择结束日期', real: `开始=${sv || '空'}/${sp}；结束=${ev || '空'}/${ep}`, pass: sv === '' && ev === '' && sp === '请选择开始日期' && ep === '请选择结束日期' };
    });
    await this.shot('用例#12-①');
    await this.check('用例#12-② 大区恢复未选且显示 placeholder 请选择大区', async () => {
      const i = this.queryField('大区').locator('input').first();
      const v = await i.inputValue(); const p = await i.getAttribute('placeholder');
      return { expect: '空/请选择大区', real: `${v || '空'}/${p}`, pass: v === '' && p === '请选择大区' };
    });
    await this.shot('用例#12-②');
    await this.check('用例#12-③ 陪玩师ID、陪玩师NO 输入框为空', async () => {
      const id = await this.queryField('陪玩师ID').locator('textarea, input').first().inputValue();
      const no = await this.queryField('陪玩师NO').locator('textarea, input').first().inputValue();
      return { expect: 'ID=空|NO=空', real: `ID=${id || '空'}|NO=${no || '空'}`, pass: id === '' && no === '' };
    });
    await this.shot('用例#12-③');
    await this.check('用例#12-④ 表格数据清空并显示「请输入查询条件后查看数据」', async () => {
      const text = await this.emptyText();
      return { expect: '请输入查询条件后查看数据', real: text, pass: text === '请输入查询条件后查看数据' };
    });
    await this.shot('用例#12-④');
    await this.check('用例#12-⑤ 分页显示 Total 0', async () => {
      const total = await this.totalText();
      return { expect: 'Total 0', real: total, pass: total === 'Total 0' };
    });
    await this.shot('用例#12-⑤');
    await this.check('用例#12-⑥ 重置后不自动查询（无请求、无 loading、无「查询完成」提示）', async () => {
      const fired = await noQuery;
      const loading = await this.page!.locator('.el-loading-mask:visible').count();
      const success = await this.page!.locator('.el-message', { hasText: '查询完成' }).count();
      return { expect: 'queryRequest=false|loading=0|查询完成=0', real: `queryRequest=${fired}|loading=${loading}|查询完成=${success}`, pass: !fired && loading === 0 && success === 0 };
    });
    await this.shot('用例#12-⑥');
  }

  private watchQuery(ms: number): Promise<boolean> {
    return this.page!.waitForRequest((r) => r.url().includes('/stats/query'), { timeout: ms }).then(() => true).catch(() => false);
  }
}

new FilterTest().execute();
