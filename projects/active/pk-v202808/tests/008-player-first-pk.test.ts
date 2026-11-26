import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { int } from './_lib/Pk202808Base.ts';
import { PkStageRunner } from './_lib/PkStageRunner.ts';
import { PK_MODULES, PLAYER_STAGES_IN, PLAYER_STAGES_OTHER } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

class Pk008PlayerFirstPk extends PkStageRunner {
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
    const prev = stages[1]!;
    const stage = stages[2]!;
    const module = isIn ? 'player_in_1v1_100_46' : 'player_1v1_50_20';
    const topN = isIn ? 46 : 20;
    const pairCount = isIn ? 50 : 25;

    const prevList = await this.pk.queryPlayerList(prev.topic, locale);
    if (prevList.length === 0) this.skip(`[${locale}] ${prev.topic} 名单为空，请先执行 007`);

    await this.runPkStage({
      locale,
      module,
      keys: PK_MODULES[module]!.stages,
      pairCount,
      label: '第一 1v1',
    });

    await this.act(`[${locale}] 8/25 23:40 结算第一 PK 阶段并初始化突围赛`, async () => {
      await this.settlePlayerStage(locale, '2028-08-25 23:40:00');
    });

    await this.check(`[${locale}] 晋级名单 in=46 / 非 in=20`, async (): Promise<CheckResult> => {
      const list = await this.pk.queryPlayerList(stage.topic, locale);
      return { expect: String(topN), real: String(list.length), pass: list.length === topN };
    });

    await this.check(`[${locale}] 第一 PK 阶段总榜与贡献 Top1 奖励`, async (): Promise<CheckResult> => {
      const recipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      const list = await this.pk.queryPlayerList(stage.topic, locale);
      const sorted = [...list].sort((a, b) => Number(b['score']) - Number(a['score']));
      for (let rank = 1; rank <= 10; rank++) {
        const p = sorted[rank - 1];
        if (p) recipients[rank] = [{ player: int(p['player']), playerType: 'USER' }];
      }
      await this.assertSettleAwards(stage.topic, EXPECTED_AWARDS[stage.topic]!.filter((r) => r.mod === 'ADD'), recipients);
      const contributor = await this.pk.queryRankRecords(stage.topic, { key: '-', locale });
      const topContributor = contributor
        .filter((r) => String(r['contributor'] ?? '') !== '')
        .sort((a, b) => Number(b['amount']) - Number(a['amount']))[0];
      if (topContributor) {
        await this.assertSettleAwards(
          stage.topic,
          EXPECTED_AWARDS[`${stage.topic}-contributor`]!.filter((r) => r.stage === 1),
          { 1: [{ player: int(topContributor['contributor']), playerType: 'USER' }] },
        );
      }
      return { expect: '奖励正确', real: '正确', pass: true };
    });
  }
}

await new Pk008PlayerFirstPk().execute();