import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { beijingMs, localAtMs } from '../../../../src/base/TimeUtils.ts';
import type { MysqlRow } from '../../../../src/resources/MySQLTestResource.ts';
import {
  LOCALES,
  LOCALE,
  USER_A,
  MILEAGE_NAME,
  POOL_NAME_NORMAL,
  POOL_NAME_FLYING,
  DAILY_ENTRY_AWARD,
  AWARD_SEND_TOTAL,
  AWARD_SEND_DAILY,
  AWARD_RECV,
  AWARD_RECV_CONTRIBUTOR,
  TOPIC_SEND,
  TOPIC_RECV,
} from './_lib/constants.ts';
import { T_PRE, T_D1, localIso } from './_lib/times.ts';
import { int } from './_lib/helpers.ts';

/**
 * 约定：开始 2026-09-23 14:00:00（北京时间，固定，无 R 后缀）；
 * 结束 2026-10-02 23:59:59（各大区本地，R 后缀）——/config 返回各大区最晚绝对时间，即 in/vi（UTC+7）本地 10-02 23:59:59。
 */
const EXPECT_START_MS = beijingMs('2026-09-23 14:00:00');
const EXPECT_FINISH_MS = localAtMs('in', '2026-10-02 23:59:59');

interface BusMapPoint {
  stage: number;
}

interface BusMapInfo {
  name: string;
  awardName: string;
  points: BusMapPoint[];
}

/**
 * 001-config-init —— 配置与预置数据校验
 * 模拟时间：/config 用 T_PRE（活动开始前）；bus/detail 与 daily-entry/init 用 T_D1。
 * 注：daily-entry 轮次需先经 m/daily-entry/init 初始化（一次调用创建 4 大区轮次，幂等）。
 */
class ConfigInit001 extends TestBaseClass {
  private maps: BusMapInfo[] = [];

  constructor() {
    super();
    this.total = 17;
  }

  protected async run(): Promise<void> {
    await this.check('/config 返回活动开始/结束时间与 4 个大区（T_PRE）', async (): Promise<CheckResult> => {
      const cfg = await this.didibus.config(USER_A, LOCALE, localIso(LOCALE, T_PRE));
      const start = int(cfg['startTime']);
      const finish = int(cfg['finishTime']);
      const locales = ((cfg['enableLocales'] ?? []) as unknown[]).map(String).sort();
      const localesOk = LOCALES.every((l) => locales.includes(l)) || LOCALES.every((l) => locales.map((x) => x.toLowerCase()).includes(l));
      return {
        expect: `start=${EXPECT_START_MS}, finish=${EXPECT_FINISH_MS}, locales 含 ${LOCALES.join('/')}`,
        real: `start=${start}, finish=${finish}, locales=${locales.join(',')}`,
        pass: start === EXPECT_START_MS && finish === EXPECT_FINISH_MS && localesOk,
      };
    });

    await this.check('active_coin 存在 N-A-DIDIBUS 且 4 大区 locale_config 齐全', async (): Promise<CheckResult> => {
      const rows = await this.didibus.queryActiveCoin();
      if (rows.length === 0) {
        return { expect: 'active_coin 存在 N-A-DIDIBUS', real: '无记录', pass: false, message: '预置数据缺失：active_coin' };
      }
      const lc = String(rows[0]['locale_config'] ?? '');
      const missing = LOCALES.filter((l) => !lc.includes(`"${l}"`));
      return {
        expect: `locale_config 含 ${LOCALES.join('/')}`,
        real: missing.length === 0 ? '齐全' : `缺 ${missing.join('/')}`,
        pass: missing.length === 0,
      };
    });

    await this.check('mod_common_event 存在 DIDIBUS_MILEAGE', async (): Promise<CheckResult> => {
      const rows = await this.didibus.queryEvent(MILEAGE_NAME);
      return {
        expect: '1 条',
        real: `${rows.length} 条`,
        pass: rows.length === 1,
        message: rows.length === 0 ? '预置数据缺失：mod_common_event DIDIBUS_MILEAGE' : undefined,
      };
    });

    await this.check('里程条目：stage=0、EVENT、mod=VIEW、权重和=1.0（100% 必得）', async (): Promise<CheckResult> => {
      const rows = await this.didibus.queryAwardConfig(MILEAGE_NAME);
      if (rows.length === 0) {
        return { expect: '≥1 条里程配置', real: '0 条', pass: false, message: `预置数据缺失：mod_common_award ${MILEAGE_NAME}` };
      }
      const bad = rows.filter((r) => int(r['stage']) !== 0 || String(r['award_type']) !== 'EVENT' || String(r['mod']) !== 'VIEW');
      const weightSum = rows.reduce((s, r) => s + Number(r['weight'] ?? 0), 0);
      const tiers = rows.map((r) => int(r['award_count'])).sort((a, b) => a - b);
      const ok = bad.length === 0 && Math.abs(weightSum - 1) < 1e-6;
      return {
        expect: '全部 stage=0/EVENT/VIEW，权重和=1.0',
        real: `档位=${JSON.stringify(tiers)}，权重和=${weightSum.toFixed(4)}${bad.length ? '，存在类型不符条目' : ''}`,
        pass: ok,
      };
    });

    await this.checkPool(POOL_NAME_NORMAL);
    await this.checkPool(POOL_NAME_FLYING);

    await this.act('获取巴士地图配置（/m/bus/detail @T_D1）', async () => {
      try {
        const d = await this.didibus.busDetail(USER_A, LOCALE, localIso(LOCALE, T_D1));
        const maps = (d['maps'] ?? []) as Array<Record<string, unknown>>;
        if (!Array.isArray(maps) || maps.length === 0) throw new Error('bus/detail 未返回地图配置（maps 为空）');
        this.maps = maps.map((m) => ({
          name: String(m['name']),
          awardName: String(m['awardName'] ?? `bus.${m['name']}`),
          points: ((m['points'] ?? []) as Array<Record<string, unknown>>).map((p) => ({ stage: int(p['stage']) })),
        }));
        this.log(`地图配置：${this.maps.map((m) => `${m.name}(${m.awardName}, ${m.points.length}点)`).join('，')}`);
      } catch (e) {
        if ((e as Error).message.includes('Activity is not active')) {
          this.maps = [];
          this.skip('活动未进入可测窗口（真实时间需 2026-09-16 ~ 2026-10-10），无法读取地图配置');
        }
        throw e;
      }
    });

    await this.check('每个地图 awardName × 每个探索点 stage 均有 ≥1 条奖励配置', async (): Promise<CheckResult> => {
      if (this.maps.length === 0) this.skip('活动未进入可测窗口，未获取到地图配置');
      const missing: string[] = [];
      for (const m of this.maps) {
        const rows = await this.didibus.queryAwardConfig(m.awardName);
        for (const p of m.points) {
          const hit = rows.filter((r) => int(r['stage']) === p.stage);
          if (hit.length === 0) missing.push(`${m.awardName}#${p.stage}`);
        }
      }
      return {
        expect: '全部探索点有奖励配置',
        real: missing.length === 0 ? '齐全' : `缺失：${missing.join(',')}`,
        pass: missing.length === 0,
        message: missing.length > 0 ? '预置数据缺失：mod_common_award 探索点奖励' : undefined,
      };
    });

    await this.check('每日进入奖励：daily-entry 存在且 award_type=ACTIVE_COIN、count>0', async (): Promise<CheckResult> => {
      const rows = (await this.didibus.queryAwardConfig(DAILY_ENTRY_AWARD)).filter((r) => int(r['stage']) === 0);
      if (rows.length === 0) {
        return { expect: 'daily-entry stage=0 存在', real: '0 条', pass: false, message: `预置数据缺失：mod_common_award ${DAILY_ENTRY_AWARD}` };
      }
      const ok = rows.some((r) => String(r['award_type']) === 'ACTIVE_COIN' && int(r['award_count']) > 0);
      return {
        expect: 'ACTIVE_COIN 且 award_count>0',
        real: rows.map((r) => `${r['award_type']}×${r['award_count']}`).join(','),
        pass: ok,
      };
    });

    await this.act('清理轮次并调用 /p/init 初始化（round=1 @T_D1）', async () => {
      await this.didibus.cleanRounds();
      await this.didibus.initActivity(USER_A, LOCALE, localIso(LOCALE, T_D1));
    });

    await this.check('总榜轮次：gift-send/gift-recv 每大区各 1 条、status=100、开始=活动开始、结束=本地 10-02 23:59:59', async (): Promise<CheckResult> => {
      const bad: string[] = [];
      for (const topic of [TOPIC_SEND, TOPIC_RECV]) {
        for (const l of LOCALES) {
          const rows = (await this.didibus.queryCommonRounds(topic)).filter((r) => String(r['key']) === '-');
          const mine = rows.filter((r) => String(r['locale']).toLowerCase() === l);
          if (mine.length !== 1) { bad.push(`${topic}/${l}: ${mine.length} 条`); continue; }
          const r = mine[0];
          const st = int(r['start_time']);
          const ft = int(r['finish_time']);
          if (int(r['status']) !== 100) bad.push(`${topic}/${l}: status=${r['status']}`);
          if (st !== EXPECT_START_MS) bad.push(`${topic}/${l}: 开始=${new Date(st).toISOString()}≠活动开始`);
          if (ft !== localAtMs(l, '2026-10-02 23:59:59')) bad.push(`${topic}/${l}: 结束≠本地 10-02 23:59:59`);
        }
      }
      return {
        expect: '8 条（2 榜 × 4 大区），status=100，开始=活动开始（固定北京），结束=各大区本地',
        real: bad.length === 0 ? '8 条全部符合' : bad.join('；'),
        pass: bad.length === 0,
      };
    });

    await this.check('日榜轮次：gift-send 每大区 10 条（20260923~20261002）、status=100、起止=本地日界', async (): Promise<CheckResult> => {
      return this.checkDailyRounds(TOPIC_SEND);
    });

    await this.check('任务轮次：daily-entry 每大区 10 条（20260923~20261002）、status=100、起止=本地日界', async (): Promise<CheckResult> => {
      return this.checkDailyRounds(DAILY_ENTRY_AWARD);
    });

    await this.checkRankAward(AWARD_SEND_TOTAL, [1, 2, 3]);
    await this.checkRankAward(AWARD_SEND_DAILY, [1, 2, 3, 4, 5, 6]);
    await this.checkRankAward(AWARD_RECV, [1, 2, 3]);
    await this.checkRankAward(AWARD_RECV_CONTRIBUTOR, [1, 2, 3]);
  }

  private async checkPool(name: string): Promise<void> {
    await this.check(`奖池 ${name}：有条目且权重和 ≤ baseTotal(1.0)`, async (): Promise<CheckResult> => {
      const rows = await this.didibus.queryAwardConfig(name);
      if (rows.length === 0) {
        return { expect: '≥1 条奖池配置', real: '0 条', pass: false, message: `预置数据缺失：mod_common_award ${name}` };
      }
      const weightSum = rows.reduce((s, r) => s + Number(r['weight'] ?? 0), 0);
      const bad = rows.filter((r) => int(r['stage']) !== 0);
      return {
        expect: '条目≥1、stage=0、权重和≤1.0',
        real: `${rows.length} 条，权重和=${weightSum.toFixed(4)}`,
        pass: bad.length === 0 && weightSum <= 1 + 1e-6,
      };
    });
  }

  private async checkDailyRounds(topic: string): Promise<CheckResult> {
    const rows = (await this.didibus.queryCommonRounds(topic)).filter((r) => String(r['key']) !== '-');
    const bad: string[] = [];
    for (const l of LOCALES) {
      const mine = rows.filter((r) => String(r['locale']).toLowerCase() === l);
      if (mine.length !== 10) bad.push(`${topic}/${l}: ${mine.length} 条（期望 10）`);
      const byKey = new Map(mine.map((r) => [String(r['key']), r]));
      for (let i = 0; i < 10; i++) {
        const day = new Date(Date.UTC(2026, 8, 23 + i)).toISOString().slice(0, 10);
        const key = day.replaceAll('-', '');
        const r = byKey.get(key);
        if (!r) { bad.push(`${topic}/${l}: 缺轮次 ${key}`); continue; }
        if (int(r['status']) !== 100) bad.push(`${topic}/${l}/${key}: status=${r['status']}`);
        const midnight = localAtMs(l, `${day} 00:00:00`);
        const st = int(r['start_time']);
        const ft = int(r['finish_time']);
        if (st !== midnight) bad.push(`${topic}/${l}/${key}: 开始=${new Date(st).toISOString()}≠本地零点`);
        if (ft < midnight + 86399000 || ft > midnight + 86400000) bad.push(`${topic}/${l}/${key}: 结束=${new Date(ft).toISOString()}≠本日日终`);
      }
    }
    return {
      expect: '每大区 10 条（09-23~10-02）、status=100、开始=本地零点、结束=本日日终',
      real: bad.length === 0 ? '40 条全部符合' : bad.slice(0, 8).join('；'),
      pass: bad.length === 0,
    };
  }

  private async checkRankAward(name: string, stages: number[]): Promise<void> {
    await this.check(`榜单奖励 ${name}：stage=${stages.join('/')} 齐全`, async (): Promise<CheckResult> => {
      const rows: MysqlRow[] = await this.didibus.queryAwardConfig(name);
      const missing = stages.filter((s) => !rows.some((r) => int(r['stage']) === s));
      const detail = stages.map((s) => {
        const r = rows.find((x) => int(x['stage']) === s);
        return r ? `stage${s}:${r['award_type']}/${r['mod']}` : `stage${s}:缺失`;
      });
      return {
        expect: `stage ${stages.join('/')} 各 ≥1 条`,
        real: detail.join('，'),
        pass: missing.length === 0,
        message: missing.length > 0 ? `预置数据缺失：mod_common_award ${name} stage=${missing.join('/')}` : undefined,
      };
    });
  }
}

await new ConfigInit001().execute();
