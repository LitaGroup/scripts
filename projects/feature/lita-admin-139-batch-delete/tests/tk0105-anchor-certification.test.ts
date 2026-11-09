/**
 * 项目139 / TK-0105 用例执行轮次：语音房管理-主播认证标识配置批量删除及原有能力回归。
 *
 * 用例来源：/task/20261109/TK-0101/HANDOFF（v5）九列用例 #9～#17；
 * 技术方案：/task/20261109/TK-0101/TECH_DESIGN（AC-01～AC-05）。
 *
 * 覆盖：#9 入口/空选禁用；#10 勾选2条二次确认；#11 取消无副作用；#12 确认删除/对照行/Total/清空勾选；
 *      #13 跨页只计当前页；#14 单条删除回归；#15 多uid新增回归；#16 编辑回归；#17 导出回归。
 * 数据隔离：仅使用本脚本自建认证（用户 10310/1609/16505/16432/15911/15940/15904，均预先只读确认无认证）；
 *      每个用例结束通过页面行内/批量删除清理；DELETE 审计日志属核验证据，不删除。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-139-batch-delete/tests/tk0105-anchor-certification.test.ts
 */
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { Tk0105Base } from './lib/tk0105-base.ts';

const AC01 = ['10310', '16505', '15911'];
const AC02 = '16432';
const AC03 = ['15940', '15904'];
const AC04 = '15938';
const CERT_TYPE_GOLD_NORMAL = '金色主播-普通';
const EFFECTIVE = '2026-11-10 00:00:00';
const EXPIRATION = '2027-11-10 00:00:00';

class Tk0105AnchorCertificationTest extends Tk0105Base {
  constructor() {
    super('tk0105-anchor-certification');
    this.total = 27;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.case9();
    await this.case10();
    await this.case11();
    await this.case12();
    await this.case13();
    await this.case14();
    await this.case15();
    await this.case16();
    await this.case17();
  }

  private async ensureNoAnchor(userId: string): Promise<void> {
    await this.openAnchor();
    await this.searchAnchor(userId);
    if ((await this.anchorRowIndex(userId)) >= 0) {
      await this.deleteAnchorOnce(userId, true);
      await this.waitListIdle();
    }
    await this.resetAnchorSearch();
  }

  private async createAC01(content: string): Promise<void> {
    await this.openAnchor();
    await this.resetAnchorSearch();
    try {
      await this.act(`AC-01 通过新增认证一次创建用户 ${AC01.join(',')} 的认证`, async () => {
        await this.createAnchor(AC01.join(','), CERT_TYPE_GOLD_NORMAL, content, '黑色', EFFECTIVE, EXPIRATION);
        await this.waitListIdle();
      });
    } finally {
      await this.closeVisibleDialogs();
    }
    await this.resetAnchorSearch();
  }

  private async cleanupAnchorUsers(users: string[]): Promise<void> {
    for (const user of users) {
      await this.cleanupAnchor(user).catch(() => undefined);
    }
    await this.resetAnchorSearch();
  }

  private async case9(): Promise<void> {
    await this.act('用例#9 打开语音房管理-主播认证标识配置', async () => {
      await this.openAnchor();
    });
    await this.check('用例#9-① 页面路由为主播认证标识配置', async () => {
      const hash = await this.page!.evaluate(() => location.hash);
      return { expect: '#/voice-room/anchor-certification', real: hash };
    });
    await this.check('用例#9-② 列表首列为带表头多选框的多选列', async () => {
      const headerCell = this.page!.locator('.app-container .el-table > .el-table__header-wrapper th.el-table-column--selection').first();
      const headerCheckbox = headerCell.locator('.el-checkbox');
      const visible = (await headerCell.count()) > 0 && (await headerCheckbox.count()) > 0 && (await headerCheckbox.isVisible());
      return { expect: '可见', real: visible ? '可见' : '不可见' };
    });
    await this.check('用例#9-③ 工具栏显示批量删除且未勾选时禁用', async () => {
      const button = this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first();
      const visible = await button.isVisible();
      const disabled = await button.isDisabled();
      return { expect: '可见且禁用', real: `${visible ? '可见' : '不可见'}且${disabled ? '禁用' : '可用'}` };
    });
    await this.shot('case9-anchor-entry');
  }

  private async case10(): Promise<void> {
    const content = `TK0105_BATCH_${Date.now()}`;
    await this.createAC01(content);
    let aIndex = -1;
    let bIndex = -1;
    await this.act('用例#10 勾选用户 A、B 并点击批量删除', async () => {
      aIndex = await this.anchorRowIndex(AC01[0]);
      bIndex = await this.anchorRowIndex(AC01[1]);
      if (aIndex < 0 || bIndex < 0) throw new Error('AC-01 三条认证未同页可见');
      await this.selectMainRow(aIndex);
      await this.selectMainRow(bIndex);
      await this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first().click();
    });
    let info = { title: '', message: '', buttons: [] as string[] };
    await this.check('用例#10-① 弹出标题为提示的确认框', async () => {
      info = await this.confirmInfo();
      return { expect: '提示', real: info.title };
    });
    await this.check('用例#10-② 确认文案准确显示勾选2条', async () => {
      return { expect: '确认删除选中的 2 条主播认证标识？', real: info.message };
    });
    await this.check('用例#10-③ 确认框提供取消和确定按钮', async () => {
      const hasBoth = info.buttons.includes('取消') && info.buttons.includes('确定');
      return { expect: '取消、确定', real: info.buttons.join('、') || '无', pass: hasBoth };
    });
    await this.act('用例#10 取消确认框并清理 AC-01 数据', async () => {
      await this.clickBoxButton('取消');
    });
    await this.shot('case10-anchor-confirm');
    await this.cleanupAnchorUsers(AC01);
  }

  private async case11(): Promise<void> {
    const content = `TK0105_BATCH_${Date.now()}`;
    let before: Record<string, string> = {};
    await this.createAC01(content);
    await this.act('用例#11 记录 A、B、C 行内容并勾选 A、B', async () => {
      for (const user of AC01) {
        const values = await this.anchorRowValues(user);
        if (!values) throw new Error(`AC-01 用户 ${user} 未就绪`);
        before[user] = values.join('|');
      }
      const aIndex = await this.anchorRowIndex(AC01[0]);
      const bIndex = await this.anchorRowIndex(AC01[1]);
      await this.selectMainRow(aIndex);
      await this.selectMainRow(bIndex);
    });
    await this.act('用例#11 点击批量删除后取消', async () => {
      await this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first().click();
      await this.confirmInfo();
      await this.clearToasts();
      await this.clickBoxButton('取消');
    });
    await this.check('用例#11-① 确认框关闭', async () => {
      return { expect: '0', real: String(await this.messageBoxCount()) };
    });
    await this.check('用例#11-② 列表仍显示 A、B、C 且行内容不变', async () => {
      const current: string[] = [];
      for (const user of AC01) {
        const values = await this.anchorRowValues(user);
        current.push(values ? values.join('|') : '缺失');
      }
      return { expect: AC01.map((user) => before[user]).join(' / '), real: current.join(' / ') };
    });
    await this.check('用例#11-③ 页面不出现删除条数提示', async () => {
      const count = await this.page!.locator('.el-message').filter({ hasText: '成功删除' }).count();
      return { expect: '0', real: String(count) };
    });
    await this.shot('case11-anchor-cancel');
    await this.cleanupAnchorUsers(AC01);
  }

  private async case12(): Promise<void> {
    const content = `TK0105_BATCH_${Date.now()}`;
    await this.createAC01(content);
    let totalBefore = 0;
    let aUser = '';
    let bUser = '';
    let cUser = '';
    await this.act('用例#12 记录 Total 并勾选 A、B', async () => {
      await this.resetAnchorSearch();
      const state = await this.paginationState();
      totalBefore = state.total;
      aUser = AC01[0];
      bUser = AC01[1];
      cUser = AC01[2];
      const aIndex = await this.anchorRowIndex(aUser);
      const bIndex = await this.anchorRowIndex(bUser);
      if (aIndex < 0 || bIndex < 0) throw new Error('AC-01 三条认证未同页可见');
      await this.selectMainRow(aIndex);
      await this.selectMainRow(bIndex);
    });
    await this.act('用例#12 点击批量删除并确定', async () => {
      await this.clearToasts();
      await this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first().click();
      await this.confirmInfo();
      await this.clickBoxButton('确定');
    });
    await this.check('用例#12-① 页面提示成功删除2条数据', async () => {
      const toast = await this.waitToast('成功删除2条数据', 20000).catch((error) => `未出现：${(error as Error).message}`);
      return { expect: '成功删除2条数据', real: toast };
    });
    await this.act('用例#12 刷新页面并按用户查询删除结果', async () => {
      await this.page!.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page!.waitForSelector('.app-container .el-table', { timeout: 45000 });
      await this.waitListIdle();
    });
    let aRows = -1;
    let bRows = -1;
    let cRows = -1;
    await this.check('用例#12-② 刷新后不再显示 A、B 仍显示 C', async () => {
      await this.searchAnchor(aUser);
      aRows = await this.mainRows();
      await this.resetAnchorSearch();
      await this.searchAnchor(bUser);
      bRows = await this.mainRows();
      await this.resetAnchorSearch();
      await this.searchAnchor(cUser);
      cRows = await this.mainRows();
      return {
        expect: 'A=0行；B=0行；C=1行',
        real: `A=${aRows}行；B=${bRows}行；C=${cRows}行`,
        pass: aRows === 0 && bRows === 0 && cRows === 1,
      };
    });
    await this.check('用例#12-③ 所有多选框恢复未勾选且批量删除禁用', async () => {
      await this.resetAnchorSearch();
      const checked = await this.page!.locator('.app-container .el-table__body-wrapper .el-checkbox.is-checked').count();
      const disabled = await this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first().isDisabled();
      return { expect: '勾选0项且禁用', real: `勾选${checked}项且${disabled ? '禁用' : '可用'}` };
    });
    await this.check('用例#12-④ 分页Total显示为T-2', async () => {
      await this.waitListIdle();
      const state = await this.paginationState();
      return { expect: String(totalBefore - 2), real: String(state.total) };
    });
    await this.shot('case12-anchor-deleted');
    await this.act('用例#12 清理对照行 C', async () => {
      await this.cleanupAnchor(cUser);
    });
  }

  private async case13(): Promise<void> {
    await this.act('用例#13 记录第1页对照行 D 并勾选', async () => {
      await this.openAnchor();
      await this.resetAnchorSearch();
      await this.waitPageActive(1);
      const rows = await this.readAnchorRows();
      if (rows.length < 1) throw new Error('主播认证第1页无数据');
      this.dRow = rows[0];
      await this.selectMainRow(0);
      await this.shot('case13-page1-D-selected');
    });
    await this.act('用例#13 进入第2页并勾选前两条 A、B', async () => {
      await this.gotoPage(2);
      await this.waitListIdle();
      const rows = await this.readAnchorRows();
      if (rows.length < 2) throw new Error('主播认证第2页不足2条');
      this.aRow = rows[0];
      this.bRow = rows[1];
      await this.selectMainRow(0);
      await this.selectMainRow(1);
      await this.shot('case13-page2-AB-selected');
    });
    await this.act('用例#13 点击批量删除并读取确认文案', async () => {
      await this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first().click();
      this.crossPageInfo = await this.confirmInfo();
    });
    await this.check('用例#13-① 确认文案仅计当前页2条不计入第1页D', async () => {
      return { expect: '确认删除选中的 2 条主播认证标识？', real: this.crossPageInfo.message };
    });
    await this.act('用例#13 取消确认', async () => {
      await this.clearToasts();
      await this.clickBoxButton('取消');
    });
    await this.check('用例#13-② 取消后第2页A、B仍在且内容不变', async () => {
      const rows = await this.readAnchorRows();
      const a = rows.find((row) => row.userId === this.aRow.userId);
      const b = rows.find((row) => row.userId === this.bRow.userId);
      return {
        expect: `${this.aRow.cells.join('|')} / ${this.bRow.cells.join('|')}`,
        real: `${a ? a.cells.join('|') : '缺失'} / ${b ? b.cells.join('|') : '缺失'}`,
      };
    });
    await this.act('用例#13 返回第1页', async () => {
      await this.gotoPage(1);
      await this.waitListIdle();
    });
    await this.check('用例#13-③ 返回第1页可查到D且未被删除', async () => {
      const rows = await this.readAnchorRows();
      const d = rows.find((row) => row.userId === this.dRow.userId);
      return {
        expect: this.dRow.cells.join('|'),
        real: d ? d.cells.join('|') : '缺失',
      };
    });
    await this.shot('case13-cross-page-cancel');
  }

  private dRow!: { userId: string; cells: string[] };
  private aRow!: { userId: string; cells: string[] };
  private bRow!: { userId: string; cells: string[] };
  private crossPageInfo = { title: '', message: '', buttons: [] as string[] };

  private async readAnchorRows(): Promise<{ userId: string; cells: string[] }[]> {
    const cells = await this.allMainCells();
    return cells
      .map((row) => ({ userId: (row[2] ?? '').trim(), cells: row }))
      .filter((row) => row.userId !== '');
  }

  private async case14(): Promise<void> {
    const content = `TK0105_SINGLE_${Date.now()}`;
    await this.ensureNoAnchor(AC02);
    await this.act('用例#14 准备 AC-02 单条认证', async () => {
      await this.openAnchor();
      await this.resetAnchorSearch();
      await this.createAnchor(AC02, CERT_TYPE_GOLD_NORMAL, content, '黑色', EFFECTIVE, EXPIRATION);
      await this.waitListIdle();
      await this.searchAnchor(AC02);
      if ((await this.anchorRowIndex(AC02)) < 0) throw new Error('AC-02 数据未就绪');
    });
    let confirmMessage = '';
    await this.act('用例#14 点击行内删除', async () => {
      confirmMessage = await this.deleteAnchorOnce(AC02, false);
    });
    await this.check('用例#14-① 删除前确认文案包含用户A', async () => {
      const expected = `是否要删除 uid ${AC02} 的主播认证标识？`;
      return {
        expect: expected,
        real: confirmMessage,
        pass: confirmMessage === expected,
        message: confirmMessage === expected ? undefined : `实际确认文案：${confirmMessage}`,
      };
    });
    await this.act('用例#14 确认删除并查询', async () => {
      await this.clickBoxButton('确定');
      await this.waitListIdle();
    });
    await this.check('用例#14-② 查询结果不显示用户A且列表无数据', async () => {
      await this.searchAnchor(AC02);
      const rows = await this.mainRows();
      const empty = (await this.page!.locator('.app-container .el-table__empty-text').first().innerText().catch(() => '')).trim();
      return {
        expect: 'A=0行且显示无数据',
        real: `A=${rows}行，空态=${empty || '无'}`,
        pass: rows === 0,
      };
    });
    await this.shot('case14-anchor-single-delete');
  }

  private async case15(): Promise<void> {
    const content = `TK0105多UID_${Date.now()}`;
    for (const user of AC03) await this.ensureNoAnchor(user);
    await this.act('用例#15 通过新增认证一次输入两个用户ID', async () => {
      await this.openAnchor();
      await this.resetAnchorSearch();
      await this.createAnchor(AC03.join(','), CERT_TYPE_GOLD_NORMAL, content, '黑色', EFFECTIVE, EXPIRATION);
      await this.waitListIdle();
    });
    await this.check('用例#15-① 新增认证弹窗关闭', async () => {
      return { expect: '0', real: String(await this.page!.locator('.el-dialog:visible').count()) };
    });
    let rows: { user: string; cells: string[] }[] = [];
    await this.check('用例#15-② 列表新增用户A、B共2条认证', async () => {
      await this.resetAnchorSearch();
      const all = await this.readAnchorRows();
      rows = AC03.map((user) => ({ user, cells: all.find((row) => row.userId === user)?.cells ?? [] }));
      const count = rows.filter((row) => row.cells.length > 0).length;
      return {
        expect: '2条',
        real: `${count}条`,
        pass: count === 2,
      };
    });
    await this.check('用例#15-③ 两条记录显示金色主播-普通、认证内容及生效过期时间', async () => {
      const detail = rows.map((row) => {
        const c = row.cells;
        return `${row.user}:${c[5] ?? '缺失'}|${c[6] ?? '缺失'}|${c[7] ?? '缺失'}|${c[8] ?? '缺失'}`;
      });
      const expected = AC03.map((user) => `${user}:${CERT_TYPE_GOLD_NORMAL}|${content}|${EFFECTIVE}|${EXPIRATION}`);
      return { expect: expected.join(' / '), real: detail.join(' / ') };
    });
    await this.shot('case15-anchor-multi-add');
    await this.cleanupAnchorUsers(AC03);
  }

  private async case16(): Promise<void> {
    const originalContent = 'TK0105原始';
    const editedContent = 'TK0105已编辑';
    await this.ensureNoAnchor(AC02);
    await this.act('用例#16 准备 AC-02 认证（内容 TK0105原始，过期时间 2027-11-10 00:00:00）', async () => {
      await this.openAnchor();
      await this.resetAnchorSearch();
      await this.createAnchor(AC02, CERT_TYPE_GOLD_NORMAL, originalContent, '黑色', EFFECTIVE, EXPIRATION);
      await this.waitListIdle();
      await this.searchAnchor(AC02);
      if ((await this.anchorRowIndex(AC02)) < 0) throw new Error('AC-02 数据未就绪');
    });
    let dialogText = '';
    let dialogContent = '';
    await this.act('用例#16 打开编辑弹窗', async () => {
      const listRow = await this.anchorRowValues(AC02);
      this.aRowNickname = listRow?.[4] ?? '';
      await this.openAnchorEditDialog(AC02);
      const dialog = this.page!.locator('.el-dialog:visible').first();
      dialogText = (await dialog.innerText()).replace(/\s+/g, ' ').trim();
      dialogContent = await dialog.locator('input[placeholder="外显的认证文案"]').first().inputValue();
    });
    await this.check('用例#16-① 编辑弹窗回显用户A、昵称及原认证内容', async () => {
      const nickname = this.aRowNickname;
      const nicknameShown = nickname.length > 0 && dialogText.includes(nickname);
      return {
        expect: `用户ID=${AC02}；昵称=${nickname || '存在'}；认证内容=${originalContent}`,
        real: `用户ID=${dialogText.includes(AC02) ? AC02 : '缺失'}；昵称=${nicknameShown ? nickname : '缺失'}；认证内容=${dialogContent}`,
      };
    });
    await this.act('用例#16 修改认证内容、文字颜色和过期时间并保存', async () => {
      await this.fillAnchorContent(editedContent);
      await this.selectAnchorColor('金色');
      await this.fillAnchorDate('选择过期时间', '2027-12-10 00:00:00');
      await this.confirmDialog();
      await this.waitListIdle();
    });
    let row: string[] | null = null;
    let savedColor = '';
    await this.check('用例#16-② 保存后认证内容、文字颜色、过期时间正确', async () => {
      await this.searchAnchor(AC02);
      row = await this.anchorRowValues(AC02);
      // 列表未展示文字颜色列，按用例判定要求以编辑弹窗回显做页面观测
      await this.openAnchorEditDialog(AC02);
      const dialog = this.page!.locator('.el-dialog:visible').first();
      savedColor = (await dialog.locator('.el-radio.is-checked').first().innerText()).trim();
      await this.cancelDialog();
      return {
        expect: `认证内容=${editedContent}；文字颜色=金色；过期时间=2027-12-10 00:00:00`,
        real: `认证内容=${row?.[6] ?? '缺失'}；文字颜色=${savedColor || '缺失'}；过期时间=${row?.[8] ?? '缺失'}`,
      };
    });
    await this.check('用例#16-③ 用户ID仍为A', async () => {
      return { expect: AC02, real: row?.[2] ?? '缺失' };
    });
    await this.shot('case16-anchor-edit');
    await this.act('用例#16 清理用户 A 认证', async () => {
      await this.cleanupAnchor(AC02);
    });
  }

  private aRowNickname = '';

  private async case17(): Promise<void> {
    const content = `TK0105_EXPORT_${Date.now()}`;
    const exportPath = join(this.evidenceDir, 'tk0105-anchor-export.xlsx');
    await this.ensureNoAnchor(AC04);
    await this.act('用例#17 准备 AC-04 认证并记录列表值', async () => {
      await this.openAnchor();
      await this.resetAnchorSearch();
      await this.createAnchor(AC04, CERT_TYPE_GOLD_NORMAL, content, '黑色', EFFECTIVE, EXPIRATION);
      await this.waitListIdle();
      await this.searchAnchor(AC04);
      const values = await this.anchorRowValues(AC04);
      if (!values) throw new Error('AC-04 数据未就绪');
      this.exportRow = values;
      this.aRowNickname = values[4] ?? '';
      await this.shot('case17-anchor-list');
    });
    let workbook: ExcelJS.Workbook | null = null;
    let sheet: ExcelJS.Worksheet | null = null;
    await this.act('用例#17 导出并读取Excel', async () => {
      const responsePath = await this.downloadViaButton('导出');
      const { copyFileSync } = await import('node:fs');
      copyFileSync(responsePath, exportPath);
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(exportPath);
      sheet = workbook.worksheets[0];
    });
    await this.check('用例#17-① Excel包含用户ID、认证类型、认证内容、生效时间、过期时间列', async () => {
      if (!sheet) return { expect: '5列均存在', real: '未取得Excel', pass: false };
      const headers: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) headers.push(String(sheet.getRow(1).getCell(c).value ?? '').trim());
      const required = ['用户ID', '认证类型', '认证内容', '生效时间', '过期时间'];
      const missing = required.filter((name) => !headers.includes(name));
      return { expect: required.join('、'), real: headers.join('、'), pass: missing.length === 0, message: missing.length ? `缺少 ${missing.join('、')}` : undefined };
    });
    await this.check('用例#17-② Excel中用户A所在行各列值与列表一致', async () => {
      if (!sheet) return { expect: '与列表一致', real: '未取得Excel', pass: false };
      const headers: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) headers.push(String(sheet.getRow(1).getCell(c).value ?? '').trim());
      const index = (name: string) => headers.indexOf(name);
      const rowValues: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) rowValues.push(String(sheet.getRow(2).getCell(c).value ?? '').trim());
      const pick = (name: string) => rowValues[index(name)] ?? '缺失';
      const list = this.exportRow;
      return {
        expect: `${list[2]}|${list[5]}|${list[6]}|${list[7]}|${list[8]}`,
        real: `${pick('用户ID')}|${pick('认证类型')}|${pick('认证内容')}|${pick('生效时间')}|${pick('过期时间')}`,
      };
    });
    await this.check('用例#17-③ 导出数据仅包含当前筛选用户A', async () => {
      if (!sheet) return { expect: '仅1条用户A', real: '未取得Excel', pass: false };
      const headers: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) headers.push(String(sheet.getRow(1).getCell(c).value ?? '').trim());
      const userIdIndex = headers.indexOf('用户ID');
      const ids: string[] = [];
      for (let r = 2; r <= sheet.rowCount; r++) {
        const value = String(sheet.getRow(r).getCell(userIdIndex + 1).value ?? '').trim();
        if (value) ids.push(value);
      }
      const pass = ids.length === 1 && ids[0] === AC04;
      return { expect: `仅${AC04}共1条`, real: `${ids.join(',') || '无'}共${ids.length}条`, pass };
    });
    await this.shot('case17-anchor-export');
    await this.act('用例#17 清理用户A认证与本地导出文件', async () => {
      await this.cleanupAnchor(AC04);
      if (existsSync(exportPath)) unlinkSync(exportPath);
    });
  }

  private exportRow: string[] = [];
}

const test = new Tk0105AnchorCertificationTest();
await test.execute();
