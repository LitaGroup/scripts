import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';

const TEST_HOST = 'https://api.test.cinta.team/';
const PATH = 'basic-common/v1/bucket/get';
const DB = 'lita_basic';
const TABLE = 'bucket_config';
const PREFIX = 'test-bucket-';
const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 2_000;

const MATCH_USER = 5005;
const MATCH_BODY: Record<string, unknown> = {
  user: MATCH_USER,
  locale: 'in',
  lang: 'en',
  platform: 2,
  ip: '1.2.3.4',
  app: 'MST',
  version: '8.21.0',
  device: 'dev-x',
};
const MISMATCH_BODY: Record<string, unknown> = {
  user: 1,
  locale: 'th',
  lang: 'zh',
  platform: 1,
  ip: '9.9.9.9',
  app: 'FRIEND',
  version: '8.19.0',
  device: 'dev-y',
};
const HEADER_MATCH: Record<string, string> = {
  'l-user-id': String(MATCH_USER),
  'l-lang': 'en',
  'l-app-platform': 'ios',
  'l-app-id': 'lita',
  'l-version': '8.21.0',
  'l-ip': '1.2.3.4',
  'l-device-id': 'dev-x',
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
  cfg('var-version', "versionCompare(version, '8.20.0') >= 0", 1, 1, '版本号数值分段比较'),
  cfg('var-ip', "ip == '1.2.3.4'", 1),
  cfg('var-device', "device == 'dev-x'", 1),
  cfg('unlogged', 'user == nil', 1, 1, '未传 user 命中'),
  cfg('vc-eq', "versionCompare(version, '8.21.0') == 0", 1, 1, '相等'),
  cfg('vc-pad', "versionCompare(version, '8.21') == 0", 1, 1, '段数不足补0'),
  cfg('vc-lt', "versionCompare(version, '8.30.0') < 0", 1, 1, '小于'),
  cfg('vc-num', "versionCompare(version, '8.9.0') > 0", 1, 1, '数值比较非字典序 8.21.0>8.9.0'),
  cfg('vc-nil', "versionCompare(version, '8.20.0') < 0", 1, 1, 'nil 按最小版本'),
  cfg('vc-nil-ge', "versionCompare(version, '8.20.0') >= 0", 1, 1, 'nil >= 安全不命中'),
  cfg('vc-str', "versionCompare(version, '8.20.0-b') < 0", 1, 1, '非数值段字典序'),
  cfg('order-1', 'true', 1),
  cfg('order-2', 'true', 1),
  cfg('order-3', 'true', 1),
  cfg('cache', 'true', 1, 1, '缓存刷新'),
  cfg('combo', "user % 100 < 10 && locale == 'in' && platform == '2' && versionCompare(version, '8.20.0') >= 0", 1, 1, '组合变量'),
];

const VAR_TOPICS = ['user', 'locale', 'lang', 'platform', 'app', 'version', 'ip', 'device'];
const COMBO_TOPIC = PREFIX + 'combo';

const COMBO_MISMATCH_CASES: Array<[string, Record<string, unknown>]> = [
  ['仅 user 不匹配', { ...MATCH_BODY, user: 60 }],
  ['仅 locale 不匹配', { ...MATCH_BODY, locale: 'th' }],
  ['仅 platform 不匹配', { ...MATCH_BODY, platform: 1 }],
  ['仅 version 不匹配', { ...MATCH_BODY, version: '8.19.0' }],
];

const INVALID_ENUM_CASES: Array<[string, Record<string, unknown>]> = [
  ['platform="ios"（应为数字）', { platform: 'ios' }],
  ['app="lita"（应为 MST/FRIEND/LITE）', { app: 'lita' }],
  ['user="abc"（应为 number）', { user: 'abc' }],
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
  private invalidStatus: Record<string, number> = {};
  private laxLocale: { status: number; varLocale: string } = { status: 0, varLocale: '' };

  constructor() {
    super();
    this.total = 47;
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

      await this.act('调用 bucket/get（body user=5）', async () => {
        this.data = await this.bucketCall({ user: 5 });
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

      await this.check('已传 user：user==nil 不命中', async (): Promise<CheckResult> => {
        return { expect: '0', real: String(this.data[PREFIX + 'unlogged']) };
      });

      await this.act('调用 bucket/get（body user=20）', async () => {
        this.data = await this.bucketCall({ user: 20 });
      });
      await this.check('优先级：p2 命中（user=20 → value=2）', async (): Promise<CheckResult> => {
        return { expect: '2', real: String(this.data[PREFIX + 'priority']) };
      });

      await this.act('调用 bucket/get（body user=60）', async () => {
        this.data = await this.bucketCall({ user: 60 });
      });
      await this.check('优先级：p3 兜底（user=60 → value=3）', async (): Promise<CheckResult> => {
        return { expect: '3', real: String(this.data[PREFIX + 'priority']) };
      });

      await this.act('调用 bucket/get（空 body，未传 user/version）', async () => {
        this.data = await this.bucketCall({});
      });
      await this.check('未传 user：user==nil 命中（不再静默转 0）', async (): Promise<CheckResult> => {
        return { expect: '1', real: String(this.data[PREFIX + 'unlogged']) };
      });
      await this.check('versionCompare：nil 按最小版本处理（<8.20.0 命中 <0）', async (): Promise<CheckResult> => {
        return { expect: '1', real: String(this.data[PREFIX + 'vc-nil']) };
      });
      await this.check('versionCompare：nil 不命中 >=0（安全，不报错）', async (): Promise<CheckResult> => {
        return { expect: '0', real: String(this.data[PREFIX + 'vc-nil-ge']) };
      });

      await this.act('调用 bucket/get（非法枚举值探测）', async () => {
        for (const [k, body] of INVALID_ENUM_CASES) {
          this.invalidStatus[k] = (await this.bucketCallRaw(body)).status;
        }
        const lax = await this.bucketCallRaw({ locale: 'xx' });
        this.laxLocale = { status: lax.status, varLocale: String(asRecord(lax.body.data)[PREFIX + 'var-locale'] ?? '缺失') };
      });
      for (const [k] of INVALID_ENUM_CASES) {
        await this.check(`非法枚举 ${k} → 请求被拒（HTTP>=400）`, async (): Promise<CheckResult> => {
          const s = this.invalidStatus[k];
          return { expect: '>=400', real: String(s), pass: s >= 400 };
        });
      }
      await this.check('locale 非法值宽松接受（HTTP 200，变量按缺失处理不命中）', async (): Promise<CheckResult> => {
        return {
          expect: '200 且 var-locale=0',
          real: `${this.laxLocale.status} 且 var-locale=${this.laxLocale.varLocale}`,
          pass: this.laxLocale.status === 200 && this.laxLocale.varLocale === '0',
        };
      });

      await this.act('调用 bucket/get（body 8 变量全匹配）', async () => {
        this.data = await this.bucketCall(MATCH_BODY);
      });
      await this.check('单变量注入：8 变量全部命中（app=MST→Lita、platform=2→\'2\'）', async (): Promise<CheckResult> => {
        return this.checkVars('1');
      });
      await this.check('组合变量：全匹配命中', async (): Promise<CheckResult> => {
        return { expect: '1', real: String(this.data[COMBO_TOPIC]) };
      });
      await this.check('versionCompare：相等/补0/小于正确（8.21.0）', async (): Promise<CheckResult> => {
        const real = ['vc-eq', 'vc-pad', 'vc-lt'].map((t) => String(this.data[PREFIX + t])).join('/');
        return { expect: '1/1/1', real, pass: real === '1/1/1' };
      });
      await this.check('versionCompare：8.21.0>8.9.0 数值比较（不受字典序误导）', async (): Promise<CheckResult> => {
        return { expect: '1', real: String(this.data[PREFIX + 'vc-num']) };
      });

      await this.act('调用 bucket/get（body 8 变量全不匹配）', async () => {
        this.data = await this.bucketCall(MISMATCH_BODY);
      });
      await this.check('单变量注入：8 变量全部未命中', async (): Promise<CheckResult> => {
        return this.checkVars('0');
      });

      await this.act('调用 bucket/get（body 全不匹配 + L-* header 全匹配）', async () => {
        this.data = await this.bucketCall(MISMATCH_BODY, HEADER_MATCH);
      });
      await this.check('L-* header 不再影响求值（8 变量全部未命中）', async (): Promise<CheckResult> => {
        return this.checkVars('0');
      });

      await this.act('调用 bucket/get（body version=8.20.0-a）', async () => {
        this.data = await this.bucketCall({ version: '8.20.0-a' });
      });
      await this.check('versionCompare：非数值段按字典序（8.20.0-a < 8.20.0-b）', async (): Promise<CheckResult> => {
        return { expect: '1', real: String(this.data[PREFIX + 'vc-str']) };
      });

      for (const [title, body] of COMBO_MISMATCH_CASES) {
        await this.act(`调用 bucket/get（组合变量·${title}）`, async () => {
          this.data = await this.bucketCall(body);
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

  private async bucketCall(body: Record<string, unknown> = {}, extraHeaders?: Record<string, string>): Promise<Record<string, unknown>> {
    return asRecord(await this.api.request(PATH, { method: 'POST', body, extraHeaders }));
  }

  private async bucketCallRaw(body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${TEST_HOST}${PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    return { status: res.status, body: asRecord(await res.json().catch(() => null)) };
  }

  private async pollUntil(topic: string, expected: string, timeoutMs = POLL_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let last = '';
    while (Date.now() < deadline) {
      const data = await this.bucketCall({ user: MATCH_USER });
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
