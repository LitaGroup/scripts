/**
 * 项目3721 / >=401用户数据报表：导出
 * 用例来源：/task/20261119/TK-0339/HANDOFF（九列用例 v5）；技术方案：/task/20261119/TK-0339/TECH_DESIGN
 * 覆盖：#27 导出 xlsx 与文件名；#28 导出表头与空值；#29 全量导出
 * 数据隔离：只读存量；不造数；导出文件仅存本机 evidence 目录，执行后按证据清理说明处理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3721-vip-401-plus-user-report/tests/tc06-export.test.ts
 */
import ExcelJS from 'exceljs';
import { AdminBase } from './lib/admin-base.ts';

interface DownloadInfo { filename: string; path: string; size: number }

class Tc06Export extends AdminBase {
  private download: DownloadInfo = { filename: '', path: '', size: 0 };

  constructor() {
    super('tc06-export');
    this.total = 5;
  }

  protected async run(): Promise<void> {
    await this.act('qa-ai 登录并进入 >=401用户数据 报表', async () => {
      await this.login();
      await this.navReport();
      this.notes.push(`case27-query=${JSON.stringify(await this.clickQuery())}`);
    });
    const query = JSON.parse(this.notes.find((n) => n.startsWith('case27-query='))!.slice('case27-query='.length)) as { total: number; message: string };
    const pageHeaders = await this.tableHeaders();

    await this.act('用例#27 点击导出报表并获取导出文件', async () => {
      this.download = await this.clickExportAndDownload();
      this.notes.push(`download=${JSON.stringify(this.download)}`);
      await this.shot('case27-export', true);
    });

    await this.checkShot('用例#27-① 导出文件为 Excel .xlsx 格式', async () => {
      const pass = this.download.filename.toLowerCase().endsWith('.xlsx') && this.download.size > 0;
      return { expect: '扩展名 .xlsx 且文件非空', real: `文件名「${this.download.filename}」，大小 ${this.download.size} 字节`, pass };
    });
    await this.checkShot('用例#27-② 文件名为「>=401用户数据_yyyyMMddHHmm」', async () => {
      const pattern = /^>=401用户数据_\d{12}\.xlsx$/;
      return { expect: '>=401用户数据_12位年月日时分.xlsx', real: this.download.filename, pass: pattern.test(this.download.filename) };
    });

    let workbook: ExcelJS.Workbook | null = null;
    let sheet: ExcelJS.Worksheet | null = null;
    if (this.download.path) {
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(this.download.path);
      sheet = workbook.worksheets[0] ?? null;
    }

    await this.checkShot('用例#28-① 导出文件表头 29 列且列名/顺序与页面逐列一致', async () => {
      if (!sheet) return { expect: '29 列表头与页面一致', real: '未获取导出文件', pass: false };
      const headerRow = sheet.getRow(1);
      const values: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) values.push(String(headerRow.getCell(c).value ?? '').trim());
      const same = values.length === pageHeaders.length && values.every((v, i) => v === pageHeaders[i]);
      return { expect: `页面 ${pageHeaders.length} 列：${JSON.stringify(pageHeaders)}`, real: `导出 ${values.length} 列：${JSON.stringify(values)}`, pass: same };
    });

    await this.checkShot('用例#28-② 导出数据行空值单元格统一显示「-」', async () => {
      if (!sheet) return { expect: '空值单元格为「-」', real: '未获取导出文件', pass: false };
      let empty = 0;
      let dash = 0;
      let example = '';
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const values = row.values as Array<unknown>;
        for (let c = 1; c < values.length; c++) {
          const value = values[c];
          if (value === null || value === undefined || value === '') {
            empty++;
            if (!example) example = `第 ${rowNumber} 行第 ${c} 列为空`;
          } else if (String(value).trim() === '-') dash++;
        }
      });
      return {
        expect: '空值单元格统一显示「-」（无空白单元格）',
        real: empty ? `空白单元格 ${empty} 个，示例：${example}；「-」单元格 ${dash} 个` : `无空白单元格，「-」单元格 ${dash} 个`,
        pass: empty === 0 && dash > 0
      };
    });

    await this.checkShot('用例#29-① 导出数据行数等于页面查询 Total', async () => {
      if (!sheet) return { expect: `数据行=${query.total}`, real: '未获取导出文件', pass: false };
      const dataRows = sheet.actualRowCount - 1;
      return { expect: `${query.total}`, real: `${dataRows}`, pass: dataRows === query.total };
    });
  }
}

await new Tc06Export().execute();
