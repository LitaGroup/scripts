import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { beijingMs } from '../../../../src/base/TimeUtils.ts';
import {
  ACTIVITY_END_BJ,
  ACTIVITY_START_BJ,
  ALIAS,
  ALL_LOCALES,
  BIZ,
  IN,
  OLD_BIZ,
  RUN_DEBUG_TS,
  initTopic,
  queryModuleDetail,
} from './_lib/pk2612.ts';

/**
 * TK-0649 / 2612 年度 PK：配置与路由基础用例。
 *
 * 覆盖：
 * - 完整 biz pk-v202612 与 alias pk 可访问，活动时间与需求一致（Q02/Q25）。
 * - 上线大区 in/vi/ph/ko，不包含 ar（Q03）。
 * - 活动开始前、结束后不可访问。
 * - 旧 biz pk-v202608 不受影响（复用隔离）。
 */
class Pk2612Config extends TestBaseClass {
  constructor() {
    super();
    this.total = 13;
  }

  protected async run(): Promise<void> {
    await this.check('完整 biz pk-v202612 在活动期内可访问，返回 biz 与起止时间', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${BIZ}/detail`, {
        body: {},
        locale: IN,
        debugTimestamp: RUN_DEBUG_TS,
      })) as Record<string, unknown>;
      const expect = {
        biz: BIZ,
        beginTime: '2026-12-17T11:00:00+08:00A',
        endTime: '2027-01-02T23:59:59+08:00A',
      };
      const real = {
        biz: String(data?.biz ?? ''),
        beginTime: String(data?.beginTime ?? ''),
        endTime: String(data?.endTime ?? ''),
      };
      return { expect: JSON.stringify(expect), real: JSON.stringify(real), pass: JSON.stringify(expect) === JSON.stringify(real) };
    });

    await this.check('alias pk 在活动期内解析到 2612 活动，起止时间一致', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${ALIAS}/detail`, {
        body: {},
        locale: IN,
        debugTimestamp: RUN_DEBUG_TS,
      })) as Record<string, unknown>;
      const expect = {
        biz: BIZ,
        beginTime: '2026-12-17T11:00:00+08:00A',
        endTime: '2027-01-02T23:59:59+08:00A',
      };
      const real = {
        biz: String(data?.biz ?? ''),
        beginTime: String(data?.beginTime ?? ''),
        endTime: String(data?.endTime ?? ''),
      };
      return { expect: JSON.stringify(expect), real: JSON.stringify(real), pass: JSON.stringify(expect) === JSON.stringify(real) };
    });

    await this.check('完整 biz config 的大区为 in/vi/ph/ko，无 ar', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${BIZ}/config`, {
        body: {},
        locale: IN,
        debugTimestamp: RUN_DEBUG_TS,
      })) as Record<string, unknown>;
      const locales = ((data?.enableLocales as string[] | undefined) ?? []).slice().sort();
      const expect = [...ALL_LOCALES].sort();
      return { expect: expect.join(','), real: locales.join(','), pass: expect.join(',') === locales.join(',') };
    });

    await this.check('config 的 startTime/finishTime 与需求 UTC+8 绝对时间一致', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${BIZ}/config`, {
        body: {},
        locale: IN,
        debugTimestamp: RUN_DEBUG_TS,
      })) as Record<string, unknown>;
      const expectedStart = beijingMs(ACTIVITY_START_BJ);
      const expectedFinish = beijingMs(ACTIVITY_END_BJ);
      const realStart = Number(data?.startTime ?? 0);
      const realFinish = Number(data?.finishTime ?? 0);
      return {
        expect: `start=${expectedStart}, finish=${expectedFinish}`,
        real: `start=${realStart}, finish=${realFinish}`,
        pass: realStart === expectedStart && realFinish === expectedFinish,
      };
    });

    await this.check('alias pk config 与完整 biz 一致（biz/时间/大区）', async (): Promise<CheckResult> => {
      const [full, alias] = await Promise.all([
        this.api.request(`active/v3/${BIZ}/config`, { body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS }),
        this.api.request(`active/v3/${ALIAS}/config`, { body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS }),
      ]);
      const pick = (v: unknown) => {
        const d = (v ?? {}) as Record<string, unknown>;
        return {
          startTime: Number(d.startTime ?? 0),
          finishTime: Number(d.finishTime ?? 0),
          enableLocales: ((d.enableLocales as string[] | undefined) ?? []).slice().sort().join(','),
        };
      };
      const a = pick(full);
      const b = pick(alias);
      return { expect: JSON.stringify(a), real: JSON.stringify(b), pass: JSON.stringify(a) === JSON.stringify(b) };
    });

    await this.check('活动开始前超过平台 7 天宽限期不可访问（2026-12-09 12:00）', async (): Promise<CheckResult> => {
      const raw = await this.api.requestRaw(`active/v3/${BIZ}/detail`, {
        body: {},
        locale: IN,
        debugTimestamp: '2026-12-09T12:00:00+08:00',
      });
      const status = Number(raw.body.status ?? -999);
      const msg = String(raw.body.msg ?? '');
      return {
        expect: '业务 status != 0，且活动已注册（非 Active not found）',
        real: `HTTP ${raw.httpStatus}, status=${status}, msg=${msg}`,
        pass: status !== 0 && msg !== 'Active not found',
      };
    });

    await this.check('活动结束后超过平台 7 天宽限期不可访问（2027-01-10 12:00）', async (): Promise<CheckResult> => {
      const raw = await this.api.requestRaw(`active/v3/${BIZ}/detail`, {
        body: {},
        locale: IN,
        debugTimestamp: '2027-01-10T12:00:00+08:00',
      });
      const status = Number(raw.body.status ?? -999);
      const msg = String(raw.body.msg ?? '');
      return {
        expect: '业务 status != 0，且活动已注册（非 Active not found）',
        real: `HTTP ${raw.httpStatus}, status=${status}, msg=${msg}`,
        pass: status !== 0 && msg !== 'Active not found',
      };
    });

    await this.check('alias pk 在活动开始前超过宽限期不可访问（2026-12-09）', async (): Promise<CheckResult> => {
      const raw = await this.api.requestRaw(`active/v3/${ALIAS}/detail`, {
        body: {},
        locale: IN,
        debugTimestamp: '2026-12-09T12:00:00+08:00',
      });
      const status = Number(raw.body.status ?? -999);
      return { expect: '业务 status != 0', real: `HTTP ${raw.httpStatus}, status=${status}, msg=${String(raw.body.msg ?? '')}`, pass: status !== 0 };
    });

    await this.check('旧 biz pk-v202608 在六周年活动期仍可访问且时间未变', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${OLD_BIZ}/detail`, {
        body: {},
        locale: IN,
        debugTimestamp: '2026-08-18T12:00:00+08:00',
      })) as Record<string, unknown>;
      const expect = {
        biz: OLD_BIZ,
        beginTime: '2026-08-12T14:00:00+08:00A',
        endTime: '2026-09-01T23:59:59+08:00A',
      };
      const real = {
        biz: String(data?.biz ?? ''),
        beginTime: String(data?.beginTime ?? ''),
        endTime: String(data?.endTime ?? ''),
      };
      return { expect: JSON.stringify(expect), real: JSON.stringify(real), pass: JSON.stringify(expect) === JSON.stringify(real) };
    });

    await this.check('旧 biz pk-v202608 在 2612 活动期不返回 2612 数据', async (): Promise<CheckResult> => {
      const raw = await this.api.requestRaw(`active/v3/${OLD_BIZ}/detail`, {
        body: {},
        locale: IN,
        debugTimestamp: RUN_DEBUG_TS,
      });
      const status = Number(raw.body.status ?? -999);
      return { expect: '业务 status != 0 或 biz 仍为 pk-v202608', real: `status=${status}, data=${JSON.stringify(raw.body.data ?? null)}`, pass: status !== 0 };
    });

    await this.act('初始化 2612 印尼陪陪首阶段轮次（用于大区过滤检查）', async () => {
      await initTopic(this.api, 'player_in_n_200');
    });

    await this.check('ar 大区未启用：player_in_n_200 在 ar 无详情', async (): Promise<CheckResult> => {
      const detail = await queryModuleDetail(this.api, 'player_in_n_200', 'ar');
      return { expect: 'null', real: detail === null ? 'null' : JSON.stringify(detail).slice(0, 200), pass: detail === null };
    });

    await this.check('in 大区已启用：player_in_n_200 在 in 返回主轮次', async (): Promise<CheckResult> => {
      const detail = await queryModuleDetail(this.api, 'player_in_n_200', IN);
      return {
        expect: `${BIZ}/player_in_n_200/in key=-`,
        real: detail === null ? 'null' : `${detail.biz}/${detail.topic}/${detail.locale} key=${detail.key}`,
        pass: detail !== null && detail.key === '-',
      };
    });
  }
}

await new Pk2612Config().execute();
