/**
 * 项目 105「游戏入口配置」页面级基类：筛选 / 分页 / 添加 / 删除 / 导出 的页面操作与页面读数。
 *
 * 所有验证读数均来自页面（DOM 文本/行数/按钮态/下载文件），不读取接口响应作为判定依据。
 * 数据安全：仅页面级 add/delete；自建测试 UID 由用例内清理；不对存量 1003 条执行批量/条件删除
 * （唯一例外：用例#41 按需求方裁决对 2026-11-19 当天存量执行删除并同用例恢复）。
 */
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import type { Page } from 'playwright';
import ExcelJS from 'exceljs';
import { AdminBase, PAGE_HASH, PAGE_URL, UI_BASE, today } from './admin-base.ts';

export interface AddResult {
  /** message-box（有失败）或 toast（全部成功）或 none */
  kind: 'messageBox' | 'toast' | 'none';
  text: string;
  toast: string[];
  dialogOpen: boolean;
  dialogTitle: string;
}

export interface ExportResult {
  filename: string;
  headers: string[];
  rowCount: number;
  userIds: string[];
  createTimes: string[];
  allRows: string[][];
  savedTo: string;
}

export abstract class GameEntryBase extends AdminBase {
  protected readonly today = today();

  // ---------- 页面进入 ----------

  /** 经左侧菜单进入：游戏配置 → 游戏入口配置（用例#1 真实菜单路径）。 */
  protected async openViaMenu(pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    const group = page.locator('.el-submenu__title', { hasText: '游戏配置' }).first();
    await group.waitFor({ state: 'visible', timeout: 30000 });
    const opened = await group.evaluate((el) => !!el.parentElement?.classList.contains('is-opened'));
    if (!opened) await group.click();
    const item = page.locator('.el-menu-item', { hasText: '游戏入口配置' }).first();
    await item.waitFor({ state: 'visible', timeout: 30000 });
    await item.click();
    await page.waitForFunction((hash) => location.hash.includes(hash), PAGE_HASH, { timeout: 30000 });
    await this.waitTableSettled(page);
  }

  /** 地址栏直达（常规用例进入页面；无权限族用于验证拒绝）。 */
  protected async gotoPageDirect(pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // 等待路由落定：无权限跳 404，或有权限渲染出表格（避免 SPA 重定向与哈希读取的竞态）
    await page.waitForFunction(() => {
      const h = location.hash;
      if (h.includes('/404')) return true;
      return !h.includes('/login') && !!document.querySelector('.el-table');
    }, undefined, { timeout: 60000 });
    if ((await page.evaluate(() => location.hash)).includes('/404')) return;
    await this.waitTableSettled(page);
  }

  /** 等待表格落定：无可见 loading，且出现数据行或空态文案。 */
  protected async waitTableSettled(pg: Page | null = null, timeout = 60000): Promise<void> {
    const page = pg ?? this.page!;
    await page.waitForFunction(() => {
      const masks = Array.from(document.querySelectorAll('.el-loading-mask')).filter((el) => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (masks.length > 0) return false;
      const rows = document.querySelectorAll('.el-table__body-wrapper tbody tr').length;
      const empty = (document.querySelector('.el-table__empty-text')?.textContent ?? '').trim();
      return rows > 0 || empty.length > 0;
    }, undefined, { timeout, polling: 150 });
  }

  /** 等待列表查询响应后落定。 */
  protected async waitQuery(pg: Page | null = null, timeout = 30000): Promise<boolean> {
    const page = pg ?? this.page!;
    const resp = await page.waitForResponse((r) => r.url().includes('/entryWhitelist/page'), { timeout }).catch(() => null);
    if (!resp) return false;
    await this.waitTableSettled(page);
    return true;
  }

  // ---------- 页面读数 ----------

  protected async rows(pg: Page | null = null): Promise<string[][]> {
    const page = pg ?? this.page!;
    return page.locator('.el-table__body-wrapper tbody tr').evaluateAll((trs) =>
      trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim()))
    );
  }

  protected async rowCount(pg: Page | null = null): Promise<number> {
    const page = pg ?? this.page!;
    return page.locator('.el-table__body-wrapper tbody tr').count();
  }

  protected async headers(pg: Page | null = null): Promise<string[]> {
    const page = pg ?? this.page!;
    return (await page.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim());
  }

  protected async totalText(pg: Page | null = null): Promise<string> {
    const page = pg ?? this.page!;
    return (await page.locator('.el-pagination__total').innerText().catch(() => '')).trim();
  }

  protected async totalNumber(pg: Page | null = null): Promise<number> {
    const text = await this.totalText(pg);
    const m = text.match(/(\d[\d,]*)/);
    return m ? Number(m[1].replace(/,/g, '')) : -1;
  }

  protected async emptyText(pg: Page | null = null): Promise<string> {
    const page = pg ?? this.page!;
    return (await page.locator('.el-table__empty-text').innerText().catch(() => '')).trim();
  }

  protected async activePage(pg: Page | null = null): Promise<string> {
    const page = pg ?? this.page!;
    return (await page.locator('.el-pagination li.number.active').innerText().catch(() => '')).trim();
  }

  protected async pageSizeValue(pg: Page | null = null): Promise<string> {
    const page = pg ?? this.page!;
    return (await page.locator('.el-pagination .el-select .el-input__inner').first().inputValue().catch(() => '')).trim();
  }

  protected async buttonState(name: string, pg: Page | null = null): Promise<{ disabled: boolean; cls: string }> {
    const page = pg ?? this.page!;
    const btn = page.getByRole('button', { name }).first();
    return { disabled: await btn.isDisabled().catch(() => true), cls: (await btn.getAttribute('class').catch(() => '')) ?? '' };
  }

  // ---------- 筛选 ----------

  protected async uidInput(pg: Page | null = null) {
    const page = pg ?? this.page!;
    return page.locator('input[placeholder="用户 UID"]').first();
  }

  protected async fillUid(value: string, pg: Page | null = null): Promise<void> {
    const input = await this.uidInput(pg);
    await input.fill(value);
    const handle = await input.elementHandle();
    await (pg ?? this.page!).waitForFunction(([el, v]) => (el as HTMLInputElement).value === v, [handle, value] as const, { timeout: 15000 });
  }

  protected async uidValue(pg: Page | null = null): Promise<string> {
    return (await this.uidInput(pg)).inputValue();
  }

  protected async dateValues(pg: Page | null = null): Promise<[string, string]> {
    const page = pg ?? this.page!;
    const start = await page.locator('input[placeholder="添加开始日期"]').first().inputValue();
    const end = await page.locator('input[placeholder="添加结束日期"]').first().inputValue();
    return [start, end];
  }

  protected async clickQuery(pg: Page | null = null): Promise<boolean> {
    const page = pg ?? this.page!;
    const wait = page.waitForResponse((r) => r.url().includes('/entryWhitelist/page'), { timeout: 4000 }).catch(() => null);
    await page.getByRole('button', { name: '查询' }).first().click();
    const resp = await wait;
    if (!resp) return false;
    await this.waitTableSettled(page);
    return true;
  }

  protected async clickReset(pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    const wait = page.waitForResponse((r) => r.url().includes('/entryWhitelist/page'), { timeout: 30000 }).catch(() => null);
    await page.getByRole('button', { name: '重置' }).first().click();
    await wait;
    await this.waitTableSettled(page);
    await this.drainMessages(page);
  }

  protected async queryByUid(uid: string, pg: Page | null = null): Promise<void> {
    await this.fillUid(uid, pg);
    await this.clickQuery(pg);
  }

  // ---------- 日期范围（面板选择，含跨月/跨年导航） ----------

  private static readonly MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /** 解析面板左表表头 "2026  November" → {year, monthIndex(0-11)} */
  private parsePanelHeader(text: string): { year: number; month: number } {
    const t = text.replace(/\s+/g, ' ').trim();
    const m = t.match(/(\d{4})\s+([A-Za-z]+)/);
    if (!m) throw new Error(`无法解析日期面板表头: ${text}`);
    const month = GameEntryBase.MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
    if (month < 0) throw new Error(`无法解析月份: ${text}`);
    return { year: Number(m[1]), month };
  }

  private async panelLeftHeader(page: Page): Promise<{ year: number; month: number }> {
    const text = await page.locator('.el-date-range-picker__content.is-left .el-date-range-picker__header div').first().innerText();
    return this.parsePanelHeader(text);
  }

  /**
   * 通过日期面板选择起止日期（同日或同月）。
   * 步骤：打开面板 → 按“年/月”整月导航到起始月 → 左表点击开始日 → 左表点击结束日。
   */
  protected async pickDateRange(start: string, end: string, pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    const [sy, sm, sd] = start.split('-').map(Number);
    const [ey, em, ed] = end.split('-').map(Number);
    if (sy !== ey || sm !== em) throw new Error(`本用例日期范围需同月（实际 ${start}~${end}）`);
    await page.locator('input[placeholder="添加开始日期"]').first().click();
    const panel = page.locator('.el-date-range-picker').first();
    await panel.waitFor({ state: 'visible', timeout: 15000 });

    let cur = await this.panelLeftHeader(page);
    let delta = (sy * 12 + (sm - 1)) - (cur.year * 12 + cur.month);
    while (delta !== 0) {
      const step = delta >= 12 ? 12 : delta <= -12 ? -12 : delta > 0 ? 1 : -1;
      if (step === 12) await panel.locator('.el-icon-d-arrow-right').first().click();
      else if (step === -12) await panel.locator('.el-icon-d-arrow-left').first().click();
      else if (step === 1) await panel.locator('.el-icon-arrow-right').first().click();
      else await panel.locator('.el-icon-arrow-left').first().click();
      delta -= step;
      const prev = `${cur.year}-${cur.month}`;
      await page.waitForFunction((before) => {
        const el = document.querySelector('.el-date-range-picker__content.is-left .el-date-range-picker__header div');
        const text = (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const m = text.match(/(\d{4})\s+([A-Za-z]+)/);
        if (!m) return false;
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const idx = months.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
        return `${m[1]}-${idx}` !== before;
      }, prev, { timeout: 5000 }).catch(() => undefined);
      cur = await this.panelLeftHeader(page);
    }

    const clickDay = async (day: number) => {
      await page.evaluate(([sel, d]) => {
        const tds = Array.from(document.querySelectorAll(`${sel} .el-date-table td`));
        const hit = tds.find((td) => (td.textContent ?? '').trim() === String(d)
          && !td.classList.contains('prev-month') && !td.classList.contains('next-month'));
        if (!hit) throw new Error(`日期格未找到: ${d}`);
        (hit as HTMLElement).click();
      }, ['.el-date-range-picker__content.is-left', day] as const);
    };
    await clickDay(sd);
    await clickDay(ed);
    await panel.waitFor({ state: 'hidden', timeout: 15000 });
    const [vs, ve] = await this.dateValues(page);
    if (vs !== start || ve !== end) throw new Error(`日期选择未生效：期望 ${start}~${end}，实际 ${vs}~${ve}`);
  }

  // ---------- 分页 ----------

  protected async clickPage(n: number, pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    const wait = page.waitForResponse((r) => r.url().includes('/entryWhitelist/page'), { timeout: 30000 }).catch(() => null);
    await page.locator('.el-pagination .el-pager li.number').filter({ hasText: new RegExp(`^${n}$`) }).first().click();
    await wait;
    await this.waitTableSettled(page);
  }

  protected async setPageSize(size: number, pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    await page.locator('.el-pagination .el-select .el-input__inner').first().click();
    const option = page.locator('.el-select-dropdown__item:visible, .el-select-dropdown__item').filter({ hasText: new RegExp(`^${size}/page$`) }).first();
    await option.waitFor({ state: 'visible', timeout: 15000 });
    const wait = page.waitForResponse((r) => r.url().includes('/entryWhitelist/page'), { timeout: 30000 }).catch(() => null);
    await option.click();
    await wait;
    await this.waitTableSettled(page);
  }

  protected async goToPage(n: number, pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    const input = page.locator('.el-pagination__jump input').first();
    await input.fill(String(n));
    const wait = page.waitForResponse((r) => r.url().includes('/entryWhitelist/page'), { timeout: 30000 }).catch(() => null);
    await input.press('Enter');
    await wait;
    await this.waitTableSettled(page);
  }

  // ---------- 添加 ----------

  protected dialog(pg: Page | null = null) {
    const page = pg ?? this.page!;
    return page.locator('.el-dialog').filter({ has: page.locator('.el-dialog__title', { hasText: '添加用户' }) }).first();
  }

  protected async openAddDialog(pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    await page.getByRole('button', { name: '添加用户' }).first().click();
    const dlg = this.dialog(page);
    await dlg.waitFor({ state: 'visible', timeout: 15000 });
  }

  protected async addDialogInfo(pg: Page | null = null): Promise<{ title: string; placeholder: string; buttons: string[] }> {
    const dlg = this.dialog(pg);
    return {
      title: (await dlg.locator('.el-dialog__title').innerText()).trim(),
      placeholder: (await dlg.locator('textarea').first().getAttribute('placeholder')) ?? '',
      buttons: (await dlg.locator('button').allInnerTexts()).map((s) => s.trim()).filter(Boolean)
    };
  }

  protected async closeAddDialog(pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    const dlg = this.dialog(page);
    if (await dlg.isVisible().catch(() => false)) {
      // 成功提交后弹窗会自动关闭，此处仅兜底关闭失败路径仍打开的弹窗（短超时，避免与关闭动画竞态）
      await dlg.getByRole('button', { name: '取消' }).first().click({ timeout: 3000 }).catch(() => undefined);
      await dlg.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
    }
  }

  /**
   * 提交添加并读取页面结果展示：有失败时弹「添加结果」message-box；全部成功时 Toast「成功添加 N 个用户」。
   * 返回页面可见结果原文（不做接口断言）。
   */
  protected async submitAdd(text: string, pg: Page | null = null): Promise<AddResult> {
    const page = pg ?? this.page!;
    const dlg = this.dialog(page);
    await dlg.locator('textarea').first().fill(text);
    const before = new Set((await page.locator('.el-message').allInnerTexts().catch(() => [])).map((t) => t.trim()));
    const respP = page.waitForResponse((r) => r.url().includes('/entryWhitelist/add'), { timeout: 60000 }).catch(() => null);
    await dlg.getByRole('button', { name: '确认添加' }).first().click();
    const resp = await respP;
    if (!resp) throw new Error('提交添加后未观察到 /entryWhitelist/add 响应（页面未发起请求）');
    if (resp.status() !== 200) throw new Error(`添加接口 HTTP ${resp.status()}`);

    const box = page.locator('.el-message-box');
    const boxVisible = await box.isVisible().catch(() => false);
    let kind: AddResult['kind'] = 'none';
    let boxText = '';
    if (boxVisible) {
      kind = 'messageBox';
      boxText = (await box.innerText()).replace(/\s+/g, ' ').trim();
      await this.shot('add-result-box', true);
      await box.getByRole('button', { name: /^(OK|确定)$/ }).first().click();
      await box.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
    }
    const all = await this.drainMessages(page);
    const toast = all.filter((t) => !before.has(t));
    if (kind === 'none' && toast.length > 0) kind = 'toast';
    await this.waitTableSettled(page).catch(() => undefined);
    return {
      kind,
      text: boxText || toast.join(' / '),
      toast,
      dialogOpen: await dlg.isVisible().catch(() => false),
      dialogTitle: (await dlg.locator('.el-dialog__title').innerText().catch(() => '')).trim()
    };
  }

  // ---------- 删除 ----------

  protected messageBox(pg: Page | null = null) {
    const page = pg ?? this.page!;
    return page.locator('.el-message-box').first();
  }

  protected async readMessageBox(pg: Page | null = null): Promise<{ visible: boolean; text: string }> {
    const box = this.messageBox(pg);
    const visible = await box.isVisible().catch(() => false);
    return { visible, text: visible ? (await box.innerText()).replace(/\s+/g, ' ').trim() : '' };
  }

  protected async rowCheckbox(index: number, pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    await page.locator('.el-table__body-wrapper tbody tr').nth(index).locator('td').first().locator('.el-checkbox').click();
  }

  protected async headerCheckbox(pg: Page | null = null): Promise<void> {
    const page = pg ?? this.page!;
    await page.locator('.el-table__header-wrapper th').first().locator('.el-checkbox').click();
  }

  protected async checkedRowCount(pg: Page | null = null): Promise<number> {
    const page = pg ?? this.page!;
    return page.locator('.el-table__body-wrapper tbody tr .el-checkbox.is-checked').count();
  }

  /** 点击「删除选中」→ 读取确认弹窗 → 确认或取消。确认时等待 delete 响应并落定。 */
  protected async deleteSelected(confirm: boolean, pg: Page | null = null): Promise<string> {
    const page = pg ?? this.page!;
    await page.getByRole('button', { name: '删除选中' }).first().click();
    const box = this.messageBox(page);
    await box.waitFor({ state: 'visible', timeout: 15000 });
    const text = (await box.innerText()).replace(/\s+/g, ' ').trim();
    if (confirm) {
      const wait = page.waitForResponse((r) => r.url().includes('/entryWhitelist/delete'), { timeout: 60000 }).catch(() => null);
      await box.getByRole('button', { name: '确定' }).first().click();
      const resp = await wait;
      if (!resp) throw new Error('确认删除后未观察到 /entryWhitelist/delete 响应');
      await box.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
      await this.waitTableSettled(page);
      const toasts = await this.drainMessages(page);
      const resultBox = await this.dismissResultBox(page);
      this.lastDeleteFeedback = resultBox || toasts.join(' / ');
    } else {
      await box.getByRole('button', { name: '取消' }).first().click();
      await box.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
      await this.drainMessages(page);
    }
    return text;
  }

  /** 点击「删除筛选结果」→ 读取确认弹窗 → 确认或取消。 */
  protected async deleteFiltered(confirm: boolean, pg: Page | null = null): Promise<string> {
    const page = pg ?? this.page!;
    await page.getByRole('button', { name: '删除筛选结果' }).first().click();
    const box = this.messageBox(page);
    await box.waitFor({ state: 'visible', timeout: 15000 });
    const text = (await box.innerText()).replace(/\s+/g, ' ').trim();
    if (confirm) {
      const wait = page.waitForResponse((r) => r.url().includes('/entryWhitelist/deleteByFilter'), { timeout: 60000 }).catch(() => null);
      await box.getByRole('button', { name: '确定' }).first().click();
      const resp = await wait;
      if (!resp) throw new Error('确认条件删除后未观察到 /entryWhitelist/deleteByFilter 响应');
      await box.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
      await this.waitTableSettled(page);
      await this.drainMessages(page);
      await this.dismissResultBox(page);
    } else {
      await box.getByRole('button', { name: '取消' }).first().click();
      await box.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
      await this.drainMessages(page);
    }
    return text;
  }

  /** 删除后可能出现的操作结果 message-box（非确认弹窗），读取并关闭。 */
  protected async dismissResultBox(pg: Page | null = null): Promise<string> {
    const page = pg ?? this.page!;
    const box = this.messageBox(page);
    if (await box.isVisible().catch(() => false)) {
      const text = (await box.innerText()).replace(/\s+/g, ' ').trim();
      await box.getByRole('button', { name: /^(OK|确定)$/ }).first().click().catch(() => undefined);
      await box.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
      return text;
    }
    return '';
  }

  // ---------- 导出 ----------

  protected async exportAll(pg: Page | null = null): Promise<ExportResult> {
    const page = pg ?? this.page!;
    const dlP = page.waitForEvent('download', { timeout: 60000 });
    await page.getByRole('button', { name: '导出全部' }).first().click();
    const dl = await dlP;
    const filename = dl.suggestedFilename();
    const savedTo = join(this.evidenceDir, `${Date.now()}-${filename}`);
    await dl.saveAs(savedTo);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(savedTo);
    const ws = wb.worksheets[0];
    const headers: string[] = [];
    ws.getRow(1).eachCell((cell, col) => { headers[col - 1] = String(cell.value ?? '').trim(); });
    const allRows: string[][] = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const cells: string[] = [];
      for (let c = 1; c <= 8; c++) cells.push(String(row.getCell(c).value ?? '').trim());
      allRows.push(cells);
    });
    // 空值尾列也保留；ExcelJS rowCount 可能包含空行，过滤全空行
    const dataRows = allRows.filter((cells) => cells.some((v) => v !== ''));
    return {
      filename,
      headers,
      rowCount: dataRows.length,
      userIds: dataRows.map((cells) => cells[0]),
      createTimes: dataRows.map((cells) => cells[6]),
      allRows: dataRows,
      savedTo
    };
  }

  /** 保留导出证据文件（下载文件本身也作为证据）。 */
  protected noteEvidence(file: string): void {
    this.screenshots.push(file);
  }

  /** 写一个文本产物到证据目录（用于记录阶段读数快照）。 */
  protected dumpJson(name: string, data: unknown): string {
    const file = join(this.evidenceDir, name);
    writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return file;
  }

  protected urlHash(pg: Page | null = null): Promise<string> {
    return (pg ?? this.page!).evaluate(() => location.hash);
  }

  protected async menuText(pg: Page | null = null): Promise<string> {
    const page = pg ?? this.page!;
    const side = page.locator('.sidebar-container');
    if ((await side.count()) === 0) return '';
    return (await side.innerText()).replace(/\s+/g, ' ').trim();
  }

  protected async breadcrumbs(pg: Page | null = null): Promise<string[]> {
    const page = pg ?? this.page!;
    return (await page.locator('.el-breadcrumb__item').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  }

  /** 直达页面后是否被拒（404 页）。 */
  protected async is404Page(pg: Page | null = null): Promise<{ hash: string; body: string }> {
    const page = pg ?? this.page!;
    return { hash: await page.evaluate(() => location.hash), body: (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim() };
  }

  protected pageUrl(): string { return PAGE_URL; }
  protected uiBase(): string { return UI_BASE; }
}
