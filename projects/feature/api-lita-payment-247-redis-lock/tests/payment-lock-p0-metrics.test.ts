/**
 * TK-0251 / 被测变更 TK-0250：lita-payment 余额 Redis 锁 P0 审计整改
 * 指标与告警核验（C1-C3 执行后运行）
 *
 * 用例：API-LOCK-501、502、504
 * 说明：redis_error/client_missing 需要故障注入，由 TK-0252 覆盖；本脚本只核验已有指标与标签基数，
 *      缺失时 skip 并注明引用，不伪造通过。
 *
 * 运行：LITA_PAYMENT_TRANS_PASSWORD=*** node payment-lock-p0-metrics.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { PaymentClient } from './lib/payment-client.ts';
import {
  arg,
  hasMetric,
  lockMetrics,
  readMetrics,
  stamp,
  type LockMetrics,
} from './lib/payment-lock-helpers.ts';

const EVIDENCE_DIR = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `tk0251-metrics-${stamp()}`)));

class PaymentLockP0MetricsTest extends CheckBaseClass {
  private readonly client: PaymentClient;
  private lock: LockMetrics | null = null;
  private raw = '';

  constructor() {
    super();
    this.client = new PaymentClient();
    this.total = 6;
  }

  async execute(): Promise<void> {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    try {
      await super.execute();
    } finally {
      writeFileSync(join(EVIDENCE_DIR, 'metrics-raw.txt'), this.raw, 'utf8');
      writeFileSync(join(EVIDENCE_DIR, 'metrics-summary.json'), JSON.stringify(this.lock, null, 2), 'utf8');
      this.log(`证据目录: ${EVIDENCE_DIR}`);
    }
  }

  protected async run(): Promise<void> {
    const snap = await readMetrics(this.client.host);
    this.raw = snap.raw;
    this.lock = lockMetrics(snap);
    const lock = this.lock;
    await this.act('读取 Prometheus 指标', async () => {
      this.log(`families=${lock.families.join(',')}`);
      this.log(`acquire=${lock.acquire} acquireFail=${lock.acquireFail} timeout=${lock.timeout} expired=${lock.expired} redisError=${lock.redisError}`);
    });

    await this.check('用例#API-LOCK-501-①(API-LOCK-501) 核心锁指标可见（acquire/acquire_fail/wait_ms）', async (): Promise<CheckResult> => {
      const acquireFamily = hasMetric(snap, 'redis_lock_acquire_total') || hasMetric(snap, 'redis_lock_acquire');
      const failFamily = hasMetric(snap, 'redis_lock_acquire_fail_total') || hasMetric(snap, 'redis_lock_acquire_fail');
      const waitFamily = hasMetric(snap, 'redis_lock_wait_ms_count');
      const pass = acquireFamily && failFamily && waitFamily && lock.acquire > 0;
      if (!pass) throw new Error(`acquireFamily=${acquireFamily} failFamily=${failFamily} waitFamily=${waitFamily} acquire=${lock.acquire}`);
      return {
        expect: 'acquire_total、acquire_fail_total、wait_ms_count 可见且 acquire>0',
        real: `acquireFamily=${acquireFamily}，failFamily=${failFamily}，waitFamily=${waitFamily}，acquire=${lock.acquire}`,
        pass: true,
      };
    });

    await this.check('用例#API-LOCK-502-①(API-LOCK-502) timeout 失败原因可区分', async (): Promise<CheckResult> => ({
      expect: 'redis_lock_acquire_fail_total{reason="timeout"}>0',
      real: `timeout=${lock.timeout}，acquireFail=${lock.acquireFail}`,
      pass: lock.timeout > 0,
    }));

    await this.check('用例#API-LOCK-501-②(API-LOCK-501) 锁过期指标可见（lease-ms=1ms 阶段后）', async (): Promise<CheckResult> => {
      if (!hasMetric(snap, 'redis_lock_expired_total') && !hasMetric(snap, 'redis_lock_expired')) {
        this.skip('未执行 lease-ms=1ms 阶段或未触发过期，redis_lock_expired 不存在；见 API-LOCK-402');
      }
      return {
        expect: 'redis_lock_expired_total 可见且>0',
        real: `expired=${lock.expired}`,
        pass: lock.expired > 0,
      };
    });

    await this.check('用例#API-LOCK-501-③(API-LOCK-501) Redis 异常指标可见（需故障注入）', async (): Promise<CheckResult> => {
      if (!hasMetric(snap, 'redis_lock_redis_error_total') && !hasMetric(snap, 'redis_lock_redis_error')) {
        this.skip('未注入 Redis 故障，redis_lock_redis_error 不存在；由 TK-0252 故障注入场景覆盖');
      }
      return {
        expect: 'redis_lock_redis_error_total 可见且>0',
        real: `redisError=${lock.redisError}`,
        pass: lock.redisError > 0,
      };
    });

    await this.check('用例#API-LOCK-504-①(API-LOCK-504) 指标标签不含 userId/transNo/biz 等高基数字段', async (): Promise<CheckResult> => {
      const forbidden = ['userId', 'user_id', 'transNo', 'trans_no', 'biz', 'orderNo', 'order_no'];
      const hits: string[] = [];
      for (const key of snap.values.keys()) {
        for (const word of forbidden) {
          if (key.includes(`${word}=`)) hits.push(key);
        }
      }
      return {
        expect: 'redis_lock_* 标签仅含 application/reason/result 等固定标签',
        real: hits.length === 0 ? '未发现高基数标签' : `命中 ${hits.length} 条，样例=${hits.slice(0, 3).join(' | ')}`,
        pass: hits.length === 0,
      };
    });

    await this.check('用例#API-LOCK-502-②(API-LOCK-502) 不同失败原因使用不同 reason 标签值', async (): Promise<CheckResult> => {
      const reasons: string[] = [];
      for (const key of snap.values.keys()) {
        if (!key.startsWith('redis_lock_acquire_fail_total{') && !key.startsWith('redis_lock_acquire_fail{')) continue;
        const m = key.match(/reason="([^"]*)"/);
        if (m) reasons.push(m[1]);
      }
      const unique = [...new Set(reasons)].sort();
      return {
        expect: '至少出现 timeout；client_missing/redis_error 由 TK-0252 注入后核对',
        real: `reason 取值=${unique.join(',') || '(none)'}`,
        pass: unique.includes('timeout'),
      };
    });
  }
}

const test = new PaymentLockP0MetricsTest();
await test.execute();
