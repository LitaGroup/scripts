import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';
import { RankService, type RankItem } from '../../../../src/services/RankService.ts';
import { PlayerService } from '../../../../src/services/PlayerService.ts';

const BIZ = 'pk-v202608';
const DOC_URL = 'http://project.cinta.team/api/documents/3.md';
const KEY_TOTAL = '-';
const SCORE_TOLERANCE = 1.0;
const AWARD_LEAD_MS = 60_000;
const AWARD_WINDOW_MS = 3_600_000;
const FIRST_PERIOD_KEY = '2026082600'; // 第四阶段第一期PK（08-26 00:00 本地）
const FIRST_PERIOD_KEY2 = '2026082618'; // 首日第二轮（08-26 18:00 本地）
const SECOND_DAY_KEY = '2026082700'; // 次日第一轮（08-27 00:00 本地）
const SECOND_DAY_KEY2 = '2026082718'; // 次日第二轮（08-27 18:00 本地）
const THIRD_DAY_KEY = '2026082800'; // 第三日第一轮（08-28 00:00 本地）
const THIRD_DAY_KEY2 = '2026082818'; // 第三日第二轮（08-28 18:00 本地）
const REVIVE_COUNT = 4;

// 胜场 -> BUFF：1→1.0 2→1.0 3→1.05 4→1.10 5→1.15 6→1.20（胜场 1/2 也可能落表，BUFF 默认 1.0）
function expectedBuff(wins: number): number {
  if (wins >= 6) return 1.2;
  if (wins === 5) return 1.15;
  if (wins === 4) return 1.1;
  if (wins === 3) return 1.05;
  return 1.0;
}

interface ExpectedAward {
  rankLo: number;
  rankHi: number;
  recipient: 'entity' | 'contributor' | 'members';
  type: string;
  id: number;
}

interface RoomPromotion {
  locale: string;
  oldTopic: string;
  newTopic: string;
  promoteTime: string;
  promoteCount: number;
  configStage: string;
  awardTop: number;
}

interface PlayerPromotion {
  locale: string;
  tz: string;
  oldTopic: string;
  oldTopic1v1: string; // 上一阶段 1v1 PK topic（用于统计胜场）
  newTopic: string;
  newTopic1v1: string;
  reviveTopic: string;
  promoteTime: string;
  reviveSettleTime: string; // 复活赛结算时间（本地 2026-08-26T23:37）
  promoteCount: number;
  pairCountDay1: number; // 首日（前2轮）对阵数
  pairCountDay2: number; // 次日（后4轮）对阵数
  configStage: string;
  awardTop: number;
}

const ROOM_PROMOTION: RoomPromotion = {
  locale: 'in',
  oldTopic: 'room_in_100_50',
  newTopic: 'room_in_50_20',
  promoteTime: '2026-08-25T23:37:00+07:00',
  promoteCount: 50,
  configStage: '100进50-总榜',
  awardTop: 3,
};

const FAMILY_PROMOTION: RoomPromotion = {
  locale: 'in',
  oldTopic: 'family_in_100_50',
  newTopic: 'family_in_50_20',
  promoteTime: '2026-08-25T23:37:00+07:00',
  promoteCount: 50,
  configStage: '100进50-总榜',
  awardTop: 3,
};

const PLAYER_PROMOTIONS: PlayerPromotion[] = [
  { locale: 'ko', tz: '+09:00', oldTopic: 'player_50_20', oldTopic1v1: 'player_1v1_50_20', newTopic: 'player_24_10', newTopic1v1: 'player_1v1_24_10', reviveTopic: 'player_n_4', promoteTime: '2026-08-25T23:37:00+09:00', reviveSettleTime: '2026-08-26T23:37:00+09:00', promoteCount: 20, pairCountDay1: 10, pairCountDay2: 12, configStage: '100进46-总榜', awardTop: 10 },
  { locale: 'ph', tz: '+08:00', oldTopic: 'player_50_20', oldTopic1v1: 'player_1v1_50_20', newTopic: 'player_24_10', newTopic1v1: 'player_1v1_24_10', reviveTopic: 'player_n_4', promoteTime: '2026-08-25T23:37:00+08:00', reviveSettleTime: '2026-08-26T23:37:00+08:00', promoteCount: 20, pairCountDay1: 10, pairCountDay2: 12, configStage: '100进46-总榜', awardTop: 10 },
  { locale: 'vi', tz: '+07:00', oldTopic: 'player_50_20', oldTopic1v1: 'player_1v1_50_20', newTopic: 'player_24_10', newTopic1v1: 'player_1v1_24_10', reviveTopic: 'player_n_4', promoteTime: '2026-08-25T23:37:00+07:00', reviveSettleTime: '2026-08-26T23:37:00+07:00', promoteCount: 20, pairCountDay1: 10, pairCountDay2: 12, configStage: '100进46-总榜', awardTop: 10 },
  { locale: 'in', tz: '+07:00', oldTopic: 'player_in_100_46', oldTopic1v1: 'player_in_1v1_100_46', newTopic: 'player_in_50_20', newTopic1v1: 'player_in_1v1_50_20', reviveTopic: 'player_in_n_4', promoteTime: '2026-08-25T23:37:00+07:00', reviveSettleTime: '2026-08-26T23:37:00+07:00', promoteCount: 46, pairCountDay1: 23, pairCountDay2: 25, configStage: '100进46-总榜', awardTop: 10 },
];

// 每个榜单晋级检查项数量（用于 start.total）
const ROOM_CHECK_COUNT = 9;
const FAMILY_CHECK_COUNT = 10;
const PLAYER_CHECK_COUNT = 23;

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

function matchBang(cell: string, target: string): boolean {
  if (target === '陪玩榜') return cell.includes('陪玩');
  if (target === '房间榜') return cell.includes('间榜');
  if (target === '家族榜') return cell.includes('家族');
  return false;
}

function recipientOf(bangCell: string, targetCell: string): 'entity' | 'contributor' | 'members' | null {
  if (bangCell.includes('陪玩')) return targetCell.includes('陪玩') ? 'entity' : targetCell.includes('用户') ? 'contributor' : null;
  if (bangCell.includes('间榜')) return targetCell.includes('房间') ? 'entity' : targetCell.includes('用户') ? 'contributor' : null;
  if (bangCell.includes('家族')) return targetCell.includes('用户') ? 'members' : targetCell.includes('家族') ? 'entity' : null;
  return null;
}

// 返回 Map<`${榜单}|${阶段}`, ExpectedAward[]>
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
    if (!bang || !stage) continue;
    const rng = parseRankRange(rank);
    if (!rng) continue;
    const id = Number(idStr);
    if (!Number.isFinite(id)) continue;
    for (const targetBang of ['陪玩榜', '房间榜', '家族榜']) {
      if (!matchBang(bang, targetBang)) continue;
      const recipient = recipientOf(bang, target);
      if (!recipient) continue;
      const key = `${targetBang}|${stage}`;
      const list = map.get(key) ?? [];
      list.push({ rankLo: rng[0], rankHi: rng[1], recipient, type, id });
      map.set(key, list);
    }
  }
  return map;
}

function expectedForRank(list: ExpectedAward[], rank: number): ExpectedAward[] {
  return list.filter((e) => rank >= e.rankLo && rank <= e.rankHi);
}

interface BuffData {
  wins: Map<string, number>; // 上阶段 1v1 胜场
  buffs: Map<string, Map<string, number>>; // topic -> player -> buff
}

interface ReviveData {
  status: number | null;
  top: { player: string; score: number }[]; // 复活赛前四
  oldScores: Map<string, number>; // 复活赛前四的旧阶段总分
  joins: Map<string, number>; // 复活赛前四在新阶段的代入积分
}

class Phrase4Check extends CheckBaseClass {
  private rank = new RankService('prod');
  private player = new PlayerService('prod');
  private awardConfig: Map<string, ExpectedAward[]> | null = null;
  private pairCounts: Map<string, number> = new Map();

  constructor() {
    super();
    const now = Date.now();
    this.total = 1;
    this.total += now < Date.parse(ROOM_PROMOTION.promoteTime) ? 1 : ROOM_CHECK_COUNT;
    this.total += now < Date.parse(FAMILY_PROMOTION.promoteTime) ? 1 : FAMILY_CHECK_COUNT;
    for (const p of PLAYER_PROMOTIONS) {
      this.total += now < Date.parse(p.promoteTime) ? 1 : PLAYER_CHECK_COUNT;
    }
  }

  protected async run(): Promise<void> {
    await this.act('获取奖励配置文档 3.md', async () => {
      const res = await fetch(DOC_URL, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const md = await res.text();
      this.awardConfig = parseAwardConfig(md);
      const summary = [...this.awardConfig.entries()].map(([k, v]) => `${k}:${v.length}`).join(', ');
      this.log(`奖励配置解析完成 — ${summary}`);
    });

    await this.checkRoomPromotion(ROOM_PROMOTION);
    await this.checkFamilyPromotion(FAMILY_PROMOTION);
    for (const p of PLAYER_PROMOTIONS) {
      await this.checkPlayerPromotion(p);
    }
  }

  private awardCfg(bang: string, stage: string): ExpectedAward[] {
    if (!this.awardConfig) this.skip('奖励配置未获取');
    const cfg = this.awardConfig.get(`${bang}|${stage}`);
    if (!cfg || cfg.length === 0) this.skip(`无 ${bang} ${stage} 奖励配置`);
    return cfg;
  }

  private async fetchPlayerList(topic: string, locale: string): Promise<{ player: string; score: number }[]> {
    const r = await MySQLProdResource.query(
      'active',
      `select player, score from mod_common_player_list where biz=${quoteStr(BIZ)} and ${'`key`'}=${quoteStr(topic)} and locale=${quoteStr(locale)}`,
    );
    return r.data.map((row) => ({ player: String(row[0]), score: Number(row[1]) }));
  }

  private async fetchRoundStatus(topic: string, locale: string, key: string): Promise<number | null> {
    const r = await MySQLProdResource.query(
      'active',
      `select status from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(topic)} and ${'`key`'}=${quoteStr(key)} and locale=${quoteStr(locale)} limit 1`,
    );
    if (r.data.length === 0) return null;
    return Number(r.data[0][0]);
  }

  private async checkRoundStatusAndPeriod(topic: string, locale: string, stageStart: string, stageFinish: string): Promise<CheckResult> {
    const r = await MySQLProdResource.query(
      'active',
      `select status, start_time, finish_time from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(topic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(locale)} limit 1`,
    );
    const expect = `status=100, start=${stageStart}, finish=${stageFinish}`;
    if (r.data.length === 0) return { expect, real: '(无记录)', pass: false };
    const status = Number(r.data[0][0]);
    const start = Number(r.data[0][1]);
    const finish = Number(r.data[0][2]);
    const real = `status=${status}, start=${new Date(start).toISOString()}, finish=${new Date(finish).toISOString()}`;
    const pass = status === 100 && start === Date.parse(stageStart) && finish === Date.parse(stageFinish);
    return { expect, real, pass };
  }

  private async checkInitScores(
    title: string,
    topic: string,
    locale: string,
    playerList: { player: string; score: number }[],
    scoreRatio: number,
  ): Promise<void> {
    let initScores: Map<string, number> = new Map();
    await this.act(`[${title}] 获取新阶段(${topic})初始化积分`, async () => {
      const r = await MySQLProdResource.query(
        'active',
        `select player, total_amount from mod_common_rank_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(topic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(locale)} and trans_no like 'INIT-%'`,
      );
      initScores = new Map(r.data.map((row) => [String(row[0]), Number(row[1])]));
      this.log(`初始化积分 ${initScores.size} 条`);
    });

    // 复活玩家 score=0，不走 INIT 代入，检查剔除
    const promoted = playerList.filter((pl) => pl.score !== 0);
    const ratioText = scoreRatio === 1 ? '' : `的${scoreRatio * 100}%`;
    await this.check(`[${title}] 初始化积分等于晋级名单得分${ratioText}`, async (): Promise<CheckResult> => {
      if (playerList.length === 0) this.skip('晋级名单为空');
      let missing = 0;
      let mismatch = 0;
      const detail: string[] = [];
      for (const pl of promoted) {
        const amt = initScores.get(pl.player);
        if (amt === undefined) {
          missing++;
          if (detail.length < 3) detail.push(`${pl.player}无初始化积分`);
          continue;
        }
        const expected = pl.score * scoreRatio;
        if (Math.abs(amt - expected) > SCORE_TOLERANCE) {
          mismatch++;
          if (detail.length < 3) detail.push(`${pl.player}(${amt}≠${expected})`);
        }
      }
      const extra = initScores.size - (promoted.length - missing);
      const pass = missing === 0 && mismatch === 0 && extra === 0;
      return {
        expect: `初始化积分 ${promoted.length} 条且等于晋级名单得分${ratioText}`,
        real: pass
          ? `全部一致 (${promoted.length})`
          : `缺失 ${missing}，分数不一致 ${mismatch}，多出 ${Math.max(extra, 0)}${detail.length ? ': ' + detail.join('; ') : ''}`,
        pass,
      };
    });
  }

  // ============================================================
  // 房间榜：room_in_100_50 -> room_in_50_20
  // ============================================================
  private async checkRoomPromotion(p: RoomPromotion): Promise<void> {
    const title = `房间榜 ${p.oldTopic}→${p.newTopic} / ${p.locale}`;
    const promoteMs = Date.parse(p.promoteTime);

    if (Date.now() < promoteMs) {
      await this.act(`[${title}] 晋级时间预检`, () => {
        this.skip(`未到晋级时间 ${p.promoteTime}`);
      });
      return;
    }

    let awardRecords: { playerType: string; awardType: string; awardId: number }[] = [];
    let playerList: { player: string; score: number }[] = [];
    let rankCount = 0;

    // 1. 原阶段是否完成结算
    await this.check(`[${title}] 原阶段(${p.oldTopic})结算 status=200`, async (): Promise<CheckResult> => {
      const status = await this.fetchRoundStatus(p.oldTopic, p.locale, KEY_TOTAL);
      if (status === null) return { expect: '200', real: '(无记录)', pass: false };
      return { expect: '200', real: String(status), pass: status === 200 };
    });

    // 2. 原阶段奖励发放（3个给用户 player_type=USER、3个给房间 player_type=ROOM）
    await this.act(`[${title}] 获取发奖记录`, async () => {
      const r = await MySQLProdResource.query(
        'active',
        `select player_type, award_type, award_id from mod_common_award_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.oldTopic)} and create_time between ${quoteNum(promoteMs - AWARD_LEAD_MS)} and ${quoteNum(promoteMs + AWARD_WINDOW_MS)}`,
      );
      awardRecords = r.data.map((row) => ({
        playerType: String(row[0]),
        awardType: String(row[1]),
        awardId: Number(row[2]),
      }));
      this.log(`发奖记录 ${awardRecords.length} 条 — USER=${awardRecords.filter((a) => a.playerType === 'USER').length}, ROOM=${awardRecords.filter((a) => a.playerType === 'ROOM').length}`);
    });

    await this.check(`[${title}] 奖励发放符合预期`, async (): Promise<CheckResult> => {
      const cfg = this.awardCfg('房间榜', p.configStage);
      const problems: string[] = [];
      const parts: string[] = [];
      for (const [pt, recipient] of [['USER', 'contributor'], ['ROOM', 'entity']] as const) {
        const expectedIds = cfg.filter((e) => e.recipient === recipient && e.rankHi <= p.awardTop).map((e) => e.id);
        const actual = awardRecords.filter((a) => a.playerType === pt);
        parts.push(`${pt} ${actual.length}/${expectedIds.length}`);
        if (actual.length !== expectedIds.length) {
          problems.push(`${pt}数量${actual.length}≠${expectedIds.length}`);
          continue;
        }
        const actualIds = actual.map((a) => a.awardId).sort((x, y) => x - y);
        const expectIds = [...expectedIds].sort((x, y) => x - y);
        if (actualIds.join(',') !== expectIds.join(',')) {
          problems.push(`${pt}道具不符(实际[${actualIds}] 预期[${expectIds}])`);
        }
      }
      const pass = problems.length === 0;
      return {
        expect: `USER=${p.awardTop}个、ROOM=${p.awardTop}个`,
        real: pass ? parts.join(', ') : problems.join('; '),
        pass,
      };
    });

    // 3. 晋级名单（数量以接口前N名的实际数量为准）
    await this.act(`[${title}] 获取前 ${p.promoteCount} 名榜单`, async () => {
      const rr = await this.rank.queryRank(BIZ, p.oldTopic, KEY_TOTAL, p.promoteCount, p.locale);
      rankCount = rr.list.length;
      this.log(`round.status=${rr.round.status}, 实际 ${rankCount} 名`);
    });

    await this.act(`[${title}] 获取晋级名单`, async () => {
      playerList = await this.fetchPlayerList(p.oldTopic, p.locale);
      this.log(`晋级名单 ${playerList.length} 个ID`);
    });

    await this.check(`[${title}] 晋级名单数量与榜单一致`, async (): Promise<CheckResult> => {
      return {
        expect: `前${p.promoteCount}名榜单实际 ${rankCount} 名`,
        real: String(playerList.length),
        pass: playerList.length === rankCount,
      };
    });

    // 4. 新阶段是否初始化完成
    await this.check(`[${title}] 新阶段(${p.newTopic})初始化 status=100`, async (): Promise<CheckResult> => {
      const status = await this.fetchRoundStatus(p.newTopic, p.locale, KEY_TOTAL);
      if (status === null) return { expect: '100', real: '(无记录)', pass: false };
      return { expect: '100', real: String(status), pass: status === 100 };
    });

    await this.checkInitScores(title, p.newTopic, p.locale, playerList, 1);
  }

  // ============================================================
  // 家族榜：family_in_100_50 -> family_in_50_20
  // ============================================================
  private async checkFamilyPromotion(p: RoomPromotion): Promise<void> {
    const title = `家族榜 ${p.oldTopic}→${p.newTopic} / ${p.locale}`;
    const promoteMs = Date.parse(p.promoteTime);

    if (Date.now() < promoteMs) {
      await this.act(`[${title}] 晋级时间预检`, () => {
        this.skip(`未到晋级时间 ${p.promoteTime}`);
      });
      return;
    }

    let rankList: RankItem[] = [];
    let memberAward: { families: { id: string; members: string[] }[]; awarded: Set<string>; spec: { type: string; id: number } } | null = null;
    let familyRecords: { player: string; awardType: string; awardId: number }[] = [];
    let playerList: { player: string; score: number }[] = [];

    // 1. 原阶段是否完成结算
    await this.check(`[${title}] 原阶段(${p.oldTopic})结算 status=200`, async (): Promise<CheckResult> => {
      const status = await this.fetchRoundStatus(p.oldTopic, p.locale, KEY_TOTAL);
      if (status === null) return { expect: '200', real: '(无记录)', pass: false };
      return { expect: '200', real: String(status), pass: status === 200 };
    });

    // 2. 原阶段奖励发放（家族成员 player_type=USER + 家族 player_type=FAMILY）
    await this.act(`[${title}] 获取前 ${p.promoteCount} 名家族榜`, async () => {
      const rr = await this.rank.queryRank(BIZ, p.oldTopic, KEY_TOTAL, p.promoteCount, p.locale);
      rankList = rr.list;
      this.log(`round.status=${rr.round.status}, 实际 ${rankList.length} 名`);
      if (rankList.length === 0) throw new Error('榜单为空');
    });

    await this.act(`[${title}] 获取发奖记录`, async () => {
      const cfg = this.awardCfg('家族榜', p.configStage);
      const memberSpec = cfg.find((e) => e.recipient === 'members');
      const entitySpec = cfg.find((e) => e.recipient === 'entity');
      if (!memberSpec || !entitySpec) throw new Error('奖励配置缺少 家族成员/家族 条目');
      // 家族成员（player_type=USER）：前3名家族成员的发放情况
      const families: { id: string; members: string[] }[] = [];
      const allMembers: string[] = [];
      for (const it of rankList.slice(0, p.awardTop)) {
        const members = await this.player.getMembersOfFamily(it.player);
        families.push({ id: it.player, members });
        for (const m of members) allMembers.push(m);
      }
      if (allMembers.length === 0) throw new Error('无可核查成员');
      const inList = allMembers.map((id) => quoteVal(id)).join(', ');
      const r = await MySQLProdResource.query(
        'active',
        `select distinct player from mod_common_award_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.oldTopic)} and player_type='USER' and award_type=${quoteStr(memberSpec.type)} and award_id=${quoteNum(memberSpec.id)} and player in (${inList}) and create_time between ${quoteNum(promoteMs - AWARD_LEAD_MS)} and ${quoteNum(promoteMs + AWARD_WINDOW_MS)}`,
      );
      const awarded = new Set(r.data.map((row) => String(row[0])));
      memberAward = { families, awarded, spec: { type: memberSpec.type, id: memberSpec.id } };
      // 家族本体（player_type=FAMILY）：发给前3名家族
      const fr = await MySQLProdResource.query(
        'active',
        `select player, award_type, award_id from mod_common_award_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.oldTopic)} and player_type='FAMILY' and create_time between ${quoteNum(promoteMs - AWARD_LEAD_MS)} and ${quoteNum(promoteMs + AWARD_WINDOW_MS)}`,
      );
      familyRecords = fr.data.map((row) => ({ player: String(row[0]), awardType: String(row[1]), awardId: Number(row[2]) }));
      this.log(`家族 ${families.length} 个，成员 ${allMembers.length} 名，成员已发放 ${awarded.size} 名 (${memberSpec.type}#${memberSpec.id})；家族本体发奖 ${familyRecords.length} 条`);
    });

    await this.check(`[${title}] 家族成员奖励发放符合预期`, async (): Promise<CheckResult> => {
      if (!memberAward) this.skip('发奖记录未获取');
      let total = 0;
      let badFamilies = 0;
      const detail: string[] = [];
      for (const f of memberAward!.families) {
        const awardedCount = f.members.filter((m) => memberAward!.awarded.has(m)).length;
        total += f.members.length;
        if (f.members.length === 0 || awardedCount * 2 <= f.members.length) {
          badFamilies++;
          if (detail.length < 3) detail.push(`${f.id}(${awardedCount}/${f.members.length})`);
        }
      }
      const pass = total > 0 && badFamilies === 0;
      return {
        expect: `每个家族超过50%成员发放 ${memberAward!.spec.type}#${memberAward!.spec.id}（共 ${total} 名成员）`,
        real:
          badFamilies === 0
            ? `全部家族达标 (${total})`
            : `${badFamilies} 个家族未达50%${detail.length ? ': ' + detail.join('; ') : ''}`,
        pass,
      };
    });

    await this.check(`[${title}] 家族本体奖励发放符合预期`, async (): Promise<CheckResult> => {
      const cfg = this.awardCfg('家族榜', p.configStage);
      const entitySpec = cfg.find((e) => e.recipient === 'entity');
      if (!entitySpec) this.skip('奖励配置缺少 家族 条目');
      const top3 = rankList.slice(0, p.awardTop).map((it) => it.player);
      const expectPlayers = [...top3].sort();
      const actualPlayers = [...new Set(familyRecords.map((r) => r.player))].sort();
      const problems: string[] = [];
      if (actualPlayers.join(',') !== expectPlayers.join(',')) {
        problems.push(`家族不符(实际[${actualPlayers}] 预期[${expectPlayers}])`);
      }
      const badItems = familyRecords.filter((r) => r.awardType !== entitySpec.type || r.awardId !== entitySpec.id);
      if (badItems.length > 0) {
        problems.push(`道具不符 ${badItems.length} 条(预期 ${entitySpec.type}#${entitySpec.id})`);
      }
      if (familyRecords.length !== p.awardTop) {
        problems.push(`数量${familyRecords.length}≠${p.awardTop}`);
      }
      const pass = problems.length === 0;
      return {
        expect: `${p.awardTop} 个家族各发放 ${entitySpec.type}#${entitySpec.id}`,
        real: pass ? `全部发放 (${familyRecords.length})` : problems.join('; '),
        pass,
      };
    });

    // 3. 晋级名单（数量以接口前N名的实际数量为准）
    await this.act(`[${title}] 获取晋级名单`, async () => {
      playerList = await this.fetchPlayerList(p.oldTopic, p.locale);
      this.log(`晋级名单 ${playerList.length} 个ID`);
    });

    await this.check(`[${title}] 晋级名单数量与榜单一致`, async (): Promise<CheckResult> => {
      return {
        expect: `前${p.promoteCount}名榜单实际 ${rankList.length} 名`,
        real: String(playerList.length),
        pass: playerList.length === rankList.length,
      };
    });

    // 4. 新阶段是否初始化完成
    await this.check(`[${title}] 新阶段(${p.newTopic})初始化 status=100`, async (): Promise<CheckResult> => {
      const status = await this.fetchRoundStatus(p.newTopic, p.locale, KEY_TOTAL);
      if (status === null) return { expect: '100', real: '(无记录)', pass: false };
      return { expect: '100', real: String(status), pass: status === 100 };
    });

    await this.checkInitScores(title, p.newTopic, p.locale, playerList, 1);
  }

  // ============================================================
  // 陪玩榜：player_50_20 -> player_24_10（非印尼）/ player_in_100_46 -> player_in_50_20（印尼）
  // ============================================================
  private async checkPlayerPromotion(p: PlayerPromotion): Promise<void> {
    const title = `陪玩榜 ${p.oldTopic}→${p.newTopic} / ${p.locale}`;
    const promoteMs = Date.parse(p.promoteTime);
    const reviveSettleMs = Date.parse(p.reviveSettleTime);
    const stageStart = `2026-08-26T00:00:00${p.tz}`;
    const stageFinish = `2026-08-28T23:30:00${p.tz}`;

    if (Date.now() < promoteMs) {
      await this.act(`[${title}] 晋级时间预检`, () => {
        this.skip(`未到晋级时间 ${p.promoteTime}`);
      });
      return;
    }

    const reviveSettled = Date.now() >= reviveSettleMs;
    let rankList: RankItem[] = [];
    let awardSet: Set<string> | null = null;
    let playerList: { player: string; score: number }[] = [];
    let buffData: BuffData = { wins: new Map(), buffs: new Map() };
    let reviveData: ReviveData = { status: null, top: [], oldScores: new Map(), joins: new Map() };

    // 1. 原阶段是否完成结算
    await this.check(`[${title}] 原阶段(${p.oldTopic})结算 status=200`, async (): Promise<CheckResult> => {
      const status = await this.fetchRoundStatus(p.oldTopic, p.locale, KEY_TOTAL);
      if (status === null) return { expect: '200', real: '(无记录)', pass: false };
      return { expect: '200', real: String(status), pass: status === 200 };
    });

    // 2. 原阶段奖励发放（名次奖励给陪玩 + 贡献top1用户，核对前10名）
    await this.act(`[${title}] 获取前 ${p.promoteCount} 名总榜`, async () => {
      const rr = await this.rank.queryRank(BIZ, p.oldTopic, KEY_TOTAL, p.promoteCount, p.locale);
      rankList = rr.list;
      this.log(`round.status=${rr.round.status}, 实际 ${rankList.length} 名`);
      if (rankList.length === 0) throw new Error('榜单为空');
    });

    await this.act(`[${title}] 获取发奖记录`, async () => {
      const ids: string[] = [];
      for (const it of rankList.slice(0, p.awardTop)) {
        ids.push(it.player);
        if (it.contributors[0]) ids.push(it.contributors[0].player);
      }
      if (ids.length === 0) throw new Error('无可核查对象');
      const inList = ids.map((id) => quoteVal(id)).join(', ');
      const r = await MySQLProdResource.query(
        'active',
        `select player, award_type, award_id from mod_common_award_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.oldTopic)} and player in (${inList}) and create_time between ${quoteNum(promoteMs - AWARD_LEAD_MS)} and ${quoteNum(promoteMs + AWARD_WINDOW_MS)}`,
      );
      awardSet = new Set();
      for (const row of r.data) {
        awardSet.add(`${row[0]}|${row[1]}|${row[2]}`);
      }
      this.log(`对象 ${ids.length} 个，发奖记录 ${r.data.length} 条`);
    });

    await this.check(`[${title}] 发奖符合预期（前${p.awardTop}名）`, async (): Promise<CheckResult> => {
      const cfg = this.awardCfg('陪玩榜', p.configStage);
      if (!awardSet) this.skip('发奖记录未获取');
      let missing = 0;
      let checked = 0;
      const detail: string[] = [];
      for (const it of rankList.slice(0, p.awardTop)) {
        for (const e of expectedForRank(cfg, it.rank)) {
          let recipientId: string;
          if (e.recipient === 'entity') {
            recipientId = it.player;
          } else if (e.recipient === 'contributor') {
            const c = it.contributors[0]?.player;
            if (!c) continue;
            recipientId = c;
          } else {
            continue;
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

    // 3. 晋级名单（数量以接口前N名的实际数量为准；复活赛结算后会追加前4名）
    await this.act(`[${title}] 获取晋级名单`, async () => {
      playerList = await this.fetchPlayerList(p.oldTopic, p.locale);
      this.log(`晋级名单 ${playerList.length} 个ID（复活赛${reviveSettled ? '已' : '未'}结算）`);
    });

    await this.check(`[${title}] 晋级名单数量与榜单一致`, async (): Promise<CheckResult> => {
      const expectCount = rankList.length + (reviveSettled ? REVIVE_COUNT : 0);
      const suffix = reviveSettled ? `（含复活赛前${REVIVE_COUNT}名）` : '';
      return {
        expect: `前${p.promoteCount}名榜单实际 ${rankList.length} 名${suffix}，共 ${expectCount} 名`,
        real: String(playerList.length),
        pass: playerList.length === expectCount,
      };
    });

    // 4. BUFF 检查：上一阶段 1v1 胜场 -> 本阶段 BUFF（1/2→1.0 3→1.05 4→1.10 5→1.15 6→1.20）
    await this.act(`[${title}] 获取上阶段胜场与新阶段BUFF`, async () => {
      const wr = await MySQLProdResource.query(
        'active',
        `select winner, count(*) from mod_buff11pk_pair where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.oldTopic1v1)} and locale=${quoteStr(p.locale)} and winner > 0 group by winner`,
      );
      buffData.wins = new Map(wr.data.map((row) => [String(row[0]), Number(row[1])]));
      const br = await MySQLProdResource.query(
        'active',
        `select topic, player, buff from mod_buffpk_player_buff where biz=${quoteStr(BIZ)} and topic in (${quoteStr(p.newTopic)}, ${quoteStr(p.newTopic1v1)}) and locale=${quoteStr(p.locale)}`,
      );
      buffData.buffs = new Map();
      for (const row of br.data) {
        const t = String(row[0]);
        if (!buffData.buffs.has(t)) buffData.buffs.set(t, new Map());
        buffData.buffs.get(t)!.set(String(row[1]), Number(row[2]));
      }
      const summary = [...buffData.buffs.entries()].map(([t, m]) => `${t}:${m.size}`).join(', ');
      this.log(`胜场 ${buffData.wins.size} 人，BUFF记录 — ${summary || '(无)'}`);
    });

    await this.check(`[${title}] BUFF符合胜场映射`, async (): Promise<CheckResult> => {
      const whitelist = new Set(playerList.map((pl) => pl.player));
      const problems: string[] = [];
      let checkedRows = 0;
      for (const t of [p.newTopic, p.newTopic1v1]) {
        const m = buffData.buffs.get(t) ?? new Map<string, number>();
        for (const [player, buff] of m) {
          const wins = buffData.wins.get(player) ?? 0;
          const exp = expectedBuff(wins);
          checkedRows++;
          // 胜场 1/2 允许有 BUFF 记录（默认 1.0），统一按映射值核对
          if (Math.abs(buff - exp) > 1e-9) {
            problems.push(`${t}:${player}胜场${wins}应${exp}实${buff}`);
          }
        }
        // 晋级名单内胜场>=3 的玩家必须有 BUFF 记录
        for (const pl of whitelist) {
          const wins = buffData.wins.get(pl) ?? 0;
          if (wins >= 3 && !m.has(pl)) {
            problems.push(`${t}:${pl}胜场${wins}缺BUFF记录`);
          }
        }
      }
      const pass = checkedRows > 0 && problems.length === 0;
      return {
        expect: `BUFF=胜场映射（1/2→1.0 3→1.05 4→1.10 5→1.15 6→1.20），核对 ${checkedRows} 条`,
        real: problems.length === 0 ? `全部一致 (${checkedRows})` : problems.slice(0, 3).join('; ') + (problems.length > 3 ? ` 等${problems.length}个问题` : ''),
        pass,
      };
    });

    // 5. 复活赛（player_n_4 / player_in_n_4）：初始化与结算
    await this.act(`[${title}] 获取复活赛(${p.reviveTopic})数据`, async () => {
      reviveData.status = await this.fetchRoundStatus(p.reviveTopic, p.locale, KEY_TOTAL);
      if (reviveSettled) {
        const top = await MySQLProdResource.query(
          'active',
          `select player, max(total_amount) s from mod_common_rank_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.reviveTopic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(p.locale)} group by player order by s desc limit ${quoteNum(REVIVE_COUNT)}`,
        );
        reviveData.top = top.data.map((row) => ({ player: String(row[0]), score: Number(row[1]) }));
        if (reviveData.top.length > 0) {
          const ids = reviveData.top.map((t) => t.player);
          const inList = ids.map((id) => quoteVal(id)).join(', ');
          const [oldR, joinR] = await Promise.all([
            MySQLProdResource.query(
              'active',
              `select player, max(total_amount) from mod_common_rank_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.oldTopic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(p.locale)} and player in (${inList}) group by player`,
            ),
            MySQLProdResource.query(
              'active',
              `select player, total_amount from mod_common_rank_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.newTopic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(p.locale)} and trans_no like ${quoteStr(p.reviveTopic + '.revive.%')}`,
            ),
          ]);
          reviveData.oldScores = new Map(oldR.data.map((row) => [String(row[0]), Number(row[1])]));
          reviveData.joins = new Map(joinR.data.map((row) => [String(row[0]), Number(row[1])]));
        }
      }
      this.log(`复活赛 status=${reviveData.status ?? '(无记录)'}，前四 ${reviveData.top.length} 名`);
    });

    await this.check(`[${title}] 复活赛轮次状态`, async (): Promise<CheckResult> => {
      // 晋级结算之后 status=100，复活赛结算（2026-08-26T23:37 本地）之后 status=200
      const expect = reviveSettled ? 200 : 100;
      if (reviveData.status === null) return { expect: String(expect), real: '(无记录)', pass: false };
      return { expect: String(expect), real: String(reviveData.status), pass: reviveData.status === expect };
    });

    await this.check(`[${title}] 复活赛前四进入晋级名单`, async (): Promise<CheckResult> => {
      if (!reviveSettled) this.skip(`未到复活赛结算时间 ${p.reviveSettleTime}`);
      if (reviveData.top.length === 0) return { expect: `前${REVIVE_COUNT}名进入晋级名单`, real: '(复活赛无数据)', pass: false };
      const listed = new Set(playerList.map((pl) => pl.player));
      const missing = reviveData.top.filter((t) => !listed.has(t.player));
      const pass = missing.length === 0;
      return {
        expect: `复活赛前${REVIVE_COUNT}名全部进入 ${p.oldTopic} 晋级名单`,
        real: pass ? `全部进入 (${reviveData.top.length})` : `缺失: ${missing.map((t) => t.player).join(',')}`,
        pass,
      };
    });

    await this.check(`[${title}] 复活赛积分代入新阶段`, async (): Promise<CheckResult> => {
      if (!reviveSettled) this.skip(`未到复活赛结算时间 ${p.reviveSettleTime}`);
      if (reviveData.top.length === 0) return { expect: '代入积分=复活赛积分+上阶段积分×50%', real: '(复活赛无数据)', pass: false };
      const problems: string[] = [];
      for (const t of reviveData.top) {
        const join = reviveData.joins.get(t.player);
        const oldScore = reviveData.oldScores.get(t.player) ?? 0;
        const expected = t.score + oldScore * 0.5;
        if (join === undefined) {
          problems.push(`${t.player}无代入记录`);
        } else if (Math.abs(join - expected) > SCORE_TOLERANCE) {
          problems.push(`${t.player}(${join}≠复活${t.score}+旧${oldScore}×50%)`);
        }
      }
      const pass = problems.length === 0;
      return {
        expect: `代入积分=复活赛积分+上阶段积分×50%（${reviveData.top.length} 名）`,
        real: pass ? `全部一致 (${reviveData.top.length})` : problems.slice(0, 3).join('; '),
        pass,
      };
    });

    // 6. 新阶段是否初始化完成（状态 + 周期时间）
    await this.check(`[${title}] 新阶段(${p.newTopic})初始化 status=100 且周期正确`, async (): Promise<CheckResult> => {
      return this.checkRoundStatusAndPeriod(p.newTopic, p.locale, stageStart, stageFinish);
    });

    await this.checkInitScores(title, p.newTopic, p.locale, playerList, 0.5);

    // 7. 新阶段 1v1 PK 是否初始化完成
    await this.check(`[${title}] 1v1阶段(${p.newTopic1v1})初始化 status=100 且周期正确`, async (): Promise<CheckResult> => {
      return this.checkRoundStatusAndPeriod(p.newTopic1v1, p.locale, stageStart, stageFinish);
    });

    await this.act(`[${title}] 获取1v1对阵数据`, async () => {
      const pr = await MySQLProdResource.query(
        'active',
        `select ${'`key`'}, count(*) from mod_buff11pk_pair where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.newTopic1v1)} and locale=${quoteStr(p.locale)} group by ${'`key`'}`,
      );
      this.pairCounts = new Map(pr.data.map((row) => [String(row[0]), Number(row[1])]));
      const summary = [...this.pairCounts.entries()].sort().map(([k, c]) => `${k}:${c}`).join(', ');
      this.log(`对阵 — ${summary || '(无)'}`);
    });

    await this.check(`[${title}] 第一期PK对阵(key=${FIRST_PERIOD_KEY})`, async (): Promise<CheckResult> => {
      const roundStatus = await this.fetchRoundStatus(p.newTopic1v1, p.locale, FIRST_PERIOD_KEY);
      const pairs = this.pairCounts.get(FIRST_PERIOD_KEY);
      const expect = `status=100, 对阵${p.pairCountDay1}条`;
      if (roundStatus === null && pairs === undefined) return { expect, real: '(无对阵数据)', pass: false };
      const real = `status=${roundStatus ?? '(无轮次)'}, 对阵${pairs ?? 0}条`;
      return { expect, real, pass: roundStatus === 100 && pairs === p.pairCountDay1 };
    });

    await this.check(`[${title}] 首日第二轮对阵(key=${FIRST_PERIOD_KEY2})`, async (): Promise<CheckResult> => {
      const pairs = this.pairCounts.get(FIRST_PERIOD_KEY2);
      const expect = `对阵${p.pairCountDay1}条`;
      if (pairs === undefined) {
        if (Date.now() < Date.parse(`2026-08-26T18:00:00${p.tz}`)) this.skip('首日第二轮尚未生成');
        return { expect, real: '(无对阵数据)', pass: false };
      }
      return { expect, real: `对阵${pairs}条`, pass: pairs === p.pairCountDay1 };
    });

    await this.check(`[${title}] 次日对阵(key=${SECOND_DAY_KEY})`, async (): Promise<CheckResult> => {
      const pairs = this.pairCounts.get(SECOND_DAY_KEY);
      const expect = `对阵${p.pairCountDay2}条（含复活赛前${REVIVE_COUNT}名）`;
      if (pairs === undefined) {
        if (Date.now() < Date.parse(`2026-08-27T00:00:00${p.tz}`)) this.skip('次日对阵尚未生成');
        return { expect, real: '(无对阵数据)', pass: false };
      }
      return { expect, real: `对阵${pairs}条`, pass: pairs === p.pairCountDay2 };
    });

    // 复活赛结算后的其余场次（次日第二轮、第三日两轮）共用同一核对逻辑
    const laterRounds: { key: string; start: string; desc: string }[] = [
      { key: SECOND_DAY_KEY2, start: `2026-08-27T18:00:00${p.tz}`, desc: '次日第二轮' },
      { key: THIRD_DAY_KEY, start: `2026-08-28T00:00:00${p.tz}`, desc: '第三日第一轮' },
      { key: THIRD_DAY_KEY2, start: `2026-08-28T18:00:00${p.tz}`, desc: '第三日第二轮' },
    ];
    for (const r of laterRounds) {
      await this.check(`[${title}] ${r.desc}对阵(key=${r.key})`, async (): Promise<CheckResult> => {
        const pairs = this.pairCounts.get(r.key);
        const expect = `对阵${p.pairCountDay2}条（含复活赛前${REVIVE_COUNT}名）`;
        if (pairs === undefined) {
          if (Date.now() < Date.parse(r.start)) this.skip(`${r.desc}尚未生成`);
          return { expect, real: '(无对阵数据)', pass: false };
        }
        return { expect, real: `对阵${pairs}条`, pass: pairs === p.pairCountDay2 };
      });
    }
  }
}

await new Phrase4Check().execute();
