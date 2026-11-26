import type { APITestResource } from '../resources/APITestResource.ts';
import type { MySQLTestResource, MysqlRow } from '../resources/MySQLTestResource.ts';
import type { RedisTestResource } from '../resources/RedisTestResource.ts';

/** pk-v202808（周年荣耀竞技场）业务服务，绑定测试环境资源。 */
export const PK_BIZ = 'pk-v202808';

const DB_ACTIVE = 'lita_active';
const DB_FUNBIT = 'funbit';
/** 陪玩订单状态消息入口（测试环境受控 consumer，契约以提测版本为准） */
export const PK_ORDER_TOPIC = 'funbit.play_order_status_log';

export interface Pk202808ServiceDeps {
  api: APITestResource;
  mysql: MySQLTestResource;
  redis: RedisTestResource;
}

export interface RankEntry {
  player: number;
  amount: number;
  rank: number;
  contributor?: number;
}

export interface SendGiftParams {
  sender: number;
  receiver: number;
  roomId: number;
  familyId: number;
  giftId: number;
  totalCoin: number;
  sendTimeMs: number;
  locale: string;
  debugTs: string;
  orderNo?: string;
  rankCoin?: number;
}

export interface OrderParams {
  transNo: string;
  userId: number;
  playerId: number;
  amount: number;
  finishMs: number;
  locale: string;
  debugTs: string;
  mainStatus?: number;
}

export interface SeedEntry {
  player: number | string;
  score: number;
  contributor?: number | string;
  createTime: number;
  transNo?: string;
}

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * pk-v202808 服务：接口、消息、MySQL、Redis 访问集中在此。
 * 所有数据均限定 biz=pk-v202808，避免污染其它期次。
 */
export class Pk202808Service {
  readonly api: APITestResource;
  readonly mysql: MySQLTestResource;
  readonly redis: RedisTestResource;

  constructor(deps: Pk202808ServiceDeps) {
    this.api = deps.api;
    this.mysql = deps.mysql;
    this.redis = deps.redis;
  }

  // ---------------------------------------------------------------- HTTP

  async callCron(debugTs: string): Promise<unknown> {
    return this.api.request('active/v3/__cron', { body: {}, debugTimestamp: debugTs });
  }

  async callDetail(debugTs?: string): Promise<Record<string, unknown>> {
    return (await this.api.request(`active/v3/${PK_BIZ}/detail`, { body: {}, debugTimestamp: debugTs })) as Record<string, unknown>;
  }

  async callConfig(debugTs?: string): Promise<Record<string, unknown>> {
    return (await this.api.request(`active/v3/${PK_BIZ}/config`, { body: {}, debugTimestamp: debugTs })) as Record<string, unknown>;
  }

  async callModuleDetail(topic: string, locale: string, debugTs?: string): Promise<Record<string, unknown>> {
    return (await this.api.request(`active/v3/${PK_BIZ}/m/${topic}/detail`, {
      body: {},
      locale,
      debugTimestamp: debugTs,
    })) as Record<string, unknown>;
  }

  async callModuleInit(topic: string, debugTs: string, locale: string, userId?: number): Promise<unknown> {
    return this.api.request(`active/v3/${PK_BIZ}/m/${topic}/init`, { body: {}, userId, locale, debugTimestamp: debugTs });
  }

  async callModuleSettle(topic: string, debugTs: string, locale: string): Promise<unknown> {
    return this.api.request(`active/v3/${PK_BIZ}/m/${topic}/settle`, { body: {}, locale, debugTimestamp: debugTs });
  }

  async callProvider(pipeline: string, debugTs: string, locale: string): Promise<unknown> {
    return this.api.request(`active/v3/${PK_BIZ}/p/${pipeline}`, { body: {}, locale, debugTimestamp: debugTs });
  }

  async callPlayerSettleAndInit(debugTs: string, locale: string): Promise<unknown> {
    return this.callProvider('player-settle-and-init', debugTs, locale);
  }

  async callPlayerDailySettle(debugTs: string, locale: string): Promise<unknown> {
    return this.callProvider('player-daily-settle', debugTs, locale);
  }

  async callPlayerPkSettleAndInit(debugTs: string, locale: string): Promise<unknown> {
    return this.callProvider('player-pk-settle-and-init', debugTs, locale);
  }

  async callInitRound(topic: string, key: string, debugTs: string, locale: string): Promise<unknown> {
    return this.api.request(`active/v3/${PK_BIZ}/m/${topic}/init-round`, {
      body: { key },
      locale,
      debugTimestamp: debugTs,
    });
  }

  async queryRank(
    topic: string,
    key: string,
    locale: string,
    opts: { count?: number; userId?: number; debugTs?: string; includeMine?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    return (await this.api.request(`active/v3/${PK_BIZ}/m/${topic}/rank`, {
      body: { key, count: opts.count ?? 200, locale: null, includeMine: opts.includeMine ?? false },
      userId: opts.userId,
      locale,
      debugTimestamp: opts.debugTs,
    })) as Record<string, unknown>;
  }

  async queryAwardDetail(topic: string, locale: string, debugTs?: string): Promise<Record<string, unknown>> {
    return (await this.api.request(`active/v3/${PK_BIZ}/m/${topic}/award-detail`, {
      body: {},
      locale,
      debugTimestamp: debugTs,
    })) as Record<string, unknown>;
  }

  async queryScore(module: string, key: string, locale: string, debugTs?: string): Promise<Record<string, unknown>> {
    return (await this.api.request(`active/v3/${PK_BIZ}/score`, {
      body: { module, key },
      locale,
      debugTimestamp: debugTs,
    })) as Record<string, unknown>;
  }

  async queryContributor(
    module: string,
    key: string,
    player: number,
    locale: string,
    debugTs?: string,
  ): Promise<Record<string, unknown>> {
    return (await this.api.request(`active/v3/${PK_BIZ}/contributor`, {
      body: { module, key, player },
      locale,
      debugTimestamp: debugTs,
    })) as Record<string, unknown>;
  }

  async queryPair(userId: number, locale: string, debugTs?: string): Promise<Record<string, unknown>> {
    return (await this.api.request(`active/v3/${PK_BIZ}/get-pair`, {
      body: {},
      userId,
      locale,
      debugTimestamp: debugTs,
    })) as Record<string, unknown>;
  }

  async queryGlobalFamilyRank(locale: string, debugTs?: string): Promise<unknown> {
    return this.api.request(`active/v3/${PK_BIZ}/global-family-rank`, {
      body: {},
      locale,
      debugTimestamp: debugTs,
    });
  }

  async queryActiveGifts(locale: string, debugTs?: string): Promise<Record<string, unknown>> {
    return (await this.api.request(`active/v3/${PK_BIZ}/active-gifts`, {
      body: {},
      locale,
      debugTimestamp: debugTs,
    })) as Record<string, unknown>;
  }

  async requestRaw(path: string, opts: Parameters<APITestResource['requestRaw']>[1] = {}) {
    return this.api.requestRaw(path, opts);
  }

  // ---------------------------------------------------------------- 消息

  makeOrderNo(prefix = 'PK28GIFT'): string {
    const d = new Date();
    const ts = `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`;
    return `${prefix}_${ts}${pad(Math.floor(Math.random() * 1_000_000), 6)}`;
  }

  async sendGift(p: SendGiftParams): Promise<string> {
    const orderNo = p.orderNo ?? this.makeOrderNo();
    const payload = [{
      id: 193566294,
      order_no: orderNo,
      batch_no: orderNo,
      free: 0,
      sender_id: p.sender,
      receiver_id: p.receiver,
      room_id: p.roomId,
      gift_id: p.giftId,
      gift_class_id: 3790,
      gift_shelf_type: 'voiceroom',
      gift_price: p.totalCoin,
      gift_count: 1,
      scene: null,
      locale: p.locale,
      total_coin: p.totalCoin,
      send_time: p.sendTimeMs,
      create_time: p.sendTimeMs,
      guild_id: p.familyId,
      sign_guild_id: 0,
      mic_index: 0,
      source_name: 'MST',
      host_id: 17084268,
      room_source: 'voiceroom',
      rank_coin: p.rankCoin ?? 200,
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
      debugTimestamp: p.debugTs,
      extraHeaders: { 'l-trace-id': '888888' },
    });
    return orderNo;
  }

  async sendOrderStatus(p: OrderParams): Promise<string> {
    const payload = [{
      transNo: p.transNo,
      orderNo: p.transNo,
      userId: p.userId,
      playerId: p.playerId,
      amount: p.amount,
      mainStatus: p.mainStatus ?? 30,
      finishTime: p.finishMs,
      completeTime: p.finishMs,
      locale: p.locale,
      createTime: p.finishMs,
    }];
    await this.api.request(`active/v3/__consumer/${PK_ORDER_TOPIC}`, {
      body: payload,
      locale: p.locale,
      debugTimestamp: p.debugTs,
    });
    return p.transNo;
  }

  // ---------------------------------------------------------------- MySQL

  async queryRounds(topic?: string, locale?: string): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, locale, topic, \`key\`, start_time, finish_time, status, extra FROM mod_common_round WHERE biz=${quoteStr(PK_BIZ)}`;
    if (topic !== undefined) {
      sql += topic.includes('%') ? ` AND topic LIKE ${quoteStr(topic)}` : ` AND topic=${quoteStr(topic)}`;
    }
    if (locale !== undefined) sql += ` AND locale=${quoteStr(locale)}`;
    sql += ' ORDER BY locale, topic, `key`';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryRankRecords(topic: string, opts: { key?: string; locale?: string } = {}): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, topic, locale, \`key\`, player, trans_no, create_time, amount, total_amount, contributor FROM mod_common_rank_record WHERE biz=${quoteStr(PK_BIZ)} AND topic=${quoteStr(topic)}`;
    if (opts.key !== undefined) sql += ` AND \`key\`=${quoteStr(opts.key)}`;
    if (opts.locale !== undefined) sql += ` AND locale=${quoteStr(opts.locale)}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryPlayerList(key: string, locale?: string): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, \`key\`, player, score, locale, extra FROM mod_common_player_list WHERE biz=${quoteStr(PK_BIZ)} AND \`key\`=${quoteStr(key)}`;
    if (locale !== undefined) sql += ` AND locale=${quoteStr(locale)}`;
    sql += ' ORDER BY score DESC, id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryAwardConfig(name: string): Promise<MysqlRow[]> {
    const sql = `SELECT biz, player_type, name, locale, \`sequence\`, stage, \`mod\`, award_type, award_id, award_count, expire_strategy, expire_express, award_name, award_image, max_times FROM mod_common_award WHERE biz=${quoteStr(PK_BIZ)} AND name=${quoteStr(name)} ORDER BY stage, \`sequence\`, locale`;
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryAwardRecord(
    topic: string,
    opts: { minCreateTime?: number; player?: number | string; playerType?: string; mod?: string } = {},
  ): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, topic, player_type, player, order_no, award_type, award_id, award_count, expire_second, status, create_time, \`mod\`, max_times, remark FROM mod_common_award_record WHERE biz=${quoteStr(PK_BIZ)} AND topic=${quoteStr(topic)}`;
    if (opts.minCreateTime !== undefined) sql += ` AND create_time >= ${Math.trunc(opts.minCreateTime)}`;
    if (opts.player !== undefined) sql += ` AND player=${quoteStr(String(opts.player))}`;
    if (opts.playerType !== undefined) sql += ` AND player_type=${quoteStr(opts.playerType)}`;
    if (opts.mod !== undefined) sql += ` AND \`mod\`=${quoteStr(opts.mod)}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryPairs(topic: string, opts: { key?: string; locale?: string } = {}): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, topic, locale, \`key\`, player_hash, player1, player2, winner, status, extra FROM mod_buff11pk_pair WHERE biz=${quoteStr(PK_BIZ)} AND topic=${quoteStr(topic)}`;
    if (opts.key !== undefined) sql += ` AND \`key\`=${quoteStr(opts.key)}`;
    if (opts.locale !== undefined) sql += ` AND locale=${quoteStr(opts.locale)}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryBuffs(topic: string, opts: { locale?: string; player?: number } = {}): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, topic, locale, player, buff FROM mod_buffpk_player_buff WHERE biz=${quoteStr(PK_BIZ)} AND topic=${quoteStr(topic)}`;
    if (opts.locale !== undefined) sql += ` AND locale=${quoteStr(opts.locale)}`;
    if (opts.player !== undefined) sql += ` AND player=${Math.trunc(opts.player)}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryCouples(topic: string, opts: { key?: string } = {}): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, topic, \`key\`, player1, player2, player, score FROM mod_common_player_couple WHERE biz=${quoteStr(PK_BIZ)} AND topic=${quoteStr(topic)}`;
    if (opts.key !== undefined) sql += ` AND \`key\`=${quoteStr(opts.key)}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryFamilyMembers(familyId: number): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT family_id, user_id, role FROM family_user WHERE family_id=${Math.trunc(familyId)} ORDER BY user_id`,
      'lita_family',
    );
  }

  async queryUserGender(userId: number): Promise<number | null> {
    const rows = await this.mysql.query(
      `SELECT gender FROM user_profile WHERE user_id=${Math.trunc(userId)} LIMIT 1`,
      DB_FUNBIT,
    ).catch(() => [] as MysqlRow[]);
    if (rows.length === 0) return null;
    return Math.trunc(num(rows[0]['gender']));
  }

  /** 幂等写入榜单流水并同步 Redis（不作为“真实链路”证据，仅用于大批量造数） */
  async seedRank(topic: string, key: string, locale: string, entries: SeedEntry[], tag = 'SEED'): Promise<void> {
    if (entries.length === 0) return;
    const values = entries.map((e, i) => {
      const transNo = e.transNo ?? `${tag}:${topic}:${locale}:${key}:${e.player}:${i}`;
      const total = Math.trunc(e.score);
      return `(${quoteStr(PK_BIZ)}, ${quoteStr(topic)}, ${quoteStr(locale)}, ${quoteStr(key)}, ${quoteStr(String(e.player))}, ${quoteStr(transNo)}, ${Math.trunc(e.createTime)}, ${total}, ${total}, '', ${quoteStr(String(e.contributor ?? ''))})`;
    });
    await this.mysql.execute(
      `INSERT INTO mod_common_rank_record (biz, topic, locale, \`key\`, player, trans_no, create_time, amount, total_amount, extra, contributor) VALUES ${values.join(', ')}`,
      DB_ACTIVE,
    );
    const zkey = this.rankRedisKey(topic, locale, key);
    for (const e of entries) {
      await this.redis.zadd(zkey, Math.trunc(e.score), String(e.player));
      if (e.contributor !== undefined && e.contributor !== '') {
        await this.redis.zadd(this.contributorRedisKey(topic, key, e.player), Math.trunc(e.score), String(e.contributor));
      }
    }
  }

  rankRedisKey(topic: string, locale: string, key: string): string {
    return `common:rank:${PK_BIZ}:${topic}:${locale}:${key}`;
  }

  contributorRedisKey(topic: string, key: string, player: number | string): string {
    return `common:rank:c2p:${PK_BIZ}:${topic}:${key}:${player}`;
  }

  async cleanTopic(topic: string, locale?: string): Promise<void> {
    const loc = locale !== undefined ? ` AND locale=${quoteStr(locale)}` : '';
    await this.mysql.execute(
      `DELETE FROM mod_common_rank_record WHERE biz=${quoteStr(PK_BIZ)} AND topic=${quoteStr(topic)}${loc}`,
      DB_ACTIVE,
    );
    await this.mysql.execute(
      `DELETE FROM mod_common_round WHERE biz=${quoteStr(PK_BIZ)} AND topic=${quoteStr(topic)}${loc}`,
      DB_ACTIVE,
    );
    await this.mysql.execute(
      `DELETE FROM mod_common_award_record WHERE biz=${quoteStr(PK_BIZ)} AND (topic=${quoteStr(topic)} OR topic LIKE ${quoteStr(`${topic}-%`)})${loc}`,
      DB_ACTIVE,
    );
    await this.mysql.execute(
      `DELETE FROM mod_buff11pk_pair WHERE biz=${quoteStr(PK_BIZ)} AND topic=${quoteStr(topic)}${loc}`,
      DB_ACTIVE,
    );
    await this.mysql.execute(
      `DELETE FROM mod_buffpk_player_buff WHERE biz=${quoteStr(PK_BIZ)} AND topic=${quoteStr(topic)}${loc}`,
      DB_ACTIVE,
    );
  }

  async cleanPlayerList(key: string, locale?: string): Promise<void> {
    const loc = locale !== undefined ? ` AND locale=${quoteStr(locale)}` : '';
    await this.mysql.execute(
      `DELETE FROM mod_common_player_list WHERE biz=${quoteStr(PK_BIZ)} AND \`key\`=${quoteStr(key)}${loc}`,
      DB_ACTIVE,
    );
  }

  /** 按 key 前缀清理名单（含阶段主榜与日榜/1v1 子轮次） */
  async cleanPlayerListPrefix(prefix: string, locale?: string): Promise<void> {
    const loc = locale !== undefined ? ` AND locale=${quoteStr(locale)}` : '';
    await this.mysql.execute(
      `DELETE FROM mod_common_player_list WHERE biz=${quoteStr(PK_BIZ)} AND \`key\` LIKE ${quoteStr(`${prefix}%`)}${loc}`,
      DB_ACTIVE,
    );
  }

  async cleanRedis(topic: string, key = '-', locale = 'in'): Promise<void> {
    const prefixes = [
      `common:rank:p2c:${PK_BIZ}:${topic}:${key}:`,
      `common:rank:c2p:${PK_BIZ}:${topic}:${key}:`,
      `common:rank:${PK_BIZ}:${topic}:${locale}:${key}`,
    ];
    for (const prefix of prefixes) {
      try {
        await this.redis.clearByPrefix(prefix);
      } catch {
        // Redis 清理失败不阻断用例
      }
    }
  }

  async cleanAll(): Promise<void> {
    for (const table of [
      'mod_common_rank_record',
      'mod_common_round',
      'mod_common_award_record',
      'mod_buff11pk_pair',
      'mod_buffpk_player_buff',
      'mod_common_player_list',
      'mod_common_player_couple',
    ]) {
      await this.mysql.execute(`DELETE FROM ${table} WHERE biz=${quoteStr(PK_BIZ)}`, DB_ACTIVE);
    }
    try {
      await this.redis.clearByPattern(`*${PK_BIZ}*`);
    } catch {
      // ignore
    }
  }
}