import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { IN, RUN_DEBUG_TS, initTopic, queryRank, sendGift } from './_lib/pk2612.ts';

const SENDER = 13126;
const RECEIVER = 13127;
const DAY_KEY = '20261218';
const SEND_TS = Date.parse('2026-12-18T10:00:00+07:00');

/** 六周年兜底礼物 Buff；Q22 正式数值提供后按配置表更新 */
const GIFT_NORMAL = 10561; // buff 1.0
const GIFT_DOUBLE = 10628; // buff 2.0
const GIFT_UNCONFIGURED = 10001; // 未配置 giftBuffs，不应计分

function amountOf(resp: Awaited<ReturnType<typeof queryRank>>, player: number): number {
  const mine = resp.my ?? resp.myAll?.find((r) => Number(r.player) === player) ?? resp.rankResult?.find((r) => Number(r.player) === player);
  return mine ? Number(mine.amount ?? 0) : 0;
}

/**
 * TK-0649 / 2612 年度 PK：活动礼物与 Buff 用例。
 *
 * 覆盖：
 * - 活动礼物展示（stageGifts）12 个，分阶段 4/4/4，特殊礼物 2 个。
 * - giftBuffs 计分行为：1.0 倍礼物、2.0 倍礼物、未配置礼物不发分（同一送礼人，用户等级 Buff 相同，比值可判定）。
 *
 * 依赖：Q22 礼物 ID/Buff 正式数值未提供前沿用六周年数值（需求澄清 Q22 兜底）。
 */
class Pk2612GiftBuff extends TestBaseClass {
  constructor() {
    super();
    this.total = 5;
  }

  protected async run(): Promise<void> {
    await this.act('初始化用户榜轮次（用于礼物计分）', async () => {
      await initTopic(this.api, 'user');
    });

    await this.check('活动礼物展示 12 个，阶段分布 4/4/4，特殊礼物 2 个', async (): Promise<CheckResult> => {
      const data = (await this.api.request('active/v3/pk-v202612/active-gifts', {
        body: {},
        locale: IN,
        debugTimestamp: RUN_DEBUG_TS,
      })) as { gifts?: Array<{ stage?: number; special?: boolean }> };
      const gifts = data?.gifts ?? [];
      const stage1 = gifts.filter((g) => Number(g.stage) === 1).length;
      const stage2 = gifts.filter((g) => Number(g.stage) === 2).length;
      const stage0 = gifts.filter((g) => Number(g.stage) === 0).length;
      const special = gifts.filter((g) => g.special === true).length;
      return {
        expect: 'total=12, stage1=4, stage2=4, stage0=4, special=2',
        real: `total=${gifts.length}, stage1=${stage1}, stage2=${stage2}, stage0=${stage0}, special=${special}`,
        pass: gifts.length === 12 && stage1 === 4 && stage2 === 4 && stage0 === 4 && special === 2,
      };
    });

    await this.check('2 倍礼物按 giftBuffs 计分，1 倍礼物为基准（比值 2）', async (): Promise<CheckResult> => {
      const before = amountOf(await queryRank(this.api, 'user', DAY_KEY, IN, SENDER, RUN_DEBUG_TS), SENDER);
      await sendGift(this.api, { sender: SENDER, receiver: RECEIVER, giftId: GIFT_NORMAL, giftPrice: 1000, sendTimeMs: SEND_TS, locale: IN });
      const afterNormal = amountOf(await queryRank(this.api, 'user', DAY_KEY, IN, SENDER, RUN_DEBUG_TS), SENDER);
      await sendGift(this.api, { sender: SENDER, receiver: RECEIVER, giftId: GIFT_DOUBLE, giftPrice: 1000, sendTimeMs: SEND_TS + 60_000, locale: IN });
      const afterDouble = amountOf(await queryRank(this.api, 'user', DAY_KEY, IN, SENDER, RUN_DEBUG_TS), SENDER);
      const deltaNormal = afterNormal - before;
      const deltaDouble = afterDouble - afterNormal;
      return {
        expect: `1 倍礼物增量 > 0，2 倍礼物增量 = 2 × 1 倍增量`,
        real: `before=${before}, afterNormal=${afterNormal}, afterDouble=${afterDouble}, deltaNormal=${deltaNormal}, deltaDouble=${deltaDouble}`,
        pass: deltaNormal > 0 && deltaDouble === deltaNormal * 2,
      };
    });

    await this.check('未配置 giftBuffs 的礼物不计分（增量 0）', async (): Promise<CheckResult> => {
      const before = amountOf(await queryRank(this.api, 'user', DAY_KEY, IN, SENDER, RUN_DEBUG_TS), SENDER);
      await sendGift(this.api, {
        sender: SENDER,
        receiver: RECEIVER,
        giftId: GIFT_UNCONFIGURED,
        giftPrice: 1000,
        sendTimeMs: SEND_TS + 120_000,
        locale: IN,
      });
      const after = amountOf(await queryRank(this.api, 'user', DAY_KEY, IN, SENDER, RUN_DEBUG_TS), SENDER);
      return {
        expect: '榜单积分增量 0',
        real: `before=${before}, after=${after}, delta=${after - before}`,
        pass: after - before === 0,
      };
    });

    await this.check('用户榜日榜 key 为送礼日 20261218 且当前积分可查询', async (): Promise<CheckResult> => {
      const resp = await queryRank(this.api, 'user', DAY_KEY, IN, SENDER, RUN_DEBUG_TS);
      const round = (resp as { round?: { key?: string; startTime?: number } }).round;
      return {
        expect: `round.key=${DAY_KEY}`,
        real: `round.key=${String(round?.key ?? 'null')}, startTime=${Number(round?.startTime ?? 0)}`,
        pass: String(round?.key ?? '') === DAY_KEY,
      };
    });
  }
}

await new Pk2612GiftBuff().execute();
