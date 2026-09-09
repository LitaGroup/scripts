import type { APITestResource } from '../resources/APITestResource.ts';
import type { MySQLTestResource, MysqlRow } from '../resources/MySQLTestResource.ts';
import type { RedisTestResource } from '../resources/RedisTestResource.ts';

export const DIDIBUS_BIZ = 'didibus-v202609';
/** 探险券账户标识（v1.5.0 mod_account 体系，对应 mod_account.name；旧 active_coin/N-A-DIDIBUS 已废弃） */
export const DIDIBUS_ACCOUNT_NAME = 'DIDIBUS-MILEAGE';

const DB_ACTIVE = 'lita_active';

export interface DidibusServiceDeps {
  api: APITestResource;
  mysql: MySQLTestResource;
  redis: RedisTestResource;
}

export interface DidibusSendGiftParams {
  sender: number;
  receiver: number;
  giftId: number;
  giftPrice: number;
  totalCoin: number;
  sendTimeMs: number;
  orderNo?: string;
  debugTs: string;
  locale?: string;
}

export interface BusCrossedPoint {
  mapName: string;
  stage: number;
  loopNo: number;
  awardName: string;
}

export interface BusForwardResult {
  oldDistance: number;
  newDistance: number;
  crossedPoints: number;
  crossed: BusCrossedPoint[];
}

export interface LuckydrawDrawData {
  id: number;
  pool: string;
  count: number;
  results?: unknown[];
}

/**
 * /draw 响应（v1.4.0 双 LuckydrawModule）：
 * luckyGift = 礼物道具抽奖（topic=lucky-gift，扣券）；luckyMileage = 里程抽奖（topic=lucky-mileage，price=0 不扣费）。
 * 两条 mod_luckydraw_record 通过 (biz, user_id, pool, create_time) 一一对应；bus.forward transNo = "bus_"+luckyGift.id。
 */
export interface DrawResult {
  luckyGift: LuckydrawDrawData;
  luckyMileage?: LuckydrawDrawData;
  totalMileage: number;
  bus: BusForwardResult;
}

export interface MarqueeItem {
  playerId: string;
  pool: string;
  count: number;
}

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`DidibusService: invalid numeric value: ${n}`);
  }
  return str;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * 滴滴巴士·探险之旅（didibus-v202609）业务服务，绑定测试环境资源。
 * 封装 Active 层接口（enter/detail/draw/marquee）、通用模块接口（/m/{module}/{event}）、
 * gift_send 消息模拟、__cron 触发，以及 MySQL/Redis 的查询与造数清理。
 */
export class DidibusService {
  readonly api: APITestResource;
  readonly mysql: MySQLTestResource;
  readonly redis: RedisTestResource;

  constructor(deps: DidibusServiceDeps) {
    this.api = deps.api;
    this.mysql = deps.mysql;
    this.redis = deps.redis;
  }

  // ==================== Active 层接口 ====================

  async config(userId: number | string, locale: string, debugTs: string): Promise<Record<string, unknown>> {
    const data = await this.api.request(`active/v3/${DIDIBUS_BIZ}/config`, {
      body: {},
      userId,
      locale,
      debugTimestamp: debugTs,
    });
    return (data ?? {}) as Record<string, unknown>;
  }

  async enter(userId: number | string, locale: string, debugTs: string): Promise<{ tickets: number }> {
    const data = await this.api.request(`active/v3/${DIDIBUS_BIZ}/enter`, {
      body: {},
      userId,
      locale,
      debugTimestamp: debugTs,
    });
    return (data ?? {}) as { tickets: number };
  }

  async detail(userId: number | string, locale: string, debugTs: string): Promise<Record<string, unknown>> {
    const data = await this.api.request(`active/v3/${DIDIBUS_BIZ}/detail`, {
      body: {},
      userId,
      locale,
      debugTimestamp: debugTs,
    });
    return (data ?? {}) as Record<string, unknown>;
  }

  async draw(userId: number | string, locale: string, debugTs: string, pool: string, count: number): Promise<DrawResult> {
    const data = await this.api.request(`active/v3/${DIDIBUS_BIZ}/draw`, {
      body: { pool, count },
      userId,
      locale,
      debugTimestamp: debugTs,
    });
    return (data ?? {}) as DrawResult;
  }

  async marquee(userId: number | string, locale: string, debugTs: string): Promise<MarqueeItem[]> {
    const data = await this.api.request(`active/v3/${DIDIBUS_BIZ}/marquee`, {
      body: {},
      userId,
      locale,
      debugTimestamp: debugTs,
    });
    return (Array.isArray(data) ? data : []) as MarqueeItem[];
  }

  // ==================== 通用模块接口（/m/{module}/{event}） ====================

  async moduleCall(
    moduleEvent: string,
    userId: number | string,
    locale: string,
    debugTs: string,
    body: Record<string, unknown> = {},
  ): Promise<unknown> {
    return this.api.request(`active/v3/${DIDIBUS_BIZ}/m/${moduleEvent}`, {
      body,
      userId,
      locale,
      debugTimestamp: debugTs,
    });
  }

  /** 活动轮次初始化（/p/init：创建总榜/日榜/任务轮次，round 为 1-indexed） */
  async initActivity(userId: number | string, locale: string, debugTs: string, round = 1): Promise<unknown> {
    return this.api.request(`active/v3/${DIDIBUS_BIZ}/p/init`, {
      body: { round },
      userId,
      locale,
      debugTimestamp: debugTs,
    });
  }

  async accountDetail(userId: number | string, locale: string, debugTs: string): Promise<Record<string, unknown>> {
    return (await this.moduleCall('account/detail', userId, locale, debugTs) ?? {}) as Record<string, unknown>;
  }

  async accountRecords(userId: number | string, locale: string, debugTs: string, name = DIDIBUS_ACCOUNT_NAME): Promise<unknown[]> {
    const data = await this.moduleCall('account/records', userId, locale, debugTs, { name, minId: 0, size: 50 });
    return Array.isArray(data) ? data : [];
  }

  /** 礼物道具奖池详情（lucky-gift，含 pools 价格；里程奖池不单独展示） */
  async luckyGiftDetail(userId: number | string, locale: string, debugTs: string): Promise<Record<string, unknown>> {
    return (await this.moduleCall('lucky-gift/detail', userId, locale, debugTs) ?? {}) as Record<string, unknown>;
  }

  async luckyGiftRecords(userId: number | string, locale: string, debugTs: string): Promise<unknown[]> {
    const data = await this.moduleCall('lucky-gift/records', userId, locale, debugTs, { minId: 0, size: 50 });
    return Array.isArray(data) ? data : [];
  }

  async luckyGiftResult(userId: number | string, locale: string, debugTs: string, pool: string, id: number): Promise<unknown> {
    return this.moduleCall('lucky-gift/result', userId, locale, debugTs, { pool, id });
  }

  /** 里程抽奖记录（lucky-mileage，可反查每次抽中的里程值 item.award_count） */
  async luckyMileageRecords(userId: number | string, locale: string, debugTs: string): Promise<unknown[]> {
    const data = await this.moduleCall('lucky-mileage/records', userId, locale, debugTs, { minId: 0, size: 50 });
    return Array.isArray(data) ? data : [];
  }

  async luckyMileageResult(userId: number | string, locale: string, debugTs: string, pool: string, id: number): Promise<unknown> {
    return this.moduleCall('lucky-mileage/result', userId, locale, debugTs, { pool, id });
  }

  async busDetail(userId: number | string, locale: string, debugTs: string): Promise<Record<string, unknown>> {
    return (await this.moduleCall('bus/detail', userId, locale, debugTs) ?? {}) as Record<string, unknown>;
  }

  async rankQuery(
    topic: string,
    userId: number | string,
    locale: string,
    debugTs: string,
    opts: { key?: string; count?: number } = {},
  ): Promise<Record<string, unknown>> {
    const data = await this.moduleCall(`${topic}/rank`, userId, locale, debugTs, {
      key: opts.key ?? '-',
      count: opts.count ?? 200,
      locale: null,
      includeMine: true,
    });
    return (data ?? {}) as Record<string, unknown>;
  }

  async roundTop(topic: string, userId: number | string, locale: string, debugTs: string): Promise<unknown> {
    return this.moduleCall(`${topic}/round-top`, userId, locale, debugTs, {});
  }

  // ==================== 消息 / 定时任务 ====================

  makeOrderNo(prefix = 'AI_DIDIBUS_GIFT'): string {
    const d = new Date();
    const ts = `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`;
    const micro = pad(Math.floor(Math.random() * 1_000_000), 6);
    return `${prefix}_${ts}${micro}`;
  }

  async sendGift(params: DidibusSendGiftParams): Promise<string> {
    const orderNo = params.orderNo ?? this.makeOrderNo();
    const locale = params.locale ?? 'in';
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
      gift_shelf_type: 'voiceroom',
      gift_price: params.giftPrice,
      gift_count: 1,
      scene: null,
      locale,
      total_coin: params.totalCoin,
      send_time: params.sendTimeMs,
      create_time: params.sendTimeMs,
      guild_id: 0,
      sign_guild_id: 0,
      mic_index: 0,
      source_name: 'MST',
      host_id: 17084268,
      room_source: 'voiceroom',
      rank_coin: params.totalCoin,
      box_id: null,
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

  /** 手动触发 __cron（模拟时间必须是北京时间，精确到 cron 分钟） */
  async runCron(beijingTs: string): Promise<unknown> {
    return this.api.request('active/v3/__cron', {
      body: {},
      debugTimestamp: beijingTs,
    });
  }

  // ==================== MySQL 查询 ====================

  async queryAwardConfig(name: string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT locale, \`sequence\`, stage, \`mod\`, \`show\`, award_type, award_id, award_name, award_count, expire_strategy, expire_express, stock, weight, max_times FROM mod_common_award WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND name=${quoteStr(name)} ORDER BY stage, \`sequence\``,
      DB_ACTIVE,
    );
  }

  async queryAwardNames(): Promise<string[]> {
    const rows = await this.mysql.query(
      `SELECT DISTINCT name FROM mod_common_award WHERE biz=${quoteStr(DIDIBUS_BIZ)} ORDER BY name`,
      DB_ACTIVE,
    );
    return rows.map((r) => String(r['name']));
  }

  /** 探险券账户定义（mod_account，id=901 / name=DIDIBUS-MILEAGE） */
  async queryAccountDef(): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, name, description, unit_type, locale_config FROM mod_account WHERE name=${quoteStr(DIDIBUS_ACCOUNT_NAME)}`,
      DB_ACTIVE,
    );
  }

  async queryEvent(name: string): Promise<MysqlRow[]> {
    return this.mysql.query(`SELECT id, name, description FROM mod_common_event WHERE name=${quoteStr(name)}`, DB_ACTIVE);
  }

  /** 探险券余额（mod_account_user，按 biz+player+name 一行） */
  async queryAccount(userId: number | string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, biz, player, name, amount, create_time, update_time FROM mod_account_user WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player=${quoteNum(userId)} AND name=${quoteStr(DIDIBUS_ACCOUNT_NAME)}`,
      DB_ACTIVE,
    );
  }

  /** 探险券变动记录（mod_account_user_record，amount 带符号，trans_no 幂等键） */
  async queryAccountLogs(userId: number | string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, player, name, amount, total_amount, trans_no, extra, create_time FROM mod_account_user_record WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player=${quoteNum(userId)} ORDER BY id`,
      DB_ACTIVE,
    );
  }

  async queryTaskRounds(userId: number | string, topic = 'daily-entry'): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, biz, topic, \`round\`, user_id, value, value_step, award_step, award_steps, name FROM mod_task_user_round WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND topic=${quoteStr(topic)} AND user_id=${quoteNum(userId)} ORDER BY \`round\``,
      DB_ACTIVE,
    );
  }

  /** mod_common_round 轮次配置（如 daily-entry 各大区每日轮次） */
  async queryCommonRounds(topic: string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, biz, topic, locale, \`key\`, start_time, finish_time, status FROM mod_common_round WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND topic=${quoteStr(topic)} ORDER BY locale, \`key\``,
      DB_ACTIVE,
    );
  }

  async queryLuckydrawRecords(userId: number | string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, biz, topic, user_id, pool, \`count\`, create_time FROM mod_luckydraw_record WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND user_id=${quoteNum(userId)} ORDER BY id`,
      DB_ACTIVE,
    );
  }

  async queryLuckydrawItems(recordId: number | string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, record_id, seq, result, prob, award_type, award_id, award_count FROM mod_luckydraw_record_item WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND record_id=${quoteNum(recordId)} ORDER BY seq`,
      DB_ACTIVE,
    );
  }

  async queryBusDistance(userId: number | string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, biz, topic, player, distance FROM mod_bus_user_distance WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player=${quoteNum(userId)}`,
      DB_ACTIVE,
    );
  }

  async queryBusDistanceRecords(userId: number | string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, player, distance, delta_distance, trans_no, create_time FROM mod_bus_user_distance_record WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player=${quoteNum(userId)} ORDER BY id`,
      DB_ACTIVE,
    );
  }

  async queryBusAwards(userId: number | string): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, player, map_name, stage, loop_no, picked FROM mod_bus_user_award WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player=${quoteNum(userId)} ORDER BY id`,
      DB_ACTIVE,
    );
  }

  async queryRounds(topic?: string, locale?: string): Promise<MysqlRow[]> {
    let sql = `SELECT locale, topic, \`key\`, start_time, finish_time, status FROM mod_common_round WHERE biz=${quoteStr(DIDIBUS_BIZ)}`;
    if (topic !== undefined) sql += ` AND topic=${quoteStr(topic)}`;
    if (locale !== undefined) sql += ` AND locale=${quoteStr(locale)}`;
    sql += ' ORDER BY locale, topic, `key`';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryRankRecords(
    topic: string,
    opts: { locale?: string; key?: string; player?: number | string } = {},
  ): Promise<MysqlRow[]> {
    let sql = `SELECT id, topic, locale, \`key\`, player, trans_no, amount, total_amount, contributor, create_time FROM mod_common_rank_record WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND topic=${quoteStr(topic)}`;
    if (opts.locale !== undefined) sql += ` AND locale=${quoteStr(opts.locale)}`;
    if (opts.key !== undefined) sql += ` AND \`key\`=${quoteStr(opts.key)}`;
    if (opts.player !== undefined) sql += ` AND player=${quoteStr(String(opts.player))}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryRankResults(
    topic: string,
    opts: { locale?: string; keyPrefix?: string; player?: number | string } = {},
  ): Promise<MysqlRow[]> {
    let sql = `SELECT id, topic, locale, \`key\`, player, total_amount, contributors, update_time FROM mod_common_rank_result WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND topic=${quoteStr(topic)}`;
    if (opts.locale !== undefined) sql += ` AND locale=${quoteStr(opts.locale)}`;
    if (opts.keyPrefix !== undefined) sql += ` AND \`key\` LIKE ${quoteStr(opts.keyPrefix + '%')}`;
    if (opts.player !== undefined) sql += ` AND player=${quoteStr(String(opts.player))}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryAwardRecords(opts: { topic?: string; player?: number | string } = {}): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, topic, player_type, player, order_no, award_type, award_id, award_count, status, \`mod\`, create_time FROM mod_common_award_record WHERE biz=${quoteStr(DIDIBUS_BIZ)}`;
    if (opts.topic !== undefined) sql += ` AND topic=${quoteStr(opts.topic)}`;
    if (opts.player !== undefined) sql += ` AND player=${quoteNum(opts.player)}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  // ==================== 造数 / 清理 ====================

  /** 直写探险券余额（mod_account_user 先删后插，幂等；该表无 locale 列，参数保留兼容调用方） */
  async setTicketBalance(userId: number | string, _locale: string, amount: number): Promise<void> {
    await this.mysql.execute(
      `DELETE FROM mod_account_user WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player=${quoteNum(userId)} AND name=${quoteStr(DIDIBUS_ACCOUNT_NAME)}`,
      DB_ACTIVE,
    );
    const now = Date.now();
    await this.mysql.execute(
      `INSERT INTO mod_account_user (biz, player, name, amount, create_time, update_time) VALUES (${quoteStr(DIDIBUS_BIZ)}, ${quoteNum(userId)}, ${quoteStr(DIDIBUS_ACCOUNT_NAME)}, ${quoteNum(amount)}, ${quoteNum(now)}, ${quoteNum(now)})`,
      DB_ACTIVE,
    );
  }

  /** 清理测试用户在各模块表中的数据（不动 mod_common_round） */
  async cleanUsers(userIds: (number | string)[]): Promise<void> {
    if (userIds.length === 0) return;
    const nums = userIds.map((u) => quoteNum(u)).join(', ');
    const strs = userIds.map((u) => quoteStr(String(u))).join(', ');
    const exec = (sql: string) => this.mysql.execute(sql, DB_ACTIVE);

    await exec(`DELETE FROM mod_account_user WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player IN (${nums})`);
    await exec(`DELETE FROM mod_account_user_record WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player IN (${nums})`);
    await exec(`DELETE FROM mod_task_user_round WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND user_id IN (${nums})`);
    await exec(`DELETE FROM mod_task_user_round_log WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND user_id IN (${nums})`);
    await exec(`DELETE FROM mod_task_user_round_step WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND user_id IN (${nums})`);
    await exec(
      `DELETE i FROM mod_luckydraw_record_item i JOIN mod_luckydraw_record r ON i.record_id=r.id AND i.biz=r.biz WHERE r.biz=${quoteStr(DIDIBUS_BIZ)} AND r.user_id IN (${nums})`,
    );
    await exec(`DELETE FROM mod_luckydraw_record WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND user_id IN (${nums})`);
    await exec(`DELETE FROM mod_bus_user_distance WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player IN (${nums})`);
    await exec(`DELETE FROM mod_bus_user_distance_record WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player IN (${nums})`);
    await exec(`DELETE FROM mod_bus_user_award WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player IN (${nums})`);
    await exec(`DELETE FROM mod_common_rank_record WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player IN (${strs})`);
    await exec(`DELETE FROM mod_common_rank_result WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player IN (${strs})`);
    await exec(`DELETE FROM mod_common_award_record WHERE biz=${quoteStr(DIDIBUS_BIZ)} AND player IN (${nums})`);
    await exec(`DELETE FROM mod_common_event_record WHERE name='DIDIBUS_MILEAGE' AND player IN (${nums})`);
  }

  /** 直写榜单变更记录（造贡献者数据用，010 总榜结算） */
  async seedRankRecord(
    topic: string,
    locale: string,
    key: string,
    player: number | string,
    contributor: number | string,
    amount: number,
    createTimeMs: number,
  ): Promise<void> {
    await this.mysql.execute(
      `INSERT INTO mod_common_rank_record (biz, topic, locale, \`key\`, player, trans_no, create_time, amount, total_amount, extra, contributor) VALUES (${quoteStr(DIDIBUS_BIZ)}, ${quoteStr(topic)}, ${quoteStr(locale)}, ${quoteStr(key)}, ${quoteStr(String(player))}, ${quoteStr(this.makeOrderNo('AI_DIDIBUS_SEED'))}, ${quoteNum(createTimeMs)}, ${amount}, ${amount}, '', ${quoteStr(String(contributor))})`,
      DB_ACTIVE,
    );
  }

  /** 清理本 biz 全部历史发奖记录（用例发放前调用，避免其他用户/历史数据干扰 biz+topic 计数） */
  async cleanAwardRecords(): Promise<number> {
    return this.mysql.execute(
      `DELETE FROM mod_common_award_record WHERE biz=${quoteStr(DIDIBUS_BIZ)}`,
      DB_ACTIVE,
    );
  }

  /** 清理榜单轮次（009/010 结算用例重跑前置） */
  async cleanRounds(): Promise<number> {
    return this.mysql.execute(
      `DELETE FROM mod_common_round WHERE biz=${quoteStr(DIDIBUS_BIZ)}`,
      DB_ACTIVE,
    );
  }

  /** 清理 Redis：按业务名 glob 扫描删除（榜单 common:rank:* 及任何含 biz 的 key） */
  async cleanRedis(): Promise<void> {
    for (const pattern of [`*${DIDIBUS_BIZ}*`, 'active:didibus:*']) {
      try {
        await this.redis.clearByPattern(pattern);
      } catch {
        // 清理失败不阻断用例
      }
    }
  }

  /**
   * 榜单分数验证走接口（/m/{topic}/rank），返回玩家 score（取整），不在榜返回 null。
   * key 缺省 '-'（总榜），日榜传 yyyyMMdd。
   */
  async rankScoreOf(
    topic: string,
    userId: number | string,
    locale: string,
    debugTs: string,
    key = '-',
    count = 200,
  ): Promise<number | null> {
    const data = await this.rankQuery(topic, userId, locale, debugTs, { key, count });
    const hit = this.parseRankList(data).find((e) => e.player === Number(userId));
    return hit ? hit.amount : null;
  }

  /** 直接写榜单 ZSet 分数（造数用，绕过 consumer；member 为 JSON 字符串编码） */
  async rankSeed(key: string, userId: number | string, score: number): Promise<void> {
    await this.redis.zadd(key, score, JSON.stringify(String(userId)));
  }

  /** 送礼总榜/日榜/收礼榜的 Redis key（仅造数/清理用；验证请走 rankScoreOf 接口） */
  rankKey(locale: string, topic: string, dayKey?: string): string {
    return `common:rank:${DIDIBUS_BIZ}:${topic}:${locale}:${dayKey ?? '-'}`;
  }

  /** 解析榜单查询返回的条目列表（兼容 list / rankResult 字段名与 player/amount 别名） */
  parseRankList(data: Record<string, unknown>): Array<{ player: number; amount: number }> {
    const list = (data['list'] ?? data['rankResult'] ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(list)) return [];
    return list
      .map((e) => ({
        player: Number(e['player'] ?? e['playerId'] ?? e['userId']),
        amount: Number(e['amount'] ?? e['score'] ?? e['totalAmount']),
      }))
      .filter((e) => Number.isFinite(e.player));
  }
}
