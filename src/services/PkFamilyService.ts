import type { APITestResource } from '../resources/APITestResource.ts';
import type { MySQLTestResource, MysqlRow } from '../resources/MySQLTestResource.ts';
import type { RedisTestResource } from '../resources/RedisTestResource.ts';

const BIZ = 'pk-ai-test';

const DB_ACTIVE = 'lita_active';
const DB_FAMILY = 'lita_family';
const DB_FUNBIT = 'funbit';

const TRANSLATE_HOST_SHEET = 'Activity$pk-260817';

export interface PkFamilyServiceDeps {
  api: APITestResource;
  mysql: MySQLTestResource;
  redis: RedisTestResource;
}

export interface RankRawEntry {
  player: number | string;
  amount?: number | string;
  rank?: number | string;
  [key: string]: unknown;
}

export interface RankRawResult {
  round?: unknown;
  rankResult?: RankRawEntry[];
  [key: string]: unknown;
}

export interface FamilyRankEntry {
  player: number;
  amount: number;
  rank: number;
}

export interface SendGiftParams {
  sender: number;
  receiver: number;
  familyId: number;
  giftId: number;
  giftPrice: number;
  sendTimeMs: number;
  rankCoin?: number;
  orderNo?: string;
  debugTs: string;
  locale?: string;
}

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`PkFamilyService: invalid numeric value: ${n}`);
  }
  return str;
}

function quoteVal(v: number | string): string {
  return typeof v === 'number' ? quoteNum(v) : quoteStr(v);
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/**
 * 家族榜（family_in_* / family 总榜）业务服务，绑定测试环境资源。
 * 对应源端 FamilyTestBase 的家族专用方法。
 */
export class PkFamilyService {
  readonly api: APITestResource;
  readonly mysql: MySQLTestResource;
  readonly redis: RedisTestResource;

  constructor(deps: PkFamilyServiceDeps) {
    this.api = deps.api;
    this.mysql = deps.mysql;
    this.redis = deps.redis;
  }

  async callFamilyInit(debugTs: string, locale = 'in'): Promise<unknown> {
    return this.api.request(`active/v3/${BIZ}/p/family-init`, {
      body: {},
      locale,
      debugTimestamp: debugTs,
    });
  }

  async callFamilySettle(debugTs: string, locale = 'in'): Promise<unknown> {
    return this.api.request(`active/v3/${BIZ}/p/family-settle`, {
      body: {},
      locale,
      debugTimestamp: debugTs,
    });
  }

  async callInit(topic: string, debugTs: string, userId: number | string, locale = 'in'): Promise<unknown> {
    return this.api.request(`active/v3/${BIZ}/m/${topic}/init`, {
      body: {},
      userId,
      locale,
      debugTimestamp: debugTs,
    });
  }

  makeOrderNo(): string {
    const d = new Date();
    const ts = `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}${pad(d.getHours(), 2)}${pad(d.getMinutes(), 2)}${pad(d.getSeconds(), 2)}`;
    const micro = pad(Math.floor(Math.random() * 1_000_000), 6);
    return `AI_FAMILY_GIFT_${ts}${micro}`;
  }

  async sendGift(params: SendGiftParams): Promise<string> {
    const orderNo = params.orderNo ?? this.makeOrderNo();
    const locale = params.locale ?? 'in';
    const payload = [{
      id: 193566294,
      order_no: orderNo,
      batch_no: orderNo.split('_NO')[0],
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
      total_coin: params.giftPrice,
      send_time: params.sendTimeMs,
      create_time: params.sendTimeMs,
      guild_id: params.familyId,
      sign_guild_id: 0,
      mic_index: 0,
      source_name: 'MST',
      host_id: 17084268,
      room_source: 'voiceroom',
      rank_coin: params.rankCoin ?? 200,
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

  async queryRounds(topic?: string, locale?: string): Promise<MysqlRow[]> {
    let sql = `SELECT locale, topic, \`key\`, start_time, finish_time, status FROM mod_common_round WHERE biz=${quoteStr(BIZ)}`;
    if (topic !== undefined) {
      if (topic.includes('%')) sql += ` AND topic LIKE ${quoteStr(topic)}`;
      else sql += ` AND topic=${quoteStr(topic)}`;
    }
    if (locale !== undefined) sql += ` AND locale=${quoteStr(locale)}`;
    sql += ' ORDER BY locale, topic, `key`';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async cleanFamilyRounds(): Promise<number> {
    return this.mysql.execute(
      `DELETE FROM mod_common_round WHERE biz=${quoteStr(BIZ)} AND topic LIKE 'family%'`,
      DB_ACTIVE,
    );
  }

  async resetRoundStatus(topic: string, status: number): Promise<number> {
    return this.mysql.execute(
      `UPDATE mod_common_round SET status=${quoteNum(status)} WHERE biz=${quoteStr(BIZ)} AND topic=${quoteStr(topic)}`,
      DB_ACTIVE,
    );
  }

  async cleanHistory(topic: string): Promise<void> {
    await this.mysql.execute(
      `DELETE FROM mod_common_rank_record WHERE biz=${quoteStr(BIZ)} AND topic=${quoteStr(topic)} AND \`key\`='-'`,
      DB_ACTIVE,
    );
    await this.mysql.execute(
      `DELETE FROM mod_common_player_list WHERE biz=${quoteStr(BIZ)} AND \`key\`=${quoteStr(topic)}`,
      DB_ACTIVE,
    );
    await this.mysql.execute(
      `DELETE FROM mod_common_award_record WHERE biz=${quoteStr(BIZ)} AND topic LIKE '${topic}%'`,
      DB_ACTIVE,
    );
  }

  async cleanRankRedis(topic: string, key = '-', locale = 'in'): Promise<void> {
    const prefixes = [
      `common:rank:p2c:${BIZ}:${topic}:${key}:`,
      `common:rank:c2p:${BIZ}:${topic}:${key}:`,
      `common:rank:${BIZ}:${topic}:${locale}:${key}`,
    ];
    for (const prefix of prefixes) {
      try {
        await this.redis.clearByPrefix(prefix);
      } catch {
        // 清理失败不阻断用例（源端仅 WARN）
      }
    }
  }

  async queryRank(
    topic: string,
    key: string,
    userId: number | string,
    opts: { locale?: string; count?: number; debugTs?: string; includeMine?: boolean } = {},
  ): Promise<RankRawResult> {
    const data = await this.api.request(`active/v3/${BIZ}/m/${topic}/rank`, {
      body: {
        key,
        count: opts.count ?? 200,
        locale: null,
        includeMine: opts.includeMine ?? false,
      },
      userId,
      locale: opts.locale ?? 'in',
      debugTimestamp: opts.debugTs,
    });
    return (data ?? {}) as RankRawResult;
  }

  async queryPlayerList(key: string, locale = 'in'): Promise<MysqlRow[]> {
    const sql = `SELECT id, biz, \`key\`, player, score, locale, extra FROM mod_common_player_list WHERE biz=${quoteStr(BIZ)} AND \`key\`=${quoteStr(key)} AND locale=${quoteStr(locale)} ORDER BY score DESC`;
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryAwardConfig(name: string): Promise<MysqlRow[]> {
    const sql = `SELECT locale, \`sequence\`, stage, \`mod\`, award_type, award_id, award_name, award_count, expire_strategy, expire_express, stock, weight, max_times FROM mod_common_award WHERE biz=${quoteStr(BIZ)} AND name=${quoteStr(name)} ORDER BY stage, \`sequence\``;
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryAwardRecord(
    topic: string,
    opts: { minCreateTime?: number; player?: number | string; playerType?: number | string } = {},
  ): Promise<MysqlRow[]> {
    let sql = `SELECT id, biz, topic, player_type, player, order_no, award_type, award_id, award_count, expire_second, status, create_time, update_time, remark, \`mod\`, max_times FROM mod_common_award_record WHERE biz=${quoteStr(BIZ)} AND topic=${quoteStr(topic)}`;
    if (opts.minCreateTime !== undefined) sql += ` AND create_time >= ${quoteNum(opts.minCreateTime)}`;
    if (opts.player !== undefined) sql += ` AND player=${quoteVal(opts.player)}`;
    if (opts.playerType !== undefined) sql += ` AND player_type=${quoteVal(opts.playerType)}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_ACTIVE);
  }

  async queryFamilyReceivers(familyIds: (number | string)[]): Promise<Record<number, number[]>> {
    if (familyIds.length === 0) return {};
    const ids = familyIds.map((f) => quoteNum(f)).join(', ');
    const rows = await this.mysql.query(
      `SELECT family_id, user_id FROM family_user WHERE family_id IN (${ids}) AND role IN ('owner','manager') ORDER BY user_id`,
      DB_FAMILY,
    );
    const result: Record<number, number[]> = {};
    for (const r of rows) {
      const fid = Number(r['family_id']);
      if (!Number.isFinite(fid)) continue;
      (result[fid] ??= []).push(Number(r['user_id']));
    }
    return result;
  }

  async queryLitaTeamMessages(
    userIds: (number | string)[],
    opts: { date?: string; biz?: string; sender?: number } = {},
  ): Promise<MysqlRow[]> {
    const ids = userIds.map((u) => String(Number(u))).join(', ');
    if (!ids) return [];
    const date = opts.date ?? new Date().toISOString().slice(0, 10);
    let sql = `SELECT receive_user_id, content, extra, message_type, function_type, \`date\` FROM im_message WHERE \`date\`=${quoteStr(date)} AND receive_user_id IN (${ids}) AND sender_user_id=${quoteNum(opts.sender ?? 2)}`;
    if (opts.biz !== undefined) sql += ` AND biz=${quoteStr(opts.biz)}`;
    sql += ' ORDER BY id';
    return this.mysql.query(sql, DB_FUNBIT);
  }

  async translate(keys: string[], locale = 'in', sheet = TRANSLATE_HOST_SHEET): Promise<Record<string, string>> {
    const data = await this.api.request('basic-common/v1/word/translate', {
      body: { locale, sheet, keys },
    });
    const result = (data ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = String(result[k] ?? '').trim();
      if (!v) {
        throw new Error(`多语言缺少 key: ${k}（locale=${locale}, sheet=${sheet}）`);
      }
      out[k] = v;
    }
    return out;
  }
}
