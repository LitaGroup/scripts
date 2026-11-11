/**
 * 项目3718 / Admin 直播报表回归：单次开播时长、周榜单数据、直播间日数据、直播间流水（用例 #15~#18）
 * 用例来源：/task/20261111/TK-0209/HANDOFF；技术方案：/task/20261111/TK-0209/TECH_DESIGN（SK9、§4.2、§7）
 * 覆盖：#15 单次开播时长（6）；#16 周榜单数据（6）；#17 直播间日数据（6）；#18 直播间流水（6）
 * 数据隔离：仅查询现有数据并下载导出文件；不造数、不写库；下载文件仅存执行机证据目录。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc06-regression.test.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { AdminBase } from './lib/admin-base.ts';

class RegressionTest extends AdminBase {
  constructor() {
    super('live-pk-regression');
    this.total = 24;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.caseOldDuration();
    await this.caseOldWeek();
    await this.caseOldRoomDay();
    await this.caseFlow();
  }

  private async resetPage(): Promise<void> {
    await this.page!.goto(`${new URL(this.page!.url()).origin}/#/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page!.locator('.el-submenu__title').first().waitFor({ state: 'attached', timeout: 30000 });
  }

  private async navViaMenu(name: string, hash: string): Promise<number> {
    await this.expandMenu('数据统计管理');
    await this.expandMenu('直播相关数据');
    await this.page!.locator('.el-menu-item', { hasText: new RegExp(`^\\s*${name}\\s*$`) }).first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await this.page!.locator('.el-menu-item:visible', { hasText: new RegExp(`^\\s*${name}\\s*$`) }).count();
    await this.clickMenuItem(name);
    await this.page!.waitForFunction((h) => location.hash === h, hash, { timeout: 20000 });
    await this.waitApp();
    await this.page!.getByRole('button', { name: '查询', exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
    return count;
  }

  /** 用例#15：单次开播时长 */
  private async caseOldDuration(): Promise<void> {
    await this.resetPage();
    const menuCount = await this.navViaMenu('单次开播时长', '#/data-stats-manager/live-data/single-live-duration');
    await this.check('用例#15-① 「直播相关数据」子菜单中可见「单次开播时长」菜单项', async () => ({
      expect: '可见菜单项数=1', real: `可见菜单项数=${menuCount}`, pass: menuCount === 1
    }));
    await this.shot('用例#15-①');
    await this.check('用例#15-② 地址栏路由为 #/data-stats-manager/live-data/single-live-duration', async () => {
      const hash = await this.page!.evaluate(() => location.hash);
      return { expect: '#/data-stats-manager/live-data/single-live-duration', real: hash, pass: hash === '#/data-stats-manager/live-data/single-live-duration' };
    });
    await this.shot('用例#15-②');
    const after = await this.oldQuery(async () => { await this.setDateRange('2026-11-01', '2026-11-10'); });
    await this.check('用例#15-③ 查询完成，页面无错误提示', async () => ({
      expect: '无 Request failed/请先登录/Error 等错误提示',
      real: after.errors.length ? after.errors.join(' / ').slice(0, 160) : '无错误提示',
      pass: after.errors.length === 0
    }));
    await this.shot('用例#15-③');
    await this.check('用例#15-④ 列表显示数据行或「No Data」空态且 Total 一致', async () => {
      const ok = (after.rows > 0 && after.total > 0) || (after.rows === 0 && after.total === 0 && after.empty === 'No Data');
      return { expect: '有数据行且 Total>0，或 0 行且 Total 0 且空态 No Data', real: `行=${after.rows}；Total=${after.total}；空态=${after.empty || '(无)'}`, pass: ok };
    });
    await this.shot('用例#15-④');
    let fileHeaders15: string[] = [];
    await this.check('用例#15-⑤ 点击「导出」触发文件下载，文件可正常打开', async () => {
      const file = await this.clickDownload(/导出/, 45000);
      const target = join(this.evidenceDir, 'single-live-duration.xlsx');
      writeFileSync(target, file.buffer);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(target);
      const ws = wb.worksheets[0];
      fileHeaders15 = (ws.getRow(1).values as Array<string | number | null>).slice(1).map((v) => String(v ?? '').trim());
      return { expect: '下载并打开成功（文件非空）', real: `文件名=${file.filename}；工作表=${ws.name}；字节=${file.buffer.length}；表头=${fileHeaders15.join('|')}`, pass: file.buffer.length > 0 && ws.rowCount >= 1 };
    });
    await this.shot('用例#15-⑤');
    await this.check('用例#15-⑥ 文件表头列名与页面表格列名一致（Date、Locale、Room ID、User ID、Duration (h)）', async () => {
      const pageHeaders = await this.uniqueHeaders();
      const expect = ['Date', 'Locale', 'Room ID', 'User ID', 'Duration (h)'];
      return {
        expect: `${expect.join('|')}（且与文件表头一致）`,
        real: `页面=${pageHeaders.join('|')}；文件=${fileHeaders15.join('|') || '(未取得)'}`,
        pass: JSON.stringify(pageHeaders) === JSON.stringify(expect) && JSON.stringify(pageHeaders) === JSON.stringify(fileHeaders15)
      };
    });
    await this.shot('用例#15-⑥');
  }

  /** 用例#16：周榜单数据 */
  private async caseOldWeek(): Promise<void> {
    await this.resetPage();
    const menuCount16 = await this.navViaMenu('周榜单数据', '#/data-stats-manager/live-data/week-rank');
    await this.check('用例#16-① 「直播相关数据」子菜单中可见「周榜单数据」菜单项', async () => ({ expect: '可见菜单项数=1', real: `可见菜单项数=${menuCount16}`, pass: menuCount16 === 1 }));
    await this.shot('用例#16-①');
    await this.check('用例#16-② 地址栏路由为 #/data-stats-manager/live-data/week-rank', async () => {
      const hash = await this.page!.evaluate(() => location.hash);
      return { expect: '#/data-stats-manager/live-data/week-rank', real: hash, pass: hash === '#/data-stats-manager/live-data/week-rank' };
    });
    await this.shot('用例#16-②');
    const after = await this.oldQuery(async () => { await this.fillByPlaceholder('请选择周一日期', '2026-11-02'); });
    await this.check('用例#16-③ 查询完成，页面无错误提示', async () => ({
      expect: '无 Request failed/请先登录/Error 等错误提示',
      real: after.errors.length ? after.errors.join(' / ').slice(0, 160) : '无错误提示',
      pass: after.errors.length === 0
    }));
    await this.shot('用例#16-③');
    await this.check('用例#16-④ 列表显示数据行或「No Data」空态且 Total 一致', async () => {
      const ok = (after.rows > 0 && after.total > 0) || (after.rows === 0 && after.total === 0 && after.empty === 'No Data');
      return { expect: '有数据行且 Total>0，或 0 行且 Total 0 且空态 No Data', real: `行=${after.rows}；Total=${after.total}；空态=${after.empty || '(无)'}`, pass: ok };
    });
    await this.shot('用例#16-④');
    let fileHeaders16: string[] = [];
    await this.check('用例#16-⑤ 点击「导出」触发文件下载，文件可正常打开', async () => {
      const file = await this.clickDownload(/导出/, 45000);
      const target = join(this.evidenceDir, 'week-rank.xlsx');
      writeFileSync(target, file.buffer);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(target);
      const ws = wb.worksheets[0];
      fileHeaders16 = (ws.getRow(1).values as Array<string | number | null>).slice(1).map((v) => String(v ?? '').trim());
      return { expect: '下载并打开成功（文件非空）', real: `文件名=${file.filename}；工作表=${ws.name}；字节=${file.buffer.length}；表头=${fileHeaders16.join('|')}`, pass: file.buffer.length > 0 && ws.rowCount >= 1 };
    });
    await this.shot('用例#16-⑤');
    await this.check('用例#16-⑥ 文件表头列名与页面表格列名一致（Event Type、Week、Locale、Room ID、Score）', async () => {
      const pageHeaders = await this.uniqueHeaders();
      const expect = ['Event Type', 'Week', 'Locale', 'Room ID', 'Score'];
      return {
        expect: `${expect.join('|')}（且与文件表头一致）`,
        real: `页面=${pageHeaders.join('|')}；文件=${fileHeaders16.join('|') || '(未取得)'}`,
        pass: JSON.stringify(pageHeaders) === JSON.stringify(expect) && JSON.stringify(pageHeaders) === JSON.stringify(fileHeaders16)
      };
    });
    await this.shot('用例#16-⑥');
  }

  /** 用例#17：直播间日数据 */
  private async caseOldRoomDay(): Promise<void> {
    await this.resetPage();
    const menuCount17 = await this.navViaMenu('直播间日数据', '#/data-stats-manager/live-data/room-day-data');
    await this.check('用例#17-① 「直播相关数据」子菜单中可见「直播间日数据」菜单项', async () => ({ expect: '可见菜单项数=1', real: `可见菜单项数=${menuCount17}`, pass: menuCount17 === 1 }));
    await this.shot('用例#17-①');
    await this.check('用例#17-② 地址栏路由为 #/data-stats-manager/live-data/room-day-data', async () => {
      const hash = await this.page!.evaluate(() => location.hash);
      return { expect: '#/data-stats-manager/live-data/room-day-data', real: hash, pass: hash === '#/data-stats-manager/live-data/room-day-data' };
    });
    await this.shot('用例#17-②');
    const after = await this.oldQuery(async () => { await this.setDateRange('2026-11-01', '2026-11-10'); });
    await this.check('用例#17-③ 查询完成，页面无错误提示', async () => ({
      expect: '无 Request failed/请先登录/Error 等错误提示',
      real: after.errors.length ? after.errors.join(' / ').slice(0, 160) : '无错误提示',
      pass: after.errors.length === 0
    }));
    await this.shot('用例#17-③');
    await this.check('用例#17-④ 列表显示数据行或「No Data」空态且 Total 一致', async () => {
      const ok = (after.rows > 0 && after.total > 0) || (after.rows === 0 && after.total === 0 && after.empty === 'No Data');
      return { expect: '有数据行且 Total>0，或 0 行且 Total 0 且空态 No Data', real: `行=${after.rows}；Total=${after.total}；空态=${after.empty || '(无)'}`, pass: ok };
    });
    await this.shot('用例#17-④');
    let fileHeaders17: string[] = [];
    await this.check('用例#17-⑤ 点击「导出」触发文件下载，文件可正常打开', async () => {
      const file = await this.clickDownload(/导出/, 45000);
      const target = join(this.evidenceDir, 'room-day-data.xlsx');
      writeFileSync(target, file.buffer);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(target);
      const ws = wb.worksheets[0];
      fileHeaders17 = (ws.getRow(1).values as Array<string | number | null>).slice(1).map((v) => String(v ?? '').trim());
      return { expect: '下载并打开成功（文件非空）', real: `文件名=${file.filename}；工作表=${ws.name}；字节=${file.buffer.length}；表头列数=${fileHeaders17.length}`, pass: file.buffer.length > 0 && ws.rowCount >= 1 };
    });
    await this.shot('用例#17-⑤');
    await this.check('用例#17-⑥ 文件表头列名与页面表格列名一致（24 列）', async () => {
      const pageHeaders = await this.uniqueHeaders();
      return {
        expect: '页面 24 列且与文件表头一致',
        real: `页面=${pageHeaders.length} 列；文件=${fileHeaders17.length} 列；差异=${pageHeaders.filter((h, i) => h !== fileHeaders17[i]).slice(0, 5).join(',') || '无'}`,
        pass: pageHeaders.length === 24 && fileHeaders17.length === 24 && JSON.stringify(pageHeaders) === JSON.stringify(fileHeaders17)
      };
    });
    await this.shot('用例#17-⑥');
  }

  /** 用例#18：直播间流水（新式通用页） */
  private async caseFlow(): Promise<void> {
    // 用例 15~17 的旧式报表会留下持续错误提示，用例 18 使用全新会话上下文隔离（避免提示串扰）
    const original = this.page!;
    const fresh = await this.loginAs(process.env.ADMIN_USERNAME!, process.env.ADMIN_PASSWORD!);
    this.page = fresh;
    try {
      await this.caseFlowChecks();
    } finally {
      await this.closeExtraPage(fresh);
      this.page = original;
    }
  }

  private async caseFlowChecks(): Promise<void> {
    const menuCount18 = await this.navViaMenu('直播间流水', '#/data-stats-manager/live-data/live-room-flow');
    await this.check('用例#18-① 「直播相关数据」子菜单中可见「直播间流水」菜单项', async () => ({ expect: '可见菜单项数=1', real: `可见菜单项数=${menuCount18}`, pass: menuCount18 === 1 }));
    await this.shot('用例#18-①');
    await this.check('用例#18-② 地址栏路由为 #/data-stats-manager/live-data/live-room-flow', async () => {
      const hash = await this.page!.evaluate(() => location.hash);
      return { expect: '#/data-stats-manager/live-data/live-room-flow', real: hash, pass: hash === '#/data-stats-manager/live-data/live-room-flow' };
    });
    await this.shot('用例#18-②');
    await this.act('用例#18 步骤：数据维度=日维度并查询', async () => {
      await this.pickOption('数据维度', '日维度');
      await this.clickQuery();
    });
    const msg = await this.messageText();
    const total = await this.totalText();
    const rows = await this.rowCount();
    const errors = await this.errorDialogs();
    await this.check('用例#18-③ 出现提示「查询完成，共 N 条」且页面无错误提示', async () => {
      const m = msg.match(/^查询完成，共 (\d+) 条$/);
      return { expect: '查询完成，共 N 条（N 为正整数）且无错误提示', real: `提示=${msg}；错误=${errors.length}`, pass: !!m && Number(m[1]) > 0 && errors.length === 0 };
    });
    await this.shot('用例#18-③');
    await this.check('用例#18-④ 列表显示数据行，分页 Total 大于 0', async () => {
      const t = Number((total.match(/Total\s+([\d,]+)/) ?? [])[1]?.replace(/,/g, '') ?? 0);
      return { expect: '行>0 且 Total>0', real: `行=${rows}；Total=${t}`, pass: rows > 0 && t > 0 };
    });
    await this.shot('用例#18-④');
    const exported = await this.exportDownload();
    const flowFile = join(this.evidenceDir, `live-room-flow_${Date.now()}.xlsx`);
    writeFileSync(flowFile, exported.buffer);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(flowFile);
    const ws = wb.worksheets[0];
    await this.check('用例#18-⑤ 点击「导出报表」触发文件下载，文件可正常打开', async () => ({
      expect: '下载并打开成功', real: `文件名=${exported.filename}；行=${ws.rowCount}；列=${ws.columnCount}`, pass: ws.rowCount > 1 && ws.columnCount > 0
    }));
    await this.shot('用例#18-⑤');
    await this.check('用例#18-⑥ 文件表头列名与页面表格列名一致（30 列）', async () => {
      const pageHeaders = await this.uniqueHeaders();
      const excelHeaders = (ws.getRow(1).values as Array<string | number | null>).slice(1).map((v) => String(v ?? '').trim());
      return {
        expect: '页面 30 列且与导出表头一致',
        real: `页面=${pageHeaders.length} 列；导出=${excelHeaders.length} 列；差异=${pageHeaders.filter((h, i) => h !== excelHeaders[i]).slice(0, 5).join(',') || '无'}`,
        pass: pageHeaders.length === 30 && excelHeaders.length === 30 && JSON.stringify(pageHeaders) === JSON.stringify(excelHeaders)
      };
    });
    await this.shot('用例#18-⑥');
  }

  /** 旧式 3 报表查询：返回提示/错误/行数/Total/空态；查询失败不中断后续检查。 */
  private async oldQuery(prepare: () => Promise<void>): Promise<{ errors: string[]; rows: number; total: number; empty: string; message: string }> {
    await this.act('查询前置：填写筛选条件', prepare);
    await this.act('点击「查询」', async () => {
      await this.page!.getByRole('button', { name: '查询', exact: true }).click();
      await Promise.race([
        this.page!.waitForResponse((r) => r.url().includes('/admin-main/'), { timeout: 45000 }).catch(() => null),
        this.page!.locator('.el-message').last().waitFor({ state: 'visible', timeout: 45000 }).catch(() => null)
      ]);
      await this.page!.locator('.el-loading-mask').first().waitFor({ state: 'hidden', timeout: 60000 }).catch(() => undefined);
    });
    const message = await this.messageText();
    const errors = await this.errorDialogs();
    const rows = await this.rowCount();
    const totalText = await this.totalText();
    const total = Number((totalText.match(/Total\s+([\d,]+)/) ?? [])[1]?.replace(/,/g, '') ?? 0);
    const empty = await this.emptyText();
    this.notes.push(`旧式报表查询：提示=${message || '(无)'}；错误=${errors.join('/') || '(无)'}；行=${rows}；Total=${total}；空态=${empty || '(无)'}`);
    return { errors, rows, total, empty, message };
  }

  private async uniqueHeaders(): Promise<string[]> {
    const list = await this.headerTexts();
    const out: string[] = [];
    for (const h of list) if (h && out[out.length - 1] !== h) out.push(h);
    return out;
  }
}

new RegressionTest().execute();
