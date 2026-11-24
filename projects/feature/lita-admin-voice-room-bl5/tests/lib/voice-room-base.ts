/**
 * 语音房管理 / 房间推荐管理页面操作与造数辅助（项目内私有）。
 *
 * 造数原则（任务输入 §五）：页面构造优先；本文件所有造数/清理均通过页面真实操作完成，
 * 不调用写接口、不写数据库。推荐记录使用真实实验KEY（已送礼用户 / 未送礼用户），
 * 执行后立即通过页面「批量删除」清理（TECH_DESIGN AC-1~AC-5 降级路径）。
 */
import { type Page } from 'playwright';
import { AdminBase, UI_BASE, fmtTime } from './admin-base.ts';

export const MANAGER_HASH = '/voice-room/voice-room-manager';
export const RECOMMEND_HASH = '/voice-room/voice-room-recommend-config';

/** 房间列表列索引（19 列）。 */
export const ROOM_COL = {
  locale: 0, country: 1, roomId: 2, roomNo: 3, cover: 4, ownerNo: 5, official: 6, guildId: 7,
  isGuild: 8, roomType: 9, isTest: 10, platform: 11, roomName: 12, roomTag: 13, roomCategory: 14,
  status: 15, joinCondition: 16, createTime: 17, actions: 18
} as const;

/** 推荐列表列索引（15 列，含首列复选框）。 */
export const REC_COL = {
  check: 0, locale: 1, roomId: 2, configKey: 3, weight: 4, type: 5, time: 6, effective: 7,
  platform: 8, roomName: 9, roomCategory: 10, roomStatus: 11, operateName: 12, operateTime: 13, actions: 14
} as const;

/** 大区下拉展示文案 → 列表/导出 locale 展示值（实测 2026-11-24）。 */
export const LOCALE_DISPLAY: Record<string, string> = {
  印尼语区: '印尼(in)', 越南区: '越南(vi)', 泰国区: '泰国(th)', 英语区: '英语(en)',
  阿拉伯语区: '阿拉伯语(ar)', 中文区: '中文区(zh)', 韩国区: '韩国区(ko)', 菲律宾区: '菲律宾(ph)'
};

export interface RoomSpec {
  name: string;
  platform: 'Lita' | 'Cinta';
  roomCategory: string | null;
  tagName: string | null;
  tagColor: string;
  tagBg: string;
  openState: 'open' | 'close';
}

export interface RecommendSpec {
  roomId: string;
  keyLabel: string;
  type: '永久' | '短时';
  weight: number;
  start?: Date;
  end?: Date;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function prev(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export abstract class VoiceRoomBase extends AdminBase {
  protected readonly runId = process.env.BL5_RUN_ID ?? 'R1';
  protected readonly giftKey = '已送礼用户';
  protected readonly nogiftKey = '未送礼用户';
  protected readonly roomTagName = `QA-BL5-${process.env.BL5_RUN_ID ?? 'R1'}`;
  protected readonly roomName1 = `QA-BL5-${process.env.BL5_RUN_ID ?? 'R1'}-room`;
  protected readonly roomName2 = `QA-BL5-${process.env.BL5_RUN_ID ?? 'R1'}-notag`;
  protected readonly roomName3 = `QA-BL5-${process.env.BL5_RUN_ID ?? 'R1'}-cinta`;

  // ---------- 导航 ----------

  protected async openManager(): Promise<void> {
    await this.page!.goto(`${UI_BASE}/#${MANAGER_HASH}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.waitApp();
    await this.page!.locator('.el-table__header-wrapper th').first().waitFor({ state: 'visible', timeout: 30000 });
    await this.waitTableSettled();
  }

  protected async openRecommend(): Promise<void> {
    await this.page!.goto(`${UI_BASE}/#${RECOMMEND_HASH}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.waitApp();
    await this.page!.locator('.el-table__header-wrapper th').first().waitFor({ state: 'visible', timeout: 30000 });
    await this.waitTableSettled();
  }

  // ---------- 房间管理：筛选 ----------

  protected async managerSearchByName(name: string): Promise<void> {
    await this.openManager();
    await this.managerReset();
    await this.fillPlaceholder(this.page!, '房间名称', name);
    await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
  }

  protected async managerReset(): Promise<void> {
    await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '重置筛选项' }), '/voiceroom/voiceRoomList');
  }

  protected async managerPick(placeholder: string, optionText: string): Promise<void> {
    const select = this.page!.locator(`.app-main .el-select:has(input[placeholder="${placeholder}"])`).first();
    await select.click();
    const dd = this.page!.locator('.el-select-dropdown:visible').last();
    await dd.waitFor({ state: 'visible', timeout: 10000 });
    await dd.locator('.el-select-dropdown__item', { hasText: new RegExp(`^\\s*${esc(optionText)}\\s*$`) }).first().click();
    await dd.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  }

  protected async managerSelectOptions(placeholder: string): Promise<string[]> {
    const select = this.page!.locator(`.app-main .el-select:has(input[placeholder="${placeholder}"])`).first();
    await select.click();
    const dd = this.page!.locator('.el-select-dropdown:visible').last();
    await dd.waitFor({ state: 'visible', timeout: 10000 });
    const items = (await dd.locator('.el-select-dropdown__item').allInnerTexts()).map((t) => t.trim());
    await this.page!.keyboard.press('Escape');
    await dd.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
    return items;
  }

  /** 当前列表全部行（二维文本）。 */
  protected async managerRows(): Promise<string[][]> {
    return this.tableRows(this.page!);
  }

  /** 取指定房间名对应的行（按「语音房名字」列精确匹配）。 */
  protected async managerRowByName(name: string): Promise<string[] | null> {
    const rows = await this.managerRows();
    return rows.find((r) => r[ROOM_COL.roomName] === name) ?? null;
  }

  protected async managerRoomId(name: string): Promise<string> {
    const row = await this.managerRowByName(name);
    if (!row) throw new Error(`房间列表中未找到房间：${name}`);
    return row[ROOM_COL.roomId];
  }

  // ---------- 新建/编辑房间 ----------

  protected dialogRoot(page = this.page!) {
    return page.locator('.el-dialog__wrapper:visible .el-dialog').first();
  }

  protected dlgItem(page: Page, label: string) {
    return this.dialogRoot(page).locator('.el-form-item', { has: page.locator('.el-form-item__label', { hasText: label }) }).first();
  }

  protected async dlgFormLabels(page: Page): Promise<string[]> {
    return (await this.dialogRoot(page).locator('.el-form-item__label').allInnerTexts()).map((t) => t.replace(/\s+/g, '').trim());
  }

  protected async dlgItemVisible(page: Page, label: string): Promise<boolean> {
    const item = this.dlgItem(page, label);
    if ((await item.count()) === 0) return false;
    return item.isVisible();
  }

  protected async dlgFill(page: Page, label: string, value: string): Promise<void> {
    const input = this.dlgItem(page, label).locator('input, textarea').first();
    await input.fill(value);
    await page.waitForFunction(({ lb, v }) => {
      const dlg = [...document.querySelectorAll('.el-dialog__wrapper')].find((w) => (w as HTMLElement).style.display !== 'none');
      const items = [...(dlg?.querySelectorAll('.el-form-item') ?? [])];
      const hit = items.find((x) => (x.querySelector('.el-form-item__label')?.textContent ?? '').includes(lb));
      const i = hit?.querySelector('input,textarea') as HTMLInputElement | undefined;
      return i?.value === v;
    }, { lb: label, v: value }, { timeout: 10000 });
  }

  protected async dlgPick(page: Page, label: string, optionText: string, mode: 'exact' | 'contains' = 'exact'): Promise<void> {
    // 收起可能残留的下拉层（仅交互稳定性处理，不影响被测数据与断言）
    if (await page.locator('.el-select-dropdown:visible').count()) {
      await page.locator('.el-dialog__title').first().click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    }
    const item = this.dlgItem(page, label);
    const select = item.locator('.el-select').first();
    await select.click();
    const dd = page.locator('.el-select-dropdown:visible').last();
    const opened = await dd.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
    if (!opened) {
      await select.click();
      await dd.waitFor({ state: 'visible', timeout: 8000 });
    }
    const options = dd.locator('.el-select-dropdown__item');
    const target = mode === 'exact'
      ? options.filter({ hasText: new RegExp(`^\\s*${esc(optionText)}\\s*$`) })
      : options.filter({ hasText: optionText });
    await target.first().click();
    await dd.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  }

  protected async dlgOptions(page: Page, label: string): Promise<string[]> {
    await this.dlgItem(page, label).locator('.el-select').first().click();
    const dd = page.locator('.el-select-dropdown:visible').last();
    await dd.waitFor({ state: 'visible', timeout: 10000 });
    const items = (await dd.locator('.el-select-dropdown__item').allInnerTexts()).map((t) => t.trim());
    await this.page!.keyboard.press('Escape');
    await dd.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
    return items;
  }

  protected async dlgRadio(page: Page, label: string, text: string): Promise<void> {
    await this.dlgItem(page, label).locator('.el-radio-button', { hasText: new RegExp(`^\\s*${esc(text)}\\s*$`) }).first().click();
  }

  protected async dlgActiveRadio(page: Page, label: string): Promise<string> {
    const active = this.dlgItem(page, label).locator('.el-radio-button.is-active').first();
    return (await active.innerText()).trim();
  }

  protected async dlgSetColor(page: Page, label: string, hex: string): Promise<void> {
    await this.dlgItem(page, label).locator('.el-color-picker').first().click();
    const dd = page.locator('.el-color-dropdown:visible').last();
    await dd.waitFor({ state: 'visible', timeout: 10000 });
    const input = dd.locator('input').first();
    await input.fill(hex);
    await dd.locator('button', { hasText: 'OK' }).first().click();
    await dd.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => undefined);
  }

  /** 读取颜色选择器当前显示色（computed style → #RRGGBB）。 */
  protected async dlgColorHex(page: Page, label: string): Promise<string> {
    const picker = this.dlgItem(page, label).locator('.el-color-picker').first();
    return picker.evaluate((el) => {
      const colorEl = (el.querySelector('.el-color-picker__color-inner') ?? el.querySelector('.el-color-picker__color')) as HTMLElement | null;
      const bg = colorEl ? getComputedStyle(colorEl).backgroundColor : '';
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return bg;
      const hex = (n: string) => Number(n).toString(16).padStart(2, '0').toUpperCase();
      return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
    });
  }

  /** 房间弹窗保存：点击「确 定」→ 处理二次确认 → 等待弹窗关闭。 */
  protected async saveRoomDialog(page: Page): Promise<{ confirmText: string; message: string }> {
    const dlg = page.locator('.el-dialog__wrapper:visible').first();
    await dlg.locator('button', { hasText: /^确\s*定$/ }).first().click();
    let confirmText = '';
    const box = page.locator('.el-message-box__wrapper:visible').first();
    if (await box.count()) {
      confirmText = await this.confirmMessageBox(page, true);
    }
    await dlg.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => undefined);
    await this.waitTableSettled(page);
    const message = await this.messageText(page);
    return { confirmText, message };
  }

  protected async cancelRoomDialog(page: Page): Promise<void> {
    const dlg = page.locator('.el-dialog__wrapper:visible').first();
    await dlg.locator('button', { hasText: /^取\s*消$/ }).first().click();
    await dlg.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  }

  /** 打开「新建语音房」弹窗。 */
  protected async openCreateRoomDialog(): Promise<void> {
    await this.page!.getByRole('button', { name: /新建语音房$/ }).first().click();
    await this.dialogRoot().locator('.el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
  }

  /**
   * 页面构造房间（BD-1/BD-2/BD-3 共用骨架）。
   * 使用同 context 的新标签页执行，避免房间表单组件复用上次输入（实测新建弹窗会沿用同一页面内上次表单值）。
   */
  protected async createRoom(spec: RoomSpec): Promise<void> {
    const page = await this.context!.newPage();
    this.bindPage(page);
    try {
      await page.goto(`${UI_BASE}/#${MANAGER_HASH}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.waitApp(page);
      await this.waitTableSettled(page);
      const rows = await this.tableRows(page);
      const owner = (rows.find((r) => /^\d+$/.test(r[ROOM_COL.ownerNo])) ?? [])[ROOM_COL.ownerNo];
      if (!owner) throw new Error('列表中未取到有效房主No，无法页面构造测试房间');
      await page.getByRole('button', { name: /新建语音房$/ }).first().click();
      await page.locator('.el-dialog__wrapper:visible .el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
      await this.buildRoomForm(page, owner, spec);
      await this.saveRoomDialog(page);
    } finally {
      await page.close().catch(() => undefined);
    }
    await this.managerSearchByName(spec.name);
  }

  /** 填写房间表单（新建弹窗）。 */
  protected async buildRoomForm(page: Page, owner: string, spec: RoomSpec): Promise<void> {
    await this.dlgPick(page, 'Locale', '印尼语区');
    await this.dlgPick(page, 'Country', '印尼');
    await this.dlgFill(page, '房主No', owner);
    await this.dlgFill(page, '公会ID', '0');
    await this.dlgFill(page, '房间名称', spec.name);
    await this.dlgPick(page, '房间类型', '娱乐(fun)');
    await this.dlgPick(page, 'platform', spec.platform);
    await this.dlgPick(page, '时间策略(strategy)', 'fixed(', 'contains');
    await this.dlgFill(page, '开始时间', '2026-11-01 00:00:00');
    await this.dlgFill(page, '结束时间', '2099-01-01 21:00:00');
    await this.dlgRadio(page, '开启密码', 'false');
    if (spec.tagName) {
      await this.dlgRadio(page, '房间标签', '有');
      await this.dlgFill(page, '标签名称', spec.tagName);
      await this.dlgSetColor(page, '标签文字颜色', spec.tagColor);
      await this.dlgSetColor(page, '标签背景色', spec.tagBg);
    } else {
      await this.dlgRadio(page, '房间标签', '无');
    }
    if (spec.roomCategory) await this.dlgPick(page, 'Room Category', spec.roomCategory);
    await this.dlgRadio(page, 'openState', spec.openState);
  }

  /**
   * 确保测试房间存在（BD-1/BD-2/BD-3）。
   * 已存在：读取 roomId 并按需修正 openState（页面编辑）；不存在：页面新建。
   */
  protected async ensureRoom(spec: RoomSpec): Promise<string> {
    await this.managerSearchByName(spec.name);
    let rows = await this.managerRows();
    if (rows.length === 0) {
      await this.createRoom(spec);
      await this.managerSearchByName(spec.name);
      rows = await this.managerRows();
    }
    if (rows.length !== 1) throw new Error(`测试房间就绪确认失败：${spec.name} 期望 1 行，实际 ${rows.length} 行`);
    const row = rows[0];
    const roomId = row[ROOM_COL.roomId];
    const openState = await this.detailOpenState(roomId);
    if (openState !== spec.openState) {
      await this.editRoom(roomId, async (page) => {
        await this.dlgRadio(page, 'openState', spec.openState);
      });
    }
    return roomId;
  }

  protected async detailOpenState(roomId: string): Promise<string> {
    const page = await this.openDetail(roomId);
    try {
      const text = await page.locator('.app-main').innerText();
      const m = text.match(/房间openState\s*(\w+)/);
      return m ? m[1] : '';
    } finally {
      await this.closeSession(page);
    }
  }

  /** 按房间ID筛选后打开对应行详情（新标签页）；页面加载失败时按基础设施中断重试一次。 */
  protected async openDetail(roomId: string): Promise<Page> {
    try {
      return await this.openDetailOnce(roomId);
    } catch (e) {
      this.notes.push(`详情页首次打开失败（${(e as Error).message.split('\n')[0]}），按基础设施中断重试一次`);
      await this.page!.waitForTimeout(2000);
      return this.openDetailOnce(roomId);
    }
  }

  private async openDetailOnce(roomId: string): Promise<Page> {
    await this.openManager();
    await this.managerReset();
    await this.fillPlaceholder(this.page!, '房间id', roomId);
    await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: '搜索' }), '/voiceroom/voiceRoomList');
    const rows = this.page!.locator('.el-table__body-wrapper tbody tr');
    const count = await rows.count();
    let idx = -1;
    for (let i = 0; i < count; i++) {
      const id = (await rows.nth(i).locator('td').nth(ROOM_COL.roomId).innerText()).trim();
      if (id === roomId) { idx = i; break; }
    }
    if (idx < 0) throw new Error(`房间列表中未找到房间ID ${roomId}`);
    const [popup] = await Promise.all([
      this.context!.waitForEvent('page', { timeout: 30000 }),
      rows.nth(idx).locator('button', { hasText: 'details' }).first().click()
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await popup.locator('.app-main').waitFor({ state: 'visible', timeout: 60000 });
    await popup.waitForFunction((id) => location.hash.includes(`roomId=${id}`), roomId, { timeout: 15000 });
    await popup.waitForFunction(() => (document.querySelector('.app-main')?.textContent ?? '').includes('房主NO'), undefined, { timeout: 30000 });
    return popup;
  }

  /** 通过详情页 Edit 弹窗编辑房间并保存。 */
  protected async editRoom(roomId: string, mutate: (page: Page) => Promise<void>): Promise<void> {
    const page = await this.openDetail(roomId);
    try {
      await page.locator('button', { hasText: 'Edit' }).first().click();
      const dlg = page.locator('.el-dialog__wrapper:visible').first();
      await dlg.locator('.el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
      await mutate(page);
      await this.saveRoomDialog(page);
    } finally {
      await this.closeSession(page);
    }
  }

  /** 以房间名称定位并打开 Edit 弹窗（用于回显类断言，不保存）。 */
  protected async openEditDialogByName(name: string): Promise<Page> {
    await this.managerSearchByName(name);
    const roomId = await this.managerRoomId(name);
    const page = await this.openDetail(roomId);
    await page.locator('button', { hasText: 'Edit' }).first().click();
    await page.locator('.el-dialog__wrapper:visible .el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
    return page;
  }

  // ---------- 推荐管理 ----------

  protected recSelect(placeholder: string) {
    return this.page!.locator(`.app-main .el-select:has(input[placeholder="${placeholder}"])`).first();
  }

  protected async recPick(placeholder: string, optionText: string): Promise<void> {
    await this.recSelect(placeholder).click();
    const dd = this.page!.locator('.el-select-dropdown:visible').last();
    await dd.waitFor({ state: 'visible', timeout: 10000 });
    await dd.locator('.el-select-dropdown__item', { hasText: new RegExp(`^\\s*${esc(optionText)}\\s*$`) }).first().click();
    await dd.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
  }

  protected async recOptions(placeholder: string): Promise<string[]> {
    await this.recSelect(placeholder).click();
    const dd = this.page!.locator('.el-select-dropdown:visible').last();
    await dd.waitFor({ state: 'visible', timeout: 10000 });
    const items = (await dd.locator('.el-select-dropdown__item').allInnerTexts()).map((t) => t.trim());
    await this.page!.keyboard.press('Escape');
    await dd.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
    return items;
  }

  protected async recSearch(filter: { roomId?: string; locale?: string; status?: string; type?: string; userClass?: string } = {}): Promise<void> {
    await this.page!.getByRole('button', { name: 'Reset Filters' }).first().click();
    await this.waitTableSettled();
    if (filter.roomId !== undefined) await this.fillPlaceholder(this.page!, '房间ID', filter.roomId);
    if (filter.userClass) await this.recPick('请选择用户分类', filter.userClass);
    if (filter.locale) await this.recPick('大区', filter.locale);
    if (filter.status) await this.recPick('状态', filter.status);
    if (filter.type) await this.recPick('推荐类型', filter.type);
    await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: 'Search' }), '/voiceroom/voiceRoomConfigRecommendList');
  }

  protected async recReset(): Promise<void> {
    await this.clickAndWaitResponse(this.page!, this.page!.getByRole('button', { name: 'Reset Filters' }), '/voiceroom/voiceRoomConfigRecommendList');
  }

  /** 推荐列表切换每页条数。 */
  protected async recPageSize(n: number): Promise<void> {
    const sel = this.page!.locator('.el-pagination__sizes .el-select').first();
    if ((await sel.count()) === 0 || !(await sel.isVisible().catch(() => false))) {
      this.notes.push(`recPageSize(${n}) 跳过：分页条数控件不可见（Total 较小或分页未渲染）`);
      return;
    }
    await sel.click();
    const dd = this.page!.locator('.el-select-dropdown:visible').last();
    await dd.waitFor({ state: 'visible', timeout: 10000 });
    await dd.locator('.el-select-dropdown__item', { hasText: `${n}/page` }).first().click();
    await dd.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    await this.waitTableSettled();
  }

  /** 推荐列表翻页（等待首行变化）。 */
  protected async recGotoPage(n: number): Promise<void> {
    const prevFirst = await this.page!.locator('.el-table__body-wrapper tbody tr').first().innerText().catch(() => '');
    await this.page!.locator('.el-pager li', { hasText: new RegExp(`^\\s*${n}\\s*$`) }).first().click();
    await this.page!.waitForFunction((prevText) => {
      const tr = document.querySelector('.el-table__body-wrapper tbody tr') as HTMLElement | null;
      return !!tr && tr.innerText.replace(/\s+/g, ' ').trim() !== prevText;
    }, prevFirst.replace(/\s+/g, ' ').trim(), { timeout: 60000 }).catch(() => undefined);
    await this.waitTableSettled();
  }

  protected async recRows(): Promise<string[][]> {
    return this.tableRows(this.page!);
  }

  protected async recRowByRoomId(roomId: string): Promise<string[] | null> {
    const rows = await this.recRows();
    return rows.find((r) => r[REC_COL.roomId] === roomId) ?? null;
  }

  protected async openBatchAdd(): Promise<void> {
    await this.page!.getByRole('button', { name: '批量添加' }).first().click();
    await this.dialogRoot().locator('.el-dialog__title').waitFor({ state: 'visible', timeout: 15000 });
  }

  protected async setDateTime(page: Page, label: string, value: string): Promise<void> {
    const input = this.dlgItem(page, label).locator('input').first();
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await page.locator('.el-picker-panel:visible').last().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    await page.waitForFunction(({ lb, v }) => {
      const dlg = [...document.querySelectorAll('.el-dialog__wrapper')].find((w) => (w as HTMLElement).style.display !== 'none');
      const items = [...(dlg?.querySelectorAll('.el-form-item') ?? [])];
      const hit = items.find((x) => (x.querySelector('.el-form-item__label')?.textContent ?? '').includes(lb));
      const i = hit?.querySelector('input') as HTMLInputElement | undefined;
      return i?.value === v;
    }, { lb: label, v: value }, { timeout: 10000 });
  }

  /** 通过页面「批量添加」构造/覆盖一条推荐记录，并以列表页就绪确认。 */
  protected async recEnsure(spec: RecommendSpec): Promise<void> {
    await this.openRecommend();
    await this.openBatchAdd();
    const page = this.page!;
    await this.dlgPick(page, '实验KEY', spec.keyLabel);
    await this.dlgPick(page, '推荐类型', spec.type);
    if (spec.type === '短时') {
      if (!spec.start || !spec.end) throw new Error('短时推荐必须提供起止时间');
      await this.setDateTime(page, '短时推荐开始时间', fmtTime(spec.start));
      await this.setDateTime(page, '短时推荐结束时间', fmtTime(spec.end));
    }
    await this.dlgFill(page, '权重', String(spec.weight));
    await this.dlgFill(page, '房间ID', spec.roomId);
    const dlg = page.locator('.el-dialog__wrapper:visible').first();
    await dlg.locator('button', { hasText: /^确\s*定$/ }).first().click();
    const box = page.locator('.el-message-box__wrapper:visible').first();
    if (await box.count()) await this.confirmMessageBox(page, true);
    await dlg.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => undefined);
    const message = await this.messageText(page);
    if (!/成功/.test(message)) throw new Error(`批量添加未提示成功：${message}`);
    await this.recSearch({ roomId: spec.roomId });
    const rows = await this.recRows();
    const hit = rows.find((r) => r[REC_COL.roomId] === spec.roomId && r[REC_COL.configKey].includes(spec.keyLabel));
    if (!hit) throw new Error(`推荐记录就绪确认失败：roomId=${spec.roomId} key=${spec.keyLabel}`);
  }

  /** 通过页面「批量删除」清理指定房间的全部自建推荐记录（先按房间ID筛选，再全选删除）。 */
  protected async recDeleteByRoomIds(roomIds: string[]): Promise<void> {
    await this.openRecommend();
    for (const roomId of roomIds) {
      for (let attempt = 0; attempt < 3; attempt++) {
        await this.recSearch({ roomId });
        const count = await this.tableRowCount(this.page!);
        if (count === 0) break;
        await this.page!.locator('.el-table__header-wrapper .el-checkbox').first().click();
        await this.page!.getByRole('button', { name: '批量删除' }).first().click();
        const box = this.page!.locator('.el-message-box__wrapper:visible').first();
        if (await box.count()) await this.confirmMessageBox(this.page!, true);
        await this.messageText(this.page!);
        await this.waitTableSettled(this.page!);
      }
      await this.recSearch({ roomId });
      const left = await this.tableRowCount(this.page!);
      if (left > 0) throw new Error(`清理未完成：roomId=${roomId} 仍剩 ${left} 条推荐记录`);
    }
  }

  /** 批量导出：以导出响应体留证（下载事件仅作文件名证据）。 */
  protected async recExport(): Promise<{ filename: string; buffer: Buffer }> {
    const respPromise = this.page!.waitForResponse((r) => r.url().includes('/voiceroom/exportVoiceRoomConfigRecommend'), { timeout: 60000 });
    const dlPromise = this.page!.waitForEvent('download', { timeout: 60000 }).catch(() => null);
    await this.page!.getByRole('button', { name: '批量导出' }).first().click();
    const resp = await respPromise;
    const buffer = await resp.body();
    const dl = await dlPromise;
    const disposition = resp.headers()['content-disposition'] ?? '';
    const fromHeader = decodeURIComponent((disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? disposition.match(/filename="?([^";]+)"?/)?.[1] ?? '').trim());
    return { filename: dl?.suggestedFilename() || fromHeader, buffer };
  }

  /** 读取列表标签（Room Tag）单元格内标签元素的文字与计算样式。 */
  protected async roomTagStyle(name: string): Promise<{ text: string; color: string; background: string }> {
    const rowLoc = this.page!.locator('.el-table__body-wrapper tbody tr').filter({ has: this.page!.locator('td', { hasText: name }) }).first();
    const cell = rowLoc.locator('td').nth(ROOM_COL.roomTag);
    return cell.evaluate((td) => {
      const badge = td.querySelector('.room-tag-badge') as HTMLElement | null;
      if (!badge) return { text: (td.textContent ?? '').trim(), color: '', background: '' };
      const cs = getComputedStyle(badge);
      return { text: (badge.textContent ?? '').trim(), color: cs.color, background: cs.backgroundColor };
    });
  }

  /** RGB 字符串转 #RRGGBB。 */
  protected rgbToHex(rgb: string): string {
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return rgb;
    const hex = (n: string) => Number(n).toString(16).padStart(2, '0').toUpperCase();
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
  }


  /** 行操作列按钮文案集合。 */
  protected async managerRowButtons(index: number): Promise<string[]> {
    const row = this.page!.locator('.el-table__body-wrapper tbody tr').nth(index);
    return (await row.locator('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  /** 设置创建日期范围（daterange）。 */
  protected async managerSetDateRange(start: string, end: string): Promise<void> {
    const inputs = this.page!.locator('.app-main .el-date-editor--daterange input');
    await inputs.nth(0).click();
    await inputs.nth(0).fill(start);
    await inputs.nth(0).press('Enter');
    await inputs.nth(1).fill(end);
    await inputs.nth(1).press('Enter');
    await this.page!.keyboard.press('Escape');
    await this.page!.waitForFunction(({ s, e }) => {
      const list = [...document.querySelectorAll('.app-main .el-date-editor--daterange input')] as HTMLInputElement[];
      return list[0]?.value === s && list[1]?.value === e;
    }, { s: start, e: end }, { timeout: 10000 });
  }

  /** 房间列表翻页（等待首行变化）。 */
  protected async managerGotoPage(n: number): Promise<void> {
    const first = await this.page!.locator('.el-table__body-wrapper tbody tr').first().innerText().catch(() => '');
    await this.page!.locator('.el-pager li', { hasText: new RegExp(`^\\s*${n}\\s*$`) }).first().click();
    await this.page!.waitForFunction((prev) => {
      const tr = document.querySelector('.el-table__body-wrapper tbody tr') as HTMLElement | null;
      return !!tr && tr.innerText.replace(/\s+/g, ' ').trim() !== prev;
    }, prev(first), { timeout: 60000 }).catch(() => undefined);
    await this.waitTableSettled();
  }

  /** 房间列表切换每页条数。 */
  protected async managerPageSize(n: number): Promise<void> {
    await this.page!.locator('.el-pagination__sizes .el-select').first().click();
    const dd = this.page!.locator('.el-select-dropdown:visible').last();
    await dd.waitFor({ state: 'visible', timeout: 10000 });
    await dd.locator('.el-select-dropdown__item', { hasText: `${n}/page` }).first().click();
    await dd.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
    await this.waitTableSettled();
  }

  /** 房间详情页文本。 */
  protected async detailText(page: Page): Promise<string> {
    return (await page.locator('.app-main').innerText()).replace(/\s+/g, ' ').trim();
  }

  /** 推荐列表：按房间ID + 用户分类定位行索引（无则 -1）。 */
  protected async recRowIndex(roomId: string, keyLabel?: string): Promise<number> {
    const rows = await this.recRows();
    return rows.findIndex((r) => r[REC_COL.roomId] === roomId && (keyLabel === undefined || r[REC_COL.configKey].includes(keyLabel)));
  }

  protected async recSelectRow(index: number): Promise<void> {
    const cb = this.page!.locator('.el-table__body-wrapper tbody tr').nth(index).locator('.el-checkbox').first();
    const checked = await cb.evaluate((el) => el.classList.contains('is-checked') || !!el.querySelector('.el-checkbox__input.is-checked'));
    if (!checked) await cb.click();
  }

  protected async recClearSelection(): Promise<void> {
    const checked = await this.page!.locator('.el-table__body-wrapper tbody tr .el-checkbox__input.is-checked').count();
    if (checked > 0) await this.page!.locator('.el-table__header-wrapper .el-checkbox').first().click();
  }


  /** 确保 BD-1 具备「有标签 + 指定分类 + open」状态（供筛选类用例复用）。 */
  protected async ensureRoom1TagCategory(): Promise<string> {
    const roomId = await this.ensureRoom({
      name: this.roomName1, platform: 'Lita', roomCategory: 'Official Room - New User',
      tagName: this.roomTagName, tagColor: '#FFFFFF', tagBg: '#FF5722', openState: 'open'
    });
    await this.managerSearchByName(this.roomName1);
    const row = await this.managerRowByName(this.roomName1);
    if (!row) throw new Error(`未找到 QA 测试房间 ${this.roomName1}`);
    const needTag = row[ROOM_COL.roomTag] !== this.roomTagName;
    const needCategory = row[ROOM_COL.roomCategory] !== 'Official Room - New User';
    const needOpen = await this.detailOpenState(roomId) !== 'open';
    if (needTag || needCategory || needOpen) {
      await this.editRoom(roomId, async (page) => {
        if (needTag) {
          await this.dlgRadio(page, '房间标签', '有');
          await this.dlgFill(page, '标签名称', this.roomTagName);
          await this.dlgSetColor(page, '标签文字颜色', '#FFFFFF');
          await this.dlgSetColor(page, '标签背景色', '#FF5722');
        }
        if (needCategory) await this.dlgPick(page, 'Room Category', 'Official Room - New User');
        await this.dlgRadio(page, 'openState', 'open');
      });
      await this.managerSearchByName(this.roomName1);
      const after = await this.managerRowByName(this.roomName1);
      if (!after || after[ROOM_COL.roomTag] !== this.roomTagName || after[ROOM_COL.roomCategory] !== 'Official Room - New User') {
        throw new Error(`BD-1 标签/分类就绪确认失败：tag=${after?.[ROOM_COL.roomTag]} category=${after?.[ROOM_COL.roomCategory]}`);
      }
    }
    return roomId;
  }

  /** 测试夹具：BD-1（全配置，开放）、BD-2（无标签无分类，开放）、BD-3（Cinta，关闭）。 */
  protected async ensureStandardRooms(): Promise<{ room1: string; room2: string; room3: string }> {
    const room1 = await this.ensureRoom({
      name: this.roomName1, platform: 'Lita', roomCategory: 'Official Room - New User',
      tagName: this.roomTagName, tagColor: '#FFFFFF', tagBg: '#FF5722', openState: 'open'
    });
    const room2 = await this.ensureRoom({
      name: this.roomName2, platform: 'Lita', roomCategory: null,
      tagName: null, tagColor: '', tagBg: '', openState: 'open'
    });
    const room3 = await this.ensureRoom({
      name: this.roomName3, platform: 'Cinta', roomCategory: null,
      tagName: null, tagColor: '', tagBg: '', openState: 'close'
    });
    return { room1, room2, room3 };
  }
}
