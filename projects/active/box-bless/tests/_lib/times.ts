/**
 * box-bless 模拟时间工具。
 * 活动时间（doc yaml）：2026-11-01 00:00 ~ 2026-11-30 23:59:59（各大区本地，R 后缀）。
 * ⚠️ 测试环境实测（2026-10-22 curl 探测）：Nacos 实际上传的活动窗口为 2026-10-01 ~ 2026-11-30
 * （/config startTime=in/vi 本地 10-01 00:00、finish=in/vi 本地 11-30 23:59:59），
 * 当前生效轮次只覆盖 10 月（11-02 送礼 value=0 不落库，10-26 正常累加）——
 * 以下时间代号按实测可用窗口取值；若 Nacos 配置调整为 11 月窗口，需同步修改本文件。
 * 规则（见 CASES.md「模拟时间约定」）：
 * - 业务接口/消息的模拟时间用【大区本地时间】（本文件的 T_INIT/T_D1/T_D2/T_OUT）
 * - __cron 触发的模拟时间用【北京时间】且精确到 cron 分钟（CRON_*）
 * - 所有调用必须显式携带 debugTimestamp（yyyy-MM-ddTHH:mm:ss±HH:mm，不支持毫秒/空格），
 *   解析失败静默回退真实时间——冒烟执行时活动未开始，不带时间会被全部过滤
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

/** initTime 之后、轮次内：配置校验、/p/init 轮次初始化 */
export const T_INIT = '2026-10-26 12:00:00';
/** 活动第 1 天：正式业务访问（累加/发放/生效/查询） */
export const T_D1 = '2026-10-27 18:00:00';
/** 活动第 2 天：跨天场景、衰减判定 */
export const T_D2 = '2026-10-28 10:00:00';
/** 第 2 天日切后：「今日已送」对照造数（006） */
export const T_D2_0001 = '2026-10-28 00:01:00';
/** 活动期外（开始前）：拒绝场景，消息不累加 */
export const T_OUT = '2026-09-28 12:00:00';

// ---- __cron 触发模拟时间（北京时间，精确到 cron 分钟） ----

/** 赐福值衰减（D1→D2 日切）：ko=10-27 23:05、ph/ar=10-28 00:05、in/vi=10-28 01:05 */
export const CRON_DECAY_KO = '2026-10-27T23:05:00+08:00';
export const CRON_DECAY_PH = '2026-10-28T00:05:00+08:00';
export const CRON_DECAY_INVI = '2026-10-28T01:05:00+08:00';
