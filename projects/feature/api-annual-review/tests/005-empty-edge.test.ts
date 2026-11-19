import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  FULL_GET,
  LOCALE_IN,
  SHORT_GET,
  T_IN_WINDOW,
  USER_NO_ROW,
  USER_RICH,
} from './_lib/constants.ts';
import {
  playerOf,
  reportOf,
  reportUserOf,
  responseSignature,
  statusOf,
  type ApiCall,
} from './_lib/client.ts';
import { AnnualReviewTestBase } from './_lib/AnnualReviewTestBase.ts';

/**
 * 005 空数据与边界行为
 *
 * 覆盖用例：API-ANNIV-040 ~ API-ANNIV-044
 * 预期来源：TK-0383/TK-0386 API.md 第 1.1、4 节（无宽表行 → data.report={}、status=0；
 *          请求体 {} 忽略未知字段；只读幂等）
 * 预置条件：活动期内（2026-12-14 12:00 +08:00）、大区 in
 * 运行：node 005-empty-edge.test.ts
 */
class EmptyEdge005 extends AnnualReviewTestBase {
  constructor() {
    super();
    this.total = 6;
  }

  protected async run(): Promise<void> {
    const noRow = await this.annualReview.get(FULL_GET, {
      userId: USER_NO_ROW,
      locale: LOCALE_IN,
      debugTimestamp: T_IN_WINDOW,
    });

    await this.check(`用例#API-ANNIV-040-① 宽表无行用户 ${USER_NO_ROW} 返回 status=0、report={}，player 为对象（不报错）`, async (): Promise<CheckResult> => {
      const report = reportOf(noRow);
      const player = playerOf(noRow);
      return {
        expect: 'status=0，report={}，player 为对象',
        real: `status=${statusOf(noRow)}，report=${JSON.stringify(report)}，player=${player === null ? 'null' : JSON.stringify(Object.keys(player))}`,
        pass: statusOf(noRow) === 0 && Object.keys(report).length === 0 && player !== null,
      };
    });

    const noRowShort = await this.annualReview.get(SHORT_GET, {
      userId: USER_NO_ROW,
      locale: LOCALE_IN,
      debugTimestamp: T_IN_WINDOW,
    });
    await this.check('用例#API-ANNIV-040-② 宽表无行时短路径与完整路径响应一致', async (): Promise<CheckResult> => {
      const left = responseSignature(noRow);
      const right = responseSignature(noRowShort);
      return {
        expect: '完全一致',
        real: left === right ? '一致' : `不一致：full=${left.slice(0, 300)}，short=${right.slice(0, 300)}`,
        pass: left === right,
      };
    });

    const withoutBody = await this.annualReview.call(FULL_GET, {
      userId: USER_RICH,
      locale: LOCALE_IN,
      debugTimestamp: T_IN_WINDOW,
    });
    await this.check('用例#API-ANNIV-041-① 不传请求体（无 body）仍返回 status=0 且 report.user 非空', async (): Promise<CheckResult> => {
      const user = reportUserOf(withoutBody);
      return {
        expect: `status=0，report.user.id=${USER_RICH}`,
        real: `status=${statusOf(withoutBody)}，report.user=${user === null ? 'null' : String(user.id)}`,
        pass: statusOf(withoutBody) === 0 && user !== null && Number(user.id) === USER_RICH,
      };
    });

    const withEmptyObject = await this.annualReview.get(FULL_GET, {
      userId: USER_RICH,
      locale: LOCALE_IN,
      debugTimestamp: T_IN_WINDOW,
      body: {},
    });
    const withUnknownFields = await this.annualReview.get(FULL_GET, {
      userId: USER_RICH,
      locale: LOCALE_IN,
      debugTimestamp: T_IN_WINDOW,
      body: { foo: 'bar', nested: { a: 1, b: [1, 2, 3] }, userId: USER_RICH },
    });
    await this.check('用例#API-ANNIV-041-② 请求体含未知字段时被忽略，响应与空对象请求完全一致', async (): Promise<CheckResult> => {
      const left = responseSignature(withEmptyObject);
      const right = responseSignature(withUnknownFields);
      return {
        expect: '完全一致',
        real: left === right ? '一致' : `不一致：empty=${left.slice(0, 300)}，unknown=${right.slice(0, 300)}`,
        pass: left === right,
      };
    });

    await this.check('用例#API-ANNIV-043-① 连续 3 次调用同一用户，三次 status/msg/data 完全一致（只读幂等）', async (): Promise<CheckResult> => {
      const calls: ApiCall[] = [];
      for (let i = 0; i < 3; i++) {
        calls.push(
          await this.annualReview.get(FULL_GET, { userId: USER_RICH, locale: LOCALE_IN, debugTimestamp: T_IN_WINDOW }),
        );
      }
      const signatures = calls.map((call) => responseSignature(call));
      const unique = new Set(signatures);
      return {
        expect: '三次完全一致',
        real: unique.size === 1 ? '一致' : `出现 ${unique.size} 种响应`,
        pass: unique.size === 1,
      };
    });

    const richAfterNoRow = await this.annualReview.get(FULL_GET, {
      userId: USER_RICH,
      locale: LOCALE_IN,
      debugTimestamp: T_IN_WINDOW,
    });
    await this.check('用例#API-ANNIV-044-① 无数据用户请求后再次查询有数据用户，返回不受影响', async (): Promise<CheckResult> => {
      const user = reportUserOf(richAfterNoRow);
      return {
        expect: `report.user.id=${USER_RICH}`,
        real: `report.user=${user === null ? 'null' : String(user.id)}`,
        pass: user !== null && Number(user.id) === USER_RICH,
      };
    });
  }
}

await new EmptyEdge005().execute();
