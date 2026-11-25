import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { localMs } from '../../../../src/base/TimeUtils.ts';
import {
  ALL_TOPICS,
  BIZ,
  IN,
  INIT_DEBUG_TS,
  RUN_DEBUG_TS,
  dailyKeys,
  expectMs,
  initTopic,
  pkKeys,
  queryModuleDetail,
  type TopicSpec,
} from './_lib/pk2612.ts';

const DAY_MS = 24 * 3600 * 1000;

function dayStr(key: string): string {
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}

/**
 * TK-0649 / 2612 年度 PK：17 天赛程与轮次时间用例。
 *
 * 覆盖（对应 TK-0607 TECH_DESIGN 6.1.3 赛程矩阵）：
 * - 陪陪榜印尼：N进200 / 200进100 / 100进46 / 1V1PK50进20 / 复活+4 / 决赛。
 * - 陪陪榜非印尼：N进100 / 100进50 / 1V1PK50进20 / 1V1PK24进10 / 复活+4 / 决赛。
 * - 房间榜、家族榜印尼六阶段；非印尼总榜。
 * - 用户榜、CP 榜 17 个本地日榜 + 总榜。
 * - 1V1 轮次：每天本地 00:00-17:00、18:00-23:00，各阶段 3 天共 6 场。
 */
class Pk2612Schedule extends TestBaseClass {
  constructor() {
    super();
    this.total = 1 + ALL_TOPICS.length;
  }

  protected async run(): Promise<void> {
    await this.act('按 2612 配置初始化全部 32 个榜单元数据（幂等）', async () => {
      const errors: string[] = [];
      for (const spec of ALL_TOPICS) {
        try {
          await initTopic(this.api, spec.topic, INIT_DEBUG_TS);
        } catch (e) {
          errors.push(`${spec.topic}: ${(e as Error).message}`);
        }
      }
      if (errors.length > 0) throw new Error(`初始化失败 ${errors.length} 个：${errors.join('；')}`);
    });

    for (const spec of ALL_TOPICS) {
      await this.check(`${spec.topic} 主轮次与轮次时间（${spec.locales.join('/')}）`, async (): Promise<CheckResult> => {
        return this.checkTopic(spec);
      });
    }
  }

  private async checkTopic(spec: TopicSpec): Promise<CheckResult> {
    const expectedRoundKeys = spec.dailyDays ? dailyKeys(spec.dailyDays) : spec.pkDays ? pkKeys(spec.pkDays) : [];
    const detailSummary: string[] = [];
    for (const locale of spec.locales) {
      const detail = await queryModuleDetail(this.api, spec.topic, locale, RUN_DEBUG_TS);
      if (detail === null) {
        return { expect: `${BIZ}/${spec.topic}/${locale} 有主轮次`, real: 'detail=null', pass: false };
      }
      if (detail.biz !== BIZ || detail.topic !== spec.topic || detail.locale !== locale || detail.key !== '-') {
        return {
          expect: `${BIZ}/${spec.topic}/${locale} key='-'`,
          real: `${detail.biz}/${detail.topic}/${detail.locale} key=${detail.key}`,
          pass: false,
        };
      }
      const expStart = expectMs(spec.start, locale);
      const expFinish = expectMs(spec.finish, locale);
      if (detail.startTime !== expStart || detail.finishTime !== expFinish) {
        return {
          expect: `main start=${expStart}, finish=${expFinish}`,
          real: `main start=${detail.startTime}, finish=${detail.finishTime}`,
          pass: false,
        };
      }

      const rounds = detail.rounds ?? [];
      const actualKeys = rounds.map((r) => String(r.key)).sort();
      if (actualKeys.join(',') !== expectedRoundKeys.join(',')) {
        return {
          expect: `round keys=[${expectedRoundKeys.join(',')}]`,
          real: `round keys=[${actualKeys.join(',')}]`,
          pass: false,
        };
      }

      for (const round of rounds) {
        const key = String(round.key);
        if (spec.dailyDays?.includes(key)) {
          const expS = localMs(locale, key);
          const expF = expS + DAY_MS;
          if (round.startTime !== expS || round.finishTime !== expF) {
            return {
              expect: `${spec.topic}/${locale}/${key} start=${expS}, finish=${expF}`,
              real: `start=${round.startTime}, finish=${round.finishTime}`,
              pass: false,
            };
          }
        } else if (spec.pkDays?.some((d) => key === `${d}00` || key === `${d}18`)) {
          const hh = key.slice(8, 10);
          const expS = localMs(locale, key.slice(0, 8)) + Number(hh) * 3600 * 1000;
          const expF = expS + (hh === '00' ? 17 : 5) * 3600 * 1000;
          if (round.startTime !== expS || round.finishTime !== expF) {
            return {
              expect: `${spec.topic}/${locale}/${key} start=${expS}, finish=${expF}`,
              real: `start=${round.startTime}, finish=${round.finishTime}`,
              pass: false,
            };
          }
        } else {
          return { expect: `无需校验的 key ${key}`, real: `未知轮次 key`, pass: false };
        }
      }
      detailSummary.push(`${locale}:${rounds.length}轮次`);
    }
    return {
      expect: `main=${spec.start.value}~${spec.finish.value}; rounds=${expectedRoundKeys.length}`,
      real: `${detailSummary.join('; ')}; ${spec.start.kind}/${spec.finish.kind}`,
      pass: true,
    };
  }
}

await new Pk2612Schedule().execute();
