import { ServiceBase, type Env } from './ServiceBase.ts';

export interface CallOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export class ApiService extends ServiceBase {
  private userId?: string;
  private userLocale?: string;
  private traceId?: string;
  private debugTimestamp?: string;
  private extraHeaders: Record<string, string> = {};

  constructor(env: Env) {
    super(env);
  }

  setUserId(id: string | number): this {
    this.userId = String(id);
    return this;
  }

  setUserLocale(locale: string): this {
    this.userLocale = locale;
    return this;
  }

  setTraceId(id: string): this {
    this.traceId = id;
    return this;
  }

  setDebugTimestamp(ts: string | number): this {
    this.debugTimestamp = String(ts);
    return this;
  }

  setHeader(name: string, value: string): this {
    this.extraHeaders[name] = value;
    return this;
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { ...this.extraHeaders };
    if (this.userId !== undefined) h['l-user-id'] = this.userId;
    if (this.userLocale !== undefined) h['l-user-locale'] = this.userLocale;
    if (this.traceId !== undefined) h['l-trace-id'] = this.traceId;
    if (this.debugTimestamp !== undefined) h['l-debug-timestamp'] = this.debugTimestamp;
    return h;
  }

  async call(path: string, options: CallOptions = {}): Promise<unknown> {
    const method = options.method ?? 'POST';
    const res = await this.api.request(path, {
      method,
      body: options.body,
      headers: { ...this.buildHeaders(), ...(options.headers ?? {}) },
      timeoutMs: options.timeoutMs,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ApiService: ${method} ${path} HTTP ${res.status} ${res.statusText}. Response: ${text}`);
    }
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json')) return await res.json();
    return await res.text();
  }

  async runScheduledTask(debugTimestamp?: string): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (debugTimestamp !== undefined) headers['l-debug-timestamp'] = debugTimestamp;
    return this.call('active/v3/__cron', { method: 'POST', body: {}, headers });
  }

  async runConsumer(topic: string, items: unknown[]): Promise<unknown> {
    return this.call(`active/v3/__consumer/${topic}`, { method: 'POST', body: items });
  }
}
