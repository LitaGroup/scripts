import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import { PLAYER_STAGES_IN, PLAYER_STAGES_OTHER, bjIsoFor } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

class Pk006PlayerStage1 extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    for (const locale of ['in', 'vi', 'ph', 'ko']) {
      await this.runLocale(locale);
    }
  }

  private async runLocale(locale: string): Promise<void> {
    const isIn = locale === 'in';
    const stages = isIn ? PLAYER_STAGES_IN : PLAYER_STAGES_OTHER;
    const stage = stages[0]!;
    const topN = isIn ? 200 : 100;
    const players = this.requirePlayers(locale, isIn ? 201 : 101);
    const dailyTopic = stage.topic;

    await this.act(`[${locale}] 清理 ${stage.topic} 历史数据`, async () => {
      await this.cleanTopic(stage.topic, locale);
      await this.cleanTopic(stages[1]!.topic, locale);
      for (const module of isIn ? ['player_in_1v1_100_46'] : ['player_1v1_50_20']) {
        await this.cleanTopic(module, locale);
      }
    });

    await this.act(`[${locale}] 造 ${players.length} 名陪玩海选分（玩家/贡献者就绪）`, async () => {
      await this.seedStage(stage.topic, locale, players, { baseScore: 20000, step: 50 });
    });

    await this.act(`[${locale}] 海选期间发送 1 笔真实送礼验证消费链路`, async () => {
      await this.sendGift({
        locale,
        sender: players[players.length - 1]!,
        receiver: players[0]!,
        giftId: 10561,
        totalCoin: 1000,
        sendTimeMs: this.localMs(locale, '2028-08-18 10:00:00'),
        debugTs: bjIsoFor(locale, '2028-08-18 10:00:00'),
      });
    });

    await this.check(`[${locale}] 海选榜分数=造数分+真实送礼增量 1100`, async (): Promise<CheckResult> => {
      const resp = await this.pk.queryRank(stage.topic, '-', locale, { count: 5 });
      const items = this.rankItems(resp);
      const expectedTop = 20000 + 1100;
      return {
        expect: `Top1=${expectedTop}`,
        real: `Top1=${items[0]?.amount}`,
        pass: items[0]?.amount === expectedTop,
      };
    });

    await this.act(`[${locale}] 造 3 个日榜并逐日结算`, async () => {
      for (let i = 0; i < 3; i++) {
        const day = `202808${17 + i}`;
        await this.seedStage(stage.topic, locale, [players[1]!, players[2]!, players[3]!], {
          key: day,
          baseScore: 5000,
          step: 1000,
          contributorOf: (p) => p,
        });
        await this.settlePlayerDaily(locale, `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)} 00:06:00`);
      }
    });

    await this.act(`[${locale}] 本地 8/19 23:40 结算海选并初始化下一阶段`, async () => {
      await this.settlePlayerStage(locale, '2028-08-19 23:40:00');
    });

    await this.check(`[${locale}] 晋级名单数量 in=200 / 非 in=100`, async (): Promise<CheckResult> => {
      const list = await this.pk.queryPlayerList(stage.topic, locale);
      const expectedCount = topN;
      const sorted = [...list].sort((a, b) => Number(b['score']) - Number(a['score']));
      const actualTop = sorted.slice(0, topN).map((r) => int(r['player']));
      const expectedPlayers = players.slice(0, topN);
      return {
        expect: `${expectedCount} 人且为无缓存排名 Top${topN}`,
        real: `${list.length} 人`,
        pass: list.length === expectedCount && JSON.stringify(actualTop) === JSON.stringify(expectedPlayers),
      };
    });

    await this.check(`[${locale}] 阶段总榜 Top1-3/4-5/6-10 自动奖励与配置一致`, async (): Promise<CheckResult> => {
      const recipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      for (let rank = 1; rank <= 10; rank++) recipients[rank] = [{ player: players[rank - 1]!, playerType: 'USER' }];
      await this.assertSettleAwards(stage.topic, EXPECTED_AWARDS[stage.topic]!.filter((r) => r.mod === 'ADD'), recipients);
      return { expect: 'Top10 奖励正确', real: '正确', pass: true };
    });

    await this.check(`[${locale}] 贡献 Top1 获得 MICBOX 12081（5/3/1 天分段）`, async (): Promise<CheckResult> => {
      const contrib = players[1]!;
      await this.assertSettleAwards(
        stage.topic,
        EXPECTED_AWARDS[`${stage.topic}-contributor`]!.filter((r) => r.stage === 1),
        { 1: [{ player: contrib, playerType: 'USER' }] },
      );
      return { expect: '贡献 Top1 奖励正确', real: '正确', pass: true };
    });

    await this.check(`[${locale}] 3 个日榜 Top1 获得 HEADBOX 739+BUBBLE 963（3 天）`, async (): Promise<CheckResult> => {
      await this.assertSettleAwards(
        stage.topic,
        EXPECTED_AWARDS[`${dailyTopic}-daily`]!,
        { 1: [{ player: players[1]!, playerType: 'USER' }] },
        { occurrences: 3 },
      );
      return { expect: '3 个日榜奖励正确', real: '正确', pass: true };
    });
  }
}

await new Pk006PlayerStage1().execute();