import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { beijingMs, isoMs, localMs, localAtMs } from '../../../../src/base/TimeUtils.ts';
import type { MysqlRow } from '../../../../src/resources/MySQLTestResource.ts';
import { IN_LOCALE, OTHER_LOCALES } from './_lib/constants.ts';

const INIT_DEBUG_TS = '2026-08-16T22:40:20+08:00';

const STAGE1_START_BJ = '2026-08-17 14:00:00';
const STAGE1_FINISH_LOCAL = '2026-08-19 23:30:00';
const STAGE2_START_LOCAL = '2026-08-20 00:00:00';
const STAGE2_FINISH_LOCAL = '2026-08-22 23:30:00';
const STAGE3_START_LOCAL = '2026-08-23 00:00:00';
const STAGE3_FINISH_LOCAL = '2026-08-25 23:30:00';
const STAGE4_START_LOCAL = '2026-08-26 00:00:00';
const STAGE4_FINISH_LOCAL = '2026-08-28 23:30:00';
const REVIVAL_START_LOCAL = '2026-08-26 00:00:00';
const REVIVAL_FINISH_LOCAL = '2026-08-26 23:30:00';
const FINAL_START_LOCAL = '2026-08-29 00:00:00';
const FINAL_FINISH_BJ = '2026-08-29T23:59:59+08:00';

const STAGE1_DAYS = ['20260817', '20260818', '20260819'];
const STAGE2_DAYS = ['20260820', '20260821', '20260822'];
const STAGE3_DAYS = ['20260823', '20260824', '20260825'];
const STAGE4_DAYS = ['20260826', '20260827', '20260828'];

const DAY_MS = 24 * 3600 * 1000;

function int(v: unknown): number {
  return Number(v);
}

function dayStr(day: string): string {
  return `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
}

function keysOf(days: string[]): string[] {
  const keys: string[] = [];
  for (const day of days) keys.push(`${day}00`, `${day}18`);
  return keys;
}

class Player001Init extends TestBaseClass {
  constructor() {
    super();
    this.total = 22;
  }

  protected async run(): Promise<void> {
    await this.act('清理 mod_common_round 中陪玩榜历史数据', async () => {
      await this.player.cleanPlayerRounds();
    });

    await this.check('清理后 mod_common_round 中 player 轮次数为 0', async (): Promise<CheckResult> => {
      const n = await this.player.countPlayerRounds();
      return { expect: '0', real: String(n), pass: n === 0 };
    });

    await this.act('调用 __cron 初始化陪玩榜数据', async () => {
      await this.player.runInitCron(INIT_DEBUG_TS);
    });

    // 第 1 阶段检查（n->100）
    await this.checkTotals(
      '阶段1(n->100) 非in总榜 player_n_100',
      [{ topic: 'player_n_100', locales: OTHER_LOCALES }],
      () => beijingMs(STAGE1_START_BJ),
      (loc) => localAtMs(loc, STAGE1_FINISH_LOCAL),
    );
    await this.checkTotals(
      '阶段1(n->100) in总榜 player_in_n_200',
      [{ topic: 'player_in_n_200', locales: [IN_LOCALE] }],
      () => beijingMs(STAGE1_START_BJ),
      (loc) => localAtMs(loc, STAGE1_FINISH_LOCAL),
    );
    await this.checkDaily('阶段1(n->100) 非in日榜 player_n_100 3条(0点开始/结束)', 'player_n_100', OTHER_LOCALES, STAGE1_DAYS);
    await this.checkDaily('阶段1(n->100) in日榜 player_in_n_200 3条(0点开始/结束)', 'player_in_n_200', [IN_LOCALE], STAGE1_DAYS);

    // 第 2 阶段检查（100->50）
    await this.checkTotals(
      '阶段2(100->50) 非in总榜 player_100_50',
      [{ topic: 'player_100_50', locales: OTHER_LOCALES }],
      (loc) => localAtMs(loc, STAGE2_START_LOCAL),
      (loc) => localAtMs(loc, STAGE2_FINISH_LOCAL),
    );
    await this.checkTotals(
      '阶段2(100->50) in总榜 player_in_200_100',
      [{ topic: 'player_in_200_100', locales: [IN_LOCALE] }],
      (loc) => localAtMs(loc, STAGE2_START_LOCAL),
      (loc) => localAtMs(loc, STAGE2_FINISH_LOCAL),
    );
    await this.checkDaily('阶段2(100->50) 非in日榜 player_100_50 3条(0点开始/结束)', 'player_100_50', OTHER_LOCALES, STAGE2_DAYS);
    await this.checkDaily('阶段2(100->50) in日榜 player_in_200_100 3条(0点开始/结束)', 'player_in_200_100', [IN_LOCALE], STAGE2_DAYS);

    // 第 3 阶段检查（50->20）
    await this.checkTotals(
      '阶段3(50->20) 非in总榜 player_50_20/player_1v1_50_20',
      [
        { topic: 'player_50_20', locales: OTHER_LOCALES },
        { topic: 'player_1v1_50_20', locales: OTHER_LOCALES },
      ],
      (loc) => localAtMs(loc, STAGE3_START_LOCAL),
      (loc) => localAtMs(loc, STAGE3_FINISH_LOCAL),
    );
    await this.checkTotals(
      '阶段3(50->20) in总榜 player_in_100_46/player_in_1v1_100_46',
      [
        { topic: 'player_in_100_46', locales: [IN_LOCALE] },
        { topic: 'player_in_1v1_100_46', locales: [IN_LOCALE] },
      ],
      (loc) => localAtMs(loc, STAGE3_START_LOCAL),
      (loc) => localAtMs(loc, STAGE3_FINISH_LOCAL),
    );
    await this.checkPk('阶段3(50->20) 非in PK轮次 player_1v1_50_20', 'player_1v1_50_20', OTHER_LOCALES, STAGE3_DAYS);
    await this.checkPk('阶段3(50->20) in PK轮次 player_in_1v1_100_46', 'player_in_1v1_100_46', [IN_LOCALE], STAGE3_DAYS);

    // 第 4 阶段检查（24->10）
    await this.checkTotals(
      '阶段4(24->10) 非in总榜 player_24_10/player_1v1_24_10',
      [
        { topic: 'player_24_10', locales: OTHER_LOCALES },
        { topic: 'player_1v1_24_10', locales: OTHER_LOCALES },
      ],
      (loc) => localAtMs(loc, STAGE4_START_LOCAL),
      (loc) => localAtMs(loc, STAGE4_FINISH_LOCAL),
    );
    await this.checkTotals(
      '阶段4(24->10) in总榜 player_in_50_20/player_in_1v1_50_20',
      [
        { topic: 'player_in_50_20', locales: [IN_LOCALE] },
        { topic: 'player_in_1v1_50_20', locales: [IN_LOCALE] },
      ],
      (loc) => localAtMs(loc, STAGE4_START_LOCAL),
      (loc) => localAtMs(loc, STAGE4_FINISH_LOCAL),
    );
    await this.checkPk('阶段4(24->10) 非in PK轮次 player_1v1_24_10', 'player_1v1_24_10', OTHER_LOCALES, STAGE4_DAYS);
    await this.checkPk('阶段4(24->10) in PK轮次 player_in_1v1_50_20', 'player_in_1v1_50_20', [IN_LOCALE], STAGE4_DAYS);
    await this.checkTotals(
      '阶段4 复活赛 player_n_4/player_in_n_4',
      [
        { topic: 'player_n_4', locales: OTHER_LOCALES },
        { topic: 'player_in_n_4', locales: [IN_LOCALE] },
      ],
      (loc) => localAtMs(loc, REVIVAL_START_LOCAL),
      (loc) => localAtMs(loc, REVIVAL_FINISH_LOCAL),
    );

    // 第 5 阶段检查（决赛）
    await this.checkTotals(
      '阶段5(决赛) 非in总榜 player_10_1',
      [{ topic: 'player_10_1', locales: OTHER_LOCALES }],
      (loc) => localAtMs(loc, FINAL_START_LOCAL),
      () => isoMs(FINAL_FINISH_BJ),
    );
    await this.checkTotals(
      '阶段5(决赛) in总榜 player_in_20_1',
      [{ topic: 'player_in_20_1', locales: [IN_LOCALE] }],
      (loc) => localAtMs(loc, FINAL_START_LOCAL),
      () => isoMs(FINAL_FINISH_BJ),
    );
  }

  private async totalRows(topic: string, locale: string): Promise<MysqlRow[]> {
    const rows = await this.player.queryRounds(topic, locale);
    return rows.filter((r) => r['key'] === '-');
  }

  private async nonTotalRows(topic: string, locale: string): Promise<MysqlRow[]> {
    const rows = await this.player.queryRounds(topic, locale);
    return rows.filter((r) => r['key'] !== '-');
  }

  private async checkTotals(
    title: string,
    groups: { topic: string; locales: string[] }[],
    startOf: (loc: string) => number,
    finishOf: (loc: string) => number,
  ): Promise<void> {
    await this.check(title, async (): Promise<CheckResult> => {
      const detail: string[] = [];
      for (const { topic, locales } of groups) {
        for (const loc of locales) {
          const rows = await this.totalRows(topic, loc);
          if (rows.length !== 1) {
            return { expect: `${topic}/${loc} 总榜 1 条(key='-')`, real: `共 ${rows.length} 条`, pass: false };
          }
          const row = rows[0];
          const expS = startOf(loc);
          const expF = finishOf(loc);
          const s = int(row['start_time']);
          const f = int(row['finish_time']);
          detail.push(`${topic}/${loc}(start=${s},finish=${f})`);
          if (s !== expS || f !== expF) {
            return { expect: `start=${expS}, finish=${expF}`, real: `start=${s}, finish=${f}`, pass: false };
          }
        }
      }
      return { expect: '全部 topic 各 locale 总榜 key=\'-\' 且时间正确', real: detail.join('; '), pass: true };
    });
  }

  private async checkDaily(title: string, topic: string, locales: string[], days: string[]): Promise<void> {
    await this.check(title, async (): Promise<CheckResult> => {
      const detail: string[] = [];
      for (const loc of locales) {
        const rows = await this.nonTotalRows(topic, loc);
        if (rows.length !== days.length) {
          return { expect: `${loc} 日榜 ${days.length} 条`, real: `共 ${rows.length} 条`, pass: false };
        }
        for (const row of rows) {
          const s = int(row['start_time']);
          const f = int(row['finish_time']);
          const day = days.find((d) => localMs(loc, d) === s);
          if (day === undefined) {
            return { expect: `start 为 ${days.map((d) => `${d}00:00`).join('/')} 本地0点`, real: `key=${row['key']} start=${s}`, pass: false };
          }
          const expF = localMs(loc, day) + DAY_MS;
          detail.push(`${loc}/${row['key']}(start=${s},finish=${f})`);
          if (f !== expF) {
            return { expect: `finish=次日0点(${expF})`, real: `key=${row['key']} finish=${f}`, pass: false };
          }
        }
      }
      return { expect: '全部 locale 日榜均 0点开始/次日0点结束', real: detail.join('; '), pass: true };
    });
  }

  private async checkPk(title: string, topic: string, locales: string[], days: string[]): Promise<void> {
    await this.check(title, async (): Promise<CheckResult> => {
      const expected = keysOf(days).sort();
      const detail: string[] = [];
      for (const loc of locales) {
        const rows = await this.player.queryRounds(topic, loc);
        const pkRows = rows.filter((r) => r['key'] !== '-');
        if (pkRows.length !== expected.length) {
          return { expect: `${loc} key 不等于 '-' 共 ${expected.length} 条`, real: `共 ${pkRows.length} 条`, pass: false };
        }
        const keys = pkRows.map((r) => String(r['key'])).sort();
        if (keys.join(',') !== expected.join(',')) {
          return { expect: `key=[${expected.join(',')}]`, real: `key=[${keys.join(',')}]`, pass: false };
        }
        for (const row of pkRows) {
          const key = String(row['key']);
          const hh = key.slice(8, 10);
          const expS = localAtMs(loc, `${dayStr(key.slice(0, 8))} ${hh}:00:00`);
          const expF = localAtMs(loc, `${dayStr(key.slice(0, 8))} ${hh === '00' ? '17' : '23'}:00:00`);
          const s = int(row['start_time']);
          const f = int(row['finish_time']);
          detail.push(`${loc}/${key}(start=${s},finish=${f})`);
          if (s !== expS || f !== expF) {
            return { expect: `key=${key} start=${expS}, finish=${expF}`, real: `start=${s}, finish=${f}`, pass: false };
          }
        }
      }
      return { expect: '全部 locale PK 轮次周期时间正确', real: detail.join('; '), pass: true };
    });
  }
}

await new Player001Init().execute();
