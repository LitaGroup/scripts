/**
 * 项目139 / 语音房管理-广播召人配置：批量删除全链路（真实页面 + 真实接口 + 只读 DB 辅助核对）
 *
 * 覆盖：
 * 1. 入口与未勾选禁用态；
 * 2. 勾选多条 → 二次确认展示条数 → 取消不删除；
 * 3. 确认删除 → 后端 data 文案「成功删除N条数据」、列表刷新、勾选清空、按钮恢复禁用；
 * 4. 仅删除当前页勾选行（未勾选行保留）；
 * 5. 末页整页删除后按新分页规则回到第 1 页，并保留筛选（英语区）与每页条数（页容量通过组件状态设为 2 构造末页）；
 * 6. 既有功能回归：单条新增/编辑/删除、Excel 导入。
 *
 * 运行：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** LITA_USER_TOKEN=*** \
 *   node projects/feature/lita-admin-139-batch-delete/tests/broad-config-batch-delete.test.ts
 */
import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { AdminBase, EN_ROOM_IDS } from './lib/admin-base.ts';

const ROOM_IDS = EN_ROOM_IDS;
const IMPORT_ROOM = ROOM_IDS[0];

class BroadConfigBatchDelete extends AdminBase {
  private created: number[] = [];

  constructor() {
    super('broad-config-batch-delete');
    this.total = 9;
  }

  private async broadIds(locale?: string): Promise<number[]> {
    const query = locale ? `&locale=${locale}` : '';
    const response = await this.api(`/api/voiceroom/broad/list?page=1&rows=200${query}`);
    const rows = response.json?.data?.data ?? [];
    return rows.map((row: any) => Number(row.roomId));
  }

  private async batchDelete(ids: number[]): Promise<{ status: string; msg: string; data: string }> {
    const response = await this.api('/api/voiceroom/broad/batchDelete', { method: 'POST', body: { roomIds: ids } });
    return { status: String(response.json?.status), msg: String(response.json?.msg ?? ''), data: String(response.json?.data ?? '') };
  }

  private rowByRoom(roomId: number) {
    return this.rows().filter({ hasText: String(roomId) }).first();
  }

  private async addViaUi(roomId: number, priority: number, userNum: number): Promise<void> {
    await this.button('添加').click();
    const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '房间ID' }).last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await this.fillDialogField('房间ID', String(roomId));
    await this.fillDialogField('优先级', String(priority));
    await this.fillDialogField('日广播邀请人数', String(userNum));
    await this.shot(`新增弹窗-room-${roomId}`);
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await this.waitToast('创建成功');
    await this.shot(`新增成功-room-${roomId}`);
    this.created.push(roomId);
  }

  private async importXlsx(roomIds: number[]): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['房间ID', '优先级', '日广播邀请人数']);
    for (const roomId of roomIds) sheet.addRow([roomId, 12, 30]);
    const file = join(this.evidenceDir, `broad-import-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(file);

    await this.button('上传模版').click();
    const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '通过文件批量广播召人配置' }).last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    await dialog.locator('input[type="file"]').setInputFiles(file);
    await this.p.waitForTimeout(500);
    await this.shot('导入文件已选择');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await this.waitToast('上传成功');
    this.created.push(...roomIds);
    await this.shot('导入成功');
  }

  async run(): Promise<void> {
    try {
      await this.act('管理员真实登录并获取本次会话 token', async () => {
        await this.login();
      });

      await this.act('打开广播召人配置：入口、列表与未勾选禁用态', async () => {
        await this.open('/voice-room/voice-room-broad-config', '.app-container');
        await this.waitRows(1);
        const rows = await this.rowCount();
        const disabled = await this.buttonDisabled('批量删除');
        this.log(`列表行数=${rows}，批量删除未勾选禁用=${disabled}`);
        await this.shot('广播召人-入口与禁用态');
        if (!(await this.button('批量删除').isVisible())) throw new Error('批量删除按钮不存在');
        if (!disabled) throw new Error('未勾选时批量删除按钮未禁用');
        if (rows < 1) throw new Error('列表无数据，无法执行后续用例');
      });

      await this.act('通过页面新增 3 条测试配置（英语区房间）', async () => {
        for (const roomId of ROOM_IDS) {
          const existing = await this.api(`/api/voiceroom/broad/list?page=1&rows=10&roomId=${roomId}`);
          if ((existing.json?.data?.data ?? []).length > 0) {
            throw new Error(`测试房间 ${roomId} 已存在广播召人配置，为保护数据停止执行`);
          }
          await this.addViaUi(roomId, 60, 20);
        }
        const ids = await this.broadIds();
        for (const roomId of ROOM_IDS) {
          if (!ids.includes(roomId)) throw new Error(`页面新增后接口未查到 roomId=${roomId}`);
        }
      });

      await this.act('勾选 2 条：按钮启用且二次确认展示条数', async () => {
        await this.clearAllSelection();
        await this.selectRow(0);
        await this.selectRow(1);
        if (await this.buttonDisabled('批量删除')) throw new Error('勾选后批量删除按钮仍禁用');
        await this.shot('已勾选2条');
        await this.button('批量删除').click();
        const text = await this.waitConfirmDialog();
        this.log(`二次确认文案: ${text}`);
        await this.shot('二次确认-2条');
        if (!text.includes('2')) throw new Error(`二次确认未展示勾选条数: ${text}`);
      });

      await this.act('取消二次确认：不发起删除、数据与勾选保持不变', async () => {
        const before = await this.rowCount();
        await this.cancelBox();
        await this.p.waitForTimeout(800);
        const after = await this.rowCount();
        const deleteCalls = this.calls.filter((call) => call.url.includes('/api/voiceroom/broad/batchDelete'));
        await this.shot('取消确认后列表');
        if (after !== before) throw new Error(`取消后行数变化 ${before} -> ${after}`);
        if (deleteCalls.length > 0) throw new Error('取消确认后仍发起了批量删除请求');
        if (await this.buttonDisabled('批量删除')) throw new Error('取消后勾选被意外清空');
      });

      await this.act('确认删除勾选 2 条：成功文案、刷新、勾选清空、按钮禁用', async () => {
        const selectedRoomIds: number[] = [];
        for (let i = 0; i < 2; i++) {
          selectedRoomIds.push(Number((await this.rows().nth(i).locator('td').nth(1).innerText()).trim()));
        }
        await this.button('批量删除').click();
        const confirmText = await this.waitConfirmDialog();
        this.log(`确认文案: ${confirmText}`);
        await this.confirmBox();
        const toast = await this.waitToast('成功删除2条数据');
        this.log(`成功提示: ${toast}`);
        await this.p.waitForTimeout(1200);
        const disabled = await this.buttonDisabled('批量删除');
        await this.shot('批量删除成功-列表刷新');
        if (!toast.includes('成功删除2条数据')) throw new Error(`成功提示不符合后端文案: ${toast}`);
        if (!disabled) throw new Error('删除成功后勾选未清空（按钮仍可用）');
        const remaining = await this.broadIds();
        for (const roomId of selectedRoomIds) {
          if (remaining.includes(roomId)) throw new Error(`roomId=${roomId} 删除后仍存在`);
          this.created = this.created.filter((id) => id !== roomId);
        }
      });

      await this.act('单条新增/编辑/删除回归', async () => {
        const roomId = ROOM_IDS[2];
        await this.addViaUi(roomId, 33, 11);
        const row = this.rowByRoom(roomId);
        await row.waitFor({ state: 'visible', timeout: 10000 });
        await row.getByRole('button', { name: '编辑' }).click();
        await this.fillDialogField('优先级', '77');
        await this.p.locator('.el-dialog:visible').getByRole('button', { name: 'Confirm', exact: true }).click();
        await this.waitToast('更新成功');
        await this.p.waitForTimeout(800);
        const editedText = await this.rowByRoom(roomId).innerText();
        await this.shot('单条编辑-优先级77');
        if (!editedText.includes('77')) throw new Error(`编辑后优先级未更新: ${editedText}`);

        this.p.once('dialog', (dialog) => void dialog.accept());
        await this.rowByRoom(roomId).getByRole('button', { name: '删除' }).click();
        await this.waitToast('Operation succeed');
        await this.p.waitForTimeout(800);
        const remaining = await this.broadIds();
        await this.shot('单条删除后');
        if (remaining.includes(roomId)) throw new Error('单条删除后记录仍存在');
        this.created = this.created.filter((id) => id !== roomId);
      });

      await this.act('Excel 导入回归：导入 1 条并接口核对', async () => {
        await this.importXlsx([IMPORT_ROOM]);
        await this.p.waitForTimeout(1000);
        const ids = await this.broadIds();
        if (!ids.includes(IMPORT_ROOM)) throw new Error('导入后接口未查到记录');
        this.created = Array.from(new Set([...this.created, IMPORT_ROOM]));
      });

      await this.act('末页删空：批量删除成功后回第 1 页，保留筛选与每页条数', async () => {
        // 通过页面导入 3 条测试数据（导入会覆盖同 roomId 的既有测试记录）
        await this.importXlsx(ROOM_IDS);
        await this.p.waitForTimeout(1200);
        // 页容量置 2（此时未过滤、分页组件可见；数据全部为本次新增测试数据）
        await this.p.evaluate(async () => {
          const vm = (document.querySelector('.app-container') as any).__vue__;
          vm.pageSize = 2;
          vm.currentPage = 1;
          await vm.fetchData();
        });
        // 过滤英语区，列表仅剩本次新增的 3 条测试数据，进入第 2 页
        await this.p.locator('.app-container .el-select').first().click();
        await this.p.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: '英语区' }).first().click();
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(2);
        const enIds = await this.broadIds('en');
        this.log(`英语区测试数据 roomIds=${enIds.join(',')}`);
        for (const roomId of ROOM_IDS) {
          if (!enIds.includes(roomId)) throw new Error(`导入后英语区缺少测试房间 roomId=${roomId}`);
        }
        if (enIds.length !== 3) throw new Error(`英语区应仅 3 条测试数据，实际 ${enIds.length}`);
        await this.gotoPage(2);
        const page2Rows = await this.rowCount();
        this.log(`第2页行数=${page2Rows}`);
        await this.shot('末页-第2页');
        if (page2Rows !== 1) throw new Error(`末页应仅剩 1 行测试数据，实际 ${page2Rows}`);
        const lastRoomId = Number((await this.rows().first().locator('td').nth(1).innerText()).trim());
        await this.selectRow(0);
        await this.button('批量删除').click();
        await this.waitConfirmDialog();
        await this.confirmBox();
        await this.waitToast('成功删除1条数据');
        await this.waitPageActive(1);
        const state = await this.p.evaluate(() => {
          const vm = (document.querySelector('.app-container') as any).__vue__;
          return {
            currentPage: vm.currentPage,
            pageSize: vm.pageSize,
            locale: vm.valueLocale,
            rows: vm.list?.length,
            total: vm.listTotal,
            roomIds: (vm.list ?? []).map((row: any) => Number(row.roomId)),
          };
        });
        await this.shot('末页删除成功后回到第1页');
        this.log(`删除后状态=${JSON.stringify(state)}`);
        this.created = this.created.filter((id) => id !== lastRoomId);
        if (state.currentPage !== 1) throw new Error(`批量删除成功后未回到第 1 页: ${JSON.stringify(state)}`);
        if (state.pageSize !== 2) throw new Error(`批量删除成功后每页条数未保留: ${JSON.stringify(state)}`);
        if (state.locale !== 'en') throw new Error(`批量删除成功后筛选条件未保留: ${JSON.stringify(state)}`);
        if (state.rows !== 2 || state.total !== 2) throw new Error(`删除后第 1 页数据应为 2 条，实际 ${JSON.stringify(state)}`);
        if (state.roomIds.includes(lastRoomId)) throw new Error(`末页删除的 roomId=${lastRoomId} 仍出现在第 1 页`);
        const expected = (await this.api('/api/voiceroom/broad/list?page=1&rows=2&locale=en')).json?.data?.data ?? [];
        const expectedIds = expected.map((row: any) => Number(row.roomId));
        if (JSON.stringify(state.roomIds) !== JSON.stringify(expectedIds)) {
          throw new Error(`页面第 1 页数据与接口不一致: 页面=${state.roomIds.join(',')} 接口=${expectedIds.join(',')}`);
        }
      });
    } finally {
      const ids = await this.broadIds().catch(() => [] as number[]);
      const leftovers = ROOM_IDS.filter((roomId) => ids.includes(roomId));
      if (leftovers.length > 0) {
        const result = await this.batchDelete(leftovers).catch(() => null);
        this.log(`清理测试数据 roomIds=${leftovers.join(',')} 结果=${JSON.stringify(result)}`);
      }
      const remaining = await this.broadIds().catch(() => [] as number[]);
      this.log(`清理后测试房间仍存在: ${ROOM_IDS.filter((roomId) => remaining.includes(roomId)).join(',') || '无'}`);
    }
  }
}

await new BroadConfigBatchDelete().execute();
