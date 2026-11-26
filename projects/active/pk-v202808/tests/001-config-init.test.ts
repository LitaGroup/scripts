import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { beijingMs } from '../../../../src/base/TimeUtils.ts';
import { Pk202808Base } from './_lib/Pk202808Base.ts';
import {
  ACTIVITY_FINISH_MS,
  ACTIVITY_START_MS,
  BIZ,
  DAILY_KEYS,
  FAMILY_STAGES,
  GIFTS,
  LOCALES,
  OTHER_LOCALES,
  PK_MODULES,
  PLAYER_REVIVAL_IN,
  PLAYER_REVIVAL_OTHER,
  PLAYER_STAGES_IN,
  PLAYER_STAGES_OTHER,
  ROOM_STAGES,
  finishMsOf,
  startMsOf,
} from './_lib/constants.ts';
import { AWARD_NAMES } from './_lib/awards.ts';

function int(v: unknown): number {
  return Math.trunc(Number(v));
}

function ms(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '');
  return /^\d+$/.test(s) ? Number(s) : Date.parse(s);
}

class Pk001ConfigInit extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    await this.act('清理本 biz 测试数据（仅 pk-v202808）', async () => {
      await this.cleanAllForCase();
    });

    await this.act('在 2028-08-10 00:00 BJ 执行初始化 Cron', async () => {
      await this.pk.callCron('2028-08-10T00:00:00+08:00');
    });

    await this.check('活动 biz 与统一起止时间（北京时间 08-17 14:00 ~ 08-29 23:59:59）', async (): Promise<CheckResult> => {
      const detail = await this.pk.callDetail('2028-08-18T10:00:00+07:00');
      const biz = String(detail['biz'] ?? '');
      const begin = ms(detail['beginTime'] ?? detail['startTime']);
      const end = ms(detail['endTime'] ?? detail['finishTime']);
      const ok = biz === BIZ && Math.abs(begin - ACTIVITY_START_MS) <= 1000 && Math.abs(end - ACTIVITY_FINISH_MS) <= 1000;
      return {
        expect: `${BIZ} ${ACTIVITY_START_MS} ~ ${ACTIVITY_FINISH_MS}`,
        real: `${biz} ${begin} ~ ${end}`,
        pass: ok,
      };
    });

    for (const locale of LOCALES) {
      await this.check(`${locale} 陪玩阶段/复活/1v1 轮次齐全`, async (): Promise<CheckResult> => {
        const stages = locale === 'in' ? PLAYER_STAGES_IN : PLAYER_STAGES_OTHER;
        const revival = locale === 'in' ? PLAYER_REVIVAL_IN : PLAYER_REVIVAL_OTHER;
        const modules = locale === 'in'
          ? ['player_in_1v1_100_46', 'player_in_1v1_50_20']
          : ['player_1v1_50_20', 'player_1v1_24_10'];
        const problems: string[] = [];
        for (const stage of stages) {
          const rounds = await this.pk.queryRounds(stage.topic, locale);
          const main = rounds.filter((r) => String(r['key']) === '-');
          if (main.length !== 1) problems.push(`${stage.topic} 主榜 ${main.length} 条`);
        }
        const dailyTopic = locale === 'in' ? 'player_in_n_200' : 'player_n_100';
        const dailyTopic2 = locale === 'in' ? 'player_in_200_100' : 'player_100_50';
        for (const topic of [dailyTopic, dailyTopic2]) {
          const rounds = await this.pk.queryRounds(topic, locale);
          const days = rounds.filter((r) => String(r['key']) !== '-').map((r) => String(r['key']));
          const expectDays = topic.includes('n_200') || topic === 'player_n_100'
            ? ['20280817', '20280818', '20280819']
            : ['20280820', '20280821', '20280822'];
          if (JSON.stringify([...days].sort()) !== JSON.stringify(expectDays)) {
            problems.push(`${topic} 日榜 key=${JSON.stringify(days)} 期望 ${JSON.stringify(expectDays)}`);
          }
        }
        const revivalRows = await this.pk.queryRounds(revival, locale);
        if (revivalRows.length !== 1 || String(revivalRows[0]!['key']) !== '20280826') {
          problems.push(`${revival} 仅应有 20280826 轮次，实际 ${JSON.stringify(revivalRows.map((r) => r['key']))}`);
        }
        for (const module of modules) {
          const rounds = await this.pk.queryRounds(module, locale);
          const keys = rounds.map((r) => String(r['key'])).sort();
          const expected = PK_MODULES[module]!.stages;
          if (JSON.stringify(keys) !== JSON.stringify([...expected].sort())) {
            problems.push(`${module} key=${JSON.stringify(keys)} 期望 ${JSON.stringify(expected)}`);
          }
        }
        if (problems.length > 0) throw new Error(problems.join('；'));
        return { expect: '阶段/日榜/复活/1v1 轮次齐全', real: '齐全', pass: true };
      });
    }

    for (const locale of LOCALES) {
      await this.check(`${locale} 房间/家族/用户/CP 轮次数量与赛程一致`, async (): Promise<CheckResult> => {
        const problems: string[] = [];
        const isIn = locale === 'in';
        const roomTopics = isIn ? ROOM_STAGES.map((s) => s.topic) : ['room'];
        const familyTopics = isIn ? FAMILY_STAGES.map((s) => s.topic) : ['family'];
        for (const topic of roomTopics) {
          const rounds = await this.pk.queryRounds(topic, locale);
          if (rounds.length !== 1) problems.push(`${topic} 主榜 ${rounds.length} 条`);
        }
        for (const topic of familyTopics) {
          const rounds = await this.pk.queryRounds(topic, locale);
          if (rounds.length !== 1) problems.push(`${topic} 主榜 ${rounds.length} 条`);
        }
        for (const topic of ['user', 'couple']) {
          const rounds = await this.pk.queryRounds(topic, locale);
          const main = rounds.filter((r) => String(r['key']) === '-');
          const days = rounds.filter((r) => String(r['key']) !== '-').map((r) => String(r['key'])).sort();
          if (main.length !== 1) problems.push(`${topic} 主榜 ${main.length} 条`);
          if (JSON.stringify(days) !== JSON.stringify(DAILY_KEYS)) {
            problems.push(`${topic} 日榜 ${days.length} 条，期望 13 条`);
          }
        }
        if (isIn && roomTopics.length !== 6) problems.push('in 房间阶段应为 6 个');
        if (!isIn && roomTopics.length !== 1) problems.push(`${locale} 房间仅应有总榜`);
        if (problems.length > 0) throw new Error(problems.join('；'));
        return { expect: '轮次数量与赛程一致', real: '一致', pass: true };
      });
    }

    await this.check('印尼房间/家族六阶段起止日期为 17-19、20-22、23-24、25-26、27-28、29', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      for (const stage of [...ROOM_STAGES, ...FAMILY_STAGES]) {
        const rows = await this.pk.queryRounds(stage.topic, 'in');
        const row = rows.find((r) => String(r['key']) === '-');
        if (!row) {
          problems.push(`${stage.topic} 缺主榜`);
          continue;
        }
        const expStart = startMsOf('in', stage);
        const expFinish = finishMsOf('in', stage);
        const realStart = int(row['start_time']);
        const realFinish = int(row['finish_time']);
        if (Math.abs(realStart - expStart) > 1000) problems.push(`${stage.topic} start=${realStart} 期望 ${expStart}`);
        if (Math.abs(realFinish - expFinish) > 1000) problems.push(`${stage.topic} finish=${realFinish} 期望 ${expFinish}`);
      }
      if (problems.length > 0) throw new Error(problems.slice(0, 5).join('；'));
      return { expect: '六阶段起止与配置一致', real: '一致', pass: true };
    });

    await this.check('陪玩阶段继承与决赛结束口径', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      for (const locale of LOCALES) {
        const stages = locale === 'in' ? PLAYER_STAGES_IN : PLAYER_STAGES_OTHER;
        const final = stages[stages.length - 1]!;
        const rows = await this.pk.queryRounds(final.topic, locale);
        const row = rows.find((r) => String(r['key']) === '-');
        if (!row) problems.push(`${final.topic} 缺主榜`);
        else if (int(row['finish_time']) !== ACTIVITY_FINISH_MS) {
          problems.push(`${final.topic} 决赛结束=${row['finish_time']} 期望 ${ACTIVITY_FINISH_MS}`);
        }
        const first = stages[0]!;
        const firstRow = (await this.pk.queryRounds(first.topic, locale)).find((r) => String(r['key']) === '-');
        if (!firstRow) problems.push(`${first.topic} 缺主榜`);
        else if (int(firstRow['start_time']) !== ACTIVITY_START_MS) {
          problems.push(`${first.topic} 首阶段开始=${firstRow['start_time']} 期望 ${ACTIVITY_START_MS}`);
        }
      }
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: '首阶段=A 开始，决赛=A 结束', real: '一致', pass: true };
    });

    await this.check('活动礼物接口返回 12 个礼物，stage 0/1/2 各 4 个，special 仅 10628/10637', async (): Promise<CheckResult> => {
      const resp = await this.pk.queryActiveGifts('in', '2028-08-18T10:00:00+07:00');
      const gifts = (resp['gifts'] ?? []) as Array<Record<string, unknown>>;
      const ids = gifts.map((g) => int(g['id']));
      const special = gifts.filter((g) => g['special'] === true).map((g) => int(g['id'])).sort();
      const stageCount = [0, 1, 2].map((s) => gifts.filter((g) => int(g['stage']) === s).length);
      const ok = gifts.length === 12
        && new Set(ids).size === 12
        && GIFTS.every((g) => ids.includes(g.id))
        && JSON.stringify(stageCount) === JSON.stringify([4, 4, 4])
        && JSON.stringify(special) === JSON.stringify([10628, 10637]);
      return {
        expect: '12 个礼物，stage=4/4/4，special=10628,10637',
        real: `${gifts.length} 个，stage=${JSON.stringify(stageCount)}，special=${JSON.stringify(special)}`,
        pass: ok,
      };
    });

    await this.check('32 个模块 /detail 均返回 status=0 且轮次可读', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      const inTopics = [
        ...PLAYER_STAGES_IN.map((s) => s.topic),
        PLAYER_REVIVAL_IN,
        ...ROOM_STAGES.map((s) => s.topic),
        ...FAMILY_STAGES.map((s) => s.topic),
        'user',
        'couple',
        'player_in_1v1_100_46',
        'player_in_1v1_50_20',
      ];
      const otherTopics = [
        ...PLAYER_STAGES_OTHER.map((s) => s.topic),
        PLAYER_REVIVAL_OTHER,
        'room',
        'family',
        'user',
        'couple',
        'player_1v1_50_20',
        'player_1v1_24_10',
      ];
      const cases: Array<[string, string]> = [
        ...inTopics.map((t) => [t, 'in'] as [string, string]),
        ...otherTopics.map((t) => [t, 'vi'] as [string, string]),
      ];
      const unique = new Set(cases.map(([t]) => t));
      if (unique.size !== 32) problems.push(`模块清单去重后 ${unique.size} 个，期望 32 个`);
      for (const [topic, locale] of cases) {
        try {
          const resp = await this.pk.callModuleDetail(topic, locale, '2028-08-18T10:00:00+07:00');
          const detail = (resp['detail'] ?? resp) as Record<string, unknown>;
          if (!detail || Object.keys(detail).length === 0) problems.push(`${locale}/${topic} detail 为空`);
        } catch (e) {
          problems.push(`${locale}/${topic}: ${(e as Error).message.slice(0, 80)}`);
        }
      }
      if (problems.length > 0) throw new Error(`${problems.length} 个模块 detail 异常：${problems.slice(0, 3).join('；')}`);
      return { expect: '32 模块可查询', real: `${unique.size} 个模块可查询`, pass: true };
    });

    await this.check('奖励表与需求奖励配置全量 diff（ADD/VIEW）', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      for (const name of AWARD_NAMES) {
        try {
          const r = await this.assertAwardConfig(name);
          if (r.pass === false) problems.push(`${name}: ${r.message}`);
        } catch (e) {
          problems.push(`${name}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      if (problems.length > 0) throw new Error(`${problems.length} 个奖励名不一致：${problems.slice(0, 5).join('；')}`);
      return { expect: `${AWARD_NAMES.length} 个奖励名全量一致`, real: '一致', pass: true };
    });

    await this.check('配置中不含 2026 年时间（轮次均落在 2028 年）', async (): Promise<CheckResult> => {
      const rows = await this.pk.queryRounds();
      const min = beijingMs('2028-01-01 00:00:00');
      const max = beijingMs('2029-01-01 00:00:00');
      const bad = rows.filter((r) => int(r['start_time']) < min || int(r['start_time']) >= max);
      return {
        expect: '全部轮次在 2028 年',
        real: bad.length === 0 ? `${rows.length} 条均在 2028 年` : `${bad.length} 条越界`,
        pass: bad.length === 0,
      };
    });
  }
}

await new Pk001ConfigInit().execute();