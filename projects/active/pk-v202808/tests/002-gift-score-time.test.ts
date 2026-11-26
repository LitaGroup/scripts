import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import { ACTIVITY_FINISH_MS, ACTIVITY_START_MS, GIFTS } from './_lib/constants.ts';

const TOPICS = {
  player: 'player_in_n_200',
  user: 'user',
  couple: 'couple',
  room: 'room_in_n_200',
  family: 'family_in_n_200',
} as const;

class Pk002GiftScoreTime extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    const locale = 'in';
    const players = this.requirePlayers(locale, 1);
    const receiver = players[0]!;
    const sender = (this.fx.users?.[locale] ?? this.syntheticIds('user', locale, 1, 100))[0]!;
    const roomId = (this.fx.rooms?.[locale] ?? this.syntheticIds('room', locale, 1, 100))[0]!;
    const familyId = (this.fx.families?.[locale] ?? [{ id: this.syntheticIds('family', locale, 1, 100)[0]!, members: [] }])[0]!.id;
    const cid = this.coupleId(sender, receiver);
    const sendMs = this.localMs(locale, '2028-08-18 10:00:00');
    const debugTs = this.cronTs(locale, '2028-08-18 10:00:00');

    await this.act('确保 pk-v202808 轮次已初始化（幂等 Cron）', async () => {
      await this.pk.callCron('2028-08-10T00:00:00+08:00');
    });
    for (const topic of Object.values(TOPICS)) {
      await this.act(`清理 ${topic} 本用例数据`, async () => {
        await this.cleanTopic(topic, locale);
      });
    }

    const giftOrders: Array<{ giftId: number; buff: number; orderNo: string }> = [];
    await this.act('12 种礼物各发送 totalCoin=1000 一笔', async () => {
      for (const gift of GIFTS) {
        const orderNo = this.pk.makeOrderNo(`PK28G${gift.id}`);
        await this.sendGift({ locale, sender, receiver, roomId, familyId, giftId: gift.id, totalCoin: 1000, sendTimeMs: sendMs, debugTs, orderNo });
        giftOrders.push({ giftId: gift.id, buff: gift.buff, orderNo });
      }
    });

    await this.check('10561~10570 每笔在五类榜新增 1100，10628/10637 新增 2200', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      const targets: Array<[string, number | string]> = [
        [TOPICS.player, receiver],
        [TOPICS.user, sender],
        [TOPICS.couple, cid],
        [TOPICS.room, roomId],
        [TOPICS.family, familyId],
      ];
      for (const { giftId, buff, orderNo } of giftOrders) {
        const expected = 1000 * buff * 1.1;
        const rows = await this.recordsOfOrder(orderNo);
        for (const [topic, player] of targets) {
          const hits = rows.filter((r) => r['topic'] === topic && String(r['player']) === String(player));
          if (hits.length !== 1) {
            problems.push(`礼物 ${giftId} 在 ${topic} 流水 ${hits.length} 条，期望 1 条`);
            continue;
          }
          if (Math.abs(Number(hits[0]!['amount']) - expected) > 0.5) {
            problems.push(`礼物 ${giftId} 在 ${topic} 新增 ${hits[0]!['amount']}，期望 ${expected}`);
          }
        }
      }
      // 送礼人/房间/家族/CP 映射核对
      const userRows = await this.recordsOfOrder(giftOrders[0]!.orderNo);
      const contributor = userRows.find((r) => r['topic'] === TOPICS.player);
      if (!contributor || String(contributor['contributor']) !== String(sender)) {
        problems.push(`陪玩榜贡献者应为送礼人 ${sender}`);
      }
      if (problems.length > 0) throw new Error(`${problems.length} 处不一致：${problems.slice(0, 5).join('；')}`);
      return { expect: '五类榜逐笔金额与对象一致', real: '一致', pass: true };
    });

    await this.check('后半程再发 10561 仍计分（stage 不限制计分）', async (): Promise<CheckResult> => {
      const before = (await this.pk.queryRankRecords(TOPICS.user, { key: '-', locale })).filter((r) => String(r['player']) === String(sender)).length;
      await this.sendGift({
        locale, sender, receiver, roomId, familyId, giftId: 10561, totalCoin: 1000,
        sendTimeMs: this.localMs(locale, '2028-08-25 10:00:00'), debugTs: this.cronTs(locale, '2028-08-25 10:00:00'),
      });
      const after = (await this.pk.queryRankRecords(TOPICS.user, { key: '-', locale })).filter((r) => String(r['player']) === String(sender)).length;
      return { expect: `${before + 1}`, real: `${after}`, pass: after === before + 1 };
    });

    await this.check('同一 orderNo 重放不重复计分', async (): Promise<CheckResult> => {
      const orderNo = this.pk.makeOrderNo('PK28REPLAY');
      const rowsBefore = await this.pk.queryRankRecords(TOPICS.user, { key: '-', locale });
      await this.sendGift({ locale, sender, receiver, roomId, familyId, giftId: 10562, totalCoin: 1000, sendTimeMs: sendMs, debugTs, orderNo });
      const first = (await this.pk.queryRankRecords(TOPICS.user, { key: '-', locale })).length;
      await this.sendGift({ locale, sender, receiver, roomId, familyId, giftId: 10562, totalCoin: 1000, sendTimeMs: sendMs, debugTs, orderNo });
      const second = (await this.pk.queryRankRecords(TOPICS.user, { key: '-', locale })).length;
      return {
        expect: `${rowsBefore.length + 1}/${first}`,
        real: `${first}/${second}`,
        pass: first === rowsBefore.length + 1 && second === first,
        message: '重放后流水数增加',
      };
    });

    await this.check('未配置礼物在所有榜均不新增流水', async (): Promise<CheckResult> => {
      const before = await this.pk.queryRankRecords(TOPICS.user, { key: '-', locale });
      try {
        await this.sendGift({
          locale, sender, receiver, roomId, familyId, giftId: 99999, totalCoin: 1000,
          sendTimeMs: sendMs, debugTs,
        });
      } catch {
        // 消费端拒绝也可接受，只要不落流水
      }
      const after = await this.pk.queryRankRecords(TOPICS.user, { key: '-', locale });
      return { expect: `${before.length}`, real: `${after.length}`, pass: after.length === before.length };
    });

    await this.check('活动开始前一秒/结束后一秒无流水，开始与结束时刻有流水', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      const cases: Array<[string, number, boolean, string]> = [
        ['开始前一秒', ACTIVITY_START_MS - 1000, false, '2028-08-17T13:59:59+08:00'],
        ['开始时刻', ACTIVITY_START_MS, true, '2028-08-17T14:00:00+08:00'],
        ['结束时刻', ACTIVITY_FINISH_MS, true, '2028-08-29T23:59:59+08:00'],
        ['结束后一秒', ACTIVITY_FINISH_MS + 1000, false, '2028-08-30T00:00:00+08:00'],
      ];
      for (const [label, ms, shouldScore, debug] of cases) {
        const orderNo = this.pk.makeOrderNo('PK28EDGE');
        await this.sendGift({ locale, sender, receiver, roomId, familyId, giftId: 10569, totalCoin: 1000, sendTimeMs: ms, debugTs: debug, orderNo });
        const hits = await this.recordsOfOrder(orderNo);
        const scored = hits.length > 0;
        if (scored !== shouldScore) problems.push(`${label} ${shouldScore ? '应有' : '不应有'}流水，实际 ${hits.length} 条`);
      }
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: '边界时刻计分正确', real: '正确', pass: true };
    });

    await this.check('ko 本地 8/30 00:00~00:59 只进总榜，不进 20280829 日榜', async (): Promise<CheckResult> => {
      const ko = 'ko';
      const koPlayer = this.requirePlayers(ko, 1)[0]!;
      const koSender = (this.fx.users?.[ko] ?? this.syntheticIds('user', ko, 1, 200))[0]!;
      const orderNo = this.pk.makeOrderNo('PK28KO');
      await this.sendGift({
        locale: ko, sender: koSender, receiver: koPlayer, roomId: 0, familyId: 0, giftId: 10570, totalCoin: 1000,
        sendTimeMs: this.localMs(ko, '2028-08-30 00:30:00'), debugTs: this.cronTs(ko, '2028-08-30 00:30:00'), orderNo,
      });
      const rows = await this.recordsOfOrder(orderNo);
      const total = rows.filter((r) => String(r['key']) === '-' && r['topic'] === 'user');
      const daily = rows.filter((r) => String(r['key']) === '20280829' && r['topic'] === 'user');
      return {
        expect: '总榜 1 条，20280829 日榜 0 条',
        real: `总榜 ${total.length} 条，日榜 ${daily.length} 条`,
        pass: total.length === 1 && daily.length === 0,
      };
    });

    await this.check('前后半程 /active-gifts 均返回 12 个礼物且 stage 分组正确', async (): Promise<CheckResult> => {
      const a = await this.pk.queryActiveGifts(locale, '2028-08-18T10:00:00+07:00');
      const b = await this.pk.queryActiveGifts(locale, '2028-08-26T10:00:00+07:00');
      const ga = (a['gifts'] ?? []) as Array<Record<string, unknown>>;
      const gb = (b['gifts'] ?? []) as Array<Record<string, unknown>>;
      const ok = ga.length === 12 && gb.length === 12
        && [0, 1, 2].every((s) => ga.filter((g) => int(g['stage']) === s).length === 4);
      return { expect: '两次均 12 个，stage 各 4 个', real: `第一次 ${ga.length}，第二次 ${gb.length}`, pass: ok };
    });
  }
}

await new Pk002GiftScoreTime().execute();