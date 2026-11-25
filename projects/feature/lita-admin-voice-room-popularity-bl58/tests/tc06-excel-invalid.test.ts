/**
 * 项目 BL-0058 / TK-0687：房间人气推荐设置 - Excel 非法/重复/超限/空文件导入（用例 #26~#29）
 * 用例来源：TK-0686 HANDOFF 九列用例；技术方案：/task/20261125/TK-0686/TECH_DESIGN（BD-2、PM-3 F2/F3a~f/F4/F5、§5 断言映射）
 * 覆盖：#26 文件内重复（第 2/4 行，整表不落库）；#27 非法行 a~f（行号+非法值，整表不落库）；
 *       #28 2001 行超限；#29 空文件
 * 数据隔离：非法文件预期不落库；若产品异常落库，按操作人 qa-ai 在泰国区兜底清理（仅本任务自建行）。
 * 运行：TMPDIR=./.tmp-playwright ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc06-excel-invalid.test.ts [--case=27]
 */
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import type { Page } from 'playwright';
import { AdminBase } from './lib/admin-base.ts';

class ExcelInvalidTest extends AdminBase {
  constructor() {
    super('tc06-excel-invalid', { 26: 2, 27: 12, 28: 2, 29: 2 });
  }

  private stateFile = '';
  private locale = '泰国区';
  private files = new Map<string, string>();

  protected async run(): Promise<void> {
    await this.act('登录 Admin 测试环境并保存会话', async () => {
      this.stateFile = join(this.stateDir, 'qa-ai.json');
      await this.ensureLoginState(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, this.stateFile);
    });
    this.addCleanup('tc06 兜底清理 泰国区 qa-ai 自建行', async () => {
      if (!this.browser) return;
      await this.newCasePage(this.stateFile);
      await this.cleanupThai(this.page!);
      await this.closeCasePage();
    });
    try {
      if (this.wants(26)) await this.case26();
      if (this.wants(27)) await this.case27();
      if (this.wants(28)) await this.case28();
      if (this.wants(29)) await this.case29();
    } finally {
      await this.closeCasePage();
    }
  }

  private async makeFile(name: string, rows: unknown[][]): Promise<string> {
    if (this.files.has(name)) return this.files.get(name)!;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('recommend');
    ws.addRow(['ROOM ID', 'USER ID', '推荐类型', '权重']);
    for (const row of rows) ws.addRow(row);
    const file = join(this.evidenceDir, `${name}.xlsx`);
    await wb.xlsx.writeFile(file);
    this.files.set(name, file);
    return file;
  }

  private async filterLocale(page: Page): Promise<void> {
    await this.resetFilters(page);
    await this.selectOption(page, page, '地区', this.locale);
    await this.search(page);
  }

  private async cleanupThai(page: Page): Promise<void> {
    await this.filterLocale(page);
    const rows = await this.readRows(page);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][9] === 'qa-ai') await this.deleteRow(page, i);
    }
  }

  /** 上传文件并等待首个提示（成功或失败）；返回提示、接口响应、弹窗是否仍打开。 */
  private async upload(page: Page, file: string): Promise<{ toast: string; response: string; dialogOpen: boolean }> {
    const dlg = await this.openBatchDialog(page);
    try {
      await this.dialogSelect(page, dlg, '请选择区域', this.locale);
      await dlg.locator('input[type="file"]').setInputFiles(file);
      const respPromise = page.waitForResponse((r) => r.url().includes('/recommend/upload') && r.request().method() === 'POST', { timeout: 120000 }).catch(() => null);
      await dlg.locator('button:has-text("Confirm")').first().click();
      const resp = await respPromise;
      const response = resp ? await resp.text().catch(() => '') : '';
      await page.waitForFunction(() => document.querySelectorAll('.el-message').length > 0, undefined, { timeout: 15000, polling: 100 }).catch(() => undefined);
      const toast = (await this.drainToasts(page)).join(' | ');
      const dialogOpen = await dlg.isVisible().catch(() => false);
      return { toast, response, dialogOpen };
    } finally {
      await this.closeDialog(dlg, 'Cancel').catch(() => undefined);
    }
  }

  private async checkNoRowsAfter(page: Page, title: string): Promise<void> {
    await this.check(title, async () => {
      await this.filterLocale(page);
      const count = await this.rowCount(page);
      await this.shot('case27-no-rows');
      return { expect: `${this.locale} 行数=0（整表不落库）`, real: `行数=${count}`, pass: count === 0 };
    });
    await this.cleanupThai(page).catch(() => undefined);
  }

  // ---------------- #26 ----------------

  private async case26(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const f2 = await this.makeFile('F2', [
      [null, 23, '侧边推荐', 601],
      [10100001, null, '侧边推荐', 602],
      [null, 23, '侧边推荐', 601]
    ]);
    let result = { toast: '', response: '', dialogOpen: false };
    await this.act('用例#26 上传文件内重复的 F2', async () => { result = await this.upload(page, f2); });
    await this.check('用例#26-① 提示包含第 2 行、第 4 行与「重复」', async () => {
      await this.shot('case26-duplicate-toast');
      const ok = result.toast.includes('第 2 行') && result.toast.includes('第 4 行') && result.toast.includes('重复');
      return { expect: '提示含「第 2 行」「第 4 行」「重复」', real: `${result.toast || '(无提示)'}${result.response ? `；接口=${result.response.slice(0, 120)}` : ''}`, pass: ok };
    });
    await this.checkNoRowsAfter(page, '用例#26-② 列表无任何新增记录（整表不落库）');
    await this.closeCasePage();
  }

  // ---------------- #27 ----------------

  private async case27(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const variants: Array<{ key: string; rows: unknown[][]; keyword: string; title: string; fieldHint: string[] }> = [
      { key: 'F3a', rows: [['abc', null, '侧边推荐', 1], [null, 23, '侧边推荐', 2]], keyword: 'abc', title: 'ROOM ID=abc', fieldHint: ['第 2 行', 'abc'] },
      { key: 'F3b', rows: [[null, 99999999999999999, '侧边推荐', 1], [null, 23, '侧边推荐', 2]], keyword: '超出范围', title: 'USER ID 越界', fieldHint: ['第 2 行', '超出范围'] },
      { key: 'F3c', rows: [[null, 23, 'abc', 1], [null, 23, '侧边推荐', 2]], keyword: 'abc', title: '推荐类型=abc', fieldHint: ['第 2 行', 'abc'] },
      { key: 'F3d', rows: [[null, 23, '侧边推荐', 1.5], [null, 23, '侧边推荐', 2]], keyword: '1.5', title: '权重=1.5', fieldHint: ['第 2 行', '1.5'] },
      { key: 'F3e', rows: [[null, 23, '弹窗', 1], [10100001, null, '侧边推荐', 2]], keyword: '弹窗', title: '弹窗缺房间', fieldHint: ['第 2 行', '弹窗'] },
      { key: 'F3f', rows: [[999999999, null, '侧边推荐', 1], [null, 23, '侧边推荐', 2]], keyword: '不存在', title: 'ROOM ID=999999999 不存在', fieldHint: ['第 2 行', '不存在'] }
    ];
    try {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const file = await this.makeFile(v.key, v.rows);
        let result = { toast: '', response: '', dialogOpen: false };
        await this.act(`用例#27 数据行${String.fromCharCode(97 + i)}：上传 ${v.key}（${v.title}）`, async () => { result = await this.upload(page, file); });
        await this.check(`用例#27-①[数据行${String.fromCharCode(97 + i)}] 提示含「第 2 行」与非法值/字段信息（${v.title}）`, async () => {
          await this.shot(`case27-${v.key}-toast`);
          const ok = v.fieldHint.every((k) => result.toast.includes(k));
          return { expect: `提示含 ${v.fieldHint.join(' + ')}`, real: `${result.toast || '(无提示)'}${result.response ? `；接口=${result.response.slice(0, 160)}` : ''}`, pass: ok };
        });
        await this.check(`用例#27-②[数据行${String.fromCharCode(97 + i)}] 列表无任何新增记录（含文件内合法行整表不落库）`, async () => {
          await this.filterLocale(page);
          const count = await this.rowCount(page);
          await this.shot(`case27-${v.key}-no-rows`);
          return { expect: `${this.locale} 行数=0`, real: `行数=${count}`, pass: count === 0 };
        });
        await this.cleanupThai(page).catch(() => undefined);
      }
    } finally {
      await this.cleanupThai(page).catch(() => undefined);
      await this.closeCasePage();
    }
  }

  // ---------------- #28 ----------------

  private async case28(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.cleanupThai(page).catch(() => undefined);
    await this.resetFilters(page);
    const totalBefore = await this.totalCount(page);
    const f5 = await this.makeFile('F5', Array.from({ length: 2001 }, () => [null, 23, '侧边推荐', 701]));
    let result = { toast: '', response: '', dialogOpen: false };
    await this.act('用例#28 上传 2001 行文件 F5', async () => { result = await this.upload(page, f5); });
    await this.check('用例#28-① 出现提示「单次最多导入 2000 行」', async () => {
      await this.shot('case28-overlimit-toast');
      return { expect: '提示包含「单次最多导入 2000 行」', real: `${result.toast || '(无提示)'}${result.response ? `；接口=${result.response.slice(0, 120)}` : ''}`, pass: result.toast.includes('单次最多导入 2000 行') };
    });
    await this.check('用例#28-② 列表无新增（分页总数仍为 N）', async () => {
      await this.resetFilters(page);
      const totalAfter = await this.totalCount(page);
      return { expect: `Total=${totalBefore}`, real: `Total=${totalAfter}`, pass: totalAfter === totalBefore };
    });
    await this.cleanupThai(page).catch(() => undefined);
    await this.closeCasePage();
  }

  // ---------------- #29 ----------------

  private async case29(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    await this.cleanupThai(page).catch(() => undefined);
    await this.resetFilters(page);
    const totalBefore = await this.totalCount(page);
    const f4 = await this.makeFile('F4', []);
    let result = { toast: '', response: '', dialogOpen: false };
    await this.act('用例#29 上传仅表头的空文件 F4', async () => { result = await this.upload(page, f4); });
    await this.check('用例#29-① 出现提示「Excel 内容为空」', async () => {
      await this.shot('case29-empty-toast');
      return { expect: '提示包含「Excel 内容为空」', real: `${result.toast || '(无提示)'}${result.response ? `；接口=${result.response.slice(0, 120)}` : ''}`, pass: result.toast.includes('Excel 内容为空') };
    });
    await this.check('用例#29-② 列表无新增', async () => {
      await this.resetFilters(page);
      const totalAfter = await this.totalCount(page);
      return { expect: `Total=${totalBefore}`, real: `Total=${totalAfter}`, pass: totalAfter === totalBefore };
    });
    await this.cleanupThai(page).catch(() => undefined);
    await this.closeCasePage();
  }
}

const test = new ExcelInvalidTest();
await test.execute();
