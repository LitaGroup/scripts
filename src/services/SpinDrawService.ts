import crypto from 'node:crypto';
import type { MySQLTestResource, MysqlRow } from '../resources/MySQLTestResource.ts';
import type { RedisTestResource } from '../resources/RedisTestResource.ts';

/**
 * 水果机（spin/draw，litaroom 服务）测试环境业务服务。
 *
 * 接口鉴权：SpinDrawController 的 @SessionVerifier 走 AccessTokenCheckLoginVerify，
 * 只对 AccessToken 做 AES 解密（不查 Redis、不校验过期），测试环境 AES key 与
 * funbit-api SessionConfig 非 PROD 模式配置一致（to_sigNon_eNckey），
 * 因此可按 RedisToken 二进制格式本地伪造任意用户 token 直接调接口。
 *
 * 存储：图鉴与抽奖表在 funbit 库；gift_award_queue / user_blind_pack* 在 basic 库。
 * 注意：接口响应里的数字字段均被序列化为字符串（如 "albumStar":"0"），读取需 Number()。
 */

const HOST = 'https://api.test.cinta.team/';
const TOKEN_AES_KEY = 'to_sigNon_eNckey';
const DEFAULT_TIMEOUT_MS = 30_000;

export const DB_FUNBIT = 'funbit';
export const DB_BASIC = 'basic';

/** 图鉴池配置项（spin_draw_album_gift_config） */
export interface AlbumGiftConfig {
  awardId: number;
  awardType: string;
  star1Num: number;
  star2Num: number;
  star3Num: number;
}

/** 图鉴星级奖励配置（spin_draw_album_reward_config） */
export interface AlbumRewardConfig {
  star: number;
  awardId: number;
  awardType: string;
  awardNum: number;
  expiresSecond: number;
}

/** 图鉴面板池内项（albumPanel giftList 元素，数字字段原始为字符串） */
export interface AlbumGiftInfo {
  awardId: number;
  awardType: string;
  collectNum: number;
  currentStar: number;
  nextStarNum: number;
  star1Num: number;
  star2Num: number;
  star3Num: number;
  name: string;
}

/** 图鉴面板星级奖励（albumPanel rewardList 元素） */
export interface AlbumRewardInfo {
  star: number;
  awardId: number;
  awardType: string;
  awardNum: number;
  awardName: string;
  canReceive: boolean;
}

export interface AlbumPanelData {
  defaultStarTab: number;
  giftList: AlbumGiftInfo[];
  rewardList: AlbumRewardInfo[];
}

export interface DrawResultData {
  batchNo: string;
  shouAwardList: Array<{ awardId: number; awardType: string; awardNum: number }>;
}

export interface AlbumReceiveData {
  awardId: number;
  awardType: string;
  awardNum: number;
  awardName: string;
}

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`SpinDrawService: invalid numeric value: ${n}`);
  }
  return str;
}

/** 池内项复合定位 key：awardType + ':' + awardId（礼物/道具 awardId 分属两套表会撞号） */
export function albumKey(awardType: string, awardId: number | string): string {
  return `${awardType}:${awardId}`;
}

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function asList(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

/**
 * 按 RedisToken 新版格式伪造 AccessToken（40 字节定长）：
 * header"LITA"(4) + tokenVersion int(4) + userId long(8) + "MU"(2)
 * + expireAt long(8) + random int(4) + sessionVersion long(8) + clientSide short(2)
 * AES/ECB/PKCS5Padding 加密后标准 base64。
 */
export function makeAccessToken(userId: number | string): string {
  const buf = Buffer.alloc(40);
  let o = 0;
  buf.write('LITA', o, 'latin1'); o += 4;
  buf.writeInt32BE(1, o); o += 4;
  buf.writeBigInt64BE(BigInt(userId), o); o += 8;
  buf.write('MU', o, 'latin1'); o += 2;
  buf.writeBigInt64BE(BigInt(Date.now() + 30 * 24 * 3600_000), o); o += 8;
  buf.writeInt32BE(1, o); o += 4;
  buf.writeBigInt64BE(BigInt(1), o); o += 8;
  buf.writeInt16BE(1, o); // clientSide=APP
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(TOKEN_AES_KEY, 'utf8'), null);
  return Buffer.concat([cipher.update(buf), cipher.final()]).toString('base64');
}

export interface SpinDrawServiceDeps {
  mysql: MySQLTestResource;
  redis: RedisTestResource;
}

export class SpinDrawService {
  readonly mysql: MySQLTestResource;
  readonly redis: RedisTestResource;

  constructor(deps: SpinDrawServiceDeps) {
    this.mysql = deps.mysql;
    this.redis = deps.redis;
  }

  // ==================== HTTP 接口（litaroom / lita-basic） ====================

  /** 通用 POST：path 带服务前缀（如 litaroom/spin/draw/panel、litabasic/blindpack/openBlindPack） */
  async request(path: string, userId: number | string, body: Record<string, unknown> = {}): Promise<unknown> {
    const url = HOST.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AccessToken': makeAccessToken(userId),
        'appPlat': 'Android',
        'appVersion': '1.590',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    const data = asRecord(await res.json().catch(() => null));
    if (res.status >= 400) {
      throw new Error(`SpinDrawService: HTTP ${res.status}: ${data['msg'] ?? res.statusText}`);
    }
    const status = toNum(data['status']);
    if (status !== 0) {
      throw new Error(`SpinDrawService: 业务错误 status=${data['status']}: ${data['msg'] ?? ''}`);
    }
    return data['data'];
  }

  /** 活动面板：返回 albumStar（可领取星级）、diamond/coin 余额等 */
  async panel(userId: number | string, drawLevel: number, phase: number): Promise<Record<string, unknown>> {
    return asRecord(await this.request('litaroom/spin/draw/panel', userId, { drawLevel, phase }));
  }

  /** 图鉴面板；池未配置时服务端返回 null */
  async albumPanel(userId: number | string, drawLevel: number): Promise<AlbumPanelData | null> {
    const data = await this.request('litaroom/spin/draw/albumPanel', userId, { drawLevel });
    if (data === null || data === undefined) return null;
    const d = asRecord(data);
    return {
      defaultStarTab: toNum(d['defaultStarTab']),
      giftList: asList(d['giftList']).map((g) => ({
        awardId: toNum(g['awardId']),
        awardType: String(g['awardType'] ?? ''),
        collectNum: toNum(g['collectNum']),
        currentStar: toNum(g['currentStar']),
        nextStarNum: toNum(g['nextStarNum']),
        star1Num: toNum(g['star1Num']),
        star2Num: toNum(g['star2Num']),
        star3Num: toNum(g['star3Num']),
        name: String(g['name'] ?? ''),
      })),
      rewardList: asList(d['rewardList']).map((r) => ({
        star: toNum(r['star']),
        awardId: toNum(r['awardId']),
        awardType: String(r['awardType'] ?? ''),
        awardNum: toNum(r['awardNum']),
        awardName: String(r['awardName'] ?? ''),
        canReceive: r['canReceive'] === true || r['canReceive'] === 'true',
      })),
    };
  }

  /** 抽奖：返回 batchNo 与本批奖励（需再 confirmReceive 才真正到手并累计图鉴） */
  async doDraw(
    userId: number | string,
    opts: { dealType: string; drawLevel: number; drawNum: number; roomId: number | string },
  ): Promise<DrawResultData> {
    const d = asRecord(await this.request('litaroom/spin/draw/doDraw', userId, {
      dealType: opts.dealType,
      drawLevel: opts.drawLevel,
      drawNum: opts.drawNum,
      roomId: opts.roomId,
    }));
    return {
      batchNo: String(d['batchNo'] ?? ''),
      shouAwardList: asList(d['shouAwardList']).map((a) => ({
        awardId: toNum(a['awardId']),
        awardType: String(a['awardType'] ?? ''),
        awardNum: toNum(a['awardNum']),
      })),
    };
  }

  /** 收下（不翻倍）：实际发奖 + 累计图鉴收集进度 */
  async confirmReceive(userId: number | string, batchNo: string): Promise<void> {
    await this.request('litaroom/spin/draw/confirmReceive', userId, { batchNo });
  }

  /** 领取图鉴星级奖励（宝藏袋） */
  async albumReceive(
    userId: number | string,
    opts: { drawLevel: number; star: number; roomId?: number | string },
  ): Promise<AlbumReceiveData> {
    const d = asRecord(await this.request('litaroom/spin/draw/albumReceive', userId, {
      drawLevel: opts.drawLevel,
      star: opts.star,
      roomId: opts.roomId,
    }));
    return {
      awardId: toNum(d['awardId']),
      awardType: String(d['awardType'] ?? ''),
      awardNum: toNum(d['awardNum']),
      awardName: String(d['awardName'] ?? ''),
    };
  }

  /** 开启宝藏袋（lita-basic） */
  async openBlindPack(userId: number | string, groupKey: string, count = 1): Promise<unknown> {
    return this.request('litabasic/blindpack/openBlindPack', userId, { groupKey, count });
  }

  // ==================== MySQL 查询（funbit 库） ====================

  async queryUserLocale(userId: number | string): Promise<string | null> {
    const rows = await this.mysql.query(
      `SELECT locale FROM user_config WHERE id=${quoteNum(userId)}`,
      DB_FUNBIT,
    );
    return rows.length > 0 ? String(rows[0]['locale']) : null;
  }

  /** 图鉴礼物池配置（未配置返回空数组，前端不展示图鉴） */
  async queryAlbumGiftConfig(locale: string, drawLevel: number): Promise<AlbumGiftConfig[]> {
    const rows = await this.mysql.query(
      `SELECT award_id, award_type, star1_num, star2_num, star3_num FROM spin_draw_album_gift_config WHERE locale=${quoteStr(locale)} AND draw_level=${quoteNum(drawLevel)} ORDER BY sort`,
      DB_FUNBIT,
    );
    return rows.map((r) => ({
      awardId: toNum(r['award_id']),
      awardType: String(r['award_type']),
      star1Num: toNum(r['star1_num']),
      star2Num: toNum(r['star2_num']),
      star3Num: toNum(r['star3_num']),
    }));
  }

  async queryAlbumRewardConfig(locale: string, drawLevel: number): Promise<AlbumRewardConfig[]> {
    const rows = await this.mysql.query(
      `SELECT star, award_id, award_type, award_num, expires_second FROM spin_draw_album_reward_config WHERE locale=${quoteStr(locale)} AND draw_level=${quoteNum(drawLevel)} ORDER BY star`,
      DB_FUNBIT,
    );
    return rows.map((r) => ({
      star: toNum(r['star']),
      awardId: toNum(r['award_id']),
      awardType: String(r['award_type']),
      awardNum: toNum(r['award_num']),
      expiresSecond: toNum(r['expires_second']),
    }));
  }

  /** 用户收集进度（已按 collect_date 当天隔离，调用方先清理则全量即当日） */
  async queryAlbumProgress(userId: number | string, drawLevel: number): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT award_id, award_type, collect_date, collect_num FROM spin_draw_album_user_progress WHERE user_id=${quoteNum(userId)} AND draw_level=${quoteNum(drawLevel)}`,
      DB_FUNBIT,
    );
  }

  async queryAlbumReceiveRecords(userId: number | string, drawLevel: number): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, star, award_id, collect_date, create_time FROM spin_draw_album_receive_record WHERE user_id=${quoteNum(userId)} AND draw_level=${quoteNum(drawLevel)} ORDER BY id`,
      DB_FUNBIT,
    );
  }

  /** 抽奖实际到手明细（spin_draw_record_detail），按 awardType+awardId 聚合 */
  async queryDrawDetailSummary(userId: number | string, batchNos: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (batchNos.length === 0) return result;
    const ins = batchNos.map(quoteStr).join(', ');
    const rows = await this.mysql.query(
      `SELECT award_id, award_type, SUM(award_num) AS total FROM spin_draw_record_detail WHERE user_id=${quoteNum(userId)} AND batch_no IN (${ins}) GROUP BY award_type, award_id`,
      DB_FUNBIT,
    );
    for (const r of rows) {
      result.set(albumKey(String(r['award_type']), String(r['award_id'])), toNum(r['total']));
    }
    return result;
  }

  /** 当前 collect_date：优先取已有进度行的大区日期；无行时按服务端默认大区时区 GMT+7 计算 */
  async currentCollectDate(userId: number | string, drawLevel: number): Promise<string> {
    const rows = await this.mysql.query(
      `SELECT collect_date FROM spin_draw_album_user_progress WHERE user_id=${quoteNum(userId)} AND draw_level=${quoteNum(drawLevel)} ORDER BY id DESC LIMIT 1`,
      DB_FUNBIT,
    );
    if (rows.length > 0) return String(rows[0]['collect_date']);
    // 服务端 SystemPropertiesCacheService#getRankLocaleTimeZone 缺省 GMT+7:00
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Etc/GMT-7',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date()).replace(/-/g, '');
  }

  /** 造数：把池内各项当日进度提升到 star 档要求（GREATEST 保底不回退，未配置该档要求的项跳过） */
  async seedProgressToStar(
    userId: number | string,
    locale: string,
    drawLevel: number,
    pool: AlbumGiftConfig[],
    star: 1 | 2 | 3,
    collectDate: string,
  ): Promise<void> {
    const now = Date.now();
    for (const item of pool) {
      const need = star === 1 ? item.star1Num : star === 2 ? item.star2Num : item.star3Num;
      if (need <= 0) continue;
      await this.mysql.execute(
        `INSERT INTO spin_draw_album_user_progress (user_id, locale, draw_level, award_id, award_type, collect_date, collect_num, create_time, update_time)
         VALUES (${quoteNum(userId)}, ${quoteStr(locale)}, ${quoteNum(drawLevel)}, ${quoteNum(item.awardId)}, ${quoteStr(item.awardType)}, ${quoteStr(collectDate)}, ${quoteNum(need)}, ${quoteNum(now)}, ${quoteNum(now)})
         ON DUPLICATE KEY UPDATE collect_num = GREATEST(collect_num, ${quoteNum(need)}), update_time = ${quoteNum(now)}`,
        DB_FUNBIT,
      );
    }
  }

  // ==================== MySQL 查询（basic 库：发奖队列 / 宝藏袋） ====================

  /** gift_award_queue 当前最大 id（基线，之后的新行即本次发放） */
  async giftAwardQueueBaseline(userId: number | string): Promise<number> {
    const rows = await this.mysql.query(
      `SELECT COALESCE(MAX(id), 0) AS max_id FROM gift_award_queue WHERE user_id=${quoteNum(userId)}`,
      DB_BASIC,
    );
    return toNum(rows[0]?.['max_id']);
  }

  async queryGiftAwardQueueNew(userId: number | string, sinceId: number): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, order_no, award_type, award_id, award_count, award_status, active_name, create_time FROM gift_award_queue WHERE user_id=${quoteNum(userId)} AND id>${quoteNum(sinceId)} ORDER BY id`,
      DB_BASIC,
    );
  }

  async queryUserBlindPacks(userId: number | string, packId: number): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT user_id, group_key, pack_id, pack_count, invalid_time FROM user_blind_pack WHERE user_id=${quoteNum(userId)} AND pack_id=${quoteNum(packId)}`,
      DB_BASIC,
    );
  }

  async queryUserBlindPackAwards(userId: number | string, packId: number): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT id, order_no, group_key, pack_id, pack_count, pack_inside_id FROM user_blind_pack_award WHERE user_id=${quoteNum(userId)} AND pack_id=${quoteNum(packId)} ORDER BY id`,
      DB_BASIC,
    );
  }

  // ==================== 清理 ====================

  /** 清空用户图鉴数据（进度 + 领取记录） */
  async cleanAlbumData(userId: number | string): Promise<void> {
    await this.mysql.execute(
      `DELETE FROM spin_draw_album_user_progress WHERE user_id=${quoteNum(userId)}`,
      DB_FUNBIT,
    );
    await this.mysql.execute(
      `DELETE FROM spin_draw_album_receive_record WHERE user_id=${quoteNum(userId)}`,
      DB_FUNBIT,
    );
  }

  /** 清空用户指定宝藏袋数据（背包 / 开袋记录 / 入袋明细） */
  async cleanBlindPack(userId: number | string, packId: number): Promise<void> {
    await this.mysql.execute(
      `DELETE FROM user_blind_pack WHERE user_id=${quoteNum(userId)} AND pack_id=${quoteNum(packId)}`,
      DB_BASIC,
    );
    await this.mysql.execute(
      `DELETE FROM user_blind_pack_award WHERE user_id=${quoteNum(userId)} AND pack_id=${quoteNum(packId)}`,
      DB_BASIC,
    );
    await this.mysql.execute(
      `DELETE FROM user_blind_pack_in_detail WHERE user_id=${quoteNum(userId)} AND pack_id=${quoteNum(packId)}`,
      DB_BASIC,
    );
  }

  /** 清理水果机相关 Redis（spinDraw:* 在房间 Redis 实例，可能与本资源不同实例，失败不阻断） */
  async cleanRedis(userId: number | string): Promise<void> {
    for (const pattern of [`spinDraw:*:${userId}*`, `spin_draw_*${userId}*`]) {
      try {
        await this.redis.clearByPattern(pattern);
      } catch {
        // 清理失败不阻断用例
      }
    }
  }
}
