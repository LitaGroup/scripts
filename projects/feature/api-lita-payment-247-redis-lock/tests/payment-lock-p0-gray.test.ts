/**
 * TK-0251 / 被测变更 TK-0250：lita-payment 余额 Redis 锁 P0 审计整改
 * 阶段 C1/C2：灰度语义（P0-1）
 *
 * 用例：
 *   白名单模式（C1）：API-LOCK-101（A 加锁）、102（B 不加锁）
 *   全量模式（C2）：API-LOCK-101（A 加锁）、104（B 加锁）、105（A 加锁）
 *   清理：API-LOCK-106
 *
 * 运行：
 *   # C1: gray-user-whitelist=[A]，gray-games/gray-biz-list 非空
 *   LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_SCOPE=whitelist \
 *   LITA_PAYMENT_GRAY_USER_ID=7586 LITA_PAYMENT_NON_GRAY_USER_ID=7587 \
 *   node payment-lock-p0-gray.test.ts
 *
 *   # C2: gray-user-whitelist=[]，全量用户加锁
 *   LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_SCOPE=all ...
 *
 * 证明方式：redis_lock_acquire_total / redis_lock_wait_ms_count{result="acquired"} 增量。
 * 不使用 redis_lock_skipped（P0 实现未提供该指标），以“非白名单用户请求前后 acquire 无增量”证明未加锁。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { PaymentClient, businessState, businessStatus, isOk } from './lib/payment-client.ts';
import {
  add,
  arg,
  envUserId,
  formatAmount,
  getAmount,
  lockMetrics,
  metricsDelta,
  readMetrics,
  restoreToBaseline,
  stamp,
  summarize,
  transNo,
  type LockMetrics,
} from './lib/payment-lock-helpers.ts';

const BIZ = process.env.LITA_PAYMENT_BIZ ?? 'gamecenter_baishun1043';
const USER_A = envUserId('LITA_PAYMENT_GRAY_USER_ID', process.env.LITA_PAYMENT_TEST_USER_ID ?? '7586');
const USER_B = envUserId('LITA_PAYMENT_NON_GRAY_USER_ID');
const SCOPE = (arg('scope', process.env.LITA_PAYMENT_GRAY_SCOPE ?? 'whitelist') || 'whitelist').toLowerCase();
const CONCURRENCY = Number(process.env.LITA_PAYMENT_GRAY_CONCURRENCY ?? '20');
const RUN_ID = process.env.LITA_PAYMENT_RUN_ID ?? stamp();
const EVIDENCE_DIR = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `tk0251-gray-${SCOPE}-${stamp()}`)));

if (SCOPE !== 'whitelist' && SCOPE !== 'all') {
  throw new Error(`LITA_PAYMENT_GRAY_SCOPE 必须是 whitelist 或 all，实际=${SCOPE}`);
}

class PaymentLockP0GrayTest extends CheckBaseClass {
  private readonly client: PaymentClient;
  private baselineA = Number.NaN;
  private baselineB = Number.NaN;
  private metricSnapshots: Array<{ at: string; lock: LockMetrics }> = [];

  constructor() {
    super();
    this.client = new PaymentClient();
    this.total = SCOPE === 'whitelist' ? 5 : 9;
  }

  async execute(): Promise<void> {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    try {
      await super.execute();
    } finally {
      writeFileSync(join(EVIDENCE_DIR, 'calls.json'), JSON.stringify({
        task: 'TK-0251', phase: `C-${SCOPE}`, host: this.client.host, userA: USER_A, userB: USER_B, biz: BIZ,
        runId: RUN_ID, calls: this.client.calls,
      }, null, 2), 'utf8');
      writeFileSync(join(EVIDENCE_DIR, 'metrics.json'), JSON.stringify(this.metricSnapshots, null, 2), 'utf8');
      this.log(`证据目录: ${EVIDENCE_DIR}`);
    }
  }

  private async snapshot(): Promise<LockMetrics> {
    const snap = await readMetrics(this.client.host);
    const lock = lockMetrics(snap);
    this.metricSnapshots.push({ at: snap.at, lock });
    return lock;
  }

  protected async run(): Promise<void> {
    this.baselineA = await getAmount(this.client, USER_A, BIZ);
    this.baselineB = await getAmount(this.client, USER_B, BIZ);
    if (!Number.isFinite(this.baselineA) || !Number.isFinite(this.baselineB)) {
      throw new Error(`读取基线失败 userA=${USER_A} userB=${USER_B}`);
    }
    await this.act('读取基线', async () => {
      this.log(`phase=${SCOPE} userA=${USER_A} baselineA=${formatAmount(this.baselineA)} userB=${USER_B} baselineB=${formatAmount(this.baselineB)} biz=${BIZ}`);
    });

    try {
      if (SCOPE === 'whitelist') {
        await this.case101A();
        await this.case102BNotLocked();
      } else {
        await this.case101A();
        await this.case104BAllLocked();
        await this.case105AAllLocked();
      }
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, 'GRAY-A-END');
      await restoreToBaseline(this.client, USER_B, BIZ, this.baselineB, RUN_ID, 'GRAY-B-END');
    }
    await this.case106Cleanup();
  }

  private async case101A(): Promise<void> {
    const before = await getAmount(this.client, USER_A, BIZ);
    const m0 = await this.snapshot();
    const item = await add(this.client, USER_A, BIZ, RUN_ID, `101-A-${SCOPE}`);
    const m1 = await this.snapshot();
    const d = metricsDelta(m0, m1);
    await this.check('用例#API-LOCK-101-①(API-LOCK-101) 白名单用户 A 的 add 成功', async (): Promise<CheckResult> => ({
      expect: 'HTTP 200，state=OK，data.status=OK',
      real: `HTTP ${item.response.httpStatus}，state=${businessState(item.response.body)}，data.status=${String(item.response.body?.data?.status)}`,
      pass: item.response.httpStatus === 200 && isOk(item.response.body),
    }));
    await this.check('用例#API-LOCK-101-②(API-LOCK-101) A 请求产生加锁指标增量', async (): Promise<CheckResult> => ({
      expect: 'acquireDelta>=1 且 waitAcquiredDelta>=1',
      real: `acquireDelta=${d.acquire}，waitAcquiredDelta=${d.waitAcquired}，timeoutDelta=${d.timeout}`,
      pass: d.acquire >= 1 && d.waitAcquired >= 1,
    }));
    if (isOk(item.response.body)) {
      await restoreToBaseline(this.client, USER_A, BIZ, before, RUN_ID, '101-A');
    }
  }

  private async case102BNotLocked(): Promise<void> {
    const before = await getAmount(this.client, USER_B, BIZ);
    const m0 = await this.snapshot();
    const item = await add(this.client, USER_B, BIZ, RUN_ID, '102-B');
    const m1 = await this.snapshot();
    const d = metricsDelta(m0, m1);
    await this.check('用例#API-LOCK-102-①(API-LOCK-102) 非白名单用户 B 的 add 成功', async (): Promise<CheckResult> => ({
      expect: 'HTTP 200，state=OK，data.status=OK',
      real: `HTTP ${item.response.httpStatus}，state=${businessState(item.response.body)}，data.status=${String(item.response.body?.data?.status)}`,
      pass: item.response.httpStatus === 200 && isOk(item.response.body),
    }));
    await this.check('用例#API-LOCK-102-②(API-LOCK-102) B 请求不产生 acquire 增量（biz 灰度配置不参与）', async (): Promise<CheckResult> => ({
      expect: 'acquireDelta=0 且 waitAcquiredDelta=0',
      real: `acquireDelta=${d.acquire}，waitAcquiredDelta=${d.waitAcquired}，timeoutDelta=${d.timeout}`,
      pass: d.acquire === 0 && d.waitAcquired === 0,
    }));
    if (isOk(item.response.body)) {
      await restoreToBaseline(this.client, USER_B, BIZ, before, RUN_ID, '102-B');
    }
  }

  private async case104BAllLocked(): Promise<void> {
    const before = await getAmount(this.client, USER_B, BIZ);
    const m0 = await this.snapshot();
    const items = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) =>
      add(this.client, USER_B, BIZ, RUN_ID, `104-B-${i}`),
    ));
    const m1 = await this.snapshot();
    const d = metricsDelta(m0, m1);
    const summary = summarize(items);
    await this.check('用例#API-LOCK-104-①(API-LOCK-104) 空白名单时 B 并发结果仅为 OK 或 BUSY', async (): Promise<CheckResult> => ({
      expect: `total=${CONCURRENCY}，other=0`,
      real: `ok=${summary.ok.length}，busy=${summary.busy.length}，other=${summary.other.length}${summary.other.length ? '，sample=' + JSON.stringify(summary.other[0].response.body) : ''}`,
      pass: summary.other.length === 0 && summary.ok.length + summary.busy.length === CONCURRENCY,
    }));
    await this.check('用例#API-LOCK-104-②(API-LOCK-104) B 请求产生加锁指标增量且覆盖成功笔数', async (): Promise<CheckResult> => ({
      expect: `acquireDelta>=${summary.ok.length} 且 acquireDelta>0`,
      real: `acquireDelta=${d.acquire}，ok=${summary.ok.length}，busy=${summary.busy.length}，timeoutDelta=${d.timeout}`,
      pass: d.acquire > 0 && d.acquire >= summary.ok.length,
    }));
    await this.check('用例#API-LOCK-104-③(API-LOCK-104) B 并发后余额与成功笔数一致', async (): Promise<CheckResult> => {
      const after = await getAmount(this.client, USER_B, BIZ);
      const expected = Number((before + 0.01 * summary.ok.length).toFixed(2));
      return {
        expect: `余额=${formatAmount(expected)}（before ${formatAmount(before)} + 0.01×${summary.ok.length}）`,
        real: `余额=${formatAmount(after)}`,
        pass: after === expected,
      };
    });
  }

  private async case105AAllLocked(): Promise<void> {
    const before = await getAmount(this.client, USER_A, BIZ);
    const m0 = await this.snapshot();
    const items = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) =>
      add(this.client, USER_A, BIZ, RUN_ID, `105-A-${i}`),
    ));
    const m1 = await this.snapshot();
    const d = metricsDelta(m0, m1);
    const summary = summarize(items);
    await this.check('用例#API-LOCK-105-①(API-LOCK-105) 空白名单时 A 并发结果仅为 OK 或 BUSY', async (): Promise<CheckResult> => ({
      expect: `total=${CONCURRENCY}，other=0`,
      real: `ok=${summary.ok.length}，busy=${summary.busy.length}，other=${summary.other.length}${summary.other.length ? '，sample=' + JSON.stringify(summary.other[0].response.body) : ''}`,
      pass: summary.other.length === 0 && summary.ok.length + summary.busy.length === CONCURRENCY,
    }));
    await this.check('用例#API-LOCK-105-②(API-LOCK-105) A 请求产生加锁指标增量且覆盖成功笔数', async (): Promise<CheckResult> => ({
      expect: `acquireDelta>=${summary.ok.length} 且 acquireDelta>0`,
      real: `acquireDelta=${d.acquire}，ok=${summary.ok.length}，busy=${summary.busy.length}，timeoutDelta=${d.timeout}`,
      pass: d.acquire > 0 && d.acquire >= summary.ok.length,
    }));
    await this.check('用例#API-LOCK-105-③(API-LOCK-105) A 并发后余额与成功笔数一致', async (): Promise<CheckResult> => {
      const after = await getAmount(this.client, USER_A, BIZ);
      const expected = Number((before + 0.01 * summary.ok.length).toFixed(2));
      return {
        expect: `余额=${formatAmount(expected)}（before ${formatAmount(before)} + 0.01×${summary.ok.length}）`,
        real: `余额=${formatAmount(after)}`,
        pass: after === expected,
      };
    });
  }

  private async case106Cleanup(): Promise<void> {
    const resultA = await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, 'GRAY-106-A');
    const resultB = await restoreToBaseline(this.client, USER_B, BIZ, this.baselineB, RUN_ID, 'GRAY-106-B');
    const finalA = await getAmount(this.client, USER_A, BIZ);
    const finalB = await getAmount(this.client, USER_B, BIZ);
    await this.check('用例#API-LOCK-106-①(API-LOCK-106) 灰度阶段结束 A/B 余额回补至基线', async (): Promise<CheckResult> => ({
      expect: `A=${formatAmount(this.baselineA)}，B=${formatAmount(this.baselineB)}`,
      real: `A=${formatAmount(finalA)}（ok=${resultA.ok}），B=${formatAmount(finalB)}（ok=${resultB.ok}）`,
      pass: finalA === this.baselineA && finalB === this.baselineB && resultA.ok && resultB.ok,
    }));
  }
}

const test = new PaymentLockP0GrayTest();
await test.execute();
