/**
 * 项目 BL-0058 / TK-0687：房间人气推荐设置 - Excel 合法导入与库内重复（用例 #24、#25）
 * 用例来源：TK-0686 HANDOFF 九列用例；技术方案：/task/20261125/TK-0686/TECH_DESIGN（BD-2、PM-3 F1、§5 断言映射）
 * 覆盖：#24 合法 Excel 导入 3 行（结果提示/列表/操作人/清理）；#25 库内重复导入（成功 0、跳过 3）
 * 数据隔离：F1 仅含本任务自建 3 行（权重 301/302/303），导入后按地区筛选批量删除；存量数据只读。
 * 运行：TMPDIR=./.tmp-playwright ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc05-excel-valid.test.ts [--case=24]
 */
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import type { Page } from 'playwright';
import { AdminBase } from './lib/admin-base.ts';

class ExcelValidTest extends AdminBase {
  constructor() {
    super('tc05-excel-valid', { 24: 4, 25: 3 });
  }

  private stateFile = '';
  private locale = '越南区';
  private f1 = '';
  private cleanupLocales = new Set<string>();

  private registerLocaleCleanup(locale: string): void {
    if (this.cleanupLocales.has(locale)) return;
    this.cleanupLocales.add(locale);
    this.addCleanup(`tc05 兜底清理 ${locale} 自建导入行`, async () => {
      if (!this.browser) return;
      await this.newCasePage(this.stateFile);
      const page = this.page!;
      await this.filterLocale(page, locale);
      const rows = await this.readRows(page);
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i][9] === 'qa-ai') await this.deleteRow(page, i);
      }
      await this.closeCasePage();
    });
  }

  protected async run(): Promise<void> {
    await this.act('登录 Admin 测试环境并保存会话', async () => {
      this.stateFile = join(this.stateDir, 'qa-ai.json');
      await this.ensureLoginState(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, this.stateFile);
    });
    try {
      if (this.wants(24)) await this.case24();
      if (this.wants(25)) await this.case25();
    } finally {
      await this.closeCasePage();
    }
  }

  private async makeF1(): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('recommend');
    ws.addRow(['ROOM ID', 'USER ID', '推荐类型', '权重']);
    ws.addRow([null, 23, '侧边推荐', 301]);
    ws.addRow([10100001, null, '侧边推荐', 302]);
    ws.addRow([10100001, 23, '侧边推荐', 303]);
    const file = join(this.evidenceDir, 'F1.xlsx');
    await wb.xlsx.writeFile(file);
    return file;
  }

  /** 选择一个当前无数据的候选大区（优先越南区，冲突降级泰国区/阿拉伯语区）。 */
  private async chooseLocale(page: Page): Promise<string> {
    for (const candidate of ['越南区', '泰国区', '阿拉伯语区']) {
      await this.resetFilters(page);
      await this.selectOption(page, page, '地区', candidate);
      await this.search(page);
      if (await this.rowCount(page) === 0) {
        await this.resetFilters(page);
        this.notes.push(`#24/#25 使用大区：${candidate}（候选顺序 越南->泰国->阿拉伯）`);
        return candidate;
      }
    }
    throw new Error('越南/泰国/阿拉伯语区均已有自建同键记录，无法满足 BD-2 就绪确认');
  }

  private async importFile(page: Page, locale: string, file: string, successKeyword = '导入成功'): Promise<{ toast: string; response: string }> {
    const dlg = await this.openBatchDialog(page);
    try {
      await this.dialogSelect(page, dlg, '请选择区域', locale);
      await dlg.locator('input[type="file"]').setInputFiles(file);
      const respPromise = page.waitForResponse((r) => r.url().includes('/recommend/upload') && r.request().method() === 'POST', { timeout: 120000 }).catch(() => null);
      await dlg.locator('button:has-text("Confirm")').first().click();
      const resp = await respPromise;
      const text = resp ? await resp.text().catch(() => '') : '';
      await this.waitToastContains(successKeyword, 15000, page);
      const toast = (await this.drainToasts(page)).join(' | ');
      await dlg.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
      return { toast, response: text };
    } finally {
      await this.closeDialog(dlg, 'Cancel').catch(() => undefined);
    }
  }

  private async filterLocale(page: Page, locale: string): Promise<void> {
    await this.resetFilters(page);
    await this.selectOption(page, page, '地区', locale);
    await this.search(page);
  }

  // ---------------- #24 ----------------

  private async case24(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    this.f1 = await this.makeF1();
    this.locale = await this.chooseLocale(page);
    this.registerLocaleCleanup(this.locale);
    let toast = '';
    let response = '';
    await this.act(`用例#24 批量导入 F1 到 ${this.locale}`, async () => {
      const r = await this.importFile(page, this.locale, this.f1);
      toast = r.toast;
      response = r.response;
    });
    await this.check('用例#24-① 导入结果提示含成功 3 条', async () => {
      await this.shot('case24-import-toast');
      const ok = toast.includes('导入成功 3 条') && toast.includes('跳过 0 条');
      return { expect: '提示含「导入成功 3 条，跳过 0 条」', real: `${toast || '(无提示)'}${response ? `；接口=${response.slice(0, 120)}` : ''}`, pass: ok };
    });
    await this.filterLocale(page, this.locale);
    const rows = await this.readRows(page);
    await this.check('用例#24-② 该地区出现 3 条新记录，类型=侧边推荐，权重分别为 301/302/303', async () => {
      const weights = rows.map((r) => r[7]).sort();
      const types = rows.map((r) => r[6]);
      const ok = rows.length === 3 && weights.join(',') === '301,302,303' && types.every((t) => t === '侧边推荐');
      await this.shotEl('.el-table__body-wrapper', 'case24-imported-rows');
      return { expect: '3 行；推荐类型=侧边推荐；权重 301/302/303', real: `共 ${rows.length} 行；权重=${weights.join(',')}；类型=${types.join(',')}`, pass: ok };
    });
    await this.check('用例#24-③ 3 条新记录操作人列均显示 qa-ai', async () => {
      const ops = rows.map((r) => r[9]);
      return { expect: '每行操作人=qa-ai', real: ops.join(',') || '(无行)', pass: rows.length === 3 && ops.every((o) => o === 'qa-ai') };
    });
    await this.act('用例#24 勾选 3 条新记录批量删除清理', async () => {
      await this.batchDeleteAll(page);
      await this.search(page);
    });
    await this.check('用例#24-④ 清理后 3 条记录消失', async () => {
      const count = await this.rowCount(page);
      await this.shot('case24-cleaned');
      return { expect: '行数=0', real: `行数=${count}`, pass: count === 0 };
    });
    await this.closeCasePage();
  }

  // ---------------- #25 ----------------

  private async case25(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    if (!this.f1) this.f1 = await this.makeF1();
    this.locale = await this.chooseLocale(page);
    this.registerLocaleCleanup(this.locale);
    await this.act(`用例#25 前置：首次导入 F1 到 ${this.locale}`, async () => {
      const r = await this.importFile(page, this.locale, this.f1);
      this.notes.push(`#25 首次导入提示：${r.toast}；接口=${r.response.slice(0, 160)}`);
    });
    await this.filterLocale(page, this.locale);
    const beforeRows = await this.readRows(page);
    if (beforeRows.length !== 3) {
      throw new Error(`#25 前置未就绪：${this.locale} 导入后行数=${beforeRows.length}，期望 3`);
    }
    // 页面刷新重置文件输入，真实“再次上传相同文件”
    await this.act('用例#25 刷新页面后再次上传相同 F1', async () => {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
      await this.waitListReady(page);
    });
    let toast = '';
    let response = '';
    await this.act(`用例#25 再次导入相同 F1 到 ${this.locale}`, async () => {
      const r = await this.importFile(page, this.locale, this.f1);
      toast = r.toast;
      response = r.response;
    });
    await this.check('用例#25-① 导入结果提示显示成功 0、跳过 3', async () => {
      await this.shot('case25-skip-toast');
      const ok = toast.includes('导入成功 0 条') && toast.includes('跳过 3 条');
      return { expect: '提示含「导入成功 0 条，跳过 3 条」', real: `${toast || '(无提示)'}${response ? `；接口=${response.slice(0, 120)}` : ''}`, pass: ok };
    });
    await this.filterLocale(page, this.locale);
    const rows = await this.readRows(page);
    await this.check('用例#25-② 列表该地区仍为 3 条记录（无重复新增）', async () => {
      const weights = rows.map((r) => r[7]).sort();
      await this.shotEl('.el-table__body-wrapper', 'case25-still-3');
      return { expect: '3 行，权重 301/302/303', real: `共 ${rows.length} 行；权重=${weights.join(',')}`, pass: rows.length === 3 && weights.join(',') === '301,302,303' };
    });
    await this.act('用例#25 勾选 3 条记录批量删除清理', async () => {
      await this.batchDeleteAll(page);
      await this.search(page);
    });
    await this.check('用例#25-③ 清理后记录消失', async () => {
      const count = await this.rowCount(page);
      await this.shot('case25-cleaned');
      return { expect: '行数=0', real: `行数=${count}`, pass: count === 0 };
    });
    await this.closeCasePage();
  }
}

const test = new ExcelValidTest();
await test.execute();
