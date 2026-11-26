import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base } from './_lib/Pk202808Base.ts';
import { DAILY_KEYS, LOCALES, bjIsoFor } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

interface Pair {
  a: number;
  b: number;
  genderA?: number;
  genderB?: number;
}

class Pk005CoupleDailyMain extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    for (const locale of LOCALES) await this.runLocale(locale);
  }

  private async runLocale(locale: string): Promise<void> {
    const configured = this.fx.couples?.[locale];
    const pairs: Pair[] = (configured && configured.length >= 4)
      ? configured.slice(0, 4)
      : this.syntheticIds('user', locale, 8, 2000).reduce<Pair[]>((acc, uid, i, arr) => {
        if (i % 2 === 0) acc.push({ a: uid, b: arr[i + 1]! });
        return acc;
      }, []);
    if (pairs.length < 4) this.skip(`fixtures.couples.${locale} 需要 4 对 CP`);
    const expectedTotals = [4400, 3300, 2200, 1650];

    await this.act(`[${locale}] 清理 CP 榜数据`, async () => {
      await this.cleanTopic('couple', locale);
    });

    await this.act(`[${locale}] 13 个日榜逐日造 4 对 CP，含反向送礼`, async () => {
      for (const day of DAILY_KEYS) {
        const sendMs = this.localMs(locale, `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)} 19:00:00`);
        const debugTs = bjIsoFor(locale, `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)} 19:00:00`);
        for (let i = 0; i < 4; i++) {
          const p = pairs[i]!;
          const forward = [3000, 2000, 1500, 1000][i]!;
          const backward = [1000, 1000, 500, 500][i]!;
          await this.sendGift({ locale, sender: p.a, receiver: p.b, giftId: 10561, totalCoin: forward, sendTimeMs: sendMs, debugTs });
          await this.sendGift({ locale, sender: p.b, receiver: p.a, giftId: 10561, totalCoin: backward, sendTimeMs: sendMs + 60_000, debugTs });
        }
      }
    });

    await this.act(`[${locale}] 逐日结算 CP 日榜并在活动后结算总榜`, async () => {
      for (const day of DAILY_KEYS) {
        await this.pk.callCron(bjIsoFor(locale, `${localNextDay(day)} 00:06:00`));
      }
      await this.pk.callCron('2028-08-30T00:10:00+08:00');
    });

    await this.check(`[${locale}] 正/反向送礼写入同一 coupleId，13 个日榜金额按对累计`, async (): Promise<CheckResult> => {
      const problems: string[] = [];
      for (const day of DAILY_KEYS) {
        const resp = await this.pk.queryRank('couple', day, locale, { count: 4 });
        const items = this.rankItems(resp);
        const amounts = items.map((x) => x.amount);
        const expected = expectedTotals.map((x) => Math.round(x * 1.1));
        if (JSON.stringify(amounts) !== JSON.stringify(expected)) problems.push(`${day} ${JSON.stringify(amounts)} != ${JSON.stringify(expected)}`);
        for (const p of pairs) {
          const cid = this.coupleId(p.a, p.b);
          if (!items.some((x) => String(x.player) === cid)) problems.push(`${day} 缺 coupleId ${cid}`);
        }
      }
      if (problems.length > 0) throw new Error(problems.slice(0, 5).join('；'));
      return { expect: '13 天金额与 coupleId 正确', real: '正确', pass: true };
    });

    const gendersKnown = pairs.every((p) => p.genderA !== undefined && p.genderB !== undefined);
    if (!gendersKnown) {
      await this.act(`[${locale}] CP 性别奖励校验`, async () => {
        this.skip('fixtures.couples 未提供 genderA/genderB，无法校验男/女奖励分流');
      });
      return;
    }

    await this.check(`[${locale}] CP 日榜 Top1/2/3 男女奖励分流（5/3/1 天）`, async (): Promise<CheckResult> => {
      const maleRecipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      const femaleRecipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      pairs.forEach((p, i) => {
        const rank = i + 1;
        if (p.genderA === 1) maleRecipients[rank] = [{ player: p.a, playerType: 'USER' }];
        if (p.genderA === 2) femaleRecipients[rank] = [{ player: p.a, playerType: 'USER' }];
        if (p.genderB === 1) (maleRecipients[rank] ??= []).push({ player: p.b, playerType: 'USER' });
        if (p.genderB === 2) (femaleRecipients[rank] ??= []).push({ player: p.b, playerType: 'USER' });
      });
      await this.assertSettleAwards('couple', EXPECTED_AWARDS['couple-male-daily']!, maleRecipients, { occurrences: DAILY_KEYS.length });
      await this.assertSettleAwards('couple', EXPECTED_AWARDS['couple-female-daily']!, femaleRecipients, { occurrences: DAILY_KEYS.length });
      return { expect: '13 天男女奖励分流正确', real: '正确', pass: true };
    });

    await this.check(`[${locale}] CP 总榜男女奖励（125/75/50 天）`, async (): Promise<CheckResult> => {
      const maleRecipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      const femaleRecipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      pairs.slice(0, 3).forEach((p, i) => {
        const rank = i + 1;
        if (p.genderA === 1) maleRecipients[rank] = [{ player: p.a, playerType: 'USER' }];
        if (p.genderA === 2) femaleRecipients[rank] = [{ player: p.a, playerType: 'USER' }];
        if (p.genderB === 1) (maleRecipients[rank] ??= []).push({ player: p.b, playerType: 'USER' });
        if (p.genderB === 2) (femaleRecipients[rank] ??= []).push({ player: p.b, playerType: 'USER' });
      });
      await this.assertSettleAwards('couple', EXPECTED_AWARDS['couple-male']!, maleRecipients);
      await this.assertSettleAwards('couple', EXPECTED_AWARDS['couple-female']!, femaleRecipients);
      return { expect: '男/女总榜奖励正确', real: '正确', pass: true };
    });
  }
}

function localNextDay(day: string): string {
  const ms = Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00Z`) + 86400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

await new Pk005CoupleDailyMain().execute();