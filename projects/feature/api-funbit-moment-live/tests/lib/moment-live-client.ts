import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 动态 live 类型接口测试客户端（测试环境）。
 *
 * 留痕要求（见 task/script 规范 §6.3）：每次请求记录
 *   - Method + 完整 URL（含 Query）
 *   - 脱敏后的关键 Header
 *   - Query / Body（登录凭证、Token、手机号、验证码一律脱敏）
 *   - HTTP 状态、完整响应体、耗时
 * 失败/限流响应保留原文。
 *
 * 安全：不打印、不落盘任何 Token / 手机号 / 验证码明文。
 */

export const DEFAULT_HOST = 'https://api.test.cinta.team';

/** funbit 客户端网关前缀（与既有脚本 projects/funbit/option 一致） */
const FUNBIT_PREFIX = '/funbit';
/** 直播服务内部接口前缀 */
const LITALIVE_PREFIX = '/litalive';

export interface HttpResponse {
  method: string;
  path: string;
  url: string;
  httpStatus: number;
  ms: number;
  raw: string;
  json: any;
  /** 是否被 IP 限流（框架统一返回 HTTP 304 + 空响应体） */
  rateLimited: boolean;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** 登录态 AccessToken；不传表示未登录 */
  token?: string;
  headers?: Record<string, string>;
  /** 用于日志的脱敏后 body（默认对敏感字段做掩码） */
  logBody?: unknown;
  /** 覆盖前缀，默认 /funbit；传 '' 表示网关根路径 */
  prefix?: string;
  timeoutMs?: number;
}

const SENSITIVE_KEY = /token|password|passwd|secret|cookie|authorization|verifycode|mobile|phone/i;

/** 文本级脱敏：用于响应原文日志（登录响应可能带回手机号/accessToken） */
export function redactText(text: string): string {
  return text
    .replace(/("(?:accessToken|imToken|token|userToken|password|verifyCode|mobile|phone|proxyHeader|shumeiDeviceId|drssid|drbddid|tis)"\s*:\s*")[^"]*(")/gi, '$1***$2')
    .replace(/(Set-Cookie:\s*)[^\r\n]*/gi, '$1***')
    .replace(/(AccessToken=)[^;,\s]+/gi, '$1***')
    .replace(/(L-USER-TOKEN=)[^;,\s]+/gi, '$1***');
}

export function maskValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(maskValue);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '***' : maskValue(val);
    }
    return out;
  }
  return v;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class MomentLiveClient {
  private readonly host: string;

  constructor(host = process.env.MOMENT_LIVE_HOST ?? DEFAULT_HOST) {
    this.host = host.replace(/\/+$/, '');
  }

  get apiHost(): string {
    return this.host;
  }

  async request(path: string, options: RequestOptions = {}): Promise<HttpResponse> {
    const prefix = options.prefix ?? FUNBIT_PREFIX;
    const method = options.method ?? 'GET';
    const url = `${this.host}${prefix}${path}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.token) headers.AccessToken = options.token;
    Object.assign(headers, options.headers ?? {});

    const logHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      logHeaders[k] = /token|cookie|authorization/i.test(k) ? '***' : v;
    }
    const logBody = options.logBody !== undefined ? options.logBody : maskValue(options.body);

    process.stdout.write(`[log] [http] → ${method} ${url}\n`);
    process.stdout.write(`[log] [http]   headers=${JSON.stringify(logHeaders)}\n`);
    if (options.body !== undefined) {
      process.stdout.write(`[log] [http]   body=${JSON.stringify(logBody)}\n`);
    }

    const started = Date.now();
    let httpStatus = 0;
    let raw = '';
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
      httpStatus = res.status;
      raw = await res.text();
    } catch (e) {
      const ms = Date.now() - started;
      process.stdout.write(`[log] [http] ← NETWORK ERROR ${(e as Error).message} (${ms}ms)\n`);
      throw new Error(`请求失败: ${method} ${url}: ${(e as Error).message}`);
    }
    const ms = Date.now() - started;
    const json = safeJson(raw);
    const rateLimited = httpStatus === 304;
    const logged = redactText(raw);
    process.stdout.write(`[log] [http] ← HTTP ${httpStatus} (${ms}ms) body=${logged.length > 8000 ? logged.slice(0, 8000) + `…(truncated, ${logged.length} bytes)` : logged}\n`);
    return { method, path, url, httpStatus, ms, raw, json, rateLimited };
  }

  /** 登录（测试环境短信验证码登录），返回登录态与用户信息 */
  async login(account: TestAccount): Promise<{ userId: string; locale: string; token: string; raw: any }> {
    const res = await this.request('/v2/user/login/smsCode', {
      method: 'POST',
      headers: { appPlat: 'LITA', appVersion: '9.9.9' },
      body: { countryCode: account.countryCode, mobile: account.mobile, verifyCode: account.verifyCode },
      // 登录凭证不落日志
      logBody: { countryCode: account.countryCode, mobile: '***', verifyCode: '***' },
    });
    if (res.httpStatus !== 200 || res.json?.status !== '0') {
      throw new Error(`登录失败: HTTP ${res.httpStatus} status=${res.json?.status} msg=${res.json?.msg ?? res.raw}`);
    }
    const data = res.json.data ?? {};
    const token = data.accessToken;
    if (!token) throw new Error('登录响应缺少 accessToken');
    return { userId: String(data.id), locale: String(data.locale ?? ''), token, raw: data };
  }

  /** 直播服务内部接口：某 locale 的在播 / 未开播房间 */
  async localeRooms(locale: string): Promise<{ list: any[]; noLiveList: any[]; raw: any }> {
    const res = await this.request(`/internalcall/localeRooms?locale=${encodeURIComponent(locale)}`, {
      prefix: LITALIVE_PREFIX,
    });
    if (res.httpStatus !== 200) throw new Error(`localeRooms HTTP ${res.httpStatus}: ${res.raw.slice(0, 300)}`);
    const data = res.json?.data ?? {};
    return { list: data.list ?? [], noLiveList: data.noLiveList ?? [], raw: data };
  }

  /**
   * 直播入口接口（litalive，@GetLocale 读取 locale / userLocale / Accept-Language 头，非 l-user-locale）
   */
  async doorOpen(locale: string): Promise<HttpResponse> {
    return this.request('/door/openDoor', { prefix: LITALIVE_PREFIX, headers: { locale } });
  }

  async doorplate(locale: string): Promise<HttpResponse> {
    return this.request('/door/doorplate', { prefix: LITALIVE_PREFIX, headers: { locale } });
  }

  /** 发布动态（v2 客户端接口） */
  async publish(body: unknown, token?: string): Promise<HttpResponse> {
    return this.request('/v2/api/moment/publish', { method: 'POST', body, token });
  }

  /** 发布动态（兼容旧路径） */
  async publishLegacy(body: unknown, token?: string): Promise<HttpResponse> {
    return this.request('/moment/publish', { method: 'POST', body, token });
  }

  async deleteMoment(momentId: string, token: string): Promise<HttpResponse> {
    return this.request(`/v2/api/moment/delete?momentId=${encodeURIComponent(momentId)}`, {
      method: 'POST',
      token,
    });
  }
}

export interface TestAccount {
  countryCode: string;
  mobile: string;
  verifyCode: string;
}

interface RawConfig {
  momentLive?: Partial<TestAccount>;
}

/**
 * 测试账号来源（凭证不进入仓库）：
 *   1) 环境变量 MOMENT_LIVE_COUNTRY_CODE / MOMENT_LIVE_MOBILE / MOMENT_LIVE_VERIFY_CODE
 *   2) 配置文件 momentLive 段（LITA_CONFIG_PATH，缺省为仓库根 config.json，已在 .gitignore 中）
 */
export function loadTestAccount(): TestAccount {
  const env = {
    countryCode: process.env.MOMENT_LIVE_COUNTRY_CODE,
    mobile: process.env.MOMENT_LIVE_MOBILE,
    verifyCode: process.env.MOMENT_LIVE_VERIFY_CODE,
  };
  if (env.countryCode && env.mobile && env.verifyCode) {
    return { countryCode: env.countryCode, mobile: env.mobile, verifyCode: env.verifyCode };
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.LITA_CONFIG_PATH,
    resolve(here, '../../../../../config.json'),
    resolve(process.cwd(), 'config.json'),
  ].filter((x): x is string => !!x);

  for (const path of candidates) {
    try {
      const cfg = JSON.parse(readFileSync(path, 'utf-8')) as RawConfig;
      const a = cfg.momentLive;
      if (a?.countryCode && a?.mobile && a?.verifyCode) {
        return { countryCode: a.countryCode, mobile: a.mobile, verifyCode: a.verifyCode };
      }
    } catch {
      // 继续尝试下一个路径
    }
  }
  throw new Error(
    '缺少测试账号配置：请设置环境变量 MOMENT_LIVE_COUNTRY_CODE / MOMENT_LIVE_MOBILE / MOMENT_LIVE_VERIFY_CODE，' +
      '或在 config.json 中配置 momentLive.countryCode / mobile / verifyCode（凭证不得提交到仓库）',
  );
}

/** 数字字段兼容：接口可能返回字符串或数字，统一转字符串比较 */
export function num(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

export function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

/** IP 限流窗口约束：发布接口 10 次 / 60s（@IpLimit(accessLimitSize=10, cycleLimitTime=60)） */
export class RateWindow {
  private readonly limit: number;
  private readonly windowMs: number;
  private stamps: number[] = [];

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** 发送前调用：窗口内名额不足时等待窗口释放（这是接口限流协议要求，不是盲目等待） */
  async acquire(log: (msg: string) => void): Promise<void> {
    const now = Date.now();
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
    if (this.stamps.length >= this.limit) {
      const waitMs = this.windowMs - (now - this.stamps[0]) + 1000;
      log(`[rate-window] 发布接口限流窗口已用 ${this.stamps.length}/${this.limit}，等待 ${Math.ceil(waitMs / 1000)}s 后继续`);
      await sleep(waitMs);
      this.stamps = [];
    }
    this.stamps.push(Date.now());
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
