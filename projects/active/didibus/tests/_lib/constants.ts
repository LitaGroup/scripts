import { DIDIBUS_BIZ, DIDIBUS_TICKET_TYPE } from '../../../../../src/services/DidibusService.ts';

export const BIZ = DIDIBUS_BIZ;
export const TICKET_TYPE = DIDIBUS_TICKET_TYPE;

export const LOCALE = 'in';
export const LOCALES = ['in', 'vi', 'ph', 'ko'];

/** 测试用户池（复用 pk 测试用户，didibus 数据按 biz 隔离） */
export const USER_A = 13126; // 送礼人 / 主测试用户
export const USER_B = 13125; // 收礼人
export const USER_C = 13127; // 榜外对照用户
export const RANK_USERS = [13128, 13129, 13130, 13131, 13132, 13133, 13134, 13135];
export const ALL_USERS = [USER_A, USER_B, USER_C, ...RANK_USERS];

/**
 * 活动礼物白名单 + 榜单 buff（giftId → buff）。
 * TODO: 待提供真实活动礼物 ID 后填写；为空时 003/004 相关步骤 skip。
 */
export const ACTIVITY_GIFTS: Record<number, number> = {
  // 1001: 1.0,
};

/** 非活动礼物 ID（白名单之外，用于过滤验证；pk 活动礼物即可） */
export const NON_ACTIVITY_GIFT_ID = 10561;

/**
 * 探险券比率期望值（来自 Nacos didibus-v202609.yaml）。
 * TODO: 待提供真实配置后校正；当前为技术文档示例值。
 */
export const EXPECT_TICKET_PER_COIN_SENDER = 2;
export const EXPECT_TICKET_PER_COIN_RECEIVER = 1;

/** 里程 EVENT / award 名称（技术设计固定值） */
export const MILEAGE_NAME = 'DIDIBUS_MILEAGE';
export const POOL_NORMAL = 'normal';
export const POOL_FLYING = 'flying';
export const POOL_NAME_NORMAL = 'DIDIBUS_LUCKYDRAW_NORMAL';
export const POOL_NAME_FLYING = 'DIDIBUS_LUCKYDRAW_FLYING';
export const DAILY_ENTRY_AWARD = 'daily-entry';
export const AWARD_SEND_TOTAL = 'gift-send-total';
export const AWARD_SEND_DAILY = 'gift-send-daily';
export const AWARD_RECV = 'gift-recv';
export const AWARD_RECV_CONTRIBUTOR = 'gift-recv-contributor';

export const TOPIC_SEND = 'gift-send';
export const TOPIC_RECV = 'gift-recv';
