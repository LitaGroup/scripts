import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { beijingMs, localMs, endOfDayMs } from '../../../../src/base/TimeUtils.ts';
import type { MysqlRow } from '../../../../src/resources/MySQLTestResource.ts';

const BIZ = 'test-crazy-lamb-v202609';
const DB_ACTIVE = 'lita_active';
const INIT_DEBUG_TS = '2026-09-11T12:30:30';

/** 大区列表 */
const LOCALES = ['in', 'vi', 'ph', 'ko'];

/** 总榜时间：2026-09-18 14:00（UTC+8） - 2026-09-27 23:59:59（大区时间） */
const TOTAL_START_MS = beijingMs('2026-09-18 14:00:00');
const TOTAL_START_STR = '2026-09-18T14:00:00+08:00';
const TOTAL_FINISH_DAY = '20260927';

/** 日榜日期：20260918 ~ 20260927（大区本地时间，0 点 -> 次日 0 点） */
const DAILY_DAYS: string[] = [];
for (let d = 18; d <= 27; d++) DAILY_DAYS.push(`202609${d}`);

const DAILY_TOPICS = ['normal-daily', 'super-daily'];
const TOTAL_TOPICS = ['room', 'receive-gift', 'send-gift'];
const ROOM_TASK_TOPIC = 'room-task';
const ROOM_TASK_KEY = '20260918';
/** room-task 结束时间要求：>= 开始时间 + 10 天 */
const ROOM_TASK_MIN_FINISH_MS = TOTAL_START_MS + 10 * 24 * 3600 * 1000;

function int(v: unknown): number {
  return Number(v);
}

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function fmtMs(ms: number): string {
  return new Date(ms).toISOString();
}

/** 生成 yyyyMMdd 的次日 */
function nextDay(dayStr: string): string {
  const ms = Date.parse(`${dayStr.slice(0, 4)}-${dayStr.slice(4, 6)}-${dayStr.slice(6, 8)}T00:00:00Z`) + 24 * 3600 * 1000;
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
}

class Rank001Init extends TestBaseClass {
  constructor() {
    super();
    this.total = 16;
  }

  protected async run(): Promise<void> {
    await this.act(`数据清理：delete from mod_common_round where biz='${BIZ}'`, async () => {
      await this.cleanRounds();
    });

    await this.act('调用 p/init 接口生成榜单数据', async () => {
      await this.api.request(`active/v3/${BIZ}/p/init`, {
        body: {},
        debugTimestamp: INIT_DEBUG_TS,
      });
    });

    for (const topic of DAILY_TOPICS) {
      await this.check(`${topic} 每个大区 1 条总榜 + 10 条日榜（key='-' + 20260918~20260927）`, async () => this.checkDailyKeys(topic));
      await this.check(`${topic} 总榜时间：开始 ${TOTAL_START_STR}，结束大区时间 2026-09-27 23:59:59`, async () => this.checkTotalTime([topic]));
      await this.check(`${topic} 日榜时间：大区本地 0 点 -> 次日 0 点`, async () => this.checkDailyTime(topic));
      await this.check(`${topic} 全部记录 status=100`, async () => this.checkStatus([topic]));
    }

    await this.check(`room/receive-gift/send-gift 每个大区仅 1 条总榜（key='-'）`, async () => this.checkTotalOnlyKeys());
    await this.check(`room/receive-gift/send-gift 总榜时间：开始 ${TOTAL_START_STR}，结束大区时间 2026-09-27 23:59:59`, async () => this.checkTotalTime(TOTAL_TOPICS));
    await this.check(`room/receive-gift/send-gift 全部记录 status=100`, async () => this.checkStatus(TOTAL_TOPICS));

    await this.check(`room-task 每个大区仅 1 条子榜（key='${ROOM_TASK_KEY}'）`, async () => this.checkRoomTaskKeys());
    await this.check(`room-task 子榜时间：开始 ${TOTAL_START_STR}，结束 >= 开始 + 10 天`, async () => this.checkRoomTaskTime());
    await this.check(`room-task 全部记录 status=100`, async () => this.checkStatus([ROOM_TASK_TOPIC]));
  }

  private async queryRounds(topic?: string): Promise<MysqlRow[]> {
    // 忽略 ar 测试大区
    let sql = `SELECT locale, topic, \`key\`, start_time, finish_time, status FROM mod_common_round WHERE biz=${quoteStr(BIZ)} AND locale != 'ar'`;
    if (topic !== undefined) sql += ` AND topic=${quoteStr(topic)}`;
    sql += ' ORDER BY topic, locale, `key`';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  private async cleanRounds(): Promise<number> {
    return this.mysql.execute(`DELETE FROM mod_common_round WHERE biz=${quoteStr(BIZ)}`, DB_ACTIVE);
  }

  /** 日榜类 topic：每个大区 key 集合 = '-' + 每日 */
  private async checkDailyKeys(topic: string): Promise<CheckResult> {
    const rows = await this.queryRounds(topic);
    if (rows.length === 0) throw new Error(`${topic} 记录为空`);
    const expectKeys = ['-', ...DAILY_DAYS];
    const problems: string[] = [];
    for (const locale of LOCALES) {
      const keys = rows.filter((r) => String(r['locale']) === locale).map((r) => String(r['key'])).sort();
      const expect = JSON.stringify([...expectKeys].sort());
      if (JSON.stringify(keys) !== expect) problems.push(`${locale}=${JSON.stringify(keys)}`);
    }
    const real = problems.length > 0
      ? problems.join('; ')
      : LOCALES.map((l) => `${l}:${expectKeys.length}条`).join(', ');
    return { expect: `每大区 ${JSON.stringify(expectKeys)}`, real, pass: problems.length === 0 };
  }

  /** 仅总榜的 topic：每个大区仅 1 条 key='-' */
  private async checkTotalOnlyKeys(): Promise<CheckResult> {
    const rows = await this.queryRounds();
    const problems: string[] = [];
    for (const topic of TOTAL_TOPICS) {
      const topicRows = rows.filter((r) => String(r['topic']) === topic);
      if (topicRows.length === 0) {
        problems.push(`${topic} 无记录`);
        continue;
      }
      for (const locale of LOCALES) {
        const keys = topicRows.filter((r) => String(r['locale']) === locale).map((r) => String(r['key']));
        if (keys.length !== 1 || keys[0] !== '-') problems.push(`${topic}/${locale}=${JSON.stringify(keys)}`);
      }
      const extraLocales = [...new Set(topicRows.map((r) => String(r['locale'])))].filter((l) => !LOCALES.includes(l));
      if (extraLocales.length > 0) problems.push(`${topic} 多出大区 ${extraLocales.join(',')}`);
    }
    const expect = `${TOTAL_TOPICS.join('/')} 每大区 key='-' 各 1 条`;
    const real = problems.length > 0 ? problems.join('; ') : '每 topic 每大区各 1 条 key=\'-\'';
    return { expect, real, pass: problems.length === 0 };
  }

  /** room-task：每个大区仅 1 条 key='20260918' */
  private async checkRoomTaskKeys(): Promise<CheckResult> {
    const rows = await this.queryRounds(ROOM_TASK_TOPIC);
    if (rows.length === 0) throw new Error(`${ROOM_TASK_TOPIC} 记录为空`);
    const problems: string[] = [];
    for (const locale of LOCALES) {
      const keys = rows.filter((r) => String(r['locale']) === locale).map((r) => String(r['key']));
      if (keys.length !== 1 || keys[0] !== ROOM_TASK_KEY) problems.push(`${locale}=${JSON.stringify(keys)}`);
    }
    const real = problems.length > 0 ? problems.join('; ') : `每大区 1 条 key='${ROOM_TASK_KEY}'`;
    return { expect: `每大区 key='${ROOM_TASK_KEY}' 各 1 条`, real, pass: problems.length === 0 };
  }

  /** 总榜（key='-'）时间检查：开始 9-18 14:00（UTC+8），结束大区时间 9-27 23:59:59 */
  private async checkTotalTime(topics: string[]): Promise<CheckResult> {
    const problems: string[] = [];
    for (const topic of topics) {
      const rows = (await this.queryRounds(topic)).filter((r) => r['key'] === '-');
      for (const locale of LOCALES) {
        const row = rows.find((r) => String(r['locale']) === locale);
        if (!row) {
          problems.push(`${topic}/${locale} 缺记录`);
          continue;
        }
        const expStart = TOTAL_START_MS;
        const expFinish = endOfDayMs(locale, TOTAL_FINISH_DAY);
        if (int(row['start_time']) !== expStart) {
          problems.push(`${topic}/${locale} start=${fmtMs(int(row['start_time']))}(期望${fmtMs(expStart)})`);
        }
        if (int(row['finish_time']) !== expFinish) {
          problems.push(`${topic}/${locale} finish=${fmtMs(int(row['finish_time']))}(期望${fmtMs(expFinish)})`);
        }
      }
    }
    const expect = `start=${fmtMs(TOTAL_START_MS)}, finish=各大区 2026-09-27 23:59:59（本地）`;
    const real = problems.length > 0 ? problems.join('; ') : '全部符合预期';
    return { expect, real, pass: problems.length === 0 };
  }

  /** room-task 子榜时间检查：开始 9-18 14:00（UTC+8），结束 >= 开始 + 10 天 */
  private async checkRoomTaskTime(): Promise<CheckResult> {
    const rows = await this.queryRounds(ROOM_TASK_TOPIC);
    if (rows.length === 0) throw new Error(`${ROOM_TASK_TOPIC} 记录为空`);
    const problems: string[] = [];
    for (const locale of LOCALES) {
      const row = rows.find((r) => String(r['locale']) === locale);
      if (!row) {
        problems.push(`${locale} 缺记录`);
        continue;
      }
      if (int(row['start_time']) !== TOTAL_START_MS) {
        problems.push(`${locale} start=${fmtMs(int(row['start_time']))}(期望${fmtMs(TOTAL_START_MS)})`);
      }
      if (int(row['finish_time']) < ROOM_TASK_MIN_FINISH_MS) {
        problems.push(`${locale} finish=${fmtMs(int(row['finish_time']))}(期望>=${fmtMs(ROOM_TASK_MIN_FINISH_MS)})`);
      }
    }
    const expect = `start=${fmtMs(TOTAL_START_MS)}, finish>=${fmtMs(ROOM_TASK_MIN_FINISH_MS)}`;
    const real = problems.length > 0 ? problems.join('; ') : '全部符合预期';
    return { expect, real, pass: problems.length === 0 };
  }

  /** 日榜时间：key 对应大区本地日期 00:00:00 -> 次日 00:00:00 */
  private async checkDailyTime(topic: string): Promise<CheckResult> {
    const rows = (await this.queryRounds(topic)).filter((r) => r['key'] !== '-');
    if (rows.length === 0) throw new Error(`${topic} 日榜记录为空`);
    const problems: string[] = [];
    for (const r of rows) {
      const locale = String(r['locale']);
      const key = String(r['key']);
      const expStart = localMs(locale, key);
      const expFinish = localMs(locale, nextDay(key));
      if (int(r['start_time']) !== expStart || int(r['finish_time']) !== expFinish) {
        problems.push(`${locale}/${key}=${fmtMs(int(r['start_time']))}~${fmtMs(int(r['finish_time']))}(期望${fmtMs(expStart)}~${fmtMs(expFinish)})`);
      }
    }
    const expect = '每个日榜 = 大区本地当日 00:00:00 -> 次日 00:00:00';
    const real = problems.length > 0 ? problems.slice(0, 5).join('; ') + (problems.length > 5 ? ` 等${problems.length}条` : '') : '全部符合预期';
    return { expect, real, pass: problems.length === 0 };
  }

  /** 状态检查：全部 status=100 */
  private async checkStatus(topics: string[]): Promise<CheckResult> {
    const rows = await this.queryRounds();
    const target = rows.filter((r) => topics.includes(String(r['topic'])));
    if (target.length === 0) throw new Error(`${topics.join('/')} 记录为空`);
    const bad = target.filter((r) => int(r['status']) !== 100);
    const real = bad.length > 0
      ? bad.slice(0, 5).map((r) => `${r['topic']}/${r['locale']}/${r['key']}=${r['status']}`).join('; ') + (bad.length > 5 ? ` 等${bad.length}条` : '')
      : `全部 ${target.length} 条 status=100`;
    return { expect: '100', real, pass: bad.length === 0 };
  }
}

await new Rank001Init().execute();
