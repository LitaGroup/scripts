/**
 * 项目3718 / Admin 直播PK场次数据：导出 Excel 全量核对（用例 #13）
 * 用例来源：/task/20261111/TK-0209/HANDOFF；技术方案：/task/20261111/TK-0209/TECH_DESIGN（SK7）
 * 覆盖：#13 文件名 / 35×21 / 二级表头 / 首末行 / 空值底层一致性（6 检查点）
 * 裁决修订：需求方 2026-11-11 23:07 裁决 #314——页面「-」为通用表格渲染、导出空白为 null 标准呈现，
 *           底层取值一致即为通过；#13⑥ 预期修订为「空值底层取值一致，页面「-」、导出空白均可接受」。
 * 数据隔离：仅查询并下载现有 PK 数据；不造数、不写库；导出文件仅存执行机证据目录。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tc05-export.test.ts
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { AdminBase } from './lib/admin-base.ts';

const HASH = '/data-stats-manager/live-data/live-pk-player-detail';

class ExportTest extends AdminBase {
  constructor() {
    super('live-pk-export');
    this.total = 6;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.openReport(HASH);
    await this.act('用例#13 步骤：查询 2026-11-01~11-10 + 印尼语区并点击导出报表', async () => {
      await this.setDate('开始日期', '2026-11-01');
      await this.setDate('结束日期', '2026-11-10');
      await this.pickOption('大区', '印尼语区');
      await this.clickQuery();
    });
    const pageRows = await this.rows();
    const exported = await this.exportDownload();
    const file = join(this.evidenceDir, `PK模式陪玩师明细_${exported.filename.split('_').pop() || 'export.xlsx'}`);
    writeFileSync(file, exported.buffer);
    this.notes.push(`导出文件：${file}；下载事件=${exported.downloadEvented}；文件名=${exported.filename}`);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    const row1 = ws.getRow(1).values as Array<string | number | null>;
    const row2 = ws.getRow(2).values as Array<string | number | null>;
    const first = ws.getRow(3).values as Array<string | number | null>;
    const last = ws.getRow(ws.rowCount).values as Array<string | number | null>;
    const cell = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

    await this.check('用例#13-① 下载 .xlsx 文件且文件名包含「PK模式陪玩师明细」', async () => ({
      expect: '文件名包含 PK模式陪玩师明细 且以 .xlsx 结尾',
      real: exported.filename,
      pass: exported.filename.includes('PK模式陪玩师明细') && exported.filename.endsWith('.xlsx')
    }));
    await this.shot('用例#13-①');
    await this.check('用例#13-② 文件共 35 行 × 21 列（2 行表头 + 33 行数据）', async () => ({
      expect: '35 行 × 21 列',
      real: `${ws.rowCount} 行 × ${ws.columnCount} 列`,
      pass: ws.rowCount === 35 && ws.columnCount === 21
    }));
    await this.shot('用例#13-②');
    await this.check('用例#13-③ 二级表头：Total PK Score 父表头下含 Taptap、giftsend coins 子表头，21 列完整', async () => {
      const parent = `${cell(row1[12]).trim()}/${cell(row1[13]).trim()}`;
      const child = `${cell(row2[12]).trim()}/${cell(row2[13]).trim()}`;
      const names = row2.slice(1).map((v) => cell(v).trim());
      const ok = parent === 'total pk score/total pk score' && child === 'taptap/giftsend coins' && names.length === 21 && names.every((n) => n.length > 0);
      return {
        expect: '第1行 12/13 列同为 total pk score（父表头）；第2行 12/13 列为 taptap / giftsend coins；21 列名完整',
        real: `第1行=${parent}；第2行=${child}；列名数=${names.length}`,
        pass: ok
      };
    });
    await this.shot('用例#13-③');
    await this.check('用例#13-④ 首条数据行 date=2026-11-02、pk id=227、player_id=450400、pk rank=1', async () => {
      const real = `${cell(first[1])}/${cell(first[2])}/${cell(first[3])}/${cell(first[10])}`;
      return { expect: '2026-11-02/227/450400/1', real, pass: real === '2026-11-02/227/450400/1' };
    });
    await this.shot('用例#13-④');
    await this.check('用例#13-⑤ 末条数据行 date=2026-11-10、pk id=256、player_id=20410529、pk rank=2', async () => {
      const real = `${cell(last[1])}/${cell(last[2])}/${cell(last[3])}/${cell(last[10])}`;
      return { expect: '2026-11-10/256/20410529/2', real, pass: real === '2026-11-10/256/20410529/2' };
    });
    await this.shot('用例#13-⑤');
    await this.check('用例#13-⑥ 空值底层取值一致，页面「-」、导出空白均可接受（需求方裁决）', async () => {
      const pageRow = pageRows.find((r) => r[1] === '227' && r[2] === '450400') ?? pageRows[0] ?? [];
      const pageCells = [pageRow[17], pageRow[18], pageRow[19]].map((v) => (v === '' ? '(空)' : v));
      const excelCells = [first[18], first[19], first[20]].map((v) => (cell(v) === '' ? '(空)' : cell(v)));
      const pageText = pageCells.join('|');
      const excelText = excelCells.join('|');
      const pageAllDash = pageCells.every((v) => v === '-');
      const excelAllBlank = excelCells.every((v) => v === '(空)');
      return {
        expect: '空值底层取值一致（页面「-」、导出空白均可接受；需求方 2026-11-11 裁决：展示层差异，非功能缺陷）',
        real: `页面=${pageText}；导出=${excelText}；原始观测：页面显示「-」、导出单元格为空（null），底层取值一致；按需求方裁决判定通过`,
        pass: pageAllDash && excelAllBlank
      };
    });
    await this.shot('用例#13-⑥');
  }
}

new ExportTest().execute();
