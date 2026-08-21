import mysql from 'mysql2/promise';
import { loadConfig } from './config.ts';

export type MysqlRow = Record<string, unknown>;

/**
 * 测试环境 MySQL 资源：基于 host/账号/密码 直连，拥有读写权限。
 * - query()   返回 keyed rows（对齐测试断言习惯）
 * - execute() 返回受影响行数
 * 每次调用新建并关闭连接（与源端实现一致）。
 */
export class MySQLTestResource {
  private readonly cfg: NonNullable<ReturnType<typeof loadConfig>['mysql']>;
  private readonly defaultDatabase?: string;

  constructor(defaultDatabase?: string) {
    const cfg = loadConfig().mysql;
    if (!cfg?.host || !cfg?.user || cfg.password === undefined) {
      throw new Error('MySQLTestResource: config.json 缺少 mysql 配置（host/user/password）');
    }
    this.cfg = cfg;
    this.defaultDatabase = defaultDatabase;
  }

  private db(database?: string): string {
    return database ?? this.defaultDatabase ?? this.cfg.defaultDatabase ?? 'funbit';
  }

  private async connect(database: string): Promise<mysql.Connection> {
    return mysql.createConnection({
      host: this.cfg.host,
      port: this.cfg.port ?? 3306,
      user: this.cfg.user,
      password: this.cfg.password,
      database,
      charset: this.cfg.charset ?? 'utf8mb4',
    });
  }

  async query(sql: string, database?: string): Promise<MysqlRow[]> {
    const conn = await this.connect(this.db(database));
    try {
      const [rows] = await conn.query(sql);
      return (rows as MysqlRow[]) ?? [];
    } finally {
      await conn.end().catch(() => {});
    }
  }

  async execute(sql: string, database?: string): Promise<number> {
    const conn = await this.connect(this.db(database));
    try {
      const [result] = await conn.query(sql);
      const r = result as { affectedRows?: number };
      return Number(r.affectedRows ?? 0);
    } finally {
      await conn.end().catch(() => {});
    }
  }
}
