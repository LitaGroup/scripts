/**
 * 项目139 / TK-0105 用例执行轮次：审核-提现-查询【成为陪玩师时间】列表/筛选/分页/导出。
 *
 * 用例来源：/task/20261109/TK-0101/HANDOFF（v5）九列用例 #18～#22、#24；
 * 技术方案：/task/20261109/TK-0101/TECH_DESIGN（WD-01～WD-03、S13～S17、S19）。
 * 用例 #23（批量审核）因数据授权仅允许 2 条现有待审核记录，单独脚本执行一次。
 *
 * 覆盖：#18 列入口/位置；#19 非空/空值变体；#20 文本/日期筛选族；
 *      #21 9 个下拉筛选族；#22 分页回归；#24 导出（按用例步骤执行，导出受限时补充观测）。
 * 数据隔离：仅使用现有提现数据；不修改 user_profile.become_player_time，不做业务写操作，无造数清理。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-139-batch-delete/tests/tk0105-withdraw-time.test.ts
 */
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { cstValue } from './lib/admin-base.ts';
import { Tk0105Base, type WithdrawRecord } from './lib/tk0105-base.ts';

const NONEMPTY_NO = '4362054';
const NONEMPTY_TEXT = '2026-09-09 16:03:11';
const EMPTY_NO = '4331214';

const CASE20_ROWS = [
  { kind: 'userId', label: '陪玩师ID', value: '7016', seedUser: '7016', seedApply: '2026-9-10 17:26:13' },
  { kind: 'userNo', label: '陪玩师No', value: '1304863', seedUser: '7016', seedApply: '2026-9-10 17:26:13' },
  { kind: 'date', label: '申请提交时间', value: '2026-09-10', seedUser: '7016', seedApply: '2026-9-10 17:26:13' },
  { kind: 'discount', label: '折扣单数>=N', value: '1', seedUser: '7016', seedApply: '2026-9-10 17:26:13' },
] as const;

const CASE21_ROWS = [
  { kind: 'status', label: '状态', value: '待审核', seedUser: '5435', seedApply: '2025-5-15 21:53:31' },
  { kind: 'locale', label: '请选择大区', value: '泰国区', seedUser: '10087', seedApply: '' },
  { kind: 'country', label: '请选择国家', value: '日本', seedUser: '1928', seedApply: '' },
  { kind: 'payMode', label: '转账方式', value: 'Payloco', seedUser: '16505', seedApply: '2026-10-16 15:4:40' },
  { kind: 'debt', label: '欠款记录', value: '有欠款', seedUser: '2035', seedApply: '2023-5-9 16:48:27' },
  { kind: 'bankRisk', label: '银行账户风险', value: '无风险', seedUser: '16505', seedApply: '2026-10-16 15:4:40' },
  { kind: 'riskType', label: '风险类型', value: '无风险', seedUser: '16505', seedApply: '2026-10-16 15:4:40' },
  { kind: 'friendPlayer', label: '是否是Cinta陪陪', value: '是', seedUser: '7090', seedApply: '2026-1-27 11:24:40' },
  { kind: 'cintaAmount', label: '是否有Cinta收入', value: '是', seedUser: '1460', seedApply: '2026-9-4 11:41:46' },
] as const;

class Tk0105WithdrawTimeTest extends Tk0105Base {
  private snapshot = new Map<string, WithdrawRecord>();

  constructor() {
    super('tk0105-withdraw-time');
    this.total = 57;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.captureSnapshot();
    await this.case18();
    await this.case19();
    await this.case20();
    await this.case21();
    await this.case22();
    await this.case24();
  }

  private async captureSnapshot(): Promise<void> {
    await this.act('WD-03 读取未筛选提现列表全量快照（1000/页，仅只读）', async () => {
      await this.openWithdraw();
      await this.changePageSize(1000);
      await this.page!.waitForFunction(() => document.querySelectorAll('.app-container .el-table > .el-table__body-wrapper tbody tr.el-table__row').length > 800, null, { timeout: 60000 });
      const rows = await this.readWithdrawRows();
      this.snapshot = new Map<string, WithdrawRecord>();
      for (const row of rows) this.snapshot.set(Tk0105Base.recordKey(row), row);
      this.log(`未筛选快照行数=${rows.length}`);
      await this.page!.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page!.waitForSelector('.app-container .el-table', { timeout: 45000 });
      await this.waitListIdle();
    });
  }

  private async case18(): Promise<void> {
    await this.act('用例#18 进入审核-提现-查询并重置筛选', async () => {
      await this.openWithdraw();
      await this.resetWithdrawFilters();
    });
    await this.check('用例#18-① 页面路由为提现查询', async () => {
      const hash = await this.page!.evaluate(() => location.hash);
      return { expect: '#/review/withdrawal', real: hash };
    });
    const headers = await this.headerTexts();
    await this.check('用例#18-② 列表显示成为陪玩师时间列', async () => {
      const found = headers.includes('成为陪玩师时间');
      return { expect: '存在', real: found ? '存在' : '不存在' };
    });
    let rowCount = 0;
    let timeCells = 0;
    await this.check('用例#18-③ 该列位于上次提现时间之后、订单金额之前且每行有单元格', async () => {
      const last = headers.indexOf('上次提现时间');
      const become = headers.indexOf('成为陪玩师时间');
      const amount = headers.indexOf('订单金额');
      const rows = await this.readWithdrawRows();
      rowCount = rows.length;
      timeCells = rows.filter((row) => row.becomePlayerTime !== '').length;
      const positionOk = last >= 0 && become === last + 1 && amount === become + 1;
      return {
        expect: `上次提现时间(${last})→成为陪玩师时间(${become})→订单金额(${amount})；${rowCount}行均有单元格`,
        real: `位置${positionOk ? '正确' : '不正确'}；${timeCells}/${rowCount}行有单元格`,
        pass: positionOk && rowCount > 0 && timeCells === rowCount,
      };
    });
    await this.shot('case18-withdraw-column');
  }

  private async case19(): Promise<void> {
    await this.act('用例#19 数据行1：按非空样本 No 4362054 查询', async () => {
      await this.openWithdraw();
      await this.resetWithdrawFilters();
      await this.fillByPlaceholder('陪玩师No', NONEMPTY_NO);
      await this.searchWithdraw();
    });
    let nonEmptyRows: WithdrawRecord[] = [];
    await this.check('用例#19-① 非空样本所有结果行显示格式化来源时间', async () => {
      nonEmptyRows = await this.readWithdrawRows();
      const values = [...new Set(nonEmptyRows.map((row) => row.becomePlayerTime))];
      const formatOk = nonEmptyRows.every((row) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.becomePlayerTime));
      return {
        expect: `全部为 ${NONEMPTY_TEXT}（yyyy-MM-dd HH:mm:ss）`,
        real: `${values.join('、') || '无结果'}；格式${formatOk ? '符合' : '不符合'}`,
        pass: nonEmptyRows.length > 0 && formatOk && values.length === 1 && values[0] === NONEMPTY_TEXT,
      };
    });
    await this.act('用例#19 数据行2：按空值样本 No 4331214 查询', async () => {
      await this.openWithdraw();
      await this.resetWithdrawFilters();
      await this.fillByPlaceholder('陪玩师No', EMPTY_NO);
      await this.searchWithdraw();
    });
    let emptyRows: WithdrawRecord[] = [];
    await this.check('用例#19-② 空值样本所有结果行显示占位符 -', async () => {
      emptyRows = await this.readWithdrawRows();
      const values = [...new Set(emptyRows.map((row) => row.becomePlayerTime))];
      return {
        expect: '全部为 -',
        real: values.join('、') || '无结果',
        pass: emptyRows.length > 0 && values.length === 1 && values[0] === '-',
      };
    });
    await this.check('用例#19-③ 两个样本结果均包含既有记录且该列未留空', async () => {
      const nonEmptySeed = nonEmptyRows.some((row) => row.userNo === NONEMPTY_NO);
      const emptySeed = emptyRows.some((row) => row.userNo === EMPTY_NO);
      const nonEmptyNotBlank = nonEmptyRows.length > 0 && nonEmptyRows.every((row) => row.becomePlayerTime !== '');
      const emptyNotBlank = emptyRows.length > 0 && emptyRows.every((row) => row.becomePlayerTime !== '');
      return {
        expect: '两个样本均含记录且该列均非空单元格',
        real: `非空样本记录=${nonEmptySeed}、列非空=${nonEmptyNotBlank}；空值样本记录=${emptySeed}、列非空=${emptyNotBlank}`,
        pass: nonEmptySeed && emptySeed && nonEmptyNotBlank && emptyNotBlank,
      };
    });
    await this.shot('case19-withdraw-empty-nonempty');
  }

  private async case20(): Promise<void> {
    for (let i = 0; i < CASE20_ROWS.length; i++) {
      const row = CASE20_ROWS[i];
      const index = i + 1;
      await this.act(`用例#20 数据行${index}：按${row.label}=${row.value}查询`, async () => {
        await this.openWithdraw();
        await this.resetWithdrawFilters();
        if (row.kind === 'date') {
          await this.fillWithdrawDateRange(row.value, row.value);
        } else {
          const placeholder = row.kind === 'userId' ? '陪玩师ID' : row.kind === 'userNo' ? '陪玩师No' : '折扣单数>=N';
          await this.fillByPlaceholder(placeholder, row.value);
        }
        await this.searchWithdraw();
      });
      let rows: WithdrawRecord[] = [];
      await this.check(`用例#20-①[数据行${index}] ${row.label}结果包含种子记录`, async () => {
        rows = await this.readWithdrawRows();
        const seed = rows.some((item) => item.userId === row.seedUser && item.applyTime === row.seedApply);
        return {
          expect: `至少1条且含种子 ${row.seedUser}/${row.seedApply}`,
          real: `${rows.length}条；种子${seed ? '存在' : '缺失'}`,
          pass: rows.length > 0 && seed,
        };
      });
      await this.check(`用例#20-②[数据行${index}] 全部结果符合${row.label}条件`, async () => {
        const mismatch = rows
          .filter((item) => {
            if (row.kind === 'userId') return item.userId !== row.value;
            if (row.kind === 'userNo') return item.userNo !== row.value;
            if (row.kind === 'date') return !item.applyTime.startsWith('2026-9-10');
            return Number(item.discountOrderCount) < Number(row.value);
          })
          .map((item) => `${item.userId}/${item.userNo}/${item.applyTime}/${item.discountOrderCount}`);
        return {
          expect: `${rows.length}条全部匹配`,
          real: mismatch.length === 0 ? `${rows.length}条全部匹配` : `不符${mismatch.length}条：${mismatch.slice(0, 3).join('、')}`,
          pass: rows.length > 0 && mismatch.length === 0,
        };
      });
      await this.check(`用例#20-③[数据行${index}] 结果表显示成为陪玩师时间且值与未筛选一致`, async () => {
        const missing = rows.filter((item) => item.becomePlayerTime === '').length;
        const changed = rows.filter((item) => {
          const base = this.snapshot.get(Tk0105Base.recordKey(item));
          return !base || base.becomePlayerTime !== item.becomePlayerTime;
        });
        return {
          expect: `${rows.length}行均有时间且与未筛选快照一致`,
          real: `空单元格${missing}行；与快照不一致${changed.length}行`,
          pass: rows.length > 0 && missing === 0 && changed.length === 0,
        };
      });
    }
    await this.shot('case20-withdraw-text-filters');
  }

  private async case21(): Promise<void> {
    for (let i = 0; i < CASE21_ROWS.length; i++) {
      const row = CASE21_ROWS[i];
      const index = i + 1;
      await this.act(`用例#21 数据行${index}：按${row.label}=${row.value}查询`, async () => {
        await this.openWithdraw();
        await this.resetWithdrawFilters();
        await this.selectWithdrawOption(row.label, row.value);
        await this.page!.waitForTimeout(500);
        await this.searchWithdraw();
      });
      let rows: WithdrawRecord[] = [];
      await this.check(`用例#21-①[数据行${index}] ${row.label}结果包含种子记录`, async () => {
        rows = await this.readWithdrawRows();
        const seed = row.seedApply
          ? rows.some((item) => item.userId === row.seedUser && item.applyTime === row.seedApply)
          : rows.some((item) => item.userId === row.seedUser);
        return {
          expect: `至少1条且含种子 ${row.seedUser}${row.seedApply ? `/${row.seedApply}` : ''}`,
          real: `${rows.length}条；种子${seed ? '存在' : '缺失'}`,
          pass: rows.length > 0 && seed,
        };
      });
      await this.check(`用例#21-②[数据行${index}] 全部结果符合${row.label}条件`, async () => {
        let mismatch: string[] = [];
        let checks = '';
        if (row.kind === 'status') {
          mismatch = rows.filter((item) => item.status !== row.value).map((item) => `${item.userId}:${item.status}`);
          checks = '状态列';
        } else if (row.kind === 'payMode') {
          mismatch = rows.filter((item) => item.payMode.toLowerCase() !== 'payloco').map((item) => `${item.userId}:${item.payMode}`);
          checks = '支付方式列';
        } else if (row.kind === 'debt') {
          mismatch = rows.filter((item) => !Tk0105Base.amountPositive(item.deductionAmount)).map((item) => `${item.userId}:${item.deductionAmount}`);
          checks = '待处理欠款金额记录列';
        } else if (row.kind === 'bankRisk') {
          mismatch = rows.filter((item) => item.bankRisk !== row.value).map((item) => `${item.userId}:${item.bankRisk}`);
          checks = '银行账户风险列';
        } else if (row.kind === 'riskType') {
          mismatch = rows.filter((item) => item.riskType !== row.value).map((item) => `${item.userId}:${item.riskType}`);
          checks = '风险类型列';
        } else if (row.kind === 'friendPlayer') {
          mismatch = rows.filter((item) => item.friendPlayer !== '是').map((item) => `${item.userId}:${item.friendPlayer}`);
          checks = '是否是Cinta陪陪列';
        } else if (row.kind === 'cintaAmount') {
          mismatch = rows.filter((item) => !Tk0105Base.amountPositive(item.cintaAmount)).map((item) => `${item.userId}:${item.cintaAmount}`);
          checks = 'Cinta收入列';
        } else if (row.kind === 'locale' || row.kind === 'country') {
          const uniqueUsers = [...new Set(rows.map((item) => item.userId))];
          const regions: { userId: string; locale: string; countryCode: string }[] = [];
          for (const userId of uniqueUsers) regions.push({ userId, ...(await this.readUserRegion(userId)) });
          if (row.kind === 'locale') {
            mismatch = regions.filter((item) => !item.locale.includes('(th)') && !item.locale.includes('泰国')).map((item) => `${item.userId}:${item.locale}`);
          } else {
            mismatch = regions.filter((item) => item.countryCode !== 'JP').map((item) => `${item.userId}:${item.countryCode}`);
          }
          checks = row.kind === 'locale' ? '查看陪玩师-locale' : '查看陪玩师-CountryIsoCode';
        }
        return {
          expect: `${rows.length}条全部匹配（${checks}）`,
          real: mismatch.length === 0 ? `${rows.length}条全部匹配` : `不符${mismatch.length}条：${mismatch.slice(0, 3).join('、')}`,
          pass: rows.length > 0 && mismatch.length === 0,
        };
      });
      await this.check(`用例#21-③[数据行${index}] 结果表显示成为陪玩师时间且值与未筛选一致`, async () => {
        const missing = rows.filter((item) => item.becomePlayerTime === '').length;
        const changed = rows.filter((item) => {
          const base = this.snapshot.get(Tk0105Base.recordKey(item));
          return !base || base.becomePlayerTime !== item.becomePlayerTime;
        });
        return {
          expect: `${rows.length}行均有时间且与未筛选快照一致`,
          real: `空单元格${missing}行；与快照不一致${changed.length}行`,
          pass: rows.length > 0 && missing === 0 && changed.length === 0,
        };
      });
    }
    await this.shot('case21-withdraw-dropdown-filters');
  }

  private async case22(): Promise<void> {
    let page1: WithdrawRecord[] = [];
    let page2: WithdrawRecord[] = [];
    let page1Users: string[] = [];
    let page2Users: string[] = [];
    let total1 = 0;
    let total2 = 0;
    await this.act('用例#22 重置筛选、搜索并记录第1页', async () => {
      await this.openWithdraw();
      await this.resetWithdrawFilters();
      await this.searchWithdraw();
      total1 = (await this.withdrawTotals()).total;
      page1 = await this.readWithdrawRows();
      page1Users = page1.map((row) => row.userId);
    });
    await this.act('用例#22 点击下一页', async () => {
      await this.page!.locator('.el-pagination .btn-next').first().click();
      await this.waitPageActive(2);
      await this.waitListIdle();
      total2 = (await this.withdrawTotals()).total;
      page2 = await this.readWithdrawRows();
      page2Users = page2.map((row) => row.userId);
    });
    await this.check('用例#22-① 下一页显示第2页且记录集合与第1页不重复', async () => {
      const active = await this.withdrawActivePage();
      const key = (row: WithdrawRecord) => Tk0105Base.recordKey(row);
      const page1Keys = new Set(page1.map(key));
      const rowOverlap = page2.filter((row) => page1Keys.has(key(row))).length;
      const userIdOverlap = page2Users.filter((userId) => page1Users.includes(userId)).length;
      return {
        expect: '当前页=2且记录集合无重复',
        real: `当前页=${active}；第2页${page2.length}行；记录重复${rowOverlap}项；用户ID重复${userIdOverlap}项（同用户多笔提现属既有数据）`,
        pass: active === '2' && page2.length > 0 && rowOverlap === 0,
      };
    });
    await this.check('用例#22-② 翻页前后Total不变', async () => {
      return { expect: String(total1), real: String(total2) };
    });
    await this.check('用例#22-③ 两页均显示成为陪玩师时间且值不随翻页改变', async () => {
      const all = [...page1, ...page2];
      const missing = all.filter((row) => row.becomePlayerTime === '').length;
      const changed = all.filter((row) => {
        const base = this.snapshot.get(Tk0105Base.recordKey(row));
        return !base || base.becomePlayerTime !== row.becomePlayerTime;
      });
      return {
        expect: `${all.length}行均有时间且与未筛选快照一致`,
        real: `空单元格${missing}行；与快照不一致${changed.length}行`,
        pass: all.length > 0 && missing === 0 && changed.length === 0,
      };
    });
    await this.act('用例#22 点击上一页', async () => {
      await this.page!.locator('.el-pagination .btn-prev').first().click();
      await this.waitPageActive(1);
      await this.waitListIdle();
    });
    await this.check('用例#22-④ 上一页回到第1页并恢复原用户ID集合', async () => {
      const active = await this.withdrawActivePage();
      const rows = await this.readWithdrawRows();
      const users = rows.map((row) => row.userId);
      const same = users.length === page1Users.length && users.every((userId, index) => userId === page1Users[index]);
      return {
        expect: `当前页=1且恢复${page1Users.length}行原集合`,
        real: `当前页=${active}；${users.length}行；集合${same ? '一致' : '不一致'}`,
        pass: active === '1' && same,
      };
    });
    await this.shot('case22-withdraw-pagination');
  }

  private async case24(): Promise<void> {
    const exportPath = join(this.evidenceDir, 'tk0105-withdraw-export.xlsx');
    const dataRows = [
      { no: NONEMPTY_NO, label: '非空', expected: NONEMPTY_TEXT },
      { no: EMPTY_NO, label: '空值', expected: '' },
    ];
    for (let i = 0; i < dataRows.length; i++) {
      const dataRow = dataRows[i];
      const index = i + 1;
      let exportFailure = '';
      let sheet: ExcelJS.Worksheet | null = null;
      let headers: string[] = [];
      let listRow: WithdrawRecord | null = null;
      let exportValues: string[][] = [];
      await this.act(`用例#24 数据行${index}（${dataRow.label}样本 No ${dataRow.no}）：查询并导出`, async () => {
        await this.openWithdraw();
        await this.resetWithdrawFilters();
        await this.fillByPlaceholder('陪玩师No', dataRow.no);
        await this.searchWithdraw();
        const rows = await this.readWithdrawRows();
        listRow = rows.find((row) => row.userNo === dataRow.no) ?? null;
        const responsePromise = this.page!.waitForResponse((response) => response.url().includes('/api/withdraw/export'), { timeout: 60000 });
        await this.page!.locator('.app-container button').filter({ hasText: /^\s*导出结果\s*$/ }).first().click();
        const response = await responsePromise;
        const buffer = Buffer.from(await response.body());
        const contentType = response.headers()['content-type'] ?? '';
        if (contentType.includes('json') || buffer.length < 100) {
          exportFailure = buffer.toString('utf8').slice(0, 200);
          return;
        }
        const { writeFileSync } = await import('node:fs');
        writeFileSync(exportPath, buffer);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(exportPath);
        sheet = workbook.worksheets[0];
        headers = this.sheetHeaders(sheet);
        exportValues = this.sheetRows(sheet);
      });
      const ws = sheet as ExcelJS.Worksheet | null;
      await this.check(`用例#24-①[数据行${index}] Excel在最新提现状态更新时间之后、商户交易流水号之前显示成为陪玩师时间`, async () => {
        if (!ws) return { expect: '列位置正确', real: `导出未取得Excel：${exportFailure || '无文件'}`, pass: false };
        const last = headers.indexOf('最新提现状态的更新时间');
        const become = headers.indexOf('成为陪玩师时间');
        const serial = headers.indexOf('商户交易流水号');
        const pass = last >= 0 && become === last + 1 && serial === become + 1;
        return {
          expect: `最新提现状态的更新时间(${last})→成为陪玩师时间(${become})→商户交易流水号(${serial})`,
          real: `列索引 last=${last}, become=${become}, serial=${serial}`,
          pass,
        };
      });
      await this.check(`用例#24-②[数据行${index}] ${dataRow.label}样本导出值与澄清口径一致`, async () => {
        if (!ws) return { expect: dataRow.expected || '(空白)', real: `导出未取得Excel：${exportFailure || '无文件'}`, pass: false };
        const becomeIndex = headers.indexOf('成为陪玩师时间');
        const userIdIndex = headers.indexOf('用户ID');
        const target = listRow ? exportValues.find((row) => row[userIdIndex] === listRow!.userId) : undefined;
        const real = target ? target[becomeIndex] ?? '' : '未找到样本行';
        return {
          expect: dataRow.expected || '(空白)',
          real: real || '(空白)',
          pass: real === dataRow.expected,
        };
      });
      await this.check(`用例#24-③[数据行${index}] 导出结果仅包含当前筛选用户的记录`, async () => {
        if (!ws) return { expect: `仅${dataRow.no}的记录`, real: `导出未取得Excel：${exportFailure || '无文件'}`, pass: false };
        const noIndex = headers.indexOf('用户NO');
        const nos = [...new Set(exportValues.map((row) => row[noIndex]).filter(Boolean))];
        return { expect: `仅${dataRow.no}`, real: nos.join('、') || '无数据', pass: nos.length === 1 && nos[0] === dataRow.no };
      });
      await this.check(`用例#24-④[数据行${index}] 其他列保留且当前样本页面同名列值与列表一致`, async () => {
        if (!ws) return { expect: '相邻列存在且样本值一致', real: `导出未取得Excel：${exportFailure || '无文件'}`, pass: false };
        const last = headers.indexOf('最新提现状态的更新时间');
        const serial = headers.indexOf('商户交易流水号');
        const becomeIndex = headers.indexOf('成为陪玩师时间');
        const userIdIndex = headers.indexOf('用户ID');
        const target = listRow ? exportValues.find((row) => row[userIdIndex] === listRow!.userId) : undefined;
        const exportBecome = target ? target[becomeIndex] ?? '' : '未找到样本行';
        const pageBecome = listRow?.becomePlayerTime ?? '未找到样本行';
        const pageMatch = dataRow.expected === '' ? exportBecome === '' && pageBecome === '-' : exportBecome === pageBecome;
        return {
          expect: `最新提现状态更新时间列存在；商户交易流水号列存在；页面同名列=${dataRow.expected || '列表显示-导出留空'}`,
          real: `相邻列=${last >= 0 ? '有' : '无'}/${serial >= 0 ? '有' : '无'}；导出值=${exportBecome || '(空白)'}；页面值=${pageBecome}`,
          pass: last >= 0 && serial >= 0 && pageMatch,
        };
      });
    }
    await this.act('用例#24 补充观测：按陪玩师No单独导出被“不能无限制导出”限制时，追加状态筛选验证新增列', async () => {
      // 该操作不属于用例#24检查点，仅用于说明新增列本身在合法导出条件下可用；
      // 结论写入 TEST_REPORT，不改变用例#24的正式判定。
      const supplemental: string[] = [];
      for (const [no, status, expected] of [
        [NONEMPTY_NO, '渠道付款失败', NONEMPTY_TEXT],
        [EMPTY_NO, '已打款', ''],
      ] as const) {
        await this.openWithdraw();
        await this.resetWithdrawFilters();
        await this.fillByPlaceholder('陪玩师No', no);
        await this.selectWithdrawStatus(status);
        await this.page!.waitForTimeout(500);
        await this.searchWithdraw();
        const responsePromise = this.page!.waitForResponse((response) => response.url().includes('/api/withdraw/export'), { timeout: 60000 });
        await this.page!.locator('.app-container button').filter({ hasText: /^\s*导出结果\s*$/ }).first().click();
        const response = await responsePromise;
        const buffer = Buffer.from(await response.body());
        if ((response.headers()['content-type'] ?? '').includes('json') || buffer.length < 100) {
          supplemental.push(`${no}:导出失败`);
          continue;
        }
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws2 = wb.worksheets[0];
        const hs = this.sheetHeaders(ws2);
        const idx = hs.indexOf('成为陪玩师时间');
        const values = this.sheetRows(ws2);
        const actual = values[0]?.[idx] ?? '';
        supplemental.push(`${no}:${actual === expected ? `值=${actual || '(空白)'}` : `期望${expected || '(空白)'}实际${actual || '(空白)'}`}`);
      }
      this.log(`用例#24 补充观测结果：${supplemental.join('；')}`);
    });
    await this.shot('case24-withdraw-export');
    await this.act('用例#24 清理本地导出文件', async () => {
      if (existsSync(exportPath)) unlinkSync(exportPath);
    });
  }

  private sheetHeaders(sheet: ExcelJS.Worksheet): string[] {
    const headers: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) headers.push(String(sheet.getRow(1).getCell(c).value ?? '').trim());
    return headers;
  }

  private sheetRows(sheet: ExcelJS.Worksheet): string[][] {
    const rows: string[][] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const values: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) {
        const value = sheet.getRow(r).getCell(c).value;
        if (value === null || value === undefined) values.push('');
        else if (value instanceof Date) values.push(cstValue(value));
        else values.push(String(value).trim());
      }
      rows.push(values);
    }
    return rows;
  }
}

const test = new Tk0105WithdrawTimeTest();
await test.execute();
