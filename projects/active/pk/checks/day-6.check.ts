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
const FIRST_PERIOD_KEY = '2026082300';

interface ExpectedAward {
  rankLo: number;
  rankHi: number;
  recipient: 'entity' | 'contributor';
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
  newTopic: string;
  newTopic1v1: string;
  promoteTime: string;
  promoteCount: number;
  pairCount: number;
  configStage: string;
  awardTop: number;
}

const ROOM_PROMOTION: RoomPromotion = {
  locale: 'in',
  oldTopic: 'room_in_200_100',
  newTopic: 'room_in_100_50',
  promoteTime: '2026-08-22T23:37:00+07:00',
  promoteCount: 100,
  configStage: '200进100-总榜',
  awardTop: 3,
};

const FAMILY_PROMOTION: RoomPromotion = {
  locale: 'in',
  oldTopic: 'family_in_200_100',
  newTopic: 'family_in_100_50',
  promoteTime: '2026-08-22T23:37:00+07:00',
  promoteCount: 100,
  configStage: '200进100-总榜',
  awardTop: 3,
};

const PLAYER_PROMOTIONS: PlayerPromotion[] = [
  { locale: 'ko', tz: '+09:00', oldTopic: 'player_100_50', newTopic: 'player_50_20', newTopic1v1: 'player_1v1_50_20', promoteTime: '2026-08-22T23:37:00+09:00', promoteCount: 50, pairCount: 25, configStage: '200进100-总榜', awardTop: 10 },
  { locale: 'ph', tz: '+08:00', oldTopic: 'player_100_50', newTopic: 'player_50_20', newTopic1v1: 'player_1v1_50_20', promoteTime: '2026-08-22T23:37:00+08:00', promoteCount: 50, pairCount: 25, configStage: '200进100-总榜', awardTop: 10 },
  { locale: 'vi', tz: '+07:00', oldTopic: 'player_100_50', newTopic: 'player_50_20', newTopic1v1: 'player_1v1_50_20', promoteTime: '2026-08-22T23:37:00+07:00', promoteCount: 50, pairCount: 25, configStage: '200进100-总榜', awardTop: 10 },
  { locale: 'in', tz: '+07:00', oldTopic: 'player_in_200_100', newTopic: 'player_in_100_46', newTopic1v1: 'player_in_1v1_100_46', promoteTime: '2026-08-22T23:37:00+07:00', promoteCount: 100, pairCount: 50, configStage: '200进100-总榜', awardTop: 10 },
];

// 每个榜单晋级检查项数量（用于 start.total）
const ROOM_CHECK_COUNT = 8;
const FAMILY_CHECK_COUNT = 9;
const PLAYER_CHECK_COUNT = 11;

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

function recipientOf(bangCell: string, targetCell: string): 'entity' | 'contributor' | null {
  if (bangCell.includes('陪玩')) return targetCell.includes('陪玩') ? 'entity' : targetCell.includes('用户') ? 'contributor' : null;
  if (bangCell.includes('间榜')) return targetCell.includes('房间') ? 'entity' : targetCell.includes('用户') ? 'contributor' : null;
  if (bangCell.includes('家族')) return targetCell.includes('家族') ? 'entity' : null;
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

class Day6Check extends CheckBaseClass {
  private rank = new RankService('prod');
  private player = new PlayerService('prod');
  private awardConfig: Map<string, ExpectedAward[]> | null = null;

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

  private async checkInitScores(title: string, topic: string, locale: string, playerList: { player: string; score: number }[]): Promise<void> {
    let initScores: Map<string, number> = new Map();
    await this.act(`[${title}] 获取新阶段(${topic})初始化积分`, async () => {
      const r = await MySQLProdResource.query(
        'active',
        `select player, total_amount from mod_common_rank_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(topic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(locale)} and trans_no like 'INIT-%'`,
      );
      initScores = new Map(r.data.map((row) => [String(row[0]), Number(row[1])]));
      this.log(`初始化积分 ${initScores.size} 条`);
    });

    await this.check(`[${title}] 初始化积分等于晋级名单得分的50%`, async (): Promise<CheckResult> => {
      if (playerList.length === 0) this.skip('晋级名单为空');
      let missing = 0;
      let mismatch = 0;
      const detail: string[] = [];
      for (const pl of playerList) {
        const amt = initScores.get(pl.player);
        if (amt === undefined) {
          missing++;
          if (detail.length < 3) detail.push(`${pl.player}无初始化积分`);
          continue;
        }
        const expected = pl.score * 0.5;
        if (Math.abs(amt - expected) > SCORE_TOLERANCE) {
          mismatch++;
          if (detail.length < 3) detail.push(`${pl.player}(${amt}≠${expected})`);
        }
      }
      const extra = initScores.size - (playerList.length - missing);
      const pass = missing === 0 && mismatch === 0 && extra === 0;
      return {
        expect: `初始化积分 ${playerList.length} 条且等于晋级名单得分的50%`,
        real: pass
          ? `全部一致 (${playerList.length})`
          : `缺失 ${missing}，分数不一致 ${mismatch}，多出 ${Math.max(extra, 0)}${detail.length ? ': ' + detail.join('; ') : ''}`,
        pass,
      };
    });
  }

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

    // 1. 原阶段是否完成结算
    await this.check(`[${title}] 原阶段(${p.oldTopic})结算 status=200`, async (): Promise<CheckResult> => {
      const r = await MySQLProdResource.query(
        'active',
        `select status from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.oldTopic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(p.locale)} limit 1`,
      );
      if (r.data.length === 0) return { expect: '200', real: '(无记录)', pass: false };
      const status = Number(r.data[0][0]);
      return { expect: '200', real: String(status), pass: status === 200 };
    });

    // 2. 原阶段奖励发放（按 player_type 核对数量与道具）
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

    // 3. 晋级名单
    await this.act(`[${title}] 获取晋级名单`, async () => {
      playerList = await this.fetchPlayerList(p.oldTopic, p.locale);
      this.log(`晋级名单 ${playerList.length} 个ID`);
    });

    await this.check(`[${title}] 晋级名单有 ${p.promoteCount} 个ID`, async (): Promise<CheckResult> => {
      return { expect: String(p.promoteCount), real: String(playerList.length), pass: playerList.length === p.promoteCount };
    });

    // 4. 新阶段是否初始化完成
    await this.check(`[${title}] 新阶段(${p.newTopic})初始化 status=100`, async (): Promise<CheckResult> => {
      const r = await MySQLProdResource.query(
        'active',
        `select status from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.newTopic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(p.locale)} limit 1`,
      );
      if (r.data.length === 0) return { expect: '100', real: '(无记录)', pass: false };
      const status = Number(r.data[0][0]);
      return { expect: '100', real: String(status), pass: status === 100 };
    });

    await this.checkInitScores(title, p.newTopic, p.locale, playerList);
  }

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
    let familyAward: { families: { id: string; members: string[] }[]; awarded: Set<string>; spec: { type: string; id: number } } | null = null;
    let playerList: { player: string; score: number }[] = [];

    // 1. 原阶段是否完成结算
    await this.check(`[${title}] 原阶段(${p.oldTopic})结算 status=200`, async (): Promise<CheckResult> => {
      const r = await MySQLProdResource.query(
        'active',
        `select status from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.oldTopic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(p.locale)} limit 1`,
      );
      if (r.data.length === 0) return { expect: '200', real: '(无记录)', pass: false };
      const status = Number(r.data[0][0]);
      return { expect: '200', real: String(status), pass: status === 200 };
    });

    // 2. 原阶段奖励发放（给前3名家族的成员，player_type=USER）
    await this.act(`[${title}] 获取前 ${p.awardTop} 名家族榜`, async () => {
      const rr = await this.rank.queryRank(BIZ, p.oldTopic, KEY_TOTAL, p.awardTop, p.locale);
      rankList = rr.list;
      this.log(`round.status=${rr.round.status}, 实际 ${rankList.length} 名`);
      if (rankList.length === 0) throw new Error('榜单为空');
    });

    await this.act(`[${title}] 获取发奖记录`, async () => {
      const cfg = this.awardCfg('家族榜', p.configStage);
      const spec = { type: cfg[0].type, id: cfg[0].id };
      const families: { id: string; members: string[] }[] = [];
      const allMembers: string[] = [];
      for (const it of rankList) {
        const members = await this.player.getMembersOfFamily(it.player);
        families.push({ id: it.player, members });
        for (const m of members) allMembers.push(m);
      }
      if (allMembers.length === 0) throw new Error('无可核查成员');
      const inList = allMembers.map((id) => quoteVal(id)).join(', ');
      const r = await MySQLProdResource.query(
        'active',
        `select distinct player from mod_common_award_record where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.oldTopic)} and player_type='USER' and award_type=${quoteStr(spec.type)} and award_id=${quoteNum(spec.id)} and player in (${inList}) and create_time between ${quoteNum(promoteMs - AWARD_LEAD_MS)} and ${quoteNum(promoteMs + AWARD_WINDOW_MS)}`,
      );
      const awarded = new Set(r.data.map((row) => String(row[0])));
      familyAward = { families, awarded, spec };
      this.log(`家族 ${families.length} 个，成员 ${allMembers.length} 名，已发放 ${awarded.size} 名 (${spec.type}#${spec.id})`);
    });

    await this.check(`[${title}] 奖励发放符合预期`, async (): Promise<CheckResult> => {
      if (!familyAward) this.skip('发奖记录未获取');
      let total = 0;
      let badFamilies = 0;
      const detail: string[] = [];
      for (const f of familyAward!.families) {
        const awardedCount = f.members.filter((m) => familyAward!.awarded.has(m)).length;
        total += f.members.length;
        if (f.members.length === 0 || awardedCount * 2 <= f.members.length) {
          badFamilies++;
          if (detail.length < 3) detail.push(`${f.id}(${awardedCount}/${f.members.length})`);
        }
      }
      const pass = total > 0 && badFamilies === 0;
      return {
        expect: `每个家族超过50%成员发放 ${familyAward!.spec.type}#${familyAward!.spec.id}（共 ${total} 名成员）`,
        real:
          badFamilies === 0
            ? `全部家族达标 (${total})`
            : `${badFamilies} 个家族未达50%${detail.length ? ': ' + detail.join('; ') : ''}`,
        pass,
      };
    });

    // 3. 晋级名单
    await this.act(`[${title}] 获取晋级名单`, async () => {
      playerList = await this.fetchPlayerList(p.oldTopic, p.locale);
      this.log(`晋级名单 ${playerList.length} 个ID`);
    });

    await this.check(`[${title}] 晋级名单有 ${p.promoteCount} 个ID`, async (): Promise<CheckResult> => {
      return { expect: String(p.promoteCount), real: String(playerList.length), pass: playerList.length === p.promoteCount };
    });

    // 4. 新阶段是否初始化完成
    await this.check(`[${title}] 新阶段(${p.newTopic})初始化 status=100`, async (): Promise<CheckResult> => {
      const r = await MySQLProdResource.query(
        'active',
        `select status from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.newTopic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(p.locale)} limit 1`,
      );
      if (r.data.length === 0) return { expect: '100', real: '(无记录)', pass: false };
      const status = Number(r.data[0][0]);
      return { expect: '100', real: String(status), pass: status === 100 };
    });

    await this.checkInitScores(title, p.newTopic, p.locale, playerList);
  }

  private async checkPlayerPromotion(p: PlayerPromotion): Promise<void> {
    const title = `陪玩榜 ${p.oldTopic}→${p.newTopic} / ${p.locale}`;
    const promoteMs = Date.parse(p.promoteTime);
    const stageStart = `2026-08-23T00:00:00${p.tz}`;
    const stageFinish = `2026-08-25T23:30:00${p.tz}`;

    if (Date.now() < promoteMs) {
      await this.act(`[${title}] 晋级时间预检`, () => {
        this.skip(`未到晋级时间 ${p.promoteTime}`);
      });
      return;
    }

    let rankList: RankItem[] = [];
    let awardSet: Set<string> | null = null;
    let playerList: { player: string; score: number }[] = [];

    // 1. 原阶段是否完成结算
    await this.check(`[${title}] 原阶段(${p.oldTopic})结算 status=200`, async (): Promise<CheckResult> => {
      const r = await MySQLProdResource.query(
        'active',
        `select status from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.oldTopic)} and ${'`key`'}=${quoteStr(KEY_TOTAL)} and locale=${quoteStr(p.locale)} limit 1`,
      );
      if (r.data.length === 0) return { expect: '200', real: '(无记录)', pass: false };
      const status = Number(r.data[0][0]);
      return { expect: '200', real: String(status), pass: status === 200 };
    });

    // 2. 原阶段奖励发放（名次奖励给陪玩 + 贡献top1用户）
    await this.act(`[${title}] 获取前 ${p.awardTop} 名总榜`, async () => {
      const rr = await this.rank.queryRank(BIZ, p.oldTopic, KEY_TOTAL, p.awardTop, p.locale);
      rankList = rr.list;
      this.log(`round.status=${rr.round.status}, 实际 ${rankList.length} 名`);
      if (rankList.length === 0) throw new Error('榜单为空');
    });

    await this.act(`[${title}] 获取发奖记录`, async () => {
      const ids: string[] = [];
      for (const it of rankList) {
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

    await this.check(`[${title}] 发奖符合预期`, async (): Promise<CheckResult> => {
      const cfg = this.awardCfg('陪玩榜', p.configStage);
      if (!awardSet) this.skip('发奖记录未获取');
      let missing = 0;
      let checked = 0;
      const detail: string[] = [];
      for (const it of rankList) {
        for (const e of expectedForRank(cfg, it.rank)) {
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

    // 3. 晋级名单
    await this.act(`[${title}] 获取晋级名单`, async () => {
      playerList = await this.fetchPlayerList(p.oldTopic, p.locale);
      this.log(`晋级名单 ${playerList.length} 个ID`);
    });

    await this.check(`[${title}] 晋级名单有 ${p.promoteCount} 个ID`, async (): Promise<CheckResult> => {
      return { expect: String(p.promoteCount), real: String(playerList.length), pass: playerList.length === p.promoteCount };
    });

    // 4. 新阶段是否初始化完成（状态 + 周期时间）
    await this.check(`[${title}] 新阶段(${p.newTopic})初始化 status=100 且周期正确`, async (): Promise<CheckResult> => {
      return this.checkRoundStatusAndPeriod(p.newTopic, p.locale, stageStart, stageFinish);
    });

    await this.checkInitScores(title, p.newTopic, p.locale, playerList);

    // 5. 新阶段 1v1 PK 是否初始化完成
    await this.check(`[${title}] 1v1阶段(${p.newTopic1v1})初始化 status=100 且周期正确`, async (): Promise<CheckResult> => {
      return this.checkRoundStatusAndPeriod(p.newTopic1v1, p.locale, stageStart, stageFinish);
    });

    await this.check(`[${title}] 第一期PK对阵数据(key=${FIRST_PERIOD_KEY})`, async (): Promise<CheckResult> => {
      if (Date.now() < Date.parse(stageStart)) this.skip(`第一期尚未开始 (${stageStart})`);
      const rr = await MySQLProdResource.query(
        'active',
        `select status from mod_common_round where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.newTopic1v1)} and ${'`key`'}=${quoteStr(FIRST_PERIOD_KEY)} and locale=${quoteStr(p.locale)} limit 1`,
      );
      if (rr.data.length === 0) return { expect: `status=100, 对阵${p.pairCount}条`, real: '(无对阵轮次)', pass: false };
      const roundStatus = Number(rr.data[0][0]);
      const pr = await MySQLProdResource.query(
        'active',
        `select count(*) from mod_buff11pk_pair where biz=${quoteStr(BIZ)} and topic=${quoteStr(p.newTopic1v1)} and ${'`key`'}=${quoteStr(FIRST_PERIOD_KEY)} and locale=${quoteStr(p.locale)}`,
      );
      const pairs = Number(pr.data[0][0]);
      const pass = roundStatus === 100 && pairs === p.pairCount;
      return {
        expect: `status=100, 对阵${p.pairCount}条`,
        real: `status=${roundStatus}, 对阵${pairs}条`,
        pass,
      };
    });
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
}

await new Day6Check().execute();
