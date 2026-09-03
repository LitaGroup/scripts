import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';

const PATH = 'basic-common/v1/bucket/get';
const DB = 'lita_basic';
const TABLE = 'bucket_config';
const PREFIX = 'test-bucket-';
const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 2_000;

const MATCH_USER = 5005;
const MATCH_HEADERS: Record<string, string> = {
  'l-lang': 'en',
  'l-app-platform': 'ios',
  'l-app-id': 'lita',
  'l-version': '8.21.0',
  'l-ip': '1.2.3.4',
  'l-device-id': 'dev-x',
};
const MISMATCH_USER = 1;
const MISMATCH_HEADERS: Record<string, string> = {
  'l-lang': 'zh',
  'l-app-platform': 'android',
  'l-app-id': 'cinta',
  'l-version': '8.19.0',
  'l-ip': '9.9.9.9',
  'l-device-id': 'dev-y',
};

interface CaseConfig {
  topic: string;
  condition: string;
  value: number;
  priority: number;
  description: string;
}

function cfg(topic: string, condition: string, value: number, priority = 1, description = ''): CaseConfig {
  return { topic: PREFIX + topic, condition, value, priority, description };
}

const CONFIGS: CaseConfig[] = [
  cfg('contract', 'true', 1, 1, '接口契约'),
  cfg('priority', 'user % 100 < 10', 1, 1, '优先级 p1'),
  cfg('priority', 'user % 100 < 50', 2, 2, '优先级 p2'),
  cfg('priority', 'true', 3, 3, '优先级 p3 兜底'),
  cfg('default', 'user == 99999999', 1, 1, '未命中默认 0'),
  cfg('empty', '', 1, 1, '空 condition 永不命中'),
  cfg('loose-1', '1', 7, 1, '宽松求值 数字非0'),
  cfg('loose-0', '0', 7, 1, '宽松求值 数字0'),
  cfg('loose-t', 'true', 7, 1, '宽松求值 布尔true'),
  cfg('loose-f', 'false', 7, 1, '宽松求值 布尔false'),
  cfg('bad', 'invalid (((', 1, 1, '非法表达式静默失败'),
  cfg('good', 'true', 1, 1, '异常隔离对照组'),
  cfg('var-user', 'user == 5005', 1),
  cfg('var-locale', "locale == 'in'", 1),
  cfg('var-lang', "lang == 'en'", 1),
  cfg('var-platform', "platform == '2'", 1),
  cfg('var-app', "app == 'Lita'", 1),
  cfg('var-version', "version >= '8.20.0'", 1),
  cfg('var-ip', "ip == '1.2.3.4'", 1),
  cfg('var-device', "device == 'dev-x'", 1),
  cfg('unlogged', 'user == 0', 1),
  cfg('order-1', 'true', 1),
  cfg('order-2', 'true', 1),
  cfg('order-3', 'true', 1),
  cfg('cache', 'true', 1, 1, '缓存刷新'),
  cfg('combo', "user % 100 < 10 && locale == 'in' && platform == '2' && version >= '8.20.0'", 1, 1, '组合变量'),
];

const VAR_TOPICS = ['user', 'locale', 'lang', 'platform', 'app', 'version', 'ip', 'device'];
const COMBO_TOPIC = PREFIX + 'combo';

const COMBO_MISMATCH_CASES: Array<[string, { userId?: number; locale?: string; headers?: Record<string, string> }]> = [
  ['仅 user 不匹配', { userId: 60, locale: 'in', headers: MATCH_HEADERS }],
  ['仅 locale 不匹配', { userId: MATCH_USER, locale: 'th', headers: MATCH_HEADERS }],
  ['仅 platform 不匹配', { userId: MATCH_USER, locale: 'in', headers: { ...MATCH_HEADERS, 'l-app-platform': 'android' } }],
  ['仅 version 不匹配', { userId: MATCH_USER, locale: 'in', headers: { ...MATCH_HEADERS, 'l-version': '8.19.0' } }],
];

function sqlStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function insertSql(c: CaseConfig): string {
  const now = Date.now();
  return `INSERT INTO ${TABLE} (topic, \`condition\`, value, description, priority, create_time, update_time) `
    + `VALUES (${sqlStr(c.topic)}, ${sqlStr(c.condition)}, ${c.value}, ${sqlStr(c.description)}, ${c.priority}, ${now}, ${now})`;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

class BucketTest extends TestBaseClass {
  private data: Record<string, unknown> = {};

  constructor() {
    super();
    this.total = 34;
  }

  protected async run(): Promise<void> {
    try {
      await this.act('清理历史测试配置', async () => {
        await this.mysql.execute(`DELETE FROM ${TABLE} WHERE topic LIKE ${sqlStr(PREFIX + '%')}`, DB);
      });

      await this.act(`插入测试配置（${CONFIGS.length} 条）`, async () => {
        for (const c of CONFIGS) await this.mysql.execute(insertSql(c), DB);
      });

      await this.act('等待缓存加载（轮询 good 命中）', async () => {
        await this.pollUntil(PREFIX + 'good', '1');
      });

      await this.act('调用 bucket/get（userId=5）', async () => {
        this.data = await this.bucketCall({ userId: 5 });
      });

      await this.check('接口契约：value 为字符串', async (): Promise<CheckResult> => {
        const val = this.data[PREFIX + 'contract'];
        const allString = Object.values(this.data).every((v) => typeof v === 'string');
        return {
          expect: 'contract="1"（字符串）且全部 value 为字符串',
          real: `${JSON.stringify(val)} typeof=${typeof val}；全部字符串=${allString}`,
          pass: typeof val === 'string' && val === '1' && allString,
        };
      });

      await this.check('优先级：首个命中（user=5 → p1 value=1）', async (): Promise<CheckResult> => {
        return { expect: '1', real: String(this.data[PREFIX + 'priority']) };
      });

      await this.check('未命中默认 "0"', async (): Promise<CheckResult> => {
        return { expect: '0', real: String(this.data[PREFIX + 'default']) };
      });

      await this.check('空 condition 永不命中', async (): Promise<CheckResult> => {
        return { expect: '0', real: String(this.data[PREFIX + 'empty']) };
      });

      await this.check('宽松求值：1命中/0不命中/true命中/false不命中', async (): Promise<CheckResult> => {
        const real = ['loose-1', 'loose-0', 'loose-t', 'loose-f'].map((t) => String(this.data[PREFIX + t])).join('/');
        return { expect: '7/0/7/0', real, pass: real === '7/0/7/0' };
      });

      await this.check('异常静默且不影响其他 topic', async (): Promise<CheckResult> => {
        const bad = String(this.data[PREFIX + 'bad']);
        const good = String(this.data[PREFIX + 'good']);
        return {
          expect: 'bad="0" 且 good="1"',
          real: `bad=${bad}, good=${good}`,
          pass: bad === '0' && good === '1',
        };
      });

      await this.check('topic 顺序与 SQL 排序一致（升序）', async (): Promise<CheckResult> => {
        const keys = Object.keys(this.data);
        const sorted = [...keys].sort();
        let real = `${keys.length} 个 topic 升序`;
        let pass = JSON.stringify(keys) === JSON.stringify(sorted);
        if (!pass) {
          const i = keys.findIndex((k, idx) => k !== sorted[idx]);
          real = `位置 ${i} 乱序: ${keys[i]}（应为 ${sorted[i]}）`;
        }
        return { expect: '响应 keys 全局升序', real, pass };
      });

      await this.check('缺失 topic 不出现在响应', async (): Promise<CheckResult> => {
        const t = PREFIX + 'nonexistent';
        return { expect: `不含 ${t}`, real: t in this.data ? '出现' : '未出现', pass: !(t in this.data) };
      });

      await this.check('已登录 user≠0（unlogged 不命中）', async (): Promise<CheckResult> => {
        return { expect: '0', real: String(this.data[PREFIX + 'unlogged']) };
      });

      await this.act('调用 bucket/get（userId=20）', async () => {
        this.data = await this.bucketCall({ userId: 20 });
      });
      await this.check('优先级：p2 命中（user=20 → value=2）', async (): Promise<CheckResult> => {
        return { expect: '2', real: String(this.data[PREFIX + 'priority']) };
      });

      await this.act('调用 bucket/get（userId=60）', async () => {
        this.data = await this.bucketCall({ userId: 60 });
      });
      await this.check('优先级：p3 兜底（user=60 → value=3）', async (): Promise<CheckResult> => {
        return { expect: '3', real: String(this.data[PREFIX + 'priority']) };
      });

      await this.act('调用 bucket/get（未登录，无 l-user-id）', async () => {
        this.data = await this.bucketCall({});
      });
      await this.check('未登录 user==0 命中', async (): Promise<CheckResult> => {
        return { expect: '1', real: String(this.data[PREFIX + 'unlogged']) };
      });

      await this.act('调用 bucket/get（8 变量全匹配 headers）', async () => {
        this.data = await this.bucketCall({ userId: MATCH_USER, locale: 'in', headers: MATCH_HEADERS });
      });
      await this.check('单变量注入：8 变量全部命中', async (): Promise<CheckResult> => {
        return this.checkVars('1');
      });
      await this.check('组合变量：全匹配命中', async (): Promise<CheckResult> => {
        return { expect: '1', real: String(this.data[COMBO_TOPIC]) };
      });

      await this.act('调用 bucket/get（8 变量全不匹配 headers）', async () => {
        this.data = await this.bucketCall({ userId: MISMATCH_USER, locale: 'th', headers: MISMATCH_HEADERS });
      });
      await this.check('单变量注入：8 变量全部未命中', async (): Promise<CheckResult> => {
        return this.checkVars('0');
      });

      for (const [title, opts] of COMBO_MISMATCH_CASES) {
        await this.act(`调用 bucket/get（组合变量·${title}）`, async () => {
          this.data = await this.bucketCall(opts);
        });
        await this.check(`组合变量：${title} 不命中`, async (): Promise<CheckResult> => {
          return { expect: '0', real: String(this.data[COMBO_TOPIC]) };
        });
      }

      await this.act('变更缓存 topic 配置 value 1→2', async () => {
        await this.mysql.execute(`UPDATE ${TABLE} SET value = 2 WHERE topic = ${sqlStr(PREFIX + 'cache')}`, DB);
      });
      await this.act('等待缓存刷新（轮询 cache=2，验证 10s 缓存过期）', async () => {
        await this.pollUntil(PREFIX + 'cache', '2');
      });
    } finally {
      await this.act('清理测试配置', async () => {
        await this.mysql.execute(`DELETE FROM ${TABLE} WHERE topic LIKE ${sqlStr(PREFIX + '%')}`, DB);
      });
    }
  }

  private async bucketCall(opts: { userId?: number; locale?: string; headers?: Record<string, string> }): Promise<Record<string, unknown>> {
    return asRecord(await this.api.request(PATH, {
      method: 'POST',
      body: {},
      userId: opts.userId,
      locale: opts.locale,
      extraHeaders: opts.headers,
    }));
  }

  private async pollUntil(topic: string, expected: string, timeoutMs = POLL_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let last = '';
    while (Date.now() < deadline) {
      const data = await this.bucketCall({ userId: MATCH_USER });
      last = String(data[topic] ?? '');
      if (last === expected) return;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error(`轮询超时（${timeoutMs}ms）：${topic} 期望 ${expected}，实际 ${last || '缺失'}`);
  }

  private checkVars(expected: string): CheckResult {
    const rows = VAR_TOPICS.map((v) => ({ v, real: String(this.data[`${PREFIX}var-${v}`]) }));
    const problems = rows.filter((x) => x.real !== expected).map((x) => `${x.v}=${x.real}`);
    return {
      expect: VAR_TOPICS.map((v) => `${v}=${expected}`).join(', '),
      real: problems.length > 0 ? problems.join(', ') : `全部 8 变量=${expected}`,
      pass: problems.length === 0,
    };
  }
}

await new BucketTest().execute();
