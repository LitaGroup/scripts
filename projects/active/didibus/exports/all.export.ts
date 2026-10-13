import { ExportBaseClass, type ExportColumn } from '../../../../src/base/ExportBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';
import type { Database } from '../../../../src/resources/databases.ts';
import { DIDIBUS_BIZ } from '../../../../src/services/DidibusService.ts';

/**
 * didibus 排行榜导出：送礼总榜 / 收礼总榜（生产环境，只读查询，key='-' 总榜）。
 * 运行：node projects/active/didibus/exports/all.export.ts --output-dir=xxxxx [--format=csv]
 *      [--biz=didibus-v202609] [--top=10]
 */
type Row = Record<string, unknown>;

const BOARD_NAMES = {
  send: '送礼总榜',
  recv: '收礼总榜',
} as const;

type BoardKey = keyof typeof BOARD_NAMES;

const BOARD_TOPICS: Record<BoardKey, string> = {
  send: 'gift-send',
  recv: 'gift-recv',
};

const HEAD: ExportColumn[] = [
  { key: 'locale', header: '大区' },
  { key: 'rank', header: '排名' },
];
const CONTRIB3: ExportColumn[] = [
  { key: 'cUid', header: '贡献者Top1_uid' },
  { key: 'cNo', header: '贡献者Top1_no' },
  { key: 'cNick', header: '贡献者Top1_昵称' },
];

const COLUMNS: Record<BoardKey, ExportColumn[]> = {
  send: [
    ...HEAD,
    { key: 'country', header: 'country' },
    { key: 'uid', header: 'UID' },
    { key: 'userNo', header: '用户NO' },
    { key: 'nick', header: '昵称' },
    { key: 'vipLevel', header: 'VIP等级' },
    { key: 'score', header: '榜单积分' },
  ],
  recv: [
    ...HEAD,
    { key: 'country', header: 'country' },
    { key: 'uid', header: 'UID' },
    { key: 'userNo', header: '用户NO' },
    { key: 'nick', header: '昵称' },
    { key: 'vipLevel', header: 'VIP等级' },
    { key: 'score', header: '榜单积分' },
    ...CONTRIB3,
  ],
};

const IN_CHUNK_SIZE = 1000;

function q(v: unknown): string {
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function rowsOf(database: Database, sql: string): Promise<Row[]> {
  const r = await MySQLProdResource.query(database, sql);
  return r.data.map((row) => Object.fromEntries(r.header.map((h, i) => [h, row[i]])));
}

/** 大 IN 列表分批查询后合并 */
async function queryInChunks(
  database: Database,
  ids: Array<string | number>,
  buildSql: (inClause: string) => string,
): Promise<Row[]> {
  const unique = [...new Set(ids.map(String).filter((v) => v !== '' && v !== 'null'))];
  const out: Row[] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK_SIZE) {
    const inSql = unique.slice(i, i + IN_CHUNK_SIZE).map(q).join(',');
    out.push(...(await rowsOf(database, buildSql(inSql))));
  }
  return out;
}

function num(v: unknown): number | '' {
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function parseScriptArgs(): { biz: string; top: number; error: string | null } {
  let biz = DIDIBUS_BIZ;
  let top = 10;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--biz=')) biz = a.slice('--biz='.length).trim();
    else if (a.startsWith('--top=')) top = Number(a.slice('--top='.length).trim());
  }
  if (!biz) return { biz, top, error: '缺少 --biz 值' };
  if (!Number.isFinite(top) || top <= 0) return { biz, top, error: `非法 --top=${top}` };
  return { biz, top, error: null };
}

class DidibusRankExport extends ExportBaseClass {
  private readonly biz: string;
  private readonly topN: number;
  private readonly argError: string | null;

  constructor() {
    super();
    const p = parseScriptArgs();
    this.biz = p.biz;
    this.topN = p.top;
    this.argError = p.error;
    this.total = 2;
  }

  protected async run(): Promise<void> {
    if (this.argError) throw new Error(this.argError);
    this.log(`didibus 排行榜导出 — biz=${this.biz}, top=${this.topN}, boards=send,recv, format=${this.format}`);
    const builders: Record<BoardKey, () => Promise<Row[]>> = {
      send: () => this.buildSendBoard(),
      recv: () => this.buildRecvBoard(),
    };
    for (const board of Object.keys(BOARD_NAMES) as BoardKey[]) {
      const title = BOARD_NAMES[board];
      const data = await builders[board]();
      if (data.length === 0) {
        this.log(`${title}: 无数据，跳过`);
        continue;
      }
      await this.export(title, data, { columns: COLUMNS[board], filename: `${this.biz}-${board}-total` });
    }
  }

  // ============ 查询 ============

  /** 总榜（key='-'）：每个大区按累计积分降序取前 N */
  private async queryRank(topic: string): Promise<Row[]> {
    const sql =
      'SELECT player, score, locale, rn FROM (' +
      'SELECT player, MAX(total_amount) AS score, locale, ' +
      'ROW_NUMBER() OVER (PARTITION BY locale ORDER BY MAX(total_amount) DESC) AS rn ' +
      'FROM mod_common_rank_record ' +
      `WHERE biz=${q(this.biz)} AND topic=${q(topic)} AND \`key\`='-' ` +
      'GROUP BY player, locale' +
      `) t WHERE rn <= ${this.topN} ` +
      'ORDER BY locale, rn';
    return rowsOf('active', sql);
  }

  /** 每个 player 取贡献最多的贡献者（SQL 按贡献降序，取首个） */
  private async queryTopContributors(topic: string, players: string[]): Promise<Map<string, { uid: string; total: number }>> {
    const rows = await queryInChunks('active', players, (inSql) =>
      'SELECT player, contributor, SUM(amount) AS total_contrib ' +
      'FROM mod_common_rank_record ' +
      `WHERE biz=${q(this.biz)} AND topic=${q(topic)} AND \`key\`='-' AND player IN (${inSql}) ` +
      'GROUP BY player, contributor ' +
      'ORDER BY player, total_contrib DESC');
    const map = new Map<string, { uid: string; total: number }>();
    for (const r of rows) {
      const key = String(r.player);
      if (!map.has(key)) map.set(key, { uid: String(r.contributor ?? ''), total: Number(r.total_contrib ?? 0) });
    }
    return map;
  }

  private async enrichUsers(uids: Array<string | number>): Promise<Map<string, Row>> {
    const rows = await queryInChunks('odps', uids, (inSql) =>
      `SELECT id, \`no\`, nick, vip_level, country_name FROM user_info WHERE id IN (${inSql})`);
    return new Map(rows.map((r) => [String(r.id), r]));
  }

  // ============ 各榜单 ============

  private async buildSendBoard(): Promise<Row[]> {
    const rankRows = await this.queryRank(BOARD_TOPICS.send);
    if (rankRows.length === 0) return [];
    const users = await this.enrichUsers(rankRows.map((r) => String(r.player)));
    return rankRows.map((r) => {
      const u = users.get(String(r.player)) ?? {};
      return {
        locale: r.locale,
        rank: num(r.rn),
        country: u.country_name ?? '',
        uid: num(r.player),
        userNo: u.no ?? '',
        nick: u.nick ?? '',
        vipLevel: u.vip_level ?? '',
        score: num(r.score),
      };
    });
  }

  private async buildRecvBoard(): Promise<Row[]> {
    const rankRows = await this.queryRank(BOARD_TOPICS.recv);
    if (rankRows.length === 0) return [];
    const players = rankRows.map((r) => String(r.player));
    const [users, contribs] = await Promise.all([
      this.enrichUsers(players),
      this.queryTopContributors(BOARD_TOPICS.recv, players),
    ]);
    const contribUsers = await this.enrichUsers([...contribs.values()].map((c) => c.uid).filter((v) => v !== ''));
    return rankRows.map((r) => {
      const u = users.get(String(r.player)) ?? {};
      const c = contribs.get(String(r.player));
      const cu = c ? contribUsers.get(c.uid) ?? {} : {};
      return {
        locale: r.locale,
        rank: num(r.rn),
        country: u.country_name ?? '',
        uid: num(r.player),
        userNo: u.no ?? '',
        nick: u.nick ?? '',
        vipLevel: u.vip_level ?? '',
        score: num(r.score),
        cUid: c ? num(c.uid) : '',
        cNo: cu.no ?? '',
        cNick: cu.nick ?? '',
      };
    });
  }
}

await new DidibusRankExport().execute();
