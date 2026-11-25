/**
 * 项目 BL-0058 / TK-0687：房间人气推荐设置 - 批量新增弹窗结构与模板下载/取消（用例 #23、#30、#31）
 * 用例来源：TK-0686 HANDOFF 九列用例；技术方案：/task/20261125/TK-0686/TECH_DESIGN（§4.3 批量弹窗定位、§5 断言映射）
 * 覆盖：#23 批量新增弹窗结构；#30 批量新增取消；#31 模板下载（文件名/四列表头/无数据行）
 * 数据隔离：本文件不产生数据变更（仅打开弹窗、下载模板、取消）。
 * 运行：TMPDIR=./.tmp-playwright ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-voice-room-popularity-bl58/tests/tc04-batch-structure.test.ts [--case=31]
 */
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { AdminBase } from './lib/admin-base.ts';

class BatchStructureTest extends AdminBase {
  constructor() {
    super('tc04-batch-structure', { 23: 3, 30: 2, 31: 3 });
  }

  private stateFile = '';

  protected async run(): Promise<void> {
    await this.act('登录 Admin 测试环境并保存会话', async () => {
      this.stateFile = join(this.stateDir, 'qa-ai.json');
      await this.ensureLoginState(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, this.stateFile);
    });
    try {
      if (this.wants(23)) await this.case23();
      if (this.wants(30)) await this.case30();
      if (this.wants(31)) await this.case31();
    } finally {
      await this.closeCasePage();
    }
  }

  // ---------------- #23 ----------------

  private async case23(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const dlg = await this.openBatchDialog(page);
    const title = (await dlg.locator('.el-dialog__title').innerText()).trim();
    const text = (await dlg.innerText()).replace(/\s+/g, ' ').trim();
    const buttons = (await dlg.locator('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await this.check('用例#23-① 弹窗标题为「批量新增人气房间」，含 Locale 选择与「选择文件」上传控件', async () => {
      const localeCount = await dlg.locator('.el-select:has(input[placeholder="请选择区域"])').count();
      const fileCount = await dlg.locator('input[type="file"]').count();
      const selectFile = await dlg.locator('button:has-text("选择文件")').count();
      await this.shot('case23-batch-dialog');
      const ok = title === '批量新增人气房间' && localeCount === 1 && fileCount === 1 && selectFile === 1;
      return { expect: '标题=批量新增人气房间；Locale 选择 1 个；文件上传控件 1 个；选择文件按钮 1 个', real: `标题=${title}；Locale=${localeCount}；file input=${fileCount}；选择文件=${selectFile}`, pass: ok };
    });
    await this.check('用例#23-② 说明文案包含模板列「ROOM ID、USER ID、推荐类型、权重」与「校验失败时整表不会写入」', async () => {
      const hasColumns = text.includes('模板列：ROOM ID、USER ID、推荐类型、权重');
      const hasAtomic = text.includes('校验失败时整表不会写入');
      return { expect: '含「模板列：ROOM ID、USER ID、推荐类型、权重」与「校验失败时整表不会写入」', real: `模板列说明=${hasColumns ? '含' : '不含'}；整表不写入说明=${hasAtomic ? '含' : '不含'}；原文片段=「${text.slice(0, 180)}」`, pass: hasColumns && hasAtomic };
    });
    await this.check('用例#23-③ 底部有 Confirm 与 Cancel 按钮', async () => {
      const hasConfirm = buttons.includes('Confirm');
      const hasCancel = buttons.includes('Cancel');
      return { expect: '含 Confirm 与 Cancel', real: `按钮=${buttons.join('、')}`, pass: hasConfirm && hasCancel };
    });
    await this.act('用例#23 点击 Cancel 关闭批量弹窗', async () => {
      await this.closeDialog(dlg, 'Cancel');
    });
    await this.closeCasePage();
  }

  // ---------------- #30 ----------------

  private async case30(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const totalBefore = await this.totalCount(page);
    const dlg = await this.openBatchDialog(page);
    await this.act('用例#30 批量弹窗选择越南区后点击 Cancel', async () => {
      await this.dialogSelect(page, dlg, '请选择区域', '越南区');
      await this.closeDialog(dlg, 'Cancel');
    });
    await this.check('用例#30-① 批量弹窗关闭', async () => {
      const visible = await dlg.isVisible().catch(() => false);
      await this.shot('case30-dialog-closed');
      return { expect: '弹窗不可见', real: visible ? '仍可见' : '已关闭', pass: !visible };
    });
    await this.check('用例#30-② 列表无新增，分页总数仍为 N', async () => {
      await this.search(page);
      const totalAfter = await this.totalCount(page);
      return { expect: `Total=${totalBefore}`, real: `Total=${totalAfter}`, pass: totalAfter === totalBefore };
    });
    await this.closeCasePage();
  }

  // ---------------- #31 ----------------

  private async case31(): Promise<void> {
    const page = await this.newCasePage(this.stateFile);
    const downloadPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    await this.act('用例#31 点击「下载模板」并保存文件', async () => {
      await page.getByRole('button', { name: '下载模板' }).first().click();
    });
    const download = await downloadPromise;
    const filename = download?.suggestedFilename() ?? '';
    let savePath = '';
    if (download) {
      savePath = join(this.evidenceDir, filename || 'template.xlsx');
      await download.saveAs(savePath);
    }
    await this.check('用例#31-① 触发浏览器下载，得到 voice_room_recommend_template.xlsx', async () => {
      await this.shot('case31-template-download');
      return { expect: '下载事件触发，文件名=voice_room_recommend_template.xlsx', real: download ? `文件名=${filename}` : '未触发下载', pass: Boolean(download) && filename === 'voice_room_recommend_template.xlsx' };
    });
    let headers: string[] = [];
    let rowCount = -1;
    let parseError = '';
    if (savePath) {
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(savePath);
        const ws = wb.worksheets[0];
        rowCount = ws.rowCount;
        headers = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? '').trim());
      } catch (e) {
        parseError = (e as Error).message;
      }
    }
    await this.check('用例#31-② 模板表头依次为 ROOM ID、USER ID、推荐类型、权重四列', async () => {
      const expected = ['ROOM ID', 'USER ID', '推荐类型', '权重'];
      const ok = headers.length === 4 && expected.every((h, i) => headers[i] === h || headers[i].startsWith(h));
      return { expect: '四列依次为 ROOM ID、USER ID、推荐类型、权重（PRD 模板允许列名带括号说明）', real: parseError ? `解析失败：${parseError}` : `共 ${headers.length} 列：${headers.join(' | ')}`, pass: ok };
    });
    await this.check('用例#31-③ 模板不含数据行', async () => {
      return { expect: '仅表头 1 行，无数据行', real: parseError ? `解析失败：${parseError}` : `rowCount=${rowCount}`, pass: rowCount === 1 };
    });
    await this.closeCasePage();
  }
}

const test = new BatchStructureTest();
await test.execute();
