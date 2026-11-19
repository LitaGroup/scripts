/**
 * 2026 年度盛典-年度回忆 接口测试常量
 *
 * 预期来源：
 * - PRD #3399《【PRD】2026年度盛典-年度回忆》
 * - 需求澄清 #3454（C00–C32）
 * - 接口/技术方案 TK-0383 API.md / TECH_DESIGN.md（v2.2 配置复用版）
 * - 实现说明 TK-0386 API.md / SELF_TEST.md
 * - stats 表 DDL 见 TK-0317 HANDOFF 第六节（61 列）
 */

/** 完整 biz（Nacos dataId=annual-review-v202612.yaml） */
export const FULL_BIZ = 'annual-review-v202612';
/** 兼容短路径 alias（main.yaml init.alias） */
export const ALIAS = 'annual-review';

export const FULL_GET = `/active/v3/${FULL_BIZ}/get`;
export const SHORT_GET = `/active/v3/${ALIAS}/get`;
export const FULL_CONFIG = `/active/v3/${FULL_BIZ}/config`;
export const SHORT_CONFIG = `/active/v3/${ALIAS}/config`;

/** 活动时间（Nacos 配置绝对值：startTime / finishTime） */
export const ACTIVITY_START_MS = 1797177600000; // 2026-12-14T00:00:00+08:00
export const ACTIVITY_FINISH_MS = 1830268799000; // 2027-12-31T23:59:59+08:00

/** 活动期内（含首日中午） */
export const T_IN_WINDOW = '2026-12-14T12:00:00+08:00';
/** 活动开始时刻（边界，含） */
export const T_START = '2026-12-14T00:00:00+08:00';
/** 活动结束时刻（边界，含） */
export const T_FINISH = '2027-12-31T23:59:59+08:00';
/** 开始前 1 秒（7 天链接容错内，业务层判非活动期） */
export const T_BEFORE_START_1S = '2026-12-13T23:59:59+08:00';
/** 开始前整 7 天（容错边界，含） */
export const T_START_MINUS_7D = '2026-12-07T00:00:00+08:00';
/** 开始前 7 天 + 1 秒（超出容错） */
export const T_START_MINUS_7D_1S = '2026-12-06T23:59:59+08:00';
/** 结束后 1 秒（7 天容错内，业务层判非活动期） */
export const T_AFTER_FINISH_1S = '2028-01-01T00:00:00+08:00';
/** 结束后整 7 天（容错边界，含） */
export const T_FINISH_PLUS_7D = '2028-01-07T23:59:59+08:00';
/** 结束后 7 天 + 1 秒（超出容错） */
export const T_FINISH_PLUS_7D_1S = '2028-01-08T00:00:00+08:00';

/** 六周年活动（回归用） */
export const ANNIVERSARY_V202608_BIZ = 'anniversary-v202608';
export const ANNIVERSARY_V202608_GET = `/active/v3/${ANNIVERSARY_V202608_BIZ}/get`;
export const ANNIVERSARY_V202608_CONFIG = `/active/v3/${ANNIVERSARY_V202608_BIZ}/config`;
/** 六周年活动期内（配置 startTime=2026-08-03，finishTime=2026-08-31） */
export const T_ANNIVERSARY_IN_WINDOW = '2026-08-20T00:00:00+08:00';
/** PK 活动（回归用） */
export const PK_V202608_CONFIG = '/active/v3/pk-v202608/config';

/** 测试用户：宽表有行且字段较全（2026 宽表 id=用户 UID） */
export const USER_RICH = 21;
/** 测试用户：官方账号（宽表有行，仅基础/礼物字段） */
export const USER_OFFICIAL = 2;
/** 测试用户：宽表无行 */
export const USER_NO_ROW = 999999999;

export const LOCALE_IN = 'in';
/** 配置 enableLocales 的六个大区 */
export const ENABLED_LOCALES = ['in', 'vi', 'th', 'ko', 'zh', 'ph'];
/** 配置未启用的大区 */
export const UNSUPPORTED_LOCALES = ['ar', 'en'];

/**
 * stats 宽表 61 列（字段名与 DDL 完全一致，顺序按 TK-0317 DDL）
 * 来源：TK-0317 HANDOFF「完整 SQL」CREATE TABLE lita.lita_2026_year_in_review
 */
export const USER_FIELDS_61: string[] = [
  'id',
  'no',
  'nick',
  'locale',
  'is_player',
  'register_date',
  'register_day',
  'active_day',
  'active_time',
  'first_chats_user_id',
  'most_chats_user_id',
  'most_chats_count',
  'chats_special_time',
  'first_order_user_id',
  'order_most_user_id',
  'skill_id',
  'skill_order_count',
  'complete_most_player_id',
  'sender_uv',
  'first_sender_id',
  'most_expensive_sender_id',
  'most_expensive_sender_price',
  'receiver_most_expensive_gift',
  'receiver_most_expensive_gift_price',
  'first_receiver_id',
  'most_expensive_receiver_id',
  'most_expensive_receiver_gift_price',
  'enter_super_luxury_club_count',
  'become_bigr_time',
  'voice_special_time',
  'voice_room_id',
  'voice_stay_time',
  'first_sender_gift_id',
  'first_receiver_gift_id',
  'receiver_most_expensive_sender_id',
  'complete_order_total',
  'most_player_order_count',
  'complete_skill_count',
  'social_game_rounds',
  'social_game_start_rounds',
  'most_social_game',
  'first_relation_type',
  'first_relation_user_id',
  'first_relation_time',
  'top_value_relation_type',
  'top_value_relation_level',
  'top_value_relation_user_id',
  'top_value_relation_value',
  'top_value_relation_time',
  'longest_relation_type',
  'longest_relation_user_id',
  'longest_relation_days',
  'gift_light_count',
  'praise_count',
  'mic_days',
  'room_days',
  'identity_code',
  'identity_name',
  'identity_priority',
  'identity_metric_name',
  'identity_metric_value',
];

/** DDL 中的数值列（BIGINT / INT / DOUBLE / DECIMAL） */
export const NUMERIC_FIELDS = new Set<string>([
  'id',
  'no',
  'register_day',
  'active_day',
  'first_chats_user_id',
  'most_chats_user_id',
  'most_chats_count',
  'first_order_user_id',
  'order_most_user_id',
  'skill_id',
  'skill_order_count',
  'complete_most_player_id',
  'sender_uv',
  'first_sender_id',
  'most_expensive_sender_id',
  'most_expensive_sender_price',
  'receiver_most_expensive_gift',
  'receiver_most_expensive_gift_price',
  'first_receiver_id',
  'most_expensive_receiver_id',
  'most_expensive_receiver_gift_price',
  'enter_super_luxury_club_count',
  'voice_room_id',
  'voice_stay_time',
  'first_sender_gift_id',
  'first_receiver_gift_id',
  'receiver_most_expensive_sender_id',
  'complete_order_total',
  'most_player_order_count',
  'complete_skill_count',
  'social_game_rounds',
  'social_game_start_rounds',
  'top_value_relation_level',
  'top_value_relation_user_id',
  'top_value_relation_value',
  'longest_relation_user_id',
  'longest_relation_days',
  'gift_light_count',
  'praise_count',
  'mic_days',
  'room_days',
  'identity_priority',
]);

/** DDL 中的字符串列（STRING） */
export const STRING_FIELDS = new Set<string>([
  'nick',
  'locale',
  'active_time',
  'chats_special_time',
  'voice_special_time',
  'most_social_game',
  'first_relation_type',
  'first_relation_time',
  'top_value_relation_type',
  'top_value_relation_time',
  'longest_relation_type',
  'identity_code',
  'identity_name',
  'identity_metric_name',
  'identity_metric_value',
]);

/**
 * 日期/时间列（DATE / DATETIME）：接口文档明确「JSON 中可能是时间戳数字或字符串，联调确认」，
 * 因此仅要求非空时为 string 或 number，不做格式强约束。
 */
export const DATETIME_FIELDS = new Set<string>(['register_date', 'become_bigr_time']);

/** 身份卡 12 个 code / 名称 / 优先级（PRD 第七章 + TK-0383 API.md 3.8） */
export const IDENTITY_MAP: Record<string, { name: string; priority: number }> = {
  lita_bigr: { name: 'Lita超豪', priority: 1 },
  gift_collector: { name: '礼物收藏家', priority: 2 },
  super_partner: { name: '超级拍档', priority: 3 },
  popular_player: { name: '人气陪玩师', priority: 4 },
  lita_old_friend: { name: 'Lita老朋友', priority: 5 },
  annual_regular: { name: '年度常客', priority: 6 },
  happy_initiator: { name: '快乐发起人', priority: 7 },
  fun_explorer: { name: '乐趣探索者', priority: 8 },
  party_star: { name: '派对之星', priority: 9 },
  party_regular: { name: '派对常客', priority: 10 },
  warm_responder: { name: '暖心回应者', priority: 11 },
  annual_member: { name: '年度同行者', priority: 12 },
};

/** PRD 活跃时段四个枚举 */
export const ACTIVE_TIME_RANGES = ['00:00-06:00', '06:00-12:00', '12:00-18:00', '18:00-24:00'];

/** PRD 拍拍关系五种类型 */
export const RELATION_TYPES = ['cp', 'friend', 'bestie', 'brother', 'family'];

/**
 * PRD 21 页（0–20）→ 后端必须提供的 report.user 字段
 * 来源：PRD 第二章页面表格；TK-0383 API.md 第 5 节「页面与字段映射」
 * 说明：昵称/头像、ID 解析、注销跳过、多语言文案由前端按已确认方案处理，不属于本接口字段范围。
 */
export interface PrdPage {
  page: number;
  title: string;
  fields: string[];
}

export const PRD_PAGES: PrdPage[] = [
  { page: 0, title: '首页', fields: [] }, // 使用 player.name/avatar，单独校验
  { page: 1, title: '注册天数', fields: ['register_date', 'register_day'] },
  { page: 2, title: '活跃天数', fields: ['active_day'] },
  { page: 3, title: '活跃时段', fields: ['active_time'] },
  {
    page: 4,
    title: '合集-2026年的第一次',
    fields: [
      'first_chats_user_id',
      'first_order_user_id',
      'first_receiver_id',
      'first_receiver_gift_id',
      'first_sender_id',
      'first_sender_gift_id',
    ],
  },
  { page: 5, title: '大R-超豪俱乐部', fields: ['enter_super_luxury_club_count'] },
  { page: 6, title: '大R-VIP 501', fields: ['become_bigr_time'] },
  { page: 7, title: '技能下单-偏好技能', fields: ['skill_id', 'skill_order_count'] },
  {
    page: 8,
    title: '技能下单-用户侧',
    fields: ['complete_order_total', 'complete_most_player_id', 'most_player_order_count'],
  },
  { page: 9, title: '技能下单-陪玩侧', fields: ['is_player', 'order_most_user_id'] },
  { page: 10, title: '语音房-特殊时间', fields: ['voice_special_time'] },
  { page: 11, title: '语音房-停留时间', fields: ['voice_room_id', 'voice_stay_time'] },
  { page: 12, title: '语音房-社交游戏', fields: ['social_game_rounds', 'most_social_game'] },
  {
    page: 13,
    title: '礼物-聚合信息',
    fields: [
      'sender_uv',
      'receiver_most_expensive_gift',
      'receiver_most_expensive_gift_price',
      'receiver_most_expensive_sender_id',
      'most_expensive_sender_id',
      'most_expensive_sender_price',
      'most_expensive_receiver_id',
      'most_expensive_receiver_gift_price',
    ],
  },
  {
    page: 14,
    title: '拍拍房-首个拍拍关系',
    fields: ['first_relation_type', 'first_relation_user_id', 'first_relation_time'],
  },
  {
    page: 15,
    title: '拍拍房-最高身价',
    fields: [
      'top_value_relation_type',
      'top_value_relation_level',
      'top_value_relation_user_id',
      'top_value_relation_value',
      'top_value_relation_time',
    ],
  },
  {
    page: 16,
    title: '拍拍房-最长的关系',
    fields: ['longest_relation_type', 'longest_relation_user_id', 'longest_relation_days'],
  },
  { page: 17, title: '私聊-聊天最多', fields: ['most_chats_user_id', 'most_chats_count'] },
  { page: 18, title: '私聊-特殊时间', fields: ['chats_special_time'] },
  {
    page: 19,
    title: '年度身份卡',
    fields: ['identity_code', 'identity_name', 'identity_priority', 'identity_metric_name', 'identity_metric_value'],
  },
  {
    page: 20,
    title: '总结页',
    fields: ['active_day', 'skill_id', 'voice_room_id', 'voice_stay_time', 'identity_code', 'identity_name'],
  },
];

/** 身份卡一致性抽查用户（宽表有 identity_* 数据） */
export const IDENTITY_SAMPLE_USERS = [8, 11, 14, 21, 28];
