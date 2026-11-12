/**
 * TK-0251 lita-payment 余额 Redis 锁 P0 接口测试公共工具。
 *
 * 约束：
 * - 只读 /actuator/prometheus 观测锁指标，不直接读写 Redis；
 * - 不修改被测服务配置，配置阶段由需求方/后端在测试环境切换；
 * - password 由环境变量注入，不落代码/日志/报告；
 * - 所有写余额操作按 userId 记录基线并在 finally 回补。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PaymentClient, type PaymentResponse, amountOf, businessState, businessStatus, isOk } from './payment-client.ts';

export const TRANS_PREFIX = '/litapayment/global/trans';
export const BUSY_STATE = 'R_FREQUENT_ACCESS';
export const BUSY_STATUS = '400005';

export interface MetricsSnapshot {
  at: string;
  raw: string;
  values: Map<string, number>;
}

export interface LockMetrics {
  acquire: number;
  acquireFail: number;
  timeout: number;
  expired: number;
  redisError: number;
  waitAcquired: number;
  waitTimeout: number;
  families: string[];
}

export interface BatchItem {
  tag: string;
  transNo: string;
  response: PaymentResponse;
}

export interface BatchSummary {
  total: number;
  ok: BatchItem[];
  busy: BatchItem[];
  other: BatchItem[];
}

export function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

export function stamp(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function envUserId(name: string, fallback?: string): number {
  const raw = process.env[name] ?? fallback;
  if (!raw) throw new Error(`缺少环境变量 ${name}（测试用户 ID）`);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`环境变量 ${name} 不是合法 userId: ${raw}`);
  return value;
}

export function writeEvidence(dir: string, name: string, data: unknown): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2), 'utf8');
  return file;
}

export async function readMetrics(host: string): Promise<MetricsSnapshot> {
  const res = await fetch(`${host.replace(/\/+$/, '')}/actuator/prometheus`, {
    headers: { Accept: 'text/plain' },
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await res.text();
  const values = new Map<string, number>();
  for (const line of raw.split('\n')) {
    if (!line.startsWith('redis_lock_')) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+([0-9.eE+-]+)\s*$/);
    if (!m) continue;
    const value = Number(m[3]);
    if (Number.isFinite(value)) values.set(`${m[1]}{${m[2]}}`, value);
  }
  return { at: new Date().toISOString(), raw, values };
}

export function hasMetric(snapshot: MetricsSnapshot, name: string): boolean {
  for (const key of snapshot.values.keys()) {
    if (key.startsWith(`${name}{`) || key === name) return true;
  }
  return false;
}

export function metricSum(snapshot: MetricsSnapshot, name: string, labelFilter?: string): number {
  let total = 0;
  for (const [key, value] of snapshot.values) {
    if (!(key.startsWith(`${name}{`) || key === name)) continue;
    if (labelFilter && !key.includes(labelFilter)) continue;
    total += value;
  }
  return total;
}

function sumFirst(snapshot: MetricsSnapshot, names: string[], labelFilter?: string): number {
  for (const name of names) {
    if (hasMetric(snapshot, name)) return metricSum(snapshot, name, labelFilter);
  }
  return 0;
}

export function lockMetrics(snapshot: MetricsSnapshot): LockMetrics {
  const families = [...new Set([...snapshot.values.keys()].map((key) => key.slice(0, key.indexOf('{'))))].sort();
  return {
    acquire: sumFirst(snapshot, ['redis_lock_acquire_total', 'redis_lock_acquire'], 'reason="acquired"'),
    acquireFail: sumFirst(snapshot, ['redis_lock_acquire_fail_total', 'redis_lock_acquire_fail']),
    timeout: sumFirst(snapshot, ['redis_lock_acquire_fail_total', 'redis_lock_acquire_fail'], 'reason="timeout"'),
    expired: sumFirst(snapshot, ['redis_lock_expired_total', 'redis_lock_expired']),
    redisError: sumFirst(snapshot, ['redis_lock_redis_error_total', 'redis_lock_redis_error']),
    waitAcquired: metricSum(snapshot, 'redis_lock_wait_ms_count', 'result="acquired"'),
    waitTimeout: metricSum(snapshot, 'redis_lock_wait_ms_count', 'result="timeout"'),
    families,
  };
}

export function metricsDelta(before: LockMetrics, after: LockMetrics) {
  return {
    acquire: after.acquire - before.acquire,
    acquireFail: after.acquireFail - before.acquireFail,
    timeout: after.timeout - before.timeout,
    expired: after.expired - before.expired,
    redisError: after.redisError - before.redisError,
    waitAcquired: after.waitAcquired - before.waitAcquired,
    waitTimeout: after.waitTimeout - before.waitTimeout,
  };
}

export function isBusy(body: any): boolean {
  return businessState(body) === BUSY_STATE && businessStatus(body) === BUSY_STATUS;
}

export function classify(body: any): 'ok' | 'busy' | 'other' {
  if (isOk(body)) return 'ok';
  if (isBusy(body)) return 'busy';
  return 'other';
}

export function summarize(items: BatchItem[]): BatchSummary {
  const ok = items.filter((item) => classify(item.response.body) === 'ok');
  const busy = items.filter((item) => classify(item.response.body) === 'busy');
  const other = items.filter((item) => classify(item.response.body) === 'other');
  return { total: items.length, ok, busy, other };
}

export function transNo(runId: string, tag: string): string {
  return `TK251-${runId}-${tag}`;
}

export async function getAmount(client: PaymentClient, userId: number, biz: string): Promise<number> {
  const response = await client.post(`${TRANS_PREFIX}/getAmountByBiz`, { userId, biz });
  return amountOf(response.body);
}

export async function transResult(
  client: PaymentClient,
  userId: number,
  biz: string,
  no: string,
  direction: 'IN' | 'OUT',
): Promise<PaymentResponse> {
  return client.post(`${TRANS_PREFIX}/getTransResult`, {
    param: { biz, userId, transNo: no, direction, inDealType: 'coin' },
  });
}

export async function add(
  client: PaymentClient,
  userId: number,
  biz: string,
  runId: string,
  tag: string,
  amount = 0.01,
): Promise<BatchItem> {
  const no = transNo(runId, tag);
  const response = await client.post(`${TRANS_PREFIX}/addAccountMoney`, {
    param: { biz, userId, transNo: no, amount, type: 'ADD_MONEY', remark: `TK-0251 ${tag}`, inDealType: 'coin' },
  });
  return { tag, transNo: no, response };
}

export async function sub(
  client: PaymentClient,
  userId: number,
  biz: string,
  runId: string,
  tag: string,
  amount = 0.01,
): Promise<BatchItem> {
  const no = transNo(runId, tag);
  const response = await client.post(`${TRANS_PREFIX}/subAccountMoney`, {
    param: { biz, userId, transNo: no, amount, type: 'SUB_MONEY', remark: `TK-0251 ${tag}`, inDealType: 'coin' },
  });
  return { tag, transNo: no, response };
}

export async function refund(
  client: PaymentClient,
  userId: number,
  biz: string,
  sourceTransNo: string,
  tag: string,
): Promise<PaymentResponse> {
  return client.post(`${TRANS_PREFIX}/refund`, {
    param: { biz, userId, transNo: sourceTransNo, type: 'SUB_MONEY', remark: `TK-0251 ${tag}`, message: `TK-0251 ${tag}` },
  });
}

export async function ensureAtLeast(
  client: PaymentClient,
  userId: number,
  biz: string,
  runId: string,
  min: number,
  tag: string,
): Promise<void> {
  const current = await getAmount(client, userId, biz);
  if (!Number.isFinite(current)) throw new Error(`读取余额失败，无法造数: userId=${userId}`);
  if (current >= min) return;
  const need = Number((min - current).toFixed(2));
  const setup = await add(client, userId, biz, runId, `${tag}-SETUP`, need);
  if (!isOk(setup.response.body)) {
    throw new Error(`造数失败 userId=${userId} 需要 ${need}: ${JSON.stringify(setup.response.body)}`);
  }
}

export async function restoreToBaseline(
  client: PaymentClient,
  userId: number,
  biz: string,
  baseline: number,
  runId: string,
  tag: string,
): Promise<{ ok: boolean; before: number; after: number; action: string; response?: any }> {
  const before = await getAmount(client, userId, biz);
  if (!Number.isFinite(before) || !Number.isFinite(baseline)) {
    return { ok: false, before, after: before, action: 'skip-invalid-baseline' };
  }
  const diff = Number((before - baseline).toFixed(2));
  if (Math.abs(diff) < 0.005) return { ok: true, before, after: before, action: 'none' };
  const amount = Number(Math.abs(diff).toFixed(2));
  const no = transNo(runId, `CLEAN-${tag}`);
  const response = diff > 0
    ? await client.post(`${TRANS_PREFIX}/subAccountMoney`, {
        param: { biz, userId, transNo: no, amount, type: 'SUB_MONEY', remark: `TK-0251 cleanup ${tag}`, inDealType: 'coin' },
      })
    : await client.post(`${TRANS_PREFIX}/addAccountMoney`, {
        param: { biz, userId, transNo: no, amount, type: 'ADD_MONEY', remark: `TK-0251 cleanup ${tag}`, inDealType: 'coin' },
      });
  const after = await getAmount(client, userId, biz);
  return {
    ok: isOk(response.body) && after === baseline,
    before,
    after,
    action: diff > 0 ? 'sub' : 'add',
    response: response.body,
  };
}

export function formatAmount(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : String(value);
}
