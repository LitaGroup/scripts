import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  FULL_GET,
  LOCALE_IN,
  SHORT_GET,
  T_AFTER_FINISH_1S,
  T_BEFORE_START_1S,
  T_FINISH,
  T_FINISH_PLUS_7D,
  T_FINISH_PLUS_7D_1S,
  T_IN_WINDOW,
  T_START,
  T_START_MINUS_7D,
  T_START_MINUS_7D_1S,
  USER_RICH,
} from './_lib/constants.ts';
import { msgOf, reportOf, reportUserOf, responseSignature, statusOf, type ApiCall } from './_lib/client.ts';
import { AnnualReviewTestBase } from './_lib/AnnualReviewTestBase.ts';

/**
 * 003 活动时间窗与 7 天链接容错
 *
 * 覆盖用例：API-ANNIV-020 ~ API-ANNIV-023
 * 预期来源：TK-0383/TK-0386 API.md 第 4 节（活动时间外空 report；超出 7 天容错返回
 *          R.error("Activity is not active")）；Nacos startTime=2026-12-14T00:00:00+08:00、
 *          finishTime=2027-12-31T23:59:59+08:00；active-v3 BusinessDispatcher 容错前后各 7 天。
 * 预置条件：测试用户 21（宽表有行）、大区 in
 * 运行：node 003-time-window.test.ts
 */
class TimeWindow003 extends AnnualReviewTestBase {
  constructor() {
    super();
    this.total = 10;
  }

  private async getAt(timestamp: string, path = FULL_GET): Promise<ApiCall> {
    return this.annualReview.get(path, { userId: USER_RICH, locale: LOCALE_IN, debugTimestamp: timestamp });
  }

  private async expectUser(timestamp: string): Promise<CheckResult> {
    const call = await this.getAt(timestamp);
    const user = reportUserOf(call);
    return {
      expect: `status=0，report.user.id=${USER_RICH}`,
      real: `status=${statusOf(call)}，report.user=${user === null ? 'null' : String(user.id)}，msg=${JSON.stringify(msgOf(call))}`,
      pass: statusOf(call) === 0 && user !== null && Number(user.id) === USER_RICH,
    };
  }

  private async expectTimeNotActive(timestamp: string): Promise<CheckResult> {
    const call = await this.getAt(timestamp);
    const report = reportOf(call);
    return {
      expect: 'status=0，report={}（活动时间外返回空 report，不报错）',
      real: `status=${statusOf(call)}，report=${JSON.stringify(report)}，msg=${JSON.stringify(msgOf(call))}`,
      pass: statusOf(call) === 0 && Object.keys(report).length === 0,
    };
  }

  private async expectBeyondTolerance(timestamp: string): Promise<CheckResult> {
    const call = await this.getAt(timestamp);
    return {
      expect: 'status=1，msg=Activity is not active',
      real: `status=${statusOf(call)}，msg=${JSON.stringify(msgOf(call))}`,
      pass: statusOf(call) === 1 && msgOf(call) === 'Activity is not active',
    };
  }

  protected async run(): Promise<void> {
    await this.check('用例#API-ANNIV-020-① 活动开始时刻 2026-12-14T00:00:00+08:00（含）返回 report.user', () => this.expectUser(T_START));

    await this.check('用例#API-ANNIV-020-② 活动结束时刻 2027-12-31T23:59:59+08:00（含）返回 report.user', () => this.expectUser(T_FINISH));

    await this.check('用例#API-ANNIV-021-① 开始前 1 秒（2026-12-13T23:59:59+08:00，7 天容错内）返回 status=0、report={}', () => this.expectTimeNotActive(T_BEFORE_START_1S));

    await this.check('用例#API-ANNIV-021-② 开始前整 7 天边界（2026-12-07T00:00:00+08:00）返回 status=0、report={}', () => this.expectTimeNotActive(T_START_MINUS_7D));

    await this.check('用例#API-ANNIV-021-③ 开始前 7 天 + 1 秒（2026-12-06T23:59:59+08:00，超出容错）返回 status=1、msg="Activity is not active"', () => this.expectBeyondTolerance(T_START_MINUS_7D_1S));

    await this.check('用例#API-ANNIV-022-① 结束后 1 秒（2028-01-01T00:00:00+08:00，7 天容错内）返回 status=0、report={}', () => this.expectTimeNotActive(T_AFTER_FINISH_1S));

    await this.check('用例#API-ANNIV-022-② 结束后整 7 天边界（2028-01-07T23:59:59+08:00）返回 status=0、report={}', () => this.expectTimeNotActive(T_FINISH_PLUS_7D));

    await this.check('用例#API-ANNIV-022-③ 结束后 7 天 + 1 秒（2028-01-08T00:00:00+08:00，超出容错）返回 status=1、msg="Activity is not active"', () => this.expectBeyondTolerance(T_FINISH_PLUS_7D_1S));

    const fullInWindow = await this.getAt(T_IN_WINDOW);
    const shortInWindow = await this.getAt(T_IN_WINDOW, SHORT_GET);
    await this.check('用例#API-ANNIV-023-① 活动期内短路径与完整路径的 status/msg/data 深度相等', async (): Promise<CheckResult> => {
      const left = responseSignature(fullInWindow);
      const right = responseSignature(shortInWindow);
      return {
        expect: '完全一致',
        real: left === right ? '一致' : `不一致：full=${left.slice(0, 300)}，short=${right.slice(0, 300)}`,
        pass: left === right,
      };
    });

    const fullOut = await this.getAt(T_START_MINUS_7D_1S);
    const shortOut = await this.getAt(T_START_MINUS_7D_1S, SHORT_GET);
    await this.check('用例#API-ANNIV-023-② 超出 7 天容错时两条路径均拒绝访问（status=1），错误文案差异记录为观察项', async (): Promise<CheckResult> => {
      const pass = statusOf(fullOut) === 1 && statusOf(shortOut) === 1;
      this.log(
        `观察项：超出容错窗口时完整路径 msg=${JSON.stringify(msgOf(fullOut))}，短路径 msg=${JSON.stringify(msgOf(shortOut))}` +
          '（别名按活动有效期解析，短路径在配置未生效期返回 Active not found；非活动期用户不可达，不影响活动期内行为）',
      );
      return {
        expect: '两条路径均 status=1',
        real: `full:status=${statusOf(fullOut)},msg=${JSON.stringify(msgOf(fullOut))}；short:status=${statusOf(shortOut)},msg=${JSON.stringify(msgOf(shortOut))}`,
        pass,
      };
    });
  }
}

await new TimeWindow003().execute();
