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
 * 活动礼物白名单 + 榜单 buff（giftId → buff），来自 Nacos didibus-v202609.yaml gifts（2026-09-16 配置表）。
 * 未配置的礼物不参与活动（不计榜）；全部白名单礼物赠送时均计榜（score = 礼物价值 × buff，1金币/钻石=1积分）。
 * 分三档：礼物架普通礼物 buff 1.0（唯一发探索券）、奖池背包礼物 buff 1.1、探索点背包礼物 buff 1.3（背包礼物均不发券）。
 */
export const ACTIVITY_GIFTS: Record<number, number> = {
  10789: 1.3, // 背包礼物·探索点lv3（100金币）
  10791: 1.3, // 背包礼物·探索点lv5（300金币）
  10792: 1.3, // 背包礼物·探索点lv4（200金币）
  10793: 1.3, // 背包礼物·探索点lv6（600金币）
  10794: 1.1, // 背包礼物·普通奖池（20金币）
  10795: 1.1, // 背包礼物·高级奖池（50金币）
  10796: 1.1, // 背包礼物·高级奖池（100金币）
  10797: 1.0, // 礼物架礼物1（60金币）
  10798: 1.0, // 礼物架礼物2（600金币）
  10799: 1.0, // 礼物架礼物3（6000金币）
  10800: 1.0, // 礼物架礼物4（9999金币，广播101）
  10801: 1.0, // 礼物架礼物5（13999钻石，广播111）
};

/** 普通礼物（礼物架）清单（Nacos ticketGifts）：仅这些礼物发探索券、进 /gifts 礼物清单、登记超发风控 */
export const TICKET_GIFTS: number[] = [10797, 10798, 10799, 10800, 10801];

/** 背包礼物（奖池 10794~10796 + 探索点 10789/10791/10792/10793）：赠送时仅计榜（×buff），不发探索券 */
export const BACKPACK_GIFTS: number[] = [10789, 10791, 10792, 10793, 10794, 10795, 10796];

/** 三档取样礼物（用例固定引用，与 yaml gifts 配置对应） */
export const SAMPLE_TICKET_GIFT = 10797; // 礼物架 60 金币，buff=1.0，发券
export const SAMPLE_POOL_BACKPACK_GIFT = 10794; // 奖池背包 20 金币，buff=1.1，不发券
export const SAMPLE_EXPLORE_BACKPACK_GIFT = 10789; // 探索点背包 100 金币，buff=1.3，不发券

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
/** 图鉴奖励（init.sql 2026-09-17 版新增，N-S-HEADBOX 4381；仅 /gifts albumGifts 展示，无发放链路） */
export const ALBUM_AWARD = 'album_award';

export const TOPIC_SEND = 'gift-send';
export const TOPIC_RECV = 'gift-recv';
