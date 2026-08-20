import { APIProdResource } from '../resources/APIProdResource.ts';
import { MySQLProdResource, type QueryResult } from '../resources/MySQLProdResource.ts';
import type { Database } from '../resources/databases.ts';

export type Env = 'prod' | 'test';

const API_HOSTS: Record<Env, string> = {
  prod: 'https://api.cinta.team/',
  test: 'https://api.test.cinta.team/',
};

export abstract class ServiceBase {
  protected readonly env: Env;
  protected readonly api: APIProdResource;

  constructor(env: Env) {
    this.env = env;
    this.api = new APIProdResource({ host: API_HOSTS[env] });
  }

  protected async sqlQuery(database: Database, sql: string): Promise<QueryResult> {
    return new MySQLProdResource(database, this.api).query(sql);
  }
}
