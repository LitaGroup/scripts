import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Database } from './databases.ts';

export interface APIProdConfig {
  userToken: string;
  host?: string;
}

export interface QueryResult {
  header: string[];
  data: unknown[][];
}

export interface QueryResponse {
  status: number;
  msg: string;
  data: QueryResult;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_HOST = 'https://api.cinta.team/';
const QUERY_PATH = 'admin-ai/v1/query/execute';
const DEFAULT_TIMEOUT_MS = 30_000;

let cachedConfig: APIProdConfig | null = null;

function loadConfig(): APIProdConfig {
  if (cachedConfig) return cachedConfig;
  const path = process.env.LITA_CONFIG_PATH ?? resolve(process.cwd(), 'config.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (e) {
    throw new Error(`APIProdResource: cannot read config file at ${path}. Create config.json (see config.example.json) or set LITA_CONFIG_PATH. Cause: ${(e as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`APIProdResource: invalid JSON in config file ${path}: ${(e as Error).message}`);
  }
  const cfg = parsed as APIProdConfig;
  if (!cfg.userToken || typeof cfg.userToken !== 'string') {
    throw new Error(`APIProdResource: config file ${path} is missing string field "userToken".`);
  }
  cachedConfig = cfg;
  return cfg;
}

function generateTraceId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `trace-${ts}-${rand}`;
}

function joinUrl(host: string, path: string): string {
  return host.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

export class APIProdResource {
  private readonly host: string;
  private readonly defaultTimeoutMs: number;

  constructor(options?: { host?: string; timeoutMs?: number }) {
    this.host = options?.host ?? DEFAULT_HOST;
    this.defaultTimeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  static async request(path: string, options?: RequestOptions): Promise<Response> {
    return new APIProdResource().request(path, options);
  }

  static async query(database: Database, sql: string): Promise<QueryResult> {
    return new APIProdResource().query(database, sql);
  }

  async request(path: string, options: RequestOptions = {}): Promise<Response> {
    const cfg = loadConfig();
    const trace = generateTraceId();
    const url = joinUrl(this.host, path);
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = {
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Content-Type': 'application/json',
      'l-trace-id': trace,
      'l-user-token': cfg.userToken,
      ...(options.headers ?? {}),
    };
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? this.defaultTimeoutMs),
    };
    if (options.body !== undefined) {
      init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }
    try {
      return await fetch(url, init);
    } catch (e) {
      const err = e as Error;
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error(`APIProdResource: request to ${url} timed out after ${options.timeoutMs ?? this.defaultTimeoutMs}ms`);
      }
      throw new Error(`APIProdResource: network error calling ${url}: ${err.message}`);
    }
  }

  async query(database: Database, sql: string): Promise<QueryResult> {
    const res = await this.request(QUERY_PATH, {
      method: 'POST',
      body: { database, sql },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`APIProdResource: query HTTP ${res.status} ${res.statusText}. Response: ${text}`);
    }
    const result = await res.json() as QueryResponse;
    if (result.status !== 0) {
      throw new Error(`APIProdResource: query failed (status=${result.status}): ${result.msg}`);
    }
    return result.data;
  }
}
