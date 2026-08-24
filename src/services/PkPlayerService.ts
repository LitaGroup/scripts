import type { APITestResource } from '../resources/APITestResource.ts';
import type { MySQLTestResource, MysqlRow } from '../resources/MySQLTestResource.ts';
import type { RedisTestResource } from '../resources/RedisTestResource.ts';

const BIZ = 'pk-ai-test';

const DB_ACTIVE = 'lita_active';

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

export interface PkPlayerServiceDeps {
  api: APITestResource;
  mysql: MySQLTestResource;
  redis: RedisTestResource;
}

/**
 * 陪玩榜（player_* / player_in_*）业务服务，绑定测试环境资源。
 */
export class PkPlayerService {
  readonly api: APITestResource;
  readonly mysql: MySQLTestResource;
  readonly redis: RedisTestResource;

  constructor(deps: PkPlayerServiceDeps) {
    this.api = deps.api;
    this.mysql = deps.mysql;
    this.redis = deps.redis;
  }

  async runInitCron(debugTs: string): Promise<unknown> {
    return this.api.request('active/v3/__cron', {
      body: {},
      debugTimestamp: debugTs,
    });
  }

  async cleanPlayerRounds(): Promise<number> {
    return this.mysql.execute(
      `DELETE FROM mod_common_round WHERE biz=${quoteStr(BIZ)} AND topic LIKE 'player_%'`,
      DB_ACTIVE,
    );
  }

  async countPlayerRounds(): Promise<number> {
    const rows = await this.mysql.query(
      `SELECT COUNT(*) AS c FROM mod_common_round WHERE biz=${quoteStr(BIZ)} AND topic LIKE 'player%'`,
      DB_ACTIVE,
    );
    return Number(rows[0]?.c ?? 0);
  }

  async queryRounds(topic?: string, locale?: string): Promise<MysqlRow[]> {
    let sql = `SELECT locale, topic, \`key\`, start_time, finish_time, status FROM mod_common_round WHERE biz=${quoteStr(BIZ)}`;
    if (topic !== undefined) {
      if (topic.includes('%')) sql += ` AND topic LIKE ${quoteStr(topic)}`;
      else sql += ` AND topic=${quoteStr(topic)}`;
    }
    if (locale !== undefined) sql += ` AND locale=${quoteStr(locale)}`;
    sql += ' ORDER BY locale, topic, `key`';
    return this.mysql.query(sql, DB_ACTIVE);
  }
}
