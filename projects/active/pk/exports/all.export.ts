import { ExportBaseClass, type ExportColumn } from '../../../../src/base/ExportBaseClass.ts';
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';
import type { Database } from '../../../../src/resources/databases.ts';

/**
 * PK 活动排行榜导出：用户榜 / 陪玩榜 / 房间榜 / 家族榜 / CP榜（生产环境，只读查询）。
 * 运行：node projects/active/pk/exports/all.export.ts --output-dir=xxxxx [--format=csv]
 *      [--biz=pk-v202608] [--top=10000] [--boards=user,player,room,family,couple|all]
 */
type Row = Record<string, unknown>;

const BOARD_NAMES = {
  user: '用户榜',
  player: '陪玩榜',
  room: '房间榜',
  family: '家族榜',
  couple: 'CP榜',
} as const;

type BoardKey = keyof typeof BOARD_NAMES;

const BOARD_TOPIC_PATTERNS: Record<BoardKey, string> = {
  user: "topic IN ('user')",
  player: "topic LIKE 'player%'",
  room: "topic LIKE 'room%'",
  family: "topic LIKE 'family%'",
  couple: "topic IN ('couple')",
};

const HEAD3: ExportColumn[] = [
  { key: 'stage', header: '阶段' },
  { key: 'locale', header: 'locale' },
  { key: 'rank', header: '排名' },
];
const CONTRIB3: ExportColumn[] = [
  { key: 'cUid', header: '贡献者Top1_uid' },
  { key: 'cNo', header: '贡献者Top1_no' },
  { key: 'cNick', header: '贡献者Top1_昵称' },
];

const COLUMNS: Record<BoardKey, ExportColumn[]> = {
  user: [
    ...HEAD3,
    { key: 'country', header: 'country' },
    { key: 'uid', header: 'UID' },
    { key: 'userNo', header: '用户NO' },
    { key: 'nick', header: '昵称' },
    { key: 'vipLevel', header: 'VIP等级' },
    { key: 'score', header: '榜单积分' },
  ],
  player: [
    ...HEAD3,
    { key: 'country', header: 'country' },
    { key: 'uid', header: 'UID' },
    { key: 'userNo', header: '用户NO' },
    { key: 'nick', header: '昵称' },
    { key: 'vipLevel', header: 'VIP等级' },
    { key: 'score', header: '榜单积分' },
    ...CONTRIB3,
  ],
  room: [
    ...HEAD3,
    { key: 'country', header: 'country' },
    { key: 'roomId', header: '房间ID' },
    { key: 'roomName', header: '房间名' },
    { key: 'roomType', header: '房间类型' },
    { key: 'ownerUid', header: '房主uid' },
    { key: 'ownerNo', header: '房主no' },
    { key: 'ownerNick', header: '房主昵称' },
    { key: 'createTime', header: '创建时间' },
    { key: 'score', header: '榜单积分' },
    ...CONTRIB3,
  ],
  family: [
    ...HEAD3,
    { key: 'country', header: 'country' },
    { key: 'familyId', header: '家族ID' },
    { key: 'familyNo', header: '家族no' },
    { key: 'ownerUid', header: '家族长uid' },
    { key: 'ownerNo', header: '家族长no' },
    { key: 'ownerNick', header: '家族长昵称' },
    { key: 'score', header: '榜单积分' },
    { key: 'familyCreateTime', header: '家族创建时间' },
    { key: 'familyLevel', header: '家族等级' },
    { key: 'memberCount', header: '家族成员人数' },
    { key: 'contribCount', header: '贡献积分的家族成员人数' },
  ],
  couple: [
    ...HEAD3,
    { key: 'c1Country', header: 'c1_country' },
    { key: 'c1Uid', header: 'c1_UID' },
    { key: 'c1No', header: 'c1_NO' },
    { key: 'c1Nick', header: 'c1_昵称' },
    { key: 'c1Gender', header: 'c1_性别' },
    { key: 'c1VipLevel', header: 'c1_VIP等级' },
    { key: 'c2Country', header: 'c2_country' },
    { key: 'c2Uid', header: 'c2_UID' },
    { key: 'c2No', header: 'c2_NO' },
    { key: 'c2Nick', header: 'c2_昵称' },
    { key: 'c2Gender', header: 'c2_性别' },
    { key: 'c2VipLevel', header: 'c2_VIP等级' },
    { key: 'score', header: '榜单积分' },
  ],
};

const GENDER_MAP: Record<number, string> = { 0: '未知', 1: '男', 2: '女' };
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

/** CP ID 解码：高 10 位以上 = userA，低位 = userB；非法返回 null */
function decodeCouple(coupleId: string): [string, string] | null {
  try {
    const v = BigInt(coupleId);
    return [(v / 10_000_000_000n).toString(), (v % 10_000_000_000n).toString()];
  } catch {
    return null;
  }
}

function num(v: unknown): number | '' {
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function fmtTime(ts: unknown): string {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function genderOf(v: unknown): string {
  return GENDER_MAP[Number(v) || 0] ?? '未知';
}

function parseScriptArgs(): { biz: string; top: number; boards: BoardKey[]; error: string | null } {
  let biz = 'pk-v202608';
  let top = 10000;
  const tokens: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--biz=')) biz = a.slice('--biz='.length).trim();
    else if (a.startsWith('--top=')) top = Number(a.slice('--top='.length).trim());
    else if (a.startsWith('--boards=')) tokens.push(...a.slice('--boards='.length).split(','));
    else if (a === '--boards') {
      let j = i + 1;
      while (j < argv.length && !argv[j].startsWith('--')) tokens.push(argv[j++]);
      i = j - 1;
    }
  }
  if (!biz) return { biz, top, boards: [], error: '缺少 --biz 值' };
  if (!Number.isFinite(top) || top <= 0) return { biz, top, boards: [], error: `非法 --top=${top}` };
  let keys = tokens.length > 0 ? tokens : ['all'];
  if (keys.includes('all')) keys = Object.keys(BOARD_NAMES);
  for (const k of keys) {
    if (!(k in BOARD_NAMES)) return { biz, top, boards: [], error: `未知榜单 ${k}（可选 user/player/room/family/couple/all）` };
  }
  return { biz, top, boards: keys as BoardKey[], error: null };
}

class PkAllExport extends ExportBaseClass {
  private readonly biz: string;
  private readonly topN: number;
  private readonly boards: BoardKey[];
  private readonly argError: string | null;

  constructor() {
    super();
    const p = parseScriptArgs();
    this.biz = p.biz;
    this.topN = p.top;
    this.boards = p.boards;
    this.argError = p.error;
    this.total = p.boards.length;
  }

  protected async run(): Promise<void> {
    if (this.argError) throw new Error(this.argError);
    this.log(`PK 排行榜导出 — biz=${this.biz}, top=${this.topN}, boards=${this.boards.join(',')}, format=${this.format}`);
    const builders: Record<BoardKey, (pattern: string) => Promise<Row[]>> = {
      user: (p) => this.buildUserBoard(p),
      player: (p) => this.buildPlayerBoard(p),
      room: (p) => this.buildRoomBoard(p),
      family: (p) => this.buildFamilyBoard(p),
      couple: (p) => this.buildCoupleBoard(p),
    };
    for (const board of this.boards) {
      const title = BOARD_NAMES[board];
      const data = await builders[board](BOARD_TOPIC_PATTERNS[board]);
      if (data.length === 0) {
        this.log(`${title}: 无数据，跳过`);
        continue;
      }
      await this.export(title, data, { columns: COLUMNS[board], filename: `${this.biz}-${board}` });
    }
  }

  // ============ 查询 ============

  private async queryRank(pattern: string): Promise<Row[]> {
    const sql =
      'SELECT player, score, locale, topic, rn FROM (' +
      'SELECT player, MAX(total_amount) AS score, locale, topic, ' +
      'ROW_NUMBER() OVER (PARTITION BY locale, topic ORDER BY MAX(total_amount) DESC) AS rn ' +
      'FROM mod_common_rank_record ' +
      `WHERE biz=${q(this.biz)} AND ${pattern} AND \`key\`='-' ` +
      'GROUP BY player, locale, topic' +
      `) t WHERE rn <= ${this.topN} ` +
      'ORDER BY topic, locale, rn';
    return rowsOf('active', sql);
  }

  /** 每个 (player, topic) 取贡献最多的贡献者（SQL 按贡献降序，取首个） */
  private async queryTopContributors(pattern: string, players: string[]): Promise<Map<string, { uid: string; total: number }>> {
    const rows = await queryInChunks('active', players, (inSql) =>
      'SELECT player, contributor, topic, SUM(amount) AS total_contrib ' +
      'FROM mod_common_rank_record ' +
      `WHERE biz=${q(this.biz)} AND ${pattern} AND \`key\`='-' AND player IN (${inSql}) ` +
      'GROUP BY player, contributor, topic ' +
      'ORDER BY player, topic, total_contrib DESC');
    const map = new Map<string, { uid: string; total: number }>();
    for (const r of rows) {
      const key = `${r.player}|${r.topic}`;
      if (!map.has(key)) map.set(key, { uid: String(r.contributor ?? ''), total: Number(r.total_contrib ?? 0) });
    }
    return map;
  }

  private async queryContributorCounts(pattern: string, players: string[]): Promise<Map<string, number>> {
    const rows = await queryInChunks('active', players, (inSql) =>
      'SELECT player, topic, COUNT(DISTINCT contributor) AS cnt ' +
      'FROM mod_common_rank_record ' +
      `WHERE biz=${q(this.biz)} AND ${pattern} AND \`key\`='-' AND player IN (${inSql}) ` +
      'GROUP BY player, topic');
    return new Map(rows.map((r) => [`${r.player}|${r.topic}`, Number(r.cnt)]));
  }

  private async enrichUsers(uids: Array<string | number>): Promise<Map<string, Row>> {
    const rows = await queryInChunks('odps', uids, (inSql) =>
      `SELECT id, \`no\`, nick, vip_level, country_name, locale, gender FROM lita.user_info WHERE id IN (${inSql})`);
    return new Map(rows.map((r) => [String(r.id), r]));
  }

  private async enrichRooms(roomIds: Array<string | number>): Promise<Map<string, Row>> {
    const rows = await queryInChunks('odps', roomIds, (inSql) =>
      `SELECT room_id, room_name, room_type, user_id, create_time, locale, country FROM lita.lita_voice_room WHERE room_id IN (${inSql})`);
    return new Map(rows.map((r) => [String(r.room_id), r]));
  }

  private async enrichFamilies(familyIds: Array<string | number>): Promise<Map<string, Row>> {
    const rows = await queryInChunks('odps', familyIds, (inSql) =>
      `SELECT id, family_no, family_name, user_id, create_time, locale, family_level FROM lita.lita_family WHERE id IN (${inSql})`);
    return new Map(rows.map((r) => [String(r.id), r]));
  }

  private async familyMemberCounts(familyIds: Array<string | number>): Promise<Map<string, number>> {
    const rows = await queryInChunks('odps', familyIds, (inSql) =>
      `SELECT family_id, COUNT(*) AS cnt FROM lita.lita_family_user WHERE family_id IN (${inSql}) GROUP BY family_id`);
    return new Map(rows.map((r) => [String(r.family_id), Number(r.cnt)]));
  }

  // ============ 各榜单 ============

  private async buildUserBoard(pattern: string): Promise<Row[]> {
    const rankRows = await this.queryRank(pattern);
    if (rankRows.length === 0) return [];
    const users = await this.enrichUsers(rankRows.map((r) => String(r.player)));
    return rankRows.map((r) => {
      const u = users.get(String(r.player)) ?? {};
      return {
        stage: r.topic,
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

  private async buildPlayerBoard(pattern: string): Promise<Row[]> {
    const rankRows = await this.queryRank(pattern);
    if (rankRows.length === 0) return [];
    const players = rankRows.map((r) => String(r.player));
    const [users, contribs] = await Promise.all([
      this.enrichUsers(players),
      this.queryTopContributors(pattern, players),
    ]);
    const contribUsers = await this.enrichUsers([...contribs.values()].map((c) => c.uid).filter((v) => v !== ''));
    return rankRows.map((r) => {
      const u = users.get(String(r.player)) ?? {};
      const c = contribs.get(`${r.player}|${r.topic}`);
      const cu = c ? contribUsers.get(c.uid) ?? {} : {};
      return {
        stage: r.topic,
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

  private async buildRoomBoard(pattern: string): Promise<Row[]> {
    const rankRows = await this.queryRank(pattern);
    if (rankRows.length === 0) return [];
    const roomIds = rankRows.map((r) => String(r.player));
    const [rooms, contribs] = await Promise.all([
      this.enrichRooms(roomIds),
      this.queryTopContributors(pattern, roomIds),
    ]);
    const ownerUids = [...rooms.values()].map((rm) => String(rm.user_id ?? '')).filter((v) => v !== '');
    const contribUids = [...contribs.values()].map((c) => c.uid).filter((v) => v !== '');
    const [owners, contribUsers] = await Promise.all([this.enrichUsers(ownerUids), this.enrichUsers(contribUids)]);
    return rankRows.map((r) => {
      const rid = String(r.player);
      const rm = rooms.get(rid) ?? {};
      const ownerUid = rm.user_id ? String(rm.user_id) : '';
      const ow = ownerUid ? owners.get(ownerUid) ?? {} : {};
      const c = contribs.get(`${rid}|${r.topic}`);
      const cu = c ? contribUsers.get(c.uid) ?? {} : {};
      return {
        stage: r.topic,
        locale: r.locale,
        rank: num(r.rn),
        country: rm.country ?? '',
        roomId: num(rid),
        roomName: rm.room_name ?? '',
        roomType: rm.room_type ?? '',
        ownerUid: ownerUid ? num(ownerUid) : '',
        ownerNo: ow.no ?? '',
        ownerNick: ow.nick ?? '',
        createTime: fmtTime(rm.create_time),
        score: num(r.score),
        cUid: c ? num(c.uid) : '',
        cNo: cu.no ?? '',
        cNick: cu.nick ?? '',
      };
    });
  }

  private async buildFamilyBoard(pattern: string): Promise<Row[]> {
    const rankRows = await this.queryRank(pattern);
    if (rankRows.length === 0) return [];
    const familyIds = rankRows.map((r) => String(r.player));
    const [families, memberCounts, contribCounts] = await Promise.all([
      this.enrichFamilies(familyIds),
      this.familyMemberCounts(familyIds),
      this.queryContributorCounts(pattern, familyIds),
    ]);
    const owners = await this.enrichUsers([...families.values()].map((fm) => String(fm.user_id ?? '')).filter((v) => v !== ''));
    return rankRows.map((r) => {
      const fid = String(r.player);
      const fm = families.get(fid) ?? {};
      const ownerUid = fm.user_id ? String(fm.user_id) : '';
      const ow = ownerUid ? owners.get(ownerUid) ?? {} : {};
      return {
        stage: r.topic,
        locale: r.locale,
        rank: num(r.rn),
        country: '',
        familyId: num(fid),
        familyNo: fm.family_no ?? '',
        ownerUid: ownerUid ? num(ownerUid) : '',
        ownerNo: ow.no ?? '',
        ownerNick: ow.nick ?? '',
        score: num(r.score),
        familyCreateTime: fmtTime(fm.create_time),
        familyLevel: fm.family_level ?? '',
        memberCount: memberCounts.get(fid) ?? 0,
        contribCount: contribCounts.get(`${fid}|${r.topic}`) ?? 0,
      };
    });
  }

  private async buildCoupleBoard(pattern: string): Promise<Row[]> {
    const rankRows = await this.queryRank(pattern);
    if (rankRows.length === 0) return [];
    const allUids: string[] = [];
    for (const r of rankRows) {
      const pair = decodeCouple(String(r.player));
      if (pair) allUids.push(...pair);
    }
    const users = await this.enrichUsers(allUids);
    const rowOf = (uid: string, prefix: string): Row => {
      const u = users.get(uid) ?? {};
      return {
        [`${prefix}Country`]: u.country_name ?? '',
        [`${prefix}Uid`]: num(uid),
        [`${prefix}No`]: u.no ?? '',
        [`${prefix}Nick`]: u.nick ?? '',
        [`${prefix}Gender`]: genderOf(u.gender),
        [`${prefix}VipLevel`]: u.vip_level ?? '',
      };
    };
    const rows: Row[] = [];
    for (const r of rankRows) {
      const pair = decodeCouple(String(r.player));
      if (!pair) continue;
      rows.push({
        stage: r.topic,
        locale: r.locale,
        rank: num(r.rn),
        ...rowOf(pair[0], 'c1'),
        ...rowOf(pair[1], 'c2'),
        score: num(r.score),
      });
    }
    return rows;
  }
}

await new PkAllExport().execute();
