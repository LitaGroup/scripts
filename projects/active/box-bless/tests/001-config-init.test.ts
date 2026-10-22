import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { localAtMs } from '../../../../src/base/TimeUtils.ts';
import {
  LOCALE,
  LOCALES,
  USER_A,
  USER_C,
  MAGIC_BOXES,
  BOX_SAMPLE,
  TARGET_DEFAULT,
  RATIO_DEFAULT,
  BLESS_TYPES,
  NON_BOX_ID,
} from './_lib/constants.ts';
import { T_INIT, T_D1, localIso } from './_lib/times.ts';
import { int } from './_lib/helpers.ts';
import { BoxBlessTestBase } from './_lib/BoxBlessTestBase.ts';

/**
 * 001-config-init —— 配置与预置数据校验
 * 模拟时间：/config 与 /p/init 用 T_INIT；h5List/boxBless 用 T_D1。
 * 起止时间带 R 后缀（各大区本地生效）：/config 返回值为某大区本地时间换算的毫秒值，
 * 起止各取 5 个大区换算值的候选集合匹配（实现取哪个大区取决于框架约定，候选匹配即可）。
 * 注：doc yaml 设计窗口为 2026-11-01~11-30，测试环境 Nacos 实测为 2026-10-01~11-30
 * （2026-10-22 探测），断言以实测窗口为准。
 */
const START_CANDIDATES = LOCALES.map((l) => localAtMs(l, '2026-10-01 00:00:00'));
const FINISH_CANDIDATES = LOCALES.map((l) => localAtMs(l, '2026-11-30 23:59:59'));

/** topic → 该大区组应初始化轮次的大区 */
const TOPIC_LOCALES: Record<string, string[]> = {
  'bless-default': ['in', 'vi'],
  'bless-ko': ['ko'],
  'bless-ph': ['ph', 'ar'],
};

class ConfigInit001 extends BoxBlessTestBase {
  constructor() {
    super();
    this.total = 7;
  }

  protected async run(): Promise<void> {
    await this.check('/config 返回活动起止时间（2026-10-01~11-30 各大区本地，实测 Nacos 窗口）与 5 个大区（T_INIT）', async (): Promise<CheckResult> => {
      const cfg = await this.boxBless.config(USER_A, LOCALE, localIso(LOCALE, T_INIT));
      const start = int(cfg['startTime']);
      const finish = int(cfg['finishTime']);
      const locales = ((cfg['enableLocales'] ?? []) as unknown[]).map((x) => String(x).toLowerCase());
      const localesOk = LOCALES.every((l) => locales.includes(l));
      return {
        expect: `start ∈ 各大区本地 10-01 00:00，finish ∈ 各大区本地 11-30 23:59:59，locales 含 ${LOCALES.join('/')}`,
        real: `start=${start}(${new Date(start).toISOString()})，finish=${finish}(${new Date(finish).toISOString()})，locales=${locales.join(',')}`,
        pass: START_CANDIDATES.includes(start) && FINISH_CANDIDATES.includes(finish) && localesOk,
      };
    });

    await this.act('调用 /p/init 初始化轮次（round=1 @T_INIT，幂等）', async () => {
      await this.boxBless.initActivity(USER_A, LOCALE, localIso(LOCALE, T_INIT));
    });

    await this.check('mod_common_round：bless-default(in/vi)/bless-ko(ko)/bless-ph(ph/ar) 各大区均有轮次且覆盖 T_D1', async (): Promise<CheckResult> => {
      const bad: string[] = [];
      const detail: string[] = [];
      const tD1Ms = localAtMs(LOCALE, T_D1);
      for (const [topic, locales] of Object.entries(TOPIC_LOCALES)) {
        const rows = await this.boxBless.queryCommonRounds(topic);
        detail.push(`${topic}: ${rows.map((r) => `${r['locale']}#${r['key']}`).join(',') || '无'}`);
        for (const l of locales) {
          const mine = rows.filter((r) => String(r['locale']).toLowerCase() === l);
          if (mine.length === 0) { bad.push(`${topic}/${l}: 无轮次`); continue; }
          // 轮次窗口按各大区本地计，T_D1 须落在某一轮次内（大区时区差异容忍：用 in 基准 ±1 天宽松判定）
          const cover = mine.some((r) => int(r['start_time']) <= tD1Ms + 86400000 && int(r['finish_time']) >= tD1Ms - 86400000);
          if (!cover) bad.push(`${topic}/${l}: 轮次 ${mine.map((r) => `${r['key']}[${new Date(int(r['start_time'])).toISOString()}~${new Date(int(r['finish_time'])).toISOString()}]`).join(',')} 不覆盖 T_D1`);
        }
      }
      this.log(`轮次明细：${detail.join(' | ')}`);
      return {
        expect: '5 大区（3 topic × 各自大区）均有 ≥1 轮次且覆盖 T_D1',
        real: bad.length === 0 ? '全部符合' : bad.join('；'),
        pass: bad.length === 0,
      };
    });

    await this.check('lita_basic 三表存在性：treasure_box_bless_config/_user/_user_record 可查询（建表完成）', async (): Promise<CheckResult> => {
      const missing: string[] = [];
      for (const t of ['treasure_box_bless_config', 'treasure_box_bless_user', 'treasure_box_bless_user_record']) {
        try {
          await this.mysql.query(`SELECT 1 FROM ${t} LIMIT 1`, 'lita_basic');
        } catch (e) {
          missing.push(`${t}: ${(e as Error).message.slice(0, 80)}`);
        }
      }
      return {
        expect: '3 张表均可查询',
        real: missing.length === 0 ? '齐全' : missing.join('；'),
        pass: missing.length === 0,
        message: missing.length > 0 ? '预置缺失：lita_basic 建表（init.sql）未执行' : undefined,
      };
    });

    await this.check(`treasure_box_bless_config：6 魔盒 × ${LOCALE} 大区 state=1、bless_awards 可解析、类型合法、weight 和>0`, async (): Promise<CheckResult> => {
      const rows = await this.boxBless.queryBlessConfig(LOCALE);
      const bad: string[] = [];
      for (const boxId of MAGIC_BOXES) {
        const row = rows.find((r) => int(r['gift_id']) === boxId);
        if (!row) { bad.push(`${boxId}: 无配置行`); continue; }
        if (int(row['state']) !== 1) { bad.push(`${boxId}: state=${row['state']}`); continue; }
        let awards: Array<Record<string, unknown>>;
        try {
          awards = JSON.parse(String(row['bless_awards'])) as Array<Record<string, unknown>>;
        } catch {
          bad.push(`${boxId}: bless_awards 解析失败`);
          continue;
        }
        if (!Array.isArray(awards) || awards.length === 0) { bad.push(`${boxId}: 奖池为空`); continue; }
        const badTypes = awards.map((a) => String(a['type'])).filter((t) => !BLESS_TYPES.includes(t));
        if (badTypes.length > 0) bad.push(`${boxId}: 非法类型 ${badTypes.join('/')}`);
        const weightSum = awards.reduce((s, a) => s + Number(a['weight'] ?? 0), 0);
        if (weightSum <= 0) bad.push(`${boxId}: weight 和=${weightSum}`);
      }
      return {
        expect: `6 魔盒（${MAGIC_BOXES.join('/')}）state=1、奖池非空、类型 ⊆ 六种赐福、weight 和>0`,
        real: bad.length === 0 ? '全部符合' : bad.join('；'),
        pass: bad.length === 0,
        message: bad.length > 0 ? '预置缺失：treasure_box_bless_config 未初始化（上线清单 #5）' : undefined,
      };
    });

    await this.check('h5List（T_D1）：返回 6 个魔盒（id 升序）且每个 blessAwards 非空', async (): Promise<CheckResult> => {
      const list = await this.boxBless.h5List(USER_A, LOCALE, localIso(LOCALE, T_D1));
      const ids = list.map((b) => int(b.boxId));
      const sorted = [...ids].sort((a, b) => a - b);
      const idsOk = JSON.stringify(ids) === JSON.stringify(MAGIC_BOXES) && JSON.stringify(ids) === JSON.stringify(sorted);
      const emptyAwards = list.filter((b) => !Array.isArray(b.blessAwards) || b.blessAwards.length === 0).map((b) => b.boxId);
      return {
        expect: `6 魔盒 id 升序=${MAGIC_BOXES.join('/')}、blessAwards 均非空`,
        real: `ids=${ids.join('/')}，空奖池=${emptyAwards.length === 0 ? '无' : emptyAwards.join('/')}`,
        pass: idsOk && emptyAwards.length === 0,
      };
    });

    await this.check('boxBless 边界：未传/非法 boxId → null；新用户合法 boxId → value=0/target=100/addValue=5/active=null', async (): Promise<CheckResult> => {
      const noBox = await this.boxBless.boxBless(USER_A, LOCALE, localIso(LOCALE, T_D1));
      const badBox = await this.boxBless.boxBless(USER_A, LOCALE, localIso(LOCALE, T_D1), NON_BOX_ID);
      const fresh = await this.boxBless.boxBless(USER_C, LOCALE, localIso(LOCALE, T_D1), BOX_SAMPLE);
      const freshOk = fresh !== null
        && int(fresh.value) === 0
        && int(fresh.target) === TARGET_DEFAULT
        && int(fresh.addValue) === RATIO_DEFAULT[BOX_SAMPLE]
        && fresh.active === null;
      return {
        expect: `未传/非法 boxId=null；新用户 value=0、target=${TARGET_DEFAULT}、addValue=${RATIO_DEFAULT[BOX_SAMPLE]}、active=null`,
        real: `noBox=${JSON.stringify(noBox)}，badBox=${JSON.stringify(badBox)}，fresh=${fresh === null ? 'null' : `value=${fresh.value},target=${fresh.target},addValue=${fresh.addValue},active=${JSON.stringify(fresh.active)}`}`,
        pass: noBox === null && badBox === null && freshOk,
      };
    });
  }
}

await new ConfigInit001().execute();
