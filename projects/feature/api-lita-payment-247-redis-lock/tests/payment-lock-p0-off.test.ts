/**
 * TK-0251 / 被测变更 TK-0250：lita-payment 余额 Redis 锁 P0 审计整改
 * 阶段 C0：redis-lock.enabled=false 默认关闭回归
 *
 * 用例：API-LOCK-001 ~ 005
 * 目的：确认默认关闭时 add/sub/refund 行为与修复前一致，且不产生锁相关指标。
 * 运行：
 *   LITA_PAYMENT_TRANS_PASSWORD=*** \
 *   LITA_PAYMENT_TEST_USER_ID=7586 \
 *   LITA_PAYMENT_BIZ=gamecenter_baishun1043 \
 *   node payment-lock-p0-off.test.ts [--evidence-dir=...]
 *
 * 注意：本脚本假设测试环境已由需求方/后端把 redis-lock.enabled 置为 false；
 *      若环境仍为 true，锁指标检查会失败，脚本不会把失败改判为通过。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { PaymentClient, businessState, businessStatus, isOk } from './lib/payment-client.ts';
import {
  TRANS_PREFIX,
  add,
  arg,
  envUserId,
  formatAmount,
  getAmount,
  lockMetrics,
  metricsDelta,
  readMetrics,
  refund,
  restoreToBaseline,
  stamp,
  sub,
  summarize,
  transResult,
  type LockMetrics,
} from './lib/payment-lock-helpers.ts';

const BIZ = process.env.LITA_PAYMENT_BIZ ?? 'gamecenter_baishun1043';
const USER_A = envUserId('LITA_PAYMENT_TEST_USER_ID', '7586');
const RUN_ID = process.env.LITA_PAYMENT_RUN_ID ?? stamp();
const EVIDENCE_DIR = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `tk0251-off-${stamp()}`)));

class PaymentLockP0OffTest extends CheckBaseClass {
  private readonly client: PaymentClient;
  private baselineA = Number.NaN;
  private metricSnapshots: Array<{ at: string; lock: LockMetrics }> = [];

  constructor() {
    super();
    this.client = new PaymentClient();
    this.total = 15;
  }

  async execute(): Promise<void> {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    try {
      await super.execute();
    } finally {
      writeFileSync(join(EVIDENCE_DIR, 'calls.json'), JSON.stringify({
        task: 'TK-0251', phase: 'C0-off', host: this.client.host, userA: USER_A, biz: BIZ, runId: RUN_ID,
        calls: this.client.calls,
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
    if (!Number.isFinite(this.baselineA)) throw new Error(`读取用户 ${USER_A} 基线余额失败`);
    await this.act('读取基线', async () => {
      this.log(`phase=C0-off userA=${USER_A} baseline=${formatAmount(this.baselineA)} biz=${BIZ}`);
    });

    try {
      await this.case001Add();
      await this.case002Sub();
      await this.case003Refund();
      await this.case004ConcurrentAdd();
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, 'END');
    }
    await this.case005Cleanup();
  }

  private async case001Add(): Promise<void> {
    try {
      const before = await getAmount(this.client, USER_A, BIZ);
      const m0 = await this.snapshot();
      const item = await add(this.client, USER_A, BIZ, RUN_ID, '001-ADD');
      const m1 = await this.snapshot();
      const d = metricsDelta(m0, m1);
      await this.check('用例#API-LOCK-001-①(API-LOCK-001) enabled=false 时 addAccountMoney 成功', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=OK，data.status=OK',
        real: `HTTP ${item.response.httpStatus}，state=${businessState(item.response.body)}，data.status=${String(item.response.body?.data?.status)}`,
        pass: item.response.httpStatus === 200 && isOk(item.response.body),
      }));
      await this.check('用例#API-LOCK-001-②(API-LOCK-001) 加钱后余额增加 0.01', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        return {
          expect: `余额=${formatAmount(before + 0.01)}`,
          real: `余额=${formatAmount(after)}`,
          pass: after === Number((before + 0.01).toFixed(2)),
        };
      });
      await this.check('用例#API-LOCK-001-③(API-LOCK-001) 默认关闭不产生 acquire/expired/redis_error 指标增量', async (): Promise<CheckResult> => ({
        expect: 'acquireDelta=0，expiredDelta=0，redisErrorDelta=0',
        real: `acquireDelta=${d.acquire}，expiredDelta=${d.expired}，redisErrorDelta=${d.redisError}`,
        pass: d.acquire === 0 && d.expired === 0 && d.redisError === 0,
      }));
      await this.check('用例#API-LOCK-001-④(API-LOCK-001) 加钱交易可查询且为 OK', async (): Promise<CheckResult> => {
        const r = await transResult(this.client, USER_A, BIZ, item.transNo, 'IN');
        return {
          expect: 'state=OK，data.status=OK',
          real: `state=${businessState(r.body)}，data.status=${String(r.body?.data?.status)}`,
          pass: businessState(r.body) === 'OK' && r.body?.data?.status === 'OK',
        };
      });
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '001');
    }
  }

  private async case002Sub(): Promise<void> {
    try {
      let current = await getAmount(this.client, USER_A, BIZ);
      if (current < 0.01) {
        const seed = await add(this.client, USER_A, BIZ, RUN_ID, '002-SEED', 0.01);
        if (!isOk(seed.response.body)) throw new Error(`002 前置造数失败: ${JSON.stringify(seed.response.body)}`);
      }
      const before = await getAmount(this.client, USER_A, BIZ);
      const m0 = await this.snapshot();
      const item = await sub(this.client, USER_A, BIZ, RUN_ID, '002-SUB');
      const m1 = await this.snapshot();
      const d = metricsDelta(m0, m1);
      await this.check('用例#API-LOCK-002-①(API-LOCK-002) enabled=false 时 subAccountMoney 成功', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=OK，data.status=OK',
        real: `HTTP ${item.response.httpStatus}，state=${businessState(item.response.body)}，data.status=${String(item.response.body?.data?.status)}`,
        pass: item.response.httpStatus === 200 && isOk(item.response.body),
      }));
      await this.check('用例#API-LOCK-002-②(API-LOCK-002) 扣钱后余额减少 0.01', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        return {
          expect: `余额=${formatAmount(before - 0.01)}`,
          real: `余额=${formatAmount(after)}`,
          pass: after === Number((before - 0.01).toFixed(2)),
        };
      });
      await this.check('用例#API-LOCK-002-③(API-LOCK-002) 默认关闭不产生 acquire/expired/redis_error 指标增量', async (): Promise<CheckResult> => ({
        expect: 'acquireDelta=0，expiredDelta=0，redisErrorDelta=0',
        real: `acquireDelta=${d.acquire}，expiredDelta=${d.expired}，redisErrorDelta=${d.redisError}`,
        pass: d.acquire === 0 && d.expired === 0 && d.redisError === 0,
      }));
      await this.check('用例#API-LOCK-002-④(API-LOCK-002) 扣钱交易可查询且为 OK', async (): Promise<CheckResult> => {
        const r = await transResult(this.client, USER_A, BIZ, item.transNo, 'OUT');
        return {
          expect: 'state=OK，data.status=OK',
          real: `state=${businessState(r.body)}，data.status=${String(r.body?.data?.status)}`,
          pass: businessState(r.body) === 'OK' && r.body?.data?.status === 'OK',
        };
      });
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '002');
    }
  }

  private async case003Refund(): Promise<void> {
    try {
      let current = await getAmount(this.client, USER_A, BIZ);
      if (current < 0.01) {
        const seed = await add(this.client, USER_A, BIZ, RUN_ID, '003-SEED', 0.01);
        if (!isOk(seed.response.body)) throw new Error(`003 前置造数失败: ${JSON.stringify(seed.response.body)}`);
      }
      const before = await getAmount(this.client, USER_A, BIZ);
      const source = await sub(this.client, USER_A, BIZ, RUN_ID, '003-SRC');
      if (!isOk(source.response.body)) throw new Error(`003 前置扣钱失败: ${JSON.stringify(source.response.body)}`);
      const m0 = await this.snapshot();
      const response = await refund(this.client, USER_A, BIZ, source.transNo, '003-REFUND');
      const m1 = await this.snapshot();
      const d = metricsDelta(m0, m1);
      await this.check('用例#API-LOCK-003-①(API-LOCK-003) enabled=false 时 refund 成功', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=OK，data.status=OK',
        real: `HTTP ${response.httpStatus}，state=${businessState(response.body)}，data.status=${String(response.body?.data?.status)}，msg=${String(response.body?.msg)}`,
        pass: response.httpStatus === 200 && isOk(response.body),
      }));
      await this.check('用例#API-LOCK-003-②(API-LOCK-003) 退款后余额恢复到扣钱前', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        return {
          expect: `余额=${formatAmount(before)}`,
          real: `余额=${formatAmount(after)}`,
          pass: after === before,
        };
      });
      await this.check('用例#API-LOCK-003-③(API-LOCK-003) 默认关闭不产生 acquire/expired/redis_error 指标增量', async (): Promise<CheckResult> => ({
        expect: 'acquireDelta=0，expiredDelta=0，redisErrorDelta=0',
        real: `acquireDelta=${d.acquire}，expiredDelta=${d.expired}，redisErrorDelta=${d.redisError}`,
        pass: d.acquire === 0 && d.expired === 0 && d.redisError === 0,
      }));
      await this.check('用例#API-LOCK-003-④(API-LOCK-003) 原扣钱交易状态变为 REFUND', async (): Promise<CheckResult> => {
        const r = await transResult(this.client, USER_A, BIZ, source.transNo, 'OUT');
        return {
          expect: 'state=REFUND，data.status=REFUND',
          real: `state=${businessState(r.body)}，data.status=${String(r.body?.data?.status)}`,
          pass: businessState(r.body) === 'REFUND' && r.body?.data?.status === 'REFUND',
        };
      });
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '003');
    }
  }

  private async case004ConcurrentAdd(): Promise<void> {
    const before = await getAmount(this.client, USER_A, BIZ);
    try {
      const items = await Promise.all([
        add(this.client, USER_A, BIZ, RUN_ID, '004-A'),
        add(this.client, USER_A, BIZ, RUN_ID, '004-B'),
      ]);
      const summary = summarize(items);
      await this.check('用例#API-LOCK-004-①(API-LOCK-004) 默认关闭时同用户 2 并发 add 均成功且无 BUSY', async (): Promise<CheckResult> => ({
        expect: '2 笔均为 OK，无 R_FREQUENT_ACCESS',
        real: `ok=${summary.ok.length}，busy=${summary.busy.length}，other=${summary.other.length}${summary.other.length ? '，sample=' + JSON.stringify(summary.other[0].response.body) : ''}`,
        pass: summary.ok.length === 2 && summary.busy.length === 0 && summary.other.length === 0,
      }));
      await this.check('用例#API-LOCK-004-②(API-LOCK-004) 2 并发 add 后余额准确增加 0.02', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        return {
          expect: `余额=${formatAmount(before + 0.02)}`,
          real: `余额=${formatAmount(after)}`,
          pass: after === Number((before + 0.02).toFixed(2)),
        };
      });
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '004');
    }
  }

  private async case005Cleanup(): Promise<void> {
    const result = await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '005');
    const final = await getAmount(this.client, USER_A, BIZ);
    await this.check('用例#API-LOCK-005-①(API-LOCK-005) 默认关闭阶段结束余额回补至基线', async (): Promise<CheckResult> => ({
      expect: `余额=${formatAmount(this.baselineA)}，清理结果 ok=true`,
      real: `余额=${formatAmount(final)}，清理结果 ok=${result.ok}，action=${result.action}`,
      pass: final === this.baselineA && result.ok,
    }));
  }
}

const test = new PaymentLockP0OffTest();
await test.execute();
