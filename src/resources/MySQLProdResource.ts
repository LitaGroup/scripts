import type { Database } from './databases.ts';
import { APIProdResource, type QueryResult } from './APIProdResource.ts';

const READ_ONLY_KEYWORDS = new Set(['select', 'show', 'describe', 'desc', 'explain', 'with']);

interface SqlAnalysis {
  firstKeyword: string;
  multiStatement: boolean;
}

function analyzeSql(sql: string): SqlAnalysis {
  const n = sql.length;
  let i = 0;
  let firstKeyword = '';
  let keywordCaptured = false;
  let multiStatement = false;

  const skipLineComment = () => {
    while (i < n && sql[i] !== '\n') i++;
  };
  const skipBlockComment = () => {
    i += 2;
    while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
    i += 2;
  };
  const skipString = (quote: string) => {
    i++;
    while (i < n) {
      if (sql[i] === '\\') { i += 2; continue; }
      if (sql[i] === quote) {
        if (sql[i + 1] === quote) { i += 2; continue; }
        i++;
        return;
      }
      i++;
    }
  };
  const hasContentAfter = (start: number): boolean => {
    let j = start;
    while (j < n) {
      const cj = sql[j];
      if (/\s/.test(cj)) { j++; continue; }
      if (cj === '-' && sql[j + 1] === '-') { while (j < n && sql[j] !== '\n') j++; continue; }
      if (cj === '#') { while (j < n && sql[j] !== '\n') j++; continue; }
      if (cj === '/' && sql[j + 1] === '*') { j += 2; while (j < n && !(sql[j] === '*' && sql[j + 1] === '/')) j++; j += 2; continue; }
      return true;
    }
    return false;
  };

  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '-' && sql[i + 1] === '-') { skipLineComment(); continue; }
    if (c === '#') { skipLineComment(); continue; }
    if (c === '/' && sql[i + 1] === '*') { skipBlockComment(); continue; }
    if (c === "'" || c === '"') { skipString(c); continue; }
    if (c === '`') { i++; while (i < n && sql[i] !== '`') i++; i++; continue; }
    if (c === ';') {
      if (hasContentAfter(i + 1)) multiStatement = true;
      i++;
      continue;
    }
    if (!keywordCaptured && /[A-Za-z_]/.test(c)) {
      let end = i;
      while (end < n && /[A-Za-z0-9_]/.test(sql[end])) end++;
      firstKeyword = sql.slice(i, end).toLowerCase();
      keywordCaptured = true;
      i = end;
      continue;
    }
    i++;
  }
  return { firstKeyword, multiStatement };
}

function assertReadOnly(sql: string): void {
  const { firstKeyword, multiStatement } = analyzeSql(sql);
  if (multiStatement) {
    throw new Error('MySQLProdResource: multiple statements are not allowed (prod is read-only)');
  }
  if (!firstKeyword) {
    throw new Error('MySQLProdResource: empty or unparseable SQL');
  }
  if (!READ_ONLY_KEYWORDS.has(firstKeyword)) {
    throw new Error(`MySQLProdResource: rejected non-read-only statement (leading keyword "${firstKeyword}"). Prod is read-only; only SELECT/SHOW/DESCRIBE/EXPLAIN/WITH allowed.`);
  }
}

export class MySQLProdResource {
  private readonly database: Database;
  private readonly api: APIProdResource;

  constructor(database: Database, api?: APIProdResource) {
    this.database = database;
    this.api = api ?? new APIProdResource();
  }

  static async query(database: Database, sql: string): Promise<QueryResult> {
    return new MySQLProdResource(database).query(sql);
  }

  async query(sql: string): Promise<QueryResult> {
    assertReadOnly(sql);
    return this.api.query(this.database, sql);
  }
}
