import type { QueryResult } from '../resources/MySQLProdResource.ts';
import { ServiceBase, type Env } from './ServiceBase.ts';

const AWARD_WINDOW_MS = 30_000;
const AWARD_DB = 'active' as const;

function quoteStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function quoteNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) {
    throw new Error(`AwardService: invalid numeric value: ${n}`);
  }
  return str;
}

function quoteVal(v: number | string): string {
  return typeof v === 'number' ? quoteNum(v) : quoteStr(v);
}

export class AwardService extends ServiceBase {
  constructor(env: Env) {
    super(env);
  }

  async queryAwardRecord(biz: string, topic: string, awardTime: number): Promise<QueryResult> {
    const conds = [
      `biz = ${quoteStr(biz)}`,
      `topic = ${quoteStr(topic)}`,
      `create_time BETWEEN ${quoteNum(awardTime)} AND ${quoteNum(awardTime + AWARD_WINDOW_MS)}`,
    ];
    const sql = `SELECT * FROM mod_common_award_record WHERE ${conds.join(' AND ')}`;
    return this.sqlQuery(AWARD_DB, sql);
  }

  async queryPlayerAwardRecord(
    biz: string,
    topic: string,
    players: (number | string)[],
    awardTime: number,
    playerType?: number | string,
  ): Promise<QueryResult> {
    if (players.length === 0) {
      throw new Error('AwardService: players must not be empty');
    }
    const conds = [
      `biz = ${quoteStr(biz)}`,
      `topic = ${quoteStr(topic)}`,
      `player IN (${players.map(quoteVal).join(', ')})`,
    ];
    if (playerType !== undefined) {
      conds.push(`player_type = ${quoteVal(playerType)}`);
    }
    conds.push(`create_time BETWEEN ${quoteNum(awardTime)} AND ${quoteNum(awardTime + AWARD_WINDOW_MS)}`);
    const sql = `SELECT * FROM mod_common_award_record WHERE ${conds.join(' AND ')}`;
    return this.sqlQuery(AWARD_DB, sql);
  }

  async queryAwardConfig(biz: string, name: string): Promise<QueryResult> {
    const sql = `SELECT * FROM mod_common_award WHERE biz = ${quoteStr(biz)} AND name = ${quoteStr(name)} ORDER BY stage, sequence`;
    return this.sqlQuery(AWARD_DB, sql);
  }
}
