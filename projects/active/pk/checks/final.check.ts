import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';
import { PlayerService } from '../../../../src/services/PlayerService.ts';
import { RankService, type RankItem } from '../../../../src/services/RankService.ts';

const BIZ = 'pk-v202608';
const DOC_URL = 'http://project.cinta.team/api/documents/3.md';
const KEY_TOTAL = '-';
const END_MS = Date.parse('2026-08-29T23:59:59+08:00'); // 各榜单结束时间（北京时间）
const SETTLE_MAX_DELAY_MS = 40 * 60_000; // 结算须在轮次结束后 40min 内完成（00:35~00:40 窗口期内允许未完成）
const AWARD_QUERY_FROM_MS = END_MS - 60_000; // 发奖记录查询窗口：活动结束后
const AWARD_QUERY_TO_MS = END_MS + 3 * 3_600_000;
const TOP_N = 3; // 决赛奖励覆盖前 3 名
const RANK_FETCH = 10; // 榜单拉取数量（含并列，按 rank<=3 过滤）

type Bang = '房间榜' | '陪玩榜' | '家族榜' | '用户榜' | 'CP榜';
type Recipient = 'entity' | 'contributor' | 'members' | 'male' | 'female';

interface FinalTopic {
  bang: Bang;
  topic: string;
  locales: string[];
  stage: string; // 奖励配置文档中的阶段名
  entityType: string; // 榜单本体（entity）发奖记录的 player_type
}

const FINAL_TOPICS: FinalTopic[] = [
  { bang: '陪玩榜', topic: 'player_in_20_1', locales: ['in'], stage: '决赛总榜', entityType: 'USER' },
  { bang: '陪玩榜', topic: 'player_10_1', locales: ['vi', 'ko', 'ph'], stage: '决赛总榜', entityType: 'USER' },
  { bang: '房间榜', topic: 'room_in_10_1', locales: ['in'], stage: '决赛总榜', entityType: 'ROOM' },
  { bang: '房间榜', topic: 'room', locales: ['vi', 'ko', 'ph'], stage: '决赛总榜', entityType: 'ROOM' },
  { bang: '家族榜', topic: 'family_in_10_1', locales: ['in'], stage: '总榜', entityType: 'FAMILY' },
  { bang: '家族榜', topic: 'family', locales: ['vi', 'ko', 'ph'], stage: '总榜', entityType: 'FAMILY' },
  { bang: '用户榜', topic: 'user', locales: ['vi', 'ko', 'ph', 'in'], stage: '总榜', entityType: 'USER' },
  { bang: 'CP榜', topic: 'couple', locales: ['vi', 'ko', 'ph', 'in'], stage: '总榜', entityType: 'USER' },
];

const PAIR_COUNT = FINAL_TOPICS.reduce((n, t) => n + t.locales.length, 0);

interface ExpectedAward {
  rankLo: number;
  rankHi: number;
  recipient: Recipient;
  type: string;
  id: number; // COIN 等无道具 ID 的记为 -1
  count: number;
  days: number; // -1 = 永久（发奖记录 expire_second=0）
  locale: string; // '' = 通用
}

interface RoundRow {
  key: string;
  status: number;
  finishMs: number;
}

interface AwardRec {
  player: string;
  playerType: string;
  awardType: string;
  awardId: number;
  awardCount: number;
  expireSecond: number;
}

interface ResolvedPlayer {
  id: string;
  playerType: string;
}

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}
function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) throw new Error(`invalid numeric value: ${n}`);
  return str;
}

function parseRankRange(s: string): [number, number] | null {
  const t = (s ?? '').trim();
  const m = t.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) return [Number(m[1]), Number(m[2])];
  if (/^\d+$/.test(t)) return [Number(t), Number(t)];
  return null;
}

function matchBang(cell: string): Bang | null {
  const c = (cell ?? '').replace(/\s/g, '');
  if (c.includes('CP')) return 'CP榜';
  if (c.includes('房间')) return '房间榜';
  if (c.includes('陪玩') || c.includes('陪陪')) return '陪玩榜';
  if (c.includes('家族')) return '家族榜';
  if (c === '用户榜') return '用户榜';
  return null;
}

function recipientOf(bang: Bang, target: string): Recipient | null {
  const t = (target ?? '').replace(/\s/g, '');
  switch (bang) {
    case '房间榜':
      return t.includes('房间') ? 'entity' : t.includes('用户') ? 'contributor' : null;
    case '陪玩榜':
      return t.includes('陪玩') || t.includes('陪陪') ? 'entity' : t.includes('用户') ? 'contributor' : null;
    case '家族榜':
      return t.includes('家族内') ? 'members' : t.includes('家族') ? 'entity' : null;
    case '用户榜':
      return t.includes('用户') ? 'entity' : null;
    case 'CP榜':
      return t.includes('男') ? 'male' : t.includes('女') ? 'female' : null;
  }
}

// 非后台自动发放的奖励类型（BANNER/弹窗/限定礼物为手动或配置型奖励，不在发奖记录中核对）
const IGNORED_TYPES = new Set(['BANNER', 'CONFIG-BANNER', 'GIFT']);

// 解析奖励配置文档，返回 Map<`${榜单}|${阶段}`, ExpectedAward[]>
// 列：| 序号 | 榜单 | 阶段 | 名次 | 发放对象 | 道具 | ID | 类型 | 个数 | 天数 | ... | 大区 |
function parseAwardDoc(md: string, stages: Set<string>): Map<string, ExpectedAward[]> {
  const map = new Map<string, ExpectedAward[]>();
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 16) continue;
    const bang = matchBang(cells[2]);
    if (!bang) continue;
    const stage = cells[3];
    if (!stages.has(stage)) continue;
    const rng = parseRankRange(cells[4]);
    if (!rng) continue;
    const recipient = recipientOf(bang, cells[5]);
    if (!recipient) continue;
    const type = (cells[8] ?? '').toUpperCase();
    if (!type || IGNORED_TYPES.has(type)) continue;
    const id = cells[7] === '' ? -1 : Number(cells[7]);
    if (!Number.isFinite(id)) continue;
    const count = Number(cells[9]);
    if (!Number.isFinite(count)) continue;
    const days = Number(cells[10]);
    if (!Number.isFinite(days)) continue;
    const key = `${bang}|${stage}`;
    const list = map.get(key) ?? [];
    list.push({ rankLo: rng[0], rankHi: rng[1], recipient, type, id, count, days, locale: cells[15] ?? '' });
    map.set(key, list);
  }
  return map;
}

function awardRecKey(r: AwardRec): string {
  return `${r.player}|${r.playerType}|${r.awardType}|${r.awardId}|${r.awardCount}|${r.expireSecond}`;
}

class FinalCheck extends CheckBaseClass {
  private rank = new RankService('prod');
  private player = new PlayerService('prod');
  private awardCfg: Map<string, ExpectedAward[]> | null = null;
  private memberCache = new Map<string, string[]>();

  constructor() {
    super();
    this.total = 1 + PAIR_COUNT * 4; // 1 个配置 act + 每个榜单×大区：1 act + 3 check
  }

  protected async run(): Promise<void> {
    await this.act('获取奖励配置文档 3.md', async () => {
      const res = await fetch(DOC_URL, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const md = await res.text();
      this.awardCfg = parseAwardDoc(md, new Set(FINAL_TOPICS.map((t) => t.stage)));
      const summary = [...this.awardCfg.entries()].map(([k, v]) => `${k}:${v.length}`).join(', ');
      this.log(`奖励配置解析完成 — ${summary}`);
    });

    for (const t of FINAL_TOPICS) {
      for (const locale of t.locales) {
        await this.checkTopic(t, locale);
      }
    }
  }

  private cfgFor(t: FinalTopic): ExpectedAward[] {
    if (!this.awardCfg) this.skip('奖励配置未获取');
    const cfg = this.awardCfg.get(`${t.bang}|${t.stage}`);
    if (!cfg || cfg.length === 0) this.skip(`无 ${t.bang} ${t.stage} 奖励配置`);
    return cfg;
  }

  private async membersOf(familyId: string): Promise<string[]> {
    let members = this.memberCache.get(familyId);
    if (!members) {
      members = await this.player.getMembersOfFamily(familyId);
      this.memberCache.set(familyId, members);
    }
    return members;
  }

  // 解析奖励发放对象：
  // - entity：榜单本体（房间/家族/陪陪/用户），player_type 按榜单类型
  // - contributor：贡献 top1 用户（榜单接口 contributors[0]），player_type=USER
  // - members：家族内所有成员，player_type=USER
  // - male/female：CP 双方，player_type=USER；女方 = coupleId / 1e10，男方 = contributors[0]
  //   （同一人组 CP 时实际只发一套男方奖励，女方跳过）
  private async resolveRecipients(
    t: FinalTopic,
    it: RankItem,
    recipient: Recipient,
  ): Promise<ResolvedPlayer[]> {
    switch (recipient) {
      case 'entity':
        return [{ id: it.player, playerType: t.entityType }];
      case 'contributor':
      case 'male':
        return it.contributors[0] ? [{ id: it.contributors[0].player, playerType: 'USER' }] : [];
      case 'members':
        return (await this.membersOf(it.player)).map((m) => ({ id: m, playerType: 'USER' }));
      case 'female': {
        const female = String(BigInt(it.player) / 10_000_000_000n);
        if (it.contributors[0]?.player === female) return []; // 同一人 CP 只发一套（男方）
        return [{ id: female, playerType: 'USER' }];
      }
    }
  }

  private expectedAwardsOf(cfg: ExpectedAward[], rank: number, locale: string): ExpectedAward[] {
    return cfg.filter((e) => rank >= e.rankLo && rank <= e.rankHi && (e.locale === '' || e.locale === locale));
  }

  // 结算门禁：总榜 round 未结算时，窗口期内 skip、过了最终时限 fail
  private gateSettled(rounds: RoundRow[], now: number): CheckResult | null {
    const total = rounds.find((r) => r.key === KEY_TOTAL);
    if (!total) return { expect: '总榜 round 已结算(status=200)', real: '(无总榜 round 记录)', pass: false };
    if (total.status === 200) return null;
    const deadline = new Date(total.finishMs + SETTLE_MAX_DELAY_MS).toISOString();
    if (now >= total.finishMs + SETTLE_MAX_DELAY_MS) {
      return { expect: '总榜 round 已结算(status=200)', real: `status=${total.status}（已过时限 ${deadline}）`, pass: false };
    }
    this.skip(`结算窗口期内（${deadline} 前完成即可），当前 status=${total.status}`);
  }

  private async checkTopic(t: FinalTopic, locale: string): Promise<void> {
    const title = `${t.bang} ${t.topic} / ${locale}`;
    const now = Date.now();
    let rounds: RoundRow[] = [];
    let rankList: RankItem[] = [];
    let records: AwardRec[] = [];

    await this.act(`[${title}] 获取轮次/榜单/发奖数据`, async () => {
      const rr = await MySQLProdResource.query(
        'active',
        `select ${'`key`'}, status, finish_time from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(t.topic)} and locale=${quoteStr(locale)}`,
      );
      rounds = rr.data.map((row) => ({ key: String(row[0]), status: Number(row[1]), finishMs: Number(row[2]) }));

      const rankRes = await this.rank.queryRank(BIZ, t.topic, KEY_TOTAL, RANK_FETCH, locale);
      rankList = rankRes.list.filter((it) => it.rank <= TOP_N);

      const ar = await MySQLProdResource.query(
        'active',
        `select player, player_type, award_type, award_id, award_count, expire_second from mod_common_award_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(t.topic)} and create_time between ${quoteNum(AWARD_QUERY_FROM_MS)} and ${quoteNum(AWARD_QUERY_TO_MS)}`,
      );
      records = ar.data.map((row) => ({
        player: String(row[0]),
        playerType: String(row[1]),
        awardType: String(row[2]),
        awardId: Number(row[3]),
        awardCount: Number(row[4]),
        expireSecond: Number(row[5]),
      }));
      this.log(
        `round ${rounds.length} 个，前${TOP_N}名 ${rankList.length} 个（含并列），发奖记录 ${records.length} 条` +
          (t.bang === 'CP榜'
            ? `，CP 解析：${rankList.map((it) => `rank${it.rank}[女${String(BigInt(it.player) / 10_000_000_000n)}/男${it.contributors[0]?.player ?? '?'}]`).join(' ')}`
            : ''),
      );
    });

    // 1. 各 round 状态：到期的 round 必须是 200（已结算）
    await this.check(`[${title}] 各 round 状态`, async (): Promise<CheckResult> => {
      if (rounds.length === 0) return { expect: '存在 round 记录', real: '(无记录)', pass: false };
      const due = rounds.filter((r) => now >= r.finishMs + SETTLE_MAX_DELAY_MS);
      const bad = due.filter((r) => r.status !== 200);
      const pending = rounds.length - due.length;
      const pass = bad.length === 0;
      return {
        expect: `到期 round(${due.length}个) status=200`,
        real:
          bad.length > 0
            ? `未结算: ${bad.map((r) => `${r.key}(status=${r.status})`).join(',')}`
            : pending > 0
              ? `到期 ${due.length} 个全部已结算，${pending} 个未到结算时限`
              : `全部 ${rounds.length} 个 round 已结算(200)`,
        pass,
      };
    });

    // 2. 奖励对象与 player_type：每个获奖对象均有对应 player_type 的发奖记录，且无异常 player_type
    await this.check(`[${title}] 奖励对象与 player_type`, async (): Promise<CheckResult> => {
      const cfg = this.cfgFor(t);
      const gate = this.gateSettled(rounds, now);
      if (gate) return gate;
      if (rankList.length === 0) return { expect: `前${TOP_N}名榜单非空`, real: '(榜单为空)', pass: false };

      const expectedPairs = new Set<string>();
      for (const it of rankList) {
        for (const e of this.expectedAwardsOf(cfg, it.rank, locale)) {
          for (const p of await this.resolveRecipients(t, it, e.recipient)) {
            expectedPairs.add(`${p.id}|${p.playerType}`);
          }
        }
      }
      const recPairs = new Set(records.map((r) => `${r.player}|${r.playerType}`));
      const missing = [...expectedPairs].filter((k) => !recPairs.has(k));

      const allowedTypes = new Set([t.entityType, 'USER']);
      const badTypes = [...new Set(records.map((r) => r.playerType).filter((pt) => !allowedTypes.has(pt)))];

      const problems: string[] = [];
      if (missing.length > 0) problems.push(`无发奖记录: ${missing.slice(0, 3).join(',')}${missing.length > 3 ? ` 等${missing.length}个` : ''}`);
      if (badTypes.length > 0) problems.push(`异常 player_type: ${badTypes.join(',')}`);
      const pass = problems.length === 0;
      return {
        expect: `${expectedPairs.size} 个奖励对象均有发奖记录，player_type ⊆ {${[...allowedTypes].join(',')}}`,
        real: pass ? `全部符合 (${expectedPairs.size} 个对象)` : problems.join('; '),
        pass,
      };
    });

    // 3. 奖励内容：每项奖励的 类型/ID/数量/时长 与配置文档一致
    await this.check(`[${title}] 奖励内容（类型/数量/时长）`, async (): Promise<CheckResult> => {
      const cfg = this.cfgFor(t);
      const gate = this.gateSettled(rounds, now);
      if (gate) return gate;
      if (rankList.length === 0) return { expect: `前${TOP_N}名榜单非空`, real: '(榜单为空)', pass: false };

      const recSet = new Set(records.map(awardRecKey));
      let checked = 0;
      const problems: string[] = [];
      for (const it of rankList) {
        for (const e of this.expectedAwardsOf(cfg, it.rank, locale)) {
          const expireSecond = e.days > 0 ? e.days * 86400 : 0;
          for (const p of await this.resolveRecipients(t, it, e.recipient)) {
            checked++;
            const key = awardRecKey({
              player: p.id,
              playerType: p.playerType,
              awardType: e.type,
              awardId: e.id,
              awardCount: e.count,
              expireSecond,
            });
            if (!recSet.has(key)) {
              problems.push(`rank${it.rank} ${p.id}(${p.playerType}) 缺 ${e.type}#${e.id}x${e.count}/${e.days > 0 ? e.days + 'd' : '永久'}`);
            }
          }
        }
      }
      const pass = checked > 0 && problems.length === 0;
      return {
        expect: `核对 ${checked} 项奖励全部发放且与配置一致`,
        real:
          problems.length === 0
            ? `全部发放 (${checked})`
            : `缺失 ${problems.length}/${checked}: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` 等${problems.length}项` : ''}`,
        pass,
      };
    });
  }
}

await new FinalCheck().execute();
