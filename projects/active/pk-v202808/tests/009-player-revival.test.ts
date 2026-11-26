import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import { PLAYER_STAGES_IN, PLAYER_STAGES_OTHER, PLAYER_REVIVAL_IN, PLAYER_REVIVAL_OTHER } from './_lib/constants.ts';

class Pk009PlayerRevival extends Pk202808Base {
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
    const firstPk = stages[2]!;
    const breakout = stages[3]!;
    const revivalTopic = isIn ? PLAYER_REVIVAL_IN : PLAYER_REVIVAL_OTHER;
    const appendTo = isIn ? 50 : 24;

    const breakoutList = await this.pk.queryPlayerList(breakout.topic, locale);
    const firstPkList = await this.pk.queryPlayerList(firstPk.topic, locale);
    if (breakoutList.length === 0 || firstPkList.length === 0) {
      this.skip(`[${locale}] 缺少第一 PK/突围赛名单，请先执行 008`);
    }
    const current = new Set(breakoutList.map((r) => int(r['player'])));
    const eliminated = (this.fx.players?.[locale] ?? []).filter((p) => !current.has(p));
    if (eliminated.length < 5) this.skip(`[${locale}] 已淘汰陪玩不足 5 名（当前 ${eliminated.length}）`);
    const revivalPlayers = eliminated.slice(0, 5);

    await this.act(`[${locale}] 清理并初始化复活赛`, async () => {
      await this.cleanTopic(revivalTopic, locale);
      await this.pk.callModuleInit(revivalTopic, this.cronTs(locale, '2028-08-26 00:05:00'), locale);
    });

    await this.act(`[${locale}] 复活赛造 5 名陪玩分数（Top5）`, async () => {
      await this.seedStage(revivalTopic, locale, revivalPlayers, { baseScore: 9000, step: 1000, contributorOf: (p) => p });
    });

    const beforeCount = breakoutList.length;
    await this.check(`[${locale}] 复活榜仅保留 8/26 当天分数`, async (): Promise<CheckResult> => {
      const rounds = await this.pk.queryRounds(revivalTopic, locale);
      const keys = rounds.map((r) => String(r['key']));
      return { expect: "['20280826']", real: JSON.stringify(keys), pass: keys.length === 1 && keys[0] === '20280826' };
    });

    await this.act(`[${locale}] 8/26 23:40 结算复活榜并初始化突围赛，重复执行一次`, async () => {
      await this.settlePlayerStage(locale, '2028-08-26 23:40:00');
      await this.settlePlayerStage(locale, '2028-08-26 23:40:00');
    });

    await this.check(`[${locale}] Top4 APPEND 后人数 ${appendTo}，第 5 名不进入`, async (): Promise<CheckResult> => {
      const after = await this.pk.queryPlayerList(breakout.topic, locale);
      const ids = after.map((r) => int(r['player']));
      const appended = revivalPlayers.slice(0, 4);
      const fifth = revivalPlayers[4]!;
      const missingAppended = appended.filter((p) => !ids.includes(p));
      const hasFifth = ids.includes(fifth);
      return {
        expect: `${appendTo} 人，Top4 全部加入，第 5 名不加入`,
        real: `${after.length} 人，缺 ${missingAppended.length}，第5名在名单=${hasFifth}`,
        pass: after.length === appendTo && missingAppended.length === 0 && !hasFifth,
      };
    });

    await this.check(`[${locale}] 复活者分数=第一 PK 原始分×0.5+复活赛分数，普通晋级者=×0.5`, async (): Promise<CheckResult> => {
      const after = await this.pk.queryPlayerList(breakout.topic, locale);
      const records = await this.pk.queryRankRecords(breakout.topic, { key: '-', locale });
      const firstPkScores = new Map<number, number>();
      for (const r of await this.pk.queryRankRecords(firstPk.topic, { key: '-', locale })) {
        const p = int(r['player']);
        firstPkScores.set(p, (firstPkScores.get(p) ?? 0) + Number(r['amount']));
      }
      const problems: string[] = [];
      for (const p of revivalPlayers.slice(0, 4)) {
        const expected = (firstPkScores.get(p) ?? 0) * 0.5 + (9000 - revivalPlayers.indexOf(p) * 1000);
        const sum = records.filter((r) => int(r['player']) === p).reduce((s, r) => s + Number(r['amount']), 0);
        if (Math.abs(sum - expected) > 1) problems.push(`复活者 ${p} 分数 ${sum} 期望 ${expected}`);
      }
      const normal = after.find((r) => !revivalPlayers.slice(0, 4).includes(int(r['player'])));
      if (normal) {
        const p = int(normal['player']);
        const sum = records.filter((r) => int(r['player']) === p).reduce((s, r) => s + Number(r['amount']), 0);
        const expected = (firstPkScores.get(p) ?? 0) * 0.5;
        if (firstPkScores.has(p) && Math.abs(sum - expected) > 1) problems.push(`普通晋级者 ${p} 分数 ${sum} 期望 ${expected}`);
      }
      if (problems.length > 0) throw new Error(problems.slice(0, 5).join('；'));
      return { expect: '继承分与复活分正确', real: '正确', pass: true };
    });

    await this.check(`[${locale}] 重复结算不重复加人、不重复加分、Buff 写入真实目标 topic`, async (): Promise<CheckResult> => {
      const list = await this.pk.queryPlayerList(breakout.topic, locale);
      const records = await this.pk.queryRankRecords(breakout.topic, { key: '-', locale });
      const initRows = records.filter((r) => String(r['trans_no'] ?? '').includes('INIT'));
      const perPlayerInit = new Map<number, number>();
      for (const r of initRows) {
        const p = int(r['player']);
        perPlayerInit.set(p, (perPlayerInit.get(p) ?? 0) + 1);
      }
      const dup = [...perPlayerInit.entries()].filter(([, c]) => c > 1);
      const buffs = await this.pk.queryBuffs(breakout.topic, { locale });
      const buffTopics = new Set(buffs.map((b) => String(b['topic'])));
      return {
        expect: `${beforeCount + 4} 人，无重复 INIT，Buff topic=${breakout.topic}`,
        real: `${list.length} 人，重复 INIT ${dup.length}，Buff topic=${JSON.stringify([...buffTopics])}`,
        pass: list.length === beforeCount + 4 && dup.length === 0 && [...buffTopics].every((t) => t === breakout.topic),
      };
    });
  }
}

await new Pk009PlayerRevival().execute();