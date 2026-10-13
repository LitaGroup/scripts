import { ExportBaseClass, type ExportColumn } from '../../../../src/base/ExportBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';
import type { Database } from '../../../../src/resources/databases.ts';
import { DIDIBUS_BIZ } from '../../../../src/services/DidibusService.ts';

/**
 * didibus 运营数据分析导出（生产环境，只读查询）：
 *   1. 券与抽奖统计 — 维度：日期×大区；消耗拆分=顺序封顶（免费→送礼→收礼）；抽奖次数=用户群口径
 *   2. 免费领券用户分层 — 维度：大区（全活动累计）
 *   3. 地图探索 — 维度：大区（全活动累计）；到达点=曾越过该点（任意圈）；循环次数=MAX(loop_no)-全局MIN(loop_no)
 *   4. 营收消耗 — 维度：大区；金币=免费领券转化送礼用户的普通礼物订单（rank_record.amount，buff=1.0 精确值）
 *
 * 运行：node projects/active/didibus/exports/analyse.export.ts --output-dir=xxxxx [--format=csv]
 *      [--biz=didibus-v202609] [--start=20260923] [--end=20261002]（start/end 仅过滤第 1 个文件）
 */
type Row = Record<string, unknown>;

/** 大区固定输出顺序，其余（unknown 等）排最后 */
const LOCALE_ORDER = ['in', 'vi', 'ph', 'ko'];

/** 巴士抽奖价格（探险券/次），pool 名含关键字即匹配 */
const POOL_PRICES: Array<{ match: string; price: number; key: string; label: string }> = [
  { match: 'normal', price: 5, key: 'normal', label: '普通巴士' },
  { match: 'flying', price: 20, key: 'flying', label: '飞行巴士' },
];

type TimeUnit = 'ms' | 's' | 'datetime';

function q(v: unknown): string {
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function rowsOf(database: Database, sql: string): Promise<Row[]> {
  const r = await MySQLProdResource.query(database, sql);
  return r.data.map((row) => Object.fromEntries(r.header.map((h, i) => [h, row[i]])));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 金额保留 2 位小数（消除 DECIMAL SUM 的浮点尾差） */
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function classifyTimeUnit(v: unknown): TimeUnit | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v > 1e10 ? 'ms' : 's';
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d+$/.test(s)) return Number(s) > 1e10 ? 'ms' : 's';
    if (/-|\s|:/.test(s)) return 'datetime';
  }
  return null;
}

function parseScriptArgs(): { biz: string; start: string; end: string; error: string | null } {
  let biz = DIDIBUS_BIZ;
  let start = '20260923';
  let end = '20261002';
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--biz=')) biz = a.slice('--biz='.length).trim();
    else if (a.startsWith('--start=')) start = a.slice('--start='.length).trim();
    else if (a.startsWith('--end=')) end = a.slice('--end='.length).trim();
  }
  if (!biz) return { biz, start, end, error: '缺少 --biz 值' };
  if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end)) return { biz, start, end, error: `非法 --start/--end（须为 yyyyMMdd）：${start}/${end}` };
  return { biz, start, end, error: null };
}

/** dayno（epoch 天号）→ yyyyMMdd */
function dateOfDay(dayno: number): string {
  return new Date(dayno * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
}

/** yyyyMMdd → dayno（epoch 天号） */
function dayOfDate(s: string): number {
  return Math.floor(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))) / 86400000);
}

/** 大区时区秒偏移（in/vi +7、ph +8、ko +9；未知回退 +8） */
function offsetSecondsExpr(localeCol: string): string {
  return `CASE ${localeCol} WHEN 'ko' THEN 32400 WHEN 'ph' THEN 28800 ELSE 25200 END`;
}

function offsetSeconds(locale: string): number {
  if (locale === 'ko') return 32400;
  if (locale === 'ph') return 28800;
  if (locale === 'in' || locale === 'vi') return 25200;
  return 28800;
}

/** 时间值 → epoch 秒（datetime 视为东八区） */
function toSec(v: unknown, unit: TimeUnit): number {
  if (unit === 'datetime') {
    const s = String(v ?? '').trim().replace(' ', 'T');
    const t = Date.parse(/[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}+08:00`);
    return Number.isFinite(t) ? t / 1000 : 0;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return unit === 'ms' ? n / 1000 : n;
}

/** 时间值 → 大区本地 dayno（epoch 天号） */
function daynoOfTs(v: unknown, unit: TimeUnit, locale: string): number {
  return Math.floor((toSec(v, unit) + offsetSeconds(locale)) / 86400);
}

/** odps user_info 国家名 → 大区（兜底映射） */
const COUNTRY_LOCALE: Record<string, string> = {
  Indonesia: 'in',
  Vietnam: 'vi',
  Philippines: 'ph',
  'South Korea': 'ko',
};

/** 时间列 → 大区本地 dayno（epoch 天号） */
function daynoExpr(localeCol: string, timeCol: string, unit: TimeUnit): string {
  if (unit === 'datetime') {
    const hours = `CASE ${localeCol} WHEN 'ko' THEN 1 WHEN 'ph' THEN 0 ELSE -1 END`;
    return `(TO_DAYS(DATE_ADD(${timeCol}, INTERVAL ${hours} HOUR)) - 719528)`;
  }
  const sec = unit === 'ms' ? `(CASE WHEN ${timeCol} > 10000000000 THEN ${timeCol}/1000 ELSE ${timeCol} END)` : timeCol;
  return `FLOOR((${sec} + ${offsetSecondsExpr(localeCol)}) / 86400)`;
}

function localeExprOf(useJson: boolean): (col?: string) => string {
  if (useJson) return (col = 'extra') => `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${col},'$.locale')),'')`;
  return (col = 'extra') =>
    `CASE WHEN ${col} LIKE '%"locale":"%' THEN SUBSTRING_INDEX(SUBSTRING_INDEX(${col},'"locale":"',-1),'"',1) ELSE '' END`;
}

function localeSortKey(l: string): number {
  const i = LOCALE_ORDER.indexOf(l);
  return i === -1 ? LOCALE_ORDER.length : i;
}

interface PlayerAgg {
  locale: string;
  enterCnt: number;
  enterDays: number;
  sendCnt: number;
  sendAmt: number;
  recvCnt: number;
  recvAmt: number;
  usedAmt: number;
}

interface DrawRow {
  userId: string;
  locale: string;
  dayno: number;
  poolKey: string;
  draws: number;
}

interface DayCell {
  users: number;
  issue: number;
  used: number;
}

const DAILY_COLS: ExportColumn[] = [
  { key: 'date', header: '日期' },
  { key: 'locale', header: '大区' },
  { key: 'freeUsers', header: '免费发券用户数' },
  { key: 'freeIssue', header: '免费券发放总量' },
  { key: 'freeUsed', header: '免费券消耗总量(顺序封顶)' },
  { key: 'freeDraws', header: '免费券用户抽奖次数' },
  { key: 'sendUsers', header: '送礼用户数' },
  { key: 'sendIssue', header: '送礼产出探险券总量' },
  { key: 'sendUsed', header: '送礼产出券消耗总量(顺序封顶)' },
  { key: 'sendDraws', header: '送礼用户抽奖次数' },
  { key: 'recvUsers', header: '收礼陪玩师用户数' },
  { key: 'recvIssue', header: '收礼产出探险券总量' },
  { key: 'recvUsed', header: '收礼产出券消耗总量(顺序封顶)' },
  { key: 'recvDraws', header: '收礼用户抽奖次数' },
  { key: 'totalIssue', header: '探险券总发放量' },
  { key: 'totalUsed', header: '探险券总消耗量' },
  { key: 'normalDraws', header: '普通巴士抽奖次数' },
  { key: 'normalCost', header: '普通巴士消耗探险券数量' },
  { key: 'flyingDraws', header: '飞行巴士抽奖次数' },
  { key: 'flyingCost', header: '飞行巴士消耗探险券数量' },
];

const TIER_COLS: ExportColumn[] = [
  { key: 'locale', header: '大区' },
  { key: 'd1', header: '领取免费券1天用户数' },
  { key: 'd1Send', header: '领1天且送礼用户数' },
  { key: 'd2', header: '领取免费券2天用户数' },
  { key: 'd2Send', header: '领2天且送礼用户数' },
  { key: 'd3', header: '领取免费券3天用户数' },
  { key: 'd3Send', header: '领3天且送礼用户数' },
  { key: 'freeNoSendDrew', header: '免费领券但未送礼且参与抽奖用户数' },
];

const EXPLORE_COLS: ExportColumn[] = [
  { key: 'locale', header: '大区' },
  { key: 'p1', header: '到达第1探索点用户数' },
  { key: 'p2', header: '到达第2探索点用户数' },
  { key: 'p3', header: '到达第3探索点用户数' },
  { key: 'p4', header: '到达第4探索点用户数' },
  { key: 'p5', header: '到达第5探索点用户数' },
  { key: 'p6', header: '到达第6探索点用户数' },
  { key: 'looped', header: '完成地图循环用户数' },
  { key: 'loop1', header: '循环1次用户数' },
  { key: 'loop2', header: '循环2次用户数' },
  { key: 'loop3p', header: '循环3次及以上用户数' },
];

const REVENUE_COLS: ExportColumn[] = [
  { key: 'locale', header: '大区' },
  { key: 'users', header: '免费领券转化送礼用户数' },
  { key: 'orders', header: '活动礼物订单数' },
  { key: 'gold', header: '活动礼物总消耗金币' },
  { key: 'goldPerUser', header: '人均消耗金币' },
];

class DidibusAnalyseExport extends ExportBaseClass {
  private readonly biz: string;
  private readonly start: string;
  private readonly end: string;
  private readonly argError: string | null;

  constructor() {
    super();
    const p = parseScriptArgs();
    this.biz = p.biz;
    this.start = p.start;
    this.end = p.end;
    this.argError = p.error;
    this.total = 4;
  }

  protected async run(): Promise<void> {
    if (this.argError) throw new Error(this.argError);
    this.log(`didibus 运营数据分析导出 — biz=${this.biz}, 日期范围(大区本地)=${this.start}~${this.end}, format=${this.format}`);

    // ============ 环境探测 ============
    const useJson = await this.probeJsonSupport();
    this.log(`locale 提取方式: ${useJson ? 'JSON_EXTRACT' : 'SUBSTRING_INDEX 回退'}`);
    const loc = localeExprOf(useJson);

    const accUnit = await this.probeTimeUnit('mod_account_user_record');
    const drawUnit = (await this.probeTimeUnit('mod_luckydraw_record')) ?? accUnit ?? 'ms';
    this.log(`create_time 单位: mod_account_user_record=${accUnit ?? '空表(默认ms)'}, mod_luckydraw_record=${drawUnit}`);
    const unit = accUnit ?? 'ms';

    const busHasBiz = await this.probeBusBizColumn();
    const busBizFilter = busHasBiz ? ` AND a.biz = ${q(this.biz)}` : '';
    this.log(`mod_bus_user_award biz 列: ${busHasBiz ? '存在(已加过滤)' : '不存在'}`);

    const loopBase = await this.probeLoopBase(busBizFilter);
    this.log(`loop_no 全局最小值(循环基数)=${loopBase}，循环次数=MAX(loop_no)-${loopBase}`);

    const pools = await this.probePools();
    const priceOf = new Map<string, number>(pools.map((p) => [p.key, p.price]));

    // ============ 数据查询 ============
    // 说明：每日进入发券流水的 trans_no 前缀为 000DAILY（extra 无 locale，大区走 T1 任务轮次口径）；
    // send/recv 流水 extra 带 locale；draw 扣费流水的 player 无法关联大区映射，统一由 P3 明细在 JS 侧重聚合。
    const inner = `
SELECT m.player AS player, m.amount AS amount, m.create_time AS create_time,
  COALESCE(${loc('m.extra')}, '') AS locale,
  CASE
    WHEN trans_no LIKE '000DAILY%' THEN 'enter'
    WHEN trans_no LIKE 'send\\_%' THEN 'send'
    WHEN trans_no LIKE 'recv\\_%' THEN 'recv'
    WHEN trans_no LIKE '%DRAW%' THEN 'draw'
    ELSE 'other'
  END AS cls
FROM mod_account_user_record m
WHERE m.biz = ${q(this.biz)}`;

    this.log('查询 P1: 账户流水 日×大区×来源 聚合 ...');
    const p1Rows = await rowsOf('active', `
SELECT t.locale AS locale,
  ${daynoExpr('t.locale', 't.create_time', unit)} AS dayno,
  t.cls AS cls,
  COUNT(DISTINCT t.player) AS users,
  SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS issue_amt,
  SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS used_amt
FROM (${inner}) t
GROUP BY t.locale, dayno, t.cls`);

    this.log('查询 P2: 账户流水 用户级聚合（分层/用户群/封顶归属）...');
    const p2Rows = await rowsOf('active', `
SELECT t.player AS player, MAX(t.locale) AS locale,
  SUM(t.cls = 'enter') AS enter_cnt,
  COUNT(DISTINCT CASE WHEN t.cls = 'enter' THEN ${daynoExpr('t.locale', 't.create_time', unit)} END) AS enter_days,
  SUM(CASE WHEN t.cls = 'enter' THEN t.amount ELSE 0 END) AS enter_amt,
  SUM(t.cls = 'send') AS send_cnt,
  SUM(CASE WHEN t.cls = 'send' THEN t.amount ELSE 0 END) AS send_amt,
  SUM(t.cls = 'recv') AS recv_cnt,
  SUM(CASE WHEN t.cls = 'recv' THEN t.amount ELSE 0 END) AS recv_amt,
  SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS used_amt
FROM (${inner}) t
GROUP BY t.player`);
    const players = new Map<string, PlayerAgg>();
    for (const r of p2Rows) {
      players.set(String(r.player), {
        locale: String(r.locale ?? ''),
        enterCnt: num(r.enter_cnt),
        enterDays: num(r.enter_days),
        enterAmt: num(r.enter_amt),
        sendCnt: num(r.send_cnt),
        sendAmt: num(r.send_amt),
        recvCnt: num(r.recv_cnt),
        recvAmt: num(r.recv_amt),
        usedAmt: num(r.used_amt),
      });
    }
    this.log(`P2 用户数=${players.size}${players.size > 800000 ? '（⚠️ 数据量较大）' : ''}`);

    this.log('查询 T1: 每日进入发券 task 轮次（用户×日）...');
    const t1Rows = await rowsOf('active', `
SELECT t.user_id AS user_id, t.round AS round
FROM mod_task_user_round t
WHERE t.biz = ${q(this.biz)} AND t.topic = 'daily-entry' AND t.name = 'enter'`);
    const enterByUser = new Map<string, Set<number>>();
    for (const r of t1Rows) {
      const uid = String(r.user_id);
      const set = enterByUser.get(uid) ?? new Set<number>();
      set.add(dayOfDate(String(r.round ?? '')));
      enterByUser.set(uid, set);
    }
    const taskCnt = t1Rows.length;
    const p2EnterAmt = [...players.values()].reduce((s, p) => s + p.enterAmt, 0);
    this.log(`对账: task 领取次数=${taskCnt}(×5=${taskCnt * 5}), 账户流水 enter 类发放=${round2(p2EnterAmt)}${round2(taskCnt * 5) !== round2(p2EnterAmt) ? '（⚠️ 不一致）' : ''}`);

    this.log('查询 P3: 抽奖记录 明细（用户×奖池×时间）...');
    const p3Rows = await rowsOf('active', `
SELECT r.user_id AS user_id, r.pool AS pool, r.count AS cnt, r.create_time AS ts
FROM mod_luckydraw_record r
WHERE r.biz = ${q(this.biz)} AND r.topic = 'lucky-gift'`);
    const drawRaw = p3Rows.map((r) => {
      const pool = String(r.pool ?? '');
      const matched = POOL_PRICES.find((p) => pool.includes(p.match));
      return {
        userId: String(r.user_id),
        poolKey: matched ? matched.key : `unknown:${pool}`,
        draws: num(r.cnt),
        ts: r.ts,
      };
    });
    const unknownPools = new Set(drawRaw.map((d) => d.poolKey).filter((k) => k.startsWith('unknown:')));
    if (unknownPools.size > 0) this.log(`⚠️ 未知奖池(仅计次数不计消耗): ${[...unknownPools].join(', ')}`);

    // 大区兜底：无 send/recv 流水的用户（纯领券/纯抽奖）从 odps user_info 补大区
    const localeFix = new Map<string, string>();
    const needLocale = new Set<string>();
    for (const [uid, p] of players) if (!p.locale) needLocale.add(uid);
    let fixHits = 0;
    const needList = [...needLocale];
    for (let i = 0; i < needList.length; i += 1000) {
      const chunk = needList.slice(i, i + 1000).map(q).join(',');
      const rows = await rowsOf('odps', `SELECT id, locale, country_name FROM user_info WHERE id IN (${chunk})`);
      for (const r of rows) {
        const uid = String(r.id);
        const l = String(r.locale ?? '').trim().toLowerCase();
        if (LOCALE_ORDER.includes(l)) { localeFix.set(uid, l); fixHits++; continue; }
        const c = COUNTRY_LOCALE[String(r.country_name ?? '').trim()];
        if (c) { localeFix.set(uid, c); fixHits++; }
      }
    }
    this.log(`大区兜底: 需补大区用户=${needLocale.size}, 命中=${fixHits}`);
    const userLocale = (uid: string): string => players.get(uid)?.locale || localeFix.get(uid) || 'unknown';

    const draws: DrawRow[] = drawRaw.map((d) => ({
      userId: d.userId,
      locale: userLocale(d.userId),
      dayno: daynoOfTs(d.ts, drawUnit, userLocale(d.userId)),
      poolKey: d.poolKey,
      draws: d.draws,
    }));

    this.log('查询 P4: 巴士探索进度（用户明细）...');
    const p4Rows = await rowsOf('active', `
SELECT a.player AS player, MAX(a.stage) AS mx_stage, MAX(a.loop_no) AS mx_loop
FROM mod_bus_user_award a
WHERE a.map_name = 'map-1'${busBizFilter}
GROUP BY a.player`);

    this.log('查询 P5: 营收消耗（免费领券转化送礼用户的普通礼物金币）...');
    const converted = [...players.entries()].filter(([uid, p]) => enterByUser.has(uid) && p.sendCnt > 0).map(([uid]) => uid);
    this.log(`免费领券转化送礼用户数(全量)=${converted.length}`);
    let p5Rows: Row[];
    try {
      p5Rows = await rowsOf('active', `
SELECT r.locale AS locale,
  COUNT(DISTINCT r.player) AS users,
  COUNT(*) AS orders,
  SUM(r.amount) AS gold
FROM mod_common_rank_record r
WHERE r.biz = ${q(this.biz)} AND r.topic = 'gift-send' AND r.\`key\` = '-'
  AND EXISTS (SELECT 1 FROM mod_account_user_record a WHERE a.biz = ${q(this.biz)} AND a.trans_no = CONCAT('send_', r.trans_no))
  AND r.player IN (SELECT e.player FROM mod_account_user_record e WHERE e.biz = ${q(this.biz)} AND e.trans_no LIKE '000DAILY%')
GROUP BY r.locale`);
    } catch (e) {
      this.log(`P5 单查询失败(${(e as Error).message.slice(0, 80)}...)，回退分批 IN 查询 ...`);
      p5Rows = [];
      for (let i = 0; i < converted.length; i += 1000) {
        const chunk = converted.slice(i, i + 1000).map(q).join(',');
        p5Rows.push(...(await rowsOf('active', `
SELECT r.locale AS locale,
  COUNT(DISTINCT r.player) AS users,
  COUNT(*) AS orders,
  SUM(r.amount) AS gold
FROM mod_common_rank_record r
WHERE r.biz = ${q(this.biz)} AND r.topic = 'gift-send' AND r.\`key\` = '-'
  AND r.player IN (${chunk})
  AND EXISTS (SELECT 1 FROM mod_account_user_record a WHERE a.biz = ${q(this.biz)} AND a.trans_no = CONCAT('send_', r.trans_no))
GROUP BY r.locale`)));
      }
    }

    // ============ 计算 ============
    const startDay = dayOfDate(this.start);
    const endDay = dayOfDate(this.end);

    // 日×大区×来源 聚合（enter 走 T1、draw 走 P3 明细重聚合，此处跳过这两类）
    const cells = new Map<number, Map<string, Map<string, DayCell>>>(); // dayno → locale → cls → cell
    for (const r of p1Rows) {
      const dayno = num(r.dayno);
      if (dayno < startDay || dayno > endDay) continue;
      const locale = String(r.locale ?? '') || 'unknown';
      const cls = String(r.cls ?? '');
      if (cls === 'enter' || cls === 'draw') continue;
      const byLocale = cells.get(dayno) ?? new Map();
      const byCls = byLocale.get(locale) ?? new Map();
      byCls.set(cls, { users: num(r.users), issue: num(r.issue_amt), used: num(r.used_amt) });
      byLocale.set(locale, byCls);
      cells.set(dayno, byLocale);
    }
    // 免费发券（T1）：dayno → locale → {users, cnt}
    const enterCells = new Map<number, Map<string, { users: number; cnt: number }>>();
    for (const [uid, days] of enterByUser) {
      const locale = userLocale(uid);
      for (const dayno of days) {
        if (dayno < startDay || dayno > endDay) continue;
        const byLocale = enterCells.get(dayno) ?? new Map<string, { users: number; cnt: number }>();
        const c = byLocale.get(locale) ?? { users: 0, cnt: 0 };
        c.users += 1;
        c.cnt += 1;
        byLocale.set(locale, c);
        enterCells.set(dayno, byLocale);
      }
    }

    // 抽奖：日×大区 次数（按 pool / 用户群）
    const poolDraws = new Map<number, Map<string, Map<string, number>>>(); // dayno → locale → poolKey → draws
    const segDraws = new Map<number, Map<string, { enter: number; send: number; recv: number }>>();
    for (const d of draws) {
      if (d.dayno < startDay || d.dayno > endDay) continue;
      const locale = d.locale || 'unknown';
      const byLocale = poolDraws.get(d.dayno) ?? new Map<string, Map<string, number>>();
      const byPool = byLocale.get(locale) ?? new Map<string, number>();
      byPool.set(d.poolKey, (byPool.get(d.poolKey) ?? 0) + d.draws);
      byLocale.set(locale, byPool);
      poolDraws.set(d.dayno, byLocale);
      const p = players.get(d.userId);
      if (p) {
        const seg = segDraws.get(d.dayno)?.get(locale) ?? { enter: 0, send: 0, recv: 0 };
        if (enterByUser.has(d.userId)) seg.enter += d.draws;
        if (p.sendCnt > 0) seg.send += d.draws;
        if (p.recvCnt > 0) seg.recv += d.draws;
        segDraws.set(d.dayno, (segDraws.get(d.dayno) ?? new Map()).set(locale, seg));
      }
    }

    // 顺序封顶归属：每用户按日序消耗先抵免费券，再送礼券，再收礼券
    const att = new Map<number, Map<string, { free: number; send: number; recv: number; ex: number }>>(); // dayno → locale → buckets
    const perUserDays = new Map<string, Map<number, number>>(); // userId → dayno → used
    for (const d of draws) {
      const price = priceOf.get(d.poolKey) ?? 0;
      if (price <= 0 || d.dayno < startDay || d.dayno > endDay) continue;
      const byDay = perUserDays.get(d.userId) ?? new Map();
      byDay.set(d.dayno, (byDay.get(d.dayno) ?? 0) + d.draws * price);
      perUserDays.set(d.userId, byDay);
    }
    let excessTotal = 0;
    for (const [userId, byDay] of perUserDays) {
      const p = players.get(userId);
      let free = p?.enterAmt ?? 0;
      let send = p?.sendAmt ?? 0;
      let recv = p?.recvAmt ?? 0;
      const locale = userLocale(userId);
      for (const dayno of [...byDay.keys()].sort((a, b) => a - b)) {
        let rest = byDay.get(dayno) ?? 0;
        const fu = Math.min(rest, free); free -= fu; rest -= fu;
        const su = Math.min(rest, send); send -= su; rest -= su;
        const ru = Math.min(rest, recv); recv -= ru; rest -= ru;
        excessTotal += rest;
        const byLocale = att.get(dayno) ?? new Map();
        const b = byLocale.get(locale) ?? { free: 0, send: 0, recv: 0, ex: 0 };
        b.free += fu; b.send += su; b.recv += ru; b.ex += rest;
        byLocale.set(locale, b);
        att.set(dayno, byLocale);
      }
    }
    if (excessTotal > 0) this.log(`⚠️ 有 ${excessTotal} 张券消耗超出三类来源发放合计（负向调整/数据修正），未计入拆分列`);

    // P1 抽奖消耗(draw类) 与 P3 draws×price 对账
    let p1DrawUsed = 0;
    let p3DrawUsed = 0;
    for (const r of p1Rows) if (String(r.cls ?? '') === 'draw') p1DrawUsed += num(r.used_amt);
    for (const [, byDay] of perUserDays) for (const u of byDay.values()) p3DrawUsed += u;
    this.log(`对账: 流水扣券总额=${p1DrawUsed}, 抽奖次数×价格合计=${p3DrawUsed}${round2(p1DrawUsed) !== round2(p3DrawUsed) ? '（含未知奖池/其他扣券差异）' : ''}`);

    // ============ 文件1：券与抽奖统计（日期×大区 + 各大区合计行） ============
    const allLocales = new Set<string>();
    for (const byLocale of cells.values()) for (const l of byLocale.keys()) allLocales.add(l);
    for (const byLocale of enterCells.values()) for (const l of byLocale.keys()) allLocales.add(l);
    for (const byLocale of poolDraws.values()) for (const l of byLocale.keys()) allLocales.add(l);
    for (const byLocale of att.values()) for (const l of byLocale.keys()) allLocales.add(l);
    const locales = [...allLocales].sort((a, b) => localeSortKey(a) - localeSortKey(b) || a.localeCompare(b));
    const daySet = new Set<number>([...cells.keys(), ...enterCells.keys()]);
    const days = [...daySet].sort((a, b) => a - b);

    const dailyRows: Row[] = [];
    const sumRows = new Map<string, Row>();
    const emptyRow = (): Row => ({ date: '', locale: '', freeUsers: 0, freeIssue: 0, freeUsed: 0, freeDraws: 0, sendUsers: 0, sendIssue: 0, sendUsed: 0, sendDraws: 0, recvUsers: 0, recvIssue: 0, recvUsed: 0, recvDraws: 0, totalIssue: 0, totalUsed: 0, normalDraws: 0, normalCost: 0, flyingDraws: 0, flyingCost: 0 });
    for (const dayno of days) {
      for (const locale of locales) {
        const byCls = cells.get(dayno)?.get(locale) ?? new Map<string, DayCell>();
        const ec = enterCells.get(dayno)?.get(locale) ?? { users: 0, cnt: 0 };
        const seg = segDraws.get(dayno)?.get(locale) ?? { enter: 0, send: 0, recv: 0 };
        const a = att.get(dayno)?.get(locale) ?? { free: 0, send: 0, recv: 0, ex: 0 };
        const pd = poolDraws.get(dayno)?.get(locale) ?? new Map<string, number>();
        let totalIssue = ec.cnt * 5;
        let totalUsed = a.free + a.send + a.recv + a.ex;
        for (const c of byCls.values()) { totalIssue += c.issue; totalUsed += c.used; }
        const row: Row = {
          date: dateOfDay(dayno),
          locale,
          freeUsers: ec.users,
          freeIssue: round2(ec.cnt * 5),
          freeUsed: round2(a.free),
          freeDraws: seg.enter,
          sendUsers: byCls.get('send')?.users ?? 0,
          sendIssue: round2(byCls.get('send')?.issue ?? 0),
          sendUsed: round2(a.send),
          sendDraws: seg.send,
          recvUsers: byCls.get('recv')?.users ?? 0,
          recvIssue: round2(byCls.get('recv')?.issue ?? 0),
          recvUsed: round2(a.recv),
          recvDraws: seg.recv,
          totalIssue: round2(totalIssue),
          totalUsed: round2(totalUsed),
          normalDraws: pd.get('normal') ?? 0,
          normalCost: round2((pd.get('normal') ?? 0) * (priceOf.get('normal') ?? 0)),
          flyingDraws: pd.get('flying') ?? 0,
          flyingCost: round2((pd.get('flying') ?? 0) * (priceOf.get('flying') ?? 0)),
        };
        dailyRows.push(row);
        const sum = sumRows.get(locale) ?? { ...emptyRow(), date: '合计', locale };
        for (const k of Object.keys(row)) {
          if (k === 'date' || k === 'locale') continue;
          sum[k] = round2(num(sum[k]) + num(row[k]));
        }
        sumRows.set(locale, sum);
      }
    }
    for (const locale of locales) if (sumRows.has(locale)) dailyRows.push(sumRows.get(locale)!);
    // 合计行的用户数列改为去重口径（日行按日去重，直接累加会重复计数）
    const freeUsersByLocale = new Map<string, number>();
    const sendUsersByLocale = new Map<string, number>();
    const recvUsersByLocale = new Map<string, number>();
    for (const [uid] of enterByUser) {
      const l = userLocale(uid);
      freeUsersByLocale.set(l, (freeUsersByLocale.get(l) ?? 0) + 1);
    }
    for (const [uid, p] of players) {
      const l = userLocale(uid);
      if (p.sendCnt > 0) sendUsersByLocale.set(l, (sendUsersByLocale.get(l) ?? 0) + 1);
      if (p.recvCnt > 0) recvUsersByLocale.set(l, (recvUsersByLocale.get(l) ?? 0) + 1);
    }
    for (const row of dailyRows) {
      if (row.date !== '合计') continue;
      const l = String(row.locale);
      row.freeUsers = freeUsersByLocale.get(l) ?? 0;
      row.sendUsers = sendUsersByLocale.get(l) ?? 0;
      row.recvUsers = recvUsersByLocale.get(l) ?? 0;
    }

    // ============ 文件2：免费领券用户分层 ============
    const drewUsers = new Set(draws.map((d) => d.userId));
    const tierByLocale = new Map<string, Row>();
    for (const [uid, daysSet] of enterByUser) {
      const locale = userLocale(uid);
      const t = (tierByLocale.get(locale) ?? { locale, d1: 0, d1Send: 0, d2: 0, d2Send: 0, d3: 0, d3Send: 0, freeNoSendDrew: 0 }) as Row;
      const enterDays = daysSet.size;
      const sent = (players.get(uid)?.sendCnt ?? 0) > 0;
      if (enterDays === 1) { t.d1 = num(t.d1) + 1; if (sent) t.d1Send = num(t.d1Send) + 1; }
      if (enterDays === 2) { t.d2 = num(t.d2) + 1; if (sent) t.d2Send = num(t.d2Send) + 1; }
      if (enterDays >= 3) { t.d3 = num(t.d3) + 1; if (sent) t.d3Send = num(t.d3Send) + 1; }
      if (!sent && drewUsers.has(uid)) t.freeNoSendDrew = num(t.freeNoSendDrew) + 1;
      tierByLocale.set(locale, t);
    }
    const tierRows = [...tierByLocale.values()].sort((a, b) => localeSortKey(String(a.locale)) - localeSortKey(String(b.locale)) || String(a.locale).localeCompare(String(b.locale)));

    // ============ 文件3：地图探索 ============
    const exploreByLocale = new Map<string, Row>();
    for (const r of p4Rows) {
      const locale = userLocale(String(r.player));
      const t = (exploreByLocale.get(locale) ?? { locale, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, p6: 0, looped: 0, loop1: 0, loop2: 0, loop3p: 0 }) as Row;
      const mxStage = num(r.mx_stage);
      const mxLoop = num(r.mx_loop);
      if (mxStage >= 1) t.p1 = num(t.p1) + 1;
      if (mxStage >= 2) t.p2 = num(t.p2) + 1;
      if (mxStage >= 3) t.p3 = num(t.p3) + 1;
      if (mxStage >= 4) t.p4 = num(t.p4) + 1;
      if (mxStage >= 5) t.p5 = num(t.p5) + 1;
      if (mxStage >= 6) t.p6 = num(t.p6) + 1;
      if (mxLoop > loopBase) t.looped = num(t.looped) + 1;
      const loops = mxLoop - loopBase;
      if (loops === 1) t.loop1 = num(t.loop1) + 1;
      else if (loops === 2) t.loop2 = num(t.loop2) + 1;
      else if (loops >= 3) t.loop3p = num(t.loop3p) + 1;
      exploreByLocale.set(locale, t);
    }
    const exploreRows = [...exploreByLocale.values()].sort((a, b) => localeSortKey(String(a.locale)) - localeSortKey(String(b.locale)) || String(a.locale).localeCompare(String(b.locale)));

    // ============ 文件4：营收消耗 ============
    const revByLocale = new Map<string, { locale: string; users: number; orders: number; gold: number }>();
    for (const r of p5Rows) {
      const locale = String(r.locale ?? '');
      const t = revByLocale.get(locale) ?? { locale, users: 0, orders: 0, gold: 0 };
      t.users += num(r.users);
      t.orders += num(r.orders);
      t.gold += num(r.gold);
      revByLocale.set(locale, t);
    }
    const revenueRows = [...revByLocale.values()].map((t) => ({
      locale: t.locale,
      users: t.users,
      orders: t.orders,
      gold: round2(t.gold),
      goldPerUser: t.users > 0 ? Math.round((t.gold / t.users) * 100) / 100 : 0,
    })).sort((a, b) => localeSortKey(a.locale) - localeSortKey(b.locale) || a.locale.localeCompare(b.locale));

    // ============ 导出 ============
    await this.export('券与抽奖统计', dailyRows, { columns: DAILY_COLS, filename: `${this.biz}-ticket-draw` });
    await this.export('免费领券用户分层', tierRows, { columns: TIER_COLS, filename: `${this.biz}-free-tier` });
    await this.export('地图探索', exploreRows, { columns: EXPLORE_COLS, filename: `${this.biz}-explore` });
    await this.export('营收消耗', revenueRows, { columns: REVENUE_COLS, filename: `${this.biz}-revenue` });
  }

  // ============ 探测 ============

  private async probeJsonSupport(): Promise<boolean> {
    try {
      await rowsOf('active', `SELECT JSON_UNQUOTE(JSON_EXTRACT('{"locale":"ko"}','$.locale')) AS v`);
      return true;
    } catch {
      return false;
    }
  }

  private async probeTimeUnit(table: string): Promise<TimeUnit | null> {
    const rows = await rowsOf('active', `SELECT create_time AS v FROM ${table} WHERE biz = ${q(this.biz)} LIMIT 1`);
    return rows.length > 0 ? classifyTimeUnit(rows[0].v) : null;
  }

  private async probeBusBizColumn(): Promise<boolean> {
    try {
      const rows = await rowsOf('active', `DESCRIBE mod_bus_user_award`);
      return rows.some((r) => String(r.Field ?? '').toLowerCase() === 'biz');
    } catch {
      const probe = await rowsOf('active', `SELECT biz FROM mod_bus_user_award LIMIT 1`).then(() => true).catch(() => false);
      return probe;
    }
  }

  private async probeLoopBase(busBizFilter: string): Promise<number> {
    const rows = await rowsOf('active', `SELECT MIN(a.loop_no) AS v FROM mod_bus_user_award a WHERE a.map_name = 'map-1'${busBizFilter}`);
    const raw = rows.length > 0 ? rows[0].v : null;
    if (raw === null || raw === undefined) return 1; // 空表按第一圈=1
    return num(raw);
  }

  private async probePools(): Promise<Array<{ key: string; price: number }>> {
    const rows = await rowsOf('active', `SELECT topic, pool, SUM(count) AS draws FROM mod_luckydraw_record WHERE biz = ${q(this.biz)} GROUP BY topic, pool`);
    const pools: Array<{ key: string; price: number }> = [];
    for (const r of rows) {
      const topic = String(r.topic ?? '');
      const pool = String(r.pool ?? '');
      if (topic !== 'lucky-gift') {
        this.log(`⚠️ 跳过非 lucky-gift 抽奖记录: topic=${topic}, pool=${pool}, draws=${num(r.draws)}`);
        continue;
      }
      const matched = POOL_PRICES.find((p) => pool.includes(p.match));
      if (matched) pools.push({ key: matched.key, price: matched.price });
      else this.log(`⚠️ lucky-gift 未知奖池名: pool=${pool}, draws=${num(r.draws)}`);
    }
    if (pools.length === 0) this.log('⚠️ 未探测到 lucky-gift 奖池记录，巴士抽奖列将为 0');
    return pools;
  }
}

await new DidibusAnalyseExport().execute();
