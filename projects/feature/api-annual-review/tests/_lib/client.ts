import type { APITestOptions, APITestRawResponse } from '../../../../src/resources/APITestResource.ts';

/** 日志敏感字段：不在执行输出中展示昵称/头像（个人敏感信息） */
const MASKED_FIELDS = new Set(['nick', 'avatar', 'name']);

function maskValue(key: string, value: unknown): unknown {
  if (MASKED_FIELDS.has(key) && value !== null && value !== undefined) return '***';
  if (Array.isArray(value)) return value.map((item) => maskDeep(item));
  if (value && typeof value === 'object') return maskDeep(value as Record<string, unknown>);
  return value;
}

/** 深拷贝并脱敏昵称/头像（保留结构，便于核对字段契约） */
export function maskDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => maskDeep(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = maskValue(k, v);
    return out;
  }
  return value;
}

/** 稳定序列化（键排序），用于响应深度比较与日志 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export interface ApiCall {
  url: string;
  path: string;
  httpStatus: number;
  body: Record<string, unknown>;
  costMs: number;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/**
 * 年度回忆接口客户端：真实 HTTP 调用 api.test.cinta.team，逐次打印留痕
 * （Method、完整 URL、脱敏 Header、Body、HTTP 状态、脱敏完整响应体、耗时）。
 */
export class AnnualReviewClient {
  private readonly api: { requestRaw: (path: string, options?: APITestOptions) => Promise<APITestRawResponse> };
  private readonly log: (message: string) => void;

  constructor(
    api: { requestRaw: (path: string, options?: APITestOptions) => Promise<APITestRawResponse> },
    log: (message: string) => void,
  ) {
    this.api = api;
    this.log = log;
  }

  async call(path: string, options: APITestOptions = {}): Promise<ApiCall> {
    const raw = await this.api.requestRaw(path, options);
    const method = (options.method ?? 'POST').toUpperCase();
    const headerParts = ['Content-Type=application/json'];
    if (options.userId !== undefined) headerParts.push(`l-user-id=${options.userId}`);
    if (options.locale !== undefined) headerParts.push(`l-user-locale=${options.locale}`);
    if (options.debugTimestamp !== undefined) headerParts.push(`l-debug-timestamp=${options.debugTimestamp}`);
    const bodyText = options.body === undefined ? '(none)' : JSON.stringify(options.body);
    this.log(
      `请求 ${method} ${raw.url} | Header: ${headerParts.join(', ')} | Body: ${bodyText} | ` +
        `HTTP ${raw.httpStatus} | 耗时 ${raw.costMs}ms | 响应: ${stableStringify(maskDeep(raw.body))}`,
    );
    return {
      url: raw.url,
      path,
      httpStatus: raw.httpStatus,
      body: raw.body,
      costMs: raw.costMs,
    };
  }

  /** 调用 /get 并返回完整响应体（含非 0 业务码，供负例断言） */
  async get(path: string, options: APITestOptions = {}): Promise<ApiCall> {
    return this.call(path, { ...options, method: 'POST', body: options.body ?? {} });
  }

  /** 调用 /config */
  async config(path: string, options: APITestOptions = {}): Promise<ApiCall> {
    return this.call(path, { ...options, method: 'POST', body: options.body ?? {} });
  }
}

export function dataOf(call: ApiCall): Record<string, unknown> {
  return asRecord(call.body.data);
}

export function reportOf(call: ApiCall): Record<string, unknown> {
  return asRecord(dataOf(call).report);
}

export function reportUserOf(call: ApiCall): Record<string, unknown> | null {
  const user = reportOf(call).user;
  return user && typeof user === 'object' ? (user as Record<string, unknown>) : null;
}

export function playerOf(call: ApiCall): Record<string, unknown> | null {
  const player = dataOf(call).player;
  return player && typeof player === 'object' ? (player as Record<string, unknown>) : null;
}

export function statusOf(call: ApiCall): number | undefined {
  const status = call.body.status;
  return typeof status === 'number' ? status : undefined;
}

export function msgOf(call: ApiCall): string {
  const msg = call.body.msg;
  return typeof msg === 'string' ? msg : '';
}

/** 响应签名：只取 status/msg/data，用于双路径一致与幂等断言 */
export function responseSignature(call: ApiCall): string {
  return stableStringify({ status: call.body.status, msg: call.body.msg, data: call.body.data });
}
