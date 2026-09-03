import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { loadConfig } from '../../../../src/resources/config.ts';

const TEST_HOST = 'https://api.test.cinta.team/';
const DB = 'lita_basic';
const TABLE = 'bucket_config';
const BASE = 'admin-main/bucket';
const TOPIC = 'test-admin-t1';
const DESCRIPTION = 'admin接口测试topic';
const NEVER_TOPIC = 'test-admin-never';
const POLL_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 2_000;

interface RuleRow {
  id: number;
  topic: string;
  condition: string;
  value: number;
  description: string;
  priority: number;
  createTime: number;
  updateTime: number;
}

interface TopicRow {
  topic: string;
  description: string;
  ruleCount: number;
  createTime: number;
}

function sqlStr(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

class AdminTest extends TestBaseClass {
  private topics: TopicRow[] = [];
  private rules: RuleRow[] = [];
  private simMatch = new Map<string, string>();
  private simNoTopic: Record<string, unknown> = {};
  private simNever: Record<string, unknown> = {};

  constructor() {
    super();
    this.total = 27;
  }

  protected async run(): Promise<void> {
    try {
      await this.act('清理历史测试配置', async () => {
        await this.mysql.execute(`DELETE FROM ${TABLE} WHERE topic LIKE ${sqlStr('test-admin-%')}`, DB);
      });

      await this.act('新增 topic + 3 条规则（topic/add、rule/add×3）', async () => {
        await this.adminCall('topic/add', { topic: TOPIC, description: DESCRIPTION });
        await this.adminCall('rule/add', { topic: TOPIC, condition: 'user % 100 < 10', value: 1, description: '10%灰度', priority: 1 });
        await this.adminCall('rule/add', { topic: TOPIC, condition: 'user % 100 < 30', value: 2, description: '30%灰度', priority: 2 });
        await this.adminCall('rule/add', { topic: TOPIC, condition: 'true', value: 3, description: '兜底', priority: 3 });
      });

      await this.check('topic/list：包含新 topic，ruleCount=3，description 正确', async (): Promise<CheckResult> => {
        this.topics = (await this.adminCall('topic/list', {})) as TopicRow[];
        const t = this.topics.find((x) => x.topic === TOPIC);
        if (!t) return { expect: `含 ${TOPIC}`, real: '未找到', pass: false };
        const problems: string[] = [];
        if (t.ruleCount !== 3) problems.push(`ruleCount=${t.ruleCount}`);
        if (t.description !== DESCRIPTION) problems.push(`description=${JSON.stringify(t.description)}`);
        return {
          expect: 'ruleCount=3 且 description 正确',
          real: problems.length > 0 ? problems.join('，') : `ruleCount=${t.ruleCount}，description=${t.description}`,
          pass: problems.length === 0,
        };
      });

      await this.check('rule/list：3 条按 priority 升序，不含占位头行，字段类型正确', async (): Promise<CheckResult> => {
        this.rules = (await this.adminCall('rule/list', { topic: TOPIC })) as RuleRow[];
        if (!Array.isArray(this.rules) || this.rules.length !== 3) {
          return { expect: '3 条规则', real: `${Array.isArray(this.rules) ? this.rules.length : '非数组'} 条`, pass: false };
        }
        const priorities = this.rules.map((r) => r.priority);
        const asc = priorities[0] < priorities[1] && priorities[1] < priorities[2];
        const conditions = this.rules.map((r) => r.condition).join(' / ');
        const typesOk = this.rules.every(
          (r) => typeof r.id === 'number' && typeof r.value === 'number' && typeof r.priority === 'number'
            && typeof r.createTime === 'number' && typeof r.updateTime === 'number',
        );
        return {
          expect: 'priority 升序 [1,2,3]，全字段 number',
          real: `priorities=[${priorities}]，conditions=${conditions}，类型正确=${typesOk}`,
          pass: asc && typesOk,
        };
      });

      await this.act('等待缓存刷新并采集 simulate 结果（user=5/20/60 + 无topic + never）', async () => {
        this.simMatch.set('5', await this.pollSimulate('5', '1'));
        this.simMatch.set('20', await this.simulateValue('20'));
        this.simMatch.set('60', await this.simulateValue('60'));
        this.simNoTopic = asRecord(await this.adminCall('simulate', {}));
        this.simNever = asRecord(await this.adminCall('simulate', { topic: NEVER_TOPIC }));
      });

      await this.check('simulate：user=5 命中规则1（value=1）', async (): Promise<CheckResult> => {
        return { expect: '1', real: this.simMatch.get('5') ?? '缺失' };
      });

      await this.check('simulate：user=20 命中规则2（value=2）', async (): Promise<CheckResult> => {
        return { expect: '2', real: this.simMatch.get('20') ?? '缺失' };
      });

      await this.check('simulate：user=60 命中规则3 兜底（value=3）', async (): Promise<CheckResult> => {
        return { expect: '3', real: this.simMatch.get('60') ?? '缺失' };
      });

      await this.check('simulate 不指定 topic：含全部已配置 topic，不含无配置 topic', async (): Promise<CheckResult> => {
        const hasTopic = TOPIC in this.simNoTopic;
        const hasNever = NEVER_TOPIC in this.simNoTopic;
        return {
          expect: `含 ${TOPIC}，不含 ${NEVER_TOPIC}`,
          real: `${TOPIC}=${hasTopic ? '含' : '不含'}，${NEVER_TOPIC}=${hasNever ? '含' : '不含'}`,
          pass: hasTopic && !hasNever,
        };
      });

      await this.check('simulate 指定无配置 topic：服务端补齐 "0"', async (): Promise<CheckResult> => {
        return { expect: `${NEVER_TOPIC}="0"`, real: `${NEVER_TOPIC}=${JSON.stringify(this.simNever[NEVER_TOPIC])}` };
      });

      await this.check('rule/add 重复 priority → 报错「该topic下priority已存在」', async (): Promise<CheckResult> => {
        return this.expectError(
          () => this.adminCall('rule/add', { topic: TOPIC, condition: 'true', value: 9, description: '重复priority', priority: 1 }),
          '该topic下priority已存在',
        );
      });

      await this.check('rule/add 不存在的 topic → 报错「topic不存在，请先创建topic」', async (): Promise<CheckResult> => {
        return this.expectError(
          () => this.adminCall('rule/add', { topic: NEVER_TOPIC, condition: 'true', value: 1, priority: 1 }),
          'topic不存在，请先创建topic',
        );
      });

      await this.check('topic/add 重复 topic → 报错「topic已存在」', async (): Promise<CheckResult> => {
        return this.expectError(() => this.adminCall('topic/add', { topic: TOPIC, description: '重复' }), 'topic已存在');
      });

      await this.check('rule/update 不存在 ID → 报错「规则不存在」', async (): Promise<CheckResult> => {
        return this.expectError(
          () => this.adminCall('rule/update', { id: 999999999, topic: TOPIC, condition: 'true', value: 1, priority: 9 }),
          '规则不存在',
        );
      });

      await this.check('rule/update 占位头行 ID → 报错「规则不存在」（头行不可编辑）', async (): Promise<CheckResult> => {
        const headId = await this.headRowId();
        return this.expectError(
          () => this.adminCall('rule/update', { id: headId, topic: TOPIC, condition: 'true', value: 9, priority: 9 }),
          '规则不存在',
        );
      });

      await this.check('rule/update 改 priority 为已存在值 → 报错「该topic下priority已存在」', async (): Promise<CheckResult> => {
        const id = this.rules[0].id;
        return this.expectError(
          () => this.adminCall('rule/update', { id, topic: TOPIC, condition: 'true', value: 1, priority: 2 }),
          '该topic下priority已存在',
        );
      });

      await this.act('rule/update 修改规则1 condition：user%100<10 → user%100<3', async () => {
        const id = this.rules[0].id;
        await this.adminCall('rule/update', { id, topic: TOPIC, condition: 'user % 100 < 3', value: 1, description: '3%灰度', priority: 1 });
      });

      await this.act('等待缓存刷新（轮询 simulate user=5 → "2"）', async () => {
        const real = await this.pollSimulate('5', '2');
        this.simMatch.set('5', real);
      });

      await this.check('simulate：update 生效（user=5 不再 <3，落到规则2）', async (): Promise<CheckResult> => {
        return { expect: '2', real: this.simMatch.get('5') ?? '缺失' };
      });

      await this.act('rule/delete 删除规则2（priority=2）', async () => {
        const id = this.rules[1].id;
        await this.adminCall('rule/delete', { id });
      });

      await this.check('rule/list：删除后返回 2 条', async (): Promise<CheckResult> => {
        const list = (await this.adminCall('rule/list', { topic: TOPIC })) as RuleRow[];
        const priorities = Array.isArray(list) ? list.map((r) => r.priority) : [];
        return {
          expect: '2 条，priorities=[1,3]',
          real: `${Array.isArray(list) ? list.length : '非数组'} 条，priorities=[${priorities}]`,
          pass: Array.isArray(list) && list.length === 2 && priorities[0] === 1 && priorities[1] === 3,
        };
      });

      await this.check('rule/delete 不存在 ID → 报错「规则不存在」', async (): Promise<CheckResult> => {
        return this.expectError(() => this.adminCall('rule/delete', { id: 999999999 }), '规则不存在');
      });

      await this.check('rule/delete 占位头行 ID → 报错「规则不存在」（头行不可删）', async (): Promise<CheckResult> => {
        const headId = await this.headRowId();
        return this.expectError(() => this.adminCall('rule/delete', { id: headId }), '规则不存在');
      });

      await this.act('topic/delete 级联删除 topic', async () => {
        await this.adminCall('topic/delete', { topic: TOPIC });
      });

      await this.check('topic/list：删除后不再包含该 topic', async (): Promise<CheckResult> => {
        const list = (await this.adminCall('topic/list', {})) as TopicRow[];
        const found = Array.isArray(list) && list.some((t) => t.topic === TOPIC);
        return { expect: `不含 ${TOPIC}`, real: found ? '仍存在' : '未找到', pass: !found };
      });

      await this.check('rule/list：已删除 topic 返回空（或提示不存在）', async (): Promise<CheckResult> => {
        let real = '';
        let pass = false;
        try {
          const list = (await this.adminCall('rule/list', { topic: TOPIC })) as RuleRow[];
          real = Array.isArray(list) ? `${list.length} 条` : '非数组';
          pass = Array.isArray(list) && list.length === 0;
        } catch (e) {
          real = (e as Error).message;
          pass = real.includes('不存在') || real.includes('为空');
        }
        return { expect: '空数组（或明确提示 topic 不存在）', real, pass };
      });
    } finally {
      await this.act('清理测试配置', async () => {
        await this.mysql.execute(`DELETE FROM ${TABLE} WHERE topic LIKE ${sqlStr('test-admin-%')}`, DB);
      });
    }
  }

  private async adminCall(path: string, body: unknown): Promise<unknown> {
    const token = loadConfig().userToken;
    if (!token) throw new Error('config.json 缺少 userToken（admin-main 需要登录态）');
    const res = await fetch(`${TEST_HOST}${BASE}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'l-user-token': token,
        'l-user-id': '1',
        'l-trace-id': `admin-test-${Date.now().toString(36)}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data) throw new Error(`HTTP ${res.status}: 非 JSON 响应`);
    if (String(data.status) !== '0') throw new Error(`业务错误 status=${data.status}: ${data.msg ?? ''}`);
    return data.data;
  }

  private async headRowId(): Promise<number> {
    const rows = await this.mysql.query(
      `SELECT id FROM ${TABLE} WHERE topic = ${sqlStr(TOPIC)} AND priority = 0`,
      DB,
    );
    if (rows.length === 0) throw new Error('占位头行不存在');
    return Number(rows[0].id);
  }

  private async simulateValue(user: string): Promise<string> {
    const data = asRecord(await this.adminCall('simulate', { topic: TOPIC, user }));
    return String(data[TOPIC] ?? '缺失');
  }

  private async pollSimulate(user: string, expected: string): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let last = '';
    while (Date.now() < deadline) {
      last = await this.simulateValue(user);
      if (last === expected) return last;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error(`轮询超时（${POLL_TIMEOUT_MS}ms）：simulate user=${user} 期望 ${expected}，实际 ${last}`);
  }

  private async expectError(fn: () => Promise<unknown>, expectedMsg: string): Promise<CheckResult> {
    let real = '';
    try {
      await fn();
      real = '（未报错，调用成功）';
    } catch (e) {
      real = (e as Error).message;
    }
    return { expect: `报错含「${expectedMsg}」`, real, pass: real.includes(expectedMsg) };
  }
}

await new AdminTest().execute();
