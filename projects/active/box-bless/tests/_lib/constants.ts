import { BOX_BLESS_BIZ, TOPIC_BY_LOCALE } from '../../../../../src/services/BoxBlessService.ts';

export const BIZ = BOX_BLESS_BIZ;
export { TOPIC_BY_LOCALE };

export const LOCALE = 'in';
export const LOCALE_KO = 'ko';
export const LOCALES = ['in', 'vi', 'ph', 'ko', 'ar'];

/** TaskModule 实例 topic（3 个大区组：default=in/vi、ko、ph+ar） */
export const TOPIC_DEFAULT = 'bless-default';
export const TOPIC_KO = 'bless-ko';
export const TOPIC_PH = 'bless-ph';

/** 测试用户池（复用 pk 测试用户，box-bless 数据按 biz+用户隔离） */
export const USER_A = 13126; // 送礼人 / 主测试用户
export const USER_B = 13125; // 收礼人
export const USER_C = 13127; // 大区覆盖对照（ko）

/** 活动魔盒（yaml magicboxBless.gifts keys，2026-10-21 样例配置） */
export const MAGIC_BOXES = [6040, 6041, 6155, 6526, 6527, 8978];
/** 用例固定取样魔盒 */
export const BOX_SAMPLE = 6040;

/** 每送 1 个魔盒增加的赐福值（yaml gifts，按大区组覆盖，组缺失回退 default） */
export const RATIO_DEFAULT: Record<number, number> = { 6040: 5, 6041: 8, 6155: 5, 6526: 8, 6527: 5, 8978: 8 };
export const RATIO_KO: Record<number, number> = { 6040: 4, 6041: 6, 6155: 4, 6526: 6, 6527: 4, 8978: 6 };

/** 每魔盒触发一管所需赐福值（yaml targets） */
export const TARGET_DEFAULT = 100;
export const TARGET_KO = 80;

/** 非白名单魔盒 id（白名单过滤负例） */
export const NON_BOX_ID = 999999;

/** 赐福类型合法取值（队列 award_type / 配置 bless_awards.type） */
export const BLESS_TYPES = [
  'BOX_BLESS_GUARANTEE',
  'BOX_BLESS_FREE',
  'BOX_BLESS_DISCOUNT',
  'BOX_BLESS_DOUBLE',
  'BOX_BLESS_PROB_UP',
  'GIFT',
];

/** 累加过滤条件（决策14，两条同时满足才计入赐福值） */
export const ROOM_SOURCE = 'voiceroom';
export const GIFT_SHELF_TYPE = 'sysactive_treasur_box';
