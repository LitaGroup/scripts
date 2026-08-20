import { ServiceBase, type Env } from './ServiceBase.ts';
import type { QueryResult } from '../resources/MySQLProdResource.ts';

const FAMILY_DB = 'family' as const;

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`PlayerService: invalid numeric value: ${n}`);
  }
  return str;
}

export class PlayerService extends ServiceBase {
  constructor(env: Env) {
    super(env);
  }

  async getMembersOfFamily(familyId: number | string, role?: string): Promise<string[]> {
    const conds = [`family_id = ${quoteNum(familyId)}`];
    if (role !== undefined) {
      conds.push(`role = ${quoteStr(role)}`);
    }
    const sql = `SELECT user_id FROM family_user WHERE ${conds.join(' AND ')}`;
    const r: QueryResult = await this.sqlQuery(FAMILY_DB, sql);
    return r.data.map((row) => String(row[0]));
  }
}
