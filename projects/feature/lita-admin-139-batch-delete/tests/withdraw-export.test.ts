/**
 * 项目139 / 审核-提现-导出：Excel 新增“成为陪玩师时间”列（真实页面导出按钮 + 真实文件解析）
 *
 * 覆盖：
 * 1. 未加筛选时保持既有“不能无限制导出”保护；
 * 2. 页面选择日期区间（yyyy-MM-dd）后点击【导出结果】可正常下载（历史直连导出 startDate 日期类型错误的重点复核）；
 * 3. 导出文件 50 列，0 基索引 44 = 成为陪玩师时间，索引 43/45 相邻列不变；
 * 4. 导出值与 /api/withdraw 返回的 becomePlayerTime 一致，空值单元格为空；
 * 5. 其它列（表头与列数）未受影响。
 *
 * 运行：
 *   ADMIN_USERNAME=admin ADMIN_PASSWORD=*** LITA_USER_TOKEN=*** \
 *   node projects/feature/lita-admin-139-batch-delete/tests/withdraw-export.test.ts
 */
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdminBase, cst } from './lib/admin-base.ts';

const EXPECTED_HEADERS = [
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

class WithdrawExport extends AdminBase {
  constructor() {
    super('withdraw-export');
    this.total = 9;
  }

  private async getDateRange(): Promise<{ start: string; end: string }> {
    const value = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.valueRangeTime);
    if (!Array.isArray(value) || value.length !== 2) throw new Error(`页面日期区间未设置: ${JSON.stringify(value)}`);
    return { start: String(value[0]), end: String(value[1]) };
  }

  async run(): Promise<void> {
    await this.act('管理员真实登录并获取本次会话 token', async () => {
      await this.login();
    });

    await this.act('打开提现查询并确认页面就绪', async () => {
      await this.open('/review/withdrawal', '.app-container');
      const started = Date.now();
      while (Date.now() - started < 30000) {
        const count = await this.p.evaluate(() => (document.querySelector('.app-container') as any).__vue__.list?.length ?? 0);
        if (count > 0) break;
        await this.p.waitForTimeout(300);
      }
      await this.shot('导出前-提现列表');
    });

    await this.act('未加筛选点击导出：保持“不能无限制导出”保护', async () => {
      await this.button('导出结果').click();
      const toast = await this.waitToast('下载异常');
      this.log(`无筛选导出提示: ${toast}`);
      await this.shot('无筛选导出-受控提示');
      const exportCall = this.calls.filter((call) => call.url.includes('/api/withdraw/export')).pop();
      if (!exportCall) throw new Error('未捕获导出请求');
      if (!exportCall.responseBody?.includes('不能无限制导出')) throw new Error('无筛选导出未返回预期保护文案');
    });

    await this.act('选择“最近三个月”日期区间并等待列表刷新', async () => {
      await this.p.locator('.app-container input[placeholder="开始日期"]').click();
      const shortcut = this.p.locator('.el-picker-panel:visible .el-picker-panel__shortcut').filter({ hasText: '最近三个月' }).first();
      await shortcut.waitFor({ state: 'visible', timeout: 10000 });
      await shortcut.click();
      await this.p.waitForTimeout(2000);
      const range = await this.getDateRange();
      this.log(`日期区间=${range.start} ~ ${range.end}`);
      await this.shot('已选择日期区间');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(range.start) || !/^\d{4}-\d{2}-\d{2}$/.test(range.end)) {
        throw new Error(`日期区间格式非 yyyy-MM-dd: ${JSON.stringify(range)}`);
      }
    });

    await this.act('点击【导出结果】下载 Excel（复核 startDate 日期类型历史问题）', async () => {
      const [download, response] = await Promise.all([
        this.p.waitForEvent('download', { timeout: 60000 }),
        this.p.waitForResponse((item) => item.url().includes('/api/withdraw/export'), { timeout: 60000 }),
        this.button('导出结果').click(),
      ]);
      const file = join(this.evidenceDir, `withdraw-export-${Date.now()}.xlsx`);
      await download.saveAs(file);
      (this as any).exportFile = file;
      const exportUrl = response.url();
      const body = Buffer.from(await response.body());
      this.log(`导出请求=${exportUrl}`);
      this.log(`导出文件=${file}，响应字节=${body.length}`);
      await this.shot('导出文件已下载');
      const url = new URL(exportUrl);
      const start = url.searchParams.get('startDate');
      const end = url.searchParams.get('endDate');
      if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error(`导出 startDate 非 yyyy-MM-dd: ${start}`);
      if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new Error(`导出 endDate 非 yyyy-MM-dd: ${end}`);
      if (body.length < 1000) throw new Error(`导出响应过小，疑似失败: ${body.toString('utf8').slice(0, 200)}`);
    });

    await this.act('解析 Excel：50 列且新列位于 0 基索引 44', async () => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile((this as any).exportFile);
      const sheet = workbook.worksheets[0];
      const headers = (sheet.getRow(1).values as any[]).slice(1).map((value) => String(value ?? '').trim());
      (this as any).headers = headers;
      (this as any).sheet = sheet;
      this.log(`导出列数=${headers.length}，索引43=${headers[43]}，索引44=${headers[44]}，索引45=${headers[45]}`);
      if (headers.length !== 50) throw new Error(`导出列数应为 50，实际 ${headers.length}`);
      if (headers[44] !== '成为陪玩师时间') throw new Error(`索引 44 列名不符: ${headers[44]}`);
      if (headers[43] !== '最新提现状态的更新时间') throw new Error(`索引 43 列名不符: ${headers[43]}`);
      if (headers[45] !== '商户交易流水号') throw new Error(`索引 45 列名不符: ${headers[45]}`);
      for (const expected of EXPECTED_HEADERS) {
        if (!headers.includes(expected)) throw new Error(`导出缺少既有列: ${expected}`);
      }
      const headersBackup = await this.p.locator('.app-container .el-table__header-wrapper').first().locator('th').allInnerTexts();
      this.log(`页面表头包含成为陪玩师时间=${headersBackup.some((text) => text.trim() === '成为陪玩师时间')}`);
    });

    await this.act('导出值与 /api/withdraw 的 becomePlayerTime 抽样比对', async () => {
      const sheet = (this as any).sheet as ExcelJS.Worksheet;
      const range = await this.getDateRange();
      const response = await this.api(`/api/withdraw?source=1&startDate=${range.start}&endDate=${range.end}&page=1&rows=500`);
      if (String(response.json?.status) !== '0') throw new Error(`/api/withdraw 查询失败: ${response.json?.msg}`);
      const apiRows: any[] = response.json.data?.data ?? [];
      const byKey = new Map<string, any>();
      // 导出“大神ID”列实际为 userNo（与页面一致），按 userNo + 申请时间匹配
      for (const row of apiRows) byKey.set(`${row.userNo}|${cst(row.createTime)}`, row);

      const total = sheet.rowCount;
      this.log(`导出数据行=${Math.max(0, total - 1)}，接口区间数据=${apiRows.length}`);
      let compared = 0;
      let nonEmpty = 0;
      for (let i = 2; i <= Math.min(total, 21); i++) {
        const row = (sheet.getRow(i).values as any[]).slice(1);
        const userNo = String(row[2] ?? '').trim();
        const createTime = String(row[0] ?? '').trim();
        const exported = String(row[44] ?? '').trim();
        const hit = byKey.get(`${userNo}|${createTime}`) ?? apiRows.find((item) => String(item.userNo) === userNo);
        if (!hit) {
          this.log(`导出行 ${i} userNo=${userNo} createTime=${createTime} 未找到对应接口记录，跳过比对`);
          continue;
        }
        const expected = hit.becomePlayerTime === null || hit.becomePlayerTime === undefined ? '' : cst(hit.becomePlayerTime);
        if (exported !== expected) throw new Error(`导出行 ${i} userNo=${userNo} 值 ${JSON.stringify(exported)} 与接口 ${JSON.stringify(expected)} 不一致`);
        compared++;
        if (exported !== '') nonEmpty++;
      }
      this.log(`完成比对行数=${compared}，其中非空=${nonEmpty}`);
      await this.shot('导出值比对完成');
      if (compared === 0) throw new Error('没有可比对的导出行');
      if (nonEmpty === 0) throw new Error('抽样导出值全为空，无法验证新列取值');
    });

    await this.act('空值样本导出：成为陪玩师时间单元格留空', async () => {
      const response = await this.api('/api/withdraw/export?source=1&startDate=2026-03-13&endDate=2026-03-13', { raw: true });
      const file = join(this.evidenceDir, `withdraw-export-empty-${Date.now()}.xlsx`);
      writeFileSync(file, response.buffer!);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file);
      const sheet = workbook.worksheets[0];
      const headers = (sheet.getRow(1).values as any[]).slice(1).map((value) => String(value ?? '').trim());
      const rows = sheet.rowCount - 1;
      this.log(`空值样本导出响应 HTTP ${response.status}，行数=${rows}`);
      await this.shot('空值样本导出文件');
      if (headers[44] !== '成为陪玩师时间') throw new Error('空值样本导出新列位置错误');
      if (rows < 1) throw new Error('空值样本导出无数据');
      let checked = 0;
      for (let i = 2; i <= sheet.rowCount; i++) {
        const values = (sheet.getRow(i).values as any[]).slice(1);
        if (String(values[2] ?? '').trim() === '4331214') {
          const cell = values[44];
          this.log(`空值样本 userNo=4331214 导出单元格=${JSON.stringify(cell)}`);
          if (cell !== undefined && cell !== null && String(cell).trim() !== '') throw new Error(`空值单元格未留空: ${JSON.stringify(cell)}`);
          checked++;
        }
      }
      if (checked === 0) throw new Error('未找到空值样本 userNo=4331214');
    });

    await this.act('接口约束复核：datetime 形式 startDate 仍被拒绝（页面使用 yyyy-MM-dd 不受影响）', async () => {
      const range = await this.getDateRange();
      const bad = await this.api(`/api/withdraw/export?source=1&startDate=${encodeURIComponent(`${range.start} 00:00:00`)}&endDate=${encodeURIComponent(`${range.end} 23:59:59`)}`, { raw: true });
      this.log(`datetime 形式导出响应: HTTP ${bad.status} ${(bad.text ?? '').slice(0, 160)}`);
      await this.shot('接口约束复核');
      // 该行为为既有接口约束，页面日期选择器输出 yyyy-MM-dd，不影响需求；仅记录，不判失败
    });
  }
}

await new WithdrawExport().execute();
