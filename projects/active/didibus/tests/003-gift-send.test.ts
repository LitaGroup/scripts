import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  LOCALE,
  USER_A,
  USER_B,
  USER_C,
  ACTIVITY_GIFTS,
  NON_ACTIVITY_GIFT_ID,
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
 * 链路：__consumer/funbit.gift_send → handleGiftSend → 白名单过滤 → 发券（sender×n / receiver×n/2）→ 送礼总榜+日榜、收礼总榜。
 */
class GiftSend003 extends DidibusTestBase {
  private giftId = 0;
  private orderNo = '';

  constructor() {
    super();
    this.total = 12;
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
      const records = await this.didibus.queryRankRecords(TOPIC_SEND, { locale: LOCALE });
      return {
        expect: 'A=0，B=0，rank_record=0 条',
        real: `A=${aAmt}，B=${bAmt}，rank_record=${records.length} 条`,
        pass: aAmt === 0 && bAmt === 0 && records.length === 0,
      };
    });

    await this.act(`发送活动礼物 totalCoin=${GIFT_COIN}（T_D1）`, async () => {
      this.needActive();
      const ids = Object.keys(ACTIVITY_GIFTS).map(Number);
      if (ids.length === 0) this.skip('活动礼物 ID 待提供（_lib/constants.ts ACTIVITY_GIFTS 为空）');
      this.giftId = ids[0];
      this.orderNo = await this.didibus.sendGift({
        sender: USER_A,
        receiver: USER_B,
        giftId: this.giftId,
        giftPrice: GIFT_COIN,
        totalCoin: GIFT_COIN,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
        locale: LOCALE,
      });
    });

    await this.check('探险券入账：A += coin×ticketPerCoinSender，B += coin×ticketPerCoinReceiver', async (): Promise<CheckResult> => {
      this.needActive();
      if (this.giftId === 0) this.skip('活动礼物 ID 待提供');
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

    await this.check('榜单接口：送礼总榜+当日日榜 A=100，收礼总榜 B=100', async (): Promise<CheckResult> => {
      this.needActive();
      if (this.giftId === 0) this.skip('活动礼物 ID 待提供');
      const iso = localIso(LOCALE, T_D1);
      const sendTotal = await this.didibus.rankScoreOf(TOPIC_SEND, USER_A, LOCALE, iso);
      const sendDaily = await this.didibus.rankScoreOf(TOPIC_SEND, USER_A, LOCALE, iso, DAY1_KEY);
      const recvTotal = await this.didibus.rankScoreOf(TOPIC_RECV, USER_B, LOCALE, iso);
      return {
        expect: `send=${GIFT_COIN}，send.${DAY1_KEY}=${GIFT_COIN}，recv=${GIFT_COIN}`,
        real: `send=${sendTotal}，send.${DAY1_KEY}=${sendDaily}，recv=${recvTotal}`,
        pass: sendTotal === GIFT_COIN && sendDaily === GIFT_COIN && recvTotal === GIFT_COIN,
      };
    });

    await this.check('榜单落库：mod_common_rank_record 3 条（trans_no=orderNo，总榜/日榜/收礼榜）', async (): Promise<CheckResult> => {
      this.needActive();
      if (this.giftId === 0) this.skip('活动礼物 ID 待提供');
      const send = await this.didibus.queryRankRecords(TOPIC_SEND, { locale: LOCALE, player: USER_A });
      const recv = await this.didibus.queryRankRecords(TOPIC_RECV, { locale: LOCALE, player: USER_B });
      const sendKeys = send.map((r) => String(r['key'])).sort();
      const transOk = [...send, ...recv].every((r) => String(r['trans_no']) === this.orderNo);
      const keysOk = JSON.stringify(sendKeys) === JSON.stringify(['-', DAY1_KEY].sort());
      const contribOk = recv.every((r) => String(r['contributor']) === String(USER_A));
      return {
        expect: `send key=['-','${DAY1_KEY}']，recv key=['-']，trans_no 一致，contributor=A`,
        real: `send key=${JSON.stringify(sendKeys)}，recv key=${JSON.stringify(recv.map((r) => String(r['key'])))}，trans_no=${transOk}，contributor=${contribOk}`,
        pass: keysOk && recv.length === 1 && transOk && contribOk,
      };
    });

    await this.act('同 orderNo 重发消息（幂等验证）', async () => {
      this.needActive();
      if (this.giftId === 0) this.skip('活动礼物 ID 待提供');
      await this.didibus.sendGift({
        sender: USER_A,
        receiver: USER_B,
        giftId: this.giftId,
        giftPrice: GIFT_COIN,
        totalCoin: GIFT_COIN,
        sendTimeMs: localTs(LOCALE, T_D1),
        orderNo: this.orderNo,
        debugTs: localIso(LOCALE, T_D1),
        locale: LOCALE,
      });
      await new Promise((r) => setTimeout(r, 500));
    });

    await this.check('幂等：券与榜单不重复累计', async (): Promise<CheckResult> => {
      this.needActive();
      if (this.giftId === 0) this.skip('活动礼物 ID 待提供');
      const [a, b] = await Promise.all([this.didibus.queryAccount(USER_A), this.didibus.queryAccount(USER_B)]);
      const aAmt = a.length > 0 ? int(a[0]['amount']) : 0;
      const bAmt = b.length > 0 ? int(b[0]['amount']) : 0;
      const records = await this.didibus.queryRankRecords(TOPIC_SEND, { locale: LOCALE, player: USER_A });
      const expectA = GIFT_COIN * EXPECT_TICKET_PER_COIN_SENDER;
      const expectB = GIFT_COIN * EXPECT_TICKET_PER_COIN_RECEIVER;
      return {
        expect: `A=${expectA}，B=${expectB}，send rank_record=2 条`,
        real: `A=${aAmt}，B=${bAmt}，send rank_record=${records.length} 条`,
        pass: aAmt === expectA && bAmt === expectB && records.length === 2,
      };
    });

    await this.act('发送活动期外消息（T_OUT_BEFORE）', async () => {
      this.needActive();
      if (this.giftId === 0) this.skip('活动礼物 ID 待提供');
      try {
        await this.didibus.sendGift({
          sender: USER_A,
          receiver: USER_B,
          giftId: this.giftId,
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
      if (this.giftId === 0) this.skip('活动礼物 ID 待提供');
      const [a, b] = await Promise.all([this.didibus.queryAccount(USER_A), this.didibus.queryAccount(USER_B)]);
      const aAmt = a.length > 0 ? int(a[0]['amount']) : 0;
      const bAmt = b.length > 0 ? int(b[0]['amount']) : 0;
      const sendTotal = await this.didibus.rankScoreOf(TOPIC_SEND, USER_A, LOCALE, localIso(LOCALE, T_D1));
      const expectA = GIFT_COIN * EXPECT_TICKET_PER_COIN_SENDER;
      const expectB = GIFT_COIN * EXPECT_TICKET_PER_COIN_RECEIVER;
      return {
        expect: `A=${expectA}，B=${expectB}，send=${GIFT_COIN}（均不变）`,
        real: `A=${aAmt}，B=${bAmt}，send=${sendTotal}`,
        pass: aAmt === expectA && bAmt === expectB && sendTotal === GIFT_COIN,
      };
    });
  }
}

await new GiftSend003().execute();
