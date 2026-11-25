import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { OLD_BIZ, queryModuleDetail } from './_lib/pk2612.ts';

/**
 * TK-0649 / 2612 年度 PK：旧活动回归（复用隔离）。
 *
 * 校验 2612 新 biz 上线后，六周年 pk-v202608 的配置与轮次仍可正常读取，
 * 且 2612 配置文件未覆盖旧 biz 的数据。
 */
class Pk2612OldBiz extends TestBaseClass {
  constructor() {
    super();
    this.total = 4;
  }

  protected async run(): Promise<void> {
    await this.check('旧 biz pk-v202608 在六周年活动期返回自身 biz 与起止时间', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${OLD_BIZ}/detail`, {
        body: {},
        locale: 'in',
        debugTimestamp: '2026-08-18T12:00:00+08:00',
      })) as Record<string, unknown>;
      return {
        expect: `biz=${OLD_BIZ}, begin=2026-08-12T14:00:00+08:00A, end=2026-09-01T23:59:59+08:00A`,
        real: `biz=${String(data?.biz ?? '')}, begin=${String(data?.beginTime ?? '')}, end=${String(data?.endTime ?? '')}`,
        pass:
          String(data?.biz ?? '') === OLD_BIZ &&
          String(data?.beginTime ?? '') === '2026-08-12T14:00:00+08:00A' &&
          String(data?.endTime ?? '') === '2026-09-01T23:59:59+08:00A',
      };
    });

    await this.check('旧 biz player_n_100 在 2026-08-18 仍可读取主轮次', async (): Promise<CheckResult> => {
      const detail = await queryModuleDetail(this.api, 'player_n_100', 'vi', '2026-08-18T12:00:00+08:00', OLD_BIZ);
      return {
        expect: `${OLD_BIZ}/player_n_100/vi key=-`,
        real: detail === null ? 'null' : `${detail.biz}/${detail.topic}/${detail.locale} key=${detail.key}`,
        pass: detail !== null && detail.biz === OLD_BIZ && detail.topic === 'player_n_100' && detail.key === '-',
      };
    });

    await this.check('旧 biz player_n_100 仍包含 2026-08-17/18/19 三轮日榜', async (): Promise<CheckResult> => {
      const detail = await queryModuleDetail(this.api, 'player_n_100', 'vi', '2026-08-18T12:00:00+08:00', OLD_BIZ);
      const keys = new Set((detail?.rounds ?? []).map((r) => String(r.key)));
      const expected = ['20260817', '20260818', '20260819'];
      const missing = expected.filter((k) => !keys.has(k));
      return {
        expect: `包含 ${expected.join('/')}`,
        real: missing.length === 0 ? `包含 ${expected.join('/')}` : `缺少 ${missing.join('/')}，实际=${[...keys].join(',')}`,
        pass: missing.length === 0,
      };
    });

    await this.check('2612 配置未覆盖旧 biz：旧 biz 数据仍为 pk-v202608', async (): Promise<CheckResult> => {
      const rows = await this.api.request(`active/v3/${OLD_BIZ}/m/family/detail`, {
        body: {},
        locale: 'vi',
        debugTimestamp: '2026-08-18T12:00:00+08:00',
      });
      const detail = (rows as { detail?: { biz?: string } } | null)?.detail;
      return {
        expect: `biz=${OLD_BIZ}`,
        real: `biz=${String(detail?.biz ?? 'null')}`,
        pass: String(detail?.biz ?? '') === OLD_BIZ,
      };
    });
  }
}

await new Pk2612OldBiz().execute();
