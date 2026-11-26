import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import { OTHER_LOCALES, bjIsoFor } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

class Pk013RoomOtherTotal extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    for (const locale of OTHER_LOCALES) await this.runLocale(locale);
  }

  private async runLocale(locale: string): Promise<void> {
    const rooms = this.requireRooms(locale, 4);
    const contributorOf = (room: number) => 960_000_000 + (room % 1_000_000);

    await this.act(`[${locale}] 清理 room 总榜数据`, async () => {
      await this.cleanTopic('room', locale);
    });

    const days = ['2028-08-18', '2028-08-24', '2028-08-29'];
    const amounts = [3000, 2000, 1000];

    await this.act(`[${locale}] 4 个房间在海选/阶段切换日/决赛日送礼`, async () => {
      for (let i = 0; i < rooms.length; i++) {
        for (let d = 0; d < days.length; d++) {
          const room = rooms[i]!;
          await this.sendGift({
            locale,
            sender: contributorOf(room),
            receiver: 970_000_000 + i,
            roomId: room,
            giftId: 10561,
            totalCoin: amounts[d]!,
            sendTimeMs: this.localMs(locale, `${days[d]} 10:00:00`),
            debugTs: bjIsoFor(locale, `${days[d]} 10:00:00`),
          });
        }
      }
    });

    await this.check(`[${locale}] room 仅一个主榜，跨阶段不清零`, async (): Promise<CheckResult> => {
      const rounds = await this.pk.queryRounds('room', locale);
      const keys = rounds.map((r) => String(r['key']));
      return { expect: "['-']", real: JSON.stringify(keys), pass: keys.length === 1 && keys[0] === '-' };
    });

    await this.check(`[${locale}] 每个房间总分为全部有效送礼之和`, async (): Promise<CheckResult> => {
      const resp = await this.pk.queryRank('room', '-', locale, { count: 4 });
      const items = this.rankItems(resp);
      const expected = amounts.reduce((s, a) => s + a * 1.1, 0);
      return {
        expect: `${rooms.length} 个房间均为 ${expected}`,
        real: JSON.stringify(items.map((x) => x.amount)),
        pass: items.length === rooms.length && items.every((x) => Math.abs(x.amount - expected) <= 1),
      };
    });

    await this.act(`[${locale}] 活动结束后结算 room 总榜`, async () => {
      await this.pk.callCron('2028-08-30T00:10:00+08:00');
    });

    await this.check(`[${locale}] 最终奖励与房间决赛配置一致`, async (): Promise<CheckResult> => {
      const resp = await this.pk.queryRank('room', '-', locale, { count: 3 });
      const items = this.rankItems(resp);
      const recipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      items.forEach((it, i) => { recipients[i + 1] = [{ player: it.player, playerType: 'ROOM' }]; });
      await this.assertSettleAwards('room', EXPECTED_AWARDS['room']!.filter((r) => r.mod === 'ADD' && r.playerType === 'ROOM'), recipients);
      const view = EXPECTED_AWARDS['room']!.filter((r) => r.mod === 'VIEW' && r.locale === locale);
      if (view.length > 0) {
        await this.assertSettleAwards('room', view, recipients);
      }
      const contributorRows = await this.pk.queryRankRecords('room', { key: '-', locale });
      const byContributor = new Map<number, number>();
      for (const r of contributorRows) {
        const c = int(r['contributor']);
        if (c > 0) byContributor.set(c, (byContributor.get(c) ?? 0) + Number(r['amount']));
      }
      const topC = [...byContributor.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topC) {
        await this.assertSettleAwards(
          'room',
          EXPECTED_AWARDS['room-contributor']!.filter((r) => r.stage === 1),
          { 1: [{ player: topC[0], playerType: 'USER' }] },
        );
      }
      return { expect: '奖励正确', real: '正确', pass: true };
    });
  }
}

await new Pk013RoomOtherTotal().execute();