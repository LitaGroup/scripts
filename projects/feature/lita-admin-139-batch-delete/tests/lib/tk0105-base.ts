/**
 * 项目139 / TK-0105 用例执行轮次：页面操作与只读观测辅助。
 *
 * 用例来源：/task/20261109/TK-0101/HANDOFF（v5，24 条九列用例）
 * 技术方案：/task/20261109/TK-0101/TECH_DESIGN
 *
 * 本文件只承载页面操作与只读观测，不包含任何验证结论；所有验证点必须落在
 * 各 *.test.ts 的 check() 内，并带「用例#N-①」标记。
 * 业务操作全部通过页面真实触发；数据库仅用于前置造数/就绪确认/清理与只读数据预检。
 */
import type { Page } from 'playwright';
import { AdminBase, UI_BASE, cstValue, escapeRegExp } from './admin-base.ts';

export interface WithdrawRecord {
  rowIndex: number;
  userId: string;
  userNo: string;
  userNick: string;
  /** 成为陪玩师时间（页面文本） */
  becomePlayerTime: string;
  /** 上次提现时间（页面文本） */
  lastCreateTime: string;
  /** 订单金额（页面文本） */
  orderAmount: string;
  /** 状态（页面文本） */
  status: string;
  /** 申请提交时间（页面文本） */
  applyTime: string;
  discountOrderCount: string;
  deductionAmount: string;
  cintaAmount: string;
  bankRisk: string;
  riskType: string;
  friendPlayer: string;
  payMode: string;
  /** 主表全部单元格（含前置空列占位） */
  mainCells: string[];
  /** 固定左列全部单元格 */
  fixedCells: string[];
}

export abstract class Tk0105Base extends AdminBase {
  protected async openBroad(): Promise<void> {
    await this.open('/voice-room/voice-room-broad-config', '.app-container .el-table');
    await this.waitListIdle();
  }

  protected async openAnchor(): Promise<void> {
    await this.open('/voice-room/anchor-certification', '.app-container .el-table');
    await this.waitListIdle();
  }

  protected async openWithdraw(): Promise<void> {
    await this.open('/review/withdrawal', '.app-container .el-table');
    await this.waitListIdle();
  }

  protected async mainRows(): Promise<number> {
    return this.page!.locator('.app-container .el-table > .el-table__body-wrapper tbody tr.el-table__row').count();
  }

  protected async mainCells(rowIndex: number): Promise<string[]> {
    return this.page!.evaluate((index) => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      const row = table.querySelectorAll(':scope > .el-table__body-wrapper tbody tr.el-table__row')[index] as HTMLElement | undefined;
      return row ? Array.from(row.children).map((td) => (td as HTMLElement).innerText.trim()) : [];
    }, rowIndex);
  }

  protected async allMainCells(): Promise<string[][]> {
    return this.page!.evaluate(() => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      return Array.from(table.querySelectorAll(':scope > .el-table__body-wrapper tbody tr.el-table__row')).map((tr) =>
        Array.from((tr as HTMLElement).children).map((td) => (td as HTMLElement).innerText.trim()),
      );
    });
  }

  protected async fixedLeftCells(rowIndex: number): Promise<string[]> {
    return this.page!.evaluate((index) => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      const row = table.querySelectorAll('.el-table__fixed .el-table__fixed-body-wrapper tbody tr.el-table__row')[index] as HTMLElement | undefined;
      return row ? Array.from(row.children).map((td) => (td as HTMLElement).innerText.trim()) : [];
    }, rowIndex);
  }

  protected async fixedRightCells(rowIndex: number): Promise<string[]> {
    return this.page!.evaluate((index) => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      const row = table.querySelectorAll('.el-table__fixed-right .el-table__fixed-body-wrapper tbody tr.el-table__row')[index] as HTMLElement | undefined;
      return row ? Array.from(row.children).map((td) => (td as HTMLElement).innerText.trim()) : [];
    }, rowIndex);
  }

  protected async clickFixedRightAction(rowIndex: number, action: string): Promise<void> {
    const row = this.page!.locator('.app-container .el-table .el-table__fixed-right tbody tr.el-table__row').nth(rowIndex);
    await row.getByRole('button', { name: action, exact: true }).click();
  }

  protected async selectMainRow(rowIndex: number): Promise<void> {
    await this.page!
      .locator('.app-container .el-table > .el-table__body-wrapper tbody tr.el-table__row')
      .nth(rowIndex)
      .locator('.el-checkbox')
      .first()
      .click();
  }

  /** 读取当前 Element UI message box 的标题与正文 */
  protected async confirmInfo(): Promise<{ title: string; message: string; buttons: string[] }> {
    const box = this.page!.locator('.el-message-box').first();
    await box.waitFor({ state: 'visible', timeout: 10000 });
    const title = (await box.locator('.el-message-box__title').innerText()).trim();
    const message = (await box.locator('.el-message-box__message').innerText()).trim();
    const buttons = (await box.locator('button').allInnerTexts()).map((text) => text.trim()).filter(Boolean);
    return { title, message, buttons };
  }

  protected async messageBoxCount(): Promise<number> {
    return this.page!.locator('.el-message-box:visible').count();
  }

  protected async clickBoxButton(text: string): Promise<void> {
    const box = this.page!.locator('.el-message-box').first();
    await box.getByRole('button', { name: text, exact: true }).click();
    await this.page!
      .locator('.el-message-box')
      .first()
      .waitFor({ state: 'hidden', timeout: 10000 })
      .catch(() => undefined);
  }

  /** 清空搜索输入并触发一次查询 */
  protected async clearBroadSearch(): Promise<void> {
    const input = this.page!.locator('.app-container input[placeholder="ROOM ID"]').first();
    await input.fill('');
    await this.page!.locator('.app-container button').filter({ hasText: /^\s*Search\s*$/ }).first().click();
    await this.waitListIdle();
  }

  protected async searchBroad(roomId: string | number): Promise<void> {
    const input = this.page!.locator('.app-container input[placeholder="ROOM ID"]').first();
    await input.fill(String(roomId));
    await this.page!.locator('.app-container button').filter({ hasText: /^\s*Search\s*$/ }).first().click();
    await this.waitListIdle();
  }

  protected async broadRowIndex(roomId: string | number): Promise<number> {
    const rows = await this.allMainCells();
    return rows.findIndex((cells) => cells[1]?.trim() === String(roomId));
  }

  protected async broadRowValues(roomId: string | number): Promise<string[] | null> {
    const index = await this.broadRowIndex(roomId);
    if (index < 0) return null;
    return this.mainCells(index);
  }

  protected async openBroadAddDialog(): Promise<void> {
    await this.page!.locator('.app-container button').filter({ hasText: /^\s*添加\s*$/ }).first().click();
    const dialog = this.page!.locator('.el-dialog').filter({ has: this.page!.locator('.el-dialog__title', { hasText: 'New' }) }).first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
  }

  protected async dialogInputByLabel(label: string, value: string): Promise<void> {
    const dialog = this.page!.locator('.el-dialog:visible').first();
    const item = dialog.locator('.el-form-item').filter({ hasText: label }).first();
    await item.locator('input').first().fill(value);
  }

  protected async dialogInputValueByLabel(label: string): Promise<{ value: string; readonly: boolean }> {
    const dialog = this.page!.locator('.el-dialog:visible').first();
    const item = dialog.locator('.el-form-item').filter({ hasText: label }).first();
    const input = item.locator('input').first();
    return { value: await input.inputValue(), readonly: await input.evaluate((el) => (el as HTMLInputElement).readOnly) };
  }

  /** 广播新增/编辑弹窗：是否发送 lita-team 通知，选择文本 */
  protected async selectBroadNotice(text: string): Promise<void> {
    const dialog = this.page!.locator('.el-dialog:visible').first();
    const item = dialog.locator('.el-form-item').filter({ hasText: '是否发送lita-team通知' }).first();
    await item.locator('.el-radio-button').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(text)}\\s*$`) }).first().click();
  }

  protected async confirmDialog(): Promise<void> {
    const dialog = this.page!.locator('.el-dialog:visible').last();
    await dialog.locator('button').filter({ hasText: /^\s*Confirm\s*$/ }).first().click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
  }

  protected async cancelDialog(): Promise<void> {
    const dialog = this.page!.locator('.el-dialog:visible').last();
    await dialog.locator('button').filter({ hasText: /^\s*Cancel\s*$/ }).first().click();
    await dialog.waitFor({ state: 'hidden', timeout: 15000 });
  }

  /** 关闭当前所有可见的 Element UI 弹窗（用于失败后的清理，不用于断言） */
  protected async closeVisibleDialogs(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      const dialog = this.page!.locator('.el-dialog:visible').first();
      if ((await dialog.count()) === 0) return;
      const cancel = dialog.locator('button').filter({ hasText: /^\s*Cancel\s*$/ }).first();
      if ((await cancel.count()) > 0) {
        await cancel.click().catch(() => undefined);
      } else {
        await this.page!.keyboard.press('Escape').catch(() => undefined);
      }
      await this.page!.waitForTimeout(300);
    }
  }

  /** 广播新增（页面真实提交） */
  protected async createBroad(roomId: string | number, priority: string, userNum: string, notice = '不通知'): Promise<void> {
    await this.openBroadAddDialog();
    await this.dialogInputByLabel('房间ID', String(roomId));
    await this.dialogInputByLabel('优先级', priority);
    await this.dialogInputByLabel('日广播邀请人数', userNum);
    await this.selectBroadNotice(notice);
    await this.confirmDialog();
  }

  /** 广播编辑（页面真实提交） */
  protected async editBroad(roomId: string | number, priority: string, userNum: string, notice = '不通知'): Promise<void> {
    const index = await this.broadRowIndex(roomId);
    if (index < 0) throw new Error(`广播列表未找到房间 ${roomId}`);
    await this.page!
      .locator('.app-container .el-table > .el-table__body-wrapper tbody tr.el-table__row')
      .nth(index)
      .locator('button')
      .filter({ hasText: /^\s*编辑\s*$/ })
      .first()
      .click();
    const dialog = this.page!.locator('.el-dialog:visible').first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
    await this.dialogInputByLabel('优先级', priority);
    await this.dialogInputByLabel('日广播邀请人数', userNum);
    await this.selectBroadNotice(notice);
    await this.confirmDialog();
  }

  /** 广播单条删除：浏览器原生 confirm，返回确认文案 */
  protected async deleteBroadOnce(roomId: string | number): Promise<string> {
    const index = await this.broadRowIndex(roomId);
    if (index < 0) throw new Error(`广播列表未找到房间 ${roomId}`);
    const messagePromise = new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve(''), 10000);
      this.page!.once('dialog', async (dialog) => {
        clearTimeout(timer);
        const message = dialog.message();
        await dialog.accept();
        resolve(message);
      });
    });
    await this.page!
      .locator('.app-container .el-table > .el-table__body-wrapper tbody tr.el-table__row')
      .nth(index)
      .locator('button')
      .filter({ hasText: /^\s*删除\s*$/ })
      .first()
      .click();
    return messagePromise;
  }

  /** 广播清理：存在则删除，忽略不存在 */
  protected async cleanupBroad(roomId: string | number): Promise<void> {
    // 重新进入页面以清除可能残留的弹窗/确认框，再做查询与删除
    await this.openBroad();
    await this.searchBroad(roomId);
    const index = await this.broadRowIndex(roomId);
    if (index < 0) return;
    await this.deleteBroadOnce(roomId);
    await this.waitListIdle();
  }

  // ---------- 主播认证标识配置 ----------

  protected async searchAnchor(userId: string | number): Promise<void> {
    const input = this.page!.locator('.app-container input[placeholder="用户ID"]').first();
    await input.fill(String(userId));
    await this.page!.locator('.app-container button').filter({ hasText: /^\s*Search\s*$/ }).first().click();
    await this.waitListIdle();
  }

  protected async resetAnchorSearch(): Promise<void> {
    await this.page!.locator('.app-container button').filter({ hasText: /^\s*Reset\s*$/ }).first().click();
    await this.waitListIdle();
  }

  protected async anchorRowIndex(userId: string | number): Promise<number> {
    const rows = await this.allMainCells();
    return rows.findIndex((cells) => cells[2]?.trim() === String(userId));
  }

  protected async anchorRowValues(userId: string | number): Promise<string[] | null> {
    const index = await this.anchorRowIndex(userId);
    if (index < 0) return null;
    return this.mainCells(index);
  }

  protected async openAnchorAddDialog(): Promise<void> {
    await this.page!.locator('.app-container button').filter({ hasText: /^\s*新增认证\s*$/ }).first().click();
    const dialog = this.page!.locator('.el-dialog').filter({ has: this.page!.locator('.el-dialog__title', { hasText: '新增认证' }) }).first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
  }

  protected async openAnchorEditDialog(userId: string | number): Promise<void> {
    const index = await this.anchorRowIndex(userId);
    if (index < 0) throw new Error(`主播认证列表未找到用户 ${userId}`);
    await this.clickFixedRightAction(index, '编辑');
    const dialog = this.page!.locator('.el-dialog').filter({ has: this.page!.locator('.el-dialog__title', { hasText: '编辑认证' }) }).first();
    await dialog.waitFor({ state: 'visible', timeout: 15000 });
  }

  protected async fillAnchorUsers(users: string): Promise<void> {
    const dialog = this.page!.locator('.el-dialog:visible').first();
    await dialog.locator('textarea[placeholder="支持多个，用逗号分隔，如：100001,100002"]').first().fill(users);
  }

  protected async selectAnchorType(type: string): Promise<void> {
    const dialog = this.page!.locator('.el-dialog:visible').first();
    const input = dialog.locator('input[placeholder="请选择认证类型"]').first();
    await input.click();
    const option = this.page!
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(type)}\\s*$`) })
      .first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
  }

  protected async fillAnchorContent(content: string): Promise<void> {
    const dialog = this.page!.locator('.el-dialog:visible').first();
    await dialog.locator('input[placeholder="外显的认证文案"]').first().fill(content);
  }

  protected async selectAnchorColor(color: string): Promise<void> {
    const dialog = this.page!.locator('.el-dialog:visible').first();
    await dialog.locator('.el-radio').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(color)}\\s*$`) }).first().click();
  }

  protected async fillAnchorDate(placeholder: string, value: string): Promise<void> {
    const dialog = this.page!.locator('.el-dialog:visible').first();
    const input = dialog.locator(`input[placeholder="${placeholder}"]`).first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
  }

  protected async createAnchor(users: string, type: string, content: string, color: string, effective: string, expiration: string): Promise<void> {
    try {
      await this.openAnchorAddDialog();
      await this.fillAnchorUsers(users);
      await this.selectAnchorType(type);
      await this.fillAnchorContent(content);
      await this.selectAnchorColor(color);
      await this.fillAnchorDate('选择生效时间', effective);
      await this.fillAnchorDate('选择过期时间', expiration);
      await this.confirmDialog();
    } catch (error) {
      await this.closeVisibleDialogs();
      throw error;
    }
  }

  protected async deleteAnchorOnce(userId: string | number, confirm = true): Promise<string> {
    const index = await this.anchorRowIndex(userId);
    if (index < 0) throw new Error(`主播认证列表未找到用户 ${userId}`);
    await this.clickFixedRightAction(index, '删除');
    const info = await this.confirmInfo();
    if (confirm) await this.clickBoxButton('确定');
    return info.message;
  }

  protected async cleanupAnchor(userId: string | number): Promise<void> {
    await this.searchAnchor(userId);
    const index = await this.anchorRowIndex(userId);
    if (index < 0) return;
    await this.deleteAnchorOnce(userId, true);
    await this.waitListIdle();
  }

  // ---------- 提现查询 ----------

  protected async resetWithdrawFilters(): Promise<void> {
    await this.page!.locator('.app-container button').filter({ hasText: /^\s*重置筛选项\s*$/ }).first().click();
    await this.waitListIdle();
  }

  protected async searchWithdraw(): Promise<void> {
    await this.page!.locator('.app-container button').filter({ hasText: /^\s*搜索\s*$/ }).first().click();
    await this.waitListIdle();
  }

  protected async withdrawTotals(): Promise<{ total: number; totalText: string }> {
    const text = (await this.page!.locator('.el-pagination__total').first().innerText().catch(() => '')).trim();
    return { total: Number((text.match(/\d+/) ?? ['0'])[0]), totalText: text };
  }

  protected async withdrawActivePage(): Promise<string> {
    return (await this.page!.locator('.el-pagination .el-pager li.active').first().innerText().catch(() => '')).trim();
  }

  /** 读取当前提现列表全部行（主表 + 固定左列） */
  protected async readWithdrawRows(): Promise<WithdrawRecord[]> {
    const main = await this.allMainCells();
    const fixed = await this.page!.evaluate(() => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      return Array.from(table.querySelectorAll('.el-table__fixed .el-table__fixed-body-wrapper tbody tr.el-table__row')).map((tr) =>
        Array.from((tr as HTMLElement).children).map((td) => (td as HTMLElement).innerText.trim()),
      );
    });
    return main.map((cells, index) => {
      const fixedCells = fixed[index] ?? [];
      return {
        rowIndex: index,
        userId: (fixedCells[1] ?? '').split('\n')[0].trim(),
        userNo: (fixedCells[2] ?? '').replace(/^.*\(([^()]*)\)\s*$/, '$1').trim(),
        userNick: (fixedCells[2] ?? '').replace(/\([^()]*\)\s*$/, '').trim(),
        becomePlayerTime: (cells[22] ?? '').trim(),
        lastCreateTime: (cells[21] ?? '').trim(),
        orderAmount: (cells[23] ?? '').trim(),
        status: (cells[33] ?? '').trim(),
        applyTime: (cells[34] ?? '').trim(),
        discountOrderCount: (cells[17] ?? '').trim(),
        deductionAmount: (cells[18] ?? '').trim(),
        cintaAmount: (cells[19] ?? '').trim(),
        bankRisk: (cells[12] ?? '').trim(),
        riskType: (cells[13] ?? '').trim(),
        friendPlayer: (fixedCells[3] ?? '').trim(),
        payMode: (fixedCells[6] ?? '').trim(),
        mainCells: cells,
        fixedCells,
      };
    });
  }

  protected static recordKey(record: Pick<WithdrawRecord, 'userId' | 'applyTime' | 'orderAmount'>): string {
    return `${record.userId}|${record.applyTime}|${record.orderAmount}`;
  }

  /** 以 1000/页读取未筛选全量快照，再恢复 30/页 */
  protected async captureWithdrawSnapshot(): Promise<Map<string, WithdrawRecord>> {
    await this.openWithdraw();
    await this.changePageSize(1000);
    await this.waitListIdle();
    const rows = await this.readWithdrawRows();
    const map = new Map<string, WithdrawRecord>();
    for (const row of rows) map.set(Tk0105Base.recordKey(row), row);
    await this.changePageSize(30);
    await this.waitListIdle();
    return map;
  }

  protected async selectWithdrawStatus(status: string): Promise<void> {
    const select = this.page!.locator('.app-container .el-select').filter({ has: this.page!.locator('input[placeholder="状态"]') }).first();
    await select.click();
    const option = this.page!
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(status)}\\s*$`) })
      .first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
    // 多选/单选下拉在值更新后才关闭，等待输入框可读值变化
    await this.page!.waitForFunction(
      ({ expected }) => {
        const input = document.querySelector('.app-container .el-select input[placeholder="状态"]') as HTMLInputElement | null;
        if (!input) return true;
        return input.value === expected;
      },
      { expected: status },
      { timeout: 5000 },
    ).catch(() => undefined);
  }

  protected async selectWithdrawOption(placeholder: string, optionText: string): Promise<void> {
    const select = this.page!.locator('.app-container .el-select').filter({ has: this.page!.locator(`input[placeholder="${placeholder}"]`) }).first();
    await select.click();
    const option = this.page!
      .locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(optionText)}\\s*$`) })
      .first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
    await this.page!.keyboard.press('Escape').catch(() => undefined);
  }

  protected async fillWithdrawDateRange(start: string, end: string): Promise<void> {
    const startInput = this.page!.locator('.app-container input[placeholder="开始日期"]').first();
    const endInput = this.page!.locator('.app-container input[placeholder="结束日期"]').first();
    await startInput.click();
    await startInput.fill(start);
    await startInput.press('Tab');
    await this.page!.waitForTimeout(200);
    await endInput.click();
    await endInput.fill(end);
    await endInput.press('Enter');
    await this.page!.keyboard.press('Escape').catch(() => undefined);
  }

  protected async withdrawRowIndexByUser(userId: string, applyTime: string): Promise<number> {
    const rows = await this.readWithdrawRows();
    return rows.findIndex((row) => row.userId === userId && row.applyTime === applyTime);
  }

  /** 打开「查看陪玩师」页面读取 locale / CountryIsoCode，用于大区/国家筛选的页面观测 */
  protected async readUserRegion(userId: string): Promise<{ locale: string; countryCode: string; countryName: string }> {
    const userPage = await this.context!.newPage();
    try {
      await userPage.goto(`${UI_BASE}/#/play-manager-index?uid=${userId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await userPage.waitForSelector('.app-container .el-table', { timeout: 45000 });
      await userPage.waitForFunction(() => document.querySelectorAll('.app-container .el-table__body-wrapper tbody tr').length > 0, null, { timeout: 30000 });
      return await userPage.evaluate(() => {
        const table = document.querySelector('.app-container .el-table') as HTMLElement;
        const heads = Array.from(table.querySelectorAll(':scope > .el-table__header-wrapper th')).map((th) => (th as HTMLElement).innerText.trim());
        const row = table.querySelector(':scope > .el-table__body-wrapper tbody tr.el-table__row') as HTMLElement | null;
        const cells = row ? Array.from(row.children).map((td) => (td as HTMLElement).innerText.trim()) : [];
        const value = (label: string) => {
          const index = heads.findIndex((head) => head === label);
          return index >= 0 ? (cells[index] ?? '').trim() : '';
        };
        return { locale: value('locale'), countryCode: value('CountryIsoCode'), countryName: value('CountryName') };
      });
    } finally {
      await userPage.close().catch(() => undefined);
    }
  }

  /** 判断单元格金额是否大于 0（兼容 VND 0.00 / 0 / -） */
  protected static amountPositive(text: string): boolean {
    const normalized = text.replace(/[,\s]/g, '');
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) > 0 : false;
  }

  /** 读取元素相对定位点截图（关键验证点） */
  protected async shotElement(selector: string, tag: string): Promise<string> {
    const locator = this.page!.locator(selector).first();
    const name = await this.shot(tag);
    await locator.screenshot({ path: `${this.evidenceDir}/${name.replace(/\.png$/, '')}-element.png` }).catch(() => undefined);
    return name;
  }

  protected async pageText(): Promise<string> {
    return (await this.page!.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  }

  protected async waitAnyToast(timeout = 10000): Promise<string[]> {
    await this.page!.locator('.el-message').first().waitFor({ state: 'visible', timeout }).catch(() => undefined);
    return (await this.page!.locator('.el-message').allInnerTexts()).map((text) => text.trim());
  }

  protected async waitNotification(timeout = 30000): Promise<string> {
    const notification = this.page!.locator('.el-notification').first();
    await notification.waitFor({ state: 'visible', timeout });
    return (await notification.innerText()).replace(/\s+/g, ' ').trim();
  }

  protected static timeText(value: unknown): string {
    return cstValue(value);
  }

  protected async gotoWithdrawPage(pageNo: number): Promise<void> {
    await this.gotoPage(pageNo);
    await this.waitListIdle();
  }

  protected pageHandle(): Page {
    return this.page!;
  }
}
