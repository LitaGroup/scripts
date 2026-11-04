/**
 * 项目139 / 返工轮次（提测 #36）：通用列表分页规则验证
 *
 * 规则来源：lita-admin-original 根 AGENTS.md「列表与分页」：
 * 1. 增删改或批量操作成功、重新查询、重置筛选、修改每页条数后回到第 1 页，并保留仍然适用的筛选与每页条数；
 * 2. 普通翻页（上一页、下一页、跳页）只改变页码；取消、失败保留原有页码；
 * 3. 列表查询使用请求序号丢弃过期响应，翻页/筛选/操作后刷新等并发场景均适用。
 *
 * 覆盖：
 * A. 广播召人配置
 *   A1. 普通翻页不变（第 2 页仍是第 2 页，数据与接口一致）；
 *   A2. Search（重新查询）回第 1 页；
 *   A3. 修改每页条数回第 1 页；
 *   A4. 第 2 页取消确认：停留原页、勾选保留、不发起删除请求；
 *   A5. 第 2 页删除失败（接口 500）：停留原页、勾选保留、仅 1 条错误提示；
 *   A6. 末页删空成功：回到第 1 页，保留英语区筛选与每页条数；
 *   A7. 删除后刷新未返回时切页：旧响应不覆盖第 2 页（请求序号）。
 * B. 主播认证标识配置
 *   B1. 普通翻页不变；B2. Search 回第 1 页；B3. 修改每页条数回第 1 页；B4. Reset 回第 1 页；
 *   B5. 第 2 页取消：停留原页、勾选保留、不发请求；
 *   B6. 第 2 页删除失败（接口 500）：停留原页、勾选保留、仅 1 条提示；
 *   B7. 末页删空成功：回第 1 页，保留认证类型筛选与每页条数；
 *   B8. 删除后刷新未返回时切换筛选：旧响应不覆盖筛选结果；
 *   B9. 后端 #223：超过末页分页返回 status=0、data=[]。
 *
 * 数据隔离：广播召人仅使用英语区 3 个测试房间；主播认证仅使用认证类型 4（银色主播-普通），
 * 执行前后均校验该范围只有本次测试数据，结束后清理。取消/失败用例不会真正修改数据。
 *
 * 运行（仓库根目录，密码/token 运行时注入）：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** node projects/feature/lita-admin-139-batch-delete/tests/pagination-rules.test.ts
 */
import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { AdminBase, EN_ROOM_IDS, ROLLBACK_TEST_UIDS, CERT_TYPE_SILVER_NORMAL } from './lib/admin-base.ts';

const ROOM_IDS = EN_ROOM_IDS;
const ANCHOR_UIDS = ROLLBACK_TEST_UIDS;

class PaginationRules extends AdminBase {
  private broadCreated: number[] = [];
  private anchorCreatedIds: number[] = [];

  constructor() {
    super('pagination-rules');
    this.total = 18;
  }

  // ---------------- 广播召人配置 ----------------

  private async broadRows(locale?: string, rows = 200): Promise<any[]> {
    const query = locale ? `&locale=${locale}` : '';
    const response = await this.api(`/api/voiceroom/broad/list?page=1&rows=${rows}${query}`);
    return response.json?.data?.data ?? [];
  }

  private async broadRowIds(locale?: string): Promise<number[]> {
    return (await this.broadRows(locale)).map((row: any) => Number(row.roomId));
  }

  private broadRowByRoom(roomId: number) {
    return this.rows().filter({ hasText: String(roomId) }).first();
  }

  private async broadDeleteViaApi(ids: number[]): Promise<void> {
    if (!ids.length) return;
    const response = await this.api('/api/voiceroom/broad/batchDelete', { method: 'POST', body: { roomIds: ids } });
    this.log(`清理广播测试数据 roomIds=${ids.join(',')} 响应=${JSON.stringify(response.json)}`);
  }

  private async importBroadXlsx(roomIds: number[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['房间ID', '优先级', '日广播邀请人数']);
    for (const roomId of roomIds) sheet.addRow([roomId, 12, 30]);
    const file = join(this.evidenceDir, `pagination-broad-import-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(file);

    await this.button('上传模版').click();
    const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '通过文件批量广播召人配置' }).last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await dialog.locator('input[type="file"]').setInputFiles(file);
    await this.p.waitForTimeout(500);
    await this.shot('广播分页-导入文件已选择');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await this.waitToast('上传成功');
    this.broadCreated.push(...roomIds);
    await this.waitListIdle();
  }

  private async selectBroadLocale(label: string): Promise<void> {
    await this.p.locator('.app-container .el-select').first().click();
    await this.p.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: label }).first().click();
  }

  private async setBroadPageSizeViaVm(size: number, page: number): Promise<void> {
    await this.p.evaluate(
      async ({ size, page }) => {
        const vm = (document.querySelector('.app-container') as any).__vue__;
        vm.pageSize = size;
        vm.currentPage = page;
        await vm.fetchData();
      },
      { size, page },
    );
    await this.waitPageActive(page);
  }

  private async setAnchorPageState(rows: number, page: number): Promise<void> {
    await this.p.evaluate(
      async ({ rows, page }) => {
        const vm = (document.querySelector('.app-container') as any).__vue__;
        vm.pageInfo.rows = rows;
        vm.pageInfo.page = page;
        await vm.getList();
      },
      { rows, page },
    );
    await this.waitPageActive(page);
  }

  // ---------------- 主播认证标识配置 ----------------

  private async certRows(type?: number, rows = 100): Promise<any[]> {
    const response = await this.api('/api/anchor/certification/page', {
      method: 'POST',
      body: { page: 1, rows, ...(type ? { certificationType: type } : {}) },
    });
    return response.json?.data?.data ?? [];
  }

  private async certDeleteViaApi(ids: number[]): Promise<void> {
    if (!ids.length) return;
    const response = await this.api('/api/anchor/certification/batchDelete', { method: 'POST', body: { ids } });
    this.log(`清理主播认证测试数据 ids=${ids.join(',')} 响应=${JSON.stringify(response.json)}`);
  }

  private async addAnchorViaUi(uids: number[], content: string): Promise<void> {
    await this.button('新增认证').click();
    const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '认证类型' }).last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await this.fillDialogField('用户ID', uids.join(','), '.el-dialog:visible', 'textarea');
    await this.selectOption('认证类型', '银色主播-普通');
    await this.fillDialogField('认证内容', content);
    await this.setDateField('生效时间', '2026-10-01 00:00:00');
    await this.setDateField('过期时间', '2026-12-31 23:59:59');
    await this.shot(`主播认证分页-新增${uids.length}条`);
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await this.waitToast('添加成功');
    await this.waitPageActive(1).catch(() => undefined);
  }

  private async selectAnchorTypeFilter(): Promise<void> {
    await this.p.locator('.app-container .search-box .el-select').nth(1).click();
    await this.p.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: '银色主播-普通' }).first().click();
  }

  /** 模拟删除接口 500，只作用于目标请求（含预检），不触达后端 */
  private async withMockDeleteFailure(pattern: string, action: () => Promise<void>): Promise<number> {
    let hits = 0;
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
      'content-type': 'application/json',
    };
    const handler = async (route: import('playwright').Route): Promise<void> => {
      const method = route.request().method();
      if (method === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      hits++;
      await route.fulfill({ status: 500, headers: cors, body: JSON.stringify({ status: '1', msg: 'mock batch delete failure' }) });
    };
    await this.p.route(pattern, handler);
    try {
      await action();
    } finally {
      await this.p.unroute(pattern, handler);
    }
    return hits;
  }

  private async checkedRowCount(): Promise<number> {
    return this.rows().locator('.el-checkbox.is-checked').count();
  }

  private async openBroadPage(): Promise<void> {
    await this.open('/voice-room/voice-room-broad-config', '.app-container');
    await this.waitRows(1);
  }

  private async openAnchorPage(): Promise<void> {
    await this.open('/voice-room/anchor-certification', '.app-container');
    await this.waitRows(1);
  }

  private async broadState(): Promise<{ page: number; size: number; locale: string; rows: number; total: number; roomIds: number[] }> {
    return this.p.evaluate(() => {
      const vm = (document.querySelector('.app-container') as any).__vue__;
      return {
        page: vm.currentPage,
        size: vm.pageSize,
        locale: vm.valueLocale,
        rows: vm.list?.length ?? 0,
        total: vm.listTotal,
        roomIds: (vm.list ?? []).map((row: any) => Number(row.roomId)),
      };
    });
  }

  private async anchorState(): Promise<{ page: number; size: number; total: number; type: string; userId: string; rows: number; userIds: number[] }> {
    return this.p.evaluate(() => {
      const vm = (document.querySelector('.app-container') as any).__vue__;
      return {
        page: vm.pageInfo?.page,
        size: vm.pageInfo?.rows,
        total: vm.pageInfo?.total,
        type: vm.searchForm?.certificationType ?? '',
        userId: vm.searchForm?.userId ?? '',
        rows: vm.tableData?.length ?? 0,
        userIds: (vm.tableData ?? []).map((row: any) => Number(row.userId)),
      };
    });
  }

  private async reloadBroad(): Promise<void> {
    await this.p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.p.waitForSelector('.app-container', { timeout: 45000 });
    await this.waitRows(1);
    await this.waitListIdle();
  }

  private async reloadAnchor(): Promise<void> {
    await this.p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.p.waitForSelector('.app-container', { timeout: 45000 });
    await this.waitRows(1);
    await this.waitListIdle();
  }

  async run(): Promise<void> {
    try {
      await this.act('管理员真实登录并获取本次会话 token', async () => {
        await this.login();
      });

      // ============ A. 广播召人配置 ============

      await this.act('广播召人：前置检查并导入英语区 3 条测试数据', async () => {
        await this.openBroadPage();
        const ids = await this.broadRowIds('en');
        this.log(`英语区现有广播召人配置 roomIds=${ids.join(',') || '无'}`);
        const foreignBroad = ids.filter((id) => !ROOM_IDS.includes(id));
        if (foreignBroad.length > 0) throw new Error(`英语区存在非本次测试数据（roomIds=${foreignBroad.join(',')}），为保护数据停止执行`);
        if (ids.length > 0) {
          // 上次异常中断可能残留本次测试数据，按白名单清理后重新导入
          await this.broadDeleteViaApi(ids);
          // 刷新页面，确保列表状态与清理后的数据一致
          await this.reloadBroad();
        }
        const total = Number((await this.api('/api/voiceroom/broad/list?page=1&rows=1')).json?.data?.total ?? 0);
        this.log(`广播召人全量记录数=${total}`);
        if (total < 10) throw new Error(`列表总数 ${total} 不足以验证分页（需 > 10）`);
        await this.importBroadXlsx(ROOM_IDS);
        const all = Number((await this.api('/api/voiceroom/broad/list?page=1&rows=1')).json?.data?.total ?? 0);
        if (all <= 20) throw new Error(`导入后总记录数 ${all} 仍未超过默认每页 20，无法验证分页组件`);
      });

      await this.act('广播召人：普通翻页不变（第 2 页仍是第 2 页，数据与接口一致）', async () => {
        await this.gotoPage(2);
        const state = await this.broadState();
        const page2Rows = await this.rowCount();
        const expected = (await this.api('/api/voiceroom/broad/list?page=2&rows=20')).json?.data?.data ?? [];
        const expectedIds = expected.map((row: any) => Number(row.roomId));
        const pageIds: number[] = [];
        for (let i = 0; i < page2Rows; i++) pageIds.push(Number((await this.rows().nth(i).locator('td').nth(1).innerText()).trim()));
        await this.shot('广播分页-普通翻页第2页');
        this.log(`普通翻页后 state=${JSON.stringify(state)} ids=${pageIds.join(',')}`);
        if (state.page !== 2) throw new Error(`普通翻页后页码应保持 2: ${JSON.stringify(state)}`);
        if (state.size !== 20) throw new Error(`普通翻页不应改变每页条数: ${JSON.stringify(state)}`);
        if (JSON.stringify(pageIds) !== JSON.stringify(expectedIds)) throw new Error(`第 2 页数据与接口不一致: 页面=${pageIds.join(',')} 接口=${expectedIds.join(',')}`);
      });

      await this.act('广播召人：Search 重新查询回第 1 页', async () => {
        await this.button('Search').click();
        await this.waitPageActive(1);
        const state = await this.broadState();
        await this.shot('广播分页-Search回第1页');
        if (state.page !== 1) throw new Error(`Search 后应回第 1 页: ${JSON.stringify(state)}`);
        if (state.size !== 20) throw new Error(`Search 后每页条数应保留 20: ${JSON.stringify(state)}`);
      });

      await this.act('广播召人：修改每页条数回第 1 页', async () => {
        await this.gotoPage(2);
        await this.changePageSize(10);
        const state = await this.broadState();
        await this.shot('广播分页-修改每页条数回第1页');
        this.log(`修改条数后 state=${JSON.stringify(state)}`);
        if (state.page !== 1) throw new Error(`修改每页条数后应回第 1 页: ${JSON.stringify(state)}`);
        if (state.size !== 10) throw new Error(`每页条数未生效: ${JSON.stringify(state)}`);
        await this.gotoPage(2);
      });

      await this.act('广播召人：第 2 页取消确认，停留原页、勾选保留、不发起删除', async () => {
        const beforeCalls = this.calls.filter((call) => call.url.includes('/api/voiceroom/broad/batchDelete')).length;
        await this.clearAllSelection();
        await this.selectRow(0);
        await this.shot('广播分页-第2页勾选1条');
        await this.button('批量删除').click();
        const text = await this.waitConfirmDialog();
        this.log(`第2页取消确认文案=${text}`);
        await this.cancelBox();
        await this.p.waitForTimeout(400);
        const state = await this.broadState();
        const afterCalls = this.calls.filter((call) => call.url.includes('/api/voiceroom/broad/batchDelete')).length;
        const checked = await this.checkedRowCount();
        await this.shot('广播分页-取消后停留第2页');
        if (state.page !== 2) throw new Error(`取消后页码应保持第 2 页: ${JSON.stringify(state)}`);
        if (afterCalls !== beforeCalls) throw new Error('取消确认后仍发起了批量删除请求');
        if (checked < 1) throw new Error('取消确认后勾选被清空');
      });

      await this.act('广播召人：第 2 页删除失败，停留原页、勾选保留、仅提示 1 次', async () => {
        await this.clearToasts();
        let hits = 0;
        hits = await this.withMockDeleteFailure('**/api/voiceroom/broad/batchDelete', async () => {
          await this.button('批量删除').click();
          await this.waitConfirmDialog();
          await this.confirmBox();
          await this.p.waitForTimeout(800);
        });
        const messages = await this.toastTexts();
        const state = await this.broadState();
        const checked = await this.checkedRowCount();
        await this.shot('广播分页-删除失败停留第2页');
        this.log(`失败注入命中=${hits} 提示=${JSON.stringify(messages)} state=${JSON.stringify(state)} checked=${checked}`);
        if (hits !== 1) throw new Error(`失败注入应命中 1 次请求，实际 ${hits}`);
        if (state.page !== 2) throw new Error(`删除失败后页码应保持第 2 页: ${JSON.stringify(state)}`);
        if (checked < 1) throw new Error('删除失败后勾选被清空');
        if (messages.length !== 1) throw new Error(`删除失败应只提示 1 次，实际 ${messages.length} 条: ${JSON.stringify(messages)}`);
      });

      await this.act('广播召人：末页删空成功回到第 1 页，保留筛选与每页条数', async () => {
        await this.clearToasts();
        await this.clearAllSelection();
        // 组件状态置 2 条/页（此时分页组件可见，避免单页隐藏后重建问题），再过滤英语区
        await this.setBroadPageSizeViaVm(2, 1);
        await this.selectBroadLocale('英语区');
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(2);
        const enState = await this.broadState();
        if (enState.total !== 3) throw new Error(`英语区测试数据应为 3 条，实际 ${enState.total}`);
        await this.gotoPage(2);
        const page2Rows = await this.rowCount();
        if (page2Rows !== 1) throw new Error(`英语区末页应仅 1 行，实际 ${page2Rows}`);
        await this.shot('广播分页-英语区末页第2页');
        const lastRoomId = Number((await this.rows().first().locator('td').nth(1).innerText()).trim());
        await this.selectRow(0);
        await this.button('批量删除').click();
        await this.waitConfirmDialog();
        await this.confirmBox();
        const toast = await this.waitToast('成功删除1条数据');
        await this.waitPageActive(1);
        const state = await this.broadState();
        const expected = (await this.api('/api/voiceroom/broad/list?page=1&rows=2&locale=en')).json?.data?.data ?? [];
        const expectedIds = expected.map((row: any) => Number(row.roomId));
        await this.shot('广播分页-末页删除后回第1页');
        this.log(`成功提示=${toast} 删除后=${JSON.stringify(state)} 接口=${expectedIds.join(',')}`);
        if (state.page !== 1) throw new Error(`批量删除成功后未回第 1 页: ${JSON.stringify(state)}`);
        if (state.size !== 2) throw new Error(`每页条数未保留: ${JSON.stringify(state)}`);
        if (state.locale !== 'en') throw new Error(`筛选条件未保留: ${JSON.stringify(state)}`);
        if (state.rows !== 2 || state.total !== 2) throw new Error(`第 1 页数据应为 2 条: ${JSON.stringify(state)}`);
        if (state.roomIds.includes(lastRoomId)) throw new Error(`末页删除的 roomId=${lastRoomId} 仍存在`);
        if (JSON.stringify(state.roomIds) !== JSON.stringify(expectedIds)) throw new Error(`页面数据与接口不一致: ${state.roomIds.join(',')} vs ${expectedIds.join(',')}`);
        this.broadCreated = this.broadCreated.filter((id) => id !== lastRoomId);
      });

      await this.act('广播召人：删除后刷新未返回时切页，旧响应不覆盖第 2 页', async () => {
        await this.clearToasts();
        // 重新加载，恢复默认每页 20；补足 3 条英语区测试数据，页容量 1 → 删除后仍有 2 页
        await this.reloadBroad();
        await this.importBroadXlsx(ROOM_IDS);
        await this.setBroadPageSizeViaVm(1, 1);
        await this.selectBroadLocale('英语区');
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        const enState = await this.broadState();
        if (enState.total !== 3) throw new Error(`英语区测试数据应为 3 条，实际 ${enState.total}`);
        await this.gotoPage(2);
        if ((await this.rowCount()) !== 1) throw new Error('英语区第 2 页应为 1 行');
        const lastRoomId = Number((await this.rows().first().locator('td').nth(1).innerText()).trim());
        await this.selectRow(0);

        const hold = await this.holdListRequest(
          '**/api/voiceroom/broad/list**',
          ({ url }) => new URL(url).searchParams.get('page') === '1',
        );
        try {
          await this.button('批量删除').click();
          await this.waitConfirmDialog();
          await this.confirmBox();
          await hold.started;
          this.log('删除成功后的第 1 页刷新已暂缓，切换第 2 页');
          await this.gotoPage(2);
          const expected = (await this.api('/api/voiceroom/broad/list?page=2&rows=1&locale=en')).json?.data?.data ?? [];
          const expectedIds = expected.map((row: any) => Number(row.roomId));
          hold.release();
          await this.p.waitForTimeout(800);
          await this.waitListIdle();
          const state = await this.broadState();
          await this.shot('广播分页-旧响应不覆盖第2页');
          this.log(`暂缓响应释放后 state=${JSON.stringify(state)} 接口第2页=${expectedIds.join(',')}`);
          if (state.page !== 2) throw new Error(`最后一次操作是第 2 页，实际页码 ${JSON.stringify(state)}`);
          if (JSON.stringify(state.roomIds) !== JSON.stringify(expectedIds)) {
            throw new Error(`旧响应覆盖了当前列表: 当前=${state.roomIds.join(',')} 期望=${expectedIds.join(',')}`);
          }
          this.broadCreated = this.broadCreated.filter((id) => id !== lastRoomId);
        } finally {
          hold.release();
          await hold.stop();
        }
      });

      // ============ B. 主播认证标识配置 ============

      await this.act('主播认证：前置检查，认证类型 4 仅允许本次测试数据', async () => {
        await this.openAnchorPage();
        const rows = await this.certRows(CERT_TYPE_SILVER_NORMAL);
        this.log(`认证类型 4 现有 ${rows.length} 条`);
        const foreignCerts = rows.filter((row: any) => !ANCHOR_UIDS.includes(Number(row.userId)));
        if (foreignCerts.length > 0) throw new Error(`认证类型 4 存在非本次测试数据（uids=${foreignCerts.map((row: any) => row.userId).join(',')}），为保护数据停止执行`);
        if (rows.length > 0) {
          await this.certDeleteViaApi(rows.map((row: any) => Number(row.id)));
          await this.reloadAnchor();
        }
      });

      await this.act('主播认证：页面新增 11 条测试认证并过滤认证类型 4', async () => {
        await this.addAnchorViaUi(ANCHOR_UIDS, 'AI回归-分页规则');
        const rows = await this.certRows(CERT_TYPE_SILVER_NORMAL);
        if (rows.length !== ANCHOR_UIDS.length) throw new Error(`新增后类型 4 应为 ${ANCHOR_UIDS.length} 条，实际 ${rows.length}`);
        this.anchorCreatedIds = rows.map((row: any) => Number(row.id));
        await this.selectAnchorTypeFilter();
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(10);
        await this.shot('主播认证分页-过滤后第1页');
      });

      await this.act('主播认证：普通翻页不变，Search 回第 1 页', async () => {
        await this.gotoPage(2);
        const page2 = await this.anchorState();
        const page2Rows = await this.rowCount();
        this.log(`普通翻页后 page=${page2.page} rows=${page2Rows}`);
        if (page2.page !== 2 || page2Rows !== 1) throw new Error(`类型 4 第 2 页应为 1 行且页码保持 2: ${JSON.stringify(page2)} rows=${page2Rows}`);
        await this.shot('主播认证分页-普通翻页第2页');
        await this.button('Search').click();
        await this.waitPageActive(1);
        const state = await this.anchorState();
        await this.shot('主播认证分页-Search回第1页');
        if (state.page !== 1) throw new Error(`Search 后应回第 1 页: ${JSON.stringify(state)}`);
      });

      await this.act('主播认证：修改每页条数回第 1 页', async () => {
        await this.gotoPage(2);
        await this.changePageSize(20);
        const state = await this.anchorState();
        await this.shot('主播认证分页-修改每页条数回第1页');
        this.log(`修改条数后 state=${JSON.stringify(state)}`);
        if (state.page !== 1) throw new Error(`修改每页条数后应回第 1 页: ${JSON.stringify(state)}`);
        if (state.size !== 20) throw new Error(`每页条数未生效: ${JSON.stringify(state)}`);
        // 重新加载恢复默认每页 10（避免单页隐藏后的分页组件重建问题）
        await this.reloadAnchor();
        await this.selectAnchorTypeFilter();
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(10);
      });

      await this.act('主播认证：Reset 回第 1 页并清空筛选', async () => {
        await this.gotoPage(2);
        await this.button('Reset').click();
        await this.waitPageActive(1);
        const state = await this.anchorState();
        await this.shot('主播认证分页-Reset回第1页');
        this.log(`Reset 后=${JSON.stringify(state)}`);
        if (state.page !== 1) throw new Error(`Reset 后应回第 1 页: ${JSON.stringify(state)}`);
        if (state.type !== '' && state.type !== undefined && state.type !== null) throw new Error(`Reset 后认证类型筛选未清空: ${JSON.stringify(state)}`);
        await this.selectAnchorTypeFilter();
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(10);
      });

      await this.act('主播认证：第 2 页取消确认，停留原页、勾选保留、不发起删除', async () => {
        await this.gotoPage(2);
        const beforeCalls = this.calls.filter((call) => call.url.includes('/api/anchor/certification/batchDelete')).length;
        await this.clearAllSelection();
        await this.selectRow(0);
        await this.shot('主播认证分页-第2页勾选');
        await this.button('批量删除').click();
        await this.waitConfirmDialog();
        await this.cancelBox();
        await this.p.waitForTimeout(400);
        const state = await this.anchorState();
        const afterCalls = this.calls.filter((call) => call.url.includes('/api/anchor/certification/batchDelete')).length;
        const checked = await this.checkedRowCount();
        await this.shot('主播认证分页-取消后停留第2页');
        if (state.page !== 2) throw new Error(`取消后页码应保持第 2 页: ${JSON.stringify(state)}`);
        if (afterCalls !== beforeCalls) throw new Error('取消确认后仍发起了批量删除请求');
        if (checked < 1) throw new Error('取消确认后勾选被清空');
      });

      await this.act('主播认证：第 2 页删除失败，停留原页、勾选保留、仅提示 1 次', async () => {
        await this.clearToasts();
        let hits = 0;
        hits = await this.withMockDeleteFailure('**/api/anchor/certification/batchDelete', async () => {
          await this.button('批量删除').click();
          await this.waitConfirmDialog();
          await this.confirmBox();
          await this.p.waitForTimeout(800);
        });
        const messages = await this.toastTexts();
        const state = await this.anchorState();
        const checked = await this.checkedRowCount();
        await this.shot('主播认证分页-删除失败停留第2页');
        this.log(`失败注入命中=${hits} 提示=${JSON.stringify(messages)} state=${JSON.stringify(state)} checked=${checked}`);
        if (hits !== 1) throw new Error(`失败注入应命中 1 次请求，实际 ${hits}`);
        if (state.page !== 2) throw new Error(`删除失败后页码应保持第 2 页: ${JSON.stringify(state)}`);
        if (checked < 1) throw new Error('删除失败后勾选被清空');
        if (messages.length !== 1) throw new Error(`删除失败应只提示 1 次，实际 ${messages.length} 条: ${JSON.stringify(messages)}`);
      });

      let deletedUid = 0;
      await this.act('主播认证：末页删空成功回第 1 页，保留筛选与每页条数', async () => {
        await this.clearToasts();
        const lastRow = this.rows().first();
        deletedUid = Number((await lastRow.locator('td').nth(2).innerText()).trim());
        await this.button('批量删除').click();
        await this.waitConfirmDialog();
        await this.confirmBox();
        await this.waitToast('成功删除1条数据');
        await this.waitPageActive(1);
        const state = await this.anchorState();
        const left = await this.certRows(CERT_TYPE_SILVER_NORMAL);
        this.anchorCreatedIds = left.map((row: any) => Number(row.id));
        await this.shot('主播认证分页-末页删除后回第1页');
        this.log(`末页删除 uid=${deletedUid} 后=${JSON.stringify(state)} 剩余=${left.length}`);
        if (state.page !== 1) throw new Error(`批量删除成功后未回第 1 页: ${JSON.stringify(state)}`);
        if (state.size !== 10) throw new Error(`每页条数未保留为 10: ${JSON.stringify(state)}`);
        if (String(state.type) !== String(CERT_TYPE_SILVER_NORMAL)) throw new Error(`认证类型筛选未保留: ${JSON.stringify(state)}`);
        if (state.rows !== 10 || state.total !== 10) throw new Error(`删除后第 1 页应为 10 条/共 10 条: ${JSON.stringify(state)}`);
        if (left.length !== 10) throw new Error(`接口过滤后应剩 10 条，实际 ${left.length}`);
        if (state.userIds.includes(deletedUid)) throw new Error(`末页删除的 uid=${deletedUid} 仍在当前页`);
      });

      await this.act('主播认证：删除后刷新未返回时切换筛选，旧响应不覆盖筛选结果', async () => {
        await this.clearToasts();
        // 补回 1 条后重新加载，保持 11 条使第 2 页存在
        await this.addAnchorViaUi([deletedUid], 'AI回归-分页规则-补回');
        const afterAdd = await this.certRows(CERT_TYPE_SILVER_NORMAL);
        if (afterAdd.length !== 11) throw new Error(`补回后类型 4 应为 11 条，实际 ${afterAdd.length}`);
        this.anchorCreatedIds = afterAdd.map((row: any) => Number(row.id));
        await this.reloadAnchor();
        await this.selectAnchorTypeFilter();
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(10);
        await this.gotoPage(2);
        const deleteUid = Number((await this.rows().first().locator('td').nth(2).innerText()).trim());
        const filterUid = ANCHOR_UIDS.find((uid) => uid !== deleteUid) ?? ANCHOR_UIDS[0];
        await this.selectRow(0);

        const hold = await this.holdListRequest('**/api/anchor/certification/page', ({ body }) => {
          try {
            return String(JSON.parse(body || '{}').page) === '1';
          } catch {
            return false;
          }
        });
        try {
          await this.button('批量删除').click();
          await this.waitConfirmDialog();
          await this.confirmBox();
          await hold.started;
          this.log('删除成功后的第 1 页刷新已暂缓，切换用户ID筛选');
          await this.p.locator('.app-container .search-box input[placeholder="用户ID"]').fill(String(filterUid));
          await this.button('Search').click();
          await this.waitRows(1);
          hold.release();
          await this.p.waitForTimeout(800);
          await this.waitListIdle();
          const state = await this.anchorState();
          await this.shot('主播认证分页-旧响应不覆盖筛选结果');
          this.log(`暂缓响应释放后 state=${JSON.stringify(state)} 期望 uid=${filterUid}`);
          if (state.rows !== 1 || state.userIds[0] !== filterUid) {
            throw new Error(`旧响应覆盖了筛选结果: ${JSON.stringify(state)}`);
          }
          if (String(state.userId) !== String(filterUid)) throw new Error(`筛选条件未保留: ${JSON.stringify(state)}`);
        } finally {
          hold.release();
          await hold.stop();
        }
      });

      await this.act('主播认证：重新查询无结果时保留每页条数（不漂移为 20）', async () => {
        await this.reloadAnchor();
        await this.selectAnchorTypeFilter();
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(10);
        const before = await this.anchorState();
        this.log(`查询前 state=${JSON.stringify(before)}`);
        if (before.size !== 10) throw new Error(`查询前每页条数应为 10: ${JSON.stringify(before)}`);

        const emptyApi = await this.api('/api/anchor/certification/page', {
          method: 'POST',
          body: { page: 1, rows: 10, userId: 999999999 },
        });
        const emptyData = emptyApi.json?.data;
        this.log(`无结果接口响应=${JSON.stringify(emptyApi.json)}`);
        if (String(emptyApi.json?.status) !== '0' || Number(emptyData?.total) !== 0 || (emptyData?.data ?? []).length !== 0) {
          throw new Error(`无结果查询接口响应不符: ${JSON.stringify(emptyApi.json)}`);
        }
        const errors: string[] = [];
        if (Number(emptyData?.rows) !== 10) {
          errors.push(`无结果响应应回显请求的 rows=10，实际 rows=${emptyData?.rows}`);
        }

        await this.p.locator('.app-container .search-box input[placeholder="用户ID"]').fill('999999999');
        await this.button('Search').click();
        await this.waitListIdle();
        const emptyState = await this.anchorState();
        await this.shot('主播认证分页-无结果查询后每页条数');
        this.log(`无结果查询后 state=${JSON.stringify(emptyState)}`);
        if (emptyState.size !== 10) errors.push(`无结果查询后每页条数漂移为 ${emptyState.size}，应保留 10`);

        await this.button('Reset').click();
        await this.waitPageActive(1);
        const resetState = await this.anchorState();
        await this.shot('主播认证分页-Reset后每页条数');
        this.log(`Reset 后 state=${JSON.stringify(resetState)}`);
        if (resetState.size !== 10) errors.push(`Reset 后每页条数漂移为 ${resetState.size}，应保留 10`);
        if (resetState.rows !== 10) errors.push(`Reset 后第 1 页应按 10 条/页展示，实际 ${resetState.rows} 行`);
        if (errors.length > 0) throw new Error(errors.join('；'));
      });

      await this.act('主播认证：后端 #223 回归，超末页分页返回 status=0、data=[]', async () => {
        const total = (await this.certRows(CERT_TYPE_SILVER_NORMAL)).length;
        if (total !== 10) throw new Error(`#223 回归前类型 4 应剩 10 条，实际 ${total}`);
        for (const page of [2, 99]) {
          const response = await this.api('/api/anchor/certification/page', {
            method: 'POST',
            body: { page, rows: 10, certificationType: CERT_TYPE_SILVER_NORMAL },
          });
          const data = response.json?.data;
          await this.shot(`主播认证分页-超末页page${page}`);
          this.log(`page=${page} 响应 status=${response.json?.status} total=${data?.total} rows=${(data?.data ?? []).length}`);
          if (String(response.json?.status) !== '0') throw new Error(`page=${page} 超末页应返回 status=0，实际 ${JSON.stringify(response.json)}`);
          if (Number(data?.total) !== 10) throw new Error(`page=${page} total 应为 10，实际 ${data?.total}`);
          if ((data?.data ?? []).length !== 0) throw new Error(`page=${page} 超末页应返回空列表，实际 ${(data?.data ?? []).length} 条`);
        }
      });
    } finally {
      // 清理广播召人英语区测试数据
      const currentBroad = await this.broadRowIds('en').catch(() => [] as number[]);
      const broadLeft = Array.from(new Set([...this.broadCreated, ...currentBroad])).filter((id) => ROOM_IDS.includes(id));
      if (broadLeft.length > 0) await this.broadDeleteViaApi(broadLeft).catch(() => undefined);
      const broadAfter = await this.broadRowIds('en').catch(() => [] as number[]);
      this.log(`清理后英语区广播召人仍存在: ${broadAfter.join(',') || '无'}`);

      // 清理主播认证类型 4 测试数据
      const currentCerts = await this.certRows(CERT_TYPE_SILVER_NORMAL).catch(() => [] as any[]);
      const certLeft = currentCerts.map((row: any) => Number(row.id));
      if (certLeft.length > 0) await this.certDeleteViaApi(certLeft).catch(() => undefined);
      const certAfter = await this.certRows(CERT_TYPE_SILVER_NORMAL).catch(() => [] as any[]);
      this.log(`清理后认证类型 4 仍存在: ${certAfter.length} 条`);
    }
  }
}

await new PaginationRules().execute();
