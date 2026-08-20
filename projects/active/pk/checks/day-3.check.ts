import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';
import { RankService, type RankItem } from '../../../../src/services/RankService.ts';
import { PlayerService } from '../../../../src/services/PlayerService.ts';

const BIZ = 'pk-v202608';
const DOC_URL = 'http://localhost:3000/api/documents/12.md';
const SCORE_TOLERANCE = 1.0;
const KEY_TOTAL = '-';

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
  n: number;
  bang: string;
  awardTop: number;
}

const SETTLEMENTS: Settlement[] = [
  { topic: 'player_n_100', locale: 'ko', settleTime: '2026-08-19T22:37:00+08:00', n: 100, bang: '陪玩榜', awardTop: 10 },
  { topic: 'player_n_100', locale: 'ph', settleTime: '2026-08-19T23:37:00+08:00', n: 100, bang: '陪玩榜', awardTop: 10 },
  { topic: 'player_n_100', locale: 'vi', settleTime: '2026-08-20T00:37:00+08:00', n: 100, bang: '陪玩榜', awardTop: 10 },
  { topic: 'player_in_n_200', locale: 'in', settleTime: '2026-08-20T00:37:00+08:00', n: 200, bang: '陪玩榜', awardTop: 10 },
  { topic: 'room_in_n_200', locale: 'in', settleTime: '2026-08-20T00:37:00+08:00', n: 200, bang: '房间榜', awardTop: 3 },
  { topic: 'family_in_n_200', locale: 'in', settleTime: '2026-08-20T00:37:00+08:00', n: 200, bang: '家族榜', awardTop: 3 },
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

function matchBang(bang: string, target: string): boolean {
  if (target === '陪玩榜') return bang.includes('陪玩');
  if (target === '房间榜') return bang.includes('间榜');
  if (target === '家族榜') return bang.includes('家族');
  return false;
}

function recipientKind(bang: string, target: string): 'entity' | 'contributor' | null {
  if (bang.includes('陪玩')) return target.includes('陪玩') ? 'entity' : target.includes('用户') ? 'contributor' : null;
  if (bang.includes('间榜')) return target.includes('房间') ? 'entity' : target.includes('用户') ? 'contributor' : null;
  if (bang.includes('家族')) return target.includes('家族') ? 'entity' : null;
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
    if (!bang || stage !== 'N进200-总榜') continue;
    const rng = parseRankRange(rank);
    if (!rng) continue;
    const id = Number(idStr);
    if (!Number.isFinite(id)) continue;
    for (const target_bang of ['陪玩榜', '房间榜', '家族榜']) {
      if (!matchBang(bang, target_bang)) continue;
      const recipient = recipientKind(bang, target);
      if (!recipient) continue;
      const list = map.get(target_bang) ?? [];
      list.push({ rankLo: rng[0], rankHi: rng[1], recipient, type, id });
      map.set(target_bang, list);
    }
  }
  return map;
}

function expectedForRank(list: ExpectedAward[], rank: number): ExpectedAward[] {
  return list.filter((e) => rank >= e.rankLo && rank <= e.rankHi);
}

interface FamilyAwardState {
  families: { id: string; members: string[] }[];
  awarded: Set<string>;
  spec: { type: string; id: number };
}

class Day3Check extends CheckBaseClass {
  private rank = new RankService('prod');
  private player = new PlayerService('prod');
  private awardConfig: Map<string, ExpectedAward[]> | null = null;

  constructor() {
    super();
    this.total = 1 + SETTLEMENTS.length * 6;
  }

  protected async run(): Promise<void> {
    await this.act('获取奖励配置文档 12.md', async () => {
      const res = await fetch(DOC_URL, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const md = await res.text();
      this.awardConfig = parseAwardConfig(md);
      const summary = [...this.awardConfig.entries()].map(([k, v]) => `${k}:${v.length}`).join(', ');
      this.log(`奖励配置解析完成 — ${summary}`);
    });

    for (const s of SETTLEMENTS) {
      await this.checkSettlement(s);
    }
  }

  private async checkSettlement(s: Settlement): Promise<void> {
    const title = `${s.topic} / ${s.locale}`;
    let statusRow: { status: number } | null = null;
    let rankList: RankItem[] = [];
    let awardSet: Set<string> | null = null;
    let familyAward: FamilyAwardState | null = null;
    let playerList: { player: string; score: number }[] = [];
    let rankSnapshot: Map<string, number> = new Map();

    await this.check(`[${title}] 结算状态 status=200`, async (): Promise<CheckResult> => {
      const r = await MySQLProdResource.query(
        'active',
        `select status from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(s.topic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(s.locale)} limit 1`,
      );
      if (r.data.length === 0) return { expect: '200', real: '(无记录)', pass: false };
      statusRow = { status: Number(r.data[0][0]) };
      return { expect: '200', real: String(statusRow.status), pass: statusRow.status === 200 };
    });

    await this.act(`[${title}] 获取前 ${s.n} 名榜单`, async () => {
      const rr = await this.rank.queryRank(BIZ, s.topic, KEY_TOTAL, s.n, s.locale);
      rankList = rr.list;
      this.log(`round.status=${rr.round.status}, 实际 ${rankList.length} 名 (round.finish=${new Date(rr.round.finishTime).toISOString()})`);
      if (rankList.length === 0) throw new Error('榜单为空');
    });

    await this.act(`[${title}] 获取发奖实际发放记录`, async () => {
      if (s.bang === '家族榜') {
        if (!this.awardConfig) throw new Error('奖励配置未获取');
        const cfg = this.awardConfig.get(s.bang) ?? [];
        const spec = cfg[0] ? { type: cfg[0].type, id: cfg[0].id } : { type: 'NAMEPLATE', id: 8473 };
        const families: { id: string; members: string[] }[] = [];
        const allMembers: string[] = [];
        for (const it of rankList.slice(0, s.awardTop)) {
          const members = await this.player.getMembersOfFamily(it.player);
          families.push({ id: it.player, members });
          for (const m of members) allMembers.push(m);
        }
        if (allMembers.length === 0) throw new Error('无可核查成员');
        const inList = allMembers.map((id) => quoteVal(id)).join(', ');
        const r = await MySQLProdResource.query(
          'active',
          `select distinct player from mod_common_award_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(s.topic)} and award_type=${quoteStr(spec.type)} and award_id=${quoteNum(spec.id)} and player in (${inList})`,
        );
        const awarded = new Set(r.data.map((row) => String(row[0])));
        familyAward = { families, awarded, spec };
        this.log(`家族 ${families.length} 个，成员 ${allMembers.length} 名，已发放 ${awarded.size} 名`);
        return;
      }
      const top = rankList.slice(0, s.awardTop);
      const ids: string[] = [];
      for (const it of top) {
        ids.push(it.player);
        if (it.contributors[0]) ids.push(it.contributors[0].player);
      }
      if (ids.length === 0) throw new Error('无可核查对象');
      const inList = ids.map((id) => quoteVal(id)).join(', ');
      const r = await MySQLProdResource.query(
        'active',
        `select player, award_type, award_id from mod_common_award_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(s.topic)} and player in (${inList})`,
      );
      awardSet = new Set();
      for (const row of r.data) {
        awardSet.add(`${row[0]}|${row[1]}|${row[2]}`);
      }
      this.log(`对象 ${ids.length} 个，发奖记录 ${r.data.length} 条`);
    });

    await this.check(`[${title}] 发奖符合预期`, async (): Promise<CheckResult> => {
      if (!this.awardConfig) this.skip('奖励配置未获取');
      if (s.bang === '家族榜') {
        if (!familyAward) this.skip('发奖记录未获取');
        let missing = 0;
        let total = 0;
        const detail: string[] = [];
        for (const f of familyAward!.families) {
          for (const m of f.members) {
            total++;
            if (!familyAward!.awarded.has(m)) {
              missing++;
              if (detail.length < 3) detail.push(`${f.id}的${m}`);
            }
          }
        }
        const pass = total > 0 && missing === 0;
        return {
          expect: `核对 ${total} 名成员全部发放 ${familyAward!.spec.type}#${familyAward!.spec.id}`,
          real: missing === 0 ? `全部发放 (${total})` : `缺失 ${missing}/${total}${detail.length ? ': ' + detail.join('; ') : ''}`,
          pass,
        };
      }
      if (!awardSet) this.skip('发奖记录未获取');
      const cfg = this.awardConfig!.get(s.bang) ?? [];
      const top = rankList.slice(0, s.awardTop);
      let missing = 0;
      let checked = 0;
      const detail: string[] = [];
      for (const it of top) {
        const exp = expectedForRank(cfg, it.rank);
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

    await this.act(`[${title}] 获取入围名单与榜单快照`, async () => {
      const [pl, snap] = await Promise.all([
        MySQLProdResource.query(
          'active',
          `select player, score from mod_common_player_list where biz=${quoteStr(BIZ)} and ${'`key`'}=${quoteStr(s.topic)} and locale=${quoteStr(s.locale)} order by score desc`,
        ),
        MySQLProdResource.query(
          'active',
          `select player, max(total_amount) from mod_common_rank_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(s.topic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(s.locale)} group by player`,
        ),
      ]);
      playerList = pl.data.map((row) => ({ player: String(row[0]), score: Number(row[1]) }));
      for (const row of snap.data) rankSnapshot.set(String(row[0]), Number(row[1]));
      this.log(`入围 ${playerList.length} 名，榜单快照 ${rankSnapshot.size} 名`);
    });

    await this.check(`[${title}] 入围名单与榜单一致`, async (): Promise<CheckResult> => {
      if (playerList.length === 0) this.skip('入围名单为空');
      let inconsistent = 0;
      let notInRank = 0;
      const detail: string[] = [];
      for (const p of playerList) {
        const amt = rankSnapshot.get(p.player);
        if (amt === undefined) {
          notInRank++;
          if (detail.length < 3) detail.push(`${p.player}未上榜`);
          continue;
        }
        if (Math.abs(p.score - amt) > SCORE_TOLERANCE) {
          inconsistent++;
          if (detail.length < 3) detail.push(`${p.player}分数不一致(${p.score}≠${amt})`);
        }
      }
      const ok = notInRank === 0 && inconsistent === 0;
      return {
        expect: `入围 ${playerList.length} 名全部上榜且分数一致`,
        real: ok
          ? `全部一致 (${playerList.length})`
          : `未上榜 ${notInRank}，分数不一致 ${inconsistent}${detail.length ? ': ' + detail.join('; ') : ''}`,
        pass: ok,
      };
    });
  }
}

await new Day3Check().execute();
