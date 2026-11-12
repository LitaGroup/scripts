/**
 * TK-0251 / 被测变更 TK-0250：lita-payment 余额 Redis 锁 P0 审计整改
 * 阶段 C1/C3：租约与过期（P0-5）
 *
 * 用例：
 *   lease0 模式（C1，lease-ms=0）：API-LOCK-401 看门狗冒烟
 *   lease1 模式（C3，lease-ms=1ms）：API-LOCK-402 过期指标与业务正确性
 *   清理：API-LOCK-405
 *
 * 运行：
 *   LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_LEASE_MODE=lease0 \
 *   LITA_PAYMENT_GRAY_USER_ID=7586 node payment-lock-p0-lease.test.ts
 *
 *   LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_LEASE_MODE=lease1 ...
 *
 * 限制：接口层无法制造“长事务不丢锁”和读取服务 ERROR 日志；相关结论引用 TK-0250 P0-7
 *      集成测试/TK-0252 日志证据，本脚本不伪造。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { PaymentClient, businessState, isOk } from './lib/payment-client.ts';
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
  type LockMetrics,
} from './lib/payment-lock-helpers.ts';

const BIZ = process.env.LITA_PAYMENT_BIZ ?? 'gamecenter_baishun1043';
const USER_A = envUserId('LITA_PAYMENT_GRAY_USER_ID', process.env.LITA_PAYMENT_TEST_USER_ID ?? '7586');
const MODE = (arg('mode', process.env.LITA_PAYMENT_LEASE_MODE ?? 'lease0') || 'lease0').toLowerCase();
const CONCURRENCY = Number(process.env.LITA_PAYMENT_LEASE_CONCURRENCY ?? '10');
const RUN_ID = process.env.LITA_PAYMENT_RUN_ID ?? stamp();
const EVIDENCE_DIR = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `tk0251-lease-${MODE}-${stamp()}`)));

if (MODE !== 'lease0' && MODE !== 'lease1') {
  throw new Error(`LITA_PAYMENT_LEASE_MODE 必须是 lease0 或 lease1，实际=${MODE}`);
}

class PaymentLockP0LeaseTest extends CheckBaseClass {
  private readonly client: PaymentClient;
  private baselineA = Number.NaN;
  private metricSnapshots: Array<{ at: string; lock: LockMetrics }> = [];

  constructor() {
    super();
    this.client = new PaymentClient();
    this.total = MODE === 'lease0' ? 3 : 5;
  }

  async execute(): Promise<void> {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    try {
      await super.execute();
    } finally {
      writeFileSync(join(EVIDENCE_DIR, 'calls.json'), JSON.stringify({
        task: 'TK-0251', phase: `lease-${MODE}`, host: this.client.host, userA: USER_A, biz: BIZ,
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
    if (!Number.isFinite(this.baselineA)) throw new Error(`读取用户 ${USER_A} 基线余额失败`);
    await this.act('读取基线', async () => {
      this.log(`phase=${MODE} userA=${USER_A} baseline=${formatAmount(this.baselineA)} biz=${BIZ}`);
    });

    try {
      if (MODE === 'lease0') {
        await this.case401WatchdogSmoke();
      } else {
        await this.case402Expiry();
      }
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, 'LEASE-END');
    }
    await this.case405Cleanup();
  }

  private async case401WatchdogSmoke(): Promise<void> {
    try {
      const m0 = await this.snapshot();
      const items = [];
      for (let i = 0; i < 10; i++) {
        items.push(await add(this.client, USER_A, BIZ, RUN_ID, `401-${i}`));
      }
      const m1 = await this.snapshot();
      const d = metricsDelta(m0, m1);
      const summary = summarize(items);
      await this.check('用例#API-LOCK-401-①(API-LOCK-401) lease-ms=0 时连续 10 笔 add 全部成功且无 BUSY', async (): Promise<CheckResult> => ({
        expect: '10 笔均 OK，busy=0，other=0',
        real: `ok=${summary.ok.length}，busy=${summary.busy.length}，other=${summary.other.length}${summary.other.length ? '，sample=' + JSON.stringify(summary.other[0].response.body) : ''}`,
        pass: summary.ok.length === 10 && summary.busy.length === 0 && summary.other.length === 0,
      }));
      await this.check('用例#API-LOCK-401-②(API-LOCK-401) lease-ms=0 正常释放不产生 expired 指标', async (): Promise<CheckResult> => ({
        expect: 'acquireDelta>=10，expiredDelta=0，redisErrorDelta=0',
        real: `acquireDelta=${d.acquire}，expiredDelta=${d.expired}，redisErrorDelta=${d.redisError}，timeoutDelta=${d.timeout}`,
        pass: d.acquire >= 10 && d.expired === 0 && d.redisError === 0,
      }));
      this.log('限制：接口层无法制造超过看门狗续期周期的长事务；“长事务期间锁不被过期”引用 TK-0250 P0-7 集成测试证据。');
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '401');
    }
  }

  private async case402Expiry(): Promise<void> {
    try {
      const before = await getAmount(this.client, USER_A, BIZ);
      const m0 = await this.snapshot();
      const items = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) =>
        add(this.client, USER_A, BIZ, RUN_ID, `402-${i}`),
      ));
      const m1 = await this.snapshot();
      const d = metricsDelta(m0, m1);
      const summary = summarize(items);
      await this.check('用例#API-LOCK-402-①(API-LOCK-402) lease-ms=1ms 并发 add 仅返回 OK 或 BUSY', async (): Promise<CheckResult> => ({
        expect: `total=${CONCURRENCY}，other=0`,
        real: `ok=${summary.ok.length}，busy=${summary.busy.length}，other=${summary.other.length}${summary.other.length ? '，sample=' + JSON.stringify(summary.other[0].response.body) : ''}`,
        pass: summary.other.length === 0 && summary.ok.length + summary.busy.length === CONCURRENCY,
      }));
      await this.check('用例#API-LOCK-402-②(API-LOCK-402) 固定短租约触发 redis_lock_expired 指标增量', async (): Promise<CheckResult> => ({
        expect: 'expiredDelta>0',
        real: `expiredDelta=${d.expired}，acquireDelta=${d.acquire}，holdExpired 需日志佐证`,
        pass: d.expired > 0,
      }));
      await this.check('用例#API-LOCK-402-③(API-LOCK-402) 过期路径下业务结果正确、余额与成功笔数一致', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        const expected = Number((before + 0.01 * summary.ok.length).toFixed(2));
        return {
          expect: `余额=${formatAmount(expected)}（before ${formatAmount(before)} + 0.01×${summary.ok.length}）`,
          real: `余额=${formatAmount(after)}`,
          pass: after === expected,
        };
      });
      await this.check('用例#API-LOCK-402-④(API-LOCK-402) 过期后后续请求仍可继续成功', async (): Promise<CheckResult> => {
        const item = await add(this.client, USER_A, BIZ, RUN_ID, '402-AFTER');
        return {
          expect: 'HTTP 200，state=OK，data.status=OK',
          real: `HTTP ${item.response.httpStatus}，state=${businessState(item.response.body)}，data.status=${String(item.response.body?.data?.status)}`,
          pass: item.response.httpStatus === 200 && isOk(item.response.body),
        };
      });
      this.log('限制：拒绝/过期日志无法从接口层读取；ERROR 日志证据引用 TK-0252 或需求方提供的日志。');
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '402');
    }
  }

  private async case405Cleanup(): Promise<void> {
    const result = await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, 'LEASE-405');
    const final = await getAmount(this.client, USER_A, BIZ);
    await this.check('用例#API-LOCK-405-①(API-LOCK-405) 租约阶段结束余额回补至基线', async (): Promise<CheckResult> => ({
      expect: `余额=${formatAmount(this.baselineA)}，清理结果 ok=true`,
      real: `余额=${formatAmount(final)}，清理结果 ok=${result.ok}，action=${result.action}`,
      pass: final === this.baselineA && result.ok,
    }));
  }
}

const test = new PaymentLockP0LeaseTest();
await test.execute();
