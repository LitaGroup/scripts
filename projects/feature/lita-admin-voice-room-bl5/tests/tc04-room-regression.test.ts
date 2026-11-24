/**
 * 项目 BL-0005 / TK-0443：房间管理-列表结构与入口回归
 * 用例来源：TK-0442 HANDOFF 九列用例 #24/#25/#28/#29/#30；技术方案：TECH_DESIGN §5 断言映射
 * 覆盖：#24 十九列完整；#25 分页；#28 details/Edit 入口；#29 新建语音房角色入口；#30 行操作按房间类型显示
 * 数据隔离：只读 + 打开弹窗后取消；账号 qa-ai
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** BL5_RUN_ID=… node projects/feature/lita-admin-voice-room-bl5/tests/tc04-room-regression.test.ts
 */
import { VoiceRoomBase, ROOM_COL } from './lib/voice-room-base.ts';
import { type Page } from 'playwright';

const EXPECTED_HEADERS = ['地域', '国家', '语音房ID', '语音房NO', '语音房封面', '房主No', '官方房间', '公会ID', '是否公会房间', '房间类型', '是否测试房间', 'platform', '语音房名字', 'Room Tag', 'Room Category', '语音房状态', '进房条件', '创建时间', '操作'];

class RoomRegressionTest extends VoiceRoomBase {
  constructor() { super('tc04-room-regression'); this.total = 18; }

  protected async run(): Promise<void> {
    await this.act('登录并进入房间管理，准备 BD-1 房间', async () => {
      await this.login();
      this.shared.room1 = await this.ensureRoom1TagCategory();
      await this.managerSearchByName(this.roomName1);
      await this.managerReset();
      this.shared.allTotal = await this.totalCount(this.page!);
    });

    // ---------------- 用例#24 ----------------
    await this.act('用例#24 查看房间列表表头与数据行', async () => {
      await this.managerReset();
      this.shared.headers = await this.tableHeaderTexts(this.page!);
      this.shared.rows = await this.managerRows();
      await this.shot('case24-list', true);
    });
    await this.check('用例#24-① 表头依次显示 19 列', async () => {
      const headers = this.shared.headers as string[];
      const equal = headers.length === EXPECTED_HEADERS.length && headers.every((h, i) => h === EXPECTED_HEADERS[i]);
      return { expect: EXPECTED_HEADERS.join('|'), real: headers.join('|'), pass: equal };
    });
    await this.check('用例#24-② 数据行各列正常渲染且页面无报错', async () => {
      const rows = this.shared.rows as string[][];
      const badCells = rows.filter((r) => r.length !== 19).length;
      const tagOk = rows.every((r) => r[ROOM_COL.roomTag] !== undefined && r[ROOM_COL.roomCategory] !== undefined);
      return {
        expect: '每行 19 列；Room Tag/Room Category 有渲染；无 pageerror',
        real: `行数=${rows.length}；列数异常行=${badCells}；标签列渲染=${tagOk}；pageerror=${this.pageErrors.length}`,
        pass: rows.length > 0 && badCells === 0 && tagOk && this.pageErrors.length === 0
      };
    });

    // ---------------- 用例#25 ----------------
    await this.act('用例#25 记录首页状态并翻到第 2 页', async () => {
      await this.managerReset();
      const totalBefore = await this.totalCount(this.page!);
      const firstBefore = (await this.managerRows())[0]?.[ROOM_COL.roomId] ?? '';
      await this.managerGotoPage(2);
      const rows = await this.managerRows();
      const totalAfter = await this.totalCount(this.page!);
      this.shared.c25 = { totalBefore, firstBefore, firstAfter: rows[0]?.[ROOM_COL.roomId] ?? '', totalAfter, pageRows: rows.length };
      await this.shot('case25-page2');
    });
    await this.check('用例#25-① 翻到第 2 页后首行房间ID变化且 Total 不变', async () => {
      const c = this.shared.c25 as { totalBefore: number; firstBefore: string; firstAfter: string; totalAfter: number };
      return {
        expect: `首行ID≠${c.firstBefore}；Total=${c.totalBefore}`,
        real: `首行ID=${c.firstAfter}；Total=${c.totalAfter}`,
        pass: c.firstBefore !== c.firstAfter && c.totalAfter === c.totalBefore
      };
    });
    await this.act('用例#25 切换每页条数为 20/page', async () => {
      await this.managerPageSize(20);
      const rows = await this.managerRows();
      this.shared.c25b = { rows: rows.length, total: await this.totalCount(this.page!) };
      await this.shot('case25-size20');
    });
    await this.check('用例#25-② 每页 20 条后列表显示 20 行（不足时为实际行数），Total 不变', async () => {
      const c = this.shared.c25 as { totalBefore: number };
      const b = this.shared.c25b as { rows: number; total: number };
      const expectedRows = Math.min(20, b.total);
      return {
        expect: `行数=${expectedRows}；Total=${c.totalBefore}`,
        real: `行数=${b.rows}；Total=${b.total}`,
        pass: b.rows === expectedRows && b.total === c.totalBefore
      };
    });
    await this.check('用例#25-③ 翻页与切换条数过程页面无报错', async () => {
      const errors = (await this.page!.locator('.el-message--error').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
      return {
        expect: '无错误提示',
        real: `错误提示=${errors.length === 0 ? '无' : errors.join('、')}；pageerror=${this.pageErrors.length}`,
        pass: errors.length === 0 && this.pageErrors.length === 0
      };
    });

    // ---------------- 用例#28 ----------------
    await this.act('用例#28 打开房间详情页与 Edit 弹窗', async () => {
      await this.managerReset();
      const totalBefore = await this.totalCount(this.page!);
      const page = await this.openDetail(this.shared.room1 as string);
      this.shared.c28page = page;
      this.shared.c28total = totalBefore;
      this.shared.c28url = page.url();
      this.shared.c28text = await this.detailText(page);
      await this.shotOn(page, 'case28-detail', true);
    });
    await this.check('用例#28-① details 在新标签页打开详情且显示房间详情字段', async () => {
      const url = this.shared.c28url as string;
      const text = this.shared.c28text as string;
      const required = ['房主NO', '公会ID', '官方房间', 'Room Category', '房间标签', '房间名称', '房间类型'];
      const missing = required.filter((f) => !text.includes(f));
      return {
        expect: 'URL 含 #/voice-room/voice-room-detail?roomId= 且详情字段齐全',
        real: `URL=${url}；缺失字段=${missing.length === 0 ? '无' : missing.join('、')}`,
        pass: url.includes('#/voice-room/voice-room-detail?roomId=') && missing.length === 0
      };
    });
    await this.act('用例#28 点击 Edit 打开更新弹窗', async () => {
      const page = this.shared.c28page as Page;
      await page.locator('button', { hasText: 'Edit' }).first().click();
      await page.locator('.el-dialog__wrapper:visible .el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
      this.shared.c28title = (await page.locator('.el-dialog__wrapper:visible .el-dialog__title').first().innerText()).trim();
      this.shared.c28labels = await this.dlgFormLabels(page);
      await this.shotOn(page, 'case28-edit-dialog');
    });
    await this.check('用例#28-② 点击 Edit 弹出标题为「更新语音房」的弹窗且表单项正常显示', async () => {
      const title = this.shared.c28title as string;
      const labels = this.shared.c28labels as string[];
      const required = ['房主NO', '房间名称', '房间类型', 'RoomCategory', '房间标签'];
      const missing = required.filter((f) => !labels.includes(f));
      return {
        expect: '标题=更新语音房；关键表单项齐全',
        real: `标题=${title}；缺失=${missing.length === 0 ? '无' : missing.join('、')}`,
        pass: title === '更新语音房' && missing.length === 0
      };
    });
    await this.act('用例#28 取消 Edit 弹窗并关闭详情页', async () => {
      const page = this.shared.c28page as Page;
      await this.cancelRoomDialog(page);
      this.shared.c28dialogVisible = await page.locator('.el-dialog__wrapper:visible').count();
      await this.closeSession(page);
      await this.managerReset();
    });
    await this.check('用例#28-③ 点击「取 消」后弹窗关闭', async () => {
      return { expect: '弹窗关闭', real: `可见弹窗数=${this.shared.c28dialogVisible}`, pass: Number(this.shared.c28dialogVisible) === 0 };
    });
    await this.check('用例#28-④ 列表数据无变化（Total 不变）', async () => {
      const total = await this.totalCount(this.page!);
      return { expect: `Total=${this.shared.c28total}`, real: `Total=${total}`, pass: total === Number(this.shared.c28total) };
    });

    // ---------------- 用例#29 ----------------
    await this.act('用例#29 打开「新建语音房角色」弹窗', async () => {
      await this.managerReset();
      this.shared.c29total = await this.totalCount(this.page!);
      await this.page!.getByRole('button', { name: '新建语音房角色' }).first().click();
      await this.page!.locator('.el-dialog__wrapper:visible .el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
      this.shared.c29title = (await this.page!.locator('.el-dialog__wrapper:visible .el-dialog__title').first().innerText()).trim();
      this.shared.c29labels = await this.dlgFormLabels(this.page!);
      await this.shot('case29-role-dialog');
    });
    await this.check('用例#29-① 弹窗标题为「新建语音房角色」且显示操作/用户Nos/用户角色/房间列表', async () => {
      const title = this.shared.c29title as string;
      const labels = this.shared.c29labels as string[];
      const required = ['操作', '用户Nos', '用户角色', '房间列表'];
      const missing = required.filter((f) => !labels.includes(f));
      return {
        expect: '标题=新建语音房角色；四项表单项齐全',
        real: `标题=${title}；缺失=${missing.length === 0 ? '无' : missing.join('、')}`,
        pass: title === '新建语音房角色' && missing.length === 0
      };
    });
    await this.act('用例#29 取消弹窗', async () => {
      await this.cancelRoomDialog(this.page!);
      await this.managerReset();
    });
    await this.check('用例#29-② 点击「取 消」后弹窗关闭且列表 Total 不变', async () => {
      const visible = await this.page!.locator('.el-dialog__wrapper:visible').count();
      const total = await this.totalCount(this.page!);
      return {
        expect: `弹窗关闭；Total=${this.shared.c29total}`,
        real: `弹窗数=${visible}；Total=${total}`,
        pass: visible === 0 && total === Number(this.shared.c29total)
      };
    });

    // ---------------- 用例#30 ----------------
    await this.act('用例#30 按房间类型 orders 查看行操作按钮', async () => {
      await this.managerReset();
      await this.managerPick('请选择房间类型', '派单(orders)');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
      const count = await this.tableRowCount(this.page!);
      const all: string[][] = [];
      for (let i = 0; i < Math.min(count, 5); i++) all.push(await this.managerRowButtons(i));
      this.shared.c30orders = all;
      await this.shot('case30-orders-actions');
    });
    await this.check('用例#30-① orders 行操作列显示 details/加入派单厅跳转Def/加入派单厅跳转New', async () => {
      const rows = this.shared.c30orders as string[][];
      const bad = rows.filter((b) => !['details', '加入派单厅跳转Def', '加入派单厅跳转New'].every((x) => b.includes(x)));
      return { expect: '每行含 details/加入派单厅跳转Def/加入派单厅跳转New', real: `检查 ${rows.length} 行，不符 ${bad.length} 行`, pass: rows.length > 0 && bad.length === 0 };
    });
    await this.act('用例#30 按房间类型 person 查看行操作按钮', async () => {
      await this.managerReset();
      await this.managerPick('请选择房间类型', '个人房');
      await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
      const count = await this.tableRowCount(this.page!);
      const all: string[][] = [];
      for (let i = 0; i < Math.min(count, 5); i++) all.push(await this.managerRowButtons(i));
      this.shared.c30person = all;
      await this.shot('case30-person-actions');
    });
    await this.check('用例#30-② person 行操作列显示 details/复制一个', async () => {
      const rows = this.shared.c30person as string[][];
      const bad = rows.filter((b) => !['details', '复制一个'].every((x) => b.includes(x)));
      return { expect: '每行含 details/复制一个', real: `检查 ${rows.length} 行，不符 ${bad.length} 行`, pass: rows.length > 0 && bad.length === 0 };
    });
    await this.check('用例#30-③ 所有行均显示 details 按钮', async () => {
      const orders = this.shared.c30orders as string[][];
      const person = this.shared.c30person as string[][];
      const all = [...orders, ...person];
      const bad = all.filter((b) => !b.includes('details'));
      return { expect: '所有检查行均含 details', real: `检查 ${all.length} 行，不符 ${bad.length} 行`, pass: all.length > 0 && bad.length === 0 };
    });
  }
}

await new RoomRegressionTest().execute();
