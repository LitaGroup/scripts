import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  ENABLED_LOCALES,
  FULL_GET,
  LOCALE_IN,
  SHORT_GET,
  T_IN_WINDOW,
  UNSUPPORTED_LOCALES,
  USER_RICH,
} from './_lib/constants.ts';
import {
  playerOf,
  reportOf,
  reportUserOf,
  responseSignature,
  statusOf,
  msgOf,
  type ApiCall,
} from './_lib/client.ts';
import { AnnualReviewTestBase } from './_lib/AnnualReviewTestBase.ts';

/**
 * 002 鉴权、越权与大区过滤
 *
 * 覆盖用例：API-ANNIV-010 ~ API-ANNIV-014
 * 预期来源：TK-0383/TK-0386 API.md 第 1、4 节；config enableLocales=[in,vi,th,ko,zh,ph]
 * 预置条件：活动期内（2026-12-14 12:00 +08:00）
 * 运行：node 002-auth-locale.test.ts
 */
class AuthLocale002 extends AnnualReviewTestBase {
  constructor() {
    super();
    this.total = 9;
  }

  protected async run(): Promise<void> {
    // ---------- 鉴权 ----------
    const noLogin = await this.annualReview.get(FULL_GET, { locale: LOCALE_IN, debugTimestamp: T_IN_WINDOW });
    await this.check('用例#API-ANNIV-010-① 未登录（不传 l-user-id）返回 status=1、msg="User need login first"、data=null', async (): Promise<CheckResult> => {
      return {
        expect: 'status=1，msg=User need login first，data=null',
        real: `status=${statusOf(noLogin)}，msg=${JSON.stringify(msgOf(noLogin))}，data=${JSON.stringify(noLogin.body.data)}`,
        pass: noLogin.httpStatus === 200 && statusOf(noLogin) === 1 && msgOf(noLogin) === 'User need login first' && noLogin.body.data === null,
      };
    });

    const zeroUser = await this.annualReview.get(FULL_GET, { userId: 0, locale: LOCALE_IN, debugTimestamp: T_IN_WINDOW });
    await this.check('用例#API-ANNIV-010-② 登录用户 ID=0 视为未登录，返回 status=1、msg="User need login first"', async (): Promise<CheckResult> => {
      return {
        expect: 'status=1，msg=User need login first',
        real: `status=${statusOf(zeroUser)}，msg=${JSON.stringify(msgOf(zeroUser))}`,
        pass: statusOf(zeroUser) === 1 && msgOf(zeroUser) === 'User need login first',
      };
    });

    // ---------- 越权 ----------
    const base = await this.annualReview.get(FULL_GET, { userId: USER_RICH, locale: LOCALE_IN, debugTimestamp: T_IN_WINDOW });
    const injected = await this.annualReview.get(FULL_GET, {
      userId: USER_RICH,
      locale: LOCALE_IN,
      debugTimestamp: T_IN_WINDOW,
      body: { userId: 8, id: 8 },
    });
    const injectedUser = reportUserOf(injected);
    await this.check(`用例#API-ANNIV-011-① 请求体传 userId/id=8 不生效，仍返回登录用户 ${USER_RICH} 的数据（不越权）`, async (): Promise<CheckResult> => {
      return {
        expect: `report.user.id=${USER_RICH}`,
        real: `report.user.id=${injectedUser === null ? 'null' : String(injectedUser.id)}`,
        pass: injectedUser !== null && Number(injectedUser.id) === USER_RICH,
      };
    });

    await this.check('用例#API-ANNIV-011-② 请求体注入 userId 的响应与空请求体完全一致', async (): Promise<CheckResult> => {
      const baseSig = responseSignature(base);
      const injectedSig = responseSignature(injected);
      return {
        expect: '完全一致',
        real: baseSig === injectedSig ? '一致' : `不一致：base=${baseSig.slice(0, 300)}，injected=${injectedSig.slice(0, 300)}`,
        pass: baseSig === injectedSig,
      };
    });

    // ---------- 大区 ----------
    const localeResults = new Map<string, ApiCall>();
    for (const locale of ENABLED_LOCALES) {
      const call = await this.annualReview.get(FULL_GET, { userId: USER_RICH, locale, debugTimestamp: T_IN_WINDOW });
      localeResults.set(locale, call);
    }

    await this.check(`用例#API-ANNIV-012-① 配置启用的六个大区（${ENABLED_LOCALES.join('/')}）均返回 report.user`, async (): Promise<CheckResult> => {
      const details = ENABLED_LOCALES.map((locale) => {
        const call = localeResults.get(locale)!;
        const user = reportUserOf(call);
        return `${locale}:status=${statusOf(call)},user=${user === null ? 'null' : String(user.id)}`;
      });
      const ok = ENABLED_LOCALES.every((locale) => {
        const call = localeResults.get(locale)!;
        const user = reportUserOf(call);
        return statusOf(call) === 0 && user !== null && Number(user.id) === USER_RICH;
      });
      return {
        expect: ENABLED_LOCALES.map((locale) => `${locale}:status=0,user=${USER_RICH}`).join('；'),
        real: details.join('；'),
        pass: ok,
      };
    });

    await this.check('用例#API-ANNIV-012-② 六个大区返回的 report.user 内容一致（数据源未配置 locale 维度，仅大区门禁生效）', async (): Promise<CheckResult> => {
      const signatures = ENABLED_LOCALES.map((locale) => {
        const call = localeResults.get(locale)!;
        return `${locale}:${JSON.stringify(reportUserOf(call) ?? null)}`;
      });
      const distinct = new Set(ENABLED_LOCALES.map((locale) => JSON.stringify(reportUserOf(localeResults.get(locale)!) ?? null)));
      return {
        expect: '六个大区的 report.user 完全相同',
        real: distinct.size === 1 ? '完全相同' : signatures.join('；').slice(0, 600),
        pass: distinct.size === 1,
      };
    });

    const unsupportedCall = await this.annualReview.get(FULL_GET, {
      userId: USER_RICH,
      locale: UNSUPPORTED_LOCALES[0],
      debugTimestamp: T_IN_WINDOW,
    });
    await this.check(`用例#API-ANNIV-013-① 未启用大区 ${UNSUPPORTED_LOCALES[0]} 返回 status=0、report={}，player 正常`, async (): Promise<CheckResult> => {
      const report = reportOf(unsupportedCall);
      const player = playerOf(unsupportedCall);
      return {
        expect: 'status=0，report 为空对象，player 为对象',
        real: `status=${statusOf(unsupportedCall)}，report=${JSON.stringify(report)}，player=${player === null ? 'null' : '对象'}`,
        pass: statusOf(unsupportedCall) === 0 && Object.keys(report).length === 0 && player !== null,
      };
    });

    const unsupportedEn = await this.annualReview.get(FULL_GET, {
      userId: USER_RICH,
      locale: UNSUPPORTED_LOCALES[1],
      debugTimestamp: T_IN_WINDOW,
    });
    await this.check(`用例#API-ANNIV-013-② 未启用大区 ${UNSUPPORTED_LOCALES[1]} 同样返回 status=0、report={}`, async (): Promise<CheckResult> => {
      const report = reportOf(unsupportedEn);
      return {
        expect: 'status=0，report 为空对象',
        real: `status=${statusOf(unsupportedEn)}，report=${JSON.stringify(report)}`,
        pass: statusOf(unsupportedEn) === 0 && Object.keys(report).length === 0,
      };
    });

    const shortUnsupported = await this.annualReview.get(SHORT_GET, {
      userId: USER_RICH,
      locale: UNSUPPORTED_LOCALES[0],
      debugTimestamp: T_IN_WINDOW,
    });
    await this.check('用例#API-ANNIV-014-① 未启用大区下短路径与完整路径响应一致', async (): Promise<CheckResult> => {
      const left = responseSignature(unsupportedCall);
      const right = responseSignature(shortUnsupported);
      return {
        expect: '完全一致',
        real: left === right ? '一致' : `不一致：full=${left.slice(0, 300)}，short=${right.slice(0, 300)}`,
        pass: left === right,
      };
    });
  }
}

await new AuthLocale002().execute();
