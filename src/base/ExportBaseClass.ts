import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { CheckBaseClass } from './CheckBaseClass.ts';

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'yaml' | 'json-line' | 'markdown';

export const EXPORT_FORMATS: readonly ExportFormat[] = ['csv', 'xlsx', 'json', 'yaml', 'json-line', 'markdown'];

/** 列定义：key = 数据字段名，header = 表头展示名（默认与 key 相同） */
export interface ExportColumn {
  key: string;
  header?: string;
}

/** 导出文件记录（[files] 行的数据项），file 为相对 output-dir 的文件名 */
export interface ExportFile {
  title: string;
  file: string;
}

const FORMAT_EXT: Record<ExportFormat, string> = {
  csv: '.csv',
  xlsx: '.xlsx',
  json: '.json',
  yaml: '.yaml',
  'json-line': '.jsonl',
  markdown: '.md',
};

/**
 * 导出脚本基类（基于 CheckBaseClass，输出协议兼容）。
 *
 * - 命令行参数（在 process.argv 中解析）：
 *   - `--output-dir=<dir>`  必填，输出目录（不存在会自动创建）；缺失时脚本直接 fail。
 *   - `--format=<fmt>`      输出格式：csv（默认）/ xlsx / json / yaml / json-line / markdown。
 * - 子类实现 run()，调用 export(title, data, opts?) 完成导出（每个 export 一个 act 步骤）。
 * - 全部导出完成后、done 之前，输出一行 `[files] [{"title":"...","file":"xxx.csv"},...]`。
 * - 通用序列化方法：toCsv / toXlsx / toJson / toYaml / toJsonLine / toMarkdown。
 */
export abstract class ExportBaseClass extends CheckBaseClass {
  /** 输出目录（--output-dir，必填） */
  protected readonly outputDir: string | undefined;
  /** 输出格式（--format，默认 csv） */
  protected readonly format: ExportFormat;

  private files: ExportFile[] = [];

  constructor() {
    super();
    const parsed = ExportBaseClass.parseArgs();
    this.outputDir = parsed.outputDir;
    // 原始值可能是非法格式；execute() 会先校验，非法则直接 fail，不会进入 run()
    this.format = parsed.format as ExportFormat;
  }

  private static parseArgs(): { outputDir?: string; format: ExportFormat | string } {
    let outputDir: string | undefined;
    let format: ExportFormat | string = 'csv';
    for (const arg of process.argv.slice(2)) {
      if (arg.startsWith('--output-dir=')) {
        outputDir = arg.slice('--output-dir='.length).trim() || undefined;
      } else if (arg.startsWith('--format=')) {
        format = arg.slice('--format='.length).trim().toLowerCase();
      }
    }
    return { outputDir, format };
  }

  /**
   * 导出数据到 output-dir（按 --format 序列化）。内部包装为一个 act 步骤。
   * @param title    步骤标题，同时作为默认文件名（slug 化）
   * @param data     行数据（对象数组）
   * @param opts.columns  列定义（默认取首行对象的键顺序）
   * @param opts.filename 文件名（默认 slug(title) + 扩展名）
   * @returns 相对 output-dir 的文件名
   */
  protected async export(
    title: string,
    data: Record<string, unknown>[],
    opts?: { columns?: ExportColumn[]; filename?: string },
  ): Promise<string> {
    let file = '';
    await this.act(`[导出] ${title}`, async () => {
      if (!this.outputDir) this.skip('缺少必填参数 --output-dir');
      file = opts?.filename
        ? opts.filename.replace(/\.[^.]*$/, '') + FORMAT_EXT[this.format]
        : slugify(title) + FORMAT_EXT[this.format];
      const columns = opts?.columns ?? columnsOf(data);
      const content = await this.serialize(data, columns);
      await mkdir(this.outputDir, { recursive: true });
      await writeFile(join(this.outputDir, file), content);
      this.files.push({ title, file });
      this.log(`已导出 ${data.length} 行 → ${file}`);
    });
    return file;
  }

  /** execute：校验参数（缺失 --output-dir 直接 fail）→ run() → [files] → done */
  async execute(): Promise<void> {
    this.emitStart();
    if (!this.outputDir) {
      this.emitDone(new Error('缺少必填参数 --output-dir=xxxxx'));
      return;
    }
    if (!EXPORT_FORMATS.includes(this.format)) {
      this.emitDone(new Error(`不支持的 --format=${this.format}，可选：${EXPORT_FORMATS.join('/')}`));
      return;
    }
    let runError: Error | null = null;
    try {
      await this.run();
    } catch (e) {
      runError = e as Error;
      this.log(`run() 异常: ${(e as Error).message}`);
    }
    this.emit('files', this.files);
    this.emitDone(runError);
  }

  // ============ 通用序列化方法 ============

  protected async serialize(
    data: Record<string, unknown>[],
    columns: ExportColumn[],
  ): Promise<string | Buffer> {
    switch (this.format) {
      case 'csv':
        return this.toCsv(data, columns);
      case 'xlsx':
        return this.toXlsx(data, columns);
      case 'json':
        return this.toJson(data);
      case 'yaml':
        return this.toYaml(data);
      case 'json-line':
        return this.toJsonLine(data);
      case 'markdown':
        return this.toMarkdown(data, columns);
    }
  }

  /** CSV（RFC 4180，UTF-8 带 BOM，便于 Excel 直接打开中文） */
  protected toCsv(data: Record<string, unknown>[], columns: ExportColumn[]): string {
    const head = columns.map((c) => csvEscape(c.header ?? c.key)).join(',');
    const rows = data.map((row) => columns.map((c) => csvEscape(row[c.key])).join(','));
    return '\uFEFF' + [head, ...rows].map((l) => l + '\r\n').join('');
  }

  /** XLSX（单 sheet，sheet 名 = slug(title) ≤31 字符） */
  protected async toXlsx(data: Record<string, unknown>[], columns: ExportColumn[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(ExcelSheetName(this.files.length + 1));
    ws.columns = columns.map((c) => ({ header: c.header ?? c.key, key: c.key }));
    for (const row of data) ws.addRow(row);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /** JSON（UTF-8，两空格缩进） */
  protected toJson(data: Record<string, unknown>[]): string {
    return JSON.stringify(data, null, 2) + '\n';
  }

  /** JSON Lines（每行一个 JSON 对象） */
  protected toJsonLine(data: Record<string, unknown>[]): string {
    return data.map((row) => JSON.stringify(row)).join('\n') + (data.length > 0 ? '\n' : '');
  }

  /** YAML（最小实现：数组 + 对象，支持嵌套；不安全标量自动加引号） */
  protected toYaml(data: unknown): string {
    return yamlValue(data, 0);
  }

  /** Markdown 表格（`|` 转义为 `\|`） */
  protected toMarkdown(data: Record<string, unknown>[], columns: ExportColumn[]): string {
    const head = `| ${columns.map((c) => mdEscape(c.header ?? c.key)).join(' | ')} |`;
    const sep = `| ${columns.map(() => '---').join(' | ')} |`;
    const rows = data.map((row) => `| ${columns.map((c) => mdEscape(row[c.key])).join(' | ')} |`);
    return [head, sep, ...rows].join('\n') + '\n';
  }
}

// ============ helpers ============

function columnsOf(data: Record<string, unknown>[]): ExportColumn[] {
  const keys = new Set<string>();
  for (const row of data.slice(0, 20)) for (const k of Object.keys(row ?? {})) keys.add(k);
  return [...keys].map((key) => ({ key }));
}

function slugify(title: string): string {
  const s = title
    .replace(/^\[导出\]\s*/, '')
    .replace(/[/\\:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'export';
}

function ExcelSheetName(n: number): string {
  return `Sheet${n}`;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function mdEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

// ---- YAML 最小序列化 ----

const YAML_PLAIN_SAFE = /^[\w.\-/ ][\w.\-/ ]*$/;

function yamlIsScalar(v: unknown): boolean {
  return v === null || v === undefined || typeof v !== 'object';
}

function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  const looksTyped = /^(null|true|false|~|\d+(\.\d+)?)$/i.test(s);
  if (s !== '' && !looksTyped && YAML_PLAIN_SAFE.test(s) && !s.includes(': ')) return s;
  return JSON.stringify(s);
}

function yamlValue(v: unknown, indent: number): string {
  const pad = '  '.repeat(indent);
  if (yamlIsScalar(v)) return `${pad}${yamlScalar(v)}\n`;
  if (Array.isArray(v)) {
    if (v.length === 0) return `${pad}[]\n`;
    return v.map((item) => yamlArrayItem(item, indent)).join('');
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return `${pad}{}\n`;
  return entries.map(([k, val]) => {
    if (yamlIsScalar(val)) return `${pad}${k}: ${yamlScalar(val)}\n`;
    return `${pad}${k}:\n` + yamlValue(val, indent + 1);
  }).join('');
}

function yamlArrayItem(item: unknown, indent: number): string {
  const pad = '  '.repeat(indent);
  if (yamlIsScalar(item)) return `${pad}- ${yamlScalar(item)}\n`;
  const entries = Object.entries(item as Record<string, unknown>);
  if (entries.length === 0) return `${pad}- {}\n`;
  const [firstKey, firstVal] = entries[0];
  let out = yamlIsScalar(firstVal)
    ? `${pad}- ${firstKey}: ${yamlScalar(firstVal)}\n`
    : `${pad}- ${firstKey}:\n` + yamlValue(firstVal, indent + 2);
  for (const [k, val] of entries.slice(1)) {
    out += yamlIsScalar(val)
      ? `${pad}  ${k}: ${yamlScalar(val)}\n`
      : `${pad}  ${k}:\n` + yamlValue(val, indent + 2);
  }
  return out;
}
