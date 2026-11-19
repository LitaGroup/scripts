import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  ACTIVITY_FINISH_MS,
  ACTIVITY_START_MS,
  ANNIVERSARY_V202608_BIZ,
  ANNIVERSARY_V202608_CONFIG,
  ANNIVERSARY_V202608_GET,
  ENABLED_LOCALES,
  FULL_CONFIG,
  FULL_GET,
  LOCALE_IN,
  PK_V202608_CONFIG,
  SHORT_CONFIG,
  T_ANNIVERSARY_IN_WINDOW,
  T_IN_WINDOW,
  USER_OFFICIAL,
  USER_RICH,
} from './_lib/constants.ts';
import { dataOf, reportUserOf, statusOf, msgOf, type ApiCall } from './_lib/client.ts';
import { AnnualReviewTestBase } from './_lib/AnnualReviewTestBase.ts';

function configData(call: ApiCall): Record<string, unknown> {
  return dataOf(call);
}

function localeSetOf(call: ApiCall): string[] {
  const locales = configData(call).enableLocales;
  return Array.isArray(locales) ? locales.map((item) => String(item)).sort() : [];
}

/**
 * 004 活动配置接口与既有活动回归
 *
 * 覆盖用例：API-ANNIV-030 ~ API-ANNIV-034
 * 预期来源：TK-0383/TK-0386 API.md 第 1.2、7 节；Nacos annual-review-v202612.yaml；
 *          回归基线 anniversary-v202608 / pk-v202608 既有配置。
 * 运行：node 004-config-regression.test.ts
 */
class ConfigRegression004 extends AnnualReviewTestBase {
  constructor() {
    super();
    this.total = 9;
  }

  protected async run(): Promise<void> {
    const fullConfig = await this.annualReview.config(FULL_CONFIG, { locale: LOCALE_IN });
    await this.check('用例#API-ANNIV-030-① 完整 biz 配置接口 /annual-review-v202612/config 返回 status=0 且 biz=annual-review-v202612', async (): Promise<CheckResult> => {
      return {
        expect: `status=0，biz=${'annual-review-v202612'}`,
        real: `status=${statusOf(fullConfig)}，biz=${JSON.stringify(String(configData(fullConfig).biz))}`,
        pass: statusOf(fullConfig) === 0 && configData(fullConfig).biz === 'annual-review-v202612',
      };
    });

    await this.check('用例#API-ANNIV-030-② 配置开始/结束时间等于 Nacos 配置（2026-12-14T00:00:00+08:00 / 2027-12-31T23:59:59+08:00）', async (): Promise<CheckResult> => {
      const start = Number(configData(fullConfig).startTime);
      const finish = Number(configData(fullConfig).finishTime);
      return {
        expect: `${ACTIVITY_START_MS}/${ACTIVITY_FINISH_MS}`,
        real: `${start}/${finish}`,
        pass: start === ACTIVITY_START_MS && finish === ACTIVITY_FINISH_MS,
      };
    });

    await this.check('用例#API-ANNIV-030-③ 配置 enableLocales 集合为 in/vi/th/ko/zh/ph 六个大区', async (): Promise<CheckResult> => {
      const expected = [...ENABLED_LOCALES].sort();
      const real = localeSetOf(fullConfig);
      return {
        expect: JSON.stringify(expected),
        real: JSON.stringify(real),
        pass: JSON.stringify(real) === JSON.stringify(expected),
      };
    });

    const shortConfig = await this.annualReview.config(SHORT_CONFIG, { locale: LOCALE_IN, debugTimestamp: T_IN_WINDOW });
    await this.check('用例#API-ANNIV-031-① 活动期内短路径 /annual-review/config 返回 status=0，startTime/finishTime/enableLocales 与完整路径一致', async (): Promise<CheckResult> => {
      const full = configData(fullConfig);
      const short = configData(shortConfig);
      const sameTime = Number(short.startTime) === Number(full.startTime) && Number(short.finishTime) === Number(full.finishTime);
      const sameLocales = JSON.stringify(localeSetOf(shortConfig)) === JSON.stringify(localeSetOf(fullConfig));
      this.log(`观察项：短路径 config 的 biz 字段为 ${JSON.stringify(String(short.biz))}（路径别名），完整路径为 ${JSON.stringify(String(full.biz))}；时间与大区一致`);
      return {
        expect: 'status=0，时间与大区一致',
        real: `status=${statusOf(shortConfig)}，startTime=${String(short.startTime)}，finishTime=${String(short.finishTime)}，locales=${JSON.stringify(localeSetOf(shortConfig))}，biz=${JSON.stringify(String(short.biz))}`,
        pass: statusOf(shortConfig) === 0 && sameTime && sameLocales,
      };
    });

    // ---------- 既有活动回归 ----------
    const anniversaryConfig = await this.annualReview.config(ANNIVERSARY_V202608_CONFIG, { locale: LOCALE_IN });
    await this.check('用例#API-ANNIV-032-① 回归：六周年 anniversary-v202608/config 返回 status=0 且 biz=anniversary-v202608', async (): Promise<CheckResult> => {
      return {
        expect: `status=0，biz=${ANNIVERSARY_V202608_BIZ}`,
        real: `status=${statusOf(anniversaryConfig)}，biz=${JSON.stringify(String(configData(anniversaryConfig).biz))}`,
        pass: statusOf(anniversaryConfig) === 0 && configData(anniversaryConfig).biz === ANNIVERSARY_V202608_BIZ,
      };
    });

    const anniversaryGet = await this.annualReview.get(ANNIVERSARY_V202608_GET, {
      userId: USER_OFFICIAL,
      locale: LOCALE_IN,
      debugTimestamp: T_ANNIVERSARY_IN_WINDOW,
    });
    await this.check('用例#API-ANNIV-032-② 回归：六周年 anniversary-v202608/get 在活动期内仍返回 status=0 且 report.user 非空', async (): Promise<CheckResult> => {
      const user = reportUserOf(anniversaryGet);
      return {
        expect: 'status=0，report.user 非空',
        real: `status=${statusOf(anniversaryGet)}，report.user=${user === null ? 'null' : `user_id=${String(user.user_id)}`}`,
        pass: statusOf(anniversaryGet) === 0 && user !== null,
      };
    });

    const pkConfig = await this.annualReview.config(PK_V202608_CONFIG, { locale: LOCALE_IN });
    await this.check('用例#API-ANNIV-033-① 回归：pk-v202608/config 返回 status=0 且 biz=pk-v202608', async (): Promise<CheckResult> => {
      return {
        expect: 'status=0，biz=pk-v202608',
        real: `status=${statusOf(pkConfig)}，biz=${JSON.stringify(String(configData(pkConfig).biz))}`,
        pass: statusOf(pkConfig) === 0 && configData(pkConfig).biz === 'pk-v202608',
      };
    });

    // ---------- 路径与方法 ----------
    const unknownPath = await this.annualReview.call('/active/v3/annual-review-v202612/not-exist', {
      userId: USER_RICH,
      locale: LOCALE_IN,
      debugTimestamp: T_IN_WINDOW,
      body: {},
    });
    await this.check('用例#API-ANNIV-034-① 未知子路径返回 status=1、msg="Method not found"', async (): Promise<CheckResult> => {
      return {
        expect: 'status=1，msg=Method not found',
        real: `status=${statusOf(unknownPath)}，msg=${JSON.stringify(msgOf(unknownPath))}`,
        pass: statusOf(unknownPath) === 1 && msgOf(unknownPath) === 'Method not found',
      };
    });

    const getMethod = await this.annualReview.call(FULL_GET, {
      method: 'GET',
      userId: USER_RICH,
      locale: LOCALE_IN,
      debugTimestamp: T_IN_WINDOW,
    });
    await this.check('用例#API-ANNIV-034-② 接口只接受 POST：GET /annual-review-v202612/get 返回非 200（实际 HTTP 500，框架默认处理，记录为观察项）', async (): Promise<CheckResult> => {
      return {
        expect: 'HTTP 状态非 200',
        real: `HTTP ${getMethod.httpStatus}，响应=${JSON.stringify(getMethod.body).slice(0, 200)}`,
        pass: getMethod.httpStatus !== 200,
      };
    });
  }
}

await new ConfigRegression004().execute();
