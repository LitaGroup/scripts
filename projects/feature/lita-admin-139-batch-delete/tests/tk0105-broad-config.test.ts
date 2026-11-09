/**
 * 项目139 / TK-0105 用例执行轮次：语音房管理-广播召人配置批量删除及原有能力回归。
 *
 * 用例来源：/task/20261109/TK-0101/HANDOFF（v5）九列用例 #1～#8；
 * 技术方案：/task/20261109/TK-0101/TECH_DESIGN（BD-01～BD-04）。
 *
 * 覆盖：#1 入口/空选禁用；#2 勾选2条二次确认；#3 取消无副作用；#4 确认删除/对照行/清空勾选；
 *      #5 单条删除回归；#6 新增回归；#7 编辑回归；#8 Excel 导入回归。
 * 数据隔离：仅使用本脚本自建广播配置；测试房间取自当前测试环境“是否测试房间=是”且无配置的房间
 *      （10100450/10100452/10100454/10100455/13100137）；每个用例结束通过页面行内删除清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-139-batch-delete/tests/tk0105-broad-config.test.ts
 */
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { Tk0105Base } from './lib/tk0105-base.ts';

const BD01_A = 10100450;
const BD01_B = 10100452;
const BD01_C = 10100454;
const BD02_A = 10100455;
const BD03_A = 13100137;

class Tk0105BroadConfigTest extends Tk0105Base {
  constructor() {
    super('tk0105-broad-config');
    this.total = 22;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.case1();
    await this.case2();
    await this.case3();
    await this.case4();
    await this.case5();
    await this.case6();
    await this.case7();
    await this.case8();
  }

  private async ensureRooms(): Promise<void> {
    await this.openBroad();
    await this.clearBroadSearch();
  }

  private async createBD01(): Promise<void> {
    await this.ensureRooms();
    for (const [room, priority, userNum] of [
      [BD01_A, '10', '100'],
      [BD01_B, '20', '200'],
      [BD01_C, '30', '300'],
    ] as const) {
      await this.searchBroad(room);
      if ((await this.broadRowIndex(room)) >= 0) continue;
      await this.clearBroadSearch();
      await this.act(`BD-01 新增房间 ${room} 广播配置（优先级 ${priority}、日广播邀请人数 ${userNum}）`, async () => {
        await this.createBroad(room, priority, userNum);
      });
      await this.waitListIdle();
    }
    await this.clearBroadSearch();
  }

  private async cleanupBD01(): Promise<void> {
    for (const room of [BD01_A, BD01_B, BD01_C]) {
      await this.act(`清理 BD-01 房间 ${room} 广播配置`, async () => {
        await this.cleanupBroad(room);
      }).catch(() => undefined);
    }
    await this.clearBroadSearch();
  }

  private async case1(): Promise<void> {
    await this.act('用例#1 打开语音房管理-广播召人配置', async () => {
      await this.openBroad();
    });
    await this.check('用例#1-① 页面路由为广播召人配置', async () => {
      const hash = await this.page!.evaluate(() => location.hash);
      return { expect: '#/voice-room/voice-room-broad-config', real: hash };
    });
    await this.check('用例#1-② 列表首列为带表头多选框的多选列', async () => {
      const headerCell = this.page!.locator('.app-container .el-table > .el-table__header-wrapper th.el-table-column--selection').first();
      const headerCheckbox = headerCell.locator('.el-checkbox');
      const visible = (await headerCell.count()) > 0 && (await headerCheckbox.count()) > 0 && (await headerCheckbox.isVisible());
      return { expect: '可见', real: visible ? '可见' : '不可见' };
    });
    await this.check('用例#1-③ 工具栏显示批量删除且未勾选时禁用', async () => {
      const button = this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first();
      const visible = await button.isVisible();
      const disabled = await button.isDisabled();
      return {
        expect: '可见且禁用',
        real: `${visible ? '可见' : '不可见'}且${disabled ? '禁用' : '可用'}`,
      };
    });
    await this.shot('case1-broad-entry');
  }

  private async case2(): Promise<void> {
    await this.act('用例#2 准备 BD-01 三条广播配置并勾选 A、B', async () => {
      await this.createBD01();
      const aIndex = await this.broadRowIndex(BD01_A);
      const bIndex = await this.broadRowIndex(BD01_B);
      if (aIndex < 0 || bIndex < 0) throw new Error('BD-01 数据未就绪');
      await this.selectMainRow(aIndex);
      await this.selectMainRow(bIndex);
    });
    await this.act('用例#2 点击批量删除', async () => {
      await this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first().click();
    });
    let info = { title: '', message: '', buttons: [] as string[] };
    await this.check('用例#2-① 弹出标题为提示的确认框', async () => {
      info = await this.confirmInfo();
      return { expect: '提示', real: info.title };
    });
    await this.check('用例#2-② 确认文案准确显示勾选2条', async () => {
      return { expect: '确认删除选中的 2 条广播召人配置？', real: info.message };
    });
    await this.check('用例#2-③ 确认框提供取消和确定按钮', async () => {
      const hasBoth = info.buttons.includes('取消') && info.buttons.includes('确定');
      return { expect: '取消、确定', real: info.buttons.join('、') || '无', pass: hasBoth };
    });
    await this.act('用例#2 取消确认框并清理 BD-01 数据', async () => {
      await this.clickBoxButton('取消');
    });
    await this.shot('case2-broad-confirm');
    await this.cleanupBD01();
  }

  private async case3(): Promise<void> {
    let before: Record<string, string[]> = {};
    await this.act('用例#3 准备 BD-01 三条广播配置并勾选 A、B', async () => {
      await this.createBD01();
      for (const room of [BD01_A, BD01_B, BD01_C]) {
        const values = await this.broadRowValues(room);
        if (!values) throw new Error(`BD-01 房间 ${room} 未就绪`);
        before[String(room)] = values;
      }
      const aIndex = await this.broadRowIndex(BD01_A);
      const bIndex = await this.broadRowIndex(BD01_B);
      await this.selectMainRow(aIndex);
      await this.selectMainRow(bIndex);
    });
    await this.act('用例#3 点击批量删除并取消', async () => {
      await this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first().click();
      await this.confirmInfo();
      await this.clearToasts();
      await this.clickBoxButton('取消');
    });
    await this.check('用例#3-① 确认框关闭', async () => {
      const count = await this.messageBoxCount();
      return { expect: '0', real: String(count) };
    });
    await this.check('用例#3-② 列表仍显示 A、B、C 且行内容不变', async () => {
      const current: string[] = [];
      for (const room of [BD01_A, BD01_B, BD01_C]) {
        const values = await this.broadRowValues(room);
        current.push(values ? values.join('|') : '缺失');
      }
      const expected = [BD01_A, BD01_B, BD01_C].map((room) => before[String(room)]?.join('|') ?? '缺失');
      return { expect: expected.join(' / '), real: current.join(' / ') };
    });
    await this.check('用例#3-③ 页面不出现删除条数提示', async () => {
      const count = await this.page!.locator('.el-message').filter({ hasText: '成功删除' }).count();
      return { expect: '0', real: String(count) };
    });
    await this.shot('case3-broad-cancel');
    await this.cleanupBD01();
  }

  private async case4(): Promise<void> {
    await this.act('用例#4 准备 BD-01 三条广播配置并勾选 A、B', async () => {
      await this.createBD01();
      const aIndex = await this.broadRowIndex(BD01_A);
      const bIndex = await this.broadRowIndex(BD01_B);
      if (aIndex < 0 || bIndex < 0) throw new Error('BD-01 数据未就绪');
      await this.selectMainRow(aIndex);
      await this.selectMainRow(bIndex);
    });
    await this.act('用例#4 点击批量删除并确定', async () => {
      await this.clearToasts();
      await this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first().click();
      await this.confirmInfo();
      await this.clickBoxButton('确定');
    });
    await this.check('用例#4-① 页面提示成功删除2条数据', async () => {
      const toast = await this.waitToast('成功删除2条数据', 20000).catch((error) => `未出现：${(error as Error).message}`);
      return { expect: '成功删除2条数据', real: toast };
    });
    await this.act('用例#4 刷新页面并按房间查询删除结果', async () => {
      await this.page!.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page!.waitForSelector('.app-container .el-table', { timeout: 45000 });
      await this.waitListIdle();
    });
    let aRows = -1;
    let bRows = -1;
    let cRows = -1;
    await this.check('用例#4-② 刷新后不再显示 A、B 仍显示 C', async () => {
      await this.searchBroad(BD01_A);
      aRows = await this.mainRows();
      await this.searchBroad(BD01_B);
      bRows = await this.mainRows();
      await this.searchBroad(BD01_C);
      cRows = await this.mainRows();
      const pass = aRows === 0 && bRows === 0 && cRows === 1;
      return {
        expect: 'A=0行；B=0行；C=1行',
        real: `A=${aRows}行；B=${bRows}行；C=${cRows}行`,
        pass,
      };
    });
    await this.check('用例#4-③ 所有多选框恢复未勾选且批量删除禁用', async () => {
      const checked = await this.page!.locator('.app-container .el-table__body-wrapper .el-checkbox.is-checked').count();
      const disabled = await this.page!.locator('.app-container button').filter({ hasText: /^\s*批量删除\s*$/ }).first().isDisabled();
      return {
        expect: '勾选0项且禁用',
        real: `勾选${checked}项且${disabled ? '禁用' : '可用'}`,
      };
    });
    await this.shot('case4-broad-deleted');
    await this.cleanupBD01();
  }

  private async case5(): Promise<void> {
    await this.act('用例#5 准备 BD-02 单条广播配置', async () => {
      await this.ensureRooms();
      await this.searchBroad(BD02_A);
      if ((await this.broadRowIndex(BD02_A)) < 0) {
        await this.clearBroadSearch();
        await this.createBroad(BD02_A, '10', '100');
        await this.waitListIdle();
      }
      await this.searchBroad(BD02_A);
      if ((await this.broadRowIndex(BD02_A)) < 0) throw new Error('BD-02 数据未就绪');
    });
    let confirmMessage = '';
    await this.act('用例#5 点击行内删除并接受浏览器确认', async () => {
      confirmMessage = await this.deleteBroadOnce(BD02_A);
      await this.waitListIdle();
    });
    await this.check('用例#5-① 删除前出现浏览器确认提示', async () => {
      return {
        expect: '出现浏览器原生确认提示',
        real: confirmMessage ? `出现：${confirmMessage}` : '未出现',
        pass: confirmMessage.length > 0,
      };
    });
    await this.check('用例#5-② 按 ROOM ID 查询不显示房间 A 且列表无数据', async () => {
      await this.searchBroad(BD02_A);
      const rows = await this.mainRows();
      const empty = (await this.page!.locator('.app-container .el-table__empty-text').first().innerText().catch(() => '')).trim();
      return {
        expect: 'A=0行且显示无数据',
        real: `A=${rows}行，空态=${empty || '无'}`,
        pass: rows === 0,
      };
    });
    await this.shot('case5-broad-single-delete');
  }

  private async case6(): Promise<void> {
    await this.act('用例#6 准备 BD-03 无配置房间 A', async () => {
      await this.ensureRooms();
      await this.searchBroad(BD03_A);
      const index = await this.broadRowIndex(BD03_A);
      if (index >= 0) {
        await this.deleteBroadOnce(BD03_A);
        await this.waitListIdle();
      }
      await this.clearBroadSearch();
    });
    await this.act('用例#6 通过页面添加房间 A 的广播配置（优先级11、日广播邀请人数22、不通知）', async () => {
      await this.createBroad(BD03_A, '11', '22', '不通知');
      await this.waitListIdle();
    });
    await this.check('用例#6-① New 弹窗关闭', async () => {
      const count = await this.page!.locator('.el-dialog:visible').count();
      return { expect: '0', real: String(count) };
    });
    let row: string[] | null = null;
    await this.check('用例#6-② 查询列表仅显示1条房间A的配置', async () => {
      await this.searchBroad(BD03_A);
      const rows = await this.mainRows();
      row = await this.broadRowValues(BD03_A);
      return {
        expect: '1条且房间ID=A',
        real: `${rows}条${row ? `，房间ID=${row[1]}` : '，未找到行'}`,
        pass: rows === 1 && row?.[1] === String(BD03_A),
      };
    });
    await this.check('用例#6-③ 该行优先级为11、日广播邀请人数为22', async () => {
      return {
        expect: '优先级=11；日广播邀请人数=22',
        real: `优先级=${row?.[4] ?? '缺失'}；日广播邀请人数=${row?.[5] ?? '缺失'}`,
      };
    });
    await this.shot('case6-broad-add');
    await this.act('用例#6 清理房间 A 广播配置', async () => {
      await this.cleanupBroad(BD03_A);
    });
  }

  private async case7(): Promise<void> {
    await this.act('用例#7 准备 BD-02 初始配置（优先级10、日广播邀请人数100）', async () => {
      await this.ensureRooms();
      await this.searchBroad(BD02_A);
      if ((await this.broadRowIndex(BD02_A)) < 0) {
        await this.clearBroadSearch();
        await this.createBroad(BD02_A, '10', '100');
        await this.waitListIdle();
      }
      await this.searchBroad(BD02_A);
      if ((await this.broadRowIndex(BD02_A)) < 0) throw new Error('BD-02 数据未就绪');
    });
    let prefill = { room: '', roomReadonly: false, priority: '', userNum: '' };
    await this.act('用例#7 打开编辑弹窗', async () => {
      const index = await this.broadRowIndex(BD02_A);
      await this.page!
        .locator('.app-container .el-table > .el-table__body-wrapper tbody tr.el-table__row')
        .nth(index)
        .locator('button')
        .filter({ hasText: /^\s*编辑\s*$/ })
        .first()
        .click();
      await this.page!.locator('.el-dialog:visible').first().waitFor({ state: 'visible', timeout: 15000 });
      prefill.room = (await this.dialogInputValueByLabel('房间ID')).value;
      prefill.roomReadonly = (await this.dialogInputValueByLabel('房间ID')).readonly;
      prefill.priority = (await this.dialogInputValueByLabel('优先级')).value;
      prefill.userNum = (await this.dialogInputValueByLabel('日广播邀请人数')).value;
    });
    await this.check('用例#7-① 编辑弹窗回显房间A及原值且房间ID只读', async () => {
      return {
        expect: `房间ID=${BD02_A}且只读；优先级=10；日广播邀请人数=100`,
        real: `房间ID=${prefill.room}且${prefill.roomReadonly ? '只读' : '可编辑'}；优先级=${prefill.priority}；日广播邀请人数=${prefill.userNum}`,
      };
    });
    await this.act('用例#7 修改优先级为33、日广播邀请人数为44并保存', async () => {
      await this.dialogInputByLabel('优先级', '33');
      await this.dialogInputByLabel('日广播邀请人数', '44');
      await this.selectBroadNotice('不通知');
      await this.confirmDialog();
      await this.waitListIdle();
    });
    let row: string[] | null = null;
    await this.check('用例#7-② 保存后列表显示优先级33、日广播邀请人数44', async () => {
      await this.searchBroad(BD02_A);
      row = await this.broadRowValues(BD02_A);
      return {
        expect: '优先级=33；日广播邀请人数=44',
        real: `优先级=${row?.[4] ?? '缺失'}；日广播邀请人数=${row?.[5] ?? '缺失'}`,
      };
    });
    await this.check('用例#7-③ 该行房间ID仍为A', async () => {
      return { expect: String(BD02_A), real: row?.[1] ?? '缺失' };
    });
    await this.shot('case7-broad-edit');
    await this.act('用例#7 清理房间 A 广播配置', async () => {
      await this.cleanupBroad(BD02_A);
    });
  }

  private async case8(): Promise<void> {
    const templatePath = join(this.evidenceDir, 'tk0105-broad-template.xlsx');
    const importPath = join(this.evidenceDir, 'tk0105-broad-import.xlsx');
    await this.act('用例#8 准备 BD-04 无配置房间 A', async () => {
      await this.ensureRooms();
      await this.searchBroad(BD03_A);
      const index = await this.broadRowIndex(BD03_A);
      if (index >= 0) {
        await this.deleteBroadOnce(BD03_A);
        await this.waitListIdle();
      }
      await this.clearBroadSearch();
    });
    await this.act('用例#8 下载当前模版并填写房间A（优先级15、日广播邀请人数30）', async () => {
      const [download] = await Promise.all([
        this.page!.waitForEvent('download', { timeout: 30000 }),
        this.page!.locator('.app-container button').filter({ hasText: /^\s*下载模版\s*$/ }).first().click(),
      ]);
      await download.saveAs(templatePath);
      if (!existsSync(templatePath)) throw new Error('模版下载失败');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templatePath);
      const sheet = workbook.worksheets[0];
      sheet.getRow(2).getCell(1).value = BD03_A;
      sheet.getRow(2).getCell(2).value = 15;
      sheet.getRow(2).getCell(3).value = 30;
      await workbook.xlsx.writeFile(importPath);
    });
    await this.act('用例#8 通过上传模版导入配置', async () => {
      await this.page!.locator('.app-container button').filter({ hasText: /^\s*上传模版\s*$/ }).first().click();
      const dialog = this.page!.locator('.el-dialog:visible').filter({ hasText: '通过文件批量广播召人配置' }).first();
      await dialog.waitFor({ state: 'visible', timeout: 15000 });
      await dialog.locator('.el-form-item').filter({ hasText: '是否发送lita-team通知' }).first().locator('.el-radio-button').filter({ hasText: /^\s*不通知\s*$/ }).first().click();
      const responsePromise = this.page!.waitForResponse(
        (response) => /\/api\/voiceroom\/broad\/.*(import|upload)/i.test(response.url()) && response.request().method() === 'POST',
        { timeout: 60000 },
      );
      await dialog.locator('input[type="file"]').setInputFiles(importPath);
      await dialog.locator('button').filter({ hasText: /^\s*Confirm\s*$/ }).first().click();
      const response = await responsePromise.catch(() => undefined);
      if (response) this.log(`导入响应 HTTP ${response.status()}`);
      await this.waitListIdle();
    });
    let row: string[] | null = null;
    await this.check('用例#8-① 查询列表仅显示1条房间A的配置', async () => {
      await this.searchBroad(BD03_A);
      const rows = await this.mainRows();
      row = await this.broadRowValues(BD03_A);
      return {
        expect: '1条且房间ID=A',
        real: `${rows}条${row ? `，房间ID=${row[1]}` : '，未找到行'}`,
        pass: rows === 1 && row?.[1] === String(BD03_A),
      };
    });
    await this.check('用例#8-② 该行优先级为15、日广播邀请人数为30', async () => {
      return {
        expect: '优先级=15；日广播邀请人数=30',
        real: `优先级=${row?.[4] ?? '缺失'}；日广播邀请人数=${row?.[5] ?? '缺失'}`,
      };
    });
    await this.shot('case8-broad-import');
    await this.act('用例#8 清理导入配置与本地临时文件', async () => {
      await this.cleanupBroad(BD03_A);
      for (const file of [templatePath, importPath]) {
        if (existsSync(file)) unlinkSync(file);
      }
    });
  }
}

const test = new Tk0105BroadConfigTest();
await test.execute();
