export interface APITestOptions {
  method?: string;
  body?: unknown;
  userId?: string | number;
  locale?: string;
  debugTimestamp?: string;
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_HOST = 'https://api.test.cinta.team/';
const DEFAULT_TIMEOUT_MS = 30_000;

function formatDebugTimestamp(ts?: string): string {
  return ts ?? new Date().toISOString();
}

function joinUrl(host: string, path: string): string {
  return host.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/**
 * 测试环境 API 资源：固定 host api.test.cinta.team。
 * - 不带 l-user-token（与测试环境接入方式一致）
 * - 总是带 l-debug-timestamp（未指定则取当前时间）
 * - 返回响应体 data.data；HTTP>=400 或 status!=0 时抛错
 */
export class APITestResource {
  private readonly host: string;
  private readonly defaultTimeoutMs: number;

  constructor(options?: { host?: string; timeoutMs?: number }) {
    this.host = options?.host ?? DEFAULT_HOST;
    this.defaultTimeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async request(path: string, options: APITestOptions = {}): Promise<unknown> {
    const url = joinUrl(this.host, path);
    const method = options.method ?? 'POST';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.userId !== undefined) headers['l-user-id'] = String(options.userId);
    if (options.locale !== undefined) headers['l-user-locale'] = options.locale;
    headers['l-debug-timestamp'] = formatDebugTimestamp(options.debugTimestamp);
    if (options.extraHeaders) Object.assign(headers, options.extraHeaders);

    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? this.defaultTimeoutMs),
    };
    if (options.body !== undefined) {
      init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e) {
      const err = e as Error;
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error(`APITestResource: request to ${url} timed out after ${options.timeoutMs ?? this.defaultTimeoutMs}ms`);
      }
      throw new Error(`APITestResource: network error calling ${url}: ${err.message}`);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      const text = await res.text().catch(() => '');
      throw new Error(`APITestResource: 非 JSON 响应: ${res.status} ${text.slice(0, 500)}`);
    }

    const body = asRecord(data);
    if (res.status >= 400) {
      const msg = body.msg ?? body.message ?? res.statusText;
      throw new Error(`APITestResource: HTTP ${res.status}: ${msg}`);
    }
    const status = body.status;
    if (status !== undefined && status !== 0) {
      throw new Error(`APITestResource: 业务错误 status=${status}: ${body.msg ?? ''}`);
    }
    return body.data;
  }
}
