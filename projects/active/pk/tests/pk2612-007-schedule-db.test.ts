import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { localMs } from '../../../../src/base/TimeUtils.ts';
import {
  ALL_TOPICS,
  BIZ,
  IN,
  INIT_DEBUG_TS,
  dailyKeys,
  expectMs,
  initTopic,
  pkKeys,
  queryActiveSql,
  type TopicSpec,
} from './_lib/pk2612.ts';

const DAY_MS = 24 * 3600 * 1000;

/**
 * TK-0649 / 2612 年度 PK：17 天赛程轮次（只读 SQL 辅助验证）。
 *
 * 与 pk2612-002-schedule 的区别：
 * - 002 走接口 m/{topic}/detail，验证对外接口可用性；
 * - 007 走测试环境只读 SQL mod_common_round，验证配置落库的轮次时间，避免
 *   多语言 Sheet 缺失等接口侧问题干扰赛程配置本身的判定。
 */
class Pk2612ScheduleDb extends TestBaseClass {
  constructor() {
    super();
    this.total = 1 + ALL_TOPICS.length;
  }

  protected async run(): Promise<void> {
    await this.act('初始化全部 32 个榜单元数据（幂等）', async () => {
      for (const spec of ALL_TOPICS) {
        await initTopic(this.api, spec.topic, INIT_DEBUG_TS);
      }
    });

    for (const spec of ALL_TOPICS) {
      await this.check(`${spec.topic} 轮次落库时间（${spec.locales.join('/')}）`, async (): Promise<CheckResult> => {
        return this.checkTopic(spec);
      });
    }
  }

  private async checkTopic(spec: TopicSpec): Promise<CheckResult> {
    const expectedRoundKeys = spec.dailyDays ? dailyKeys(spec.dailyDays) : spec.pkDays ? pkKeys(spec.pkDays) : [];
    const summary: string[] = [];
    for (const locale of spec.locales) {
      const rows = await queryActiveSql(
        `SELECT \`key\`, start_time, finish_time FROM mod_common_round` +
        ` WHERE biz='${BIZ}' AND topic='${spec.topic}' AND locale='${locale}' ORDER BY \`key\``,
      );
      const main = rows.find((r) => String(r[0]) === '-');
      if (!main) {
        return { expect: `${spec.topic}/${locale} 主轮次存在`, real: '缺少 key=-', pass: false };
      }
      const expStart = expectMs(spec.start, locale);
      const expFinish = expectMs(spec.finish, locale);
      if (Number(main[1]) !== expStart || Number(main[2]) !== expFinish) {
        return {
          expect: `main start=${expStart}, finish=${expFinish}`,
          real: `main start=${Number(main[1])}, finish=${Number(main[2])}`,
          pass: false,
        };
      }

      const roundRows = rows.filter((r) => String(r[0]) !== '-');
      const actualKeys = roundRows.map((r) => String(r[0])).sort();
      if (actualKeys.join(',') !== expectedRoundKeys.join(',')) {
        return {
          expect: `round keys=[${expectedRoundKeys.join(',')}]`,
          real: `round keys=[${actualKeys.join(',')}]`,
          pass: false,
        };
      }
      for (const row of roundRows) {
        const key = String(row[0]);
        const start = Number(row[1]);
        const finish = Number(row[2]);
        if (spec.dailyDays?.includes(key)) {
          const expS = localMs(locale, key);
          if (start !== expS || finish !== expS + DAY_MS) {
            return {
              expect: `${key} start=${expS}, finish=${expS + DAY_MS}`,
              real: `start=${start}, finish=${finish}`,
              pass: false,
            };
          }
        } else {
          const hh = key.slice(8, 10);
          const expS = localMs(locale, key.slice(0, 8)) + Number(hh) * 3600 * 1000;
          const expF = expS + (hh === '00' ? 17 : 5) * 3600 * 1000;
          if (start !== expS || finish !== expF) {
            return {
              expect: `${key} start=${expS}, finish=${expF}`,
              real: `start=${start}, finish=${finish}`,
              pass: false,
            };
          }
        }
      }
      summary.push(`${locale}:${roundRows.length}轮次`);
    }
    return {
      expect: `main=${spec.start.value}~${spec.finish.value}; rounds=${expectedRoundKeys.length}`,
      real: summary.join('; '),
      pass: true,
    };
  }
}

await new Pk2612ScheduleDb().execute();
