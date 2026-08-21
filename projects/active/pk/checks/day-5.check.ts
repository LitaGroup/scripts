import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';
import { RankService, type RankItem } from '../../../../src/services/RankService.ts';

const BIZ = 'pk-v202608';
const DOC_URL = 'http://localhost:3000/api/documents/12.md';
const KEY_DAILY = '20260821';
const AWARD_LEAD_MS = 60_000;
const AWARD_WINDOW_MS = 3_600_000;

interface ExpectedAward {
  rankLo: number;
  rankHi: number;
  recipient: 'entity' | 'contributor';
  type: string;
  id: number;
}

interface Settlement {
  topic: string;
  locale: string;
  settleTime: string;
  key: string;
  configStage: string;
  n: number;
  bang: string;
  awardTop: number;
}

const SETTLEMENTS: Settlement[] = [
  { topic: 'player_100_50', locale: 'ko', settleTime: '2026-08-21T23:07:00+08:00', key: KEY_DAILY, configStage: '200进100-日榜', n: 100, bang: '陪玩榜', awardTop: 1 },
  { topic: 'player_100_50', locale: 'ph', settleTime: '2026-08-22T00:07:00+08:00', key: KEY_DAILY, configStage: '200进100-日榜', n: 100, bang: '陪玩榜', awardTop: 1 },
  { topic: 'player_100_50', locale: 'vi', settleTime: '2026-08-22T01:07:00+08:00', key: KEY_DAILY, configStage: '200进100-日榜', n: 100, bang: '陪玩榜', awardTop: 1 },
  { topic: 'player_in_200_100', locale: 'in', settleTime: '2026-08-22T01:07:00+08:00', key: KEY_DAILY, configStage: '200进100-日榜', n: 200, bang: '陪玩榜', awardTop: 1 },
];

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}
function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) throw new Error(`invalid numeric value: ${n}`);
  return str;
}
function quoteVal(v: number | string): string {
  return typeof v === 'number' ? quoteNum(v) : quoteStr(v);
}

function parseRankRange(s: string): [number, number] | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return [Number(m[1]), Number(m[2])];
  if (/^\d+$/.test(t)) return [Number(t), Number(t)];
  return null;
}

function recipientKind(target: string): 'entity' | 'contributor' | null {
  if (target.includes('陪玩')) return 'entity';
  if (target.includes('用户')) return 'contributor';
  return null;
}

function parseAwardConfig(md: string): Map<string, ExpectedAward[]> {
  const map = new Map<string, ExpectedAward[]>();
  const lines = md.split('\n');
  let started = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!started) {
      if (t.startsWith('|') && t.includes('序号') && t.includes('榜单')) started = true;
      continue;
    }
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').map((c) => c.trim());
    if (cells.length < 9) continue;
    const bang = cells[2];
    const stage = cells[3];
    const rank = cells[4];
    const target = cells[5];
    const idStr = cells[7];
    const type = cells[8];
    if (!bang || !bang.includes('陪玩')) continue;
    if (!stage || !stage.endsWith('-日榜')) continue;
    const rng = parseRankRange(rank);
    if (!rng) continue;
    const id = Number(idStr);
    if (!Number.isFinite(id)) continue;
    const recipient = recipientKind(target);
    if (!recipient) continue;
    const list = map.get(stage) ?? [];
    list.push({ rankLo: rng[0], rankHi: rng[1], recipient, type, id });
    map.set(stage, list);
  }
  return map;
}

function expectedForRank(list: ExpectedAward[], rank: number): ExpectedAward[] {
  return list.filter((e) => rank >= e.rankLo && rank <= e.rankHi);
}

class Day5Check extends CheckBaseClass {
  private rank = new RankService('prod');
  private awardConfig: Map<string, ExpectedAward[]> | null = null;

  constructor() {
    super();
    const now = Date.now();
    this.total = 1 + SETTLEMENTS.reduce((acc, s) => acc + (now < Date.parse(s.settleTime) ? 1 : 4), 0);
  }

  protected async run(): Promise<void> {
    await this.act('获取奖励配置文档 12.md', async () => {
      const res = await fetch(DOC_URL, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const md = await res.text();
      this.awardConfig = parseAwardConfig(md);
      const summary = [...this.awardConfig.entries()].map(([k, v]) => `${k}:${v.length}`).join(', ');
      this.log(`日榜奖励配置解析完成 — ${summary}`);
    });

    for (const s of SETTLEMENTS) {
      await this.checkSettlement(s);
    }
  }

  private async checkSettlement(s: Settlement): Promise<void> {
    const title = `${s.topic} / ${s.locale} / key=${s.key}`;
    const settleMs = Date.parse(s.settleTime);

    if (Date.now() < settleMs) {
      await this.act(`[${title}] 结算时间预检`, () => {
        this.skip(`未到结算时间 ${s.settleTime}`);
      });
      return;
    }

    let rankList: RankItem[] = [];
    let awardSet: Set<string> | null = null;

    await this.check(`[${title}] 结算状态 status=200`, async (): Promise<CheckResult> => {
      const r = await MySQLProdResource.query(
        'active',
        `select status from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(s.topic)} and ${'`key`'}=${quoteStr(s.key)} and locale=${quoteStr(s.locale)} limit 1`,
      );
      if (r.data.length === 0) return { expect: '200', real: '(无记录)', pass: false };
      const status = Number(r.data[0][0]);
      return { expect: '200', real: String(status), pass: status === 200 };
    });

    await this.act(`[${title}] 获取前 ${s.n} 名日榜`, async () => {
      const rr = await this.rank.queryRank(BIZ, s.topic, s.key, s.n, s.locale);
      rankList = rr.list;
      this.log(`round.status=${rr.round.status}, 实际 ${rankList.length} 名 (round.finish=${new Date(rr.round.finishTime).toISOString()})`);
      if (rankList.length === 0) throw new Error('榜单为空');
    });

    await this.act(`[${title}] 获取发奖记录`, async () => {
      const cfg = this.awardConfig?.get(s.configStage) ?? [];
      const hasContributor = cfg.some((e) => e.recipient === 'contributor');
      const top = rankList.slice(0, s.awardTop);
      const ids: string[] = [];
      for (const it of top) {
        ids.push(it.player);
        if (hasContributor && it.contributors[0]) ids.push(it.contributors[0].player);
      }
      if (ids.length === 0) throw new Error('无可核查对象');
      const inList = ids.map((id) => quoteVal(id)).join(', ');
      const r = await MySQLProdResource.query(
        'active',
        `select player, award_type, award_id from mod_common_award_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(s.topic)} and player in (${inList}) and create_time between ${quoteNum(settleMs - AWARD_LEAD_MS)} and ${quoteNum(settleMs + AWARD_WINDOW_MS)}`,
      );
      awardSet = new Set();
      for (const row of r.data) {
        awardSet.add(`${row[0]}|${row[1]}|${row[2]}`);
      }
      this.log(`对象 ${ids.length} 个，发奖记录 ${r.data.length} 条`);
    });

    await this.check(`[${title}] 发奖符合预期`, async (): Promise<CheckResult> => {
      if (!this.awardConfig) this.skip('奖励配置未获取');
      const cfg = this.awardConfig!.get(s.configStage);
      if (!cfg || cfg.length === 0) this.skip(`无 ${s.configStage} 奖励配置`);
      if (!awardSet) this.skip('发奖记录未获取');
      const top = rankList.slice(0, s.awardTop);
      let missing = 0;
      let checked = 0;
      const detail: string[] = [];
      for (const it of top) {
        const exp = expectedForRank(cfg!, it.rank);
        for (const e of exp) {
          let recipientId: string;
          if (e.recipient === 'entity') {
            recipientId = it.player;
          } else {
            const c = it.contributors[0]?.player;
            if (!c) continue;
            recipientId = c;
          }
          checked++;
          if (!awardSet!.has(`${recipientId}|${e.type}|${e.id}`)) {
            missing++;
            if (detail.length < 3) detail.push(`rank${it.rank}缺${e.type}#${e.id}`);
          }
        }
      }
      const pass = checked > 0 && missing === 0;
      return {
        expect: `核对 ${checked} 项道具全部发放`,
        real: missing === 0 ? `全部发放 (${checked})` : `缺失 ${missing}/${checked}${detail.length ? ': ' + detail.join('; ') : ''}`,
        pass,
      };
    });
  }
}

await new Day5Check().execute();
