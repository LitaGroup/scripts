import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';

/**
 * Admin 动态移除记录与恢复冒烟测试（测试环境）
 * 接口文档：http://project.cinta.team/api/documents/94.md
 *
 * 覆盖：Removed 列表（30 天时间窗/过滤/分页/错误）、详情 includeRemoved、
 *      Restore 恢复（DB/日志/幂等）、All tab/UGC-Review/搜索 的恢复信息展示。
 *
 * 运行：node moment-removed-smoke.test.ts
 *        [--author-id=7969] [--locale=in] [--platform=ALL]
 *        [--content-prefix=moment-removed-smoke]
 * 前置：config.json（测试环境 MySQL 直连）；后台默认账号 admin/123456，
 *      可用 SCRIPT_ADMIN_HOST / SCRIPT_ADMIN_USERNAME / SCRIPT_ADMIN_PASSWORD /
 *      SCRIPT_ADMIN_ACCESS_TOKEN 覆盖。
 */

const DEFAULT_ADMIN_HOST = 'https://funbit-mgr.test.cinta.team';
const DB = 'funbit';
const HTTP_TIMEOUT_MS = 30_000;
const DAY_MS = 86_400_000;

function arg(name: string, def: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
}

const ADMIN_HOST = (process.env.SCRIPT_ADMIN_HOST ?? DEFAULT_ADMIN_HOST).replace(/\/+$/, '');
const ADMIN_USERNAME = process.env.SCRIPT_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.SCRIPT_ADMIN_PASSWORD ?? '123456';
const ADMIN_ACCESS_TOKEN = process.env.SCRIPT_ADMIN_ACCESS_TOKEN ?? '';
const ADMIN_NAME = process.env.SCRIPT_ADMIN_NAME ?? ADMIN_USERNAME;

const AUTHOR_ID = arg('author-id', '7969');
const LOCALE = arg('locale', 'in');
const PLATFORM = arg('platform', 'ALL');
const PLATFORM_FILTER = PLATFORM.toUpperCase() === 'FRIEND' ? 'friend' : 'mst';
const CONTENT_PREFIX = arg('content-prefix', 'moment-removed-smoke');

interface SeededMoment {
  momentId: string;
  text: string;
  removeTime: number;
  removeOperator: string;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function asList(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
}

function sqlStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function sqlNum(n: number | string): string {
  const str = String(n);
  if (!/^-?\d+$/.test(str)) throw new Error(`invalid numeric value: ${n}`);
  return str;
}

function textOfContent(content: unknown): string {
  return String(asRecord(asRecord(content).text).text ?? '');
}

function makeContent(text: string): string {
  const file = `file/moment/images/smoke/${Date.now()}_${Math.floor(Math.random() * 10000)}.jpg`;
  return JSON.stringify({
    text: { text, ats: [], topics: [] },
    images: {
      pics: [
        {
          path: file,
          url: `https://data.test.lita.game/${file}`,
          width: 720,
          height: 1280,
        },
      ],
    },
  });
}

function itemById(body: Record<string, unknown>, momentId: string): Record<string, unknown> | null {
  const items = asList(asRecord(body.data).datas);
  return items.find((x) => String(x.momentId) === momentId) ?? null;
}

function nowMsFloorSec(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}

class MomentRemovedSmoke extends TestBaseClass {
  private accessToken = '';
  private adminName = '';
  private fresh: SeededMoment | null = null;
  private userDeleted: SeededMoment | null = null;
  private stale: SeededMoment | null = null;
  private seededIds = new Set<string>();
  private cleaned = false;

  constructor() {
    super();
    this.total = 22;
  }

  protected async run(): Promise<void> {
    try {
      await this.act('登录后台并获取 AccessToken', async () => {
        await this.login();
        this.log(`后台=${ADMIN_HOST} 操作人=${this.adminName}`);
      });

      await this.act('清理历史冒烟数据', async () => {
        await this.cleanupData();
      });

      await this.act('造数：Admin 移除 / 用户自删 / 31 天前移除', async () => {
        this.fresh = await this.seedMoment(`${CONTENT_PREFIX}-${Date.now()}-${Math.floor(Math.random() * 10000)}`, 0, 'admin');
        this.userDeleted = await this.seedMoment(`${CONTENT_PREFIX}-user-${Date.now()}`, 0, 'user');
        this.stale = await this.seedMoment(`${CONTENT_PREFIX}-stale-${Date.now()}`, 31, 'admin');
        this.log(`admin=${this.fresh.momentId} user=${this.userDeleted.momentId} stale=${this.stale.momentId}`);
      });

      await this.check('Removed 列表：包含近 30 天移除的动态，移除信息完整', async (): Promise<CheckResult> => {
        const body = await this.call('removed', { query: { rows: 100, content: this.fresh!.text } });
        const item = itemById(body, this.fresh!.momentId);
        if (!item) return { expect: `含 ${this.fresh!.momentId}`, real: '未找到', pass: false };
        const problems: string[] = [];
        if (String(item.authorId) !== AUTHOR_ID) problems.push(`authorId=${item.authorId}`);
        if (String(item.state) !== 'remove') problems.push(`state=${item.state}`);
        if (String(item.momentType) !== 'images') problems.push(`momentType=${item.momentType}`);
        if (String(item.locale) !== LOCALE) problems.push(`locale=${item.locale}`);
        if (String(item.platform) !== PLATFORM) problems.push(`platform=${item.platform}`);
        if (String(item.removeOperator) !== this.fresh!.removeOperator) problems.push(`removeOperator=${item.removeOperator}`);
        if (String(item.removeFrom) !== 'admin') problems.push(`removeFrom=${item.removeFrom}`);
        if (textOfContent(item.content) !== this.fresh!.text) problems.push('content.text 不匹配');
        if (!(Number(item.removeTime) > 0)) problems.push(`removeTime=${item.removeTime}`);
        const totals = String(asRecord(body.data).totals);
        if (totals !== '1') problems.push(`totals=${totals}`);
        return {
          expect: 'state=remove、removeOperator/removeFrom/removeTime/content 正确、totals=1',
          real: problems.length === 0 ? '全部正确' : problems.join('；'),
          pass: problems.length === 0,
        };
      });

      await this.check('Removed 列表：用户自删的动态也返回，removeFrom=user', async (): Promise<CheckResult> => {
        const body = await this.call('removed', { query: { rows: 100, content: this.userDeleted!.text } });
        const item = itemById(body, this.userDeleted!.momentId);
        if (!item) return { expect: `含 ${this.userDeleted!.momentId}`, real: '未找到', pass: false };
        const problems: string[] = [];
        if (String(item.removeFrom) !== 'user') problems.push(`removeFrom=${item.removeFrom}`);
        if (String(item.removeOperator) !== 'user') problems.push(`removeOperator=${item.removeOperator}`);
        return {
          expect: 'removeFrom=user,removeOperator=user',
          real: problems.length === 0 ? '正确' : problems.join('；'),
          pass: problems.length === 0,
        };
      });

      await this.check('Removed 列表：31 天前移除的动态被时间窗排除', async (): Promise<CheckResult> => {
        const body = await this.call('removed', { query: { rows: 100, content: this.stale!.text } });
        const item = itemById(body, this.stale!.momentId);
        return {
          expect: '不返回',
          real: item ? `返回了 ${this.stale!.momentId}` : '未返回',
          pass: item === null,
        };
      });

      await this.check('Removed 列表：momentId/authorId/userLocale/platform/momentType/content 过滤生效', async (): Promise<CheckResult> => {
        const filters: Array<[string, Record<string, string | number>]> = [
          ['momentId', { momentId: this.fresh!.momentId }],
          ['authorId', { authorId: AUTHOR_ID }],
          ['userLocale', { userLocale: LOCALE }],
          ['platform', { platform: PLATFORM_FILTER }],
          ['momentType', { momentType: 'images' }],
          ['content', { content: this.fresh!.text }],
        ];
        const bad: string[] = [];
        for (const [name, query] of filters) {
          const body = await this.call('removed', { query: { rows: 100, ...query } });
          if (!itemById(body, this.fresh!.momentId)) bad.push(name);
        }
        return {
          expect: '每个过滤条件均能命中',
          real: bad.length === 0 ? '全部命中' : `未命中：${bad.join(', ')}`,
          pass: bad.length === 0,
        };
      });

      await this.check('Removed 列表：分页字段 totals/pageNo/pages 正确', async (): Promise<CheckResult> => {
        const body = await this.call('removed', { query: { rows: 1, content: this.fresh!.text } });
        const data = asRecord(body.data);
        const real = `totals=${data.totals},pageNo=${data.pageNo},pages=${data.pages},rows=${asList(data.datas).length}`;
        const pass = String(data.totals) === '1' && String(data.pageNo) === '1' && String(data.pages) === '1' && asList(data.datas).length === 1;
        return { expect: 'totals=1,pageNo=1,pages=1,rows=1', real, pass };
      });

      await this.check('Removed 列表：rows 大于 1000 返回业务错误', async (): Promise<CheckResult> => {
        const { body } = await this.requestRaw('removed', { query: { rows: 1001 } });
        const pass = String(body.status) === '1' && String(body.msg).includes('1000');
        return { expect: 'status=1 且提示 pageSize 不允许大于 1000', real: `status=${body.status},msg=${body.msg}`, pass };
      });

      await this.check('详情：includeRemoved=1 可查已移除动态并返回移除信息', async (): Promise<CheckResult> => {
        const body = await this.call('info', {
          query: { momentId: this.fresh!.momentId, authorId: AUTHOR_ID, includeRemoved: 1 },
        });
        const data = asRecord(body.data);
        const problems: string[] = [];
        if (String(data.state) !== 'remove') problems.push(`state=${data.state}`);
        if (String(data.removeOperator) !== this.fresh!.removeOperator) problems.push(`removeOperator=${data.removeOperator}`);
        if (String(data.removeFrom) !== 'admin') problems.push(`removeFrom=${data.removeFrom}`);
        if (!(Number(data.removeTime) > 0)) problems.push(`removeTime=${data.removeTime}`);
        return {
          expect: 'state=remove 且返回 removeTime/removeOperator/removeFrom',
          real: problems.length === 0 ? '正确' : problems.join('；'),
          pass: problems.length === 0,
        };
      });

      await this.check('详情：不传 includeRemoved 时查不到已移除动态', async (): Promise<CheckResult> => {
        const body = await this.call('info', { query: { momentId: this.fresh!.momentId, authorId: AUTHOR_ID } });
        const data = asRecord(body.data);
        const pass = String(body.status) === '0' && data.momentId === undefined;
        return { expect: 'status=0 且无 data', real: `status=${body.status},momentId=${data.momentId ?? 'null'}`, pass };
      });

      await this.check('详情：缺少 momentId/authorId 返回 param is error', async (): Promise<CheckResult> => {
        const { body } = await this.requestRaw('info', { query: { momentId: this.fresh!.momentId } });
        const pass = String(body.status) === '1' && String(body.msg).includes('param');
        return { expect: 'status=1 且 msg=param is error', real: `status=${body.status},msg=${body.msg}`, pass };
      });

      await this.act('恢复动态（POST /api/moment/restore）', async () => {
        const body = await this.call('restore', {
          method: 'POST',
          body: { momentId: Number(this.fresh!.momentId), authorId: Number(AUTHOR_ID) },
        });
        if (String(body.status) !== '0') throw new Error(`恢复失败 status=${body.status} msg=${body.msg}`);
      });

      await this.check('恢复后：DB state=pass、option_state=yes、grade=0', async (): Promise<CheckResult> => {
        const rows = await this.mysql.query(
          `SELECT state, option_state, option_time, grade FROM moment WHERE moment_id = ${sqlNum(this.fresh!.momentId)} LIMIT 1`,
          DB,
        );
        if (rows.length === 0) return { expect: '动态存在且已恢复', real: '动态不存在', pass: false };
        const r = rows[0];
        const problems: string[] = [];
        if (String(r.state) !== 'pass') problems.push(`state=${r.state}`);
        if (String(r.option_state) !== 'yes') problems.push(`option_state=${r.option_state}`);
        if (!(Number(r.option_time) >= this.fresh!.removeTime)) problems.push(`option_time=${r.option_time}`);
        if (Number(r.grade) !== 0) problems.push(`grade=${r.grade}`);
        return {
          expect: 'state=pass,option_state=yes,option_time>=移除时间,grade=0',
          real: problems.length === 0 ? '全部正确' : problems.join('；'),
          pass: problems.length === 0,
        };
      });

      await this.check('恢复后：写入 moment_log restore 记录（option_from=admin）', async (): Promise<CheckResult> => {
        const rows = await this.mysql.query(
          `SELECT state, option_from, option_name FROM moment_log WHERE moment_id = ${sqlNum(this.fresh!.momentId)} ORDER BY id DESC LIMIT 5`,
          DB,
        );
        const log = rows.find((r) => String(r.state) === 'restore');
        if (!log) return { expect: '存在 restore 日志', real: '未找到', pass: false };
        const problems: string[] = [];
        if (String(log.option_from) !== 'admin') problems.push(`option_from=${log.option_from}`);
        if (String(log.option_name) !== this.adminName) problems.push(`option_name=${log.option_name}!=${this.adminName}`);
        return {
          expect: `option_from=admin,option_name=${this.adminName}`,
          real: problems.length === 0 ? '正确' : problems.join('；'),
          pass: problems.length === 0,
        };
      });

      await this.check('恢复后：Removed 列表不再包含该动态', async (): Promise<CheckResult> => {
        const body = await this.call('removed', { query: { rows: 100, content: this.fresh!.text } });
        const item = itemById(body, this.fresh!.momentId);
        return { expect: '不返回', real: item ? '仍返回' : '未返回', pass: item === null };
      });

      await this.check('恢复后：详情返回 state=pass 与 restoreTime/restoreOperator', async (): Promise<CheckResult> => {
        const body = await this.call('info', {
          query: { momentId: this.fresh!.momentId, authorId: AUTHOR_ID, includeRemoved: 1 },
        });
        const data = asRecord(body.data);
        const problems: string[] = [];
        if (String(data.state) !== 'pass') problems.push(`state=${data.state}`);
        if (!(Number(data.restoreTime) > 0)) problems.push(`restoreTime=${data.restoreTime}`);
        if (String(data.restoreOperator) !== this.adminName) problems.push(`restoreOperator=${data.restoreOperator}`);
        return {
          expect: `state=pass 且 restoreOperator=${this.adminName}`,
          real: problems.length === 0 ? '正确' : problems.join('；'),
          pass: problems.length === 0,
        };
      });

      await this.check('All tab（unauditedGrade）展示恢复信息', async (): Promise<CheckResult> => {
        const body = await this.call('unauditedGrade', {
          query: { rows: 50, authorId: AUTHOR_ID, content: this.fresh!.text },
        });
        return this.checkRestoreInfo(body, 'unauditedGrade');
      });

      await this.check('UGC-Review（pagelist）展示恢复信息', async (): Promise<CheckResult> => {
        const body = await this.call('pagelist', {
          query: { rows: 50, authorId: AUTHOR_ID, content: this.fresh!.text },
        });
        return this.checkRestoreInfo(body, 'pagelist');
      });

      await this.check('动态搜索（search）展示恢复信息', async (): Promise<CheckResult> => {
        const body = await this.call('search', {
          method: 'POST',
          body: { rows: 50, authorId: Number(AUTHOR_ID), content: this.fresh!.text },
        });
        return this.checkRestoreInfo(body, 'search');
      });

      await this.check('重复恢复幂等：不再新增 restore 日志', async (): Promise<CheckResult> => {
        const before = await this.restoreLogCount();
        const body = await this.call('restore', {
          method: 'POST',
          body: { momentId: Number(this.fresh!.momentId), authorId: Number(AUTHOR_ID) },
        });
        const after = await this.restoreLogCount();
        const pass = String(body.status) === '0' && before === after;
        return { expect: 'status=0 且 restore 日志数不变', real: `status=${body.status},before=${before},after=${after}`, pass };
      });

      await this.safeCleanup();
    } finally {
      await this.safeCleanup('清理冒烟数据（异常兜底）');
    }
  }

  private async safeCleanup(title = '清理冒烟数据'): Promise<void> {
    if (this.cleaned) return;
    this.cleaned = true;
    await this.act(title, async () => {
      await this.cleanupData();
    });
  }

  private async checkRestoreInfo(body: Record<string, unknown>, api: string): Promise<CheckResult> {
    const item = itemById(body, this.fresh!.momentId);
    if (!item) return { expect: `${api} 返回该动态`, real: '未找到', pass: false };
    const problems: string[] = [];
    if (String(item.state) !== 'pass') problems.push(`state=${item.state}`);
    if (Number(item.grade) !== 0) problems.push(`grade=${item.grade}`);
    if (!(Number(item.restoreTime) > 0)) problems.push(`restoreTime=${item.restoreTime}`);
    if (String(item.restoreOperator) !== this.adminName) problems.push(`restoreOperator=${item.restoreOperator}`);
    return {
      expect: `state=pass,grade=0,restoreOperator=${this.adminName}`,
      real: problems.length === 0 ? '正确' : problems.join('；'),
      pass: problems.length === 0,
    };
  }

  private async restoreLogCount(): Promise<number> {
    const rows = await this.mysql.query(
      `SELECT COUNT(*) AS n FROM moment_log WHERE moment_id = ${sqlNum(this.fresh!.momentId)} AND state = 'restore'`,
      DB,
    );
    return Number(rows[0]?.n ?? 0);
  }

  private async login(): Promise<void> {
    if (ADMIN_ACCESS_TOKEN) {
      this.accessToken = ADMIN_ACCESS_TOKEN;
      this.adminName = ADMIN_NAME;
      return;
    }
    const url = `${ADMIN_HOST}/admin/login`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: ADMIN_USERNAME, pwd: ADMIN_PASSWORD }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const text = await res.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`后台登录返回非 JSON：HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    if (String(body.status) !== '0') {
      throw new Error(`后台登录失败：status=${body.status} msg=${body.msg}`);
    }
    const data = asRecord(body.data);
    this.accessToken = String(data.accessToken ?? '');
    if (!this.accessToken) throw new Error('后台登录未返回 accessToken');
    this.adminName = String(data.userName ?? ADMIN_USERNAME);
  }

  private async requestRaw(
    path: string,
    options: { method?: string; query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<{ http: number; body: Record<string, unknown> }> {
    const url = new URL(`${ADMIN_HOST}/api/moment/${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.accessToken) headers.AccessToken = this.accessToken;
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const text = await res.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`HTTP ${res.status} 非 JSON 响应：${text.slice(0, 300)}`);
    }
    if (res.status >= 400) {
      throw new Error(`HTTP ${res.status}：${body.msg ?? text.slice(0, 300)}`);
    }
    return { http: res.status, body };
  }

  private async call(
    path: string,
    options: { method?: string; query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<Record<string, unknown>> {
    const { body } = await this.requestRaw(path, options);
    if (String(body.status) !== '0') {
      throw new Error(`接口 ${path} 失败：status=${body.status} msg=${body.msg ?? ''}`);
    }
    return body;
  }

  private async seedMoment(text: string, daysAgo: number, removeFrom: 'admin' | 'user'): Promise<SeededMoment> {
    const momentId = (BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000))).toString();
    const removeTime = nowMsFloorSec() - daysAgo * DAY_MS;
    const removeOperator = removeFrom === 'user' ? 'user' : daysAgo === 0 ? CONTENT_PREFIX : `${CONTENT_PREFIX}-stale`;
    const createTime = removeTime - 3_600_000;
    const content = makeContent(text);
    const grade = removeFrom === 'admin' && daysAgo === 0 ? 7 : 0;
    await this.mysql.execute(
      `INSERT INTO moment
        (moment_id, moment_type, author_id, create_time, content, state, option_state, option_time, grade, locale, show_mode, platform)
       VALUES
        (${sqlNum(momentId)}, 'images', ${sqlNum(AUTHOR_ID)}, FROM_UNIXTIME(${Math.floor(createTime / 1000)}),
         ${sqlStr(content)}, 'remove', 'yes', ${removeTime}, ${grade}, ${sqlStr(LOCALE)}, 'all', ${sqlStr(PLATFORM)})`,
      DB,
    );
    await this.mysql.execute(
      `INSERT INTO moment_log
        (moment_id, author_id, moment_type, state, content, create_time, option_from, option_name, grade)
       VALUES
        (${sqlNum(momentId)}, ${sqlNum(AUTHOR_ID)}, 'images', 'remove', NULL,
         FROM_UNIXTIME(${Math.floor(removeTime / 1000)}), ${sqlStr(removeFrom)}, ${sqlStr(removeOperator)}, 0)`,
      DB,
    );
    this.seededIds.add(momentId);
    return { momentId, text, removeTime, removeOperator };
  }

  private async cleanupData(): Promise<void> {
    await this.mysql.execute(`DELETE FROM moment_log WHERE option_name LIKE ${sqlStr(`${CONTENT_PREFIX}%`)}`, DB);
    const leftover = await this.mysql.query(
      `SELECT moment_id FROM moment WHERE content LIKE ${sqlStr(`%${CONTENT_PREFIX}%`)}`,
      DB,
    );
    const ids = new Set<string>(this.seededIds);
    for (const row of leftover) ids.add(String(row.moment_id));
    if (ids.size === 0) return;
    const list = [...ids].map((id) => sqlNum(id)).join(',');
    await this.mysql.execute(`DELETE FROM moment_log WHERE moment_id IN (${list})`, DB);
    await this.mysql.execute(`DELETE FROM moment WHERE moment_id IN (${list})`, DB);
    this.seededIds.clear();
    this.log(`已清理 ${ids.size} 条冒烟动态`);
  }
}

await new MomentRemovedSmoke().execute();
