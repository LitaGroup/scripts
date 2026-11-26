import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import { PLAYER_STAGES_IN, PLAYER_STAGES_OTHER, TOP_STAGE_BUFF, bjIsoFor } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

class Pk007PlayerStage2 extends Pk202808Base {
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
    const prev = stages[0]!;
    const stage = stages[1]!;
    const topN = isIn ? 100 : 50;

    const prevList = await this.pk.queryPlayerList(prev.topic, locale);
    if (prevList.length === 0) this.skip(`[${locale}] 上一阶段 ${prev.topic} 名单为空，请先执行 006`);

    await this.check(`[${locale}] 资格赛轮次已由上一阶段结算初始化（status=100）`, async (): Promise<CheckResult> => {
      const rounds = await this.pk.queryRounds(stage.topic, locale);
      const main = rounds.find((r) => String(r['key']) === '-');
      const status = main ? int(main['status']) : -1;
      return { expect: '100', real: String(status), pass: status === 100 };
    });

    const sorted = [...prevList].sort((a, b) => Number(b['score']) - Number(a['score']));
    const inheritMap = new Map(sorted.map((r) => [int(r['player']), Number(r['score'])]));
    const picks = [1, 4, 6].map((rank) => int(sorted[rank - 1]!['player']));
    const inherited = picks.map((p) => inheritMap.get(p) ?? 0);

    await this.check(`[${locale}] 继承分为上一阶段原始分 50%，第 1/4/6 名为 10000`, async (): Promise<CheckResult> => {
      const records = await this.pk.queryRankRecords(stage.topic, { key: '-', locale });
      const problems: string[] = [];
      for (const p of picks) {
        const sum = records.filter((r) => int(r['player']) === p).reduce((s, r) => s + Number(r['amount']), 0);
        if (Math.abs(sum - 10000) > 0.5) problems.push(`玩家 ${p} 继承分 ${sum} 期望 10000`);
      }
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: picks.map(() => 10000).join(','), real: pickedSums(records, picks).join(','), pass: true };
    });

    await this.check(`[${locale}] 上一阶段 Top10 下阶段 Buff 写入 ${stage.topic}`, async (): Promise<CheckResult> => {
      const buffs = await this.pk.queryBuffs(stage.topic, { locale });
      const problems: string[] = [];
      sorted.slice(0, 10).forEach((row, i) => {
        const p = int(row['player']);
        const buff = buffs.find((b) => int(b['player']) === p);
        const expect = TOP_STAGE_BUFF[i];
        if (!buff) problems.push(`玩家 ${p} 缺 Buff`);
        else if (Math.abs(Number(buff['buff']) - expect!) > 0.0001) problems.push(`玩家 ${p} Buff=${buff['buff']} 期望 ${expect}`);
      });
      if (problems.length > 0) throw new Error(problems.slice(0, 5).join('；'));
      return { expect: JSON.stringify(TOP_STAGE_BUFF), real: '一致', pass: true };
    });

    const sendMs = this.localMs(locale, '2028-08-20 10:00:00');
    const debugTs = bjIsoFor(locale, '2028-08-20 10:00:00');
    const senders = this.syntheticIds('user', locale, 3, 3000);

    await this.act(`[${locale}] 第 1/4/6 名各送 1000 币（礼物 Buff=1、普通身份）`, async () => {
      for (let i = 0; i < picks.length; i++) {
        await this.sendGift({ locale, sender: senders[i]!, receiver: picks[i]!, giftId: 10561, totalCoin: 1000, sendTimeMs: sendMs, debugTs });
      }
    });

    await this.check(`[${locale}] 新增分 1320/1210/1155，总分 11320/11210/11155`, async (): Promise<CheckResult> => {
      const records = await this.pk.queryRankRecords(stage.topic, { key: '-', locale });
      const expectedAdd = [1320, 1210, 1155];
      const expectedTotal = [11320, 11210, 11155];
      const problems: string[] = [];
      picks.forEach((p, i) => {
        const rows = records.filter((r) => int(r['player']) === p);
        const giftRows = rows.filter((r) => !String(r['trans_no'] ?? '').includes('INIT'));
        const add = giftRows.reduce((s, r) => s + Number(r['amount']), 0);
        const total = rows.reduce((s, r) => s + Number(r['amount']), 0);
        if (Math.abs(add - expectedAdd[i]!) > 0.5) problems.push(`玩家 ${p} 新增 ${add} 期望 ${expectedAdd[i]}`);
        if (Math.abs(total - expectedTotal[i]!) > 0.5) problems.push(`玩家 ${p} 总分 ${total} 期望 ${expectedTotal[i]}`);
        if (Math.abs(inherited[picks.indexOf(p)]! - (total - add)) > 0.5) problems.push(`玩家 ${p} 继承分与上一阶段原始分 50% 不一致`);
      });
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: expectedTotal.join(','), real: '一致', pass: true };
    });

    await this.check(`[${locale}] 非本阶段白名单用户送礼不进入本阶段`, async (): Promise<CheckResult> => {
      const outsider = (this.fx.players?.[locale] ?? []).find((p) => !inheritMap.has(p));
      if (outsider === undefined) this.skip('fixtures 陪玩数量不足以构造榜外用户');
      const orderNo = this.pk.makeOrderNo('PK28OUT');
      await this.sendGift({ locale, sender: senders[0]!, receiver: outsider, giftId: 10561, totalCoin: 1000, sendTimeMs: sendMs, debugTs, orderNo });
      const hits = (await this.recordsOfOrder(orderNo)).filter((r) => r['topic'] === stage.topic);
      return { expect: '0', real: String(hits.length), pass: hits.length === 0 };
    });

    await this.act(`[${locale}] 3 个日榜造数并结算，8/22 23:40 结算资格赛`, async () => {
      for (let i = 0; i < 3; i++) {
        const day = `202808${20 + i}`;
        await this.seedStage(stage.topic, locale, [picks[0]!, picks[1]!, picks[2]!], {
          key: day, baseScore: 5000, step: 1000, contributorOf: (p) => p,
        });
        await this.settlePlayerDaily(locale, `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)} 00:06:00`);
      }
      await this.settlePlayerStage(locale, '2028-08-22 23:40:00');
    });

    await this.check(`[${locale}] 晋级名单 in=100 / 非 in=50`, async (): Promise<CheckResult> => {
      const list = await this.pk.queryPlayerList(stage.topic, locale);
      return { expect: String(topN), real: String(list.length), pass: list.length === topN };
    });

    await this.check(`[${locale}] 资格赛 Top10 奖励与贡献 Top1 奖励`, async (): Promise<CheckResult> => {
      const recipients: Record<number, Array<{ player: number; playerType: string }>> = {};
      const top10 = sorted.slice(0, 10).map((r) => int(r['player']));
      top10.forEach((p, i) => { recipients[i + 1] = [{ player: p, playerType: 'USER' }]; });
      const contribRecipients = { 1: [{ player: senders[0]!, playerType: 'USER' }] };
      await this.assertSettleAwards(stage.topic, EXPECTED_AWARDS[stage.topic]!.filter((r) => r.mod === 'ADD' && r.stage === 1), recipients);
      await this.assertSettleAwards(
        stage.topic,
        EXPECTED_AWARDS[`${stage.topic}-contributor`]!.filter((r) => r.stage === 1),
        contribRecipients,
      );
      return { expect: '奖励正确', real: '正确', pass: true };
    });
  }
}

function pickedSums(records: Array<Record<string, unknown>>, picks: number[]): number[] {
  return picks.map((p) => records.filter((r) => int(r['player']) === p).reduce((s, r) => s + Number(r['amount']), 0));
}

await new Pk007PlayerStage2().execute();