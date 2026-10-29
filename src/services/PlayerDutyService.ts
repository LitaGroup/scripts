import crypto from 'node:crypto';
import type { MySQLTestResource, MysqlRow } from '../resources/MySQLTestResource.ts';

const HOST = 'https://api.test.cinta.team/';
const TOKEN_AES_KEY = 'to_sigNon_eNckey';
const DB_BASIC = 'lita_basic';
const DB_FUNBIT = 'funbit';
const DEFAULT_TIMEOUT_MS = 30_000;

export interface DutySlot {
  key: string;
  startTime: string;
  endTime: string;
}

export interface DutyEntry {
  visible: boolean;
  isPlayer: boolean;
  serverNow: number;
  minMonth: string;
  maxApplyDate: string;
  minApplyAt: number;
  slots: DutySlot[];
}

export interface DutyPendingRequest {
  id: number;
  type: string;
  status: string;
}

export interface DutyShift {
  dutyId: number;
  startAt: number;
  endAt: number;
  startTime: string;
  endTime: string;
  state: string;
  result: string | null;
  canModify: boolean;
  canCancel: boolean;
  pendingRequest: DutyPendingRequest | null;
}

export interface DutyDay {
  date: string;
  isToday: boolean;
  isPast: boolean;
  hasDuty: boolean;
  shifts: DutyShift[];
}

export interface DutyCalendar {
  view: string;
  offset: number;
  startDate: string;
  endDate: string;
  today: string;
  days: DutyDay[];
}

export interface DutySlotInfo {
  date: string;
  startTime: string;
  endTime: string;
}

export interface DutyRequestItem {
  id: number;
  type: string;
  status: string;
  original: DutySlotInfo | null;
  target: DutySlotInfo | null;
  applyAt: number;
  reviewAt: number | null;
  operatorName: string | null;
}

export interface DutyApplyResult {
  requestId: number;
  status: string;
}

export type DutyResult<T> =
  | { ok: true; content: T }
  | { ok: false; status: number; state: string; message: string; localeMessage?: string };

export interface DutySeed {
  locale: string;
  playerId: number;
  dutyDate: number;
  startTime: number;
  endTime: number;
  startAt: number;
  endAt: number;
  result?: string | null;
  attendance?: string | null;
}

export interface PendingRequestSeed {
  locale: string;
  playerId: number;
  requestType: string;
  targetDate: number;
  targetStartTime: number;
  targetEndTime: number;
  deadlineAt: number;
  applyAt: number;
  remark: string;
}

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNum(v: unknown): number | null {
  return v === null || v === undefined || v === '' ? null : toNum(v);
}

function toStringOrEmpty(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function toNullableStr(v: unknown): string | null {
  return v === null || v === undefined || v === '' ? null : String(v);
}

function toBool(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true';
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function asList(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) throw new Error(`PlayerDutyService: invalid numeric value: ${n}`);
  return str;
}

function quoteNullableStr(v: string | null | undefined): string {
  return v === null || v === undefined || v === '' ? 'NULL' : quoteStr(v);
}

function makeAccessToken(userId: number | string): string {
  const buf = Buffer.alloc(40);
  let o = 0;
  buf.write('LITA', o, 'latin1');
  o += 4;
  buf.writeInt32BE(1, o);
  o += 4;
  buf.writeBigInt64BE(BigInt(userId), o);
  o += 8;
  buf.write('MU', o, 'latin1');
  o += 2;
  buf.writeBigInt64BE(BigInt(Date.now() + 30 * 24 * 3600_000), o);
  o += 8;
  buf.writeInt32BE(1, o);
  o += 4;
  buf.writeBigInt64BE(BigInt(1), o);
  o += 8;
  buf.writeInt16BE(1, o);
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(TOKEN_AES_KEY, 'utf8'), null);
  return Buffer.concat([cipher.update(buf), cipher.final()]).toString('base64');
}

function parseSlot(v: unknown): DutySlot {
  const r = asRecord(v);
  return {
    key: toStringOrEmpty(r['key']),
    startTime: toStringOrEmpty(r['startTime']),
    endTime: toStringOrEmpty(r['endTime']),
  };
}

function parseShift(v: unknown): DutyShift {
  const r = asRecord(v);
  const pending = r['pendingRequest'];
  const p = pending === null || pending === undefined ? null : asRecord(pending);
  return {
    dutyId: toNum(r['dutyId']),
    startAt: toNum(r['startAt']),
    endAt: toNum(r['endAt']),
    startTime: toStringOrEmpty(r['startTime']),
    endTime: toStringOrEmpty(r['endTime']),
    state: toStringOrEmpty(r['state']),
    result: toNullableStr(r['result']),
    canModify: toBool(r['canModify']),
    canCancel: toBool(r['canCancel']),
    pendingRequest: p
      ? { id: toNum(p['id']), type: toStringOrEmpty(p['type']), status: toStringOrEmpty(p['status']) }
      : null,
  };
}

function parseDay(v: unknown): DutyDay {
  const r = asRecord(v);
  return {
    date: toStringOrEmpty(r['date']),
    isToday: toBool(r['isToday']),
    isPast: toBool(r['isPast']),
    hasDuty: toBool(r['hasDuty']),
    shifts: asList(r['shifts']).map(parseShift),
  };
}

function parseSlotInfo(v: unknown): DutySlotInfo | null {
  if (v === null || v === undefined) return null;
  const r = asRecord(v);
  return {
    date: toStringOrEmpty(r['date']),
    startTime: toStringOrEmpty(r['startTime']),
    endTime: toStringOrEmpty(r['endTime']),
  };
}

export class PlayerDutyService {
  readonly mysql: MySQLTestResource;

  constructor(mysql: MySQLTestResource) {
    this.mysql = mysql;
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    userId: number,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<DutyResult<T>> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) query.set(k, String(v));
    }
    const qs = query.toString();
    const url = HOST.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '') + (qs ? `?${qs}` : '');
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        AccessToken: makeAccessToken(userId),
        appPlat: 'Android',
        appVersion: '1.590',
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      const text = await res.text().catch(() => '');
      throw new Error(`PlayerDutyService: 非 JSON 响应 ${res.status}: ${text.slice(0, 300)}`);
    }
    const body = asRecord(raw);
    const status = toNum(body['status']);
    if (res.status >= 400) {
      return {
        ok: false,
        status: res.status,
        state: toStringOrEmpty(body['state'] ?? body['error'] ?? `HTTP_${res.status}`),
        message: toStringOrEmpty(body['message'] ?? body['msg'] ?? res.statusText),
      };
    }
    if (status !== 0) {
      return {
        ok: false,
        status,
        state: toStringOrEmpty(body['state']),
        message: toStringOrEmpty(body['message'] ?? body['msg']),
        localeMessage: toNullableStr(body['localeMessage']) ?? undefined,
      };
    }
    return { ok: true, content: (body['content'] ?? body['data']) as T };
  }

  async entry(userId: number): Promise<DutyResult<DutyEntry>> {
    const r = await this.call<unknown>('GET', 'litabasic/playerDuty/entry', userId);
    if (!r.ok) return r;
    const d = asRecord(r.content);
    return {
      ok: true,
      content: {
        visible: toBool(d['visible']),
        isPlayer: toBool(d['isPlayer']),
        serverNow: toNum(d['serverNow']),
        minMonth: toStringOrEmpty(d['minMonth']),
        maxApplyDate: toStringOrEmpty(d['maxApplyDate']),
        minApplyAt: toNum(d['minApplyAt']),
        slots: asList(d['slots']).map(parseSlot),
      },
    };
  }

  async calendar(userId: number, view: string, offset?: number): Promise<DutyResult<DutyCalendar>> {
    const r = await this.call<unknown>('GET', 'litabasic/playerDuty/calendar', userId, {
      query: { view, offset },
    });
    if (!r.ok) return r;
    const d = asRecord(r.content);
    return {
      ok: true,
      content: {
        view: toStringOrEmpty(d['view']),
        offset: toNum(d['offset']),
        startDate: toStringOrEmpty(d['startDate']),
        endDate: toStringOrEmpty(d['endDate']),
        today: toStringOrEmpty(d['today']),
        days: asList(d['days']).map(parseDay),
      },
    };
  }

  async add(userId: number, date: string, slotKey: string): Promise<DutyResult<DutyApplyResult>> {
    return this.callApply('litabasic/playerDuty/request/add', userId, { date, slotKey });
  }

  async modify(
    userId: number,
    dutyId: number,
    date: string,
    slotKey: string,
  ): Promise<DutyResult<DutyApplyResult>> {
    return this.callApply('litabasic/playerDuty/request/modify', userId, { dutyId, date, slotKey });
  }

  async cancel(userId: number, dutyId: number): Promise<DutyResult<DutyApplyResult>> {
    return this.callApply('litabasic/playerDuty/request/cancel', userId, { dutyId });
  }

  private async callApply(
    path: string,
    userId: number,
    body: Record<string, unknown>,
  ): Promise<DutyResult<DutyApplyResult>> {
    const r = await this.call<unknown>('POST', path, userId, { body });
    if (!r.ok) return r;
    const d = asRecord(r.content);
    return { ok: true, content: { requestId: toNum(d['requestId']), status: toStringOrEmpty(d['status']) } };
  }

  async requests(userId: number): Promise<DutyResult<DutyRequestItem[]>> {
    const r = await this.call<unknown>('GET', 'litabasic/playerDuty/requests', userId);
    if (!r.ok) return r;
    const d = asRecord(r.content);
    return {
      ok: true,
      content: asList(d['requests']).map((x) => {
        const item = asRecord(x);
        return {
          id: toNum(item['id']),
          type: toStringOrEmpty(item['type']),
          status: toStringOrEmpty(item['status']),
          original: parseSlotInfo(item['original']),
          target: parseSlotInfo(item['target']),
          applyAt: toNum(item['applyAt']),
          reviewAt: toNullableNum(item['reviewAt']),
          operatorName: toNullableStr(item['operatorName']),
        };
      }),
    };
  }

  async findPlayerIds(locale: string, limit = 20): Promise<number[]> {
    const rows = await this.mysql.query(
      `SELECT p.id AS id FROM user_profile p JOIN user_config c ON c.id = p.id ` +
        `WHERE p.is_player = 1 AND c.locale = ${quoteStr(locale)} ORDER BY p.id LIMIT ${quoteNum(limit)}`,
      DB_FUNBIT,
    );
    return rows.map((r) => toNum(r['id'])).filter((id) => id > 0);
  }

  async findNonPlayerIds(locale: string, limit = 20): Promise<number[]> {
    const rows = await this.mysql.query(
      `SELECT p.id AS id FROM user_profile p JOIN user_config c ON c.id = p.id ` +
        `WHERE (p.is_player = 0 OR p.is_player IS NULL) AND c.locale = ${quoteStr(locale)} ` +
        `ORDER BY p.id LIMIT ${quoteNum(limit)}`,
      DB_FUNBIT,
    );
    return rows.map((r) => toNum(r['id'])).filter((id) => id > 0);
  }

  async localeOf(userId: number): Promise<string | null> {
    const rows = await this.mysql.query(
      `SELECT locale FROM user_config WHERE id = ${quoteNum(userId)} LIMIT 1`,
      DB_FUNBIT,
    );
    return rows.length > 0 ? toNullableStr(rows[0]['locale']) : null;
  }

  async queryDuties(locale: string, playerId: number, fromDate: number, toDate: number): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT * FROM player_duty WHERE locale = ${quoteStr(locale)} AND player_id = ${quoteNum(playerId)} ` +
        `AND duty_date BETWEEN ${quoteNum(fromDate)} AND ${quoteNum(toDate)} ORDER BY duty_date, start_time`,
      DB_BASIC,
    );
  }

  async queryDutiesForDate(locale: string, playerId: number, dutyDate: number): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT * FROM player_duty WHERE locale = ${quoteStr(locale)} AND player_id = ${quoteNum(playerId)} ` +
        `AND duty_date = ${quoteNum(dutyDate)} ORDER BY start_time`,
      DB_BASIC,
    );
  }

  async findDuty(locale: string, playerId: number, dutyDate: number, startTime: number): Promise<MysqlRow | null> {
    const rows = await this.mysql.query(
      `SELECT * FROM player_duty WHERE locale = ${quoteStr(locale)} AND player_id = ${quoteNum(playerId)} ` +
        `AND duty_date = ${quoteNum(dutyDate)} AND start_time = ${quoteNum(startTime)} LIMIT 1`,
      DB_BASIC,
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async insertDuty(seed: DutySeed): Promise<{ id: number; inserted: boolean }> {
    const affected = await this.mysql.execute(
      `INSERT IGNORE INTO player_duty ` +
        `(locale, player_id, duty_date, start_time, end_time, start_at, end_at, attendance, result, ` +
        `discount_order_count, proactive_dm_user_count, proactive_dm_count, online_hours, create_time, update_time) ` +
        `VALUES (${quoteStr(seed.locale)}, ${quoteNum(seed.playerId)}, ${quoteNum(seed.dutyDate)}, ` +
        `${quoteNum(seed.startTime)}, ${quoteNum(seed.endTime)}, ${quoteNum(seed.startAt)}, ${quoteNum(seed.endAt)}, ` +
        `${quoteNullableStr(seed.attendance ?? null)}, ${quoteNullableStr(seed.result ?? null)}, 0, 0, 0, 0.00, ` +
        `${quoteNum(Date.now())}, ${quoteNum(Date.now())})`,
      DB_BASIC,
    );
    const row = await this.findDuty(seed.locale, seed.playerId, seed.dutyDate, seed.startTime);
    if (!row) throw new Error(`PlayerDutyService: 造数后未找到值班记录 ${seed.dutyDate}/${seed.startTime}`);
    return { id: toNum(row['id']), inserted: affected > 0 };
  }

  async deleteDutyByKey(locale: string, playerId: number, dutyDate: number, startTime: number): Promise<void> {
    await this.mysql.execute(
      `DELETE FROM player_duty WHERE locale = ${quoteStr(locale)} AND player_id = ${quoteNum(playerId)} ` +
        `AND duty_date = ${quoteNum(dutyDate)} AND start_time = ${quoteNum(startTime)}`,
      DB_BASIC,
    );
  }

  async deleteDutyIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.mysql.execute(
      `DELETE FROM player_duty WHERE id IN (${ids.map(quoteNum).join(', ')})`,
      DB_BASIC,
    );
  }

  async deleteRequestIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.mysql.execute(
      `DELETE FROM player_duty_request WHERE id IN (${ids.map(quoteNum).join(', ')})`,
      DB_BASIC,
    );
  }

  async deleteRequestsByRemarkPrefix(locale: string, playerId: number, prefix: string): Promise<void> {
    await this.mysql.execute(
      `DELETE FROM player_duty_request WHERE locale = ${quoteStr(locale)} AND player_id = ${quoteNum(playerId)} ` +
        `AND remark LIKE ${quoteStr(prefix + '%')}`,
      DB_BASIC,
    );
  }

  async queryRequest(requestId: number): Promise<MysqlRow | null> {
    const rows = await this.mysql.query(
      `SELECT * FROM player_duty_request WHERE id = ${quoteNum(requestId)} LIMIT 1`,
      DB_BASIC,
    );
    return rows.length > 0 ? rows[0] : null;
  }

  async queryPendingRequests(locale: string, playerId: number): Promise<MysqlRow[]> {
    return this.mysql.query(
      `SELECT * FROM player_duty_request WHERE locale = ${quoteStr(locale)} AND player_id = ${quoteNum(playerId)} ` +
        `AND status = 'PENDING' ORDER BY id`,
      DB_BASIC,
    );
  }

  async insertPendingRequest(seed: PendingRequestSeed): Promise<number> {
    const now = Date.now();
    await this.mysql.execute(
      `INSERT INTO player_duty_request ` +
        `(locale, player_id, request_type, target_date, target_start_time, target_end_time, deadline_at, ` +
        `status, source, apply_at, create_time, update_time, remark) ` +
        `VALUES (${quoteStr(seed.locale)}, ${quoteNum(seed.playerId)}, ${quoteStr(seed.requestType)}, ` +
        `${quoteNum(seed.targetDate)}, ${quoteNum(seed.targetStartTime)}, ${quoteNum(seed.targetEndTime)}, ` +
        `${quoteNum(seed.deadlineAt)}, 'PENDING', 'PLAYER', ${quoteNum(seed.applyAt)}, ` +
        `${quoteNum(now)}, ${quoteNum(now)}, ${quoteStr(seed.remark)})`,
      DB_BASIC,
    );
    const rows = await this.mysql.query(
      `SELECT id FROM player_duty_request WHERE locale = ${quoteStr(seed.locale)} AND player_id = ${quoteNum(seed.playerId)} ` +
        `AND remark = ${quoteStr(seed.remark)} ORDER BY id DESC LIMIT 1`,
      DB_BASIC,
    );
    if (rows.length === 0) throw new Error('PlayerDutyService: 超时申请造数后未找到记录');
    return toNum(rows[0]['id']);
  }
}
