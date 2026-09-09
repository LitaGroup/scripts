import { DIDIBUS_BIZ, DIDIBUS_ACCOUNT_NAME } from '../../../../../src/services/DidibusService.ts';

export const BIZ = DIDIBUS_BIZ;
/** 探险券账户标识（v1.5.0 mod_account 体系，对应 mod_account.name） */
export const ACCOUNT_NAME = DIDIBUS_ACCOUNT_NAME;

export const LOCALE = 'in';
export const LOCALES = ['in', 'vi', 'ph', 'ko'];

/** 测试用户池（复用 pk 测试用户，didibus 数据按 biz 隔离） */
export const USER_A = 13126; // 送礼人 / 主测试用户
export const USER_B = 13125; // 收礼人
export const USER_C = 13127; // 榜外对照用户
export const RANK_USERS = [13128, 13129, 13130, 13131, 13132, 13133, 13134, 13135];
export const ALL_USERS = [USER_A, USER_B, USER_C, ...RANK_USERS];

/**
 * 活动礼物白名单 + 榜单 buff（giftId → buff），来自 Nacos didibus-v202609.yaml gifts。
 * 未配置的礼物不参与活动（不发券、不计榜）；buff 为探索获得该礼物时对总榜的加成分数。
 */
export const ACTIVITY_GIFTS: Record<number, number> = {
  1001: 1.0, // 金币礼物1
  1002: 1.5, // 金币礼物2
  1003: 2.0, // 金币礼物3
  1004: 2.5, // 金币礼物4
  1005: 3.0, // 钻石礼物
};

/** 非活动礼物 ID（白名单之外，用于过滤验证；pk 活动礼物即可） */
export const NON_ACTIVITY_GIFT_ID = 10561;

/** 探险券比率（来自 Nacos didibus-v202609.yaml：金币 × 每金币券数，向下取整） */
export const EXPECT_TICKET_PER_COIN_SENDER = 2;
export const EXPECT_TICKET_PER_COIN_RECEIVER = 0.5;

/** 里程 EVENT 名（mod_common_event，技术设计固定值；里程 award 条目 award_id 引用其 id） */
export const MILEAGE_EVENT_NAME = 'DIDIBUS_MILEAGE';

export const POOL_NORMAL = 'normal';
export const POOL_FLYING = 'flying';

/** 礼物道具奖池 name（lucky-gift，mod_common_award.name，小写点分命名） */
export const POOL_NAME_NORMAL = 'bus.normal';
export const POOL_NAME_FLYING = 'bus.flying';

/** 里程奖池 name（lucky-mileage，两巴士独立奖池，档位与概率各不相同，权重和=1.0 必得） */
export const MILEAGE_POOL_NAME: Record<string, string> = {
  [POOL_NORMAL]: 'bus.mileage.normal',
  [POOL_FLYING]: 'bus.mileage.flying',
};
export const DAILY_ENTRY_AWARD = 'daily-entry';
export const AWARD_SEND_TOTAL = 'gift-send-total';
export const AWARD_SEND_DAILY = 'gift-send-daily';
export const AWARD_RECV = 'gift-recv';
export const AWARD_RECV_CONTRIBUTOR = 'gift-recv-contributor';

export const TOPIC_SEND = 'gift-send';
export const TOPIC_RECV = 'gift-recv';
