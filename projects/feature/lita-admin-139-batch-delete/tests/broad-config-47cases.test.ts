/**
 * 项目139 / 语音房管理-广播召人配置：47 条用例中的 #1～#11 + 非 UI 附录 N-A3-API / N-A5-EMPTY
 *
 * 用例来源：TK-0083 HANDOFF 九列表格；技术方案：TK-0083 TECH_DESIGN §2/§3「广播召人-批量删除」「广播召人-单条与回归」。
 * 覆盖：#1 入口与未勾选禁用；#2 勾选两条/二次确认/取消；#3 取消后两条保留；#4 确认批量删除；
 *       #5 单条删除；#6 添加弹窗新增；#7 编辑优先级；#8 Excel 导入；#9 分页往返；#10 ROOM ID 搜索；#11 英语区筛选。
 * 非 UI 附录：N-A3-API（#4 的 batchDelete 响应留痕）、N-A5-EMPTY（空参数保护，三次请求前后列表计数）。
 * 数据隔离：仅测试房间池 [6666,12001,10000]（英语区）；每个用例预检/造数/就绪/清理，finally 仅清理本用例登记 roomId。
 * 运行（仓库根目录，凭证运行时注入）：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** LITA_USER_TOKEN=*** \
 *   node projects/feature/lita-admin-139-batch-delete/tests/broad-config-47cases.test.ts
 */
import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { AdminBase, EN_ROOM_IDS } from './lib/admin-base.ts';

const ROOM_IDS = EN_ROOM_IDS;

class BroadConfig47Cases extends AdminBase {
  private created: number[] = [];

  constructor() {
    super('broad-config-47cases');
    this.total = 26;
  }

  private async broadData(query = ''): Promise<{ total: number; rows: any[] }> {
    const response = await this.api(`/api/voiceroom/broad/list?page=1&rows=200${query}`);
    if (String(response.json?.status) !== '0') throw new Error(`广播列表接口失败: ${response.json?.msg}`);
    const data = response.json?.data ?? {};
    return { total: Number(data.total ?? 0), rows: data.data ?? [] };
  }

  private async exists(roomId: number): Promise<boolean> {
    return (await this.broadData(`&roomId=${roomId}`)).rows.length > 0;
  }

  /** 预检：房间必须存在且为英语区，避免覆盖非测试房间 */
  private async assertEnglishRoom(roomId: number): Promise<void> {
    const response = await this.api(`/api/voiceroom/voiceRoomList?page=1&rows=10&roomId=${roomId}`);
    if (String(response.json?.status) !== '0') throw new Error(`房间查询接口失败: ${response.json?.msg}`);
    const rooms = response.json?.data?.data ?? [];
    const hit = rooms.find((room: any) => String(room.roomId) === String(roomId));
    if (!hit) throw new Error(`预检失败：房间 ${roomId} 不存在`);
    if (hit.locale !== 'en') throw new Error(`预检失败：房间 ${roomId} 非英语区（locale=${hit.locale}）`);
  }

  private async assertAbsent(roomId: number): Promise<void> {
    if (await this.exists(roomId)) throw new Error(`预检冲突：房间 ${roomId} 已存在广播召人配置，停止执行`);
  }

  private async addViaApi(roomId: number, priority = 60, userNum = 20): Promise<void> {
    await this.assertEnglishRoom(roomId);
    await this.assertAbsent(roomId);
    const response = await this.api('/api/voiceroom/broad/add', {
      method: 'POST',
      body: { roomId, priority, userNum, isNotity: '0', opUser: this.operator },
    });
    if (String(response.json?.status) !== '0') throw new Error(`API 新增房间 ${roomId} 失败: ${response.json?.msg}`);
    const after = await this.broadData(`&roomId=${roomId}`);
    if (after.rows.length !== 1) throw new Error(`新增后房间 ${roomId} 记录数应为 1，实际 ${after.rows.length}`);
    if (!this.created.includes(roomId)) this.created.push(roomId);
  }

  private async batchDeleteViaApi(ids: number[]): Promise<string> {
    if (!ids.length) return '';
    const response = await this.api('/api/voiceroom/broad/batchDelete', { method: 'POST', body: { roomIds: ids } });
    if (String(response.json?.status) !== '0') throw new Error(`清理广播数据失败: ${response.json?.msg}`);
    this.created = this.created.filter((id) => !ids.includes(id));
    return String(response.json?.data ?? '');
  }

  private async roomIdsInCurrentList(): Promise<number[]> {
    return (await this.broadData()).rows.map((row: any) => Number(row.roomId));
  }

  private async ensureEnglishPool(roomIds: number[], priority = 60, userNum = 20): Promise<void> {
    for (const roomId of roomIds) await this.addViaApi(roomId, priority, userNum);
    const english = await this.broadData('&locale=en');
    const foreign = english.rows.map((row: any) => Number(row.roomId)).filter((id) => !roomIds.includes(id));
    if (foreign.length > 0) throw new Error(`英语区存在非本用例数据 roomIds=${foreign.join(',')}，停止执行`);
    for (const roomId of roomIds) {
      if (!english.rows.some((row: any) => Number(row.roomId) === roomId)) throw new Error(`就绪确认失败：英语区缺少 roomId=${roomId}`);
    }
  }

  private async openBroad(): Promise<void> {
    await this.open('/voice-room/voice-room-broad-config', '.app-container');
    await this.waitRows(1);
  }

  private rowByRoom(roomId: number) {
    return this.rows().filter({ hasText: String(roomId) }).first();
  }

  private async rowFields(roomId: number): Promise<{ count: number; priority: string; userNum: string; locale: string }> {
    const rows = (await this.broadData(`&roomId=${roomId}`)).rows;
    const row = rows[0];
    return {
      count: rows.length,
      priority: String(row?.priority ?? ''),
      userNum: String(row?.userNum ?? ''),
      locale: String(row?.locale ?? ''),
    };
  }

  async run(): Promise<void> {
    try {
      await this.act('管理员真实登录并获取本次会话 token', async () => {
        await this.login();
      });

      // ==================== 用例#1 ====================
      let entryVisible1 = false;
      let disabled1 = false;
      await this.act('用例#1 菜单进入广播召人配置并等待列表加载遮罩消失', async () => {
        await this.openBroad();
        entryVisible1 = await this.button('批量删除').isVisible();
        disabled1 = await this.buttonDisabled('批量删除');
        await this.shot('用例1-入口与禁用态');
      });
      await this.check('用例#1-① 表格首列为多选列且工具栏「批量删除」按钮可见', async () => ({
        expect: '多选列可见;批量删除按钮可见',
        real: `多选列可见=${await this.p.locator('.app-container .el-table__header-wrapper .el-checkbox').first().isVisible().catch(() => false)};批量删除按钮可见=${entryVisible1}`,
        pass: entryVisible1 && (await this.p.locator('.app-container .el-table__header-wrapper .el-checkbox').first().isVisible().catch(() => false)),
      }));
      await this.check('用例#1-② 未勾选任何行时「批量删除」按钮为禁用态', async () => ({
        expect: 'true',
        real: String(disabled1),
        pass: disabled1 === true,
      }));

      // ==================== 用例#2 ====================
      let selected2: number[] = [];
      let confirm2 = '';
      let enabled2 = false;
      await this.act('用例#2 造数 3 条英语区配置并筛选英语区', async () => {
        await this.ensureEnglishPool(ROOM_IDS, 60, 20);
        await this.openBroad();
        await this.selectByPlaceholder('地区', '英语区');
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(3);
      });
      await this.act('用例#2 勾选两条本用例配置并点击批量删除', async () => {
        const state = await this.broadData('&locale=en');
        const ids = state.rows.map((row: any) => Number(row.roomId));
        selected2 = ids.slice(0, 2);
        for (let i = 0; i < 2; i++) await this.selectRow(i);
        enabled2 = !(await this.buttonDisabled('批量删除'));
        await this.shot('用例2-已勾选2条');
        await this.button('批量删除').click();
        confirm2 = await this.waitConfirmDialog();
        await this.shot('用例2-二次确认');
      });
      await this.check('用例#2-① 勾选两行后「批量删除」按钮为可用态', async () => ({
        expect: 'false',
        real: String(!enabled2),
        pass: enabled2 === true,
      }));
      await this.check('用例#2-② 二次确认文案为「确认删除选中的 2 条广播召人配置？」', async () => ({
        expect: '确认删除选中的 2 条广播召人配置？',
        real: confirm2,
        pass: confirm2 === '确认删除选中的 2 条广播召人配置？',
      }));
      await this.act('用例#2 点击取消并清理 3 条测试配置', async () => {
        await this.cancelBox();
        await this.waitToastsGone().catch(() => undefined);
        await this.batchDeleteViaApi(ROOM_IDS);
      });

      // ==================== 用例#3 ====================
      let beforeTotal3 = 0;
      let target3: number[] = [];
      let afterTotal3 = 0;
      let afterCount3: Record<string, number> = {};
      let successToast3 = 0;
      await this.act('用例#3 造数 2 条英语区配置并记录删除前总数', async () => {
        await this.ensureEnglishPool([ROOM_IDS[0], ROOM_IDS[1]], 60, 20);
        await this.openBroad();
        await this.selectByPlaceholder('地区', '英语区');
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(2);
        beforeTotal3 = (await this.broadData('&locale=en')).total;
        target3 = (await this.broadData('&locale=en')).rows.map((row: any) => Number(row.roomId));
      });
      await this.act('用例#3 勾选两条后点击批量删除并取消', async () => {
        for (let i = 0; i < 2; i++) await this.selectRow(i);
        await this.button('批量删除').click();
        await this.waitConfirmDialog();
        await this.cancelBox();
        await this.waitListIdle();
        await this.shot('用例3-取消后列表');
        afterTotal3 = (await this.broadData('&locale=en')).total;
        afterCount3 = {};
        for (const roomId of target3) afterCount3[String(roomId)] = (await this.broadData(`&roomId=${roomId}`)).rows.length;
        successToast3 = await this.toastCount('成功删除');
      });
      await this.check('用例#3-① 取消后两个目标 roomId 仍各显示 1 条，列表总数仍为删除前总数', async () => ({
        expect: `each=1;total=${beforeTotal3}`,
        real: `each=${target3.map((id) => afterCount3[String(id)] ?? 0).join(',')};total=${afterTotal3}`,
        pass: target3.length === 2 && target3.every((id) => afterCount3[String(id)] === 1) && afterTotal3 === beforeTotal3,
      }));
      await this.check('用例#3-② 页面不出现批量删除成功提示', async () => ({
        expect: '0',
        real: String(successToast3),
        pass: successToast3 === 0,
      }));
      await this.act('用例#3 清理两条测试配置', async () => {
        await this.batchDeleteViaApi(target3);
      });

      // ==================== 用例#4 ====================
      let selected4: number[] = [];
      let remaining4 = 0;
      let beforeTotal4 = 0;
      let toast4 = '';
      let deletedToastCount4 = 0;
      let after4: { count: number; remainingCount: number; checked: number; disabled: boolean } = { count: -1, remainingCount: -1, checked: -1, disabled: false };
      await this.act('用例#4 造数 3 条英语区配置，记录勾选与未勾选 roomId', async () => {
        await this.ensureEnglishPool(ROOM_IDS, 60, 20);
        await this.openBroad();
        await this.selectByPlaceholder('地区', '英语区');
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(3);
        const rows = (await this.broadData('&locale=en')).rows;
        const ids = rows.map((row: any) => Number(row.roomId));
        selected4 = ids.slice(0, 2);
        remaining4 = ids[2];
        beforeTotal4 = ids.length;
      });
      await this.act('用例#4 勾选两条并确认批量删除', async () => {
        for (let i = 0; i < 2; i++) await this.selectRow(i);
        await this.shot('用例4-已勾选2条');
        await this.button('批量删除').click();
        const confirmText = await this.waitConfirmDialog();
        if (confirmText !== '确认删除选中的 2 条广播召人配置？') throw new Error(`二次确认文案不符: ${confirmText}`);
        await this.confirmBox();
        toast4 = await this.waitToast('成功删除2条数据');
        deletedToastCount4 = await this.toastCount('成功删除2条数据');
        await this.waitListIdle();
        await this.shot('用例4-批量删除成功');
        const selectedLeft = [];
        for (const id of selected4) selectedLeft.push((await this.broadData(`&roomId=${id}`)).rows.length);
        const remainingLeft = (await this.broadData(`&roomId=${remaining4}`)).rows.length;
        after4 = {
          count: selectedLeft.reduce((sum, n) => sum + n, 0),
          remainingCount: remainingLeft,
          checked: await this.checkedRowCount(),
          disabled: await this.buttonDisabled('批量删除'),
        };
      });
      await this.check('用例#4-① 页面轻提示为「成功删除2条数据」', async () => ({
        expect: '成功删除2条数据;count=1',
        real: `${toast4};count=${deletedToastCount4}`,
        pass: toast4 === '成功删除2条数据' && deletedToastCount4 === 1,
      }));
      await this.check('用例#4-② 刷新后的列表不含两个勾选 roomId，仍显示未勾选 roomId', async () => ({
        expect: `deletedTotal=0;remaining=${remaining4}:1`,
        real: `deletedTotal=${after4.count};remaining=${remaining4}:${after4.remainingCount}`,
        pass: after4.count === 0 && after4.remainingCount === 1,
      }));
      await this.check('用例#4-③ 表格勾选数为 0，「批量删除」按钮恢复禁用态', async () => ({
        expect: 'checked=0;disabled=true',
        real: `checked=${after4.checked};disabled=${after4.disabled}`,
        pass: after4.checked === 0 && after4.disabled === true,
      }));

      // 非 UI 附录 N-A3-API：读取 #4 的 batchDelete 页面响应留痕
      const deleteCall4 = [...this.calls].reverse().find((call) => call.url.includes('/api/voiceroom/broad/batchDelete') && call.status !== undefined);
      let nA3Status = '';
      let nA3Data = '';
      try {
        const body = JSON.parse(deleteCall4?.responseBody ?? '{}');
        nA3Status = String(body.status ?? '');
        nA3Data = String(body.data ?? '');
      } catch {
        nA3Status = 'unparsable';
      }
      await this.check('N-A3-API 广播批量删除响应 status=0 且 data=成功删除2条数据', async () => ({
        expect: 'status=0;data=成功删除2条数据',
        real: `status=${nA3Status};data=${nA3Data};url=${deleteCall4?.url ?? '未捕获'}`,
        pass: nA3Status === '0' && nA3Data === '成功删除2条数据',
      }));
      await this.act('用例#4 清理未勾选 roomId', async () => {
        await this.batchDeleteViaApi([remaining4]);
      });

      // ==================== 用例#5 ====================
      let exists5 = -1;
      let error5 = -1;
      let blank5 = true;
      await this.act('用例#5 造数房间 6666（优先级33/日邀请11）并按 ROOM ID 搜索', async () => {
        await this.addViaApi(ROOM_IDS[0], 33, 11);
        await this.openBroad();
        await this.fillByPlaceholder('ROOM ID', String(ROOM_IDS[0]));
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
      });
      await this.act('用例#5 点击目标行删除并按页面确认框确认', async () => {
        this.p.once('dialog', (dialog) => void dialog.accept());
        await this.rowByRoom(ROOM_IDS[0]).getByRole('button', { name: '删除' }).click();
        await this.confirmIfPresent();
        await this.waitToast('Operation succeed');
        await this.waitListIdle();
        this.created = this.created.filter((id) => id !== ROOM_IDS[0]);
        exists5 = (await this.broadData(`&roomId=${ROOM_IDS[0]}`)).rows.length;
        error5 = await this.errorToastCount();
        blank5 = !(await this.p.locator('.app-container').isVisible());
        await this.shot('用例5-单条删除后');
      });
      await this.check('用例#5-① 查询结果不再显示房间 6666 的配置', async () => ({
        expect: '0',
        real: String(exists5),
        pass: exists5 === 0,
      }));
      await this.check('用例#5-② 页面不出现错误提示或空白页', async () => ({
        expect: 'errorToast=0;内容区可见',
        real: `errorToast=${error5};内容区可见=${!blank5}`,
        pass: error5 === 0 && blank5 === false,
      }));

      // ==================== 用例#6 ====================
      let row6 = { count: -1, priority: '', userNum: '' };
      await this.act('用例#6 预检房间 6666 无配置，通过添加弹窗新增 33/11', async () => {
        await this.assertAbsent(ROOM_IDS[0]);
        await this.openBroad();
        await this.button('添加').click();
        const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '房间ID' }).last();
        await dialog.waitFor({ state: 'visible', timeout: 10000 });
        await this.fillDialogField('房间ID', String(ROOM_IDS[0]));
        await this.fillDialogField('优先级', '33');
        await this.fillDialogField('日广播邀请人数', '11');
        await this.shot('用例6-新增弹窗');
        await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
        await this.waitToast('创建成功');
        this.created.push(ROOM_IDS[0]);
        await this.fillByPlaceholder('ROOM ID', String(ROOM_IDS[0]));
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        row6 = await this.rowFields(ROOM_IDS[0]);
        await this.shot('用例6-新增后查询');
      });
      await this.check('用例#6-① 列表仅显示 1 条房间 6666 的配置', async () => ({
        expect: '1',
        real: String(row6.count),
        pass: row6.count === 1,
      }));
      await this.check('用例#6-② 该行优先级为 33、日广播邀请人数为 11', async () => ({
        expect: 'priority=33;userNum=11',
        real: `priority=${row6.priority};userNum=${row6.userNum}`,
        pass: row6.priority === '33' && row6.userNum === '11',
      }));

      // ==================== 用例#7 ====================
      let row7 = { count: -1, priority: '', userNum: '' };
      await this.act('用例#7 按 ROOM ID 搜索 6666，编辑优先级为 77', async () => {
        await this.openBroad();
        await this.fillByPlaceholder('ROOM ID', String(ROOM_IDS[0]));
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        const row = this.rowByRoom(ROOM_IDS[0]);
        await row.getByRole('button', { name: '编辑' }).click();
        const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '房间ID' }).last();
        await dialog.waitFor({ state: 'visible', timeout: 10000 });
        await this.fillDialogField('优先级', '');
        await this.fillDialogField('优先级', '77');
        await this.shot('用例7-编辑弹窗');
        await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
        await this.waitToast('更新成功');
        await this.waitListIdle();
        row7 = await this.rowFields(ROOM_IDS[0]);
        await this.shot('用例7-编辑后');
      });
      await this.check('用例#7-① 目标行优先级显示 77', async () => ({
        expect: '77',
        real: row7.priority,
        pass: row7.priority === '77',
      }));
      await this.check('用例#7-② 目标行房间ID仍为 6666、日广播邀请人数仍为 11', async () => ({
        expect: '6666;11',
        real: `${ROOM_IDS[0]};${row7.userNum}`,
        pass: row7.userNum === '11',
      }));
      await this.check('用例#7-③ 目标查询结果总行数为 1', async () => ({
        expect: '1',
        real: String(row7.count),
        pass: row7.count === 1,
      }));
      await this.act('用例#7 清理房间 6666', async () => {
        await this.batchDeleteViaApi([ROOM_IDS[0]]);
      });

      // ==================== 用例#8 ====================
      let row8 = { count: -1, priority: '', userNum: '' };
      await this.act('用例#8 预检房间 6666 无配置，生成合法 xlsx 并上传导入', async () => {
        await this.assertAbsent(ROOM_IDS[0]);
        await this.openBroad();
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Sheet1');
        sheet.addRow(['房间ID', '优先级', '日广播邀请人数']);
        sheet.addRow([ROOM_IDS[0], 12, 30]);
        const file = join(this.evidenceDir, `broad-import-${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(file);
        await this.button('上传模版').click();
        const dialog = this.p.locator('.el-dialog:visible').filter({ hasText: '通过文件批量广播召人配置' }).last();
        await dialog.waitFor({ state: 'visible', timeout: 10000 });
        await dialog.locator('input[type="file"]').setInputFiles(file);
        await this.shot('用例8-导入文件已选择');
        await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
        await this.waitToast('上传成功');
        this.created.push(ROOM_IDS[0]);
        await this.fillByPlaceholder('ROOM ID', String(ROOM_IDS[0]));
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        row8 = await this.rowFields(ROOM_IDS[0]);
        await this.shot('用例8-导入后查询');
      });
      await this.check('用例#8-① 列表仅显示 1 条房间 6666 的配置', async () => ({
        expect: '1',
        real: String(row8.count),
        pass: row8.count === 1,
      }));
      await this.check('用例#8-② 该行优先级为 12、日广播邀请人数为 30', async () => ({
        expect: 'priority=12;userNum=30',
        real: `priority=${row8.priority};userNum=${row8.userNum}`,
        pass: row8.priority === '12' && row8.userNum === '30',
      }));
      await this.act('用例#8 清理导入记录', async () => {
        await this.batchDeleteViaApi([ROOM_IDS[0]]);
      });

      // ==================== 用例#9 ====================
      let total9 = 0;
      let firstRow9 = '';
      let page2State9 = { page: 0, size: 0, firstRow: '', activeText: '' };
      let returnedState9 = { page: 0, size: 0, total: 0, activeText: '' };
      await this.act('用例#9 造数 3 条使默认 total>20，记录第 1 页首行', async () => {
        await this.ensureEnglishPool(ROOM_IDS, 60, 20);
        await this.openBroad();
        await this.waitPageActive(1);
        const state = await this.paginationState();
        total9 = state.total;
        firstRow9 = (await this.mainRowCells(0))[1] ?? '';
        if (total9 <= 20) throw new Error(`分页就绪失败：total=${total9} 不大于 20`);
        await this.shot('用例9-第1页');
      });
      await this.act('用例#9 点击分页第 2 页并等待列表加载', async () => {
        await this.gotoPage(2);
        await this.waitRows(1);
        const state = await this.paginationState();
        page2State9 = {
          page: state.page,
          size: state.size,
          firstRow: (await this.mainRowCells(0))[1] ?? '',
          activeText: state.activeText,
        };
        await this.shot('用例9-第2页');
      });
      await this.act('用例#9 点击「上一页」返回第 1 页', async () => {
        await this.p.locator('.el-pagination .btn-prev').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        returnedState9 = await this.paginationState();
        await this.shot('用例9-返回第1页');
      });
      await this.check('用例#9-① 第 2 页为高亮页，每页 20 条，首行 roomId 不同于第 1 页记录值', async () => ({
        expect: `page=2;size=20;firstRow!=${firstRow9}`,
        real: `page=${page2State9.page};size=${page2State9.size};firstRow=${page2State9.firstRow}`,
        pass: page2State9.page === 2 && page2State9.size === 20 && page2State9.firstRow !== '' && page2State9.firstRow !== firstRow9,
      }));
      await this.check('用例#9-② 返回后第 1 页为高亮页，分页总数仍为原总数', async () => ({
        expect: `page=1;total=${total9}`,
        real: `page=${returnedState9.page};total=${returnedState9.total}`,
        pass: returnedState9.page === 1 && returnedState9.total === total9,
      }));
      await this.act('用例#9 清理 3 条测试配置', async () => {
        await this.batchDeleteViaApi(ROOM_IDS);
      });

      // ==================== 用例#10 ====================
      let row10 = { count: -1, priority: '', userNum: '' };
      let totalRows10 = 0;
      let targetRows10 = 0;
      await this.act('用例#10 造数房间 6666（33/11），按 ROOM ID 精确搜索', async () => {
        await this.addViaApi(ROOM_IDS[0], 33, 11);
        await this.openBroad();
        await this.fillByPlaceholder('ROOM ID', String(ROOM_IDS[0]));
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        const state = await this.p.evaluate(() => {
          const vm = (document.querySelector('.app-container') as any).__vue__;
          return { total: vm.list?.length ?? 0, rows: (vm.list ?? []).map((row: any) => Number(row.roomId)) };
        });
        totalRows10 = state.total;
        targetRows10 = state.rows.filter((id: number) => id === ROOM_IDS[0]).length;
        row10 = await this.rowFields(ROOM_IDS[0]);
        await this.shot('用例10-精确搜索');
      });
      await this.check('用例#10-① 列表总行数为 1，目标房间 6666 行数为 1，非目标行数为 0', async () => ({
        expect: 'total=1;target=1;other=0',
        real: `total=${totalRows10};target=${targetRows10};other=${totalRows10 - targetRows10}`,
        pass: totalRows10 === 1 && targetRows10 === 1,
      }));
      await this.check('用例#10-② 目标行优先级为 33、日广播邀请人数为 11', async () => ({
        expect: 'priority=33;userNum=11',
        real: `priority=${row10.priority};userNum=${row10.userNum}`,
        pass: row10.priority === '33' && row10.userNum === '11',
      }));

      // ==================== 用例#11 ====================
      let localeValues11: string[] = [];
      let targetVisible11 = false;
      await this.act('用例#11 选择地区「英语区」并搜索', async () => {
        await this.openBroad();
        await this.selectByPlaceholder('地区', '英语区');
        await this.button('Search').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        localeValues11 = await this.mainColumnTexts(3);
        targetVisible11 = await this.rows().filter({ hasText: String(ROOM_IDS[0]) }).first().isVisible();
        await this.shot('用例11-英语区筛选');
      });
      await this.check('用例#11-① 列表至少 1 行且每行「大区」均显示英语(en)', async () => ({
        expect: '每行包含英语(en)',
        real: JSON.stringify(localeValues11),
        pass: localeValues11.length >= 1 && localeValues11.every((text) => text.includes('英语') && text.includes('en')),
      }));
      await this.check('用例#11-② 房间 6666 的目标配置在结果中可见', async () => ({
        expect: 'true',
        real: String(targetVisible11),
        pass: targetVisible11 === true,
      }));
      await this.act('用例#11 清空筛选并清理房间 6666', async () => {
        await this.batchDeleteViaApi([ROOM_IDS[0]]);
      });

      // ==================== 非 UI 附录 N-A5-EMPTY ====================
      let nA5Ok = false;
      let nA5Detail = '';
      let nA5Before = 0;
      let nA5After = 0;
      await this.act('N-A5-EMPTY 向同源测试入口发送三组空参数请求', async () => {
        nA5Before = (await this.broadData()).total;
        const bodies: Array<{ label: string; body?: unknown }> = [
          { label: 'empty-body' },
          { label: '{}', body: {} },
          { label: 'roomIds=[]', body: { roomIds: [] } },
        ];
        const results: string[] = [];
        nA5Ok = true;
        for (const item of bodies) {
          const response = await this.api('/api/voiceroom/broad/batchDelete', { method: 'POST', body: item.body });
          const status = String(response.json?.status ?? '');
          const msg = String(response.json?.msg ?? '');
          results.push(`${item.label}:http=${response.status},status=${status},msg=${msg}`);
          if (status === '0' || msg !== '请选择要删除的数据') nA5Ok = false;
        }
        nA5After = (await this.broadData()).total;
        nA5Detail = results.join(' | ');
        this.log(`N-A5-EMPTY ${nA5Detail}; count ${nA5Before}->${nA5After}`);
      });
      await this.check('N-A5-EMPTY 三次空请求均返回「请选择要删除的数据」且无业务删除', async () => ({
        expect: '三次 status!=0;msg=请选择要删除的数据;count前后一致',
        real: `${nA5Detail};count=${nA5Before}->${nA5After}`,
        pass: nA5Ok && nA5Before === nA5After,
      }));
    } finally {
      const rows = await this.broadData().catch(() => ({ total: 0, rows: [] as any[] }));
      const leftovers = this.created.filter((id) => rows.rows.some((row: any) => Number(row.roomId) === id));
      if (leftovers.length > 0) {
        await this.batchDeleteViaApi(leftovers).catch((error) => this.log(`清理失败: ${(error as Error).message}`));
      }
      const remaining = await this.broadData().catch(() => ({ total: 0, rows: [] as any[] }));
      const still = this.created.filter((id) => remaining.rows.some((row: any) => Number(row.roomId) === id));
      this.log(`清理后测试房间仍存在: ${still.join(',') || '无'}`);
    }
  }
}

await new BroadConfig47Cases().execute();
