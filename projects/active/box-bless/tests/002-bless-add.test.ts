import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  LOCALE,
  LOCALE_KO,
  USER_A,
  USER_B,
  USER_C,
  BOX_SAMPLE,
  RATIO_DEFAULT,
  RATIO_KO,
  TARGET_DEFAULT,
  NON_BOX_ID,
  BLESS_TYPES,
  GIFT_SHELF_TYPE,
} from './_lib/constants.ts';
import { T_D1, T_OUT, localIso, localTs } from './_lib/times.ts';
import { int, pollUntil } from './_lib/helpers.ts';
import { BoxBlessTestBase } from './_lib/BoxBlessTestBase.ts';

/**
 * 002-bless-add —— 送礼累加赐福值
 * 主路径走测试接口 test/giftSend（同步返回 value/stepNow，免造 funbit.treasure_box）；
 * 真实 __consumer/funbit.gift_send 链路仅覆盖过滤负例（正式链路按 batchNo 查 treasure_box
 * 取实际魔盒数，未造批次行时按 0 跳过，天然不累加）。
 * 口径（v3.8）：过滤=boxId 白名单 + roomSource=voiceroom + giftShelfType=sysactive_treasur_box；
 * add=比例×个数；name=bless_{boxId}；累加 transNo={orderNo}:bless:{boxId}；
 * 触发=floor(value/target) 比对 active_source_record 高水位，队列 order_no={orderNo}:s{step}。
 */
class BlessAdd002 extends BoxBlessTestBase {
  private orderNo = '';

  constructor() {
    super();
    this.total = 18;
  }

  /** A 在 BOX_SAMPLE 上的进度与流水数（用于过滤负例断言「无变化」） */
  private async progressOf(userId: number, topic?: string): Promise<{ value: number; logs: number }> {
    const rows = await this.boxBless.queryTaskRound(userId, BOX_SAMPLE, topic);
    const logs = await this.boxBless.queryTaskRoundLogs(userId, BOX_SAMPLE);
    return { value: rows.length > 0 ? int(rows[0]['value']) : 0, logs: logs.length };
  }

  protected async run(): Promise<void> {
    await this.probeActive();

    await this.act('清理 A/C 数据（进度/流水/发放记录/队列/赐福券）', async () => {
      this.needActive();
      await this.boxBless.cleanUsers([USER_A, USER_C]);
    });

    await this.act(`发送宝箱流水不符消息（giftShelfType=voiceroom ≠ ${GIFT_SHELF_TYPE}，T_D1）`, async () => {
      this.needActive();
      await this.boxBless.sendGiftConsumer({
        sender: USER_A,
        receiver: USER_B,
        boxId: BOX_SAMPLE,
        giftId: 5001,
        giftCount: 1,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
        locale: LOCALE,
        giftShelfType: 'voiceroom',
      });
      await new Promise((r) => setTimeout(r, 500));
    });

    await this.check('宝箱流水过滤：A 无 bless_6040 进度与流水', async (): Promise<CheckResult> => {
      this.needActive();
      const p = await this.progressOf(USER_A);
      return { expect: 'value=0、流水=0 条', real: `value=${p.value}、流水=${p.logs} 条`, pass: p.value === 0 && p.logs === 0 };
    });

    await this.act('发送来源不符消息（roomSource=other ≠ voiceroom，T_D1）', async () => {
      this.needActive();
      await this.boxBless.sendGiftConsumer({
        sender: USER_A,
        receiver: USER_B,
        boxId: BOX_SAMPLE,
        giftId: 5001,
        giftCount: 1,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
        locale: LOCALE,
        roomSource: 'other',
      });
      await new Promise((r) => setTimeout(r, 500));
    });

    await this.check('来源过滤：A 仍无进度与流水', async (): Promise<CheckResult> => {
      this.needActive();
      const p = await this.progressOf(USER_A);
      return { expect: 'value=0、流水=0 条', real: `value=${p.value}、流水=${p.logs} 条`, pass: p.value === 0 && p.logs === 0 };
    });

    await this.act(`发送非白名单魔盒消息（boxId=${NON_BOX_ID} 不在 gifts 白名单，T_D1）`, async () => {
      this.needActive();
      // 注：真实链路在到达白名单判断前会先按 batchNo 查 treasure_box（未造批次行=0 跳过），
      // 两种路径结果一致：均不累加
      await this.boxBless.sendGiftConsumer({
        sender: USER_A,
        receiver: USER_B,
        boxId: NON_BOX_ID,
        giftId: 5001,
        giftCount: 1,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
        locale: LOCALE,
      });
      await new Promise((r) => setTimeout(r, 500));
    });

    await this.check('白名单过滤：A 仍无进度与流水', async (): Promise<CheckResult> => {
      this.needActive();
      const p = await this.progressOf(USER_A);
      return { expect: 'value=0、流水=0 条', real: `value=${p.value}、流水=${p.logs} 条`, pass: p.value === 0 && p.logs === 0 };
    });

    await this.act(`testGiftSend：A 送 1 个魔盒 ${BOX_SAMPLE}（T_D1，locale=${LOCALE}）`, async () => {
      this.needActive();
      const r = await this.boxBless.testGiftSend({
        senderId: USER_A,
        boxId: BOX_SAMPLE,
        giftCount: 1,
        locale: LOCALE,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
      });
      this.orderNo = r.orderNo;
      const expectValue = RATIO_DEFAULT[BOX_SAMPLE];
      if (int(r.value) !== expectValue || int(r.stepNow) !== 0) {
        throw new Error(`同步返回不符：value=${r.value}（期望 ${expectValue}）、stepNow=${r.stepNow}（期望 0）`);
      }
    });

    await this.check(`累加落库：_round value=${RATIO_DEFAULT[BOX_SAMPLE]}（topic=bless-default, name=bless_${BOX_SAMPLE}）；_log 正流水 trans_no={orderNo}:bless:${BOX_SAMPLE}`, async (): Promise<CheckResult> => {
      this.needActive();
      const expectValue = RATIO_DEFAULT[BOX_SAMPLE];
      const [rows, logs] = await pollUntil(
        async () => Promise.all([
          this.boxBless.queryTaskRound(USER_A, BOX_SAMPLE, 'bless-default'),
          this.boxBless.queryTaskRoundLogs(USER_A, BOX_SAMPLE),
        ] as const),
        ([r]) => r.length > 0 && int(r[0]['value']) === expectValue,
      );
      const value = rows.length > 0 ? int(rows[0]['value']) : 0;
      const logsOk = logs.length === 1
        && String(logs[0]['trans_no']) === `${this.orderNo}:bless:${BOX_SAMPLE}`
        && int(logs[0]['value']) === expectValue;
      return {
        expect: `value=${expectValue}；_log 1 条 value=+${expectValue}、trans_no=${this.orderNo}:bless:${BOX_SAMPLE}`,
        real: `value=${value}；_log=${logs.length} 条${logs.length > 0 ? `（trans_no=${logs[0]['trans_no']}，value=${logs[0]['value']}）` : ''}`,
        pass: value === expectValue && logsOk,
      };
    });

    await this.act('同 orderNo 重发 testGiftSend（幂等验证）', async () => {
      this.needActive();
      await this.boxBless.testGiftSend({
        senderId: USER_A,
        boxId: BOX_SAMPLE,
        giftCount: 1,
        locale: LOCALE,
        orderNo: this.orderNo,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
      });
      await new Promise((r) => setTimeout(r, 500));
    });

    await this.check('幂等：value 不再增加、_log 仅 1 条、无发放记录与队列写入', async (): Promise<CheckResult> => {
      this.needActive();
      const expectValue = RATIO_DEFAULT[BOX_SAMPLE];
      const rows = await this.boxBless.queryTaskRound(USER_A, BOX_SAMPLE, 'bless-default');
      const value = rows.length > 0 ? int(rows[0]['value']) : 0;
      const logs = await this.boxBless.queryTaskRoundLogs(USER_A, BOX_SAMPLE);
      const source = await this.boxBless.querySourceRecords(USER_A, BOX_SAMPLE);
      const queue = await this.boxBless.queryAwardQueueByUser(USER_A);
      return {
        expect: `value=${expectValue}、_log=1 条、source_record=0、queue=0`,
        real: `value=${value}、_log=${logs.length} 条、source_record=${source.length}、queue=${queue.length}`,
        pass: value === expectValue && logs.length === 1 && source.length === 0 && queue.length === 0,
      };
    });

    await this.act(`testGiftSend：一次送 40 个跨 2 档（+${40 * RATIO_DEFAULT[BOX_SAMPLE]} → value=${RATIO_DEFAULT[BOX_SAMPLE] + 40 * RATIO_DEFAULT[BOX_SAMPLE]}，T_D1）`, async () => {
      this.needActive();
      const expectValue = RATIO_DEFAULT[BOX_SAMPLE] + 40 * RATIO_DEFAULT[BOX_SAMPLE];
      const expectStep = Math.floor(expectValue / TARGET_DEFAULT);
      const r = await this.boxBless.testGiftSend({
        senderId: USER_A,
        boxId: BOX_SAMPLE,
        giftCount: 40,
        locale: LOCALE,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: localIso(LOCALE, T_D1),
      });
      this.orderNo = r.orderNo;
      if (int(r.value) !== expectValue || int(r.stepNow) !== expectStep) {
        throw new Error(`同步返回不符：value=${r.value}（期望 ${expectValue}）、stepNow=${r.stepNow}（期望 ${expectStep}）`);
      }
    });

    await this.check('触发发放：active_source_record 高水位 :1/:2；队列 order_no={orderNo}:s1/:s2、字段正确', async (): Promise<CheckResult> => {
      this.needActive();
      const [source, queue] = await pollUntil(
        async () => Promise.all([
          this.boxBless.querySourceRecords(USER_A, BOX_SAMPLE),
          this.boxBless.queryAwardQueueByOrder(this.orderNo),
        ] as const),
        ([s, q]) => s.length === 2 && q.length === 2,
      );
      const keys = source.map((r) => String(r['unique_key'])).sort();
      const keysOk = JSON.stringify(keys) === JSON.stringify([`bless:${USER_A}:${BOX_SAMPLE}:1`, `bless:${USER_A}:${BOX_SAMPLE}:2`].sort());
      const orderNos = queue.map((r) => String(r['order_no'])).sort();
      const orderOk = JSON.stringify(orderNos) === JSON.stringify([`${this.orderNo}:s1`, `${this.orderNo}:s2`].sort());
      const bad = queue.filter((r) => {
        const type = String(r['award_type']);
        if (!BLESS_TYPES.includes(type)) return true;
        if (String(r['active_name']) && String(r['active_name']) !== 'magicbox-bless-v202611') return true;
        let remark: Record<string, unknown> = {};
        try { remark = JSON.parse(String(r['remark'] ?? '{}')); } catch { return true; }
        if (int(remark['boxId']) !== BOX_SAMPLE) return true;
        // 券类倒计时必须 >0；GIFT 背包赐福有效期按 awardNum×day 换算（也可能 >0）
        if (type.startsWith('BOX_BLESS_') && int(r['expires_second']) <= 0) return true;
        // @Timer 2s 消费后状态流转 ok，create/ok 均接受
        return !['create', 'ok'].includes(String(r['award_status']));
      });
      return {
        expect: `source_record=[bless:${USER_A}:${BOX_SAMPLE}:1,:2]；queue order_no={orderNo}:s1/:s2、award_type ∈ 六种赐福、remark.boxId=${BOX_SAMPLE}、券类 expires_second>0`,
        real: `source=${JSON.stringify(keys)}；queue=${orderNos.join(',')}${bad.length > 0 ? `；异常行=${JSON.stringify(bad.map((r) => `${r['order_no']}:${r['award_type']}/${r['award_status']}/exp=${r['expires_second']}`))}` : ''}`,
        pass: keysOk && orderOk && queue.length === 2 && bad.length === 0,
      };
    });

    await this.act('期外消息（testGiftSend，sendTime=T_OUT 活动开始前）', async () => {
      this.needActive();
      try {
        await this.boxBless.testGiftSend({
          senderId: USER_A,
          boxId: BOX_SAMPLE,
          giftCount: 1,
          locale: LOCALE,
          sendTimeMs: localTs(LOCALE, T_OUT),
          debugTs: localIso(LOCALE, T_OUT),
        });
      } catch (e) {
        this.log(`期外消息被拒绝：${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 500));
    });

    await this.check(`期外消息无副作用：value 仍 ${RATIO_DEFAULT[BOX_SAMPLE] + 40 * RATIO_DEFAULT[BOX_SAMPLE]}`, async (): Promise<CheckResult> => {
      this.needActive();
      const expectValue = RATIO_DEFAULT[BOX_SAMPLE] + 40 * RATIO_DEFAULT[BOX_SAMPLE];
      const rows = await this.boxBless.queryTaskRound(USER_A, BOX_SAMPLE, 'bless-default');
      const value = rows.length > 0 ? int(rows[0]['value']) : 0;
      return { expect: `value=${expectValue}（不变）`, real: `value=${value}`, pass: value === expectValue };
    });

    await this.act(`大区覆盖：C（locale=${LOCALE_KO}）送 1 个魔盒 ${BOX_SAMPLE}（ko 比例=${RATIO_KO[BOX_SAMPLE]}，T_D1）`, async () => {
      this.needActive();
      const r = await this.boxBless.testGiftSend({
        senderId: USER_C,
        boxId: BOX_SAMPLE,
        giftCount: 1,
        locale: LOCALE_KO,
        sendTimeMs: localTs(LOCALE_KO, T_D1),
        debugTs: localIso(LOCALE_KO, T_D1),
      });
      if (int(r.value) !== RATIO_KO[BOX_SAMPLE]) {
        throw new Error(`ko 累加不符：value=${r.value}（期望 ${RATIO_KO[BOX_SAMPLE]}）`);
      }
    });

    await this.check(`ko 落库：topic=bless-ko、name=bless_${BOX_SAMPLE}、value=${RATIO_KO[BOX_SAMPLE]}（走 task-ko 实例）`, async (): Promise<CheckResult> => {
      this.needActive();
      const rows = await pollUntil(
        () => this.boxBless.queryTaskRound(USER_C, BOX_SAMPLE),
        (r) => r.length > 0,
      );
      const ko = rows.filter((r) => String(r['topic']) === 'bless-ko');
      const value = ko.length > 0 ? int(ko[0]['value']) : 0;
      return {
        expect: `bless-ko 行 value=${RATIO_KO[BOX_SAMPLE]}（target=${80}）`,
        real: `topics=${rows.map((r) => `${r['topic']}=${r['value']}`).join(',') || '无'}`,
        pass: ko.length === 1 && value === RATIO_KO[BOX_SAMPLE],
      };
    });
  }
}

await new BlessAdd002().execute();
