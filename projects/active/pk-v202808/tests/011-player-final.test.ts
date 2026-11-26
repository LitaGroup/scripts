import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import { ACTIVITY_FINISH_MS, PLAYER_STAGES_IN, PLAYER_STAGES_OTHER, bjIsoFor } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

class Pk011PlayerFinal extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    for (const locale of ['in', 'vi', 'ph', 'ko']) await this.runLocale(locale);
  }

  private async runLocale(locale: string): Promise<void> {
    const isIn = locale === 'in';
    const stages = isIn ? PLAYER_STAGES_IN : PLAYER_STAGES_OTHER;
    const final = stages[4]!;
    const expectedCount = isIn ? 20 : 10;

    const list = await this.pk.queryPlayerList(final.topic, locale);
    if (list.length === 0) this.skip(`[${locale}] ${final.topic} 名单为空，请先执行 010`);

    await this.check(`[${locale}] 决赛名单 in=20 / 非 in=10，开始=本地 8/29 00:00，结束=北京时间 8/29 23:59:59`, async (): Promise<CheckResult> => {
      const rounds = await this.pk.queryRounds(final.topic, locale);
      const main = rounds.find((r) => String(r['key']) === '-');
      if (!main) throw new Error('缺决赛主轮次');
      const start = int(main['start_time']);
      const finish = int(main['finish_time']);
      const expectStart = this.localMs(locale, '2028-08-29 00:00:00');
      return {
        expect: `${expectedCount} 人，start=${expectStart} finish=${ACTIVITY_FINISH_MS}`,
        real: `${list.length} 人，start=${start} finish=${finish}`,
        pass: list.length === expectedCount && Math.abs(start - expectStart) <= 1000 && finish === ACTIVITY_FINISH_MS,
      };
    });

    await this.act(`[${locale}] 决赛期间发送一笔真实送礼`, async () => {
      const buffs = await this.pk.queryBuffs(final.topic, { locale });
      const target = buffs.length > 0 ? int(buffs[0]!['player']) : int(list[0]!['player']);
      await this.sendGift({
        locale,
        sender: this.syntheticIds('user', locale, 1, 7000)[0]!,
        receiver: target,
        giftId: 10561,
        totalCoin: 1000,
        sendTimeMs: this.localMs(locale, '2028-08-29 10:00:00'),
        debugTs: bjIsoFor(locale, '2028-08-29 10:00:00'),
      });
    });

    await this.act(`[${locale}] 活动统一结束后执行最终结算`, async () => {
      await this.pk.callCron('2028-08-30T00:10:00+08:00');
    });

    await this.check(`[${locale}] 决赛主榜 Top1/2/3 自动奖励与配置一致`, async (): Promise<CheckResult> => {
      const rank = await this.pk.queryRank(final.topic, '-', locale, { count: 3 });
      const items = this.rankItems(rank);
      const recipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      items.forEach((it, i) => { recipients[i + 1] = [{ player: it.player, playerType: 'USER' }]; });
      const add = EXPECTED_AWARDS[final.topic]!.filter((r) => r.mod === 'ADD');
      await this.assertSettleAwards(final.topic, add, recipients);
      return { expect: `${add.length} 条 ADD 奖励`, real: '一致', pass: true };
    });

    await this.check(`[${locale}] 决赛贡献 Top1 获得 INFOCARD 31+BUBBLE 967`, async (): Promise<CheckResult> => {
      const records = await this.pk.queryRankRecords(final.topic, { key: '-', locale });
      const byContributor = new Map<number, number>();
      for (const r of records) {
        const c = int(r['contributor']);
        if (c > 0) byContributor.set(c, (byContributor.get(c) ?? 0) + Number(r['amount']));
      }
      const top = [...byContributor.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top) this.skip('无贡献者流水');
      await this.assertSettleAwards(
        final.topic,
        EXPECTED_AWARDS[`${final.topic}-contributor`]!.filter((r) => r.stage === 1),
        { 1: [{ player: top[0], playerType: 'USER' }] },
      );
      return { expect: '贡献 Top1 奖励正确', real: '正确', pass: true };
    });

    await this.check(`[${locale}] 手动 VIEW 奖励（实体/金币/Banner/弹窗）只生成记录`, async (): Promise<CheckResult> => {
      const view = EXPECTED_AWARDS[final.topic]!.filter((r) => r.mod === 'VIEW');
      if (view.length === 0) return { expect: '无 VIEW 配置', real: '无', pass: true };
      const rank = await this.pk.queryRank(final.topic, '-', locale, { count: 3 });
      const items = this.rankItems(rank);
      const recipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      items.forEach((it, i) => { recipients[i + 1] = [{ player: it.player, playerType: 'USER' }]; });
      await this.assertSettleAwards(final.topic, view, recipients);
      return { expect: `${view.length} 条 VIEW 记录`, real: '一致', pass: true };
    });
  }
}

await new Pk011PlayerFinal().execute();