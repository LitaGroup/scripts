/**
 * 项目139 / 审核-提现-查询：47 条用例中的 #21～#47（真实页面 + 页面导出文件解析 + 只读 DB 前置核对）
 *
 * 用例来源：TK-0083 HANDOFF 九列表格；技术方案：TK-0083 TECH_DESIGN §2/§3「提现查询-列表展示/数据一致性/导出/筛选/分页/批量入口」。
 * 覆盖：#21 新列位置；#22～#24 非空样本格式与资料值；#25 空值显示 -；#26 最近三个月导出；
 *       #27/#28 非空/空值样本导出；#29～#42 筛选与重置；#43/#44 分页；#45～#47 批量入口（不实际审核/打款）。
 * 数据隔离：提现数据全部只读；不修改提现记录或用户资料；仅删除下载的临时 xlsx。
 * 运行（仓库根目录，凭证运行时注入）：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** LITA_USER_TOKEN=*** \
 *   node projects/feature/lita-admin-139-batch-delete/tests/withdraw-become-player-time-47cases.test.ts
 */
import ExcelJS from 'exceljs';
import { AdminBase, cst, cstValue } from './lib/admin-base.ts';

const DATE_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const PAGE_TIME = /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/;

const EXPECTED_HEADERS_50 = [
  '申请时间', '大神昵称', '大神ID', '地区', '货币符号', '订单金币数', '订单金额', '礼物金额',
  '质量分奖励', '值班奖励', '拉新奖励', '新手大神奖励', '搬家入驻奖励', '陪玩师拉新奖励',
  '运营人工奖励', '其他', '被拒绝订单金额', '限额补发金额(即将废弃)', '超限额扣减金额',
  '低于限额自动返还金额', '人工返还金额', '恶意退款用户打赏撤回金额', '收入兑换为可消耗金币',
  '手续费', '实付当地货币数', '总计(含手续费)', '金币数', '原提现金额', '退款用户个数',
  '退款用户消费数量', '后台操作扣款数量', '后台操作扣款原因', '人工扣减次数', '状态',
  '姓名', '银行名称', '银行分行', '银行代号', '银行卡号', '邮箱', '银行账单截图',
  '身份 id 类型', '身份 id 值', '最新提现状态的更新时间', '成为陪玩师时间', '商户交易流水号',
  '已生成提现单最新时间', '首次打款中时间', '已打款最新时间', '支付方式',
];

const STATUS_LABELS: Record<string, string> = {
  '0': '已打款',
  '1': '待审核',
  '2': '已通过&待打款',
  '3': '已拒绝',
  '4': '打款中',
  '5': '渠道付款失败',
  '6': '交易作废',
  '7': '已过期',
  '8': '银行账户错误',
  '9': '已生成提现单',
};

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function normalizePageTime(text: string): string {
  const match = text.trim().match(PAGE_TIME);
  if (!match) return text.trim();
  return `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))} ${pad(Number(match[4]))}:${pad(Number(match[5]))}:${pad(Number(match[6]))}`;
}

function dedupeKeys(keys: string[]): string[] {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? key : `${key}#${count}`;
  });
}

function parseAmount(text: string): number {
  const number = Number(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

class WithdrawBecomePlayerTime47Cases extends AdminBase {
  constructor() {
    super('withdraw-become-player-time-47cases');
    this.total = 59;
  }

  private async withdrawApi(query: string): Promise<{ total: number; rows: any[] }> {
    const response = await this.api(`/api/withdraw?${query}${query.includes('source=') ? '' : '&source=1'}`);
    if (String(response.json?.status) !== '0') throw new Error(`/api/withdraw 失败: ${response.json?.msg}`);
    const data = response.json?.data ?? {};
    return { total: Number(data.total ?? 0), rows: data.data ?? [] };
  }

  private async openWithdraw(): Promise<void> {
    await this.open('/review/withdrawal', '.app-container');
    await this.waitRows(1);
  }

  private async search(): Promise<void> {
    const responsePromise = this.p.waitForResponse((response) => response.url().includes('/api/withdraw?') && response.request().method() === 'GET', { timeout: 30000 });
    await this.button('搜索').click();
    await responsePromise.catch(() => null);
    await this.waitListIdle();
  }

  private async reset(): Promise<void> {
    const responsePromise = this.p.waitForResponse((response) => response.url().includes('/api/withdraw?') && response.request().method() === 'GET', { timeout: 30000 });
    await this.button('重置筛选项').click();
    await responsePromise.catch(() => null);
    await this.waitListIdle();
  }

  private async mainRows(): Promise<string[][]> {
    return this.p.evaluate(() => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      const rows = Array.from(table.querySelectorAll('.el-table__body-wrapper tbody tr.el-table__row')) as HTMLElement[];
      return rows.map((row) => Array.from(row.children).map((td) => (td as HTMLElement).innerText.trim()));
    });
  }

  private async fixedRows(): Promise<string[][]> {
    return this.p.evaluate(() => {
      const table = document.querySelector('.app-container .el-table') as HTMLElement;
      const rows = Array.from(table.querySelectorAll('.el-table__fixed .el-table__fixed-body-wrapper tbody tr.el-table__row')) as HTMLElement[];
      return rows.map((row) => Array.from(row.children).map((td) => (td as HTMLElement).innerText.trim()));
    });
  }

  private async columnTexts(index: number, limit = 0): Promise<string[]> {
    const rows = await this.mainRows();
    const size = limit > 0 ? Math.min(limit, rows.length) : rows.length;
    return rows.slice(0, size).map((cells) => cells[index] ?? '');
  }

  private async rowKeyAt(index: number): Promise<string> {
    const main = await this.mainRows();
    const fixed = await this.fixedRows();
    const uid = ((fixed[index]?.[1] ?? '').match(/\d+/) ?? [''])[0];
    const userNo = ((fixed[index]?.[2] ?? '').match(/\((-?\d+)\)/) ?? ['', ''])[1];
    return `${uid}|${userNo}|${normalizePageTime(main[index]?.[34] ?? '')}`;
  }

  private async pageRowKeys(): Promise<string[]> {
    const main = await this.mainRows();
    const fixed = await this.fixedRows();
    const keys = main.map((cells, index) => {
      const uid = ((fixed[index]?.[1] ?? '').match(/\d+/) ?? [''])[0];
      const userNo = ((fixed[index]?.[2] ?? '').match(/\((-?\d+)\)/) ?? ['', ''])[1];
      return `${uid}|${userNo}|${normalizePageTime(cells[34] ?? '')}`;
    });
    return dedupeKeys(keys);
  }

  private async snapshotKeys(query: string): Promise<{ total: number; keys: string[] }> {
    let data: { total: number; rows: any[] };
    try {
      data = await this.withdrawApi(`${query}&page=1&rows=2000`);
    } catch (error) {
      this.log(`快照接口首次失败，重取一次: ${(error as Error).message}`);
      data = await this.withdrawApi(`${query}&page=1&rows=2000`);
    }
    const keys = data.rows.map((row: any) => `${row.userId}|${row.userNo}|${cst(row.createTime)}`);
    return { total: data.total, keys: dedupeKeys(keys) };
  }

  private async pageTotal(): Promise<number> {
    return this.p.evaluate(() => Number((document.querySelector('.app-container') as any).__vue__.listTotal ?? 0));
  }

  private async filterDisplay(placeholder: string): Promise<string> {
    const select = this.p.locator('.app-container .el-select').filter({ has: this.p.locator(`input[placeholder="${placeholder}"]`) }).first();
    const tags = await select.locator('.el-select__tags .el-tag').allInnerTexts();
    if (tags.length > 0) return tags.map((text) => text.trim()).join(',');
    return (await select.locator('input').first().inputValue()).trim();
  }

  /** 多选下拉有选中值后 placeholder 会消失，按搜索区下拉顺序读取显示值 */
  private async filterDisplayByIndex(index: number): Promise<string> {
    const select = this.p.locator('.app-container .el-select').nth(index);
    const tags = await select.locator('.el-select__tags .el-tag').allInnerTexts();
    if (tags.length > 0) return tags.map((text) => text.trim()).join(',');
    return (await select.locator('input').first().inputValue()).trim();
  }

  private async inputDisplay(placeholder: string): Promise<string> {
    const input = this.p.locator(`.app-container input[placeholder="${placeholder}"]`).first();
    return (await input.inputValue()).trim();
  }

  private async findRowIndexByUid(uid: string): Promise<number> {
    const fixed = await this.fixedRows();
    return fixed.findIndex((cells) => ((cells[1] ?? '').match(/\d+/) ?? [''])[0] === String(uid));
  }

  private async findRowIndexByKey(key: string): Promise<number> {
    const keys = await this.pageRowKeys();
    return keys.indexOf(key);
  }

  private async setDateRange(start: string, end: string): Promise<void> {
    const startInput = this.p.locator('.app-container input[placeholder="开始日期"]').first();
    const endInput = this.p.locator('.app-container input[placeholder="结束日期"]').first();
    await startInput.click();
    await startInput.fill(start);
    await startInput.press('Enter');
    await endInput.fill(end);
    await endInput.press('Enter');
    const range = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.valueRangeTime);
    if (!Array.isArray(range) || String(range[0]) !== start || String(range[1]) !== end) {
      throw new Error(`日期区间设置失败: ${JSON.stringify(range)}，期望 ${start}~${end}`);
    }
  }

  private async setRecentThreeMonths(): Promise<string[]> {
    await this.p.locator('.app-container input[placeholder="开始日期"]').first().click();
    const shortcut = this.p.locator('.el-picker-panel:visible .el-picker-panel__shortcut').filter({ hasText: '最近三个月' }).first();
    await shortcut.waitFor({ state: 'visible', timeout: 10000 });
    const responsePromise = this.p.waitForResponse((response) => response.url().includes('/api/withdraw?') && response.request().method() === 'GET', { timeout: 30000 });
    await shortcut.click();
    await responsePromise.catch(() => null);
    await this.waitListIdle();
    const range = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.valueRangeTime);
    if (!Array.isArray(range) || range.length !== 2) throw new Error(`最近三个月区间未设置: ${JSON.stringify(range)}`);
    return range.map(String);
  }

  private async parseExport(file: string): Promise<{ headers: string[]; rows: string[][]; sheetName: string }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error('导出文件没有工作表');
    const headers = ((sheet.getRow(1).values as any[]) ?? []).slice(1).map((value) => String(value ?? '').trim());
    const rows: string[][] = [];
    for (let i = 2; i <= sheet.actualRowCount; i++) {
      const values = ((sheet.getRow(i).values as any[]) ?? []).slice(1).map((value) => String(value ?? '').trim());
      if (values.some((value) => value !== '')) rows.push(values);
    }
    return { headers, rows, sheetName: sheet.name };
  }

  private async dbTimes(uids: (string | number)[]): Promise<Map<string, string>> {
    const rows = await this.dbQuery(`select id, become_player_time from user_profile where id in (${uids.map(String).join(',')})`);
    const map = new Map<string, string>();
    for (const row of rows) map.set(String(row.id), cstValue(row.become_player_time));
    return map;
  }

  private async chooseNonNullSamples(): Promise<Array<{ uid: string; userNo: string; createTime: number; expected: string }>> {
    const data = await this.withdrawApi('page=1&rows=2000');
    const candidates = data.rows.filter((row: any) => row.becomePlayerTime !== null && row.becomePlayerTime !== undefined && Number(row.becomePlayerTime) > 0);
    const unique: any[] = [];
    const uids = new Set<string>();
    for (const row of candidates) {
      const uid = String(row.userId);
      if (uids.has(uid)) continue;
      uids.add(uid);
      unique.push(row);
      if (unique.length >= 8) break;
    }
    const dbMap = await this.dbTimes(unique.map((row) => row.userId));
    const selected: Array<{ uid: string; userNo: string; createTime: number; expected: string }> = [];
    for (const row of unique) {
      const dbValue = dbMap.get(String(row.userId));
      if (!dbValue || dbValue === '-') continue;
      const apiValue = cst(row.becomePlayerTime);
      if (apiValue !== dbValue) continue;
      selected.push({
        uid: String(row.userId),
        userNo: String(row.userNo),
        createTime: Number(row.createTime),
        expected: dbValue,
      });
      if (selected.length >= 3) break;
    }
    return selected;
  }

  private async chooseNullSample(): Promise<{ uid: string; userNo: string; createTime: number } | null> {
    const data = await this.withdrawApi('page=1&rows=2000');
    const nullRows = data.rows.filter((row: any) => row.becomePlayerTime === null || row.becomePlayerTime === undefined || Number(row.becomePlayerTime) <= 0);
    for (const row of nullRows) {
      const dbValue = (await this.dbTimes([row.userId])).get(String(row.userId));
      if (dbValue === '-') return { uid: String(row.userId), userNo: String(row.userNo), createTime: Number(row.createTime) };
    }
    return null;
  }

  /** 导出定位要求 userNo+申请时间唯一，空值样本需选唯一键 */
  private async chooseUniqueNullSample(): Promise<{ uid: string; userNo: string; createTime: number } | null> {
    const data = await this.withdrawApi('page=1&rows=2000');
    const counts = new Map<string, number>();
    for (const row of data.rows) {
      const key = `${row.userNo}|${row.createTime}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const nullRows = data.rows.filter((row: any) => (row.becomePlayerTime === null || row.becomePlayerTime === undefined || Number(row.becomePlayerTime) <= 0) && counts.get(`${row.userNo}|${row.createTime}`) === 1);
    for (const row of nullRows) {
      const dbValue = (await this.dbTimes([row.userId])).get(String(row.userId));
      if (dbValue === '-') return { uid: String(row.userId), userNo: String(row.userNo), createTime: Number(row.createTime) };
    }
    return null;
  }

  async run(): Promise<void> {
    let samples: Array<{ uid: string; userNo: string; createTime: number; expected: string }> = [];
    let nullSample: { uid: string; userNo: string; createTime: number } | null = null;
    let nullUniqueSample: { uid: string; userNo: string; createTime: number } | null = null;
    try {
      await this.act('管理员真实登录并获取本次会话 token', async () => {
        await this.login();
      });

      // ==================== 用例#21 ====================
      let headers21: string[] = [];
      let becomeVisible21 = false;
      await this.act('用例#21 菜单进入审核-提现-查询并等待列表加载', async () => {
        await this.openWithdraw();
        headers21 = await this.headerTexts();
        becomeVisible21 = await this.p.locator('.app-container .el-table__header-wrapper').first().locator('th').nth(22).isVisible().catch(() => false);
        this.log(`用例21 表头数=${headers21.length};索引21=${headers21[21]};索引22=${headers21[22]}`);
        await this.shot('用例21-新列位置');
      });
      await this.check('用例#21-① 主表存在「成为陪玩师时间」列', async () => ({
        expect: '存在且可见',
        real: headers21.includes('成为陪玩师时间') ? `存在;可见=${becomeVisible21}` : '不存在',
        pass: headers21.includes('成为陪玩师时间') && becomeVisible21,
      }));
      await this.check('用例#21-② 主表原始表头索引 21 为「上次提现时间」、索引 22 为「成为陪玩师时间」', async () => ({
        expect: '21=上次提现时间;22=成为陪玩师时间',
        real: `21=${headers21[21] ?? '空'};22=${headers21[22] ?? '空'}`,
        pass: headers21[21] === '上次提现时间' && headers21[22] === '成为陪玩师时间',
      }));

      // 样本前置：3 个非空 + 1 个空值（只读）
      await this.act('用例#22～#25 前置：只读选取 3 个非空样本与 1 个空值样本并核对 user_profile', async () => {
        samples = await this.chooseNonNullSamples();
        nullSample = await this.chooseNullSample();
        nullUniqueSample = await this.chooseUniqueNullSample();
        this.log(`非空样本=${JSON.stringify(samples)};空值样本=${JSON.stringify(nullSample)};唯一空值导出样本=${JSON.stringify(nullUniqueSample)}`);
        if (samples.length < 3) throw new Error(`阻塞：可用非空样本不足 3 个（实际 ${samples.length}）`);
        if (!nullSample) throw new Error('阻塞：未找到 user_profile.become_player_time 为空的现有提现样本');
        if (!nullUniqueSample) throw new Error('阻塞：未找到 user+申请时间可唯一定位的空值提现样本');
      });

      // ==================== 用例#22～#24 ====================
      const sampleCases = [
        { no: 22, index: 0 },
        { no: 23, index: 1 },
        { no: 24, index: 2 },
      ];
      for (const sampleCase of sampleCases) {
        const sample = samples[sampleCase.index];
        let formatViolations = -1;
        let displayed = '';
        let rowVisible = false;
        await this.act(`用例#${sampleCase.no} 按陪玩师ID=${sample?.uid ?? 'N/A'} 查询并读取目标行`, async () => {
          if (!sample) throw new Error('阻塞：非空样本不足');
          await this.openWithdraw();
          await this.fillByPlaceholder('陪玩师ID', sample.uid);
          await this.search();
          const rowIndex = await this.findRowIndexByUid(sample.uid);
          if (rowIndex < 0) throw new Error(`查询结果中未找到 uid=${sample.uid}`);
          const rows = await this.mainRows();
          displayed = rows[rowIndex]?.[22] ?? '';
          formatViolations = DATE_TIME.test(displayed) ? 0 : 1;
          rowVisible = rowIndex >= 0;
          await this.shot(`用例${sampleCase.no}-目标行`);
        });
        await this.check(`用例#${sampleCase.no}-① 目标行「成为陪玩师时间」符合 yyyy-MM-dd HH:mm:ss 格式`, async () => ({
          expect: '0 个违规',
          real: `violations=${formatViolations};value=${displayed}`,
          pass: formatViolations === 0,
        }));
        await this.check(`用例#${sampleCase.no}-② 目标行显示值等于前置记录值`, async () => ({
          expect: sample?.expected ?? 'N/A',
          real: `${displayed};visible=${rowVisible}`,
          pass: rowVisible && displayed === (sample?.expected ?? ''),
        }));
      }

      // ==================== 用例#25 ====================
      let nullVisible25 = false;
      let nullCell25 = '';
      await this.act(`用例#25 按陪玩师ID=${nullSample?.uid ?? 'N/A'} 查询空值样本并读取单元格`, async () => {
        if (!nullSample) throw new Error('阻塞：未找到空值样本');
        await this.openWithdraw();
        await this.fillByPlaceholder('陪玩师ID', nullSample.uid);
        await this.search();
        const rowIndex = await this.findRowIndexByUid(nullSample.uid);
        if (rowIndex < 0) throw new Error(`查询结果中未找到 uid=${nullSample.uid}`);
        const rows = await this.mainRows();
        nullCell25 = rows[rowIndex]?.[22] ?? '';
        nullVisible25 = rowIndex >= 0;
        await this.shot('用例25-空值样本');
      });
      await this.check('用例#25-① 目标提现记录可见', async () => ({
        expect: 'true',
        real: String(nullVisible25),
        pass: nullVisible25 === true,
      }));
      await this.check('用例#25-② 目标行「成为陪玩师时间」单元格仅显示 -', async () => ({
        expect: '-',
        real: JSON.stringify(nullCell25),
        pass: nullCell25 === '-',
      }));

      // ==================== 用例#26 ====================
      let range26: string[] = [];
      let export26: { headers: string[]; rows: string[][]; sheetName: string } = { headers: [], rows: [], sheetName: '' };
      let representative: string[] = [];
      let apiRow26: any = null;
      await this.act('用例#26 选择「最近三个月」并点击导出结果下载 xlsx', async () => {
        await this.openWithdraw();
        range26 = await this.setRecentThreeMonths();
        const file = await this.downloadViaButton('导出结果');
        export26 = await this.parseExport(file);
        this.log(`用例26 range=${range26.join('~')};headers=${export26.headers.length};rows=${export26.rows.length}`);
        const data26 = await this.withdrawApi(`startDate=${range26[0]}&endDate=${range26[1]}&page=1&rows=2000`);
        for (const row of export26.rows) {
          const userNo = row[2] ?? '';
          const createTime = row[0] ?? '';
          const hit = data26.rows.find((item: any) => String(item.userNo) === userNo && cst(item.createTime) === createTime);
          if (hit) {
            representative = row;
            apiRow26 = hit;
            break;
          }
        }
        await this.shot('用例26-导出文件');
      });
      await this.check('用例#26-① 首个工作表表头共 50 列', async () => ({
        expect: '50',
        real: String(export26.headers.length),
        pass: export26.headers.length === 50,
      }));
      await this.check('用例#26-② 0 基索引 43 为「最新提现状态的更新时间」、44 为「成为陪玩师时间」、45 为「商户交易流水号」', async () => ({
        expect: '43=最新提现状态的更新时间;44=成为陪玩师时间;45=商户交易流水号',
        real: `43=${export26.headers[43] ?? '空'};44=${export26.headers[44] ?? '空'};45=${export26.headers[45] ?? '空'}`,
        pass: export26.headers[43] === '最新提现状态的更新时间' && export26.headers[44] === '成为陪玩师时间' && export26.headers[45] === '商户交易流水号',
      }));
      const baseline49 = EXPECTED_HEADERS_50.filter((header) => header !== '成为陪玩师时间');
      const actual49 = export26.headers.filter((_, index) => index !== 44);
      await this.check('用例#26-③ 剔除索引 44 新列后，其余 49 列名称与顺序等于既有基线', async () => ({
        expect: baseline49.join('|'),
        real: actual49.join('|'),
        pass: actual49.length === baseline49.length && actual49.every((header, index) => header === baseline49[index]),
      }));
      await this.check('用例#26-④ 代表行申请时间、大神ID、状态、支付方式与前置样本快照一致', async () => ({
        expect: apiRow26 ? `${cst(apiRow26.createTime)}|${apiRow26.userNo}|${STATUS_LABELS[String(apiRow26.status)] ?? apiRow26.status}|${apiRow26.payMode}` : 'N/A',
        real: representative.length ? `${representative[0]}|${representative[2]}|${representative[33]}|${representative[49]}` : '未匹配到代表行',
        pass: Boolean(apiRow26)
          && representative[0] === cst(apiRow26?.createTime)
          && representative[2] === String(apiRow26?.userNo)
          && representative[33] === (STATUS_LABELS[String(apiRow26?.status)] ?? String(apiRow26?.status))
          && representative[49] === String(apiRow26?.payMode),
      }));

      // ==================== 用例#27 ====================
      const nonNullExportSample = samples[0];
      let range27: string[] = [];
      let export27: { headers: string[]; rows: string[][] } = { headers: [], rows: [] };
      let matched27: string[][] = [];
      await this.act(`用例#27 按 uid=${nonNullExportSample?.uid ?? 'N/A'} 与申请日导出非空样本`, async () => {
        if (!nonNullExportSample) throw new Error('阻塞：非空样本不足');
        const date = cst(nonNullExportSample.createTime).slice(0, 10);
        range27 = [date, date];
        await this.openWithdraw();
        await this.fillByPlaceholder('陪玩师ID', nonNullExportSample.uid);
        await this.setDateRange(date, date);
        await this.search();
        const file = await this.downloadViaButton('导出结果');
        export27 = await this.parseExport(file);
        matched27 = export27.rows.filter((row) => row[2] === nonNullExportSample.userNo && row[0] === cst(nonNullExportSample.createTime));
        this.log(`用例27 uid=${nonNullExportSample.uid} range=${date} rows=${export27.rows.length} matched=${matched27.length}`);
        await this.shot('用例27-导出文件');
      });
      await this.check('用例#27-① 按 uid 与申请时间可匹配 1 条导出行', async () => ({
        expect: '1',
        real: String(matched27.length),
        pass: matched27.length === 1,
      }));
      await this.check('用例#27-② 匹配行「成为陪玩师时间」精确等于前置记录值', async () => ({
        expect: nonNullExportSample?.expected ?? 'N/A',
        real: matched27[0]?.[44] ?? '未匹配',
        pass: matched27.length === 1 && matched27[0][44] === (nonNullExportSample?.expected ?? ''),
      }));
      await this.check('用例#27-③ 匹配行时间单元格不符合 yyyy-MM-dd HH:mm:ss 的数量为 0', async () => ({
        expect: '0',
        real: String(matched27.filter((row) => !DATE_TIME.test(row[44] ?? '')).length),
        pass: matched27.length === 1 && matched27.every((row) => DATE_TIME.test(row[44] ?? '')),
      }));

      // ==================== 用例#28 ====================
      let export28: { headers: string[]; rows: string[][] } = { headers: [], rows: [] };
      let matched28: string[][] = [];
      let nullDate28 = '';
      await this.act(`用例#28 按 uid=${nullUniqueSample?.uid ?? 'N/A'} 与申请日导出空值样本`, async () => {
        if (!nullUniqueSample) throw new Error('阻塞：未找到唯一空值样本');
        nullDate28 = cst(nullUniqueSample.createTime).slice(0, 10);
        await this.openWithdraw();
        await this.fillByPlaceholder('陪玩师ID', nullUniqueSample.uid);
        await this.setDateRange(nullDate28, nullDate28);
        await this.search();
        const file = await this.downloadViaButton('导出结果');
        export28 = await this.parseExport(file);
        matched28 = export28.rows.filter((row) => row[2] === nullUniqueSample.userNo && row[0] === cst(nullUniqueSample.createTime));
        this.log(`用例28 uid=${nullUniqueSample.uid} range=${nullDate28} rows=${export28.rows.length} matched=${matched28.length}`);
        await this.shot('用例28-导出文件');
      });
      await this.check('用例#28-① 按 uid 与申请时间可匹配 1 条导出行', async () => ({
        expect: '1',
        real: String(matched28.length),
        pass: matched28.length === 1,
      }));
      await this.check('用例#28-② 首个工作表存在「成为陪玩师时间」列表头', async () => ({
        expect: '存在',
        real: export28.headers.includes('成为陪玩师时间') ? '存在' : '不存在',
        pass: export28.headers.includes('成为陪玩师时间') && export28.headers[44] === '成为陪玩师时间',
      }));
      await this.check('用例#28-③ 目标空值样本的「成为陪玩师时间」单元格为空白，不显示 -', async () => ({
        expect: '空白',
        real: matched28.length === 1 ? JSON.stringify(matched28[0][44] ?? '') : '未匹配',
        pass: matched28.length === 1 && (matched28[0][44] ?? '') === '',
      }));

      // ==================== 用例#29 ====================
      let statuses29: string[] = [];
      let header29 = false;
      await this.act('用例#29 选择状态「待审核」并搜索', async () => {
        await this.openWithdraw();
        await this.selectByPlaceholder('状态', '待审核');
        await this.search();
        statuses29 = await this.columnTexts(33);
        header29 = (await this.headerTexts())[22] === '成为陪玩师时间';
        await this.shot('用例29-待审核筛选');
      });
      await this.check('用例#29-① 列表至少 1 行且每行「状态」均为待审核', async () => ({
        expect: '≥1 行;全部=待审核',
        real: `rows=${statuses29.length};distinct=${[...new Set(statuses29)].join(',')}`,
        pass: statuses29.length >= 1 && statuses29.every((status) => status === '待审核'),
      }));
      await this.check('用例#29-② 新列「成为陪玩师时间」表头仍可见', async () => ({
        expect: 'true',
        real: String(header29),
        pass: header29 === true,
      }));

      // ==================== 用例#30 ====================
      let sampleNo30 = '';
      let noViolations30 = -1;
      let targetVisible30 = false;
      await this.act('用例#30 选择现有样本的陪玩师No并筛选', async () => {
        const snapshot = await this.withdrawApi('page=1&rows=30');
        sampleNo30 = String(snapshot.rows[0]?.userNo ?? '');
        if (!sampleNo30) throw new Error('阻塞：未找到可用陪玩师No样本');
        await this.openWithdraw();
        await this.fillByPlaceholder('陪玩师No', sampleNo30);
        await this.search();
        const fixed = await this.fixedRows();
        noViolations30 = fixed.filter((cells) => !(cells[2] ?? '').includes(sampleNo30)).length;
        targetVisible30 = fixed.some((cells) => (cells[2] ?? '').includes(sampleNo30));
        await this.shot('用例30-陪玩师No筛选');
      });
      await this.check('用例#30-① 列表至少 1 行且每行「昵称/No」均包含所选陪玩师No', async () => ({
        expect: `≥1 行;违规=0;No=${sampleNo30}`,
        real: `rows=${(await this.fixedRows()).length};violations=${noViolations30}`,
        pass: (await this.fixedRows()).length >= 1 && noViolations30 === 0,
      }));
      await this.check('用例#30-② 目标样本记录可见', async () => ({
        expect: 'true',
        real: String(targetVisible30),
        pass: targetVisible30 === true,
      }));

      // ==================== 用例#31 ====================
      let timeStart31 = '';
      let timeEnd31 = '';
      let rangeViolations31 = -1;
      let targetVisible31 = false;
      let sampleUid31 = '';
      await this.act('用例#31 选择样本申请日设置起止日期并搜索', async () => {
        const snapshot = await this.withdrawApi('page=1&rows=30');
        const sample = snapshot.rows[0];
        if (!sample) throw new Error('阻塞：未找到时间筛选样本');
        const date = cst(sample.createTime).slice(0, 10);
        timeStart31 = date;
        timeEnd31 = date;
        sampleUid31 = String(sample.userId);
        await this.openWithdraw();
        await this.setDateRange(timeStart31, timeEnd31);
        await this.search();
        const rows = await this.mainRows();
        const fixed = await this.fixedRows();
        rangeViolations31 = rows.filter((cells) => {
          const normalized = normalizePageTime(cells[34] ?? '');
          return normalized < `${timeStart31} 00:00:00` || normalized > `${timeEnd31} 23:59:59`;
        }).length;
        targetVisible31 = fixed.some((cells) => ((cells[1] ?? '').match(/\d+/) ?? [''])[0] === sampleUid31);
        await this.shot('用例31-日期范围筛选');
      });
      await this.check('用例#31-① 列表至少 1 行且每行「申请提交时间」均在起止日期范围内', async () => ({
        expect: `≥1 行;范围外=0;${timeStart31}~${timeEnd31}`,
        real: `rows=${(await this.mainRows()).length};outOfRange=${rangeViolations31}`,
        pass: (await this.mainRows()).length >= 1 && rangeViolations31 === 0,
      }));
      await this.check('用例#31-② 目标样本记录可见', async () => ({
        expect: 'true',
        real: String(targetVisible31),
        pass: targetVisible31 === true,
      }));

      // ==================== 用例#32/33/40/41（行键集合比对） ====================
      const keyCases = [
        { no: 32, index: 1, placeholder: '请选择大区', option: '印尼语区', query: 'locales=in&countryIsoCodes=' },
        { no: 33, index: 2, placeholder: '请选择国家', option: '印尼', query: 'countryIsoCodes=ID&locales=' },
        { no: 40, index: 8, placeholder: '是否有Cinta收入', option: '否', query: 'cintaAmount=false&locales=&countryIsoCodes=' },
      ];
      for (const keyCase of keyCases) {
        let expectedTotal = -1;
        let actualTotal = -1;
        let expectedKeys: string[] = [];
        let actualKeys: string[] = [];
        let filterValue = '';
        let targetVisible = false;
        await this.act(`用例#${keyCase.no} 选择「${keyCase.option}」并切换 2000/page`, async () => {
          await this.openWithdraw();
          await this.selectByPlaceholder(keyCase.placeholder, keyCase.option);
          await this.search();
          await this.changePageSize(2000);
          await this.waitRows(1);
          actualTotal = await this.pageTotal();
          actualKeys = await this.pageRowKeys();
          filterValue = await this.filterDisplayByIndex(keyCase.index);
          const snapshot = await this.snapshotKeys(keyCase.query);
          expectedTotal = snapshot.total;
          expectedKeys = snapshot.keys;
          if (actualTotal !== expectedTotal || JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
            const retry = await this.snapshotKeys(keyCase.query);
            expectedTotal = retry.total;
            expectedKeys = retry.keys;
          }
          targetVisible = expectedKeys.length > 0 && actualKeys.includes(expectedKeys[0]);
          this.log(`用例${keyCase.no} total=${actualTotal}/${expectedTotal};keys=${actualKeys.length}/${expectedKeys.length};filter=${filterValue}`);
          await this.shot(`用例${keyCase.no}-行键比对`);
        });
        await this.check(`用例#${keyCase.no}-① 当前页行键有序集合等于同条件预期，分页总数等于预期`, async () => ({
          expect: `total=${expectedTotal};keys=${expectedKeys.length}`,
          real: `total=${actualTotal};keys=${actualKeys.length};equal=${JSON.stringify(actualKeys) === JSON.stringify(expectedKeys)}`,
          pass: actualTotal === expectedTotal && actualKeys.length === expectedKeys.length && JSON.stringify(actualKeys) === JSON.stringify(expectedKeys),
        }));
        await this.check(`用例#${keyCase.no}-② 筛选框保持所选值且目标样本可见`, async () => ({
          expect: `filter=${keyCase.option};target=true`,
          real: `filter=${filterValue};target=${targetVisible}`,
          pass: filterValue === keyCase.option && targetVisible,
        }));
      }

      // 用例#41 组合筛选
      let comboStatus = '';
      let comboLocale = '';
      let comboCountry = '';
      let comboPayment = '';
      let comboExpectedTotal = -1;
      let comboActualTotal = -1;
      let comboExpectedKeys: string[] = [];
      let comboActualKeys: string[] = [];
      let comboFilters: string[] = [];
      let comboTargetVisible = false;
      await this.act('用例#41 设置状态/大区/国家/支付方式四条件组合并切换 2000/page', async () => {
        comboStatus = '待审核';
        comboLocale = '印尼语区';
        comboCountry = '印尼';
        comboPayment = 'Xendit';
        await this.openWithdraw();
        await this.selectByPlaceholder('状态', comboStatus);
        await this.selectByPlaceholder('请选择大区', comboLocale);
        await this.selectByPlaceholder('请选择国家', comboCountry);
        await this.selectByPlaceholder('转账方式', comboPayment);
        await this.search();
        await this.changePageSize(2000);
        await this.waitRows(1);
        comboActualTotal = await this.pageTotal();
        comboActualKeys = await this.pageRowKeys();
        comboFilters = [
          await this.filterDisplayByIndex(0),
          await this.filterDisplayByIndex(1),
          await this.filterDisplayByIndex(2),
          await this.filterDisplayByIndex(3),
        ];
        const snapshot = await this.snapshotKeys('status=1&locales=in&countryIsoCodes=ID&payMode=xendit');
        comboExpectedTotal = snapshot.total;
        comboExpectedKeys = snapshot.keys;
        if (comboActualTotal !== comboExpectedTotal || JSON.stringify(comboActualKeys) !== JSON.stringify(comboExpectedKeys)) {
          const retry = await this.snapshotKeys('status=1&locales=in&countryIsoCodes=ID&payMode=xendit');
          comboExpectedTotal = retry.total;
          comboExpectedKeys = retry.keys;
        }
        comboTargetVisible = comboExpectedKeys.length > 0 && comboActualKeys.includes(comboExpectedKeys[0]);
        this.log(`用例41 total=${comboActualTotal}/${comboExpectedTotal};keys=${comboActualKeys.length}/${comboExpectedKeys.length};filters=${comboFilters.join(',')}`);
        await this.shot('用例41-组合筛选');
      });
      await this.check('用例#41-① 当前页行键有序集合等于同条件预期集合，分页总数等于预期', async () => ({
        expect: `total=${comboExpectedTotal};keys=${comboExpectedKeys.length}`,
        real: `total=${comboActualTotal};keys=${comboActualKeys.length};equal=${JSON.stringify(comboActualKeys) === JSON.stringify(comboExpectedKeys)}`,
        pass: comboActualTotal === comboExpectedTotal && comboActualKeys.length === comboExpectedKeys.length && JSON.stringify(comboActualKeys) === JSON.stringify(comboExpectedKeys),
      }));
      await this.check('用例#41-② 目标组合样本可见，四个筛选框保持前置所选值', async () => ({
        expect: `${comboStatus}|${comboLocale}|${comboCountry}|${comboPayment};target=true`,
        real: `${comboFilters.join('|')};target=${comboTargetVisible}`,
        pass: comboFilters[0] === comboStatus && comboFilters[1] === comboLocale && comboFilters[2] === comboCountry && comboFilters[3] === comboPayment && comboTargetVisible,
      }));

      // ==================== 用例#34～#39 单条件筛选 ====================
      const filterCases = [
        { no: 34, placeholder: '转账方式', option: 'Payloco', check: async () => (await this.fixedRows()).every((cells) => (cells[6] ?? '').toLowerCase() === 'payloco'), expect: '每行支付方式=payloco' },
        { no: 35, placeholder: '折扣单数>=N', input: '1', check: async () => (await this.columnTexts(17)).every((text) => Number(text.replace(/[^\d.-]/g, '')) >= 1), expect: '每行折扣订单数>=1' },
        { no: 36, placeholder: '欠款记录', option: '有欠款', check: async () => (await this.columnTexts(18)).every((text) => parseAmount(text) !== 0), expect: '每行待处理欠款金额记录非0' },
        { no: 37, placeholder: '银行账户风险', option: '有风险，收款信息不匹配', check: async () => (await this.columnTexts(12)).every((text) => text.includes('有风险，收款信息不匹配')), expect: '每行银行账户风险包含有风险，收款信息不匹配' },
        { no: 38, placeholder: '风险类型', option: '洗钱审核中', check: async () => (await this.columnTexts(13)).every((text) => text.includes('洗钱审核中')), expect: '每行风险类型包含洗钱审核中' },
        { no: 39, placeholder: '是否是Cinta陪陪', option: '否', check: async () => (await this.fixedRows()).every((cells) => (cells[3] ?? '') === '不是'), expect: '每行是否是Cinta陪陪=不是' },
      ] as Array<{ no: number; placeholder: string; option?: string; input?: string; check: () => Promise<boolean>; expect: string }>;
      for (const filterCase of filterCases) {
        let rowsCount = 0;
        let violates = false;
        let display = '';
        await this.act(`用例#${filterCase.no} 设置筛选「${filterCase.option ?? filterCase.input}」并搜索`, async () => {
          await this.openWithdraw();
          if (filterCase.option) await this.selectByPlaceholder(filterCase.placeholder, filterCase.option);
          else await this.fillByPlaceholder(filterCase.placeholder, filterCase.input ?? '');
          await this.search();
          rowsCount = (await this.mainRows()).length;
          violates = !(await filterCase.check());
          display = filterCase.input ? await this.inputDisplay(filterCase.placeholder) : await this.filterDisplay(filterCase.placeholder);
          await this.shot(`用例${filterCase.no}-筛选`);
        });
        await this.check(`用例#${filterCase.no}-① 列表至少 1 行且${filterCase.expect}`, async () => ({
          expect: `≥1 行;${filterCase.expect}`,
          real: `rows=${rowsCount};violates=${violates}`,
          pass: rowsCount >= 1 && violates === false,
        }));
        await this.check(`用例#${filterCase.no}-② 筛选框保持所选值`, async () => ({
          expect: filterCase.option ?? filterCase.input ?? '',
          real: display,
          pass: display === (filterCase.option ?? filterCase.input ?? ''),
        }));
      }

      // ==================== 用例#42 ====================
      let defaultSnapshot42: Record<string, string> = {};
      let afterReset42: Record<string, string> = {};
      let defaultTotal42 = -1;
      let afterTotal42 = -1;
      await this.act('用例#42 记录默认筛选快照，设置状态与陪玩师ID后重置', async () => {
        await this.openWithdraw();
        const snapshot = () => this.p.evaluate(() => {
          const vm = (document.querySelector('.app-container') as any).__vue__;
          const clean = (value: any) => (value === null || value === undefined ? '' : Array.isArray(value) ? JSON.stringify(value) : String(value));
          return {
            status: clean(vm.valueState),
            locale: clean(vm.valueLocal),
            country: clean(vm.valueCountry),
            payment: clean(vm.valueMethod),
            debt: clean(vm.valueDeductionLog),
            bank: clean(vm.valueAccountVerifyStatus),
            risk: clean(vm.valueRiskType),
            cinta: clean(vm.valueFriendPlayer),
            income: clean(vm.valueCintaAmount),
            uid: clean(vm.valueUserId),
            userNo: clean(vm.valueUserNo),
            discount: clean(vm.valueDiscountOrderCount),
            range: clean(vm.valueRangeTime),
            total: String(vm.listTotal),
          };
        });
        const before = await snapshot();
        defaultSnapshot42 = Object.fromEntries(Object.entries(before).filter(([key]) => key !== 'total'));
        defaultTotal42 = Number(before.total);
        await this.selectByPlaceholder('状态', '待审核');
        await this.fillByPlaceholder('陪玩师ID', String(samples[0]?.uid ?? '16505'));
        await this.reset();
        const after = await snapshot();
        afterReset42 = Object.fromEntries(Object.entries(after).filter(([key]) => key !== 'total'));
        afterTotal42 = Number(after.total);
        this.log(`用例42 default=${JSON.stringify(defaultSnapshot42)};after=${JSON.stringify(afterReset42)};total=${defaultTotal42}->${afterTotal42}`);
        await this.shot('用例42-重置后');
      });
      await this.check('用例#42-① 全部筛选控件恢复为前置记录的默认快照', async () => ({
        expect: JSON.stringify(defaultSnapshot42),
        real: JSON.stringify(afterReset42),
        pass: JSON.stringify(defaultSnapshot42) === JSON.stringify(afterReset42),
      }));
      await this.check('用例#42-② 列表总数恢复为前置记录的默认总数', async () => ({
        expect: String(defaultTotal42),
        real: String(afterTotal42),
        pass: afterTotal42 === defaultTotal42,
      }));

      // ==================== 用例#43 ====================
      let page1Key43 = '';
      let total43 = -1;
      let size43 = -1;
      let filtersBefore43 = '';
      let page2State43 = { page: 0, size: 0, firstKey: '', filters: '' };
      let back43 = { page: 0, total: 0 };
      await this.act('用例#43 记录第 1 页首行与筛选，翻到第 2 页再返回', async () => {
        await this.openWithdraw();
        total43 = (await this.paginationState()).total;
        size43 = (await this.paginationState()).size;
        page1Key43 = await this.rowKeyAt(0);
        filtersBefore43 = [await this.filterDisplay('状态'), await this.filterDisplay('请选择大区'), await this.filterDisplay('请选择国家')].join('|');
        await this.p.locator('.el-pagination .btn-next').click();
        await this.waitPageActive(2);
        await this.waitRows(1);
        page2State43 = {
          page: (await this.paginationState()).page,
          size: (await this.paginationState()).size,
          firstKey: await this.rowKeyAt(0),
          filters: [await this.filterDisplay('状态'), await this.filterDisplay('请选择大区'), await this.filterDisplay('请选择国家')].join('|'),
        };
        await this.shot('用例43-第2页');
        await this.p.locator('.el-pagination .btn-prev').click();
        await this.waitPageActive(1);
        await this.waitRows(1);
        back43 = { page: (await this.paginationState()).page, total: (await this.paginationState()).total };
        await this.shot('用例43-返回第1页');
      });
      await this.check('用例#43-① 第 2 页为高亮页，首行行键不同于第 1 页，筛选与每页条数保持不变', async () => ({
        expect: `page=2;size=${size43};firstKey!=${page1Key43};filters=${filtersBefore43}`,
        real: `page=${page2State43.page};size=${page2State43.size};firstKey=${page2State43.firstKey};filters=${page2State43.filters}`,
        pass: page2State43.page === 2 && page2State43.size === size43 && page2State43.firstKey !== '' && page2State43.firstKey !== page1Key43 && page2State43.filters === filtersBefore43,
      }));
      await this.check('用例#43-② 返回后第 1 页为高亮页，总数仍为原总数', async () => ({
        expect: `page=1;total=${total43}`,
        real: `page=${back43.page};total=${back43.total}`,
        pass: back43.page === 1 && back43.total === total43,
      }));

      // ==================== 用例#44 ====================
      let total44 = -1;
      let sizeText44 = '';
      let rows44 = -1;
      let header44 = false;
      await this.act('用例#44 记录默认总数后选择每页 10 条', async () => {
        await this.openWithdraw();
        total44 = (await this.paginationState()).total;
        if (total44 <= 10) throw new Error(`阻塞：默认总数 ${total44} 不大于 10`);
        await this.changePageSize(10);
        sizeText44 = (await this.p.locator('.el-pagination .el-pagination__sizes input').first().inputValue()).trim();
        rows44 = (await this.mainRows()).length;
        header44 = (await this.headerTexts())[22] === '成为陪玩师时间';
        await this.shot('用例44-每页10条');
      });
      await this.check('用例#44-① 每页条数显示 10/page', async () => ({
        expect: '10/page',
        real: sizeText44,
        pass: sizeText44.includes('10'),
      }));
      await this.check('用例#44-② 当前页数据不超过 10 行且分页总数仍为原总数', async () => ({
        expect: `rows<=10;total=${total44}`,
        real: `rows=${rows44};total=${(await this.paginationState()).total}`,
        pass: rows44 <= 10 && (await this.paginationState()).total === total44,
      }));
      await this.check('用例#44-③ 新列「成为陪玩师时间」表头仍可见', async () => ({
        expect: 'true',
        real: String(header44),
        pass: header44 === true,
      }));

      // ==================== 用例#45～#47 批量入口 ====================
      const entryCases = [
        { no: 45, status: '待审核', button: '通过', expectedStatus: '待审核', forbid: '审核' },
        { no: 46, status: '待审核', button: '批量拒绝', expectedStatus: '待审核', forbid: '拒绝' },
        { no: 47, status: '已通过&待打款', button: '提交到渠道', expectedStatus: '已通过&待打款', forbid: '打款' },
      ];
      for (const entryCase of entryCases) {
        let beforeDisabled = false;
        let afterDisabled = true;
        let statusBefore = '';
        let statusAfter = '';
        let resultToast = 0;
        let buttonVisible = false;
        await this.act(`用例#${entryCase.no} 状态「${entryCase.status}」下勾选/取消一行并观察「${entryCase.button}」按钮`, async () => {
          await this.openWithdraw();
          await this.selectByPlaceholder('状态', entryCase.status);
          await this.search();
          await this.waitRows(1);
          const rows = await this.mainRows();
          statusBefore = rows[0]?.[33] ?? '';
          buttonVisible = await this.button(entryCase.button).isVisible().catch(() => false);
          if (!buttonVisible) throw new Error(`「${entryCase.button}」按钮不可见`);
          beforeDisabled = await this.buttonDisabled(entryCase.button);
          await this.p.locator('.app-container .el-table__fixed .el-table__fixed-body-wrapper tbody tr.el-table__row').first().locator('.el-checkbox').first().click();
          afterDisabled = await this.buttonDisabled(entryCase.button);
          await this.shot(`用例${entryCase.no}-勾选一行`);
          await this.p.locator('.app-container .el-table__fixed .el-table__fixed-body-wrapper tbody tr.el-table__row').first().locator('.el-checkbox').first().click();
          await this.waitListIdle();
          const afterRows = await this.mainRows();
          statusAfter = afterRows[0]?.[33] ?? '';
          resultToast = await this.toastCount(entryCase.forbid);
          await this.shot(`用例${entryCase.no}-取消勾选`);
        });
        await this.check(`用例#${entryCase.no}-① 未勾选时「${entryCase.button}」按钮禁用，勾选一行后按钮可用`, async () => ({
          expect: 'before=true;after=false',
          real: `before=${beforeDisabled};after=${afterDisabled}`,
          pass: beforeDisabled === true && afterDisabled === false,
        }));
        await this.check(`用例#${entryCase.no}-② 目标记录仍显示「${entryCase.expectedStatus}」，页面未出现处理结果提示`, async () => ({
          expect: `status=${entryCase.expectedStatus};resultToast=0`,
          real: `before=${statusBefore};after=${statusAfter};resultToast=${resultToast}`,
          pass: statusBefore === entryCase.expectedStatus && statusAfter === entryCase.expectedStatus && resultToast === 0,
        }));
      }
    } finally {
      this.log(`提现用例仅只读数据，无业务数据清理；临时导出文件保留于证据目录 ${this.evidenceDir}`);
    }
  }
}

await new WithdrawBecomePlayerTime47Cases().execute();
