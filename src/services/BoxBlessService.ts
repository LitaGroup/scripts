import type { APITestResource } from '../resources/APITestResource.ts';
import type { MySQLTestResource, MysqlRow } from '../resources/MySQLTestResource.ts';
import type { RedisTestResource } from '../resources/RedisTestResource.ts';

export const BOX_BLESS_BIZ = 'magicbox-bless-v202611';

const DB_ACTIVE = 'lita_active';
const DB_BASIC = 'lita_basic';

/** 大区 → TaskModule 实例 topic（3 个大区组：default=in/vi、ko、ph+ar，ar 为测试区） */
export const TOPIC_BY_LOCALE: Record<string, string> = {
  in: 'bless-default',
  vi: 'bless-default',
  ko: 'bless-ko',
  ph: 'bless-ph',
  ar: 'bless-ph',
};

export interface BoxBlessServiceDeps {
  api: APITestResource;
  mysql: MySQLTestResource;
  redis: RedisTestResource;
}

/** test/giftSend 入参（orderNo/senderId/boxId/giftCount 必填；sendTimeMs 缺省=debugTs 对应时间） */
export interface TestGiftSendParams {
  senderId: number;
  boxId: number;
  giftCount: number;
  locale: string;
  debugTs: string;
  orderNo?: string;
  giftId?: number;
  roomId?: number;
  roomSource?: string;
  sendTimeMs?: number;
}

/** test/giftSend 同步返回（value=累加后该魔盒总赐福值，stepNow=floor(value/target)） */
export interface TestGiftSendResult {
  orderNo: string;
  senderId: number;
  boxId: number;
  value: number;
  stepNow: number;
}

/** boxBless 响应的生效中赐福（最早获得且未过期的一张；couponCount=有效券总数） */
export interface BlessActiveCoupon {
  type: string;
  discount: number;
  expireTime: number;
  couponCount: number;
  awardId?: number;
  awardImage?: string;
  awardName?: string;
  awardPrice?: number;
  probUpRate?: number;
  blessReTime?: number;
}

/** boxBless 响应（value=当前管进度=累计值%target） */
export interface BoxBlessInfo {
  boxGiftId: number;
  boxImage?: string;
  boxName?: string;
  value: number;
  target: number;
  addValue: number;
  active: BlessActiveCoupon | null;
  action?: unknown;
}

/** h5List 条目（H5 魔盒列表：6 魔盒 + 本大区赐福奖池） */
export interface H5BoxItem {
  boxId: number;
  boxImage?: string;
  boxName?: string;
  boxPrice?: number;
  blessAwards?: Array<Record<string, unknown>>;
}

/** __consumer/funbit.gift_send 真实链路消息参数（boxId/giftShelfType/roomSource 可参数化以覆盖负例过滤） */
export interface BoxBlessConsumerGiftParams {
  sender: number;
  receiver: number;
  boxId: number | null;
  giftId: number;
  giftCount: number;
  sendTimeMs: number;
  debugTs: string;
  orderNo?: string;
  giftPrice?: number;
  totalCoin?: number;
  locale?: string;
  roomSource?: string;
  giftShelfType?: string;
}

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`BoxBlessService: invalid numeric value: ${n}`);
  }
  return str;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * 魔盒-幸运赐福（magicbox-bless-v202611）业务服务，绑定测试环境资源。
 * 封装 Business 接口（boxBless/list/testGiftSend）、__consumer 真实链路消息、__cron 触发，
 * 以及 lita_active（mod_task_user_round/_log、active_source_record、mod_common_round）与
 * lita_basic（treasure_box_bless_config/_user/_user_record、gift_award_queue）双库查询与清理。
 */
export class BoxBlessService {
  readonly api: APITestResource;
  readonly mysql: MySQLTestResource;
  readonly redis: RedisTestResource;

  constructor(deps: BoxBlessServiceDeps) {
    this.api = deps.api;
    this.mysql = deps.mysql;
    this.redis = deps.redis;
  }

  // ==================== Active 层接口 ====================

  async config(userId: number | string, locale: string, debugTs: string): Promise<Record<string, unknown>> {
    const data = await this.api.request(`active/v3/${BOX_BLESS_BIZ}/config`, {
      body: {},
      userId,
      locale,
      debugTimestamp: debugTs,
    });
    return (data ?? {}) as Record<string, unknown>;
  }

  /** 活动轮次初始化（/p/init：pipelines.init 依次初始化 bless-default/bless-ko/bless-ph 三个 TaskModule 实例轮次，幂等） */
  async initActivity(userId: number | string, locale: string, debugTs: string, round = 1): Promise<unknown> {
    return this.api.request(`active/v3/${BOX_BLESS_BIZ}/p/init`, {
      body: { round },
      userId,
      locale,
      debugTimestamp: debugTs,
    });
  }

  /** 进度条与赐福状态查询（独立接口，按 alias 解析当期 biz）；非活动魔盒/未传 boxId/活动未开启返回 null */
  async boxBless(userId: number | string, locale: string, debugTs: string, boxId?: number): Promise<BoxBlessInfo | null> {
    const data = await this.api.request('active/v3/magicbox-bless/boxBless', {
      body: boxId === undefined ? {} : { boxId },
      userId,
      locale,
      debugTimestamp: debugTs,
    });
    return (data ?? null) as BoxBlessInfo | null;
  }

  /** H5 魔盒列表（本大区 6 魔盒 + 赐福奖池） */
  async h5List(userId: number | string, locale: string, debugTs: string): Promise<H5BoxItem[]> {
    const data = await this.api.request('active/v3/magicbox-bless/list', {
      body: {},
      userId,
      locale,
      debugTimestamp: debugTs,
    });
    return (Array.isArray(data) ? data : []) as H5BoxItem[];
  }

  /**
   * 测试接口：模拟一条送礼消息（复用正式 processGiftSend，actualBoxCount 直接=giftCount，
   * 不查 funbit.treasure_box），同步返回处理后的 value/stepNow。
   */
  async testGiftSend(params: TestGiftSendParams): Promise<TestGiftSendResult> {
    const orderNo = params.orderNo ?? this.makeOrderNo();
    const body: Record<string, unknown> = {
      orderNo,
      senderId: params.senderId,
      boxId: params.boxId,
      giftCount: params.giftCount,
      locale: params.locale,
    };
    if (params.giftId !== undefined) body['giftId'] = params.giftId;
    if (params.roomId !== undefined) body['roomId'] = params.roomId;
    if (params.roomSource !== undefined) body['roomSource'] = params.roomSource;
    if (params.sendTimeMs !== undefined) body['sendTime'] = params.sendTimeMs;
    const data = await this.api.request('active/v3/magicbox-bless/test/giftSend', {
      body,
      locale: params.locale,
      debugTimestamp: params.debugTs,
    });
    const obj = (data ?? {}) as Record<string, unknown>;
    return {
      orderNo: String(obj['orderNo'] ?? orderNo),
      senderId: Number(obj['senderId'] ?? params.senderId),
      boxId: Number(obj['boxId'] ?? params.boxId),
      value: Number(obj['value'] ?? 0),
      stepNow: Number(obj['stepNow'] ?? 0),
    };
  }

  /**
   * 真实 consumer 链路：POST __consumer/funbit.gift_send。
   * 注意：正式链路按 batchNo 查 funbit.treasure_box 取实际魔盒数，未造批次行时一律按 0 跳过
   * （本方法主要用于白名单/来源/宝箱流水等过滤负例）。
   */
  async sendGiftConsumer(params: BoxBlessConsumerGiftParams): Promise<string> {
    const orderNo = params.orderNo ?? this.makeOrderNo();
    const locale = params.locale ?? 'in';
    const totalCoin = params.totalCoin ?? params.giftPrice ?? 0;
    const payload = [{
      id: 193566294,
      order_no: orderNo,
      batch_no: orderNo,
      free: 0,
      sender_id: params.sender,
      receiver_id: params.receiver,
      room_id: 10100001,
      gift_id: params.giftId,
      gift_class_id: 3790,
      gift_shelf_type: params.giftShelfType ?? 'sysactive_treasur_box',
      gift_price: params.giftPrice ?? 0,
      gift_count: params.giftCount,
      scene: null,
      locale,
      total_coin: totalCoin,
      send_time: params.sendTimeMs,
      create_time: params.sendTimeMs,
      guild_id: 0,
      sign_guild_id: 0,
      mic_index: 0,
      source_name: 'MST',
      host_id: 17084268,
      room_source: params.roomSource ?? 'voiceroom',
      rank_coin: totalCoin,
      box_id: params.boxId,
      shumei_token: 'TEST_TOKEN',
      drbddid: 'TEST_DDBDID',
      ip: '103.158.82.166',
      group_id: null,
      gift_type: 'basic',
      is_fake: 0,
    }];
    await this.api.request('active/v3/__consumer/funbit.gift_send', {
      body: payload,
      debugTimestamp: params.debugTs,
      extraHeaders: { 'l-trace-id': '888888' },
    });
    return orderNo;
  }

  /** 手动触发 __cron（time 为 ISO-8601 带偏移，框架按 cron 表达式匹配 @ActiveCron；须精确到 cron 分钟） */
  async runCron(beijingIso: string): Promise<unknown> {
    return this.api.request('active/v3/__cron', {
      body: { biz: BOX_BLESS_BIZ, time: beijingIso },
      debugTimestamp: beijingIso,
    });
  }

  makeOrderNo(prefix = 'AI_BOX_BLESS_GIFT'): string {
    const d = new Date();
    const ts = `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`;
    const micro = pad(Math.floor(Math.random() * 1_000_000), 6);
    return `${prefix}_${ts}${micro}`;
  }

  // ==================== MySQL 查询（lita_active） ====================

  /** 赐福值进度行（mod_task_user_round，name=bless_{boxId}；topic 缺省按大区组不限定） */
  async queryTaskRound(userId: number | string, boxId: number, topic?: string): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, topic, \`round\`, name, user_id, value, value_step, award_step, award_steps, create_time, update_time FROM mod_task_user_round WHERE biz=${quoteStr(BOX_BLESS_BIZ)} AND name=${quoteStr(`bless_${boxId}`)} AND user_id=${quoteNum(userId)}`;
    if (topic !== undefined) sql += ` AND topic=${quoteStr(topic)}`;
    return this.mysql.query(sql, DB_ACTIVE);
  }

  /** 赐福值变更流水（mod_task_user_round_log；boxId 限定 name，缺省查该用户全部魔盒） */
  async queryTaskRoundLogs(userId: number | string, boxId?: number): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, topic, \`round\`, name, user_id, trans_no, from_value, to_value, value, create_time FROM mod_task_user_round_log WHERE biz=${quoteStr(BOX_BLESS_BIZ)} AND user_id=${quoteNum(userId)}`;
    if (boxId !== undefined) sql += ` AND name=${quoteStr(`bless_${boxId}`)}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  /** 发放记录（active_source_record 高水位，unique_key=bless:{userId}:{boxId}:{step}，只升不降） */
  async querySourceRecords(userId: number | string, boxId: number): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, active_name, unique_key, data, create_time FROM active_source_record WHERE active_name=${quoteStr(BOX_BLESS_BIZ)} AND unique_key LIKE ${quoteStr(`bless:${userId}:${boxId}:%`)} ORDER BY id`,
      DB_ACTIVE,
    );
  }

  /** 轮次（mod_common_round，topic=bless-default/bless-ko/bless-ph） */
  async queryCommonRounds(topic: string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, biz, topic, locale, \`key\`, start_time, finish_time, status FROM mod_common_round WHERE biz=${quoteStr(BOX_BLESS_BIZ)} AND topic=${quoteStr(topic)} ORDER BY locale, \`key\``,
      DB_ACTIVE,
    );
  }

  // ==================== MySQL 查询（lita_basic） ====================

  /** 发放队列行（gift_award_queue，按 order_no 前缀查：{orderNo} → 含 :s{step} 后缀的全部管数） */
  async queryAwardQueueByOrder(orderNoPrefix: string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, order_no, user_id, award_type, award_id, award_count, expires_second, award_status, award_mod, active_name, remark, create_time FROM gift_award_queue WHERE order_no LIKE ${quoteStr(orderNoPrefix + '%')} ORDER BY id`,
      DB_BASIC,
    );
  }

  /** 发放队列行（按用户 + 本活动 biz） */
  async queryAwardQueueByUser(userId: number | string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, order_no, user_id, award_type, award_id, award_count, expires_second, award_status, award_mod, active_name, remark, create_time FROM gift_award_queue WHERE active_name=${quoteStr(BOX_BLESS_BIZ)} AND user_id=${quoteNum(userId)} ORDER BY id`,
      DB_BASIC,
    );
  }

  /** 用户赐福券（treasure_box_bless_user；全生效模型：status 仅 ACTIVE/USED，过期按 expire_time 推导） */
  async queryBlessUsers(userId: number | string, boxId?: number): Promise<MysqlRow[]> {
    let sql = `SELECT id, user_id, gift_id, locale, bless_type, award_config, status, expire_time, create_time, update_time FROM treasure_box_bless_user WHERE user_id=${quoteNum(userId)}`;
    if (boxId !== undefined) sql += ` AND gift_id=${quoteNum(boxId)}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_BASIC);
  }

  /** 用户赐福流水（treasure_box_bless_user_record：GET=发放/trans_no=队列 order_no，USE=核销/trans_no=送礼批次号） */
  async queryBlessRecords(userId: number | string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, user_id, gift_id, bless_type, type, bless_user_id, award_config, trans_no, remark, create_time FROM treasure_box_bless_user_record WHERE user_id=${quoteNum(userId)} ORDER BY id`,
      DB_BASIC,
    );
  }

  /** 赐福奖池配置（treasure_box_bless_config，一行=一个大区一个魔盒；locale 缺省查全部） */
  async queryBlessConfig(locale?: string): Promise<MysqlRow[]> {
    let sql = 'SELECT id, locale, gift_id, bless_awards, state, create_time, update_time FROM treasure_box_bless_config';
    if (locale !== undefined) sql += ` WHERE locale=${quoteStr(locale)}`;
    sql += ' ORDER BY locale, gift_id';
    return this.mysql.query(sql, DB_BASIC);
  }

  // ==================== 造数 / 清理 ====================

  /**
   * 清理测试用户数据（不动 mod_common_round 公共轮次）：
   * lita_active 的 mod_task_user_round(_log/_step)、active_source_record（bless:{uid}:%）；
   * lita_basic 的 treasure_box_bless_user(_record)、gift_award_queue（active_name+user_id）。
   */
  async cleanUsers(userIds: (number | string)[]): Promise<void> {
    if (userIds.length === 0) return;
    const nums = userIds.map((u) => quoteNum(u)).join(', ');
    const keyConds = userIds.map((u) => `unique_key LIKE ${quoteStr(`bless:${u}:%`)}`).join(' OR ');

    await this.mysql.execute(`DELETE FROM mod_task_user_round WHERE biz=${quoteStr(BOX_BLESS_BIZ)} AND user_id IN (${nums})`, DB_ACTIVE);
    await this.mysql.execute(`DELETE FROM mod_task_user_round_log WHERE biz=${quoteStr(BOX_BLESS_BIZ)} AND user_id IN (${nums})`, DB_ACTIVE);
    await this.mysql.execute(`DELETE FROM mod_task_user_round_step WHERE biz=${quoteStr(BOX_BLESS_BIZ)} AND user_id IN (${nums})`, DB_ACTIVE);
    await this.mysql.execute(`DELETE FROM active_source_record WHERE active_name=${quoteStr(BOX_BLESS_BIZ)} AND (${keyConds})`, DB_ACTIVE);

    await this.mysql.execute(`DELETE FROM treasure_box_bless_user WHERE user_id IN (${nums})`, DB_BASIC);
    await this.mysql.execute(`DELETE FROM treasure_box_bless_user_record WHERE user_id IN (${nums})`, DB_BASIC);
    await this.mysql.execute(`DELETE FROM gift_award_queue WHERE active_name=${quoteStr(BOX_BLESS_BIZ)} AND user_id IN (${nums})`, DB_BASIC);
  }
}
