import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  DATETIME_FIELDS,
  FULL_GET,
  LOCALE_IN,
  NUMERIC_FIELDS,
  SHORT_GET,
  STRING_FIELDS,
  T_IN_WINDOW,
  USER_FIELDS_61,
  USER_RICH,
} from './_lib/constants.ts';
import {
  playerOf,
  reportUserOf,
  responseSignature,
  statusOf,
  msgOf,
  stableStringify,
} from './_lib/client.ts';
import { AnnualReviewTestBase } from './_lib/AnnualReviewTestBase.ts';

/**
 * 001 接口契约（P0）
 *
 * 覆盖用例：API-ANNIV-001 ~ API-ANNIV-006
 * 预期来源：TK-0383/TK-0386 API.md（响应结构、61 列字段）、TK-0317 DDL（列类型）
 * 预置条件：活动期内（2026-12-14 12:00 +08:00）、测试用户 21（宽表有行）、大区 in
 * 运行：node 001-contract.test.ts
 */
class Contract001 extends AnnualReviewTestBase {
  constructor() {
    super();
    this.total = 12;
  }

  protected async run(): Promise<void> {
    const options = { userId: USER_RICH, locale: LOCALE_IN, debugTimestamp: T_IN_WINDOW };
    const full = await this.annualReview.get(FULL_GET, options);
    const short = await this.annualReview.get(SHORT_GET, options);
    const fullUser = reportUserOf(full);
    const fullPlayer = playerOf(full);

    await this.check('用例#API-ANNIV-001-① 完整 biz 路径 POST /annual-review-v202612/get 返回 HTTP 200 且业务 status=0', async (): Promise<CheckResult> => {
      return {
        expect: 'HTTP 200，status=0，msg=""',
        real: `HTTP ${full.httpStatus}，status=${statusOf(full)}，msg=${JSON.stringify(msgOf(full))}`,
        pass: full.httpStatus === 200 && statusOf(full) === 0 && msgOf(full) === '',
      };
    });

    await this.check('用例#API-ANNIV-001-② 响应 data 同时包含 report 与 player 两个键', async (): Promise<CheckResult> => {
      const data = (full.body.data ?? {}) as Record<string, unknown>;
      const hasReport = Object.prototype.hasOwnProperty.call(data, 'report');
      const hasPlayer = Object.prototype.hasOwnProperty.call(data, 'player');
      return {
        expect: 'data 含 report 与 player',
        real: `data 键=${Object.keys(data).join(',')}；report=${hasReport}；player=${hasPlayer}`,
        pass: hasReport && hasPlayer,
      };
    });

    await this.check(`用例#API-ANNIV-001-③ report.user 为当前用户宽表行（id=${USER_RICH}）`, async (): Promise<CheckResult> => {
      return {
        expect: `report.user 为对象且 id=${USER_RICH}`,
        real: `report.user=${fullUser === null ? 'null' : `id=${String(fullUser.id)}`}`,
        pass: fullUser !== null && Number(fullUser.id) === USER_RICH,
      };
    });

    await this.check('用例#API-ANNIV-002-① 兼容短路径 POST /annual-review/get 同样返回 HTTP 200、status=0、report.user 非空', async (): Promise<CheckResult> => {
      const shortUser = reportUserOf(short);
      return {
        expect: 'HTTP 200，status=0，report.user 非空',
        real: `HTTP ${short.httpStatus}，status=${statusOf(short)}，report.user=${shortUser === null ? 'null' : `id=${String(shortUser.id)}`}`,
        pass: short.httpStatus === 200 && statusOf(short) === 0 && shortUser !== null,
      };
    });

    await this.check('用例#API-ANNIV-002-② 完整路径与短路径的 status/msg/data 深度相等', async (): Promise<CheckResult> => {
      const fullSig = responseSignature(full);
      const shortSig = responseSignature(short);
      return {
        expect: '两条路径响应完全一致',
        real: fullSig === shortSig ? '一致' : `不一致：full=${fullSig.slice(0, 300)}，short=${shortSig.slice(0, 300)}`,
        pass: fullSig === shortSig,
      };
    });

    await this.check(`用例#API-ANNIV-003-① report.user 包含文档约定的全部 ${USER_FIELDS_61.length} 个字段（无缺失）`, async (): Promise<CheckResult> => {
      if (fullUser === null) throw new Error('report.user 为空，无法校验字段');
      const missing = USER_FIELDS_61.filter((field) => !Object.prototype.hasOwnProperty.call(fullUser, field));
      const extra = Object.keys(fullUser).filter((field) => !USER_FIELDS_61.includes(field));
      return {
        expect: `缺失 0 个；允许新增字段`,
        real: `实际字段=${Object.keys(fullUser).length}，缺失=[${missing.join(',')}]，新增=[${extra.join(',')}]`,
        pass: missing.length === 0,
      };
    });

    await this.check('用例#API-ANNIV-003-② 非空字段 JSON 类型符合 stats 表 DDL 映射（数值=number、字符串=string、is_player=boolean）', async (): Promise<CheckResult> => {
      if (fullUser === null) throw new Error('report.user 为空，无法校验类型');
      const violations: string[] = [];
      for (const [key, value] of Object.entries(fullUser)) {
        if (value === null || value === undefined) continue;
        if (key === 'is_player') {
          if (typeof value !== 'boolean') violations.push(`${key}=${typeof value}`);
          continue;
        }
        if (NUMERIC_FIELDS.has(key) && typeof value !== 'number') violations.push(`${key}=${typeof value}`);
        if (STRING_FIELDS.has(key) && typeof value !== 'string') violations.push(`${key}=${typeof value}`);
        if (DATETIME_FIELDS.has(key) && typeof value !== 'string' && typeof value !== 'number') {
          violations.push(`${key}=${typeof value}`);
        }
      }
      return {
        expect: '类型映射违规 0 项',
        real: violations.length === 0 ? '0 项' : violations.join('；'),
        pass: violations.length === 0,
      };
    });

    await this.check('用例#API-ANNIV-003-③ 日期/时间字段非空时按接口文档允许的 string 或 number 返回', async (): Promise<CheckResult> => {
      if (fullUser === null) throw new Error('report.user 为空，无法校验日期字段');
      const details: string[] = [];
      let pass = true;
      for (const field of DATETIME_FIELDS) {
        const value = fullUser[field];
        if (value === null || value === undefined) {
          details.push(`${field}=null`);
          continue;
        }
        const type = typeof value;
        if (type !== 'string' && type !== 'number') pass = false;
        details.push(`${field}=${type}(${String(value)})`);
      }
      return {
        expect: 'string 或 number',
        real: details.join('；'),
        pass,
      };
    });

    await this.check(`用例#API-ANNIV-004-① report.user.id、player.id 与请求登录用户一致（均为 ${USER_RICH}）`, async (): Promise<CheckResult> => {
      if (fullUser === null || fullPlayer === null) throw new Error('report.user 或 player 为空');
      return {
        expect: `${USER_RICH}/${USER_RICH}/${USER_RICH}`,
        real: `${String(fullUser.id)}/${String(fullPlayer.id)}/${USER_RICH}`,
        pass: Number(fullUser.id) === USER_RICH && Number(fullPlayer.id) === USER_RICH,
      };
    });

    await this.check('用例#API-ANNIV-004-② player.createTime（注册时间戳）对应的北京日期与 report.user.register_date 一致', async (): Promise<CheckResult> => {
      if (fullUser === null || fullPlayer === null) throw new Error('report.user 或 player 为空');
      const createTime = Number(fullPlayer.createTime);
      const playerDate = Number.isFinite(createTime)
        ? new Date(createTime + 8 * 3600 * 1000).toISOString().slice(0, 10)
        : 'invalid';
      const registerDate = typeof fullUser.register_date === 'string' ? fullUser.register_date : String(fullUser.register_date);
      return {
        expect: `player.createTime→${registerDate}（+08:00 日期）`,
        real: `player.createTime=${String(fullPlayer.createTime)}→${playerDate}，report.user.register_date=${registerDate}`,
        pass: playerDate === registerDate,
      };
    });

    if (fullUser !== null && fullPlayer !== null) {
      this.log(
        `观察项：report.user.no=${String(fullUser.no)}，player.no=${String(fullPlayer.no)}` +
          `（前者来自 stats 宽表快照，后者来自 active-v3 player；二者来源不同，PRD 页面未使用 report.user.no，记录供数据侧核对）`,
      );
    }

    await this.check('用例#API-ANNIV-005-① player 含文档字段 name/id/no/avatar/type/status/createTime/isHost', async (): Promise<CheckResult> => {
      if (fullPlayer === null) throw new Error('player 为空');
      const required = ['name', 'id', 'no', 'avatar', 'type', 'status', 'createTime', 'isHost'];
      const missing = required.filter((field) => !Object.prototype.hasOwnProperty.call(fullPlayer, field));
      return {
        expect: '缺失 0 个',
        real: `实际键=${Object.keys(fullPlayer).join(',')}；缺失=[${missing.join(',')}]；isPlayer=${Object.prototype.hasOwnProperty.call(fullPlayer, 'isPlayer') ? String(fullPlayer.isPlayer) : '缺省(null)'}`,
        pass: missing.length === 0,
      };
    });

    await this.check('用例#API-ANNIV-006-① 同一用户连续两次调用（status/msg/data）完全一致（只读幂等）', async (): Promise<CheckResult> => {
      const again = await this.annualReview.get(FULL_GET, options);
      const first = responseSignature(full);
      const second = responseSignature(again);
      return {
        expect: '两次响应完全一致',
        real: first === second ? '一致' : `不一致：first=${first.slice(0, 300)}，second=${second.slice(0, 300)}`,
        pass: first === second,
      };
    });

    // 保留一次显式结构日志，便于人工核对（不计入检查点）
    this.log(`001 契约快照（脱敏）: ${stableStringify({ reportKeys: Object.keys((full.body.data as Record<string, unknown>)?.report ?? {}), userFieldCount: fullUser ? Object.keys(fullUser).length : 0 })}`);
  }
}

await new Contract001().execute();
