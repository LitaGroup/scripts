/**
 * lita-payment 余额变更接口测试客户端（真实 HTTP，不做任何 mock）
 *
 * 任务：TK-0249 / 被测变更：TK-0247 lita-payment 回调锁 Redis 优化
 * 接口文档：/task/20261112/TK-0247/API
 *
 * 安全约定：
 * - password 从环境变量 LITA_PAYMENT_TRANS_PASSWORD 读取，不写入代码；
 * - 所有留痕中的 password 一律脱敏为 ***；
 * - 只操作测试环境与本次自建交易流水，测试结束按基线回补余额。
 */

export interface PaymentCallRecord {
  seq: number;
  at: string;
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  requestBody: unknown;
  httpStatus: number;
  durationMs: number;
  response: unknown;
}

export interface PaymentResponse {
  httpStatus: number;
  body: any;
  durationMs: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = k.toLowerCase() === 'password' ? '***' : v;
  }
  return out;
}

export class PaymentClient {
  readonly host: string;
  private readonly password: string;
  readonly calls: PaymentCallRecord[] = [];
  private seq = 0;

  constructor(options?: { host?: string; password?: string }) {
    this.host = (options?.host ?? process.env.LITA_PAYMENT_HOST ?? 'https://lita-payment.test.cinta.team').replace(/\/+$/, '');
    this.password = options?.password ?? process.env.LITA_PAYMENT_TRANS_PASSWORD ?? '';
    if (!this.password) {
      throw new Error('缺少环境变量 LITA_PAYMENT_TRANS_PASSWORD（取值见 TK-0247 API.md 鉴权章节，不写入仓库）');
    }
  }

  async post(path: string, body: unknown, options?: { password?: string | null; passwordVersion?: string }): Promise<PaymentResponse> {
    const url = `${this.host}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      passwordVersion: options?.passwordVersion ?? '1',
    };
    const pwd = options && 'password' in options ? options.password : this.password;
    if (pwd !== null && pwd !== undefined) {
      headers.password = pwd;
    }
    const started = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text === '' ? null : JSON.parse(text);
    } catch {
      // 保留原文，便于非 JSON 错误排查
      parsed = text;
    }
    const durationMs = Date.now() - started;
    this.seq++;
    const record: PaymentCallRecord = {
      seq: this.seq,
      at: nowIso(),
      method: 'POST',
      url,
      headers: maskHeaders(headers),
      requestBody: body,
      httpStatus: res.status,
      durationMs,
      response: parsed,
    };
    this.calls.push(record);
    process.stdout.write(
      `[log] 请求留痕 #${record.seq} ${record.at} | POST ${url} | headers=${JSON.stringify(record.headers)} | body=${JSON.stringify(body)} | HTTP ${res.status} | ${durationMs}ms | response=${JSON.stringify(parsed)}\n`,
    );
    return { httpStatus: res.status, body: parsed, durationMs };
  }
}

/** 支付成功路径（add/sub/refund）的实际响应没有 numeric status，只有 state + data.status。 */
export function isOk(body: any): boolean {
  return !!body && body.state === 'OK' && body?.data?.status === 'OK';
}

export function businessState(body: any): string {
  return String(body?.state ?? '');
}

export function businessStatus(body: any): string {
  return String(body?.status ?? '');
}

export function amountOf(body: any): number {
  const raw = body?.data?.amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}
