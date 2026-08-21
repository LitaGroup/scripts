import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { beijingMs, isoMs, localMs, endOfDayMs } from '../../../../src/base/TimeUtils.ts';
import type { MysqlRow } from '../../../../src/resources/MySQLTestResource.ts';
import { IN_FAMILY_TOPICS, IN_ROUND_DAYS, IN_LOCALE, OTHER_LOCALES } from './_lib/constants.ts';

const TOTAL_START_BJ = '2026-08-17 14:00:00';
const TOTAL_FINISH_BJ = '2026-08-29 23:59:59';
const TOTAL_FINISH_BJ_ALT = '2026-08-30 00:00:00';
const N_200_START_ISO = '2026-08-17T14:00:00+08:00';
const IN_10_1_FINISH_ISO = '2026-08-29T23:59:59+08:00';
const FAMILY_INIT_DEBUG_TS = '2026-08-15T13:24:23+08:00';

function int(v: unknown): number {
  return Number(v);
}

class Family001Init extends TestBaseClass {
  constructor() {
    super();
    this.total = 11;
  }

  protected async run(): Promise<void> {
    await this.act('清理 mod_common_round 中家族榜历史数据', async () => {
      await this.family.cleanFamilyRounds();
    });

    await this.act('调用 family-init 接口生成榜单数据', async () => {
      await this.family.callFamilyInit(FAMILY_INIT_DEBUG_TS);
    });

    await this.check('非 in 大区（vi/ph/ko）仅 family 总榜，key=\'-\' 各 1 条', async (): Promise<CheckResult> => {
      const rows = await this.otherTotalRows();
      if (rows.length === 0) throw new Error('非 in 大区 family 总榜记录为空');
      const locales = rows.map((r) => String(r['locale'])).sort();
      const expect = JSON.stringify([...OTHER_LOCALES].sort());
      const real = JSON.stringify(locales);
      const perLocOk = OTHER_LOCALES.every((loc) => rows.filter((r) => String(r['locale']) === loc).length === 1);
      const keyOk = rows.every((r) => r['key'] === '-');
      return { expect, real, pass: expect === real && perLocOk && keyOk };
    });

    await this.check('非 in 大区总榜开始时间为北京时间 08-17 14:00:00', async (): Promise<CheckResult> => {
      const rows = await this.otherTotalRows();
      const expected = beijingMs(TOTAL_START_BJ);
      const reals = rows.map((r) => String(r['start_time']));
      return { expect: String(expected), real: reals.join(','), pass: reals.every((s) => int(s) === expected) };
    });

    await this.check('非 in 大区总榜结束时间为北京时间 08-29 23:59:59（或 08-30 00:00:00）', async (): Promise<CheckResult> => {
      const rows = await this.otherTotalRows();
      const exp1 = beijingMs(TOTAL_FINISH_BJ);
      const exp2 = beijingMs(TOTAL_FINISH_BJ_ALT);
      const reals = rows.map((r) => String(r['finish_time']));
      return { expect: `${exp1} 或 ${exp2}`, real: reals.join(','), pass: reals.every((s) => int(s) === exp1 || int(s) === exp2) };
    });

    await this.check('非 in 大区总榜 status=100', async (): Promise<CheckResult> => {
      const rows = await this.otherTotalRows();
      const reals = rows.map((r) => String(r['status']));
      return { expect: '100', real: reals.join(','), pass: reals.every((s) => int(s) === 100) };
    });

    await this.check('in 大区存在全部 6 个分赛段 topic，各 key=\'-\' 1 条', async (): Promise<CheckResult> => {
      const rows = await this.inRoundRows();
      if (rows.length === 0) throw new Error('in 大区 family_in_% 轮次记录为空');
      const topics = rows.map((r) => String(r['topic'])).sort();
      const expect = JSON.stringify([...IN_FAMILY_TOPICS].sort());
      const real = JSON.stringify(topics);
      const perTopicOk = IN_FAMILY_TOPICS.every((t) => rows.filter((r) => String(r['topic']) === t).length === 1);
      const keyOk = rows.every((r) => r['key'] === '-');
      return { expect, real, pass: expect === real && perTopicOk && keyOk };
    });

    await this.check('family_in_n_200 开始时间为北京时间 08-17 14:00:00', async (): Promise<CheckResult> => {
      const rows = await this.inRoundRows();
      const expected = isoMs(N_200_START_ISO);
      const row = rows.find((r) => r['topic'] === 'family_in_n_200');
      if (!row) throw new Error('缺少 family_in_n_200 轮次记录');
      const real = String(row['start_time']);
      return { expect: String(expected), real, pass: int(real) === expected };
    });

    await this.check('其余 in 赛段开始时间为赛段首日 00:00:00+07:00', async (): Promise<CheckResult> => {
      const rows = await this.inRoundRows();
      const reals: string[] = [];
      for (const r of rows) {
        if (String(r['topic']) === 'family_in_n_200') continue;
        const day = IN_ROUND_DAYS[String(r['topic'])][0];
        const expected = localMs(IN_LOCALE, day);
        reals.push(`${r['topic']}=${r['start_time']}(期望${expected})`);
        if (int(r['start_time']) !== expected) {
          return { expect: `首日 ${day} 00:00:00+07:00 的毫秒数`, real: String(r['start_time']), pass: false };
        }
      }
      return { expect: '全部赛段首日 00:00:00+07:00', real: reals.join('; '), pass: true };
    });

    await this.check('family_in_10_1 结束时间为北京时间 08-29 23:59:59', async (): Promise<CheckResult> => {
      const rows = await this.inRoundRows();
      const expected = isoMs(IN_10_1_FINISH_ISO);
      const row = rows.find((r) => r['topic'] === 'family_in_10_1');
      if (!row) throw new Error('缺少 family_in_10_1 轮次记录');
      const real = String(row['finish_time']);
      return { expect: String(expected), real, pass: int(real) === expected };
    });

    await this.check('其余 in 赛段结束时间为赛段末日 23:59:59+07:00', async (): Promise<CheckResult> => {
      const rows = await this.inRoundRows();
      const reals: string[] = [];
      for (const r of rows) {
        if (String(r['topic']) === 'family_in_10_1') continue;
        const day = IN_ROUND_DAYS[String(r['topic'])][1];
        const expected = endOfDayMs(IN_LOCALE, day);
        reals.push(`${r['topic']}=${r['finish_time']}(期望${expected})`);
        if (int(r['finish_time']) !== expected) {
          return { expect: `末日 ${day} 23:59:59+07:00 的毫秒数`, real: String(r['finish_time']), pass: false };
        }
      }
      return { expect: '全部赛段末日 23:59:59+07:00', real: reals.join('; '), pass: true };
    });
  }

  private async otherTotalRows(): Promise<MysqlRow[]> {
    const rows = await this.family.queryRounds('family');
    return rows.filter((r) => OTHER_LOCALES.includes(String(r['locale'])));
  }

  private async inRoundRows(): Promise<MysqlRow[]> {
    return this.family.queryRounds('family_in_%', IN_LOCALE);
  }
}

await new Family001Init().execute();
