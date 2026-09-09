import Redis from 'ioredis';
import { loadConfig } from './config.ts';

/**
 * 测试环境 Redis 资源：直连 redis-server.test.cinta.team。
 * 家族榜用例主要用于按前缀清理排行榜 key。
 */
export class RedisTestResource {
  private client: Redis | null = null;
  private readonly dbIndex?: number;

  constructor(dbIndex?: number) {
    this.dbIndex = dbIndex;
  }

  private getClient(): Redis {
    if (this.client) return this.client;
    const cfg = loadConfig().redis ?? {};
    this.client = new Redis({
      host: cfg.host ?? 'redis-server.test.cinta.team',
      port: cfg.port ?? 6379,
      db: this.dbIndex ?? cfg.db ?? 0,
      password: cfg.password,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    return this.client;
  }

  async scan(pattern = '*', count = 100): Promise<string[]> {
    const client = this.getClient();
    const keys: string[] = [];
    const stream = client.scanStream({ match: pattern, count });
    for await (const chunk of stream) {
      keys.push(...chunk);
    }
    return keys;
  }

  async clearByPrefix(prefix: string, count = 1000): Promise<number> {
    return this.clearByPattern(`${prefix}*`, count);
  }

  async clearByPattern(pattern: string, count = 10000): Promise<number> {
    const keys = await this.scan(pattern, count);
    if (keys.length === 0) return 0;
    return await this.getClient().del(...keys);
  }

  async get(key: string): Promise<string | null> {
    return this.getClient().get(key);
  }

  async zscore(key: string, member: string): Promise<number | null> {
    const v = await this.getClient().zscore(key, member);
    return v === null ? null : Number(v);
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.getClient().zadd(key, score, member);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.getClient().zrevrange(key, start, stop);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.getClient().lrange(key, start, stop);
  }

  async set(key: string, value: string, exSeconds?: number): Promise<boolean> {
    const client = this.getClient();
    if (exSeconds !== undefined) {
      return (await client.set(key, value, 'EX', exSeconds)) === 'OK';
    }
    return (await client.set(key, value)) === 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.getClient().del(...keys);
  }

  async quit(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => {});
      this.client = null;
    }
  }
}
