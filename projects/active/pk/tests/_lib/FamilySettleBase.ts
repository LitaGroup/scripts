import { type CheckResult } from '../../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../../src/base/TestBaseClass.ts';
import { isoMs, localMs } from '../../../../../src/base/TimeUtils.ts';
import type { FamilyRankEntry } from '../../../../../src/services/PkFamilyService.ts';
import {
  TITLE_FAMILY_PASS,
  CONTENT_FAMILY_PASS,
  TITLE_FAMILY_FINAL,
  CONTENT_FAMILY_FINAL_TOP1,
  CONTENT_FAMILY_FINAL_TOP23,
  type MessageParams,
} from '../../../../../src/services/LitaTeamMessageService.ts';
import type { ExpectedAwards } from './expectedAwards.ts';
import {
  assertPlayerListMatchRank,
  checkFamilyAwardConfig,
  checkFamilySelfAwards,
  checkMemberAwards,
  type FamilyStore,
} from './familyAssertions.ts';
import { FAMILY_IDS, GIFT_BUFF, IN_LOCALE, TEST_FAMILIES } from './constants.ts';

const SEND_COUNT_PER_FAMILY = 10;
const GIFT_PRICE = 1000;
const GIFT_IDS = Object.keys(GIFT_BUFF).map(Number).sort((a, b) => a - b);

export interface SettleConfig {
  topic: string;
  prevTopic?: string;
  initTs?: string;
  hasInit: boolean;
  statusToSet: number;
  sendDay: string;
  sendDebugTs: string;
  settleTs: string;
  settleTitle: string;
  rankDebugTs: string;
  rankCount: number;
  topN: number;
  memberExpected: ExpectedAwards;
  selfExpected: ExpectedAwards;
  litaFinal?: boolean;
}

function int(v: unknown): number {
  return Math.trunc(Number(v));
}

function float(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeTotal(c: SettleConfig): number {
  let total = 3;
  if (c.hasInit) total += 2;
  total += 1 + 1 + 1 + 1 + 1 + 1; // awardConfig + sendGifts + getRank + settle + playerListExists + playerListMatchRank
  if (Object.keys(c.memberExpected).length > 0) total += 1;
  if (Object.keys(c.selfExpected).length > 0) total += 1;
  total += 1; // litaTeam
  return total;
}

/**
 * 家族榜结算类用例基类：初始化/送礼造数/结算/白名单/发奖/LitaTeam 校验。
 * 002-007 共用同一套编排，仅配置不同。
 */
export abstract class FamilySettleBase extends TestBaseClass {
  protected store: FamilyStore = {};
  protected readonly cfg: SettleConfig;

  constructor(cfg: SettleConfig) {
    super();
    this.cfg = cfg;
    this.total = computeTotal(cfg);
  }

  protected async run(): Promise<void> {
    const c = this.cfg;

    await this.act(`重置 ${c.topic} round status=${c.statusToSet}`, async () => {
      await this.family.resetRoundStatus(c.topic, c.statusToSet);
    });
    await this.act('清理排行榜 Redis 数据', async () => {
      await this.family.cleanRankRedis(c.topic);
    });
    await this.act('清理历史送礼/白名单/奖励记录', async () => {
      await this.family.cleanHistory(c.topic);
    });

    if (c.hasInit) {
      await this.act(`调用 ${c.topic} init 接口`, async () => {
        await this.family.callInit(c.topic, c.initTs!, TEST_FAMILIES[FAMILY_IDS[0]][0]);
        this.store.initTsMs = isoMs(c.initTs!);
      });
      await this.check('初始化积分与上一阶段白名单一致（数量与得分）', async (): Promise<CheckResult> => {
        return this.checkInitRank();
      });
    }

    await this.check('家族奖励配置与 config 一致', async (): Promise<CheckResult> => {
      return this.checkAwardConfig();
    });

    await this.act(`每个家族成员送礼 ${SEND_COUNT_PER_FAMILY} 次`, async () => {
      await this.sendGifts();
    });
    await this.act(`获取家族榜前 ${c.rankCount} 名`, async () => {
      await this.getRank();
    });
    await this.act(c.settleTitle, async () => {
      await this.callSettle();
    });

    await this.check('mod_common_player_list 白名单已生成', async (): Promise<CheckResult> => {
      return this.checkPlayerListExists();
    });
    await this.check('白名单与接口记录数量一致、名次一致', async (): Promise<CheckResult> => {
      assertPlayerListMatchRank(this.store);
      return { expect: '白名单与接口一致', real: '一致', pass: true };
    });

    if (Object.keys(c.memberExpected).length > 0) {
      await this.check('家族 top1-3 全体成员发奖与配置一致', async (): Promise<CheckResult> => {
        await checkMemberAwards(this.family, this.store, c.topic, c.topN, c.memberExpected);
        return { expect: '全部成员发奖匹配', real: '匹配', pass: true };
      });
    }
    if (Object.keys(c.selfExpected).length > 0) {
      await this.check('家族 top1-3 家族本体发奖与配置一致', async (): Promise<CheckResult> => {
        await checkFamilySelfAwards(this.family, this.store, c.topic, c.topN, c.selfExpected);
        return { expect: '全部家族本体发奖匹配', real: '匹配', pass: true };
      });
    }

    await this.check('晋级家族的家族长/管理员收到 LitaTeam 消息', async (): Promise<CheckResult> => {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 消息落库有延迟，等待 1s 再查
      if (c.litaFinal) {
        await this.checkLitaTeamFinal();
      } else {
        await this.checkLitaTeamPass();
      }
      return { expect: '收到 LitaTeam 消息', real: '匹配', pass: true };
    });
  }

  private async checkInitRank(): Promise<CheckResult> {
    const c = this.cfg;
    const prevRows = await this.family.queryPlayerList(c.prevTopic!);
    if (prevRows.length === 0) throw new Error(`上一阶段 ${c.prevTopic} 白名单为空，无法初始化`);
    const resp = await this.family.queryRank(c.topic, '-', TEST_FAMILIES[FAMILY_IDS[0]][0], {
      debugTs: c.rankDebugTs,
      count: c.rankCount,
    });
    const rankResult = resp?.rankResult ?? [];
    if (rankResult.length !== prevRows.length) {
      throw new Error(`初始化后本阶段接口记录 ${rankResult.length} 条，与上一阶段白名单 ${prevRows.length} 条不一致`);
    }
    const listMap = new Map<number, number>(prevRows.map((r) => [int(r['player']), int(float(r['score']))]));
    const rankMap = new Map<number, number>(rankResult.map((r) => [int(r['player']), int(r['amount'] ?? 0)]));
    const onlyList = [...listMap.keys()].filter((p) => !rankMap.has(p)).sort((a, b) => a - b);
    const onlyRank = [...rankMap.keys()].filter((p) => !listMap.has(p)).sort((a, b) => a - b);
    if (onlyList.length || onlyRank.length) {
      throw new Error(`家族集合不一致：仅白名单 ${JSON.stringify(onlyList)}，仅接口 ${JSON.stringify(onlyRank)}`);
    }
    for (const [player, score] of listMap) {
      if (score !== rankMap.get(player)) {
        throw new Error(`家族 ${player} 初始化积分应为 ${score}（上一阶段白名单），实际接口返回 ${rankMap.get(player)}`);
      }
    }
    return { expect: `与上一阶段 ${c.prevTopic} 白名单一致`, real: `${rankResult.length} 个家族积分一致`, pass: true };
  }

  private async checkAwardConfig(): Promise<CheckResult> {
    const c = this.cfg;
    const rows = await checkFamilyAwardConfig(this.family, c.topic, c.memberExpected, c.selfExpected);
    this.store.awardConfig = rows;
    return { expect: '与 config 一致', real: `mod=ADD 配置 ${rows.length} 条`, pass: true };
  }

  private async sendGifts(): Promise<void> {
    const c = this.cfg;
    const orderNos: string[] = [];
    const sendMs = localMs(IN_LOCALE, c.sendDay) + 10 * 3600 * 1000;
    for (const familyId of FAMILY_IDS) {
      const members = TEST_FAMILIES[familyId];
      for (let i = 0; i < SEND_COUNT_PER_FAMILY; i++) {
        const sender = members[i % members.length];
        const receiver = members[(i + 1) % members.length];
        const giftId = GIFT_IDS[Math.floor(Math.random() * GIFT_IDS.length)];
        const orderNo = await this.family.sendGift({
          sender,
          receiver,
          familyId,
          giftId,
          giftPrice: GIFT_PRICE,
          sendTimeMs: sendMs,
          debugTs: c.sendDebugTs,
        });
        orderNos.push(orderNo);
      }
    }
    this.store.orderNos = orderNos;
    this.store.sendMs = sendMs;
  }

  private async getRank(): Promise<void> {
    const c = this.cfg;
    const resp = await this.family.queryRank(c.topic, '-', TEST_FAMILIES[FAMILY_IDS[0]][0], {
      debugTs: c.rankDebugTs,
      count: c.rankCount,
    });
    const rankResult = resp?.rankResult ?? [];
    const families: FamilyRankEntry[] = rankResult.map((r) => ({
      player: int(r['player']),
      amount: int(r['amount'] ?? 0),
      rank: int(r['rank'] ?? 0),
    }));
    if (families.length === 0) throw new Error(`${c.topic} 榜单为空`);
    this.store.families = families;
  }

  private async callSettle(): Promise<void> {
    const c = this.cfg;
    await this.family.callFamilySettle(c.settleTs);
    this.store.settleMs = isoMs(c.settleTs);
  }

  private async checkPlayerListExists(): Promise<CheckResult> {
    const c = this.cfg;
    await sleep(3000);
    const rows = await this.family.queryPlayerList(c.topic);
    if (rows.length === 0) throw new Error(`结算后应生成 ${c.topic} 白名单记录`);
    this.store.playerList = rows;
    return { expect: '白名单非空', real: `${rows.length} 条`, pass: true };
  }

  private async checkLitaTeamPass(): Promise<void> {
    const c = this.cfg;
    const qualifying = (this.store.playerList ?? []).map((r) => int(r['player']));
    if (qualifying.length === 0) throw new Error('缺少晋级家族，无法校验 LitaTeam 消息');
    const rankMap = new Map<number, number>((this.store.families ?? []).map((f) => [f.player, f.rank]));
    const receivers = await this.family.queryFamilyReceivers(qualifying);
    const groups: number[][] = [];
    const paramsList: MessageParams[] = [];
    for (const fid of qualifying) {
      const g = receivers[fid] ?? [];
      if (g.length) {
        groups.push(g);
        paramsList.push({ 1: rankMap.get(fid) ?? 1 });
      }
    }
    if (groups.length === 0) throw new Error('未找到晋级家族的家族长/管理员，无法校验 LitaTeam 消息');
    await this.litaTeam.checkAnyUser(groups, TITLE_FAMILY_PASS, CONTENT_FAMILY_PASS, paramsList, { locale: 'in' });
  }

  private async checkLitaTeamFinal(): Promise<void> {
    const families = this.store.families ?? [];
    const top3: Record<number, number> = {};
    for (let i = 0; i < Math.min(3, families.length); i++) {
      top3[families[i].rank] = families[i].player;
    }
    const receivers = await this.family.queryFamilyReceivers(Object.values(top3));
    const entries: Array<[number, string]> = [
      [1, CONTENT_FAMILY_FINAL_TOP1],
      [2, CONTENT_FAMILY_FINAL_TOP23],
      [3, CONTENT_FAMILY_FINAL_TOP23],
    ];
    for (const [rank, contentKey] of entries) {
      const fid = top3[rank];
      if (fid === undefined) continue;
      const group = receivers[fid] ?? [];
      if (group.length === 0) continue;
      await this.litaTeam.checkAnyUser([group], TITLE_FAMILY_FINAL, contentKey, undefined, { locale: 'in' });
    }
  }
}
