/**
 * 项目 BL-0005 / TK-0443：房间推荐管理-批量导出
 * 用例来源：TK-0442 HANDOFF 九列用例 #44~#48；技术方案：TECH_DESIGN §5 断言映射、§6.6 Excel 断言口径
 * 覆盖：#44 导出成功与文件名；#45 导出列名；#46 导出数据与筛选结果一致；#47 空结果导出不报错（检查点②为观察项）；
 *       #48 空值 Excel 留空
 * 数据隔离：AC-1 写入 QA 自建房间真实实验KEY，执行后按房间批量删除
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** BL5_RUN_ID=… node projects/feature/lita-admin-voice-room-bl5/tests/tc07-rec-export.test.ts
 */
import ExcelJS from 'exceljs';
import { VoiceRoomBase, REC_COL } from './lib/voice-room-base.ts';

const EXPORT_HEADERS = ['大区', '推荐类型', '生效状态', '所属平台', '房间ID', '房间名称', 'Room Category', '房间状态', '权重', '推荐开始时间', '推荐结束时间', '操作人', '操作时间'];

/** 展示型映射（任务输入 §八.5 与接口文档 §9）：列表大区=印尼(in)/导出=locale 编码；列表短时/导出暂时。 */
function mapLocale(listValue: string): string {
  const m = listValue.match(/\(([a-z]+)\)$/);
  return m ? m[1] : listValue;
}
function mapType(listValue: string): string {
  return listValue === '短时' ? '暂时' : listValue;
}

async function parseXlsx(buffer: Buffer): Promise<{ headers: string[]; rows: string[][] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const headers: string[] = [];
  const headerRow = ws.getRow(1);
  for (let c = 1; c <= headerRow.cellCount; c++) headers.push(String(headerRow.getCell(c).value ?? '').trim());
  const rows: string[][] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const vals: string[] = [];
    for (let c = 1; c <= headers.length; c++) vals.push(String(row.getCell(c).value ?? '').trim());
    if (vals.some((v) => v !== '')) rows.push(vals);
  }
  return { headers, rows };
}

class RecExportTest extends VoiceRoomBase {
  constructor() { super('tc07-rec-export'); this.total = 13; }

  protected async run(): Promise<void> {
    await this.act('登录并准备 BD-1 与 AC-1 永久推荐记录', async () => {
      await this.login();
      this.shared.room1 = await this.ensureRoom1TagCategory();
      await this.recDeleteByRoomIds([this.shared.room1 as string]);
      await this.recEnsure({ roomId: this.shared.room1 as string, keyLabel: this.giftKey, type: '永久', weight: 10 });
    });
    const room1 = this.shared.room1 as string;

    // ---------------- 用例#44 ----------------
    await this.act('用例#44 按推荐类型=永久筛选后点击批量导出', async () => {
      await this.recSearch({ type: '永久' });
      this.shared.c44total = await this.totalCount(this.page!);
      const errorsBefore = await this.page!.locator('.el-message--error').count();
      const result = await this.recExport();
      this.shared.c44file = result.filename;
      this.shared.c44size = result.buffer.length;
      this.shared.c44parsed = await parseXlsx(result.buffer);
      this.shared.c44errors = errorsBefore;
      await this.shot('case44-export');
    });
    await this.check('用例#44-① 导出成功并下载 Excel（文件名 voice_room_config_recommend.xlsx），页面无报错', async () => {
      const file = this.shared.c44file as string;
      const size = Number(this.shared.c44size);
      const errors = await this.page!.locator('.el-message--error').count();
      return {
        expect: '文件名=voice_room_config_recommend.xlsx；无错误提示',
        real: `文件名=${file || '（无）'}；大小=${size} 字节；错误提示数=${errors}`,
        pass: file === 'voice_room_config_recommend.xlsx' && size > 0 && errors === 0
      };
    });
    await this.check('用例#44-② 导出文件可正常打开（可解析出工作表与数据）', async () => {
      const parsed = this.shared.c44parsed as { headers: string[]; rows: string[][] };
      return {
        expect: '可解析且数据行数>0',
        real: `表头列数=${parsed.headers.length}；数据行数=${parsed.rows.length}`,
        pass: parsed.headers.length === 13 && parsed.rows.length > 0
      };
    });

    // ---------------- 用例#45 ----------------
    await this.act('用例#45 导出全量数据并读取表头', async () => {
      await this.recSearch({});
      const result = await this.recExport();
      this.shared.c45parsed = await parseXlsx(result.buffer);
      await this.shot('case45-headers');
    });
    await this.check('用例#45-① Excel 表头依次为 13 列', async () => {
      const parsed = this.shared.c45parsed as { headers: string[] };
      const equal = parsed.headers.length === EXPORT_HEADERS.length && parsed.headers.every((h, i) => h === EXPORT_HEADERS[i]);
      return { expect: EXPORT_HEADERS.join('|'), real: parsed.headers.join('|'), pass: equal };
    });
    await this.check('用例#45-② 表头不含「用户分类」「操作」列，推荐时间拆为开始/结束两列', async () => {
      const parsed = this.shared.c45parsed as { headers: string[] };
      const illegal = parsed.headers.filter((h) => h === '用户分类' || h === '操作');
      const hasStart = parsed.headers.includes('推荐开始时间');
      const hasEnd = parsed.headers.includes('推荐结束时间');
      return {
        expect: '不含用户分类/操作；含推荐开始时间与推荐结束时间',
        real: `非法列=${illegal.join('、') || '无'}；开始列=${hasStart}；结束列=${hasEnd}`,
        pass: illegal.length === 0 && hasStart && hasEnd
      };
    });

    // ---------------- 用例#46 ----------------
    await this.act('用例#46 房间ID筛选 AC-1 后导出并比对列表行', async () => {
      await this.recSearch({ roomId: room1 });
      const rows = await this.recRows();
      this.shared.c46listTotal = await this.totalCount(this.page!);
      this.shared.c46listRow = rows.find((r) => r[REC_COL.roomId] === room1 && r[REC_COL.configKey].includes(this.giftKey)) ?? null;
      const result = await this.recExport();
      this.shared.c46parsed = await parseXlsx(result.buffer);
      await this.shot('case46-consistency');
    });
    await this.check('用例#46-① 导出 Excel 数据行数与列表筛选结果 Total 一致', async () => {
      const parsed = this.shared.c46parsed as { rows: string[][] };
      const total = Number(this.shared.c46listTotal);
      return { expect: `数据行数=${total}`, real: `数据行数=${parsed.rows.length}`, pass: parsed.rows.length === total };
    });
    await this.check('用例#46-② Excel 该房间行字段值与列表行显示值一致', async () => {
      const parsed = this.shared.c46parsed as { rows: string[][] };
      const list = this.shared.c46listRow as string[] | null;
      const excel = parsed.rows[0];
      if (!list || !excel) return { expect: '逐字段一致', real: `列表行=${list ? '有' : '无'}；Excel 行=${excel ? '有' : '无'}`, pass: false };
      const pairs: Array<[string, string, string]> = [
        ['大区', mapLocale(list[REC_COL.locale]), excel[0]],
        ['推荐类型', mapType(list[REC_COL.type]), excel[1]],
        ['生效状态', list[REC_COL.effective], excel[2]],
        ['所属平台', list[REC_COL.platform], excel[3]],
        ['房间ID', list[REC_COL.roomId], excel[4]],
        ['房间名称', list[REC_COL.roomName], excel[5]],
        ['Room Category', list[REC_COL.roomCategory], excel[6]],
        ['房间状态', list[REC_COL.roomStatus], excel[7]],
        ['权重', list[REC_COL.weight], excel[8]],
        ['操作人', list[REC_COL.operateName], excel[11]]
      ];
      const diff = pairs.filter(([, l, e]) => l !== e).map(([k, l, e]) => `${k}:列表=${l}/导出=${e}`);
      return {
        expect: '逐字段一致（大区按 locale 编码、推荐类型按 暂时/短时 展示映射）',
        real: diff.length === 0 ? '全部一致' : diff.join('；'),
        pass: diff.length === 0
      };
    });
    await this.check('用例#46-③ 推荐开始/结束时间与列表「推荐时间」列起止值一致', async () => {
      const parsed = this.shared.c46parsed as { rows: string[][] };
      const list = this.shared.c46listRow as string[] | null;
      const excel = parsed.rows[0];
      if (!list || !excel) return { expect: '起止时间一致', real: '缺少列表行或 Excel 行', pass: false };
      const parts = list[REC_COL.time].split('~').map((s) => s.trim());
      const listStart = parts[0] ?? '';
      const listEnd = parts[1] ?? '';
      const same = listStart === excel[9] && listEnd === excel[10];
      return {
        expect: `开始=${listStart}；结束=${listEnd}`,
        real: `导出开始=${excel[9] || '（空）'}；导出结束=${excel[10] || '（空）'}`,
        pass: same
      };
    });

    // ---------------- 用例#47 ----------------
    await this.act('用例#47 房间ID筛选不存在记录后点击批量导出', async () => {
      await this.recSearch({ roomId: '999999999999' });
      this.shared.c47total = await this.totalCount(this.page!);
      const dl = this.page!.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      const resp = this.page!.waitForResponse((r) => r.url().includes('exportVoiceRoomConfigRecommend'), { timeout: 15000 }).catch(() => null);
      await this.page!.getByRole('button', { name: '批量导出' }).first().click();
      const download = await dl;
      const response = await resp;
      let msg = '';
      try {
        msg = await this.messageText(this.page!);
      } catch { msg = ''; }
      this.shared.c47 = {
        total: this.shared.c47total,
        download: download ? download.suggestedFilename() : '',
        responseStatus: response ? response.status() : 0,
        message: msg,
        errors: await this.page!.locator('.el-message--error').count()
      };
      await this.shot('case47-empty-export');
    });
    await this.check('用例#47-① 导出操作不报错（页面无错误提示）', async () => {
      const info = this.shared.c47 as { errors: number; responseStatus: number; message: string };
      return {
        expect: '无错误提示',
        real: `错误提示数=${info.errors}；导出响应状态=${info.responseStatus || '无'}；页面提示=${info.message || '无'}`,
        pass: info.errors === 0
      };
    });
    await this.check('用例#47-② 导出行为观察（仅含表头文件或明确导出提示）', async () => {
      const info = this.shared.c47 as { download: string; message: string; responseStatus: number };
      const observed = info.download ? `下载文件=${info.download}` : info.message ? `页面提示=${info.message}` : `响应状态=${info.responseStatus}`;
      return {
        expect: '可观察到下载文件或明确提示',
        real: observed,
        pass: info.download !== '' || info.message !== '' || info.responseStatus > 0
      };
    });

    // ---------------- 用例#48 ----------------
    await this.act('用例#48 导出全量数据并检视历史空值行', async () => {
      await this.recSearch({});
      await this.recPageSize(50);
      const rows = await this.recRows();
      this.shared.c48listHistory = rows.find((r) => r[REC_COL.operateName] === '-' && r[REC_COL.operateTime] === '-') ?? null;
      this.shared.c48listAc1 = rows.find((r) => r[REC_COL.roomId] === room1 && r[REC_COL.configKey].includes(this.giftKey)) ?? null;
      const result = await this.recExport();
      this.shared.c48parsed = await parseXlsx(result.buffer);
      await this.shot('case48-empty-cells');
    });
    await this.check('用例#48-① 历史记录行 Room Category/操作人/操作时间单元格为空（不显示「-」）', async () => {
      const parsed = this.shared.c48parsed as { rows: string[][] };
      const listRow = this.shared.c48listHistory as string[] | null;
      if (!listRow) return { expect: '三个单元格为空', real: '未找到历史记录行', pass: false };
      const roomId = listRow[REC_COL.roomId];
      const excel = parsed.rows.find((r) => r[4] === roomId && r[11] === '');
      if (!excel) return { expect: '三个单元格为空', real: `未在导出中找到房间 ${roomId} 的历史行`, pass: false };
      const vals = [excel[6], excel[11], excel[12]];
      return { expect: '空 / 空 / 空', real: vals.map((v) => (v === '' ? '空' : v)).join(' / '), pass: vals.every((v) => v === '') };
    });
    await this.check('用例#48-② 自建记录行对应单元格显示实际值', async () => {
      const parsed = this.shared.c48parsed as { rows: string[][] };
      const listRow = this.shared.c48listAc1 as string[] | null;
      if (!listRow) return { expect: '三个单元格有实际值', real: '未找到 AC-1 列表行', pass: false };
      const excel = parsed.rows.find((r) => r[4] === room1);
      if (!excel) return { expect: '三个单元格有实际值', real: '未在导出中找到 AC-1 行', pass: false };
      const vals = [excel[6], excel[11], excel[12]];
      return { expect: 'Room Category/操作人/操作时间均非空', real: vals.join(' / '), pass: vals.every((v) => v !== '') };
    });

    // ---------------- 清理 ----------------
    this.addCleanup('清理 BD-1 自建推荐记录（页面批量删除）', async () => {
      await this.recDeleteByRoomIds([room1]);
    });
  }
}

await new RecExportTest().execute();
