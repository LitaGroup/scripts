import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import type { MysqlRow } from '../../../../src/resources/MySQLTestResource.ts';

/**
 * 陪玩师值班 Admin 冒烟（测试环境）
 * 设计：https://project.cinta.team/api/documents/123.md
 * 接口：https://project.cinta.team/api/documents/122.md
 * PRD：https://project.cinta.team/api/documents/107.md
 *
 * 覆盖：后台登录/未登录拦截、模板下载、值班列表筛选与排序、单条新增、重复/格式/身份校验、
 *      删除、标记结果、申请审核（ADD/MODIFY/CANCEL）、拒绝、超时懒更新、冲突/快照校验、
 *      Excel 上传（成功/重复/班次不足/非法格式）、导出、Attendance 定时任务、变更日志。
 *
 * 运行：node player-duty-admin-smoke.test.ts [--player-id=24] [--locale=in]
 *        [--timezone=Asia/Jakarta] [--keep-data]
 * 前置：scripts 目录执行 npm install（Excel 上传用例依赖 exceljs）；config.json（测试环境 MySQL 直连）；
 *      后台默认账号 admin/123456，可用 SCRIPT_ADMIN_HOST / SCRIPT_ADMIN_USERNAME /
 *      SCRIPT_ADMIN_PASSWORD / SCRIPT_ADMIN_ACCESS_TOKEN 覆盖。
 */

const DEFAULT_ADMIN_HOST = 'https://funbit-mgr.test.cinta.team';
const ADMIN_HOST = (process.env.SCRIPT_ADMIN_HOST ?? DEFAULT_ADMIN_HOST).replace(/\/+$/, '');
const ADMIN_USERNAME = process.env.SCRIPT_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.SCRIPT_ADMIN_PASSWORD ?? '123456';
const ADMIN_ACCESS_TOKEN = process.env.SCRIPT_ADMIN_ACCESS_TOKEN ?? '';

const DB_BASIC = 'lita_basic';
const DB_FUNBIT = 'funbit';
const HTTP_TIMEOUT_MS = 30_000;
const MINUTE_MS = 60_000;
const REMARK_PREFIX = 'player-duty-admin-smoke-';

interface ExcelWorksheetLike {
  addRow(values: unknown[]): void;
  getRow(index: number): { values: unknown[] };
  eachRow(cb: (row: { getCell(index: number): { value: unknown } }, no: number) => void): void;
}

interface ExcelWorkbookLike {
  xlsx: {
    load(buffer: Buffer): Promise<void>;
    writeBuffer(): Promise<unknown>;
  };
  addWorksheet(name: string): ExcelWorksheetLike;
  worksheets: ExcelWorksheetLike[];
}

interface ExcelModuleLike {
  Workbook: new () => ExcelWorkbookLike;
}

let excelModule: ExcelModuleLike | null | undefined;

async function loadExcel(): Promise<ExcelModuleLike | null> {
  if (excelModule !== undefined) return excelModule;
  try {
    const mod = (await import('exceljs')) as { default?: ExcelModuleLike };
    excelModule = mod.default ?? (mod as unknown as ExcelModuleLike);
  } catch {
    excelModule = null;
  }
  return excelModule;
}

const TZ_BY_LOCALE: Record<string, string> = {
  in: 'Asia/Jakarta',
  vi: 'Asia/Ho_Chi_Minh',
  ph: 'Asia/Manila',
  ko: 'Asia/Seoul',
  ar: 'Asia/Riyadh',
};

function arg(name: string, def: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}

const PLAYER_ID_ARG = arg('player-id', '');
const LOCALE_ARG = arg('locale', 'in').toLowerCase().split('-')[0];
const TIMEZONE_ARG = arg('timezone', '');
const KEEP_DATA = process.argv.includes('--keep-data');

interface CalendarParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

interface SeededDuty {
  id: number;
  date: string;
  dateInt: number;
  startTime: number;
  endTime: number;
  startAt: number;
  endAt: number;
}

interface TargetSlot {
  date: string;
  dateInt: number;
  startTime: number;
  endTime: number;
  startAt: number;
  endAt: number;
}

interface DutySeed {
  date: string;
  startTime: number;
  endTime: number;
  result?: string | null;
  attendance?: string | null;
  startAt?: number;
  endAt?: number;
}

interface RequestSeed {
  type: 'ADD' | 'MODIFY' | 'CANCEL';
  duty?: SeededDuty | null;
  target?: TargetSlot | null;
  deadlineAt: number;
  applyAt: number;
  remark: string;
}

interface AdminResponse {
  http: number;
  body: Record<string, unknown>;
}

interface DownloadResponse {
  status: number;
  contentType: string;
  disposition: string;
  buffer: Buffer;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function asList(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toNullableStr(v: unknown): string | null {
  return v === null || v === undefined || v === '' ? null : String(v);
}

function jsonText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function sqlStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function sqlNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) throw new Error(`invalid numeric value: ${n}`);
  return str;
}

function sqlNullableStr(v: string | null | undefined): string {
  return v === null || v === undefined || v === '' ? 'NULL' : sqlStr(v);
}

function sqlNullableNum(v: number | null | undefined): string {
  return v === null || v === undefined ? 'NULL' : sqlNum(v);
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsAt(ms: number, timeZone: string): CalendarParts {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatters.set(timeZone, fmt);
  }
  const map = new Map<string, string>();
  for (const p of fmt.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') map.set(p.type, p.value);
  }
  return {
    year: Number(map.get('year')),
    month: Number(map.get('month')),
    day: Number(map.get('day')),
    hour: Number(map.get('hour')),
    minute: Number(map.get('minute')),
    second: Number(map.get('second')),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateOf(ms: number, timeZone: string): string {
  const p = partsAt(ms, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateToInt(date: string): number {
  return Number(date.replace(/-/g, ''));
}

function intToHhmm(value: number): string {
  return `${pad2(Math.floor(value / 100))}:${pad2(value % 100)}`;
}

function tzOffsetMs(ms: number, timeZone: string): number {
  const p = partsAt(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}

function epochOf(date: string, time: number, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(time / 100), time % 100, 0);
  let ts = guess - tzOffsetMs(guess, timeZone);
  ts = guess - tzOffsetMs(ts, timeZone);
  return ts;
}

function rowStatus(body: Record<string, unknown>): string {
  return String(body['status'] ?? '');
}

function errText(body: Record<string, unknown>): string {
  return `status=${rowStatus(body)} msg=${String(body['msg'] ?? '')}`;
}

function headerValue(row: unknown, index: number): string {
  if (!Array.isArray(row)) return '';
  return String(row[index] ?? '');
}

class PlayerDutyAdminSmoke extends TestBaseClass {
  private token = '';
  private adminName = '';
  private setupError = '';
  private cleaned = false;
  private playerId = 0;
  private playerNo = 0;
  private locale = LOCALE_ARG;
  private zone = TIMEZONE_ARG || TZ_BY_LOCALE[LOCALE_ARG] || 'Asia/Jakarta';
  private countryCode = '';
  private nonPlayerId = 0;
  private today = '';
  private baseDate = '';
  private pastDate = '';
  private originalIsActive: number | null = null;
  private activeCaptured = false;
  private dutyIds = new Set<number>();
  private requestIds = new Set<number>();
  private addDutyId = 0;

  private template: DownloadResponse | null = null;
  private exportFile: DownloadResponse | null = null;
  private unauthList: AdminResponse | null = null;

  private baseDuties = new Map<string, SeededDuty>();
  private approveAddDutyId = 0;
  private uploadDutyIds: number[] = [];
  private attendanceDutyIds: number[] = [];
  private attendanceRows: MysqlRow[] = [];

  private addTarget: TargetSlot = { date: '', dateInt: 0, startTime: 1300, endTime: 1500, startAt: 0, endAt: 0 };
  private approveAddTarget: TargetSlot = { date: '', dateInt: 0, startTime: 1500, endTime: 1700, startAt: 0, endAt: 0 };
  private approveModifyTarget: TargetSlot = { date: '', dateInt: 0, startTime: 1500, endTime: 1700, startAt: 0, endAt: 0 };
  private rejectTarget: TargetSlot = { date: '', dateInt: 0, startTime: 1900, endTime: 2100, startAt: 0, endAt: 0 };
  private expiredTarget: TargetSlot = { date: '', dateInt: 0, startTime: 1100, endTime: 1300, startAt: 0, endAt: 0 };
  private startedModifyTarget: TargetSlot = { date: '', dateInt: 0, startTime: 1300, endTime: 1500, startAt: 0, endAt: 0 };
  private changedModifyTarget: TargetSlot = { date: '', dateInt: 0, startTime: 1500, endTime: 1700, startAt: 0, endAt: 0 };

  private approveAddRequestId = 0;
  private approveModifyRequestId = 0;
  private approveCancelRequestId = 0;
  private rejectRequestId = 0;
  private expiredRequestId = 0;
  private conflictRequestId = 0;
  private startedModifyRequestId = 0;
  private changedModifyRequestId = 0;
  private approveModifyDutyId = 0;
  private approveCancelDutyId = 0;

  constructor() {
    super();
    this.total = 61;
  }

  async execute(): Promise<void> {
    try {
      await super.execute();
    } finally {
      await this.cleanupSilently();
    }
  }

  private guard(): void {
    if (this.setupError) this.skip(`初始化失败：${this.setupError}`);
  }

  private async actG(title: string, fn: () => unknown | Promise<unknown>): Promise<void> {
    await this.act(title, async () => {
      this.guard();
      await fn();
    });
  }

  private async checkG(title: string, fn: () => CheckResult | Promise<CheckResult>): Promise<void> {
    await this.check(title, async () => {
      this.guard();
      return fn();
    });
  }

  private target(date: string, startTime: number, endTime: number): TargetSlot {
    return {
      date,
      dateInt: dateToInt(date),
      startTime,
      endTime,
      startAt: epochOf(date, startTime, this.zone),
      endAt: epochOf(date, endTime, this.zone),
    };
  }

  private async login(): Promise<void> {
    if (ADMIN_ACCESS_TOKEN) {
      this.token = ADMIN_ACCESS_TOKEN;
      this.adminName = ADMIN_USERNAME;
      return;
    }
    const res = await fetch(`${ADMIN_HOST}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: ADMIN_USERNAME, pwd: ADMIN_PASSWORD }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const text = await res.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`后台登录返回非 JSON：HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    if (rowStatus(body) !== '0') throw new Error(`后台登录失败：${errText(body)}`);
    const data = asRecord(body['data']);
    this.token = String(data['accessToken'] ?? '');
    if (!this.token) throw new Error('后台登录未返回 accessToken');
    this.adminName = String(data['userName'] ?? ADMIN_USERNAME);
  }

  private async request(
    path: string,
    options: {
      method?: string;
      query?: Record<string, string | number | undefined>;
      body?: unknown;
      form?: FormData;
      auth?: boolean;
    } = {},
  ): Promise<AdminResponse> {
    const url = new URL(`${ADMIN_HOST}/api/playerDuty/${path.replace(/^\/+/, '')}`);
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {};
    if (options.auth !== false && this.token) headers.AccessToken = this.token;
    let payload: string | FormData | undefined;
    if (options.form) {
      payload = options.form;
    } else {
      headers['Content-Type'] = 'application/json';
      if (options.body !== undefined) payload = JSON.stringify(options.body);
    }
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: payload,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const text = await res.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`HTTP ${res.status} 非 JSON 响应：${text.slice(0, 300)}`);
    }
    return { http: res.status, body };
  }

  private async apiOk(
    path: string,
    options: Parameters<PlayerDutyAdminSmoke['request']>[1] = {},
  ): Promise<Record<string, unknown>> {
    const { body } = await this.request(path, options);
    if (rowStatus(body) !== '0') throw new Error(`${path} 失败：${errText(body)}`);
    return asRecord(body['data']);
  }

  private async download(
    path: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<DownloadResponse> {
    const url = new URL(`${ADMIN_HOST}/api/playerDuty/${path.replace(/^\/+/, '')}`);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {};
    if (this.token) headers.AccessToken = this.token;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      contentType: String(res.headers.get('content-type') ?? ''),
      disposition: String(res.headers.get('content-disposition') ?? ''),
      buffer,
    };
  }

  private async loadAccounts(): Promise<void> {
    const wherePlayer = PLAYER_ID_ARG
      ? `p.id = ${sqlNum(PLAYER_ID_ARG)}`
      : `p.is_player = 1 AND c.locale = ${sqlStr(this.locale)}`;
    const players = await this.mysql.query(
      `SELECT p.id, p.no, p.nick, p.is_player, p.is_active, c.locale, c.country_code ` +
        `FROM user_profile p JOIN user_config c ON c.id = p.id WHERE ${wherePlayer} ` +
        `ORDER BY p.id LIMIT 20`,
      DB_FUNBIT,
    );
    if (players.length === 0) {
      throw new Error(`大区 ${this.locale} 未找到陪玩师，可用 --player-id 指定`);
    }
    const player = players[0];
    this.playerId = toNum(player['id']);
    this.playerNo = toNum(player['no']);
    this.locale = String(player['locale'] ?? this.locale).toLowerCase().split('-')[0];
    this.countryCode = String(player['country_code'] ?? '');
    this.zone = TIMEZONE_ARG || TZ_BY_LOCALE[this.locale] || this.zone;

    const nonPlayers = await this.mysql.query(
      `SELECT p.id FROM user_profile p JOIN user_config c ON c.id = p.id ` +
        `WHERE (p.is_player = 0 OR p.is_player IS NULL) AND c.locale = ${sqlStr(this.locale)} ` +
        `ORDER BY p.id LIMIT 5`,
      DB_FUNBIT,
    );
    this.nonPlayerId = nonPlayers.length > 0 ? toNum(nonPlayers[0]['id']) : 0;

    this.today = dateOf(Date.now(), this.zone);
    this.baseDate = addDays(this.today, 30);
    this.pastDate = addDays(this.today, -30);

    this.addTarget = this.target(this.baseDate, 1300, 1500);
    this.approveAddTarget = this.target(addDays(this.baseDate, 4), 1500, 1700);
    this.approveModifyTarget = this.target(addDays(this.baseDate, 6), 1500, 1700);
    this.rejectTarget = this.target(addDays(this.baseDate, 8), 1900, 2100);
    this.expiredTarget = this.target(addDays(this.baseDate, 9), 1100, 1300);
    this.startedModifyTarget = this.target(addDays(this.baseDate, 10), 1300, 1500);
    this.changedModifyTarget = this.target(addDays(this.baseDate, 12), 1500, 1700);

    this.log(
      `用户=${this.playerId} NO=${this.playerNo} 大区=${this.locale} 国家=${this.countryCode || '-'} ` +
        `时区=${this.zone} 非陪玩师=${this.nonPlayerId || '未找到'}`,
    );
  }

  private async queryDuty(id: number): Promise<MysqlRow | null> {
    const rows = await this.mysql.query(
      `SELECT * FROM player_duty WHERE id = ${sqlNum(id)} LIMIT 1`,
      DB_BASIC,
    );
    return rows.length > 0 ? rows[0] : null;
  }

  private async queryDutyByKey(dateInt: number, startTime: number): Promise<MysqlRow | null> {
    const rows = await this.mysql.query(
      `SELECT * FROM player_duty WHERE locale = ${sqlStr(this.locale)} AND player_id = ${sqlNum(this.playerId)} ` +
        `AND duty_date = ${sqlNum(dateInt)} AND start_time = ${sqlNum(startTime)} LIMIT 1`,
      DB_BASIC,
    );
    return rows.length > 0 ? rows[0] : null;
  }

  private async queryRequest(id: number): Promise<MysqlRow | null> {
    const rows = await this.mysql.query(
      `SELECT * FROM player_duty_request WHERE id = ${sqlNum(id)} LIMIT 1`,
      DB_BASIC,
    );
    return rows.length > 0 ? rows[0] : null;
  }

  private async queryLogs(where: string): Promise<MysqlRow[]> {
    return this.mysql.query(`SELECT * FROM player_duty_log WHERE ${where} ORDER BY id`, DB_BASIC);
  }

  private async seedDuty(seed: DutySeed): Promise<SeededDuty> {
    const dateInt = dateToInt(seed.date);
    const startAt = seed.startAt ?? epochOf(seed.date, seed.startTime, this.zone);
    const endAt = seed.endAt ?? epochOf(seed.date, seed.endTime, this.zone);
    const existing = await this.queryDutyByKey(dateInt, seed.startTime);
    if (existing) {
      const oldId = toNum(existing['id']);
      await this.mysql.execute(`DELETE FROM player_duty_log WHERE duty_id = ${sqlNum(oldId)}`, DB_BASIC);
      await this.mysql.execute(`DELETE FROM player_duty WHERE id = ${sqlNum(oldId)}`, DB_BASIC);
    }
    const now = Date.now();
    await this.mysql.execute(
      `INSERT INTO player_duty ` +
        `(locale, player_id, duty_date, start_time, end_time, start_at, end_at, country_code, attendance, result, ` +
        `discount_order_count, proactive_dm_user_count, proactive_dm_count, online_hours, create_time, update_time) ` +
        `VALUES (${sqlStr(this.locale)}, ${sqlNum(this.playerId)}, ${sqlNum(dateInt)}, ${sqlNum(seed.startTime)}, ` +
        `${sqlNum(seed.endTime)}, ${sqlNum(startAt)}, ${sqlNum(endAt)}, ${sqlNullableStr(this.countryCode)}, ` +
        `${sqlNullableStr(seed.attendance ?? null)}, ${sqlNullableStr(seed.result ?? null)}, 0, 0, 0, 0.00, ` +
        `${sqlNum(now)}, ${sqlNum(now)})`,
      DB_BASIC,
    );
    const row = await this.queryDutyByKey(dateInt, seed.startTime);
    if (!row) throw new Error(`造数后未找到值班 ${seed.date} ${intToHhmm(seed.startTime)}`);
    const duty: SeededDuty = {
      id: toNum(row['id']),
      date: seed.date,
      dateInt,
      startTime: seed.startTime,
      endTime: seed.endTime,
      startAt,
      endAt,
    };
    this.dutyIds.add(duty.id);
    return duty;
  }

  private async seedRequest(seed: RequestSeed): Promise<number> {
    const now = Date.now();
    const originalDate = seed.duty?.dateInt ?? null;
    const originalStart = seed.duty?.startTime ?? null;
    const originalEnd = seed.duty?.endTime ?? null;
    const targetDate = seed.target?.dateInt ?? null;
    const targetStart = seed.target?.startTime ?? null;
    const targetEnd = seed.target?.endTime ?? null;
    await this.mysql.execute(
      `INSERT INTO player_duty_request ` +
        `(locale, player_id, request_type, duty_id, original_date, original_start_time, original_end_time, ` +
        `target_date, target_start_time, target_end_time, deadline_at, status, source, apply_at, create_time, ` +
        `update_time, remark) VALUES (${sqlStr(this.locale)}, ${sqlNum(this.playerId)}, ${sqlStr(seed.type)}, ` +
        `${sqlNullableNum(seed.duty?.id ?? null)}, ${sqlNullableNum(originalDate)}, ${sqlNullableNum(originalStart)}, ` +
        `${sqlNullableNum(originalEnd)}, ${sqlNullableNum(targetDate)}, ${sqlNullableNum(targetStart)}, ` +
        `${sqlNullableNum(targetEnd)}, ${sqlNum(seed.deadlineAt)}, 'PENDING', 'PLAYER', ${sqlNum(seed.applyAt)}, ` +
        `${sqlNum(now)}, ${sqlNum(now)}, ${sqlStr(seed.remark)})`,
      DB_BASIC,
    );
    const rows = await this.mysql.query(
      `SELECT id FROM player_duty_request WHERE player_id = ${sqlNum(this.playerId)} ` +
        `AND remark = ${sqlStr(seed.remark)} ORDER BY id DESC LIMIT 1`,
      DB_BASIC,
    );
    if (rows.length === 0) throw new Error(`造数后未找到申请 ${seed.remark}`);
    const id = toNum(rows[0]['id']);
    this.requestIds.add(id);
    return id;
  }

  private async cleanupData(): Promise<void> {
    if (this.playerId === 0) return;
    const dutyIds = [...this.dutyIds];
    const requestIds = [...this.requestIds];

    if (requestIds.length > 0) {
      await this.mysql.execute(
        `DELETE FROM player_duty_log WHERE request_id IN (${requestIds.map(sqlNum).join(', ')})`,
        DB_BASIC,
      );
      await this.mysql.execute(
        `DELETE FROM player_duty_request WHERE id IN (${requestIds.map(sqlNum).join(', ')})`,
        DB_BASIC,
      );
    }

    if (dutyIds.length > 0) {
      await this.mysql.execute(
        `DELETE FROM player_duty_log WHERE duty_id IN (${dutyIds.map(sqlNum).join(', ')})`,
        DB_BASIC,
      );
      await this.mysql.execute(
        `DELETE FROM player_duty WHERE id IN (${dutyIds.map(sqlNum).join(', ')})`,
        DB_BASIC,
      );
    }

    const from = dateToInt(this.baseDate);
    const to = from + 20;
    const windowDuties = await this.mysql.query(
      `SELECT id FROM player_duty WHERE locale = ${sqlStr(this.locale)} AND player_id = ${sqlNum(this.playerId)} ` +
        `AND duty_date BETWEEN ${sqlNum(from)} AND ${sqlNum(to)}`,
      DB_BASIC,
    );
    const windowDutyIds = windowDuties.map((r) => toNum(r['id']));
    if (windowDutyIds.length > 0) {
      await this.mysql.execute(
        `DELETE FROM player_duty_log WHERE duty_id IN (${windowDutyIds.map(sqlNum).join(', ')})`,
        DB_BASIC,
      );
      await this.mysql.execute(
        `DELETE FROM player_duty WHERE id IN (${windowDutyIds.map(sqlNum).join(', ')})`,
        DB_BASIC,
      );
    }

    const windowRequests = await this.mysql.query(
      `SELECT id FROM player_duty_request WHERE player_id = ${sqlNum(this.playerId)} ` +
        `AND remark LIKE ${sqlStr(REMARK_PREFIX + '%')}`,
      DB_BASIC,
    );
    const windowRequestIds = windowRequests.map((r) => toNum(r['id']));
    if (windowRequestIds.length > 0) {
      await this.mysql.execute(
        `DELETE FROM player_duty_log WHERE request_id IN (${windowRequestIds.map(sqlNum).join(', ')})`,
        DB_BASIC,
      );
      await this.mysql.execute(
        `DELETE FROM player_duty_request WHERE id IN (${windowRequestIds.map(sqlNum).join(', ')})`,
        DB_BASIC,
      );
    }

    this.dutyIds.clear();
    this.requestIds.clear();
  }

  private async cleanupSilently(): Promise<void> {
    if (this.cleaned) return;
    try {
      await this.restoreActive();
      if (!KEEP_DATA) {
        await this.cleanupData();
        this.cleaned = true;
      }
    } catch {
      // ignore
    }
  }

  private async restoreActive(): Promise<void> {
    if (!this.activeCaptured || this.playerId === 0) return;
    const value = this.originalIsActive === null ? 'NULL' : sqlNum(this.originalIsActive);
    await this.mysql.execute(
      `UPDATE user_profile SET is_active = ${value} WHERE id = ${sqlNum(this.playerId)}`,
      DB_FUNBIT,
    );
    this.activeCaptured = false;
    this.originalIsActive = null;
  }

  private async requireExcel(): Promise<ExcelModuleLike> {
    const Excel = await loadExcel();
    if (!Excel) this.skip('未安装 exceljs，跳过 Excel 上传用例（在 scripts 目录执行 npm install 后可跑全量）');
    return Excel;
  }

  private async buildExcel(rows: Array<[number, number, number, number]>): Promise<Buffer> {
    const Excel = await loadExcel();
    if (!Excel) throw new Error('未安装 exceljs');
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('duty');
    ws.addRow([
      'ID',
      'On Duty Date（yymmdd）',
      'On Duty - Start Time（UTC+7）',
      'On Duty - End Time（UTC+7）',
    ]);
    for (const row of rows) ws.addRow(row);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async uploadExcel(
    rows: Array<[number, number, number, number]>,
  ): Promise<Record<string, unknown>> {
    const buffer = await this.buildExcel(rows);
    const form = new FormData();
    form.append(
      'file',
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'player-duty.xlsx',
    );
    const { body } = await this.request('upload', { method: 'POST', form });
    return body;
  }

  private listRows(data: Record<string, unknown>): Array<Record<string, unknown>> {
    return asList(data['data']);
  }

  private async list(query: Record<string, string | number | undefined>): Promise<Record<string, unknown>> {
    return this.apiOk('list', { query: { page: 1, rows: 50, ...query } });
  }

  private async requestList(
    query: Record<string, string | number | undefined>,
  ): Promise<Record<string, unknown>> {
    return this.apiOk('request/list', { query: { page: 1, rows: 50, ...query } });
  }

  protected async run(): Promise<void> {
    await this.act('初始化：后台登录并定位测试账号', async () => {
      try {
        await this.login();
        await this.loadAccounts();
      } catch (e) {
        this.setupError = (e as Error).message;
        throw e;
      }
    });

    await this.actG('清理历史冒烟数据', async () => {
      await this.cleanupData();
    });

    await this.actG('读取未登录访问列表的响应', async () => {
      this.unauthList = await this.request('list', { query: { page: 1, rows: 1 }, auth: false });
    });

    await this.checkG('未登录访问值班列表被拦截', async (): Promise<CheckResult> => {
      const b = this.unauthList!.body;
      return { expect: 'status=2', real: errText(b), pass: rowStatus(b) === '2' };
    });

    await this.actG('下载值班上传模板', async () => {
      this.template = await this.download('template');
    });

    await this.checkG('模板下载：xlsx 文件名与表头正确', async (): Promise<CheckResult> => {
      const file = this.template!;
      const Excel = await loadExcel();
      const texts: string[] = [];
      if (Excel) {
        const wb = new Excel.Workbook();
        await wb.xlsx.load(file.buffer);
        const header = wb.worksheets[0]?.getRow(1).values ?? [];
        texts.push(...[1, 2, 3, 4].map((i) => headerValue(header, i)));
      }
      const headerOk = Excel
        ? texts[0] === 'ID' &&
          texts[1].includes('On Duty Date') &&
          texts[2].includes('Start Time') &&
          texts[3].includes('End Time')
        : true;
      const pass =
        file.status === 200 &&
        file.disposition.includes('player_duty_template.xlsx') &&
        file.buffer.length > 0 &&
        file.buffer.subarray(0, 2).toString() === 'PK' &&
        headerOk;
      return {
        expect: Excel ? 'player_duty_template.xlsx，4 列表头' : 'player_duty_template.xlsx（未装 exceljs，仅校验文件）',
        real: `http=${file.status} ${file.disposition} ${Excel ? texts.join(' | ') : 'skip-header'}`,
        pass,
      };
    });

    await this.actG('造数：列表/删除/标记基础值班', async () => {
      this.baseDuties.set(
        'pastLate',
        await this.seedDuty({ date: this.pastDate, startTime: 1300, endTime: 1500, attendance: 'LATE', result: 'INCOMPLETE' }),
      );
      this.baseDuties.set(
        'pastOpen',
        await this.seedDuty({ date: this.pastDate, startTime: 1500, endTime: 1700, attendance: 'NORMAL', result: null }),
      );
      this.baseDuties.set(
        'futureOpen',
        await this.seedDuty({ date: addDays(this.baseDate, 2), startTime: 2100, endTime: 2300, result: null }),
      );
      this.baseDuties.set(
        'futureMarked',
        await this.seedDuty({ date: addDays(this.baseDate, 1), startTime: 1900, endTime: 2100, result: 'COMPLETE' }),
      );
      this.baseDuties.set(
        'markTarget',
        await this.seedDuty({ date: addDays(this.today, -29), startTime: 1300, endTime: 1500, result: null }),
      );
      this.baseDuties.set(
        'notStartedMark',
        await this.seedDuty({ date: addDays(this.baseDate, 3), startTime: 1300, endTime: 1500, result: null }),
      );
      this.baseDuties.set(
        'startedDelete',
        await this.seedDuty({ date: addDays(this.today, -29), startTime: 1500, endTime: 1700, result: null }),
      );
    });

    await this.actG('后台单条新增值班', async () => {
      const data = await this.apiOk('add', {
        method: 'POST',
        body: {
          playerId: this.playerId,
          dutyDate: this.addTarget.date,
          startTime: this.addTarget.startTime,
          endTime: this.addTarget.endTime,
        },
      });
      this.addDutyId = toNum(data['id']);
      if (this.addDutyId > 0) this.dutyIds.add(this.addDutyId);
    });

    await this.checkG('单条新增：DB 快照与大区/国家/时间戳正确', async (): Promise<CheckResult> => {
      const row = await this.queryDuty(this.addDutyId);
      const pass =
        !!row &&
        String(row['locale']) === this.locale &&
        String(row['country_code'] ?? '') === this.countryCode &&
        toNum(row['duty_date']) === this.addTarget.dateInt &&
        toNum(row['start_time']) === this.addTarget.startTime &&
        toNum(row['end_time']) === this.addTarget.endTime &&
        toNum(row['start_at']) === this.addTarget.startAt &&
        toNum(row['end_at']) === this.addTarget.endAt &&
        row['result'] === null &&
        toNum(row['discount_order_count']) === 0;
      return {
        expect: `${this.locale}/${this.countryCode} ${this.addTarget.dateInt} startAt=${this.addTarget.startAt}`,
        real: row
          ? `${row['locale']}/${row['country_code']} ${row['duty_date']} startAt=${row['start_at']} endAt=${row['end_at']} result=${row['result']}`
          : '未找到值班',
        pass,
      };
    });

    await this.checkG('单条新增不校验同日 3 班次（该日期仅 1 条）', async (): Promise<CheckResult> => {
      const rows = await this.mysql.query(
        `SELECT COUNT(*) AS n FROM player_duty WHERE locale = ${sqlStr(this.locale)} ` +
          `AND player_id = ${sqlNum(this.playerId)} AND duty_date = ${sqlNum(this.addTarget.dateInt)}`,
        DB_BASIC,
      );
      const count = toNum(rows[0]?.['n']);
      return { expect: '1', real: String(count), pass: count === 1 };
    });

    await this.checkG('重复新增同一时段返回 assigned more than once', async (): Promise<CheckResult> => {
      const { body } = await this.request('add', {
        method: 'POST',
        body: {
          playerId: this.playerId,
          dutyDate: this.addTarget.date,
          startTime: this.addTarget.startTime,
          endTime: this.addTarget.endTime,
        },
      });
      return {
        expect: 'status!=0 + Player ID ... has been assigned more than once',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']).includes('has been assigned more than once'),
      };
    });

    await this.checkG('非固定班次返回 Invalid date or time format', async (): Promise<CheckResult> => {
      const { body } = await this.request('add', {
        method: 'POST',
        body: { playerId: this.playerId, dutyDate: this.baseDate, startTime: 1200, endTime: 1400 },
      });
      return {
        expect: 'status!=0 + Invalid date or time format',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']).includes('Invalid date or time format'),
      };
    });

    await this.checkG('非陪玩师返回 does not a player', async (): Promise<CheckResult> => {
      if (this.nonPlayerId === 0) this.skip('大区下未找到非陪玩师账号');
      const { body } = await this.request('add', {
        method: 'POST',
        body: { playerId: this.nonPlayerId, dutyDate: addDays(this.baseDate, 20), startTime: 1100, endTime: 1300 },
      });
      return {
        expect: 'status!=0 + does not a player',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']).includes('does not a player'),
      };
    });

    await this.checkG('不存在的 UID 返回 does not exist', async (): Promise<CheckResult> => {
      const { body } = await this.request('add', {
        method: 'POST',
        body: { playerId: 999999999, dutyDate: addDays(this.baseDate, 20), startTime: 1100, endTime: 1300 },
      });
      return {
        expect: 'status!=0 + does not exist',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']).includes('does not exist'),
      };
    });

    await this.actG('删除未开始值班', async () => {
      await this.apiOk('delete', { method: 'POST', body: { id: this.addDutyId } });
    });

    await this.checkG('删除未开始值班：物理删除并写 DELETE 日志', async (): Promise<CheckResult> => {
      const row = await this.queryDuty(this.addDutyId);
      const logs = await this.queryLogs(
        `duty_id = ${sqlNum(this.addDutyId)} AND action = 'DELETE' AND source = 'ADMIN'`,
      );
      const log = logs[0];
      const pass =
        row === null &&
        logs.length === 1 &&
        String(log?.['operator_name']) === this.adminName &&
        toNullableStr(log?.['before_json']) !== null &&
        log?.['after_json'] === null;
      return {
        expect: '值班不存在 + 1 条 DELETE 日志（before 有值）',
        real: `row=${row ? '存在' : 'null'} logs=${logs.length} operator=${log?.['operator_name']}`,
        pass,
      };
    });

    await this.checkG('重复删除返回 Duty not found', async (): Promise<CheckResult> => {
      const { body } = await this.request('delete', { method: 'POST', body: { id: this.addDutyId } });
      return {
        expect: 'status!=0 + Duty not found.',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']) === 'Duty not found.',
      };
    });

    await this.checkG('删除已开始值班返回 already started', async (): Promise<CheckResult> => {
      const duty = this.baseDuties.get('startedDelete')!;
      const { body } = await this.request('delete', { method: 'POST', body: { id: duty.id } });
      return {
        expect: 'status!=0 + The duty has already started.',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']) === 'The duty has already started.',
      };
    });

    await this.actG('标记已开始值班结果为 COMPLETE', async () => {
      await this.apiOk('markResult', {
        method: 'POST',
        body: { id: this.baseDuties.get('markTarget')!.id, result: 'COMPLETE' },
      });
    });

    await this.checkG('标记结果：DB 更新并写 MARK_RESULT 前后快照', async (): Promise<CheckResult> => {
      const duty = this.baseDuties.get('markTarget')!;
      const row = await this.queryDuty(duty.id);
      const logs = await this.queryLogs(
        `duty_id = ${sqlNum(duty.id)} AND action = 'MARK_RESULT' AND source = 'ADMIN'`,
      );
      const log = logs[0];
      const before = jsonText(log?.['before_json']);
      const after = jsonText(log?.['after_json']);
      const pass =
        String(row?.['result']) === 'COMPLETE' &&
        logs.length === 1 &&
        before.length > 0 &&
        after.includes('COMPLETE');
      return {
        expect: 'result=COMPLETE + MARK_RESULT（before/after）',
        real: `result=${row?.['result']} logs=${logs.length} after=${after}`,
        pass,
      };
    });

    await this.checkG('重复标记返回 already been marked', async (): Promise<CheckResult> => {
      const { body } = await this.request('markResult', {
        method: 'POST',
        body: { id: this.baseDuties.get('markTarget')!.id, result: 'INCOMPLETE' },
      });
      return {
        expect: 'status!=0 + The duty result has already been marked.',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']) === 'The duty result has already been marked.',
      };
    });

    await this.checkG('未开始标记返回 has not started yet', async (): Promise<CheckResult> => {
      const { body } = await this.request('markResult', {
        method: 'POST',
        body: { id: this.baseDuties.get('notStartedMark')!.id, result: 'COMPLETE' },
      });
      return {
        expect: 'status!=0 + The duty has not started yet.',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']) === 'The duty has not started yet.',
      };
    });

    await this.checkG('非法标记结果返回 Invalid duty result.', async (): Promise<CheckResult> => {
      const { body } = await this.request('markResult', {
        method: 'POST',
        body: { id: this.baseDuties.get('notStartedMark')!.id, result: 'DONE' },
      });
      return {
        expect: 'status!=0 + Invalid duty result.',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']) === 'Invalid duty result.',
      };
    });

    await this.checkG('列表按 playerId 过滤', async (): Promise<CheckResult> => {
      const data = await this.list({ playerId: this.playerId });
      const rows = this.listRows(data);
      const bad = rows.filter((r) => toNum(r['playerId']) !== this.playerId);
      return {
        expect: `全部 playerId=${this.playerId}`,
        real: `total=${data['total']} 异常=${bad.length}`,
        pass: rows.length > 0 && bad.length === 0,
      };
    });

    await this.checkG('列表按 playerNo 过滤', async (): Promise<CheckResult> => {
      if (this.playerNo === 0) this.skip('测试账号缺少 NO');
      const data = await this.list({ playerNo: this.playerNo });
      const rows = this.listRows(data);
      const bad = rows.filter((r) => toNum(r['playerId']) !== this.playerId);
      return {
        expect: `全部 playerId=${this.playerId}`,
        real: `total=${data['total']} 异常=${bad.length}`,
        pass: rows.length > 0 && bad.length === 0,
      };
    });

    await this.checkG('列表按 countryCode 过滤', async (): Promise<CheckResult> => {
      if (!this.countryCode) this.skip('测试账号缺少 country_code');
      const data = await this.list({ playerId: this.playerId, countryCode: this.countryCode });
      const rows = this.listRows(data);
      const bad = rows.filter((r) => String(r['countryCode'] ?? '') !== this.countryCode);
      return {
        expect: `全部 countryCode=${this.countryCode}`,
        real: `total=${data['total']} 异常=${bad.length}`,
        pass: rows.length > 0 && bad.length === 0,
      };
    });

    await this.checkG('列表日期范围过滤且按日期升序、同日起始时间降序', async (): Promise<CheckResult> => {
      const from = this.pastDate;
      const to = addDays(this.baseDate, 3);
      const data = await this.list({ playerId: this.playerId, dutyDateStart: from, dutyDateEnd: to });
      const rows = this.listRows(data);
      const out = rows.filter((r) => String(r['dutyDate']) < from || String(r['dutyDate']) > to);
      const badOrder: string[] = [];
      for (let i = 1; i < rows.length; i++) {
        const prevDate = String(rows[i - 1]['dutyDate']);
        const curDate = String(rows[i]['dutyDate']);
        const prevStart = String(rows[i - 1]['startTime']);
        const curStart = String(rows[i]['startTime']);
        if (prevDate > curDate || (prevDate === curDate && prevStart < curStart)) {
          badOrder.push(`${prevDate} ${prevStart} > ${curDate} ${curStart}`);
        }
      }
      return {
        expect: `${from}~${to}，date ASC / startTime DESC`,
        real: `total=${data['total']} 越界=${out.length} 乱序=${badOrder.length}`,
        pass: rows.length > 0 && out.length === 0 && badOrder.length === 0,
      };
    });

    await this.checkG('列表按 attendance / result 过滤', async (): Promise<CheckResult> => {
      const late = await this.list({ playerId: this.playerId, attendance: 'LATE' });
      const incomplete = await this.list({ playerId: this.playerId, result: 'INCOMPLETE' });
      const lateRows = this.listRows(late);
      const incompleteRows = this.listRows(incomplete);
      const pass =
        lateRows.length > 0 &&
        lateRows.every((r) => String(r['attendance']) === 'LATE') &&
        incompleteRows.length > 0 &&
        incompleteRows.every((r) => String(r['result']) === 'INCOMPLETE');
      return {
        expect: 'attendance/LATE 与 result/INCOMPLETE 均命中',
        real: `late=${lateRows.length} incomplete=${incompleteRows.length}`,
        pass,
      };
    });

    await this.checkG('列表 canDelete / canMarkResult 规则正确', async (): Promise<CheckResult> => {
      const data = await this.list({
        playerId: this.playerId,
        dutyDateStart: this.pastDate,
        dutyDateEnd: addDays(this.baseDate, 3),
      });
      const rows = this.listRows(data);
      const find = (id: number) => rows.find((r) => toNum(r['id']) === id);
      const futureOpen = find(this.baseDuties.get('futureOpen')!.id);
      const futureMarked = find(this.baseDuties.get('futureMarked')!.id);
      const pastOpen = find(this.baseDuties.get('pastOpen')!.id);
      const pastLate = find(this.baseDuties.get('pastLate')!.id);
      const pass =
        futureOpen?.['canDelete'] === true &&
        futureOpen?.['canMarkResult'] === false &&
        futureMarked?.['canDelete'] === true &&
        futureMarked?.['canMarkResult'] === false &&
        pastOpen?.['canDelete'] === false &&
        pastOpen?.['canMarkResult'] === true &&
        pastLate?.['canDelete'] === false &&
        pastLate?.['canMarkResult'] === false;
      return {
        expect: '未来未标记：删 true/标 false；历史未标记：删 false/标 true',
        real: `futureOpen=${futureOpen?.['canDelete']}/${futureOpen?.['canMarkResult']} ` +
          `futureMarked=${futureMarked?.['canDelete']}/${futureMarked?.['canMarkResult']} ` +
          `pastOpen=${pastOpen?.['canDelete']}/${pastOpen?.['canMarkResult']} ` +
          `pastLate=${pastLate?.['canDelete']}/${pastLate?.['canMarkResult']}`,
        pass,
      };
    });

    await this.checkG('列表补齐 country/playerNo/nick/统计默认值', async (): Promise<CheckResult> => {
      const data = await this.list({
        playerId: this.playerId,
        dutyDateStart: this.baseDate,
        dutyDateEnd: addDays(this.baseDate, 3),
      });
      const row = this.listRows(data).find((r) => toNum(r['id']) === this.baseDuties.get('futureOpen')!.id);
      const expectedCountry = this.countryCode ? `${this.locale}-${this.countryCode}` : this.locale;
      const pass =
        !!row &&
        String(row['country']) === expectedCountry &&
        toNum(row['playerNo']) === this.playerNo &&
        String(row['nick'] ?? '').length > 0 &&
        toNum(row['discountOrderCount']) === 0 &&
        toNum(row['proactiveDmUserCount']) === 0 &&
        toNum(row['proactiveDmCount']) === 0 &&
        toNum(row['onlineHours']) === 0;
      return {
        expect: `country=${expectedCountry} playerNo=${this.playerNo} 统计=0`,
        real: row
          ? `country=${row['country']} playerNo=${row['playerNo']} nick=${row['nick']} hours=${row['onlineHours']}`
          : '未找到该行',
        pass,
      };
    });

    await this.actG('造数：待审核申请（ADD/MODIFY/CANCEL/超时/冲突）', async () => {
      const now = Date.now();
      const stamp = `${REMARK_PREFIX}${now}`;

      this.approveAddRequestId = await this.seedRequest({
        type: 'ADD',
        target: this.approveAddTarget,
        deadlineAt: this.approveAddTarget.startAt,
        applyAt: now,
        remark: `${stamp}-add`,
      });

      const modifyDuty = await this.seedDuty({ date: addDays(this.baseDate, 5), startTime: 1300, endTime: 1500, result: null });
      this.approveModifyDutyId = modifyDuty.id;
      this.approveModifyRequestId = await this.seedRequest({
        type: 'MODIFY',
        duty: modifyDuty,
        target: this.approveModifyTarget,
        deadlineAt: this.approveModifyTarget.startAt,
        applyAt: now,
        remark: `${stamp}-modify`,
      });

      const cancelDuty = await this.seedDuty({ date: addDays(this.baseDate, 7), startTime: 1700, endTime: 1900, result: null });
      this.approveCancelDutyId = cancelDuty.id;
      this.approveCancelRequestId = await this.seedRequest({
        type: 'CANCEL',
        duty: cancelDuty,
        deadlineAt: cancelDuty.startAt,
        applyAt: now,
        remark: `${stamp}-cancel`,
      });

      this.rejectRequestId = await this.seedRequest({
        type: 'ADD',
        target: this.rejectTarget,
        deadlineAt: this.rejectTarget.startAt,
        applyAt: now,
        remark: `${stamp}-reject`,
      });

      this.expiredRequestId = await this.seedRequest({
        type: 'ADD',
        target: this.expiredTarget,
        deadlineAt: now - 5 * MINUTE_MS,
        applyAt: now - 60 * MINUTE_MS,
        remark: `${stamp}-expired`,
      });

      this.conflictRequestId = await this.seedRequest({
        type: 'ADD',
        target: this.target(addDays(this.baseDate, 2), 2100, 2300),
        deadlineAt: this.target(addDays(this.baseDate, 2), 2100, 2300).startAt,
        applyAt: now,
        remark: `${stamp}-conflict`,
      });

      const startedDuty = await this.seedDuty({ date: addDays(this.today, -29), startTime: 1700, endTime: 1900, result: null });
      this.startedModifyRequestId = await this.seedRequest({
        type: 'MODIFY',
        duty: startedDuty,
        target: this.startedModifyTarget,
        deadlineAt: this.startedModifyTarget.startAt,
        applyAt: now,
        remark: `${stamp}-started`,
      });

      const changedDuty = await this.seedDuty({ date: addDays(this.baseDate, 11), startTime: 1300, endTime: 1500, result: null });
      this.changedModifyRequestId = await this.seedRequest({
        type: 'MODIFY',
        duty: { ...changedDuty, startTime: 1500, endTime: 1700 },
        target: this.changedModifyTarget,
        deadlineAt: this.changedModifyTarget.startAt,
        applyAt: now,
        remark: `${stamp}-changed`,
      });
    });

    await this.checkG('申请列表 ADD：仅 target，original 为空', async (): Promise<CheckResult> => {
      const data = await this.requestList({ playerId: this.playerId, requestType: 'ADD', status: 'PENDING' });
      const row = this.listRows(data).find((r) => toNum(r['id']) === this.approveAddRequestId);
      const pass =
        !!row &&
        (row['original'] ?? null) === null &&
        String(asRecord(row['target'])['date']) === this.approveAddTarget.date &&
        String(asRecord(row['target'])['startTime']) === intToHhmm(this.approveAddTarget.startTime) &&
        (row['originalTimeText'] ?? null) === null &&
        String(row['requestTimeText']).includes(this.approveAddTarget.date) &&
        row['canApprove'] === true &&
        row['canReject'] === true;
      return {
        expect: `ADD target=${this.approveAddTarget.date} 15:00-17:00 original=null`,
        real: row ? `target=${JSON.stringify(row['target'])} requestTimeText=${row['requestTimeText']}` : '未找到申请',
        pass,
      };
    });

    await this.checkG('申请列表 MODIFY：original + target + originalTimeText', async (): Promise<CheckResult> => {
      const data = await this.requestList({ playerId: this.playerId, requestType: 'MODIFY' });
      const row = this.listRows(data).find((r) => toNum(r['id']) === this.approveModifyRequestId);
      const pass =
        !!row &&
        String(asRecord(row['original'])['date']) === addDays(this.baseDate, 5) &&
        String(asRecord(row['target'])['date']) === this.approveModifyTarget.date &&
        String(row['originalTimeText']).includes(addDays(this.baseDate, 5)) &&
        String(row['requestTimeText']).includes(this.approveModifyTarget.date);
      return {
        expect: 'original/target/originalTimeText/requestTimeText 均存在',
        real: row ? `original=${JSON.stringify(row['original'])} target=${JSON.stringify(row['target'])}` : '未找到申请',
        pass,
      };
    });

    await this.checkG('申请列表 CANCEL：仅 original，requestTimeText=原时段', async (): Promise<CheckResult> => {
      const data = await this.requestList({ playerId: this.playerId, requestType: 'CANCEL' });
      const row = this.listRows(data).find((r) => toNum(r['id']) === this.approveCancelRequestId);
      const pass =
        !!row &&
        (row['target'] ?? null) === null &&
        String(asRecord(row['original'])['date']) === addDays(this.baseDate, 7) &&
        String(row['requestTimeText']).includes(addDays(this.baseDate, 7)) &&
        String(row['originalTimeText'] ?? '') === '';
      return {
        expect: 'target=null，requestTimeText=original',
        real: row ? `original=${JSON.stringify(row['original'])} target=${row['target']}` : '未找到申请',
        pass,
      };
    });

    await this.checkG('申请列表按 createTime 倒序并支持状态过滤', async (): Promise<CheckResult> => {
      const data = await this.requestList({ playerId: this.playerId });
      const rows = this.listRows(data);
      const badOrder: string[] = [];
      for (let i = 1; i < rows.length; i++) {
        if (toNum(rows[i - 1]['createTime']) < toNum(rows[i]['createTime'])) {
          badOrder.push(`${rows[i - 1]['id']}>${rows[i]['id']}`);
        }
      }
      const pending = await this.requestList({ playerId: this.playerId, status: 'PENDING' });
      const pendingBad = this.listRows(pending).filter((r) => String(r['status']) !== 'PENDING');
      return {
        expect: 'createTime DESC，status=PENDING 过滤正确',
        real: `rows=${rows.length} 乱序=${badOrder.length} pending异常=${pendingBad.length}`,
        pass: rows.length > 0 && badOrder.length === 0 && pendingBad.length === 0,
      };
    });

    await this.checkG('超时申请被懒更新为 REJECTED / System', async (): Promise<CheckResult> => {
      const data = await this.requestList({ playerId: this.playerId, status: 'REJECTED' });
      const row = this.listRows(data).find((r) => toNum(r['id']) === this.expiredRequestId);
      const db = await this.queryRequest(this.expiredRequestId);
      const logs = await this.queryLogs(`request_id = ${sqlNum(this.expiredRequestId)}`);
      const pass =
        !!row &&
        String(row['status']) === 'REJECTED' &&
        String(row['operatorName']) === 'System' &&
        String(db?.['source']) === 'SYSTEM' &&
        String(db?.['operator_name']) === 'System' &&
        logs.length === 0;
      return {
        expect: 'API/DB 均 REJECTED/System，且无 player_duty_log',
        real: `api=${row?.['status']}/${row?.['operatorName']} db=${db?.['status']}/${db?.['source']}/${db?.['operator_name']} logs=${logs.length}`,
        pass,
      };
    });

    await this.actG('审核通过 ADD 申请', async () => {
      await this.apiOk('request/approve', { method: 'POST', body: { id: this.approveAddRequestId } });
      const row = await this.queryDutyByKey(this.approveAddTarget.dateInt, this.approveAddTarget.startTime);
      if (!row) throw new Error('APPROVE ADD 后未生成值班');
      this.approveAddDutyId = toNum(row['id']);
      this.dutyIds.add(this.approveAddDutyId);
    });

    await this.checkG('APPROVE ADD：申请/值班/日志均正确', async (): Promise<CheckResult> => {
      const request = await this.queryRequest(this.approveAddRequestId);
      const duty = await this.queryDuty(this.approveAddDutyId);
      const logs = await this.queryLogs(
        `request_id = ${sqlNum(this.approveAddRequestId)} AND action = 'APPROVE_ADD'`,
      );
      const pass =
        String(request?.['status']) === 'APPROVED' &&
        String(request?.['source']) === 'ADMIN' &&
        String(request?.['operator_name']) === this.adminName &&
        String(duty?.['locale']) === this.locale &&
        toNum(duty?.['start_at']) === this.approveAddTarget.startAt &&
        toNum(duty?.['end_at']) === this.approveAddTarget.endAt &&
        duty?.['result'] === null &&
        logs.length === 1 &&
        toNullableStr(logs[0]?.['after_json']) !== null;
      return {
        expect: 'request APPROVED/ADMIN + duty start/end 正确 + 1 条 APPROVE_ADD',
        real: `request=${request?.['status']}/${request?.['source']}/${request?.['operator_name']} ` +
          `duty=${duty?.['start_at']}/${duty?.['end_at']} logs=${logs.length}`,
        pass,
      };
    });

    await this.actG('审核通过 MODIFY 申请', async () => {
      await this.apiOk('request/approve', { method: 'POST', body: { id: this.approveModifyRequestId } });
    });

    await this.checkG('APPROVE MODIFY：原值班改期且 start_at/end_at 重算', async (): Promise<CheckResult> => {
      const request = await this.queryRequest(this.approveModifyRequestId);
      const duty = await this.queryDuty(this.approveModifyDutyId);
      const logs = await this.queryLogs(
        `request_id = ${sqlNum(this.approveModifyRequestId)} AND action = 'APPROVE_MODIFY'`,
      );
      const pass =
        String(request?.['status']) === 'APPROVED' &&
        toNum(duty?.['duty_date']) === this.approveModifyTarget.dateInt &&
        toNum(duty?.['start_time']) === this.approveModifyTarget.startTime &&
        toNum(duty?.['start_at']) === this.approveModifyTarget.startAt &&
        toNum(duty?.['end_at']) === this.approveModifyTarget.endAt &&
        logs.length === 1 &&
        toNullableStr(logs[0]?.['before_json']) !== null &&
        toNullableStr(logs[0]?.['after_json']) !== null;
      return {
        expect: `duty -> ${this.approveModifyTarget.date} 15:00-17:00，1 条 APPROVE_MODIFY`,
        real: `request=${request?.['status']} duty=${duty?.['duty_date']}/${duty?.['start_at']} logs=${logs.length}`,
        pass,
      };
    });

    await this.actG('审核通过 CANCEL 申请', async () => {
      await this.apiOk('request/approve', { method: 'POST', body: { id: this.approveCancelRequestId } });
    });

    await this.checkG('APPROVE CANCEL：原值班删除并写 APPROVE_CANCEL', async (): Promise<CheckResult> => {
      const request = await this.queryRequest(this.approveCancelRequestId);
      const duty = await this.queryDuty(this.approveCancelDutyId);
      const logs = await this.queryLogs(
        `request_id = ${sqlNum(this.approveCancelRequestId)} AND action = 'APPROVE_CANCEL'`,
      );
      const pass =
        String(request?.['status']) === 'APPROVED' &&
        duty === null &&
        logs.length === 1 &&
        toNullableStr(logs[0]?.['before_json']) !== null &&
        logs[0]?.['after_json'] === null;
      return {
        expect: '值班删除，APPROVE_CANCEL before 有值 / after 为空',
        real: `request=${request?.['status']} duty=${duty ? '存在' : 'null'} logs=${logs.length}`,
        pass,
      };
    });

    await this.actG('审核拒绝 ADD 申请', async () => {
      await this.apiOk('request/reject', {
        method: 'POST',
        body: { id: this.rejectRequestId, remark: `${REMARK_PREFIX}reject-reason` },
      });
    });

    await this.checkG('REJECT：状态/来源/操作人/原因/日志正确', async (): Promise<CheckResult> => {
      const request = await this.queryRequest(this.rejectRequestId);
      const logs = await this.queryLogs(
        `request_id = ${sqlNum(this.rejectRequestId)} AND action = 'REJECT_REQUEST'`,
      );
      const pass =
        String(request?.['status']) === 'REJECTED' &&
        String(request?.['source']) === 'ADMIN' &&
        String(request?.['operator_name']) === this.adminName &&
        String(request?.['remark']) === `${REMARK_PREFIX}reject-reason` &&
        logs.length === 1 &&
        String(logs[0]?.['remark']) === `${REMARK_PREFIX}reject-reason` &&
        String(logs[0]?.['source']) === 'ADMIN';
      return {
        expect: 'REJECTED/ADMIN/操作人/原因，1 条 REJECT_REQUEST',
        real: `request=${request?.['status']}/${request?.['source']}/${request?.['operator_name']} ` +
          `remark=${request?.['remark']} logs=${logs.length}`,
        pass,
      };
    });

    await this.checkG('重复审核已处理申请返回 already processed', async (): Promise<CheckResult> => {
      const { body } = await this.request('request/approve', {
        method: 'POST',
        body: { id: this.rejectRequestId },
      });
      return {
        expect: 'status!=0 + The request has already been processed.',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']) === 'The request has already been processed.',
      };
    });

    await this.checkG('审核超时申请返回 The request has expired.', async (): Promise<CheckResult> => {
      const { body } = await this.request('request/approve', {
        method: 'POST',
        body: { id: this.expiredRequestId },
      });
      return {
        expect: 'status!=0 + The request has expired.',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']) === 'The request has expired.',
      };
    });

    await this.checkG('APPROVE ADD 目标时段冲突：提示冲突且申请保持 PENDING', async (): Promise<CheckResult> => {
      const { body } = await this.request('request/approve', {
        method: 'POST',
        body: { id: this.conflictRequestId },
      });
      const request = await this.queryRequest(this.conflictRequestId);
      const pass =
        rowStatus(body) !== '0' &&
        String(body['msg']) === 'Failed. The player already has a shift during this time.' &&
        String(request?.['status']) === 'PENDING';
      return {
        expect: 'shift conflict + request PENDING',
        real: `${errText(body)} request=${request?.['status']}`,
        pass,
      };
    });

    await this.checkG('APPROVE MODIFY 原值班已开始返回 already started', async (): Promise<CheckResult> => {
      const { body } = await this.request('request/approve', {
        method: 'POST',
        body: { id: this.startedModifyRequestId },
      });
      const request = await this.queryRequest(this.startedModifyRequestId);
      return {
        expect: 'status!=0 + The duty has already started.',
        real: `${errText(body)} request=${request?.['status']}`,
        pass: rowStatus(body) !== '0' && String(body['msg']) === 'The duty has already started.',
      };
    });

    await this.checkG('APPROVE MODIFY 快照不一致返回 The duty has changed', async (): Promise<CheckResult> => {
      const { body } = await this.request('request/approve', {
        method: 'POST',
        body: { id: this.changedModifyRequestId },
      });
      return {
        expect: 'status!=0 + The duty has changed, please refresh.',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']) === 'The duty has changed, please refresh.',
      };
    });

    await this.actG('上传 Excel：同一日期 3 个固定班次', async () => {
      await this.requireExcel();
      const dateInt = dateToInt(addDays(this.baseDate, 13));
      const body = await this.uploadExcel([
        [this.playerId, dateInt, 1100, 1300],
        [this.playerId, dateInt, 1300, 1500],
        [this.playerId, dateInt, 1500, 1700],
      ]);
      if (rowStatus(body) !== '0') throw new Error(`Excel 上传失败：${errText(body)}`);
      const rows = await this.mysql.query(
        `SELECT id FROM player_duty WHERE locale = ${sqlStr(this.locale)} AND player_id = ${sqlNum(this.playerId)} ` +
          `AND duty_date = ${sqlNum(dateInt)}`,
        DB_BASIC,
      );
      this.uploadDutyIds = rows.map((r) => toNum(r['id']));
      for (const id of this.uploadDutyIds) this.dutyIds.add(id);
    });

    await this.checkG('Excel 上传成功：导入 3 条并生成快照/ADD 日志', async (): Promise<CheckResult> => {
      await this.requireExcel();
      const dateInt = dateToInt(addDays(this.baseDate, 13));
      const rows = await this.mysql.query(
        `SELECT * FROM player_duty WHERE locale = ${sqlStr(this.locale)} AND player_id = ${sqlNum(this.playerId)} ` +
          `AND duty_date = ${sqlNum(dateInt)} ORDER BY start_time`,
        DB_BASIC,
      );
      const logs = await this.queryLogs(
        `duty_id IN (${this.uploadDutyIds.map(sqlNum).join(', ') || '0'}) AND action = 'ADD'`,
      );
      const startsOk = [1100, 1300, 1500].every((start) => {
        const row = rows.find((r) => toNum(r['start_time']) === start);
        return (
          !!row &&
          toNum(row['start_at']) === epochOf(addDays(this.baseDate, 13), start, this.zone) &&
          toNum(row['end_at']) === epochOf(addDays(this.baseDate, 13), start + 200, this.zone) &&
          String(row['country_code'] ?? '') === this.countryCode
        );
      });
      return {
        expect: '3 条值班，start_at/end_at/country 正确，3 条 ADD',
        real: `rows=${rows.length} logs=${logs.length} startsOk=${startsOk}`,
        pass: rows.length === 3 && logs.length === 3 && startsOk,
      };
    });

    await this.checkG('重复上传同一文件返回 assigned more than once', async (): Promise<CheckResult> => {
      await this.requireExcel();
      const dateInt = dateToInt(addDays(this.baseDate, 13));
      const body = await this.uploadExcel([
        [this.playerId, dateInt, 1100, 1300],
        [this.playerId, dateInt, 1300, 1500],
        [this.playerId, dateInt, 1500, 1700],
      ]);
      return {
        expect: 'status!=0 + has been assigned more than once',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']).includes('has been assigned more than once'),
      };
    });

    await this.checkG('Excel 班次不足整表失败且不落库', async (): Promise<CheckResult> => {
      await this.requireExcel();
      const date = addDays(this.baseDate, 14);
      const dateInt = dateToInt(date);
      const body = await this.uploadExcel([[this.playerId, dateInt, 1100, 1300]]);
      const rows = await this.mysql.query(
        `SELECT id FROM player_duty WHERE locale = ${sqlStr(this.locale)} AND player_id = ${sqlNum(this.playerId)} ` +
          `AND duty_date = ${sqlNum(dateInt)}`,
        DB_BASIC,
      );
      return {
        expect: `status!=0 + Insufficient duty shifts on ${dateInt}，DB 0 条`,
        real: `${errText(body)} rows=${rows.length}`,
        pass: rowStatus(body) !== '0' && String(body['msg']).includes('Insufficient duty shifts') && rows.length === 0,
      };
    });

    await this.checkG('Excel 非法班次返回 Invalid date or time format', async (): Promise<CheckResult> => {
      await this.requireExcel();
      const dateInt = dateToInt(addDays(this.baseDate, 14));
      const body = await this.uploadExcel([[this.playerId, dateInt, 1200, 1400]]);
      return {
        expect: 'status!=0 + Invalid date or time format',
        real: errText(body),
        pass: rowStatus(body) !== '0' && String(body['msg']).includes('Invalid date or time format'),
      };
    });

    await this.actG('导出值班列表', async () => {
      this.exportFile = await this.download('export', {
        playerId: this.playerId,
        dutyDateStart: this.pastDate,
        dutyDateEnd: addDays(this.baseDate, 20),
      });
    });

    await this.checkG('导出：文件名/xlsx 内容/筛选行匹配', async (): Promise<CheckResult> => {
      const file = this.exportFile!;
      const Excel = await loadExcel();
      const headers: string[] = [];
      let hasPlayer = false;
      if (Excel) {
        const wb = new Excel.Workbook();
        await wb.xlsx.load(file.buffer);
        const ws = wb.worksheets[0];
        const header = ws?.getRow(1).values ?? [];
        headers.push(...[1, 2, 3].map((i) => headerValue(header, i)));
        ws?.eachRow((row, no) => {
          if (no > 1 && String(row.getCell(1).value ?? '') === String(this.playerId)) hasPlayer = true;
        });
      }
      const pass =
        file.status === 200 &&
        file.disposition.includes('player_duty_export.xlsx') &&
        file.buffer.subarray(0, 2).toString() === 'PK' &&
        (Excel ? headers[0] === 'ID' && headers[1] === 'NO' && headers[2] === 'Nick' && hasPlayer : true);
      return {
        expect: Excel ? 'player_duty_export.xlsx，表头 ID/NO/Nick，含测试玩家' : 'player_duty_export.xlsx（未装 exceljs，仅校验文件）',
        real: `http=${file.status} ${file.disposition} headers=${headers.join('/') || 'skip'} hasPlayer=${hasPlayer}`,
        pass,
      };
    });

    await this.actG('造数并等待 Attendance 定时任务', async () => {
      const now = Date.now();
      const date = addDays(this.baseDate, 15);
      const dateInt = dateToInt(date);
      const activeRow = await this.mysql.query(
        `SELECT is_active FROM user_profile WHERE id = ${sqlNum(this.playerId)} LIMIT 1`,
        DB_FUNBIT,
      );
      const rawActive = activeRow[0]?.['is_active'];
      this.originalIsActive = rawActive === null || rawActive === undefined ? null : toNum(rawActive);
      this.activeCaptured = true;
      await this.mysql.execute(
        `UPDATE user_profile SET is_active = 1 WHERE id = ${sqlNum(this.playerId)}`,
        DB_FUNBIT,
      );

      const absent = await this.seedDuty({
        date,
        startTime: 600,
        endTime: 900,
        startAt: now - 40 * MINUTE_MS,
        endAt: now + 30 * MINUTE_MS,
        result: null,
        attendance: null,
      });
      const normal = await this.seedDuty({
        date,
        startTime: 1000,
        endTime: 1300,
        startAt: now - 2 * MINUTE_MS,
        endAt: now + 30 * MINUTE_MS,
        result: null,
        attendance: null,
      });
      const existing = await this.seedDuty({
        date,
        startTime: 1400,
        endTime: 1700,
        startAt: now - 40 * MINUTE_MS,
        endAt: now + 30 * MINUTE_MS,
        result: null,
        attendance: 'NORMAL',
      });
      this.attendanceDutyIds = [absent.id, normal.id, existing.id];

      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const rows = await this.mysql.query(
          `SELECT * FROM player_duty WHERE id IN (${this.attendanceDutyIds.map(sqlNum).join(', ')})`,
          DB_BASIC,
        );
        const a = rows.find((r) => toNum(r['id']) === absent.id);
        const n = rows.find((r) => toNum(r['id']) === normal.id);
        if (toNullableStr(a?.['attendance']) !== null && toNullableStr(n?.['attendance']) !== null) {
          this.attendanceRows = rows;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      this.attendanceRows = await this.mysql.query(
        `SELECT * FROM player_duty WHERE id IN (${this.attendanceDutyIds.map(sqlNum).join(', ')})`,
        DB_BASIC,
      );
    });

    await this.checkG('Attendance：在线 2 分钟=NORMAL，在线 40 分钟=ABSENT', async (): Promise<CheckResult> => {
      const rows = this.attendanceRows;
      const absent = rows.find((r) => toNum(r['id']) === this.attendanceDutyIds[0]);
      const normal = rows.find((r) => toNum(r['id']) === this.attendanceDutyIds[1]);
      const pass =
        String(absent?.['attendance']) === 'ABSENT' &&
        String(normal?.['attendance']) === 'NORMAL';
      return {
        expect: 'ABSENT / NORMAL',
        real: `absent=${absent?.['attendance'] ?? 'null'} normal=${normal?.['attendance'] ?? 'null'}`,
        pass,
      };
    });

    await this.checkG('Attendance 已有值不覆盖且不写 player_duty_log', async (): Promise<CheckResult> => {
      const existing = this.attendanceRows.find((r) => toNum(r['id']) === this.attendanceDutyIds[2]);
      const logs = await this.queryLogs(
        `duty_id IN (${this.attendanceDutyIds.map(sqlNum).join(', ')})`,
      );
      return {
        expect: 'attendance=NORMAL，日志 0 条',
        real: `attendance=${existing?.['attendance']} logs=${logs.length}`,
        pass: String(existing?.['attendance']) === 'NORMAL' && logs.length === 0,
      };
    });

    await this.actG('恢复账号在线状态', async () => {
      await this.restoreActive();
    });

    await this.actG('清理测试数据', async () => {
      if (KEEP_DATA) {
        this.log('--keep-data 已开启，保留测试数据');
        return;
      }
      await this.restoreActive();
      await this.cleanupData();
      this.cleaned = true;
      this.log('测试数据已清理');
    });
  }
}

await new PlayerDutyAdminSmoke().execute();
