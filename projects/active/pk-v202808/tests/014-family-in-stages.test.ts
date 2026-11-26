import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import { FAMILY_STAGES, bjIsoFor } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

class Pk014FamilyInStages extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    const locale = 'in';
    const families = this.requireFamilies(locale, 201);

    for (const stage of FAMILY_STAGES) await this.cleanTopic(stage.topic, locale);

    let previous: Array<{ id: number; members: number[] }> = [];
    for (let i = 0; i < FAMILY_STAGES.length; i++) {
      const stage = FAMILY_STAGES[i]!;
      const label = stage.topic;

      await this.act(`[${locale}] ${label} 造数/继承`, async () => {
        if (i === 0) {
          await this.seedStage(stage.topic, locale, families.map((f) => f.id), {
            baseScore: 20000,
            step: 50,
            contributorOf: (_, idx) => families[idx]!.members[0] ?? 0,
          });
        } else {
          const inherited = await this.pk.queryRankRecords(stage.topic, { key: '-', locale });
          if (inherited.length === 0) throw new Error(`${label} 未从上一阶段名单继承`);
        }
        const top = previous[0] ?? families[0]!;
        const sender = top.members[0] ?? 1;
        await this.sendGift({
          locale,
          sender,
          receiver: top.members[1] ?? sender,
          roomId: 0,
          familyId: top.id,
          giftId: 10561,
          totalCoin: 1000,
          sendTimeMs: this.localMs(locale, `${(stage.startLocal ?? '2028-08-18 00:00:00').slice(0, 10)} 10:00:00`),
          debugTs: bjIsoFor(locale, `${(stage.startLocal ?? '2028-08-18 00:00:00').slice(0, 10)} 10:00:00`),
        });
      });

      await this.act(`[${locale}] ${label} 本地 23:40 结算（家族 Cron 23:37）并初始化下一阶段`, async () => {
        await this.runCronAt(locale, stage.lockLocal.replace('23:30:00', '23:40:00'));
      });

      const list = await this.pk.queryPlayerList(stage.topic, locale);
      const expectedCount = i === 0 ? Math.min(200, families.length) : Math.min(stage.top, previous.length || stage.top);
      await this.check(`[${label}] 晋级名单数量=${expectedCount}`, async (): Promise<CheckResult> => {
        return { expect: String(expectedCount), real: String(list.length), pass: list.length === expectedCount };
      });

      const familyById = new Map(families.map((f) => [f.id, f]));
      const recipientsFor = (count: number) => {
        const map: Record<number, Array<{ player: number; playerType: string }>> = {};
        for (let rank = 1; rank <= count; rank++) {
          const row = list[rank - 1];
          if (!row) continue;
          const fid = int(row['player']);
          const fam = familyById.get(fid);
          map[rank] = [
            ...(fam?.members ?? []).map((m) => ({ player: m, playerType: 'USER' })),
            { player: fid, playerType: 'FAMILY' },
          ];
        }
        return map;
      };

      await this.check(`[${label}] 家族全员/家族本体奖励与配置一致`, async (): Promise<CheckResult> => {
        const expected = EXPECTED_AWARDS[stage.topic]!.filter((r) => r.mod === 'ADD');
        const topCount = Math.min(3, list.length);
        await this.assertSettleAwards(stage.topic, expected, recipientsFor(topCount));
        return { expect: '奖励正确', real: '正确', pass: true };
      });

      await this.check(`[${label}] 全球家族榜来源 topic 随当前阶段切换`, async (): Promise<CheckResult> => {
        const probeDt = `${(stage.startLocal ?? '2028-08-18 00:00:00').slice(0, 10)} 10:00:00`;
        const resp = (await this.pk.queryGlobalFamilyRank(locale, bjIsoFor(locale, probeDt))) as Record<string, unknown>;
        const items = (resp['rankResult'] ?? resp['list'] ?? []) as Array<Record<string, unknown>>;
        const inItems = items.filter((x) => String(x['locale'] ?? 'in') === 'in');
        const wrong = inItems.filter((x) => String(x['topic'] ?? '') !== stage.topic);
        return {
          expect: `in 来源=${stage.topic}`,
          real: `in ${inItems.length} 条，来源不符 ${wrong.length} 条`,
          pass: wrong.length === 0,
        };
      });

      previous = list.map((r) => familyById.get(int(r['player'])) ?? { id: int(r['player']), members: [] });
    }
  }
}

await new Pk014FamilyInStages().execute();