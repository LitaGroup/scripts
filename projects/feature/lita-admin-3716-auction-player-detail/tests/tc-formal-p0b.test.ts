/**
 * 项目 3716「拍拍模式流水-主播维度」：P0-B（17 列表头/首行单元格/导出）
 *
 * 用例来源：/task/20261111/TK-0206/HANDOFF 第 3 节九列表格（22 条）
 * 技术方案：/task/20261111/TK-0206/TECH_DESIGN（§4.3 表头/首行实测值，§5 断言映射）
 * 覆盖：用例#17 DISP-01、#18 DISP-02、#16 EXPORT-01
 * 数据隔离：BD-0 存量只读（2026-11-10）；导出仅下载文件，不改业务数据。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc-formal-p0b.test.ts [--evidence-dir=...]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { AdminBase } from './lib/admin-base.ts';

const HEADERS = [
  'date', 'sale_batch_no', 'player_id', 'player_no', 'player_nick', 'room id', 'room nick',
  'auction status', 'auction total coins', 'number of users in auction', 'winner user_id',
  'winner user_no', 'winner user_nick', 'winner user_total price', 'auction success - date&time',
  'relationship type', 'relationship level'
];
const num = (v: string): number => Number((v ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')) || 0;
const norm = (v: string): string => (v ?? '').replace(/[\u200B-\u200F\uFEFF]/g, '').replace(/\s+/g, ' ').trim();

class P0BTest extends AdminBase {
  constructor() {
    super('auction-player-detail-p0b');
    this.total = 11;
  }

  private async rows(): Promise<string[][]> {
    return this.tableRows();
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.nav('/data-stats-manager/voice-room-data/auction-mode-player-detail');
    await this.waitReportReady();
    await this.setDateValue('开始日期', '2026-11-10');
    await this.setDateValue('结束日期', '2026-11-10');
    await this.waitConditionCount(2);
    await this.clickQuery();

    const headers = (await this.page!.locator('.el-table__header-wrapper th').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    const headerRows = await this.page!.locator('.el-table__header-wrapper thead tr').count();
    const dRows = await this.rows();
    const first = dRows[0] ?? [];
    await this.shot('disp01-headers');
    await this.check('用例#17-①(TC-DISP-01) 表头共 17 列且列名与顺序正确', async (): Promise<CheckResult> => {
      const got = headers.map((h) => h.toLowerCase());
      return {
        expect: HEADERS.join('|'),
        real: `${got.join('|')}（${headers.length} 列）`,
        pass: headers.length === 17 && HEADERS.every((h, i) => got[i] === h)
      };
    });
    await this.check('用例#17-②(TC-DISP-01) 各列名完整展示，不截断、无单字母列、不串列', async (): Promise<CheckResult> => {
      return {
        expect: '17 列均非空且无单字母列',
        real: `列数=${headers.length}，单字母=${headers.filter((h) => h.length <= 1).length}，空列=${headers.filter((h) => !h).length}`,
        pass: headers.length === 17 && !headers.some((h) => h.length <= 1)
      };
    });
    await this.check('用例#17-③(TC-DISP-01) auction success - date&time 为单一完整列名，未被拆为分组表头', async (): Promise<CheckResult> => {
      const has = headers.map((h) => h.toLowerCase()).includes('auction success - date&time');
      return {
        expect: '列名存在且表头为单行平铺',
        real: `存在=${has}，表头行=${headerRows}`,
        pass: has && headerRows === 1
      };
    });
    await this.check('用例#18-①(TC-DISP-02) 首行 sale_batch_no = YDA1A1794322778A24706644UF160426', async (): Promise<CheckResult> => {
      return {
        expect: 'YDA1A1794322778A24706644UF160426',
        real: first[1] ?? '',
        pass: (first[1] ?? '') === 'YDA1A1794322778A24706644UF160426'
      };
    });
    await this.check('用例#18-②(TC-DISP-02) 首行 player_id=322540、player_no=1366411、player_nick=Lavieenbluu', async (): Promise<CheckResult> => {
      return {
        expect: '322540 / 1366411 / Lavieenbluu',
        real: `${first[2]} / ${first[3]} / ${norm(first[4])}`,
        pass: first[2] === '322540' && first[3] === '1366411' && norm(first[4]) === 'Lavieenbluu'
      };
    });
    await this.check('用例#18-③(TC-DISP-02) 首行 room id=10101473、status=结算成功，关系已处理、coins=38915.06、bidders=5', async (): Promise<CheckResult> => {
      return {
        expect: '10101473 / 结算成功，关系已处理 / 38915.06 / 5',
        real: `${first[5]} / ${first[7]} / ${first[8]} / ${first[9]}`,
        pass: first[5] === '10101473' && first[7] === '结算成功，关系已处理' && Math.abs(num(first[8]) - 38915.06) < 0.01 && num(first[9]) === 5
      };
    });
    await this.check('用例#18-④(TC-DISP-02) 首行 winner user_id=21264129、price=37997、time=2026-11-10 23:05:35、type=cp、level=2', async (): Promise<CheckResult> => {
      return {
        expect: '21264129 / 37997 / 2026-11-10 23:05:35 / cp / 2',
        real: `${first[10]} / ${first[13]} / ${first[14]} / ${first[15]} / ${first[16]}`,
        pass: first[10] === '21264129' && Math.abs(num(first[13]) - 37997) < 0.01 && first[14] === '2026-11-10 23:05:35' && first[15] === 'cp' && num(first[16]) === 2
      };
    });

    // ---------- 用例#16 TC-EXPORT-01 ----------
    await this.queryCooldown();
    const respPromise = this.page!.waitForResponse((r) => r.url().includes('/stats/query/download'), { timeout: 180000 });
    const dlNamePromise = this.page!.waitForEvent('download', { timeout: 180000 }).then((d) => d.suggestedFilename()).catch(() => '');
    await this.page!.getByRole('button', { name: '导出报表', exact: true }).click();
    const exportResp = await respPromise;
    this.markQuery();
    const suggested = await dlNamePromise;
    const cd = exportResp.headers()['content-disposition'] ?? '';
    let fileName = suggested;
    if (!fileName) {
      const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
      fileName = m ? decodeURIComponent(m[1]) : '';
    }
    const buf = Buffer.from(await exportResp.body());
    const xlsxPath = join(this.evidenceDir, `export-20261110-${Date.now()}.xlsx`);
    writeFileSync(xlsxPath, buf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxPath);
    const ws = wb.worksheets[0];
    const excelRows: string[][] = [];
    ws.eachRow((row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => values.push(String(cell.value ?? '')));
      excelRows.push(values);
    });
    const dataStart = excelRows.findIndex((r) => /^\d{4}-\d{2}-\d{2}~/.test(r[0] ?? ''));
    const dataRows = dataStart >= 0 ? excelRows.slice(dataStart) : [];
    const excelSum = Math.round(dataRows.reduce((acc, r) => acc + num(r[8]), 0) * 100) / 100;
    const sameFirst = first.length === 17 && (dataRows[0] ?? []).length === 17 && first.every((v, i) => norm((dataRows[0] ?? [])[i] ?? '') === norm(v));
    await this.shot('export01-clicked');
    await this.check('用例#16-①(TC-EXPORT-01) 下载文件名含「拍拍模式流水 - 主播维度」（.xlsx）', async (): Promise<CheckResult> => {
      return {
        expect: '文件名含「拍拍模式流水 - 主播维度」且为 .xlsx',
        real: `文件名=${fileName}`,
        pass: /拍拍模式流水\s*-\s*主播维度/.test(fileName) && /\.xlsx$/i.test(fileName)
      };
    });
    await this.check('用例#16-②(TC-EXPORT-01) 导出 17 列 × 26 个数据行，列名与列序与页面一致', async (): Promise<CheckResult> => {
      const header = HEADERS.map((_, i) => {
        const a = ((excelRows[0] ?? [])[i] ?? '').trim();
        const b = ((excelRows[1] ?? [])[i] ?? '').trim();
        if (a && b && a.toLowerCase() !== b.toLowerCase() && !a.toLowerCase().includes(b.toLowerCase())) {
          return `${a} - ${b}`.replace(/\s+/g, ' ').trim().toLowerCase();
        }
        return a.toLowerCase();
      });
      const headerOk = HEADERS.every((h, i) => header[i] === h);
      return {
        expect: '17 列 × 26 数据行；列名/列序与页面一致',
        real: `列=${ws.columnCount}，数据行=${dataRows.length}，表头行=${dataStart}，表头匹配=${headerOk}`,
        pass: ws.columnCount === 17 && dataRows.length === 26 && headerOk
      };
    });
    await this.check('用例#16-③(TC-EXPORT-01) Auction Total coins 列合计 445,824.52，与页面一致', async (): Promise<CheckResult> => {
      return { expect: '445824.52', real: excelSum.toFixed(2), pass: Math.abs(excelSum - 445824.52) < 0.01 };
    });
    await this.check('用例#16-④(TC-EXPORT-01) 数据不错列：导出首行 17 字段与页面首行一致', async (): Promise<CheckResult> => {
      return {
        expect: '导出首行与页面首行 17 字段一致',
        real: `一致=${sameFirst}；导出首行=${JSON.stringify((dataRows[0] ?? []).slice(0, 3))}…`,
        pass: sameFirst
      };
    });

    this.notes.push(`导出表头行=${dataStart}；列=${ws.columnCount}；数据行=${dataRows.length}；文件=${xlsxPath}`);
  }
}

new P0BTest().execute().then(() => undefined).catch((e) => {
  console.error('FATAL:', e?.message ?? e);
  process.exitCode = 1;
});
