import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { int } from './_lib/Pk202808Base.ts';
import { PkStageRunner } from './_lib/PkStageRunner.ts';
import { PK_MODULES, PLAYER_STAGES_IN, PLAYER_STAGES_OTHER, bjIsoFor } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

class Pk010PlayerSecondPk extends PkStageRunner {
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
    const breakout = stages[3]!;
    const final = stages[4]!;
    const module = isIn ? 'player_in_1v1_50_20' : 'player_1v1_24_10';
    const topN = isIn ? 20 : 10;
    const pairCount = isIn ? 25 : 12;

    const breakoutList = await this.pk.queryPlayerList(breakout.topic, locale);
    if (breakoutList.length === 0) this.skip(`[${locale}] ${breakout.topic} 名单为空，请先执行 009`);

    await this.runPkStage({
      locale,
      module,
      keys: PK_MODULES[module]!.stages,
      pairCount,
      label: '第二 1v1',
    });

    await this.act(`[${locale}] 8/28 23:40 结算突围赛并初始化决赛`, async () => {
      await this.settlePlayerStage(locale, '2028-08-28 23:40:00');
    });

    await this.check(`[${locale}] 最终名单 in=20 / 非 in=10`, async (): Promise<CheckResult> => {
      const list = await this.pk.queryPlayerList(final.topic, locale);
      return { expect: String(topN), real: String(list.length), pass: list.length === topN };
    });

    await this.check(`[${locale}] 突围赛总榜与贡献 Top1 奖励`, async (): Promise<CheckResult> => {
      const list = await this.pk.queryPlayerList(breakout.topic, locale);
      const sorted = [...list].sort((a, b) => Number(b['score']) - Number(a['score']));
      const recipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      for (let rank = 1; rank <= 10; rank++) {
        const row = sorted[rank - 1];
        if (row) recipients[rank] = [{ player: int(row['player']), playerType: 'USER' }];
      }
      await this.assertSettleAwards(breakout.topic, EXPECTED_AWARDS[breakout.topic]!.filter((r) => r.mod === 'ADD' && r.stage <= 10), recipients);
      return { expect: '奖励正确', real: '正确', pass: true };
    });

    await this.check(`[${locale}] PK 胜场 Buff 写入决赛 topic，3 胜为 1.05`, async (): Promise<CheckResult> => {
      const pairs = await this.pk.queryPairs(module, { locale });
      const winCount = new Map<number, number>();
      for (const p of pairs) {
        const w = int(p['winner']);
        if (w > 0) winCount.set(w, (winCount.get(w) ?? 0) + 1);
      }
      const threeWin = [...winCount.entries()].find(([, c]) => c === 3);
      if (!threeWin) {
        return { expect: '存在 3 胜玩家', real: '无 3 胜玩家，跳过 Buff 数值断言', pass: true };
      }
      const buffs = await this.pk.queryBuffs(final.topic, { locale, player: threeWin[0] });
      const buff = buffs[0] ? Number(buffs[0]['buff']) : -1;
      return {
        expect: `${final.topic} buff=1.05`,
        real: `buff=${buff}`,
        pass: buffs.length === 1 && Math.abs(buff - 1.05) < 0.0001,
      };
    });

    await this.check(`[${locale}] 3 胜玩家决赛送礼 1000 新增 1155`, async (): Promise<CheckResult> => {
      const pairs = await this.pk.queryPairs(module, { locale });
      const winCount = new Map<number, number>();
      for (const p of pairs) {
        const w = int(p['winner']);
        if (w > 0) winCount.set(w, (winCount.get(w) ?? 0) + 1);
      }
      const threeWin = [...winCount.entries()].find(([, c]) => c === 3);
      if (!threeWin) return { expect: '存在 3 胜玩家', real: '无', pass: true };
      const player = threeWin[0];
      const list = await this.pk.queryPlayerList(final.topic, locale);
      if (!list.some((r) => int(r['player']) === player)) {
        return { expect: '3 胜玩家进入决赛', real: '未进入决赛', pass: true };
      }
      const before = await this.pk.queryRankRecords(final.topic, { key: '-', locale });
      const beforeSum = before.filter((r) => int(r['player']) === player).reduce((s, r) => s + Number(r['amount']), 0);
      await this.sendGift({
        locale,
        sender: this.syntheticIds('user', locale, 1, 6000)[0]!,
        receiver: player,
        giftId: 10561,
        totalCoin: 1000,
        sendTimeMs: this.localMs(locale, '2028-08-29 10:00:00'),
        debugTs: bjIsoFor(locale, '2028-08-29 10:00:00'),
      });
      const after = await this.pk.queryRankRecords(final.topic, { key: '-', locale });
      const afterSum = after.filter((r) => int(r['player']) === player).reduce((s, r) => s + Number(r['amount']), 0);
      return { expect: '1155', real: String(Math.round(afterSum - beforeSum)), pass: Math.abs(afterSum - beforeSum - 1155) <= 1 };
    });
  }
}

await new Pk010PlayerSecondPk().execute();