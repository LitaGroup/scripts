/**
 * 项目139 / 审核-提现-查询：新增【成为陪玩师时间】列（真实页面 + 接口 + 只读 DB 抽样核对）
 *
 * 覆盖：
 * 1. 新列位于【上次提现时间】之后；
 * 2. 值格式 yyyy-MM-dd HH:mm:ss，空值显示 -；
 * 3. 页面展示值 = /api/withdraw 返回的 becomePlayerTime = user_profile.become_player_time；
 * 4. 既有分页、陪玩师ID筛选、状态筛选可用；
 * 5. 批量审核按钮/勾选交互仍在（本次不执行实际审核，遵守数据限制）。
 *
 * 运行：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** LITA_USER_TOKEN=*** \
 *   node projects/feature/lita-admin-139-batch-delete/tests/withdraw-become-player-time.test.ts
 */
import { AdminBase, cst } from './lib/admin-base.ts';

const DATE_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function dbDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.replace('T', ' ').slice(0, 19);
  return cst(value as any);
}

class WithdrawBecomePlayerTime extends AdminBase {
  constructor() {
    super('withdraw-become-player-time');
    this.total = 8;
  }

  private async withdrawApi(query: string): Promise<any> {
    const response = await this.api(`/api/withdraw?${query}`);
    if (String(response.json?.status) !== '0') throw new Error(`/api/withdraw 失败: ${response.json?.msg}`);
    return response.json.data;
  }

  /** 直接读取主表 DOM 单元格，规避 Element UI 分页/固定列重渲染导致的 locator 抖动 */
  private async cellTexts(columnIndex: number, limit?: number): Promise<string[]> {
    return this.p.evaluate(({ columnIndex, limit }) => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      const rows = Array.from(table.querySelectorAll('.el-table__body-wrapper tbody tr.el-table__row'));
      const size = limit && limit > 0 ? limit : rows.length;
      return rows.slice(0, size).map((tr) => ((tr.children[columnIndex] as HTMLElement)?.innerText ?? '').trim());
    }, { columnIndex, limit: limit ?? 0 });
  }

  private async cellAt(rowIndex: number, columnIndex: number): Promise<string> {
    return this.p.evaluate(({ rowIndex, columnIndex }) => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      const row = table.querySelectorAll('.el-table__body-wrapper tbody tr.el-table__row')[rowIndex] as HTMLElement | undefined;
      return (row?.children[columnIndex] as HTMLElement)?.innerText?.trim() ?? '';
    }, { rowIndex, columnIndex });
  }

  private async waitList(min = 1, timeout = 30000): Promise<number> {
    const started = Date.now();
    let count = 0;
    while (Date.now() - started < timeout) {
      count = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.list?.length ?? 0);
      if (count >= min) return count;
      await this.p.waitForTimeout(300);
    }
    throw new Error(`等待列表数据 >= ${min} 超时，当前 ${count}`);
  }

  async run(): Promise<void> {
    await this.act('管理员真实登录并获取本次会话 token', async () => {
      await this.login();
    });

    await this.act('打开提现查询：定位新列并校验列位置', async () => {
      await this.open('/review/withdrawal', '.app-container');
      await this.waitList(1);
      const headers = await this.p.locator('.app-container .el-table__header-wrapper').first().locator('th').allInnerTexts();
      const lastIndex = headers.findIndex((text) => text.trim() === '上次提现时间');
      const becomeIndex = headers.findIndex((text) => text.trim() === '成为陪玩师时间');
      this.log(`表头索引: 上次提现时间=${lastIndex}, 成为陪玩师时间=${becomeIndex}, 表头数=${headers.length}`);
      await this.shot('提现列表-新列位置');
      if (lastIndex < 0 || becomeIndex < 0) throw new Error('未找到上次提现时间或成为陪玩师时间列');
      if (becomeIndex !== lastIndex + 1) throw new Error(`新列未紧跟上次提现时间: last=${lastIndex}, become=${becomeIndex}`);
      const rows = await this.waitList(1);
      this.log(`列表行数=${rows}`);
      if (rows < 1) throw new Error('提现列表无数据');
    });

    await this.act('校验列展示格式与空值占位', async () => {
      const headers = await this.p.locator('.app-container .el-table__header-wrapper').first().locator('th').allInnerTexts();
      const columnIndex = headers.findIndex((text) => text.trim() === '成为陪玩师时间');
      const listSize = await this.waitList(1);
      const values = await this.cellTexts(columnIndex, listSize);
      const valid = values.filter((value) => DATE_TIME.test(value));
      const dash = values.filter((value) => value === '-');
      this.log(`样本=${JSON.stringify(values.slice(0, 8))}，合法格式=${valid.length}，空值-=${dash.length}`);
      await this.shot('提现列表-新列格式与空值');
      for (const value of values) {
        if (value !== '-' && !DATE_TIME.test(value)) throw new Error(`存在不符合 yyyy-MM-dd HH:mm:ss 的值: ${JSON.stringify(value)}`);
      }
      if (valid.length === 0) throw new Error('当前页没有可校验的非空成为陪玩师时间');
      if (dash.length === 0) this.log('提示：当前页未出现空值 -，将在接口/DB 层补充空值校验');
    });

    await this.act('页面展示值与 /api/withdraw 返回值逐行比对（抽样前 10 行）', async () => {
      const headers = await this.p.locator('.app-container .el-table__header-wrapper').first().locator('th').allInnerTexts();
      const columnIndex = headers.findIndex((text) => text.trim() === '成为陪玩师时间');
      const pageSize = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.pageSize);
      const data = await this.withdrawApi(`source=1&page=1&rows=${pageSize}`);
      const apiRows: any[] = data.data ?? [];
      const pageRows = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.list?.length ?? 0);
      if (apiRows.length !== pageRows) throw new Error(`接口行数 ${apiRows.length} 与页面数据行数 ${pageRows} 不一致`);
      for (let i = 0; i < Math.min(10, apiRows.length); i++) {
        const displayed = await this.cellAt(i, columnIndex);
        const expected = cst(apiRows[i].becomePlayerTime);
        if (displayed !== expected) throw new Error(`第 ${i + 1} 行展示 ${displayed} 与接口 ${expected} 不一致（userId=${apiRows[i].userId}）`);
      }
      this.log('页面与接口前 10 行一致');
      await this.shot('提现列表-页面与接口比对');
    });

    await this.act('只读 DB 抽样：页面/接口值与 user_profile.become_player_time 一致', async () => {
      const headers = await this.p.locator('.app-container .el-table__header-wrapper').first().locator('th').allInnerTexts();
      const columnIndex = headers.findIndex((text) => text.trim() === '成为陪玩师时间');
      const pageSize = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.pageSize);
      const data = await this.withdrawApi(`source=1&page=1&rows=${pageSize}`);
      const apiRows: any[] = data.data ?? [];
      const nonNull = apiRows.find((row) => row.becomePlayerTime !== null && row.becomePlayerTime !== undefined);
      const nullRow = apiRows.find((row) => row.becomePlayerTime === null || row.becomePlayerTime === undefined);
      if (!nonNull) throw new Error('接口当前页缺少非空样本');
      const ids = [nonNull.userId, ...(nullRow ? [nullRow.userId] : [])];
      const dbRows = await this.dbQuery(`select id, become_player_time from user_profile where id in (${ids.join(',')})`);
      const byId = new Map(dbRows.map((row) => [String(row.id), row.become_player_time]));
      const nonNullIndex = apiRows.indexOf(nonNull);
      const displayed = await this.cellAt(nonNullIndex, columnIndex);
      const dbValue = dbDate(byId.get(String(nonNull.userId)));
      const apiValue = cst(nonNull.becomePlayerTime);
      this.log(`样本 userId=${nonNull.userId} 页面=${displayed} 接口=${apiValue} DB=${dbValue}`);
      await this.shot('提现列表-DB抽样比对');
      if (displayed !== apiValue) throw new Error('页面非空样本与接口值不一致');
      if (dbValue !== apiValue) throw new Error(`接口值与 user_profile 不一致: api=${apiValue}, db=${dbValue}`);
      if (nullRow) {
        const nullIndex = apiRows.indexOf(nullRow);
        const nullDisplayed = await this.cellAt(nullIndex, columnIndex);
        const dbNull = dbDate(byId.get(String(nullRow.userId)));
        this.log(`空值样本 userId=${nullRow.userId} 页面=${nullDisplayed} DB=${dbNull}`);
        if (nullDisplayed !== '-') throw new Error('接口空值在页面未展示为 -');
        if (dbNull !== '-') throw new Error('接口返回空值但 user_profile.become_player_time 非空');
      } else {
        this.log('当前页无空值样本；空值展示规则已由页面格式断言覆盖：空值需展示 -');
      }
    });

    await this.act('既有分页可用：翻页后列表与接口一致', async () => {
      const headers = await this.p.locator('.app-container .el-table__header-wrapper').first().locator('th').allInnerTexts();
      const columnIndex = headers.findIndex((text) => text.trim() === '成为陪玩师时间');
      const beforeId = await this.p.evaluate(() => String((document.querySelector('.app-container') as any).__vue__.list?.[0]?.id ?? ''));
      await this.p.locator('.el-pagination .btn-next').click();
      const started = Date.now();
      let afterId = beforeId;
      while (Date.now() - started < 15000) {
        const state = await this.p.evaluate(() => {
          const vm = (document.querySelector('.app-container') as any).__vue__;
          return { page: vm.currentPage, id: String(vm.list?.[0]?.id ?? '') };
        });
        if (state.page === 2 && state.id !== beforeId) {
          afterId = state.id;
          break;
        }
        await this.p.waitForTimeout(300);
      }
      const before = JSON.stringify(beforeId);
      const after = JSON.stringify(afterId);
      const pageSize = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.pageSize);
      const data = await this.withdrawApi(`source=1&page=2&rows=${pageSize}`);
      const apiRows: any[] = data.data ?? [];
      if (apiRows.length === 0) throw new Error('第 2 页接口无数据');
      const displayed = await this.cellAt(0, columnIndex);
      const expected = cst(apiRows[0].becomePlayerTime);
      this.log(`翻页前首条ID=${before}；翻页后首条ID=${after}`);
      await this.shot('提现列表-第2页');
      if (before === after) throw new Error(`点击下一页后首行未变化（15s 内未完成第2页渲染）`);
      if (displayed !== expected) throw new Error(`第 2 页展示 ${displayed} 与接口 ${expected} 不一致`);
    });

    await this.act('既有筛选可用：按陪玩师ID搜索', async () => {
      const pageSize = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.pageSize);
      const data = await this.withdrawApi(`source=1&page=1&rows=${pageSize}`);
      const sample = (data.data ?? [])[0];
      if (!sample) throw new Error('缺少筛选样本');
      const uid = String(sample.userId);
      await this.p.locator('.app-container input[placeholder="陪玩师ID"]').fill(uid);
      await this.button('搜索').click();
      await this.p.waitForTimeout(1500);
      const started = Date.now();
      let filtered: any[] = [];
      while (Date.now() - started < 15000) {
        filtered = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.list ?? []);
        if (filtered.length > 0 && filtered.every((row: any) => String(row.userId) === uid)) break;
        await this.p.waitForTimeout(300);
      }
      this.log(`按 userId=${uid} 筛选后行数=${filtered.length}`);
      await this.shot('提现列表-按陪玩师ID筛选');
      if (filtered.length < 1) throw new Error('按陪玩师ID筛选后无数据');
      if (!filtered.every((row: any) => String(row.userId) === uid)) throw new Error(`筛选结果包含非 userId=${uid} 的数据`);
      await this.button('重置筛选项').click();
      await this.p.waitForTimeout(1500);
      await this.waitList(2);
    });

    await this.act('既有批量审核入口回归：状态筛选 + 勾选启用（不执行实际审核）', async () => {
      await this.button('重置筛选项').click();
      await this.p.waitForTimeout(1200);
      await this.p.locator('.app-container .el-select').first().click();
      const option = this.p.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: '待审核' }).first();
      await option.waitFor({ state: 'visible', timeout: 10000 });
      await option.click();
      await this.waitList(1);
      await this.p.waitForTimeout(500);
      const reject = this.button('批量拒绝');
      const pass = this.button('通过');
      if (!(await reject.isVisible()) && !(await pass.isVisible())) throw new Error('待审核状态未展示批量审核按钮');
      const beforeDisabled = await reject.isDisabled().catch(() => true);
      await this.p.locator('.app-container .el-table__fixed .el-table__fixed-body-wrapper tbody tr.el-table__row').first().locator('.el-checkbox').first().click();
      await this.p.waitForTimeout(300);
      const afterDisabled = await reject.isDisabled().catch(() => true);
      this.log(`批量拒绝按钮：勾选前禁用=${beforeDisabled}，勾选后禁用=${afterDisabled}`);
      await this.shot('提现列表-批量审核勾选态');
      if (!beforeDisabled) throw new Error('未勾选时批量拒绝按钮未禁用');
      if (afterDisabled) throw new Error('勾选后批量拒绝按钮仍禁用');
      // 遵守测试数据限制：仅验证入口与禁用态，不执行审核动作
      await this.clearAllSelection();
      await this.button('重置筛选项').click();
      await this.waitList(2);
    });
  }
}

await new WithdrawBecomePlayerTime().execute();
