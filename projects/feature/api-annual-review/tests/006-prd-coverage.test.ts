import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  ACTIVE_TIME_RANGES,
  FULL_GET,
  IDENTITY_MAP,
  IDENTITY_SAMPLE_USERS,
  LOCALE_IN,
  PRD_PAGES,
  RELATION_TYPES,
  T_IN_WINDOW,
  USER_RICH,
} from './_lib/constants.ts';
import { playerOf, reportUserOf, type ApiCall } from './_lib/client.ts';
import { AnnualReviewTestBase } from './_lib/AnnualReviewTestBase.ts';

/**
 * 006 需求（PRD 21 页）字段覆盖与枚举一致性
 *
 * 覆盖用例：API-ANNIV-050-00 ~ API-ANNIV-050-20（逐页）、API-ANNIV-051 ~ API-ANNIV-054
 * 预期来源：PRD #3399 第二章页面定义 + TK-0383/TK-0386 API.md 第 5 节页面字段映射
 * 说明：昵称/头像渲染、ID 解析、注销跳过、多语言文案由前端按已确认方案处理，不在接口字段断言内。
 * 运行：node 006-prd-coverage.test.ts
 */
class PrdCoverage006 extends AnnualReviewTestBase {
  constructor() {
    super();
    this.total = 26;
  }

  protected async run(): Promise<void> {
    const options = { userId: USER_RICH, locale: LOCALE_IN, debugTimestamp: T_IN_WINDOW };
    const call = await this.annualReview.get(FULL_GET, options);
    const user = reportUserOf(call);
    if (user === null) throw new Error('report.user 为空：活动时间窗/大区/数据未就绪，无法执行 PRD 字段覆盖校验');

    for (const page of PRD_PAGES) {
      const caseId = `API-ANNIV-050-${String(page.page).padStart(2, '0')}`;
      if (page.page === 0) {
        await this.check(`用例#${caseId}-① PRD P0 首页：player.name/avatar 可返回（昵称+头像展示数据源）`, async (): Promise<CheckResult> => {
          const player = playerOf(call);
          if (player === null) throw new Error('player 为空');
          const nameOk = typeof player.name === 'string' && player.name.length > 0;
          const avatarOk = typeof player.avatar === 'string' && player.avatar.length > 0;
          return {
            expect: 'player.name 与 player.avatar 均为非空字符串',
            real: `name=${typeof player.name}${nameOk ? '(非空)' : ''}，avatar=${typeof player.avatar}${avatarOk ? '(非空)' : ''}`,
            pass: nameOk && avatarOk,
          };
        });
        continue;
      }

      await this.check(`用例#${caseId}-① PRD P${page.page} ${page.title}：report.user 提供所需字段 [${page.fields.join(',')}]`, async (): Promise<CheckResult> => {
        const missing = page.fields.filter((field) => !Object.prototype.hasOwnProperty.call(user, field));
        return {
          expect: '缺失 0 个',
          real: `缺失=[${missing.join(',')}]`,
          pass: missing.length === 0,
        };
      });
    }

    // ---------- 枚举与映射一致性 ----------
    const samples: ApiCall[] = [];
    for (const userId of IDENTITY_SAMPLE_USERS) {
      samples.push(await this.annualReview.get(FULL_GET, { userId, locale: LOCALE_IN, debugTimestamp: T_IN_WINDOW }));
    }
    const sampleUsers = IDENTITY_SAMPLE_USERS.map((userId, index) => ({
      userId,
      user: reportUserOf(samples[index]),
    }))
      .filter((entry) => entry.user !== null)
      .map((entry) => ({ userId: entry.userId, user: entry.user as Record<string, unknown> }));

    await this.check('用例#API-ANNIV-051-① 身份卡 identity_code 仅取文档定义的 12 个 code', async (): Promise<CheckResult> => {
      const observed = sampleUsers
        .filter((entry) => entry.user.identity_code !== null && entry.user.identity_code !== undefined)
        .map((entry) => ({ userId: entry.userId, code: String(entry.user.identity_code) }));
      const invalid = observed.filter((item) => !Object.prototype.hasOwnProperty.call(IDENTITY_MAP, item.code));
      return {
        expect: '未定义 code 0 个',
        real: `样本=${observed.map((item) => `${item.userId}:${item.code}`).join(',') || '(无 identity_code 数据)'}；未定义=[${invalid.map((item) => `${item.userId}:${item.code}`).join(',')}]`,
        pass: observed.length > 0 && invalid.length === 0,
      };
    });

    await this.check('用例#API-ANNIV-052-① 身份卡 identity_name 与 code 的文档名称一致', async (): Promise<CheckResult> => {
      const observed = sampleUsers.filter(
        (entry) => entry.user.identity_code !== null && entry.user.identity_code !== undefined,
      );
      const mismatches = observed
        .map((entry) => {
          const code = String(entry.user.identity_code);
          const expected = IDENTITY_MAP[code]?.name;
          return `${entry.userId}:${code}/${String(entry.user.identity_name)}${expected === undefined ? '(code未定义)' : expected === entry.user.identity_name ? '' : `≠${expected}`}`;
        })
        .filter((text) => text.includes('≠') || text.includes('未定义'));
      return {
        expect: '不一致 0 个',
        real: observed.length === 0 ? '(无 identity 数据)' : `样本=${observed.map((entry) => `${entry.userId}:${String(entry.user.identity_code)}/${String(entry.user.identity_name)}`).join(',')}；不一致=[${mismatches.join(',')}]`,
        pass: observed.length > 0 && mismatches.length === 0,
      };
    });

    await this.check('用例#API-ANNIV-053-① 身份卡 identity_priority 与 code 的文档优先级一致（1 最高）', async (): Promise<CheckResult> => {
      const observed = sampleUsers.filter(
        (entry) => entry.user.identity_code !== null && entry.user.identity_code !== undefined,
      );
      const mismatches = observed
        .map((entry) => {
          const code = String(entry.user.identity_code);
          const expected = IDENTITY_MAP[code]?.priority;
          return `${entry.userId}:${code}/${String(entry.user.identity_priority)}${expected === undefined ? '(code未定义)' : Number(entry.user.identity_priority) === expected ? '' : `≠${expected}`}`;
        })
        .filter((text) => text.includes('≠') || text.includes('未定义'));
      return {
        expect: '不一致 0 个',
        real: observed.length === 0 ? '(无 identity 数据)' : `样本=${observed.map((entry) => `${entry.userId}:${String(entry.user.identity_code)}/${String(entry.user.identity_priority)}`).join(',')}；不一致=[${mismatches.join(',')}]`,
        pass: observed.length > 0 && mismatches.length === 0,
      };
    });

    await this.check('用例#API-ANNIV-054-① 活跃时段 active_time 仅取 PRD 定义的四个区间', async (): Promise<CheckResult> => {
      const observed = sampleUsers
        .filter((entry) => entry.user.active_time !== null && entry.user.active_time !== undefined)
        .map((entry) => ({ userId: entry.userId, value: String(entry.user.active_time) }));
      const invalid = observed.filter((item) => !ACTIVE_TIME_RANGES.includes(item.value));
      return {
        expect: `取值属于 ${ACTIVE_TIME_RANGES.join('/')}`,
        real: `样本=${observed.map((item) => `${item.userId}:${item.value}`).join(',') || '(无 active_time 数据)'}；越界=[${invalid.map((item) => `${item.userId}:${item.value}`).join(',')}]`,
        pass: observed.length > 0 && invalid.length === 0,
      };
    });

    await this.check('用例#API-ANNIV-054-② 拍拍关系类型仅取 PRD 定义的五种（cp/friend/bestie/brother/family）', async (): Promise<CheckResult> => {
      const fields = ['first_relation_type', 'top_value_relation_type', 'longest_relation_type'];
      const observed: Array<{ userId: number; field: string; value: string }> = [];
      for (const entry of sampleUsers) {
        for (const field of fields) {
          const value = entry.user[field];
          if (value !== null && value !== undefined) observed.push({ userId: entry.userId, field, value: String(value) });
        }
      }
      if (observed.length === 0) {
        this.skip('样本用户在宽表中无拍拍关系字段数据；关系取值口径由数据测试任务 TK-0379 覆盖');
      }
      const invalid = observed.filter((item) => !RELATION_TYPES.includes(item.value));
      return {
        expect: `取值属于 ${RELATION_TYPES.join('/')}`,
        real: `样本=${observed.map((item) => `${item.userId}:${item.field}=${item.value}`).join(',')}；越界=[${invalid.map((item) => `${item.userId}:${item.field}=${item.value}`).join(',')}]`,
        pass: invalid.length === 0,
      };
    });
  }
}

await new PrdCoverage006().execute();
