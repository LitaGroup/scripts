import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import { DAILY_KEYS, LOCALES, bjIsoFor } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

class Pk004UserDailyMain extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    for (const locale of LOCALES) {
      await this.runLocale(locale);
    }
  }

  private async runLocale(locale: string): Promise<void> {
    const users = (this.fx.users?.[locale] ?? this.syntheticIds('user', locale, 3, 1000)) .slice(0, 3);
    if (users.length < 3) this.skip(`fixtures.users.${locale} 需要 3 个用户`);
    const scores = [3000, 2000, 1000];
    const expectedDaily = [3300, 2200, 1100];

    await this.act(`[${locale}] 清理用户榜数据`, async () => {
      await this.cleanTopic('user', locale);
    });

    await this.act(`[${locale}] 13 个日榜各造 3 名送礼人（3000/2000/1000）`, async () => {
      for (let i = 0; i < DAILY_KEYS.length; i++) {
        const day = DAILY_KEYS[i]!;
        const sendMs = this.localMs(locale, `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)} 18:00:00`);
        for (let u = 0; u < 3; u++) {
          await this.sendGift({
            locale,
            sender: users[u]!,
            receiver: (this.fx.players?.[locale] ?? [users[(u + 1) % 3]!])[0]!,
            giftId: 10561,
            totalCoin: scores[u]!,
            sendTimeMs: sendMs,
            debugTs: bjIsoFor(locale, `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)} 18:00:00`),
          });
        }
      }
    });

    await this.act(`[${locale}] 15 天内按本地次日 00:06 执行日榜结算，活动后结算总榜`, async () => {
      for (const day of DAILY_KEYS) {
        await this.pk.callCron(bjIsoFor(locale, `${localNextDay(day)} 00:06:00`));
      }
      await this.pk.callCron('2028-08-30T00:10:00+08:00');
    });

    await this.check(`[${locale}] 13 个日榜金额依次为 3300/2200/1100 且状态 200`, async (): Promise<CheckResult> => {
      const rounds = await this.pk.queryRounds('user', locale);
      const problems: string[] = [];
      for (const day of DAILY_KEYS) {
        const round = rounds.find((r) => String(r['key']) === day);
        if (!round) {
          problems.push(`${day} 缺轮次`);
          continue;
        }
        if (int(round['status']) !== 200) problems.push(`${day} status=${round['status']}`);
        const resp = await this.pk.queryRank('user', day, locale, { count: 3 });
        const amounts = this.rankItems(resp).map((x) => x.amount);
        if (JSON.stringify(amounts) !== JSON.stringify(expectedDaily)) {
          problems.push(`${day} 金额=${JSON.stringify(amounts)}`);
        }
      }
      if (problems.length > 0) throw new Error(problems.slice(0, 5).join('；'));
      return { expect: '13 个日榜金额与状态正确', real: '正确', pass: true };
    });

    await this.check(`[${locale}] 每个日榜 Top1/2/3 发放 MICBOX 14280+BUBBLE 968（5/3/1 天）`, async (): Promise<CheckResult> => {
      await this.assertSettleAwards(
        'user',
        EXPECTED_AWARDS['user-daily']!,
        { 1: [{ player: users[0]!, playerType: 'USER' }], 2: [{ player: users[1]!, playerType: 'USER' }], 3: [{ player: users[2]!, playerType: 'USER' }] },
        { occurrences: DAILY_KEYS.length },
      );
      return { expect: `13 天 × ${EXPECTED_AWARDS['user-daily']!.length} 条`, real: '一致', pass: true };
    });

    await this.check(`[${locale}] 赛事总榜分数=各日榜之和`, async (): Promise<CheckResult> => {
      const resp = await this.pk.queryRank('user', '-', locale, { count: 3 });
      const items = this.rankItems(resp);
      const expected = expectedDaily.map((v) => v * DAILY_KEYS.length);
      const actual = items.map((x) => x.amount);
      return { expect: JSON.stringify(expected), real: JSON.stringify(actual), pass: JSON.stringify(expected) === JSON.stringify(actual) };
    });

    await this.check(`[${locale}] 总榜自动奖励与手动 VIEW 奖励配置一致`, async (): Promise<CheckResult> => {
      const add = EXPECTED_AWARDS['user']!.filter((r) => r.mod === 'ADD');
      const view = EXPECTED_AWARDS['user']!.filter((r) => r.mod === 'VIEW' && (locale === 'in' || r.locale === locale));
      const recipients = {
        1: [{ player: users[0]!, playerType: 'USER' }],
        2: [{ player: users[1]!, playerType: 'USER' }],
        3: [{ player: users[2]!, playerType: 'USER' }],
      };
      await this.assertSettleAwards('user', add, recipients);
      await this.assertSettleAwards('user', view, recipients);
      return { expect: `${add.length} 条 ADD + ${view.length} 条 VIEW 记录`, real: '一致', pass: true };
    });
  }
}

function localNextDay(day: string): string {
  const ms = Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00Z`) + 86400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

await new Pk004UserDailyMain().execute();