import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';

const BIZ = 'pk-v202608';
const SETTLE_DELAY_MS = 45 * 60_000; // 结算时间 = 轮次结束 + 45min（17:45 / 23:45 本地）
const AWARD_WINDOW_MS = 3_600_000; // 发奖时间窗：结算后 1 小时内
const STAGE_DAYS = ['2026-08-23', '2026-08-24', '2026-08-25']; // 第三阶段日期（3天）
const ROUND_HOURS = [0, 18] as const; // 每天两轮：00:00-17:00 / 18:00-23:00 本地
const ROUND_COUNT = STAGE_DAYS.length * ROUND_HOURS.length; // 6 轮

interface PkLocale {
  locale: string;
  tz: string; // 本地时区偏移，如 '+07:00'
  topic: string; // 1v1 阶段 topic
  whitelistTopic: string; // 白名单（上一阶段晋级名单）topic
}

const PK_LOCALES: PkLocale[] = [
  { locale: 'ko', tz: '+09:00', topic: 'player_1v1_50_20', whitelistTopic: 'player_100_50' },
  { locale: 'ph', tz: '+08:00', topic: 'player_1v1_50_20', whitelistTopic: 'player_100_50' },
  { locale: 'vi', tz: '+07:00', topic: 'player_1v1_50_20', whitelistTopic: 'player_100_50' },
  { locale: 'in', tz: '+07:00', topic: 'player_in_1v1_100_46', whitelistTopic: 'player_in_200_100' },
];

// 每个大区的检查项数量（用于 start.total）：2 个 act + 每轮 3 项 check（状态/发奖/对阵表）
const LOCALE_CHECK_COUNT = 2 + ROUND_COUNT * 3;

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}
function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) throw new Error(`invalid numeric value: ${n}`);
  return str;
}

function tzOffsetMs(tz: string): number {
  const m = tz.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`invalid tz: ${tz}`);
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return (m[1] === '+' ? 1 : -1) * mins * 60_000;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface RoundSpec {
  key: string; // yyyyMMddHH（开始时间，本地）
  startMs: number;
  finishMs: number;
  settleMs: number;
}

function roundSpecs(p: PkLocale): RoundSpec[] {
  const off = tzOffsetMs(p.tz);
  const specs: RoundSpec[] = [];
  for (const day of STAGE_DAYS) {
    const [y, m, d] = day.split('-').map(Number);
    for (const hh of ROUND_HOURS) {
      const startMs = Date.UTC(y, m - 1, d, hh) - off;
      const finishMs = Date.UTC(y, m - 1, d, hh === 0 ? 17 : 23) - off;
      specs.push({
        key: `${y}${pad2(m)}${pad2(d)}${pad2(hh)}`,
        startMs,
        finishMs,
        settleMs: finishMs + SETTLE_DELAY_MS,
      });
    }
  }
  return specs.sort((a, b) => a.startMs - b.startMs);
}

// 期望状态：已结算=200，进行中=100，未开始=0
function expectedStatus(spec: RoundSpec, now: number): number {
  if (now >= spec.settleMs) return 200;
  if (now >= spec.startMs) return 100;
  return 0;
}

interface LocaleData {
  whitelistCount: number;
  roundStatus: Map<string, number>; // key -> status
  pairCounts: Map<string, number>; // key -> 对阵条数
  winners: Map<string, string[]>; // key -> winner 列表（不含平局 winner=0）
  awardedPlayers: Set<string>; // 已结算轮次时间窗内有发奖记录的 player
}

class Day7Check extends CheckBaseClass {
  constructor() {
    super();
    this.total = PK_LOCALES.length * LOCALE_CHECK_COUNT;
  }

  protected async run(): Promise<void> {
    for (const p of PK_LOCALES) {
      await this.checkLocale(p);
    }
  }

  private async checkLocale(p: PkLocale): Promise<void> {
    const title = `陪玩榜 ${p.topic} / ${p.locale}`;
    const now = Date.now();
    const specs = roundSpecs(p);
    const settled = specs.filter((s) => now >= s.settleMs);
    const data: LocaleData = {
      whitelistCount: 0,
      roundStatus: new Map(),
      pairCounts: new Map(),
      winners: new Map(),
      awardedPlayers: new Set(),
    };

    // 1. 获取白名单（上一阶段晋级名单）数量
    await this.act(`[${title}] 获取白名单数量`, async () => {
      const r = await MySQLProdResource.query(
        'active',
        `select count(*) from mod_common_player_list where biz=${quoteStr(BIZ)} and ${'`key`'}=${quoteStr(p.whitelistTopic)} and locale=${quoteStr(p.locale)}`,
      );
      data.whitelistCount = Number(r.data[0]?.[0] ?? 0);
      this.log(`白名单(${p.whitelistTopic}) ${data.whitelistCount} 人`);
      if (data.whitelistCount === 0) throw new Error('白名单为空');
    });

    // 2. 获取 PK 轮次、对阵与发奖数据
    await this.act(`[${title}] 获取PK轮次与对阵数据`, async () => {
      const rr = await MySQLProdResource.query(
        'active',
        `select ${'`key`'}, status from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.topic)} and ${'`key`'} != '-' and locale=${quoteStr(p.locale)}`,
      );
      for (const row of rr.data) data.roundStatus.set(String(row[0]), Number(row[1]));

      const pr = await MySQLProdResource.query(
        'active',
        `select ${'`key`'}, count(*) from mod_buff11pk_pair where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.topic)} and locale=${quoteStr(p.locale)} group by ${'`key`'}`,
      );
      for (const row of pr.data) data.pairCounts.set(String(row[0]), Number(row[1]));

      const wr = await MySQLProdResource.query(
        'active',
        `select ${'`key`'}, winner from mod_buff11pk_pair where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.topic)} and locale=${quoteStr(p.locale)} and winner > 0`,
      );
      for (const row of wr.data) {
        const list = data.winners.get(String(row[0])) ?? [];
        list.push(String(row[1]));
        data.winners.set(String(row[0]), list);
      }

      if (settled.length > 0) {
        const allWinners = [...new Set(settled.flatMap((s) => data.winners.get(s.key) ?? []))];
        if (allWinners.length > 0) {
          const lo = Math.min(...settled.map((s) => s.finishMs));
          const hi = Math.max(...settled.map((s) => s.settleMs)) + AWARD_WINDOW_MS;
          const ar = await MySQLProdResource.query(
            'active',
            `select distinct player from mod_common_award_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.topic)} and player in (${allWinners.map(quoteNum).join(', ')}) and create_time between ${quoteNum(lo)} and ${quoteNum(hi)}`,
          );
          for (const row of ar.data) data.awardedPlayers.add(String(row[0]));
        }
      }
      this.log(
        `轮次 ${data.roundStatus.size} 个，对阵轮次 ${data.pairCounts.size} 个，已结算 ${settled.length} 个，发奖对象 ${data.awardedPlayers.size} 人`,
      );
    });

    // 3. 逐轮检查（第三阶段 3 天 × 每天 2 轮）
    for (const s of specs) {
      // 3.1 轮次状态：200=已结算 / 100=进行中 / 0=未初始化
      await this.check(`[${title}] 轮次 ${s.key} 状态`, async (): Promise<CheckResult> => {
        const expect = expectedStatus(s, now);
        const actual = data.roundStatus.get(s.key);
        return {
          expect: String(expect),
          real: actual === undefined ? '(无记录)' : String(actual),
          pass: actual === expect,
        };
      });

      // 3.2 已结算轮次的发奖检查（给 winner 发奖）
      await this.check(`[${title}] 轮次 ${s.key} 发奖`, async (): Promise<CheckResult> => {
        if (now < s.settleMs) this.skip(`未到结算时间 ${new Date(s.settleMs).toISOString()}`);
        const winners = data.winners.get(s.key) ?? [];
        if (winners.length === 0) {
          return { expect: 'winner>0', real: '无winner记录', pass: false };
        }
        const missing = winners.filter((w) => !data.awardedPlayers.has(w));
        const pass = missing.length === 0;
        return {
          expect: `${winners.length} 名 winner 全部有发奖记录`,
          real: pass
            ? `全部发放 (${winners.length})`
            : `缺失 ${missing.length}/${winners.length}(${missing.slice(0, 3).join(',')}${missing.length > 3 ? '...' : ''})`,
          pass,
        };
      });

      // 3.3 新轮次对阵表生成检查（对阵人数与白名单一致）
      await this.check(`[${title}] 轮次 ${s.key} 对阵表`, async (): Promise<CheckResult> => {
        if (now < s.startMs) this.skip(`未到开始时间 ${new Date(s.startMs).toISOString()}`);
        if (data.whitelistCount === 0) this.skip('白名单为空');
        const pairs = data.pairCounts.get(s.key);
        const players = pairs === undefined ? 0 : pairs * 2;
        const pass = pairs !== undefined && players === data.whitelistCount;
        return {
          expect: `对阵人数=白名单 ${data.whitelistCount} 人`,
          real: pairs === undefined ? '(无对阵数据)' : `${pairs} 对 (${players} 人)`,
          pass,
        };
      });
    }
  }
}

await new Day7Check().execute();
