import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface MySQLConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  charset?: string;
  defaultDatabase?: string;
}

export interface RedisConfig {
  host?: string;
  port?: number;
  db?: number;
  password?: string;
}

export interface AppConfig {
  userToken?: string;
  mysql?: MySQLConfig;
  redis?: RedisConfig;
}

let cachedConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;
  const path = process.env.LITA_CONFIG_PATH ?? resolve(process.cwd(), 'config.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (e) {
    throw new Error(`config: cannot read config file at ${path}. Create config.json (see config.example.json) or set LITA_CONFIG_PATH. Cause: ${(e as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`config: invalid JSON in config file ${path}: ${(e as Error).message}`);
  }
  const cfg = parsed as AppConfig;
  if (!cfg || typeof cfg !== 'object') {
    throw new Error(`config: config file ${path} must contain a JSON object.`);
  }
  cachedConfig = cfg;
  return cfg;
}
