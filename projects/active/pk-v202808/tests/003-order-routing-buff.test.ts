import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base } from './_lib/Pk202808Base.ts';

class Pk003OrderRoutingBuff extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    const locale = 'in';
    const players = this.requirePlayers(locale, 1);
    const receiver = players[0]!;
    const sender = (this.fx.users?.[locale] ?? this.syntheticIds('user', locale, 1, 300))[0]!;
    const roomId = (this.fx.rooms?.[locale] ?? this.syntheticIds('room', locale, 1, 300))[0]!;
    const familyId = (this.fx.families?.[locale]?.[0]?.id ?? this.syntheticIds('family', locale, 1, 300)[0]!);

    await this.act('清理用户/CP/房间/家族榜本用例数据', async () => {
      for (const topic of ['user', 'couple', 'room_in_n_200', 'family_in_n_200']) {
        await this.cleanTopic(topic, locale);
      }
    });

    const identities = this.fx.identities ?? {};
    if (!identities.normal?.length || !identities.svip?.length || !identities.rich?.length) {
      await this.act('身份 Buff 校验（需要 fixtures.identities）', async () => {
        this.skip('缺少 fixtures.identities.normal/svip/rich，无法验证 1.1/1.2/1.5 身份 Buff');
      });
    } else {
      await this.check('普通/SVIP/富豪送礼身份 Buff 为 1.1/1.2/1.5', async (): Promise<CheckResult> => {
        const expects: Array<[string, number, number]> = [
          ['normal', identities.normal![0]!, 1100],
          ['svip', identities.svip![0]!, 1200],
          ['rich', identities.rich![0]!, 1500],
        ];
        const problems: string[] = [];
        const sendMs = this.localMs(locale, '2028-08-18 11:00:00');
        for (const [label, uid, expected] of expects) {
          const orderNo = this.pk.makeOrderNo(`PK28ID${label}`);
          await this.sendGift({
            locale, sender: uid, receiver, roomId, familyId, giftId: 10561, totalCoin: 1000,
            sendTimeMs: sendMs, debugTs: this.cronTs(locale, '2028-08-18 11:00:00'), orderNo,
          });
          const rows = await this.recordsOfOrder(orderNo);
          const userRow = rows.find((r) => r['topic'] === 'user');
          if (!userRow) problems.push(`${label} 无用户榜流水`);
          else if (Math.abs(Number(userRow['amount']) - expected) > 0.5) {
            problems.push(`${label} 增量 ${userRow['amount']} 期望 ${expected}`);
          }
        }
        if (problems.length > 0) throw new Error(problems.join('；'));
        return { expect: '1100/1200/1500', real: '一致', pass: true };
      });
    }

    const transNo = this.pk.makeOrderNo('PK28ORDER');
    const finishMs = this.localMs(locale, '2028-08-23 10:00:00');
    const pkKey = '2028082300';

    await this.act('投递 mainStatus=30 的陪玩订单并原样重放，再投递 mainStatus=20', async () => {
      await this.pk.sendOrderStatus({
        transNo, userId: sender, playerId: receiver, amount: 1000, finishMs, locale,
        debugTs: this.cronTs(locale, '2028-08-23 10:00:00'), mainStatus: 30,
      });
      await this.pk.sendOrderStatus({
        transNo, userId: sender, playerId: receiver, amount: 1000, finishMs, locale,
        debugTs: this.cronTs(locale, '2028-08-23 10:00:00'), mainStatus: 30,
      });
      await this.pk.sendOrderStatus({
        transNo: `${transNo}_20`, userId: sender, playerId: receiver, amount: 1000, finishMs, locale,
        debugTs: this.cronTs(locale, '2028-08-23 10:00:00'), mainStatus: 20,
      });
    });

    await this.check('订单仅给接单陪玩的阶段主榜和当前 1v1 各加 1000，重放不重复、非 30 不加分', async (): Promise<CheckResult> => {
      const stageTopic = 'player_in_100_46';
      const stage = (await this.pk.queryRankRecords(stageTopic, { key: '-', locale })).filter(
        (r) => String(r['player']) === String(receiver) && String(r['trans_no']).includes(transNo),
      );
      const pk = (await this.pk.queryRankRecords('player_in_1v1_100_46', { key: pkKey, locale })).filter(
        (r) => String(r['player']) === String(receiver) && String(r['trans_no']).includes(transNo),
      );
      const non30 = (await this.pk.queryRankRecords(stageTopic, { key: '-', locale })).filter(
        (r) => String(r['trans_no']).includes(`${transNo}_20`),
      );
      const problems: string[] = [];
      if (stage.length !== 1) problems.push(`阶段主榜订单流水 ${stage.length} 条，期望 1 条`);
      if (pk.length !== 1) problems.push(`1v1 订单流水 ${pk.length} 条，期望 1 条`);
      if (non30.length !== 0) problems.push(`mainStatus=20 产生 ${non30.length} 条流水`);
      if (stage[0] && Math.abs(Number(stage[0]['amount']) - 1000) > 0.5) problems.push(`阶段主榜金额 ${stage[0]['amount']} 期望 1000`);
      if (pk[0] && Math.abs(Number(pk[0]['amount']) - 1000) > 0.5) problems.push(`1v1 金额 ${pk[0]['amount']} 期望 1000`);
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: '主榜 1 条 + 1v1 1 条 + 非 30 为 0', real: '一致', pass: true };
    });

    await this.check('订单不进入用户/CP/房间/家族榜', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      for (const topic of ['user', 'couple', 'room_in_n_200', 'family_in_n_200']) {
        const rows = (await this.pk.queryRankRecords(topic, { key: '-', locale })).filter((r) =>
          String(r['trans_no']).includes(transNo),
        );
        if (rows.length !== 0) problems.push(`${topic} 出现 ${rows.length} 条订单流水`);
      }
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: '四类榜均无订单流水', real: '无', pass: true };
    });

    await this.check('延迟送礼按 sendTime 写入原日榜，总榜仅累计一次', async (): Promise<CheckResult> => {
      const orderNo = this.pk.makeOrderNo('PK28DELAY');
      await this.sendGift({
        locale, sender, receiver, roomId, familyId, giftId: 10561, totalCoin: 1000,
        sendTimeMs: this.localMs(locale, '2028-08-18 23:00:00'),
        debugTs: this.cronTs(locale, '2028-08-19 10:00:00'), orderNo,
      });
      const rows = await this.recordsOfOrder(orderNo);
      const daily = rows.filter((r) => r['topic'] === 'user' && String(r['key']) === '20280818');
      const total = rows.filter((r) => r['topic'] === 'user' && String(r['key']) === '-');
      return {
        expect: '日榜 20280818 1 条，总榜 1 条',
        real: `日榜 ${daily.length} 条，总榜 ${total.length} 条`,
        pass: daily.length === 1 && total.length === 1,
      };
    });

    await this.check('无效陪玩/自送/roomId=0/无家族的分发分支', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      const syntheticPlayer = this.syntheticIds('user', locale, 1, 500)[0]!;
      const noRoom = this.pk.makeOrderNo('PK28NOROOM');
      await this.sendGift({
        locale, sender, receiver: syntheticPlayer, roomId, familyId, giftId: 10561, totalCoin: 1000,
        sendTimeMs: this.localMs(locale, '2028-08-18 12:00:00'),
        debugTs: this.cronTs(locale, '2028-08-18 12:00:00'), orderNo: noRoom,
      });
      const invalidRows = await this.recordsOfOrder(noRoom);
      if (invalidRows.some((r) => r['topic'] === 'player_in_n_200')) problems.push('无效陪玩仍进入陪玩榜');
      if (invalidRows.some((r) => r['topic'] === 'couple')) problems.push('自送仍生成 CP 流水');

      const selfOrder = this.pk.makeOrderNo('PK28SELF');
      await this.sendGift({
        locale, sender: receiver, receiver, roomId, familyId, giftId: 10561, totalCoin: 1000,
        sendTimeMs: this.localMs(locale, '2028-08-18 12:30:00'),
        debugTs: this.cronTs(locale, '2028-08-18 12:30:00'), orderNo: selfOrder,
      });
      const selfRows = await this.recordsOfOrder(selfOrder);
      if (selfRows.some((r) => r['topic'] === 'couple')) problems.push('自送礼仍生成 CP 流水');

      const noRoomOrder = this.pk.makeOrderNo('PK28ROOM0');
      await this.sendGift({
        locale, sender, receiver, roomId: 0, familyId, giftId: 10561, totalCoin: 1000,
        sendTimeMs: this.localMs(locale, '2028-08-18 13:00:00'),
        debugTs: this.cronTs(locale, '2028-08-18 13:00:00'), orderNo: noRoomOrder,
      });
      if ((await this.recordsOfOrder(noRoomOrder)).some((r) => r['topic'] === 'room_in_n_200')) {
        problems.push('roomId=0 仍进入房间榜');
      }

      const noFamilyOrder = this.pk.makeOrderNo('PK28FAM0');
      await this.sendGift({
        locale, sender, receiver, roomId, familyId: 0, giftId: 10561, totalCoin: 1000,
        sendTimeMs: this.localMs(locale, '2028-08-18 13:30:00'),
        debugTs: this.cronTs(locale, '2028-08-18 13:30:00'), orderNo: noFamilyOrder,
      });
      if ((await this.recordsOfOrder(noFamilyOrder)).some((r) => r['topic'] === 'family_in_n_200')) {
        problems.push('无家族仍进入家族榜');
      }

      const noFamilyRows = await this.recordsOfOrder(noFamilyOrder);
      if (!noFamilyRows.some((r) => r['topic'] === 'user')) problems.push('无家族时用户榜未按公式计分');
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: '分支过滤正确，其余适用榜仍计分', real: '正确', pass: true };
    });
  }
}

await new Pk003OrderRoutingBuff().execute();