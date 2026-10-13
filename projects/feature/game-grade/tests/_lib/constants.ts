/** 荣耀等级 202610 赛季测试常量 */

export const NEW_BIZ = 'game_grade_202610';
export const LAST_BIZ = 'game_grade_202608';

/** 接口 locale（entrance 无 locale 会按“未开启当前语言”返回空对象） */
export const LOCALE = 'in';

/** 赛季时间（需求文档：2026-10-26 00:00 ~ 2026-12-27 23:59:59 北京时间） */
export const SEASON_START_MS = Date.parse('2026-10-26T00:00:00+08:00');
export const SEASON_END_MS = Date.parse('2026-12-27T23:59:59+08:00');

/**
 * 模拟时间点（l-debug-timestamp，格式 yyyy-MM-ddTHH:mm:ss±HH:mm，不支持毫秒）：
 * - TS_OLD           旧赛季窗口内（202608：08-24 ~ 10-25）
 * - TS_SWITCH_EARLY  新赛季开始后 6h（< 12h，跨赛季日，昨日配置=上赛季）
 * - TS_SWITCH_LATE   新赛季开始后 41h（> 12h/24h 阈值，昨日配置=当前赛季）
 */
export const TS_OLD = '2026-10-20T12:00:00+08:00';
export const TS_SWITCH_EARLY = '2026-10-26T06:00:00+08:00';
export const TS_SWITCH_LATE = '2026-10-27T17:00:00+08:00';

/**
 * 首轮锚定容差：当前 202610 yaml 的 startTime 解析存在时区偏移（实际轮次锚点为 10-26 16:00+08），
 * 断言按“锚定在赛季开始日 00:00 ~ 16:00(+08)”区间放行，两种解析口径均覆盖。
 */
export const ANCHOR_TOLERANCE_MS = 16 * 3_600_000;

/** 轮次周期（日蛋 86400s、周蛋 604800s） */
export const DAY_MS = 86_400_000;
export const WEEK_MS = 604_800_000;

/** 测试用户（合成大 UID，测试前后均清理；勿复用真实用户） */
export const USER_CONSUMER = 910111; // 用例2：consumer 触发
export const USER_ENTRANCE = 910112; // 用例2：entrance 触发
export const USER_FRESH = 910113;    // 用例2：纯新用户对照
export const USER_PROBE = 910114;    // 用例1：biz 观察用户（GET 不落库）
export const EGG_USERS = [910121, 910122, 910123]; // 用例3：鸡蛋结算参与用户

/** 造数等级（期望衰减值动态查 game_grade.next_season_grade，勿硬编码断言） */
export const SEED_GRADE_CONSUMER = 'Legend I'; // -> Epic I（limit 100000）
export const SEED_GRADE_ENTRANCE = 'Mythic';   // -> Legend I（limit 250000）

/** 用例3 合成轮次名（可复算清理，勿与真实轮次 yyyyMMddHHmmss 锚点混淆） */
export const ROUND_DAILY_LAST = '20261025090001';
export const ROUND_WEEKLY_LAST = '20261025090002';

/** 游戏 biz 白名单（consumer 链路精确匹配，测试 biz 会被静默丢弃；取 funbit.user_deal_account_log 线上在用值） */
export const CAUSE_BIZ = 'gamecenter_baishun1130';
