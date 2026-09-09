/**
 * didibus 模拟时间工具。
 * 活动时间：开始 2026-09-23 14:00（北京时间，固定）；结束 2026-10-02 23:59:59（各大区本地，R 后缀）。
 * 规则（见 CASES.md「模拟时间约定」）：
 * - 业务接口/消息的模拟时间用【大区本地时间】（本文件的 T_PRE/T_D1/T_D2/T_OUT）
 * - __cron 触发的模拟时间用【北京时间】且精确到 cron 分钟（CRON_*）
 * - 框架活动有效期校验走真实时间（±7d 宽限）：业务接口仅真实时间 ∈ 2026-09-16 ~ 2026-10-10 可用
 */

const LOCALE_OFFSET: Record<string, string> = { in: '+07:00', vi: '+07:00', ph: '+08:00', ko: '+09:00', ar: '+00:00' };

/** 大区本地时间 → ISO 字符串（带大区时区偏移） */
export function localIso(locale: string, dtStr: string): string {
  const offset = LOCALE_OFFSET[locale] ?? '+08:00';
  return dtStr.replace(' ', 'T') + offset;
}

/** 大区本地时间 → 毫秒时间戳 */
export function localTs(locale: string, dtStr: string): number {
  return Date.parse(localIso(locale, dtStr));
}

// ---- 业务访问模拟时间（大区本地时间） ----

/** 活动开始前：初始化/配置校验（各大区本地 12:00 均早于北京 14:00 开始） */
export const T_PRE = '2026-09-23 12:00:00';
/** 活动第 1 天：正式业务访问 */
export const T_D1 = '2026-09-23 18:00:00';
/** 活动第 2 天：跨天场景 */
export const T_D2 = '2026-09-24 10:00:00';
/** 活动期外（开始前，±7d 宽限内） */
export const T_OUT_BEFORE = '2026-09-19 12:00:00';
/** 活动期外（结束后，±7d 宽限内） */
export const T_OUT_AFTER = '2026-10-05 12:00:00';

/** 第 1 天 / 第 2 天日榜 dayKey（yyyyMMdd，大区本地） */
export const DAY1_KEY = '20260923';
export const DAY2_KEY = '20260924';

// ---- __cron 触发模拟时间（北京时间，精确到 cron 分钟） ----

/** 日榜结算（第 1 天 20260923）：ko=当日23:05、ph=次日00:05、in/vi=次日01:05 */
export const CRON_DAILY_KO = '2026-09-23T23:05:00+08:00';
export const CRON_DAILY_PH = '2026-09-24T00:05:00+08:00';
export const CRON_DAILY_INVI = '2026-09-24T01:05:00+08:00';
/** 日榜结算（第 2 天 20260924，ko 时区触发点） */
export const CRON_DAILY_KO_DAY2 = '2026-09-24T23:05:00+08:00';

/** 总榜结算：ko=10-02 23:05、ph=10-03 00:05、in/vi=10-03 01:05 */
export const CRON_TOTAL_KO = '2026-10-02T23:05:00+08:00';
export const CRON_TOTAL_PH = '2026-10-03T00:05:00+08:00';
export const CRON_TOTAL_INVI = '2026-10-03T01:05:00+08:00';
/** 总榜结算负例：活动期内（总榜未结束） */
export const CRON_TOTAL_EARLY = '2026-09-26T00:05:00+08:00';
