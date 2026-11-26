import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base } from './_lib/Pk202808Base.ts';
import { LOCALES, OTHER_LOCALES, bjIsoFor } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

class Pk015FamilyOtherGlobal extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    for (const locale of OTHER_LOCALES) await this.runLocale(locale);

    await this.check('最终全球家族榜返回 4 区 Top3（最多 12 条），in 来源为 family_in_10_1', async (): Promise<CheckResult> => {
      const resp = (await this.pk.queryGlobalFamilyRank('in', '2028-08-30T00:10:00+08:00')) as Record<string, unknown>;
      const items = (resp['rankResult'] ?? resp['list'] ?? []) as Array<Record<string, unknown>>;
      const byLocale = new Map<string, number>();
      for (const it of items) {
        const l = String(it['locale'] ?? 'in');
        byLocale.set(l, (byLocale.get(l) ?? 0) + 1);
      }
      const inTopics = items.filter((x) => String(x['locale'] ?? 'in') === 'in').map((x) => String(x['topic'] ?? ''));
      const problems: string[] = [];
      for (const l of LOCALES) {
        if ((byLocale.get(l) ?? 0) > 3) problems.push(`${l} 超过 3 条`);
      }
      if (items.length > 12) problems.push(`总条数 ${items.length} 超过 12`);
      if (inTopics.some((t) => t !== 'family_in_10_1')) problems.push(`in 来源 topic=${JSON.stringify(inTopics)}`);
      for (const l of OTHER_LOCALES) {
        const topics = items.filter((x) => String(x['locale'] ?? '') === l).map((x) => String(x['topic'] ?? ''));
        if (topics.some((t) => t !== 'family')) problems.push(`${l} 来源 topic=${JSON.stringify(topics)}`);
      }
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: '4 区各 ≤3 条，来源 topic 正确', real: `${items.length} 条`, pass: true };
    });
  }

  private async runLocale(locale: string): Promise<void> {
    const families = this.requireFamilies(locale, 4);
    const contributor = (fid: number) => 980_000_000 + (fid % 1_000_000);
    const days = ['2028-08-18', '2028-08-24', '2028-08-29'];

    await this.act(`[${locale}] 清理 family 总榜数据`, async () => {
      await this.cleanTopic('family', locale);
    });

    await this.act(`[${locale}] 4 个家族跨阶段在 8/18、8/24、8/29 送礼`, async () => {
      for (let i = 0; i < families.length; i++) {
        const f = families[i]!;
        for (let d = 0; d < days.length; d++) {
          const sender = f.members[0] ?? contributor(f.id);
          const receiver = f.members[1] ?? sender + 1;
          await this.sendGift({
            locale,
            sender,
            receiver,
            roomId: 0,
            familyId: f.id,
            giftId: 10561,
            totalCoin: [3000, 2000, 1000][d]!,
            sendTimeMs: this.localMs(locale, `${days[d]} 10:00:00`),
            debugTs: bjIsoFor(locale, `${days[d]} 10:00:00`),
          });
        }
      }
    });

    await this.act(`[${locale}] 活动结束后结算 family 总榜`, async () => {
      await this.pk.callCron('2028-08-30T00:10:00+08:00');
    });

    await this.check(`[${locale}] 非印尼家族总榜全程累计，不随印尼阶段重置`, async (): Promise<CheckResult> => {
      const resp = await this.pk.queryRank('family', '-', locale, { count: 4 });
      const items = this.rankItems(resp);
      const expected = (3000 + 2000 + 1000) * 1.1;
      return {
        expect: `${families.length} 个家族均为 ${expected}`,
        real: JSON.stringify(items.map((x) => x.amount)),
        pass: items.length === families.length && items.every((x) => Math.abs(x.amount - expected) <= 1),
      };
    });

    await this.check(`[${locale}] 家族总榜奖励与手动 Banner 记录`, async (): Promise<CheckResult> => {
      const resp = await this.pk.queryRank('family', '-', locale, { count: 3 });
      const items = this.rankItems(resp);
      const recipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      items.forEach((it, i) => { recipients[i + 1] = [{ player: it.player, playerType: 'FAMILY' }]; });
      await this.assertSettleAwards('family', EXPECTED_AWARDS['family']!.filter((r) => r.mod === 'ADD'), recipients);
      const view = EXPECTED_AWARDS['family']!.filter((r) => r.mod === 'VIEW' && r.locale === locale);
      if (view.length > 0) await this.assertSettleAwards('family', view, recipients);
      return { expect: '奖励正确', real: '正确', pass: true };
    });
  }
}

await new Pk015FamilyOtherGlobal().execute();