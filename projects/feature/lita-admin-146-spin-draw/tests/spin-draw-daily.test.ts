/**
 * 项目 146 / 水果机数据-按日：查询、指标、房间、跨页一致性与空数据（SK-04、SK-05～SK-10、SK-12、SK-16、SK-17）
 * 用例来源：TK-0112 HANDOFF（/task/20261109/TK-0112/HANDOFF）；技术方案：/task/20261109/TK-0112/TECH_DESIGN
 * 覆盖：#20、#25、#26、#27、#28、#30、#32、#34、#36、#47（共 44 个检查点）
 * 数据隔离：全程只读，复用 BD-01/BD-02/BD-04 现有样本；参数化数据行每行独立浏览器会话
 * 运行：ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-daily.test.ts
 */
import { SpinDrawAdminBase, ROUTE_DAILY } from './lib/admin-base.ts';
import { fmtMoney, numberFrom, parseDetails, parseRooms, percent } from './lib/page-values.ts';
import type { DetailSegment } from './lib/page-values.ts';

interface DataRow {
  key: string;
  start: string;
  end: string;
  uid: string;
  expectRows: number;
  expectDates: string;
}

const CASE20_ROWS: DataRow[] = [
  { key: 'A', start: '2026-11-08', end: '2026-11-08', uid: '17612704', expectRows: 1, expectDates: '2026-11-08' },
  { key: 'B', start: '2026-11-02', end: '2026-11-08', uid: '17612704', expectRows: 5, expectDates: '2026-11-02,2026-11-03,2026-11-04,2026-11-05,2026-11-08' },
  { key: 'C', start: '2026-10-31', end: '2026-11-02', uid: '17612704', expectRows: 3, expectDates: '2026-10-31,2026-11-01,2026-11-02' },
];

const DAILY_HEADERS = 'Date / P&L / RTP / Details / Dismantle / Top Spending Room';

function segRaw(segment: DetailSegment | null, key: 'input' | 'output'): string {
  if (!segment) return 'null';
  const match = segment.raw.match(new RegExp(`${key}[：:]\\s*([\\d,，.\\-]+)`));
  return match ? match[1] : 'null';
}

class SpinDrawDailyTest extends SpinDrawAdminBase {
  constructor() {
    super('spin-draw-daily');
    // 20: 3 行×3；25:3；26:3；27:4；28:3；30:4；32:4；34:4；36:2 行×3；47:4
    this.total = 9 + 3 + 3 + 4 + 3 + 4 + 4 + 4 + 6 + 4;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.case20();
    await this.case25();
    await this.case26();
    await this.case27();
    await this.case28();
    await this.case30();
    await this.case32();
    await this.case34();
    await this.case36();
    await this.case47();
  }

  private async queryDaily(start: string, end: string, uid: string): Promise<string[][]> {
    await this.openReport(ROUTE_DAILY);
    if ((await this.fieldValues()).start !== '') await this.resetForm();
    await this.setDate('开始日期', start);
    await this.setDate('结束日期', end);
    await this.setUid(uid);
    await this.query();
    await this.waitListIdle();
    return this.rows();
  }

  private async case20(): Promise<void> {
    for (const data of CASE20_ROWS) {
      const main = this.saveMainSession();
      const session = await this.newSession();
      try {
        this.useSession(session);
        let tableRows: string[][] = [];
        await this.act(`用例#20 数据行${data.key} 按日查询 ${data.start}～${data.end} UID ${data.uid}`, async () => {
          tableRows = await this.queryDaily(data.start, data.end, data.uid);
        });
        await this.uiCheck(`用例#20-${data.key}-① 列表显示 ${data.expectRows} 行且 Total ${data.expectRows}`, `case20-${data.key}-1-count`, async () => {
          const total = await this.totalCount();
          return this.textCheck(`${data.expectRows} 行|Total ${data.expectRows}`, `${tableRows.length} 行|Total ${total}`);
        });
        await this.uiCheck(`用例#20-${data.key}-② 表头依次为 Date / P&L / RTP / Details / Dismantle / Top Spending Room`, `case20-${data.key}-2-header`, async () => {
          const real = (await this.headers()).join(' / ');
          return this.textCheck(DAILY_HEADERS, real);
        });
        await this.uiCheck(`用例#20-${data.key}-③ Date 依次为 ${data.expectDates.replace(/,/g, '、')}`, `case20-${data.key}-3-dates`, async () => {
          return this.textCheck(data.expectDates, tableRows.map((row) => row[0]).join(','));
        });
      } finally {
        await session.close();
        this.restoreMainSession(main);
      }
    }
  }

  private async case25(): Promise<void> {
    let tableRows: string[][] = [];
    await this.act('用例#25 查询 UID 17612704 2026-11-08 按日', async () => {
      tableRows = await this.queryDaily('2026-11-08', '2026-11-08', '17612704');
    });
    const row = tableRows[0] ?? [];
    await this.uiCheck('用例#25-① 结果仅 1 行且 Date 显示 2026-11-08', 'case25-1-date', async () => {
      const total = await this.totalCount();
      return this.textCheck('1 行|2026-11-08|Total 1', `${tableRows.length} 行|${row[0] ?? '(无)'}|Total ${total}`);
    });
    await this.uiCheck('用例#25-② P&L 显示 -44,042', 'case25-2-pnl', async () => {
      return this.textCheck('-44,042', row[1] ?? '(无数据行)');
    });
    await this.uiCheck('用例#25-③ P&L 等于抽奖盈亏加翻倍盈亏加神灯奖励', 'case25-3-formula', async () => {
      const detail = parseDetails(row[3] ?? '');
      const lotteryProfit = (detail.aladdin?.output ?? NaN) - (detail.aladdin?.input ?? NaN);
      const doubleProfit = (detail.multiplier?.output ?? NaN) - (detail.multiplier?.input ?? NaN);
      const lamp = numberFrom(detail.lampRaw ?? '');
      const computed = lotteryProfit + doubleProfit + lamp;
      return this.textCheck(
        '-29188|-35310|20456|-44042',
        `${lotteryProfit}|${doubleProfit}|${lamp}|${computed}`,
        `抽奖盈亏=${fmtMoney(lotteryProfit)}；翻倍盈亏=${fmtMoney(doubleProfit)}；Magic Lamp=${fmtMoney(lamp)}；合计=${fmtMoney(computed)}；页面 P&L=${row[1]}`,
      );
    });
  }

  private async case26(): Promise<void> {
    let tableRows: string[][] = [];
    await this.act('用例#26 查询 UID 17612704 2026-11-08 按日', async () => {
      tableRows = await this.queryDaily('2026-11-08', '2026-11-08', '17612704');
    });
    const row = tableRows[0] ?? [];
    await this.uiCheck('用例#26-① 结果仅 1 行且 Date 显示 2026-11-08', 'case26-1-date', async () => {
      const total = await this.totalCount();
      return this.textCheck('1 行|2026-11-08|Total 1', `${tableRows.length} 行|${row[0] ?? '(无)'}|Total ${total}`);
    });
    await this.uiCheck('用例#26-② RTP 显示 90.57%', 'case26-2-rtp', async () => {
      return this.textCheck('90.57%', row[2] ?? '(无数据行)');
    });
    await this.uiCheck('用例#26-③ RTP 按 [1+P&L/抽奖投入] 计算并保留两位百分比', 'case26-3-formula', async () => {
      const detail = parseDetails(row[3] ?? '');
      const pl = numberFrom(row[1] ?? '');
      const input = detail.aladdin?.input ?? NaN;
      const computed = (1 + pl / input) * 100;
      return this.textCheck(
        '466800|90.57',
        `${input}|${computed.toFixed(2)}`,
        `页面 P&L=${row[1]}；Aladdin input=${segRaw(detail.aladdin, 'input')}；计算=${percent(computed)}`,
      );
    });
  }

  private async case27(): Promise<void> {
    let tableRows: string[][] = [];
    await this.act('用例#27 查询 UID 17612704 2026-11-08 按日', async () => {
      tableRows = await this.queryDaily('2026-11-08', '2026-11-08', '17612704');
    });
    const row = tableRows[0] ?? [];
    const detail = parseDetails(row[3] ?? '');
    await this.uiCheck('用例#27-① 结果仅 1 行且 Date 显示 2026-11-08', 'case27-1-date', async () => {
      const total = await this.totalCount();
      return this.textCheck('1 行|2026-11-08|Total 1', `${tableRows.length} 行|${row[0] ?? '(无)'}|Total ${total}`);
    });
    await this.uiCheck('用例#27-② Aladdin 段显示 input：466,800；output：437,612（93.75%）', 'case27-2-aladdin', async () => {
      return this.textCheck('input：466,800；output：437,612（93.75%）', detail.aladdin?.raw ?? '(无 Aladdin 段)');
    });
    await this.uiCheck('用例#27-③ Multiplier 段显示 input：218,574；output：183,264（83.85%）', 'case27-3-multiplier', async () => {
      return this.textCheck('input：218,574；output：183,264（83.85%）', detail.multiplier?.raw ?? '(无 Multiplier 段)');
    });
    await this.uiCheck('用例#27-④ Magic Lamp 段显示 20,456', 'case27-4-lamp', async () => {
      return this.textCheck('20,456', detail.lampRaw ?? '(无 Magic Lamp 段)');
    });
  }

  private async case28(): Promise<void> {
    let tableRows: string[][] = [];
    await this.act('用例#28 查询 UID 17612704 2026-11-08 按日', async () => {
      tableRows = await this.queryDaily('2026-11-08', '2026-11-08', '17612704');
    });
    const row = tableRows[0] ?? [];
    const detail = parseDetails(row[3] ?? '');
    await this.uiCheck('用例#28-① 结果仅 1 行且 Date 显示 2026-11-08', 'case28-1-date', async () => {
      const total = await this.totalCount();
      return this.textCheck('1 行|2026-11-08|Total 1', `${tableRows.length} 行|${row[0] ?? '(无)'}|Total ${total}`);
    });
    await this.uiCheck('用例#28-② Dismantle 显示 317,189（67.95%）', 'case28-2-dismantle', async () => {
      return this.textCheck('317,189（67.95%）', row[4] ?? '(无数据行)');
    });
    await this.uiCheck('用例#28-③ Dismantle 金额占抽奖投入 67.95%', 'case28-3-formula', async () => {
      const dismantle = numberFrom(row[4] ?? '');
      const input = detail.aladdin?.input ?? NaN;
      const ratio = (dismantle / input) * 100;
      return this.textCheck(
        '317189|466800|67.95',
        `${dismantle}|${input}|${ratio.toFixed(2)}`,
        `页面 Dismantle=${row[4]}；Aladdin input=${segRaw(detail.aladdin, 'input')}；计算比例=${percent(ratio)}`,
      );
    });
  }

  private async case30(): Promise<void> {
    let tableRows: string[][] = [];
    await this.act('用例#30 查询 UID 17612704 2026-11-08 按日房间投入', async () => {
      tableRows = await this.queryDaily('2026-11-08', '2026-11-08', '17612704');
    });
    const row = tableRows[0] ?? [];
    const rooms = parseRooms(row[5] ?? '');
    await this.uiCheck('用例#30-① 结果仅 1 行且 Date 显示 2026-11-08', 'case30-1-date', async () => {
      const total = await this.totalCount();
      return this.textCheck('1 行|2026-11-08|Total 1', `${tableRows.length} 行|${row[0] ?? '(无)'}|Total ${total}`);
    });
    await this.uiCheck('用例#30-② 房间依次显示 ID=10100458: 278,400、ID=10101463: 140,000、ID=10100663: 48,400', 'case30-2-rooms', async () => {
      return this.textCheck(
        'ID=10100458: 278,400；ID=10101463: 140,000；ID=10100663: 48,400',
        rooms.map((room) => room.raw).join('；'),
      );
    });
    await this.uiCheck('用例#30-③ 单元格仅包含 3 个房间条目', 'case30-3-count', async () => {
      return this.textCheck('3', String(rooms.length));
    });
    await this.uiCheck('用例#30-④ 三个房间金额按 278,400 > 140,000 > 48,400 降序', 'case30-4-order', async () => {
      const amounts = rooms.map((room) => room.amount);
      const descending = amounts.every((value, index) => index === 0 || amounts[index - 1] >= value);
      return this.textCheck('true', String(descending), `页面房间金额=${amounts.join(',')}`);
    });
  }

  private async case32(): Promise<void> {
    let tableRows: string[][] = [];
    await this.act('用例#32 查询 UID 11925763 2026-10-02 按日十二房间样本', async () => {
      tableRows = await this.queryDaily('2026-10-02', '2026-10-02', '11925763');
    });
    const row = tableRows[0] ?? [];
    const rooms = parseRooms(row[5] ?? '');
    await this.uiCheck('用例#32-① 结果仅 1 行且 Date 显示 2026-10-02', 'case32-1-date', async () => {
      const total = await this.totalCount();
      return this.textCheck('1 行|2026-10-02|Total 1', `${tableRows.length} 行|${row[0] ?? '(无)'}|Total ${total}`);
    });
    await this.uiCheck('用例#32-② Top Spending Room 仅显示 10 个房间条目', 'case32-2-count', async () => {
      return this.textCheck('10', String(rooms.length));
    });
    await this.uiCheck('用例#32-③ 10 个条目金额依次为 22,500、2,700、2,100、900、600、600、600、600、600、300', 'case32-3-amounts', async () => {
      return this.textCheck(
        '22,500、2,700、2,100、900、600、600、600、600、600、300',
        rooms.map((room) => room.amountText).join('、'),
      );
    });
    await this.uiCheck('用例#32-④ 每个条目均显示 ID=房间ID: 金额', 'case32-4-format', async () => {
      const pattern = /^ID=\d+: [\d,]+$/;
      const invalid = rooms.filter((room) => !pattern.test(room.raw)).map((room) => room.raw);
      return this.textCheck('全部符合', invalid.length === 0 ? '全部符合' : `不符合:${invalid.join('|')}`);
    });
  }

  private async case34(): Promise<void> {
    let tableRows: string[][] = [];
    await this.act('用例#34 查询 UID 17612704 2026-11-02～2026-11-08 按日', async () => {
      tableRows = await this.queryDaily('2026-11-02', '2026-11-08', '17612704');
    });
    await this.uiCheck('用例#34-① 列表仅显示 2026-11-02、2026-11-03、2026-11-04、2026-11-05、2026-11-08 5 行', 'case34-1-dates', async () => {
      return this.textCheck(
        '2026-11-02,2026-11-03,2026-11-04,2026-11-05,2026-11-08',
        tableRows.map((row) => row[0]).join(','),
      );
    });
    await this.uiCheck('用例#34-② 五行 P&L 分别为 27,352、57,705、40,269、-12,518、-44,042 且合计 68,766', 'case34-2-pnl', async () => {
      const values = tableRows.map((row) => numberFrom(row[1]));
      const sum = values.reduce((acc, value) => acc + value, 0);
      return this.textCheck(
        '27,352、57,705、40,269、-12,518、-44,042；合计=68,766',
        `${values.map(fmtMoney).join('、')}；合计=${fmtMoney(sum)}`,
      );
    });
    await this.uiCheck('用例#34-③ Aladdin input 合计 2,978,230、output 合计 3,028,238，Magic Lamp 合计 128,197', 'case34-3-aladdin', async () => {
      let inputSum = 0;
      let outputSum = 0;
      let lampSum = 0;
      for (const row of tableRows) {
        const detail = parseDetails(row[3] ?? '');
        inputSum += detail.aladdin?.input ?? 0;
        outputSum += detail.aladdin?.output ?? 0;
        lampSum += numberFrom(detail.lampRaw ?? '0');
      }
      return this.textCheck(
        'input=2,978,230；output=3,028,238；Magic Lamp=128,197',
        `input=${fmtMoney(inputSum)}；output=${fmtMoney(outputSum)}；Magic Lamp=${fmtMoney(lampSum)}`,
      );
    });
    await this.uiCheck('用例#34-④ Multiplier input 合计 1,558,611、output 合计 1,449,172，Dismantle 合计 2,021,059', 'case34-4-multiplier', async () => {
      let inputSum = 0;
      let outputSum = 0;
      let dismantleSum = 0;
      for (const row of tableRows) {
        const detail = parseDetails(row[3] ?? '');
        inputSum += detail.multiplier?.input ?? 0;
        outputSum += detail.multiplier?.output ?? 0;
        dismantleSum += numberFrom(row[4] ?? '0');
      }
      return this.textCheck(
        'input=1,558,611；output=1,449,172；Dismantle=2,021,059',
        `input=${fmtMoney(inputSum)}；output=${fmtMoney(outputSum)}；Dismantle=${fmtMoney(dismantleSum)}`,
      );
    });
  }

  private async case36(): Promise<void> {
    const rows: Array<{ key: string; start: string; end: string; uid: string }> = [
      { key: 'A', start: '2026-11-02', end: '2026-11-08', uid: '17612690' },
      { key: 'B', start: '2026-01-01', end: '2026-01-02', uid: '17612704' },
    ];
    for (const data of rows) {
      const main = this.saveMainSession();
      const session = await this.newSession();
      try {
        this.useSession(session);
        await this.act(`用例#36 数据行${data.key} 按日无数据查询 ${data.start}～${data.end} UID ${data.uid}`, async () => {
          await this.queryDaily(data.start, data.end, data.uid);
        });
        await this.uiCheck(`用例#36-${data.key}-① 结果区显示「暂无数据」`, `case36-${data.key}-1-empty`, async () => {
          return this.textCheck('暂无数据', await this.emptyText());
        });
        await this.uiCheck(`用例#36-${data.key}-② 分页显示 Total 0 且结果表无数据行`, `case36-${data.key}-2-total`, async () => {
          return this.textCheck('Total 0|0 行', `Total ${await this.totalCount()}|${await this.rowCount()} 行`);
        });
        await this.uiCheck(`用例#36-${data.key}-③ 上一页与下一页按钮均为禁用态`, `case36-${data.key}-3-pager`, async () => {
          const pager = await this.pager();
          return this.textCheck(
            '上一页禁用=true|下一页禁用=true',
            `上一页禁用=${pager.prevDisabled}|下一页禁用=${pager.nextDisabled}`,
          );
        });
      } finally {
        await session.close();
        this.restoreMainSession(main);
      }
    }
  }

  private async case47(): Promise<void> {
    let tableRows: string[][] = [];
    await this.act('用例#47 查询 UID 17612704 2026-11-02～2026-11-05 按日数字格式', async () => {
      tableRows = await this.queryDaily('2026-11-02', '2026-11-05', '17612704');
    });
    const row1104 = tableRows.find((row) => row[0] === '2026-11-04') ?? [];
    const row1105 = tableRows.find((row) => row[0] === '2026-11-05') ?? [];
    await this.uiCheck('用例#47-① 2026-11-04 行 Aladdin 显示 input：1,052,800；output：1,082,920（102.86%）', 'case47-1-aladdin', async () => {
      const detail = parseDetails(row1104[3] ?? '');
      return this.textCheck('input：1,052,800；output：1,082,920（102.86%）', detail.aladdin?.raw ?? '(无 Aladdin 段)');
    });
    await this.uiCheck('用例#47-② 2026-11-05 行 Multiplier 比例显示 80.90%', 'case47-2-multiplier', async () => {
      const detail = parseDetails(row1105[3] ?? '');
      return this.textCheck('80.90%', detail.multiplier?.ratio ?? '(无 Multiplier 段)');
    });
    await this.uiCheck('用例#47-③ 四行 RTP 依次显示 117.27%、106.56%、103.82%、97.03%', 'case47-3-rtp', async () => {
      return this.textCheck('117.27%、106.56%、103.82%、97.03%', tableRows.map((row) => row[2]).join('、'));
    });
    await this.uiCheck('用例#47-④ 四行 Dismantle 比例与金额显示', 'case47-4-dismantle', async () => {
      const real = tableRows
        .map((row) => {
          const match = (row[4] ?? '').match(/([\d,]+)（([\d.]+%)）/);
          return match ? `${match[2]}/${match[1]}` : `(无法解析:${row[4]})`;
        })
        .join('、');
      return this.textCheck(
        '62.54%/99,066、75.29%/661,827、64.75%/681,644、62.04%/261,333',
        real,
      );
    });
  }
}

await new SpinDrawDailyTest().execute();
