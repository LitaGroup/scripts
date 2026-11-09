/**
 * 项目 146 / 水果机数据-汇总：查询、指标、房间与空数据（SK-04、SK-05～SK-10、SK-12、SK-17）
 * 用例来源：TK-0112 HANDOFF（/task/20261109/TK-0112/HANDOFF）；技术方案：/task/20261109/TK-0112/TECH_DESIGN
 * 覆盖：#19、#21、#22、#23、#24、#29、#31、#33、#35、#46（共 40 个检查点）
 * 数据隔离：全程只读，复用 BD-01/BD-02/BD-04 现有样本；参数化数据行每行独立浏览器会话
 * 运行：ADMIN_USERNAME=... ADMIN_PASSWORD=... node projects/feature/lita-admin-146-spin-draw/tests/spin-draw-summary.test.ts
 */
import { SpinDrawAdminBase, ROUTE_SUMMARY } from './lib/admin-base.ts';
import { fmtMoney, numberFrom, parseDetails, parseRooms, percent } from './lib/page-values.ts';
import type { DetailSegment } from './lib/page-values.ts';

interface DataRow {
  key: string;
  start: string;
  end: string;
  uid: string;
  expectRows: number;
  expectPnl: string;
}

const CASE19_ROWS: DataRow[] = [
  { key: 'A', start: '2026-11-08', end: '2026-11-08', uid: '17612704', expectRows: 1, expectPnl: '-44,042' },
  { key: 'B', start: '2026-11-02', end: '2026-11-08', uid: '17612704', expectRows: 1, expectPnl: '68,766' },
  { key: 'C', start: '2026-10-31', end: '2026-11-02', uid: '17612704', expectRows: 1, expectPnl: '-48,804' },
];

const SUMMARY_HEADERS = 'P&L / RTP / Details / Dismantle / Top Spending Room';

function segRaw(segment: DetailSegment | null, key: 'input' | 'output'): string {
  if (!segment) return 'null';
  const match = segment.raw.match(new RegExp(`${key}[：:]\\s*([\\d,，.\\-]+)`));
  return match ? match[1] : 'null';
}

class SpinDrawSummaryTest extends SpinDrawAdminBase {
  constructor() {
    super('spin-draw-summary');
    // 19: 3 行×3；21:2；22:2；23:3；24:2；29:3；31:3；33:4；35:2 行×4；46:4
    this.total = 9 + 2 + 2 + 3 + 2 + 3 + 3 + 4 + 8 + 4;
  }

  protected async run(): Promise<void> {
    await this.login();
    await this.case19();
    await this.case21();
    await this.case22();
    await this.case23();
    await this.case24();
    await this.case29();
    await this.case31();
    await this.case33();
    await this.case35();
    await this.case46();
  }

  private async querySummary(start: string, end: string, uid: string): Promise<string[][]> {
    await this.openReport(ROUTE_SUMMARY);
    if ((await this.fieldValues()).start !== '') await this.resetForm();
    await this.setDate('开始日期', start);
    await this.setDate('结束日期', end);
    await this.setUid(uid);
    await this.query();
    await this.waitListIdle();
    return this.rows();
  }

  private async case19(): Promise<void> {
    for (const data of CASE19_ROWS) {
      const main = this.saveMainSession();
      const session = await this.newSession();
      try {
        this.useSession(session);
        let tableRows: string[][] = [];
        await this.act(`用例#19 数据行${data.key} 汇总查询 ${data.start}～${data.end} UID ${data.uid}`, async () => {
          tableRows = await this.querySummary(data.start, data.end, data.uid);
        });
        await this.uiCheck(`用例#19-${data.key}-① 列表显示 ${data.expectRows} 行且 Total ${data.expectRows}`, `case19-${data.key}-1-count`, async () => {
          const total = await this.totalCount();
          return this.textCheck(`${data.expectRows} 行|Total ${data.expectRows}`, `${tableRows.length} 行|Total ${total}`);
        });
        await this.uiCheck(`用例#19-${data.key}-② 表头依次为 P&L / RTP / Details / Dismantle / Top Spending Room`, `case19-${data.key}-2-header`, async () => {
          const real = (await this.headers()).join(' / ');
          return this.textCheck(SUMMARY_HEADERS, real);
        });
        await this.uiCheck(`用例#19-${data.key}-③ P&L 显示 ${data.expectPnl}`, `case19-${data.key}-3-pnl`, async () => {
          const real = tableRows[0]?.[0] ?? '(无数据行)';
          return this.textCheck(data.expectPnl, real);
        });
      } finally {
        await session.close();
        this.restoreMainSession(main);
      }
    }
  }

  private async case21(): Promise<void> {
    let resultRow: string[] = [];
    await this.act('用例#21 查询 UID 17612704 2026-11-08 单日汇总', async () => {
      resultRow = (await this.querySummary('2026-11-08', '2026-11-08', '17612704'))[0] ?? [];
    });
    await this.uiCheck('用例#21-① P&L 显示 -44,042', 'case21-1-pnl', async () => {
      return this.textCheck('-44,042', resultRow[0] ?? '(无数据行)');
    });
    await this.uiCheck('用例#21-② P&L 等于抽奖盈亏加翻倍盈亏加神灯奖励', 'case21-2-formula', async () => {
      const detail = parseDetails(resultRow[2] ?? '');
      const pl = numberFrom(resultRow[0] ?? '');
      const lotteryProfit = (detail.aladdin?.output ?? NaN) - (detail.aladdin?.input ?? NaN);
      const doubleProfit = (detail.multiplier?.output ?? NaN) - (detail.multiplier?.input ?? NaN);
      const lamp = numberFrom(detail.lampRaw ?? '');
      const computed = lotteryProfit + doubleProfit + lamp;
      const real = `${lotteryProfit}|${doubleProfit}|${lamp}|${computed}`;
      return this.textCheck('-29188|-35310|20456|-44042', real, `抽奖盈亏=${fmtMoney(lotteryProfit)}；翻倍盈亏=${fmtMoney(doubleProfit)}；Magic Lamp=${fmtMoney(lamp)}；合计=${fmtMoney(computed)}；页面 P&L=${resultRow[0]}；明细=${detail.aladdin?.raw ?? ''}|${detail.multiplier?.raw ?? ''}|${detail.lampRaw ?? ''}`);
    });
  }

  private async case22(): Promise<void> {
    let resultRow: string[] = [];
    await this.act('用例#22 查询 UID 17612704 2026-11-08 单日汇总', async () => {
      resultRow = (await this.querySummary('2026-11-08', '2026-11-08', '17612704'))[0] ?? [];
    });
    await this.uiCheck('用例#22-① RTP 显示 90.57%', 'case22-1-rtp', async () => {
      return this.textCheck('90.57%', resultRow[1] ?? '(无数据行)');
    });
    await this.uiCheck('用例#22-② RTP 按 [1+P&L/抽奖投入] 计算并保留两位百分比', 'case22-2-formula', async () => {
      const detail = parseDetails(resultRow[2] ?? '');
      const pl = numberFrom(resultRow[0] ?? '');
      const input = detail.aladdin?.input ?? NaN;
      const computed = (1 + pl / input) * 100;
      return this.textCheck(
        '466800|90.57',
        `${input}|${computed.toFixed(2)}`,
        `页面 P&L=${resultRow[0]}；Aladdin input=${segRaw(detail.aladdin, 'input')}；计算=${percent(computed)}`,
      );
    });
  }

  private async case23(): Promise<void> {
    let resultRow: string[] = [];
    await this.act('用例#23 查询 UID 17612704 2026-11-08 单日汇总', async () => {
      resultRow = (await this.querySummary('2026-11-08', '2026-11-08', '17612704'))[0] ?? [];
    });
    const detail = parseDetails(resultRow[2] ?? '');
    await this.uiCheck('用例#23-① Aladdin 段显示 input：466,800；output：437,612（93.75%）', 'case23-1-aladdin', async () => {
      return this.textCheck('input：466,800；output：437,612（93.75%）', detail.aladdin?.raw ?? '(无 Aladdin 段)');
    });
    await this.uiCheck('用例#23-② Multiplier 段显示 input：218,574；output：183,264（83.85%）', 'case23-2-multiplier', async () => {
      return this.textCheck('input：218,574；output：183,264（83.85%）', detail.multiplier?.raw ?? '(无 Multiplier 段)');
    });
    await this.uiCheck('用例#23-③ Magic Lamp 段显示 20,456', 'case23-3-lamp', async () => {
      return this.textCheck('20,456', detail.lampRaw ?? '(无 Magic Lamp 段)');
    });
  }

  private async case24(): Promise<void> {
    let resultRow: string[] = [];
    await this.act('用例#24 查询 UID 17612704 2026-11-08 单日汇总', async () => {
      resultRow = (await this.querySummary('2026-11-08', '2026-11-08', '17612704'))[0] ?? [];
    });
    await this.uiCheck('用例#24-① Dismantle 显示 317,189（67.95%）', 'case24-1-dismantle', async () => {
      return this.textCheck('317,189（67.95%）', resultRow[3] ?? '(无数据行)');
    });
    await this.uiCheck('用例#24-② Dismantle 金额占抽奖投入 67.95%', 'case24-2-formula', async () => {
      const detail = parseDetails(resultRow[2] ?? '');
      const dismantle = numberFrom(resultRow[3] ?? '');
      const input = detail.aladdin?.input ?? NaN;
      const ratio = (dismantle / input) * 100;
      return this.textCheck(
        '317189|466800|67.95',
        `${dismantle}|${input}|${ratio.toFixed(2)}`,
        `页面 Dismantle=${resultRow[3]}；Aladdin input=${segRaw(detail.aladdin, 'input')}；计算比例=${percent(ratio)}`,
      );
    });
  }

  private async case29(): Promise<void> {
    let resultRow: string[] = [];
    await this.act('用例#29 查询 UID 17612704 2026-11-08 单日汇总房间投入', async () => {
      resultRow = (await this.querySummary('2026-11-08', '2026-11-08', '17612704'))[0] ?? [];
    });
    const rooms = parseRooms(resultRow[4] ?? '');
    await this.uiCheck('用例#29-① 房间依次显示 ID=10100458: 278,400、ID=10101463: 140,000、ID=10100663: 48,400', 'case29-1-rooms', async () => {
      return this.textCheck(
        'ID=10100458: 278,400；ID=10101463: 140,000；ID=10100663: 48,400',
        rooms.map((room) => room.raw).join('；'),
      );
    });
    await this.uiCheck('用例#29-② 单元格仅包含 3 个房间条目', 'case29-2-count', async () => {
      return this.textCheck('3', String(rooms.length));
    });
    await this.uiCheck('用例#29-③ 三个房间金额按 278,400 > 140,000 > 48,400 降序', 'case29-3-order', async () => {
      const amounts = rooms.map((room) => room.amount);
      const descending = amounts.every((value, index) => index === 0 || amounts[index - 1] >= value);
      return this.textCheck('true', String(descending), `页面房间金额=${amounts.join(',')}`);
    });
  }

  private async case31(): Promise<void> {
    let resultRow: string[] = [];
    await this.act('用例#31 查询 UID 11925763 2026-10-02 十二房间样本', async () => {
      resultRow = (await this.querySummary('2026-10-02', '2026-10-02', '11925763'))[0] ?? [];
    });
    const rooms = parseRooms(resultRow[4] ?? '');
    await this.uiCheck('用例#31-① Top Spending Room 仅显示 10 个房间条目', 'case31-1-count', async () => {
      return this.textCheck('10', String(rooms.length));
    });
    await this.uiCheck('用例#31-② 10 个条目金额依次为 22,500、2,700、2,100、900、600、600、600、600、600、300', 'case31-2-amounts', async () => {
      return this.textCheck(
        '22,500、2,700、2,100、900、600、600、600、600、600、300',
        rooms.map((room) => room.amountText).join('、'),
      );
    });
    await this.uiCheck('用例#31-③ 每个条目均显示 ID=房间ID: 金额', 'case31-3-format', async () => {
      const pattern = /^ID=\d+: [\d,]+$/;
      const invalid = rooms.filter((room) => !pattern.test(room.raw)).map((room) => room.raw);
      return this.textCheck('全部符合', invalid.length === 0 ? '全部符合' : `不符合:${invalid.join('|')}`);
    });
  }

  private async case33(): Promise<void> {
    let resultRow: string[] = [];
    await this.act('用例#33 查询 UID 17612704 2026-11-02～2026-11-08 汇总', async () => {
      resultRow = (await this.querySummary('2026-11-02', '2026-11-08', '17612704'))[0] ?? [];
    });
    const detail = parseDetails(resultRow[2] ?? '');
    await this.uiCheck('用例#33-① P&L 显示 68,766 且等于五个有数据日期合计', 'case33-1-pnl', async () => {
      return this.textCheck('68,766', resultRow[0] ?? '(无数据行)');
    });
    await this.uiCheck('用例#33-② Aladdin 与 Magic Lamp 显示区间合计', 'case33-2-aladdin', async () => {
      const real = `${detail.aladdin?.raw ?? '(无 Aladdin 段)'}；Magic Lamp：${detail.lampRaw ?? '(无 Magic Lamp 段)'}`;
      return this.textCheck('input：2,978,230；output：3,028,238（101.68%）；Magic Lamp：128,197', real);
    });
    await this.uiCheck('用例#33-③ Multiplier 与 Dismantle 显示区间合计', 'case33-3-multiplier', async () => {
      const real = `${detail.multiplier?.raw ?? '(无 Multiplier 段)'}；Dismantle：${resultRow[3] ?? '(无 Dismantle)'}`;
      return this.textCheck('input：1,558,611；output：1,449,172（92.98%）；Dismantle：2,021,059（67.86%）', real);
    });
    await this.uiCheck('用例#33-④ RTP 显示 102.31% 且按区间合计计算', 'case33-4-rtp', async () => {
      return this.textCheck('102.31%', resultRow[1] ?? '(无数据行)');
    });
  }

  private async case35(): Promise<void> {
    const rows: Array<{ key: string; start: string; end: string; uid: string }> = [
      { key: 'A', start: '2026-11-02', end: '2026-11-08', uid: '17612690' },
      { key: 'B', start: '2026-01-01', end: '2026-01-02', uid: '17612704' },
    ];
    for (const data of rows) {
      const main = this.saveMainSession();
      const session = await this.newSession();
      try {
        this.useSession(session);
        let tableRows: string[][] = [];
        await this.act(`用例#35 数据行${data.key} 无数据查询 ${data.start}～${data.end} UID ${data.uid}`, async () => {
          tableRows = await this.querySummary(data.start, data.end, data.uid);
        });
        const resultRow = tableRows[0] ?? [];
        const detail = parseDetails(resultRow[2] ?? '');
        const rooms = parseRooms(resultRow[4] ?? '');
        await this.uiCheck(`用例#35-${data.key}-① 列表显示 1 行且 Total 1`, `case35-${data.key}-1-count`, async () => {
          const total = await this.totalCount();
          return this.textCheck('1 行|Total 1', `${tableRows.length} 行|Total ${total}`);
        });
        await this.uiCheck(`用例#35-${data.key}-② P&L 显示 0 且 RTP 显示 -`, `case35-${data.key}-2-pnl`, async () => {
          return this.textCheck('P&L=0；RTP=-', `P&L=${resultRow[0] ?? '(无)'}；RTP=${resultRow[1] ?? '(无)'}`);
        });
        await this.uiCheck(`用例#35-${data.key}-③ Aladdin 与 Multiplier 显示 input：0；output：0（-），Magic Lamp 显示 0`, `case35-${data.key}-3-details`, async () => {
          const real = `Aladdin=${detail.aladdin?.raw ?? 'null'}；Multiplier=${detail.multiplier?.raw ?? 'null'}；Magic Lamp=${detail.lampRaw ?? 'null'}`;
          return this.textCheck(
            'Aladdin=input：0；output：0（-）；Multiplier=input：0；output：0（-）；Magic Lamp=0',
            real,
          );
        });
        await this.uiCheck(`用例#35-${data.key}-④ Dismantle 显示 0（-）且无房间条目`, `case35-${data.key}-4-dismantle`, async () => {
          return this.textCheck('Dismantle=0（-）；房间条目=0', `Dismantle=${resultRow[3] ?? '(无)'}；房间条目=${rooms.length}`);
        });
      } finally {
        await session.close();
        this.restoreMainSession(main);
      }
    }
  }

  private async case46(): Promise<void> {
    let resultRow: string[] = [];
    await this.act('用例#46 查询 UID 17612704 2026-11-08 汇总数字格式', async () => {
      resultRow = (await this.querySummary('2026-11-08', '2026-11-08', '17612704'))[0] ?? [];
    });
    const detail = parseDetails(resultRow[2] ?? '');
    const rooms = parseRooms(resultRow[4] ?? '');
    await this.uiCheck('用例#46-① P&L、Aladdin、Magic Lamp 金额均带千分位', 'case46-1-moneys', async () => {
      const real = `P&L=${resultRow[0] ?? '(无)'}；Aladdin input：${segRaw(detail.aladdin, 'input')}；output：${segRaw(detail.aladdin, 'output')}；Magic Lamp=${detail.lampRaw ?? '(无)'}`;
      return this.textCheck('P&L=-44,042；Aladdin input：466,800；output：437,612；Magic Lamp=20,456', real);
    });
    await this.uiCheck('用例#46-② Multiplier 与 Dismantle 金额均带千分位', 'case46-2-moneys', async () => {
      const real = `Multiplier input：${segRaw(detail.multiplier, 'input')}；output：${segRaw(detail.multiplier, 'output')}；Dismantle=${resultRow[3] ?? '(无)'}`;
      return this.textCheck('Multiplier input：218,574；output：183,264；Dismantle=317,189', real);
    });
    await this.uiCheck('用例#46-③ 所有比例两位小数带 %', 'case46-3-ratios', async () => {
      const real = `RTP=${resultRow[1] ?? '(无)'}；Aladdin=${detail.aladdin?.ratio ?? '(无)'}；Multiplier=${detail.multiplier?.ratio ?? '(无)'}；Dismantle=${(resultRow[3] ?? '').match(/（([\d.]+%)）/)?.[1] ?? '(无)'}`;
      return this.textCheck('RTP=90.57%；Aladdin=93.75%；Multiplier=83.85%；Dismantle=67.95%', real);
    });
    await this.uiCheck('用例#46-④ Top Spending Room 金额均带千分位', 'case46-4-rooms', async () => {
      return this.textCheck('278,400、140,000、48,400', rooms.map((room) => room.amountText).join('、'));
    });
  }
}

await new SpinDrawSummaryTest().execute();
