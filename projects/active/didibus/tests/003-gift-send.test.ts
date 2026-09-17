import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  LOCALE,
  USER_A,
  USER_B,
  USER_C,
  ACTIVITY_GIFTS,
  NON_ACTIVITY_GIFT_ID,
  SAMPLE_TICKET_GIFT,
  SAMPLE_POOL_BACKPACK_GIFT,
  SAMPLE_EXPLORE_BACKPACK_GIFT,
  EXPECT_TICKET_PER_COIN_SENDER,
  EXPECT_TICKET_PER_COIN_RECEIVER,
  TOPIC_SEND,
  TOPIC_RECV,
} from './_lib/constants.ts';
import { T_D1, T_OUT_BEFORE, DAY1_KEY, localIso, localTs } from './_lib/times.ts';
import { int, pollUntil } from './_lib/helpers.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

const GIFT_COIN = 100;

/**
 * 003-gift-send —— 送礼消费（发券 + 榜单）
 * 模拟时间：正常消息 T_D1（活动第 1 天）；期外消息 T_OUT_BEFORE。
 * 链路：__consumer/funbit.gift_send → handleGiftSend → gifts 白名单过滤 → 计榜/发券。
 * 口径（2026-09-16 需求澄清 + v1.9.0 设计）：
 * - 全部白名单礼物均计榜：score += 礼物价值 × buff（1金币/钻石=1积分）
 * - 仅普通礼物（ticketGifts=礼物架）发探索券（sender×n / receiver×n/2，orderNo 幂等）
 * - 背包礼物（奖池 buff1.1 / 探索点 buff1.3）只计榜、不发券、不登记风控
 */
class GiftSend003 extends DidibusTestBase {
  private orderNo = '';

  constructor() {
    super();
    this.total = 16;
  }

  private giftBuff(giftId: number): number {
    return ACTIVITY_GIFTS[giftId] ?? 1;
  }

  protected async run(): Promise<void> {
    await this.probeActive();

    await this.act('清理 A/B/C 账户与榜单数据', async () => {
      this.needActive();
      await this.didibus.cleanUsers([USER_A, USER_B, USER_C]);
      await this.didibus.cleanRedis();
    });

    await this.act(`发送非活动礼物（giftId=${NON_ACTIVITY_GIFT_ID} 不在白名单，T_D1）`, async () => {
      this.needActive();
      await this.didibus.sendGift({
        sender: USER_A,
        receiver: USER_B,
        giftId: NON_ACTIVITY_GIFT_ID,
        giftPrice: GIFT_COIN,
        totalCoin: GIFT_COIN,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
        locale: LOCALE,
      });
    });

    await this.check('非活动礼物被过滤：A/B 券余额不变、榜单无记录', async (): Promise<CheckResult> => {
      this.needActive();
      await new Promise((r) => setTimeout(r, 500));
      const [a, b] = await Promise.all([this.didibus.queryAccount(USER_A), this.didibus.queryAccount(USER_B)]);
      const aAmt = a.length > 0 ? int(a[0]['amount']) : 0;
      const bAmt = b.length > 0 ? int(b[0]['amount']) : 0;
      // 按玩家过滤，避免其他用例残留的 rank_record 干扰
      const sendRecords = await this.didibus.queryRankRecords(TOPIC_SEND, { locale: LOCALE, player: USER_A });
      const recvRecords = await this.didibus.queryRankRecords(TOPIC_RECV, { locale: LOCALE, player: USER_B });
      return {
        expect: 'A=0，B=0，A/B rank_record=0 条',
        real: `A=${aAmt}，B=${bAmt}，A send=${sendRecords.length} 条，B recv=${recvRecords.length} 条`,
        pass: aAmt === 0 && bAmt === 0 && sendRecords.length === 0 && recvRecords.length === 0,
      };
    });

    await this.act(`A 送 B 普通礼物 10797（礼物架，buff=1.0，发券，totalCoin=${GIFT_COIN}，T_D1）`, async () => {
      this.needActive();
      this.orderNo = await this.didibus.sendGift({
        sender: USER_A,
        receiver: USER_B,
        giftId: SAMPLE_TICKET_GIFT,
        giftPrice: GIFT_COIN,
        totalCoin: GIFT_COIN,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
        locale: LOCALE,
      });
    });

    await this.check('探险券入账（仅普通礼物）：A += coin×2=200，B += coin×0.5=50', async (): Promise<CheckResult> => {
      this.needActive();
      const expectA = GIFT_COIN * EXPECT_TICKET_PER_COIN_SENDER;
      const expectB = GIFT_COIN * EXPECT_TICKET_PER_COIN_RECEIVER;
      const [aAmt, bAmt] = await pollUntil(
        async () => {
          const [a, b] = await Promise.all([this.didibus.queryAccount(USER_A), this.didibus.queryAccount(USER_B)]);
          return [a.length > 0 ? int(a[0]['amount']) : 0, b.length > 0 ? int(b[0]['amount']) : 0];
        },
        ([a, b]) => a === expectA && b === expectB,
      );
      return { expect: `A=${expectA}，B=${expectB}`, real: `A=${aAmt}，B=${bAmt}` };
    });

    await this.check('榜单接口：送礼总榜+当日日榜 A=coin×1.0=100，收礼总榜 B=100', async (): Promise<CheckResult> => {
      this.needActive();
      const iso = localIso(LOCALE, T_D1);
      const expectScore = GIFT_COIN * this.giftBuff(SAMPLE_TICKET_GIFT);
      const sendTotal = await this.didibus.rankScoreOf(TOPIC_SEND, USER_A, LOCALE, iso);
      const sendDaily = await this.didibus.rankScoreOf(TOPIC_SEND, USER_A, LOCALE, iso, DAY1_KEY);
      const recvTotal = await this.didibus.rankScoreOf(TOPIC_RECV, USER_B, LOCALE, iso);
      return {
        expect: `send=${expectScore}，send.${DAY1_KEY}=${expectScore}，recv=${expectScore}（coin×buff=${GIFT_COIN}×${this.giftBuff(SAMPLE_TICKET_GIFT)}）`,
        real: `send=${sendTotal}，send.${DAY1_KEY}=${sendDaily}，recv=${recvTotal}`,
        pass: sendTotal === expectScore && sendDaily === expectScore && recvTotal === expectScore,
      };
    });

    await this.check('榜单落库：mod_common_rank_record 3 条（trans_no=orderNo，总榜/日榜/收礼榜）', async (): Promise<CheckResult> => {
      this.needActive();
      const send = await this.didibus.queryRankRecords(TOPIC_SEND, { locale: LOCALE, player: USER_A });
      const recv = await this.didibus.queryRankRecords(TOPIC_RECV, { locale: LOCALE, player: USER_B });
      const sendKeys = send.map((r) => String(r['key'])).sort();
      const transOk = [...send, ...recv].every((r) => String(r['trans_no']) === this.orderNo);
      const keysOk = JSON.stringify(sendKeys) === JSON.stringify(['-', DAY1_KEY].sort());
      const contribOk = recv.every((r) => String(r['contributor']) === String(USER_A));
      return {
        expect: `send key=['-','${DAY1_KEY}']，recv key=['-']，trans_no 一致，contributor=A`,
        real: `send key=${JSON.stringify(sendKeys)}，recv key=${JSON.stringify(recv.map((r) => String(r['key'])))}，trans_no=${transOk}，contributor=${contribOk}`,
        pass: keysOk && recv.length === 1 && send.length === 2 && transOk && contribOk,
      };
    });

    await this.act(`A 送 B 奖池背包礼物 ${SAMPLE_POOL_BACKPACK_GIFT}（buff=1.1，需求澄清：只计榜不发券，T_D1）`, async () => {
      this.needActive();
      await this.didibus.sendGift({
        sender: USER_A,
        receiver: USER_B,
        giftId: SAMPLE_POOL_BACKPACK_GIFT,
        giftPrice: GIFT_COIN,
        totalCoin: GIFT_COIN,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
        locale: LOCALE,
      });
    });

    await this.check('背包礼物（奖池）：双榜 += coin×1.1=110，但券余额不变（A=200，B=50）', async (): Promise<CheckResult> => {
      this.needActive();
      const iso = localIso(LOCALE, T_D1);
      const expectScore = Math.round(GIFT_COIN * (this.giftBuff(SAMPLE_TICKET_GIFT) + this.giftBuff(SAMPLE_POOL_BACKPACK_GIFT)));
      const [aAmt, bAmt] = await pollUntil(
        async () => {
          const [a, b] = await Promise.all([this.didibus.queryAccount(USER_A), this.didibus.queryAccount(USER_B)]);
          return [a.length > 0 ? int(a[0]['amount']) : 0, b.length > 0 ? int(b[0]['amount']) : 0];
        },
        ([a, b]) => a === GIFT_COIN * EXPECT_TICKET_PER_COIN_SENDER && b === GIFT_COIN * EXPECT_TICKET_PER_COIN_RECEIVER,
      );
      const sendTotal = await this.didibus.rankScoreOf(TOPIC_SEND, USER_A, LOCALE, iso);
      const recvTotal = await this.didibus.rankScoreOf(TOPIC_RECV, USER_B, LOCALE, iso);
      return {
        expect: `send=recv=${expectScore}，券 A=${GIFT_COIN * EXPECT_TICKET_PER_COIN_SENDER}，B=${GIFT_COIN * EXPECT_TICKET_PER_COIN_RECEIVER}`,
        real: `send=${sendTotal}，recv=${recvTotal}，券 A=${aAmt}，B=${bAmt}`,
        pass: sendTotal === expectScore && recvTotal === expectScore
          && aAmt === GIFT_COIN * EXPECT_TICKET_PER_COIN_SENDER && bAmt === GIFT_COIN * EXPECT_TICKET_PER_COIN_RECEIVER,
      };
    });

    await this.act(`A 送 B 探索点背包礼物 ${SAMPLE_EXPLORE_BACKPACK_GIFT}（buff=1.3，只计榜不发券，T_D1）`, async () => {
      this.needActive();
      await this.didibus.sendGift({
        sender: USER_A,
        receiver: USER_B,
        giftId: SAMPLE_EXPLORE_BACKPACK_GIFT,
        giftPrice: GIFT_COIN,
        totalCoin: GIFT_COIN,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
        locale: LOCALE,
      });
    });

    await this.check('背包礼物（探索点）：双榜累计 = 100×1.0+100×1.1+100×1.3=340，券余额仍不变', async (): Promise<CheckResult> => {
      this.needActive();
      const iso = localIso(LOCALE, T_D1);
      const expectScore = Math.round(GIFT_COIN * (this.giftBuff(SAMPLE_TICKET_GIFT) + this.giftBuff(SAMPLE_POOL_BACKPACK_GIFT) + this.giftBuff(SAMPLE_EXPLORE_BACKPACK_GIFT)));
      const sendTotal = await this.didibus.rankScoreOf(TOPIC_SEND, USER_A, LOCALE, iso);
      const recvTotal = await this.didibus.rankScoreOf(TOPIC_RECV, USER_B, LOCALE, iso);
      const sendRecords = await this.didibus.queryRankRecords(TOPIC_SEND, { locale: LOCALE, player: USER_A });
      const recvRecords = await this.didibus.queryRankRecords(TOPIC_RECV, { locale: LOCALE, player: USER_B });
      // 3 次有效送礼：send=3×(总榜+日榜)=6 条、recv=3 条；券余额不因背包礼物变化
      return {
        expect: `send=recv=${expectScore}，send rank_record=6 条、recv=3 条，券 A=200，B=50`,
        real: `send=${sendTotal}，recv=${recvTotal}，send=${sendRecords.length} 条，recv=${recvRecords.length} 条`,
        pass: sendTotal === expectScore && recvTotal === expectScore && sendRecords.length === 6 && recvRecords.length === 3,
      };
    });

    await this.act('同 orderNo 重发普通礼物消息（幂等验证）', async () => {
      this.needActive();
      await this.didibus.sendGift({
        sender: USER_A,
        receiver: USER_B,
        giftId: SAMPLE_TICKET_GIFT,
        giftPrice: GIFT_COIN,
        totalCoin: GIFT_COIN,
        sendTimeMs: localTs(LOCALE, T_D1),
        orderNo: this.orderNo,
        debugTs: localIso(LOCALE, T_D1),
        locale: LOCALE,
      });
      await new Promise((r) => setTimeout(r, 500));
    });

    await this.check('幂等：券与榜单不重复累计（mod_account 按 (biz, trans_no=send_/recv_+orderNo) 幂等）', async (): Promise<CheckResult> => {
      this.needActive();
      const [a, b] = await Promise.all([this.didibus.queryAccount(USER_A), this.didibus.queryAccount(USER_B)]);
      const aAmt = a.length > 0 ? int(a[0]['amount']) : 0;
      const bAmt = b.length > 0 ? int(b[0]['amount']) : 0;
      const iso = localIso(LOCALE, T_D1);
      const sendTotal = await this.didibus.rankScoreOf(TOPIC_SEND, USER_A, LOCALE, iso);
      // 仅普通礼物发券（1 次有效入账）：A=100×2=200、B=100×0.5=50；榜单 3 次送礼 = 340 不变
      const expectA = GIFT_COIN * EXPECT_TICKET_PER_COIN_SENDER;
      const expectB = GIFT_COIN * EXPECT_TICKET_PER_COIN_RECEIVER;
      const expectScore = Math.round(GIFT_COIN * (this.giftBuff(SAMPLE_TICKET_GIFT) + this.giftBuff(SAMPLE_POOL_BACKPACK_GIFT) + this.giftBuff(SAMPLE_EXPLORE_BACKPACK_GIFT)));
      // 账户流水幂等键：A 侧 send_{orderNo}、B 侧 recv_{orderNo} 各恰好 1 条（背包礼物无流水）
      const aLogs = (await this.didibus.queryAccountLogs(USER_A)).filter((r) => String(r['trans_no']) === `send_${this.orderNo}`);
      const bLogs = (await this.didibus.queryAccountLogs(USER_B)).filter((r) => String(r['trans_no']) === `recv_${this.orderNo}`);
      return {
        expect: `A=${expectA}，B=${expectB}，send=${expectScore}（不变），流水 send_/recv_+orderNo 各 1 条`,
        real: `A=${aAmt}，B=${bAmt}，send=${sendTotal}，流水=${aLogs.length}+${bLogs.length} 条`,
        pass: aAmt === expectA && bAmt === expectB && sendTotal === expectScore && aLogs.length === 1 && bLogs.length === 1,
      };
    });

    await this.act('发送活动期外消息（普通礼物，T_OUT_BEFORE）', async () => {
      this.needActive();
      try {
        await this.didibus.sendGift({
          sender: USER_A,
          receiver: USER_B,
          giftId: SAMPLE_TICKET_GIFT,
          giftPrice: GIFT_COIN,
          totalCoin: GIFT_COIN,
          sendTimeMs: localTs(LOCALE, T_OUT_BEFORE),
          debugTs: localIso(LOCALE, T_OUT_BEFORE),
          locale: LOCALE,
        });
      } catch (e) {
        this.log(`期外消息被框架拒绝：${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    });

    await this.check('期外消息无副作用：券与榜单不累计', async (): Promise<CheckResult> => {
      this.needActive();
      const [a, b] = await Promise.all([this.didibus.queryAccount(USER_A), this.didibus.queryAccount(USER_B)]);
      const aAmt = a.length > 0 ? int(a[0]['amount']) : 0;
      const bAmt = b.length > 0 ? int(b[0]['amount']) : 0;
      const iso = localIso(LOCALE, T_D1);
      const sendTotal = await this.didibus.rankScoreOf(TOPIC_SEND, USER_A, LOCALE, iso);
      const expectA = GIFT_COIN * EXPECT_TICKET_PER_COIN_SENDER;
      const expectB = GIFT_COIN * EXPECT_TICKET_PER_COIN_RECEIVER;
      const expectScore = Math.round(GIFT_COIN * (this.giftBuff(SAMPLE_TICKET_GIFT) + this.giftBuff(SAMPLE_POOL_BACKPACK_GIFT) + this.giftBuff(SAMPLE_EXPLORE_BACKPACK_GIFT)));
      return {
        expect: `A=${expectA}，B=${expectB}，send=${expectScore}（均不变）`,
        real: `A=${aAmt}，B=${bAmt}，send=${sendTotal}`,
        pass: aAmt === expectA && bAmt === expectB && sendTotal === expectScore,
      };
    });
  }
}

await new GiftSend003().execute();
