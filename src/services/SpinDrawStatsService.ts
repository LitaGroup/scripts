import { ServiceBase, type Env } from './ServiceBase.ts';
import type { QueryResult } from '../resources/MySQLProdResource.ts';

/**
 * 水果机（spin draw）只读统计查询。
 *
 * 口径唯一依据：/task/20261106/TK-0088/CALIBER（口径确认单 v1）
 * 方案与契约：/task/20261106/TK-0089/TECH_DESIGN、API
 *
 * 约定：
 * - 事实表 dws_game_spin_draw_award，粒度 dt + locale + user_id + room_id，dt 为北京时间自然日。
 * - SQL 只返回求和字段，比率统一在本服务计算（分母 <= 0 返回 null），避免两套舍入逻辑。
 * - 排除 user_id = 0 与 user_info.is_fake = TRUE。
 */

const ODPS_DB = 'odps' as const;
const TABLE = 'dws_game_spin_draw_award';
const USER_INFO = 'user_info';

/** 预警查询允许的最大行数（大区、TOP 用户等小结果集） */
const SMALL_LIMIT = 100;
/** 明细/每日/房间查询行数上限 */
const DETAIL_LIMIT = 2000;

export const MAX_RANGE_DAYS = 90;

export interface SpinDrawSums {
  lotteryCost: number;
  lotteryReward: number;
  lotteryProfit: number;
  doubleCost: number;
  doubleWin: number;
  doubleFailureAdd: number;
  doubleProfit: number;
  lampReward: number;
  dismantleAmount: number;
  pnl: number;
}

export interface LocaleMetric extends SpinDrawSums {
  locale: string;
}

export interface TopUser {
  rank: number;
  uid: number;
  locale: string;
  pnl1d: number;
  rtp1d: number | null;
  pnl7d: number;
  rtp7d: number | null;
  pnl30d: number;
  rtp30d: number | null;
}

export interface TopRoom {
  roomId: number;
  cost: number;
}

export interface IdentityCheck {
  totalProfitDiff: number;
  lotteryDiff: number;
  doubleDiff: number;
}

export interface LotteryBlock {
  cost: number;
  reward: number;
  profit: number;
  rtp: number | null;
}

export interface DoubleBlock {
  cost: number;
  win: number;
  failureAdd: number;
  profit: number;
  rtp: number | null;
}

export interface DismantleBlock {
  amount: number;
  ratio: number | null;
}

export interface ReportSummary {
  pnl: number;
  rtp: number | null;
  lottery: LotteryBlock;
  double: DoubleBlock;
  lampReward: number;
  dismantle: DismantleBlock;
  topRooms: TopRoom[];
}

export interface UserDaily {
  date: string;
  pnl: number;
  rtp: number | null;
  lottery: LotteryBlock;
  double: DoubleBlock;
  lampReward: number;
  dismantle: DismantleBlock;
  topRooms: TopRoom[];
}

export interface UserReport {
  uid: number;
  startDate: string;
  endDate: string;
  hasData: boolean;
  partial: boolean;
  missingDates: string[];
  dataThrough: string | null;
  currency: string;
  summary: ReportSummary;
  daily: UserDaily[];
}

/** 四舍五入保留 2 位小数（补偿二进制浮点误差） */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 比率（百分比）：分母 <= 0 返回 null */
export function ratioPct(numerator: number, denominator: number): number | null {
  if (!(denominator > 0)) return null;
  return round2((numerator / denominator) * 100);
}

/** 返奖率（百分比）：1 + 盈亏/投入；投入 <= 0 返回 null */
export function rtpPct(pnl: number, cost: number): number | null {
  if (!(cost > 0)) return null;
  return round2((1 + pnl / cost) * 100);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 严格校验 YYYY-MM-DD 且为真实存在的日期 */
export function assertDate(value: unknown): string {
  const s = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`日期格式非法（需 YYYY-MM-DD）: ${s}`);
  }
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`日期不存在: ${s}`);
  }
  return s;
}

/** 严格校验用户 ID：正整数 */
export function assertUid(value: unknown): number {
  const s = String(value ?? '');
  if (!/^\d+$/.test(s) || Number(s) <= 0 || !Number.isSafeInteger(Number(s))) {
    throw new Error(`uid 非法（需正整数字符串/数字）: ${s}`);
  }
  return Number(s);
}

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return formatDate(t);
}

function diffDays(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** 北京时间昨日（Asia/Shanghai = UTC+8，无夏令时） */
export function beijingYesterday(now: Date = new Date()): string {
  const t = new Date(now.getTime() + 8 * 3_600_000 - 86_400_000);
  return formatDate(t);
}

/** 北京时间“今天” */
export function beijingToday(now: Date = new Date()): string {
  return formatDate(new Date(now.getTime() + 8 * 3_600_000));
}

function toStringArray(value: unknown): string {
  return String(value ?? '');
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`期望数值，实际: ${String(value)}`);
  }
  return n;
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return String(value ?? '').toLowerCase() === 'true';
}

const SUM_SELECT = `SUM(lottery_cost)        AS lottery_cost,
       SUM(lottery_reward)      AS lottery_reward,
       SUM(lottery_profit)      AS lottery_profit,
       SUM(double_cost)         AS double_cost,
       SUM(double_win)          AS double_win,
       SUM(double_failure_add)  AS double_failure_add,
       SUM(double_profit)       AS double_profit,
       SUM(lamp_reward)         AS lamp_reward,
       SUM(fruit_diamond_amt)   AS fruit_diamond_amt,
       SUM(total_profit)        AS total_profit`;

function rowToSums(row: unknown[]): SpinDrawSums {
  return {
    lotteryCost: toNumber(row[0]),
    lotteryReward: toNumber(row[1]),
    lotteryProfit: toNumber(row[2]),
    doubleCost: toNumber(row[3]),
    doubleWin: toNumber(row[4]),
    doubleFailureAdd: toNumber(row[5]),
    doubleProfit: toNumber(row[6]),
    lampReward: toNumber(row[7]),
    dismantleAmount: toNumber(row[8]),
    pnl: toNumber(row[9]),
  };
}

function emptySums(): SpinDrawSums {
  return {
    lotteryCost: 0,
    lotteryReward: 0,
    lotteryProfit: 0,
    doubleCost: 0,
    doubleWin: 0,
    doubleFailureAdd: 0,
    doubleProfit: 0,
    lampReward: 0,
    dismantleAmount: 0,
    pnl: 0,
  };
}

function toSummary(sums: SpinDrawSums, topRooms: TopRoom[]): ReportSummary {
  return {
    pnl: sums.pnl,
    rtp: rtpPct(sums.pnl, sums.lotteryCost),
    lottery: {
      cost: sums.lotteryCost,
      reward: sums.lotteryReward,
      profit: sums.lotteryProfit,
      rtp: ratioPct(sums.lotteryReward, sums.lotteryCost),
    },
    double: {
      cost: sums.doubleCost,
      win: sums.doubleWin,
      failureAdd: sums.doubleFailureAdd,
      profit: sums.doubleProfit,
      rtp: ratioPct(sums.doubleWin, sums.doubleCost - sums.doubleFailureAdd),
    },
    lampReward: sums.lampReward,
    dismantle: {
      amount: sums.dismantleAmount,
      ratio: ratioPct(sums.dismantleAmount, sums.lotteryCost),
    },
    topRooms,
  };
}

export class SpinDrawStatsService extends ServiceBase {
  constructor(env: Env = 'prod') {
    super(env);
  }

  /** 分区是否存在且有数据（预警前置校验，缺失时不得推送 0） */
  async assertPartitionReady(dt: string): Promise<{ ready: boolean; rowCount: number }> {
    const day = assertDate(dt);
    const sql = `SELECT COUNT(1) AS row_cnt
FROM ${TABLE}
WHERE dt = '${day}'
LIMIT 1`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    const rowCount = r.data.length > 0 ? toNumber(r.data[0][0]) : 0;
    return { ready: rowCount > 0, rowCount };
  }

  /** 分大区整体指标（T-1） */
  async fetchLocaleMetrics(dt: string): Promise<LocaleMetric[]> {
    const day = assertDate(dt);
    const sql = `SELECT d.locale AS locale,
       ${SUM_SELECT}
FROM ${TABLE} d
LEFT JOIN ${USER_INFO} u ON d.user_id = u.id
WHERE d.dt = '${day}'
  AND d.user_id <> 0
  AND COALESCE(u.is_fake, FALSE) = FALSE
GROUP BY d.locale
ORDER BY SUM(d.lottery_cost) DESC
LIMIT ${SMALL_LIMIT}`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    return r.data.map((row) => ({
      locale: toStringArray(row[0]) || 'unknown',
      ...rowToSums(row.slice(1)),
    }));
  }

  /** 昨日盈利/亏损 TOP N，含 7 日 / 30 日窗口盈亏与返奖率 */
  async fetchTopUsers(endDt: string, direction: 'profit' | 'loss', limit = 10): Promise<TopUser[]> {
    const end = assertDate(endDt);
    const d7 = addDays(end, -6);
    const d30 = addDays(end, -29);
    const where = direction === 'profit' ? 'WHERE pnl_1d > 0' : 'WHERE pnl_1d < 0';
    const order = direction === 'profit' ? 'DESC' : 'ASC';
    const sql = `SELECT * FROM (
  SELECT d.user_id AS user_id,
         MAX(d.locale) AS locale,
         SUM(CASE WHEN d.dt = '${end}' THEN d.total_profit ELSE 0 END) AS pnl_1d,
         SUM(CASE WHEN d.dt = '${end}' THEN d.lottery_cost ELSE 0 END) AS cost_1d,
         SUM(CASE WHEN d.dt BETWEEN '${d7}' AND '${end}' THEN d.total_profit ELSE 0 END) AS pnl_7d,
         SUM(CASE WHEN d.dt BETWEEN '${d7}' AND '${end}' THEN d.lottery_cost ELSE 0 END) AS cost_7d,
         SUM(CASE WHEN d.dt BETWEEN '${d30}' AND '${end}' THEN d.total_profit ELSE 0 END) AS pnl_30d,
         SUM(CASE WHEN d.dt BETWEEN '${d30}' AND '${end}' THEN d.lottery_cost ELSE 0 END) AS cost_30d
  FROM ${TABLE} d
  LEFT JOIN ${USER_INFO} u ON d.user_id = u.id
  WHERE d.dt BETWEEN '${d30}' AND '${end}'
    AND d.user_id <> 0
    AND COALESCE(u.is_fake, FALSE) = FALSE
  GROUP BY d.user_id
) t
${where}
ORDER BY pnl_1d ${order}
LIMIT ${Math.max(1, Math.min(limit, 50))}`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    return r.data.map((row, index) => {
      const pnl1d = toNumber(row[2]);
      const pnl7d = toNumber(row[4]);
      const pnl30d = toNumber(row[6]);
      return {
        rank: index + 1,
        uid: toNumber(row[0]),
        locale: toStringArray(row[1]) || 'unknown',
        pnl1d,
        rtp1d: rtpPct(pnl1d, toNumber(row[3])),
        pnl7d,
        rtp7d: rtpPct(pnl7d, toNumber(row[5])),
        pnl30d,
        rtp30d: rtpPct(pnl30d, toNumber(row[7])),
      };
    });
  }

  /** 窗口内实际就绪分区数是否覆盖 days 天 */
  async checkCoverage(endDt: string, days: number): Promise<boolean> {
    const end = assertDate(endDt);
    const start = addDays(end, -(days - 1));
    const dates = await this.fetchAvailableDates(start, end);
    return dates.length >= days;
  }

  async fetchAvailableDates(startDate: string, endDate: string): Promise<string[]> {
    const start = assertDate(startDate);
    const end = assertDate(endDate);
    const sql = `SELECT DISTINCT dt
FROM ${TABLE}
WHERE dt BETWEEN '${start}' AND '${end}'
ORDER BY dt
LIMIT ${MAX_RANGE_DAYS + 10}`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    return r.data.map((row) => toStringArray(row[0])).filter((s) => s !== '');
  }

  /** 指标恒等式校验（预警 check 步骤） */
  async verifyIdentities(dt: string): Promise<IdentityCheck> {
    const day = assertDate(dt);
    const sql = `SELECT SUM(total_profit - (lottery_profit + double_profit + lamp_reward)) AS total_diff,
       SUM(lottery_reward - lottery_cost - lottery_profit) AS lottery_diff,
       SUM(double_win - (double_cost - double_failure_add) - double_profit) AS double_diff
FROM ${TABLE}
WHERE dt = '${day}'
LIMIT 1`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    if (r.data.length === 0) {
      return { totalProfitDiff: 0, lotteryDiff: 0, doubleDiff: 0 };
    }
    const row = r.data[0];
    return {
      totalProfitDiff: toNumber(row[0]),
      lotteryDiff: toNumber(row[1]),
      doubleDiff: toNumber(row[2]),
    };
  }

  /** 单用户区间报告（Admin 查询 API 的数据层实现） */
  async fetchUserReport(uid: number, startDate: string, endDate: string): Promise<UserReport> {
    const userId = assertUid(uid);
    const start = assertDate(startDate);
    const end = assertDate(endDate);
    if (start > end) {
      throw new Error(`startDate 不能晚于 endDate: ${start} > ${end}`);
    }
    const days = diffDays(start, end) + 1;
    if (days > MAX_RANGE_DAYS) {
      throw new Error(`查询区间最多 ${MAX_RANGE_DAYS} 天，实际 ${days} 天`);
    }

    await this.assertNotFakeUser(userId);

    const available = await this.fetchAvailableDates(start, end);
    const availableSet = new Set(available);
    const missingDates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      if (!availableSet.has(d)) missingDates.push(d);
    }

    const summaryRow = await this.fetchUserSummary(userId, start, end);
    const hasData = summaryRow !== null;
    const sums = summaryRow ?? emptySums();

    const topRooms = await this.fetchUserTopRooms(userId, start, end);
    const dailySums = await this.fetchUserDaily(userId, start, end);
    const dailyRooms = await this.fetchUserDailyTopRooms(userId, start, end);
    const roomsByDate = new Map<string, TopRoom[]>();
    for (const room of dailyRooms) {
      const list = roomsByDate.get(room.date) ?? [];
      list.push({ roomId: room.roomId, cost: room.cost });
      roomsByDate.set(room.date, list);
    }

    const daily: UserDaily[] = dailySums.map((item) => {
      const block = toSummary(item.sums, roomsByDate.get(item.date) ?? []);
      return {
        date: item.date,
        pnl: block.pnl,
        rtp: block.rtp,
        lottery: block.lottery,
        double: block.double,
        lampReward: block.lampReward,
        dismantle: block.dismantle,
        topRooms: block.topRooms,
      };
    });

    return {
      uid: userId,
      startDate: start,
      endDate: end,
      hasData,
      partial: missingDates.length > 0,
      missingDates,
      dataThrough: hasData ? await this.fetchUserDataThrough(userId, start, end) : null,
      currency: 'diamond',
      summary: toSummary(sums, topRooms),
      daily,
    };
  }

  /** 假用户 / 不存在用户校验：user_info 无记录按非假用户处理（与 COALESCE 口径一致） */
  async assertNotFakeUser(uid: number): Promise<void> {
    const userId = assertUid(uid);
    const sql = `SELECT id, is_fake
FROM ${USER_INFO}
WHERE id = ${userId}
LIMIT 1`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    if (r.data.length > 0 && toBool(r.data[0][1])) {
      throw new Error(`uid ${userId} 为假用户（is_fake=TRUE），不提供查询`);
    }
  }

  private async fetchUserSummary(uid: number, start: string, end: string): Promise<SpinDrawSums | null> {
    const sql = `SELECT ${SUM_SELECT},
       COUNT(1) AS row_cnt
FROM ${TABLE}
WHERE dt BETWEEN '${start}' AND '${end}'
  AND user_id = ${uid}
LIMIT 10`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    if (r.data.length === 0) return null;
    const row = r.data[0];
    if (toNumber(row[10]) === 0) return null;
    return rowToSums(row);
  }

  private async fetchUserDataThrough(uid: number, start: string, end: string): Promise<string | null> {
    const sql = `SELECT MAX(dt) AS data_through
FROM ${TABLE}
WHERE dt BETWEEN '${start}' AND '${end}'
  AND user_id = ${uid}
LIMIT 1`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    if (r.data.length === 0) return null;
    const value = toStringArray(r.data[0][0]);
    return value === '' ? null : value;
  }

  private async fetchUserDaily(
    uid: number,
    start: string,
    end: string,
  ): Promise<{ date: string; sums: SpinDrawSums }[]> {
    const sql = `SELECT dt,
       ${SUM_SELECT}
FROM ${TABLE}
WHERE dt BETWEEN '${start}' AND '${end}'
  AND user_id = ${uid}
GROUP BY dt
ORDER BY dt
LIMIT ${DETAIL_LIMIT}`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    return r.data.map((row) => ({
      date: toStringArray(row[0]),
      sums: rowToSums(row.slice(1)),
    }));
  }

  private async fetchUserTopRooms(uid: number, start: string, end: string): Promise<TopRoom[]> {
    const sql = `SELECT room_id, SUM(lottery_cost) AS cost
FROM ${TABLE}
WHERE dt BETWEEN '${start}' AND '${end}'
  AND user_id = ${uid}
GROUP BY room_id
HAVING SUM(lottery_cost) > 0
ORDER BY cost DESC
LIMIT 10`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    return r.data.map((row) => ({ roomId: toNumber(row[0]), cost: toNumber(row[1]) }));
  }

  private async fetchUserDailyTopRooms(
    uid: number,
    start: string,
    end: string,
  ): Promise<{ date: string; roomId: number; cost: number }[]> {
    const sql = `SELECT dt, room_id, cost FROM (
  SELECT dt, room_id, SUM(lottery_cost) AS cost,
         ROW_NUMBER() OVER (PARTITION BY dt ORDER BY SUM(lottery_cost) DESC) AS rn
  FROM ${TABLE}
  WHERE dt BETWEEN '${start}' AND '${end}'
    AND user_id = ${uid}
  GROUP BY dt, room_id
  HAVING SUM(lottery_cost) > 0
) t
WHERE rn <= 10
ORDER BY dt, rn
LIMIT ${DETAIL_LIMIT}`;
    const r: QueryResult = await this.sqlQuery(ODPS_DB, sql);
    return r.data.map((row) => ({
      date: toStringArray(row[0]),
      roomId: toNumber(row[1]),
      cost: toNumber(row[2]),
    }));
  }
}
