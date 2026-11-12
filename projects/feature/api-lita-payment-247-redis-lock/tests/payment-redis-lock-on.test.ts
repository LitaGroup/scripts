/**
 * TK-0249 / 被测变更 TK-0247：lita-payment 余额变更接口 Redis 锁改造 · 锁开启路径
 *
 * 前置条件（必须由后端/运维在测试环境 Nacos 配置）：
 *   redis-lock.enabled=true
 *   redis-lock.wait-ms=300
 *   redis-lock.fail-fast=true
 *   redis-lock.gray-games=["1043"]（或 gray-biz-list 精确包含 gamecenter_baishun1043）
 * 若环境未满足，脚本会把锁开启场景标记为 skip（阻塞），不会伪造通过。
 *
 * 运行：LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-on.test.ts [--evidence-dir=...]
 * 说明：本用例通过“同用户 80 并发 + 300ms 有界等待”制造锁竞争，验证快速失败与不丢单；
 *      不直接读写 Redis，不修改被测服务配置。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import {
  PaymentClient,
  type PaymentResponse,
  amountOf,
  businessState,
  businessStatus,
  isOk,
} from './lib/payment-client.ts';

const BIZ = process.env.LITA_PAYMENT_BIZ ?? 'gamecenter_baishun1043';
const USER_ID = Number(process.env.LITA_PAYMENT_TEST_USER_ID ?? '7586');
const PREFIX = '/litapayment/global/trans';
const CONCURRENCY = Number(process.env.LITA_PAYMENT_LOCK_CONCURRENCY ?? '80');
const BUSY_STATE = 'R_FREQUENT_ACCESS';
const BUSY_STATUS = '400005';
const BUSY_MSG = 'BALANCE_PROCESSING';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

class PaymentRedisLockOnTest extends CheckBaseClass {
  private readonly client: PaymentClient;
  private readonly evidenceDir: string;
  private readonly runId: string;
  private baseline = Number.NaN;

  constructor() {
    super();
    this.client = new PaymentClient();
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `tk0249-lock-on-${stamp()}`)));
    this.runId = process.env.LITA_PAYMENT_RUN_ID ?? stamp();
    this.total = 10;
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    try {
      await super.execute();
    } finally {
      const file = join(this.evidenceDir, 'calls.json');
      writeFileSync(file, JSON.stringify({ task: 'TK-0249', case: 'redis-lock-on', host: this.client.host, runId: this.runId, calls: this.client.calls }, null, 2), 'utf8');
      this.log(`接口留痕文件: ${file}`);
    }
  }

  protected async run(): Promise<void> {
    this.baseline = await this.amount();
    if (!Number.isFinite(this.baseline)) throw new Error('读取基线余额失败，无法继续');

    // 先做一笔正常加钱，确认写入口经过切面并产生 redis_lock_* 指标
    const setup = await this.add(0.01, '101-SETUP');
    if (!isOk(setup.response.body)) {
      throw new Error(`前置加钱失败：${JSON.stringify(setup.response.body)}`);
    }
    const metrics = await this.metrics();
    const lockEnabled = /redis_lock_acquire_total|redis_lock_wait_ms/.test(metrics);

    if (!lockEnabled) {
      await this.restoreToBaseline('SKIP');
      await this.skipCase('101', 'redis-lock.enabled=false：测试环境未开启 Redis 锁，锁开启路径无法验证');
      await this.skipCase('102', '前置条件不满足：Redis 锁未开启');
      await this.skipCase('103', '前置条件不满足：Redis 锁未开启');
      await this.skipCase('104', '前置条件不满足：Redis 锁未开启');
      await this.skipCase('105', '前置条件不满足：Redis 锁未开启');
      await this.skipCase('106', '前置条件不满足：Redis 锁未开启');
      await this.skipCase('107', '前置条件不满足：Redis 锁未开启');
      await this.skipCase('108', '前置条件不满足：Redis 锁未开启');
      return;
    }

    try {
      await this.check('用例#API-PAY-101-①(API-PAY-101) 测试环境已开启 redis-lock 且写入口产生锁指标', async (): Promise<CheckResult> => ({
        expect: '/actuator/prometheus 含 redis_lock_acquire_total 或 redis_lock_wait_ms',
        real: `含 redis_lock_acquire_total=${/redis_lock_acquire_total/.test(metrics)}，含 redis_lock_wait_ms=${/redis_lock_wait_ms/.test(metrics)}`,
        pass: true,
      }));

      // 同用户 80 并发加钱，制造有界等待/快速失败（基线需包含 setup 的 0.01）
      const beforeBatch = await this.amount();
      const batch = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => this.add(0.01, `102-${i}`)));
      const ok = batch.filter((x) => isOk(x.response.body));
      const busy = batch.filter((x) => businessState(x.response.body) === BUSY_STATE && businessStatus(x.response.body) === BUSY_STATUS);
      const other = batch.filter((x) => !isOk(x.response.body) && !busy.includes(x));

      await this.check('用例#API-PAY-102-①(API-PAY-102) 并发请求只返回成功或 BALANCE_PROCESSING，无其它错误', async (): Promise<CheckResult> => ({
        expect: `全部为 OK 或 ${BUSY_STATE}/${BUSY_STATUS}`,
        real: `total=${batch.length}，ok=${ok.length}，busy=${busy.length}，other=${other.length}${other.length ? '，sample=' + JSON.stringify(other[0]?.response.body) : ''}`,
        pass: other.length === 0,
      }));
      await this.check('用例#API-PAY-102-②(API-PAY-102) 并发竞争中出现快速失败 BALANCE_PROCESSING', async (): Promise<CheckResult> => ({
        expect: `busy>=1（${BUSY_STATE}/${BUSY_STATUS}/${BUSY_MSG}）`,
        real: `busy=${busy.length}，ok=${ok.length}`,
        pass: busy.length >= 1,
      }));

      // 被快速失败的请求不应产生任何余额变动/交易
      let missing = 0;
      const samples: string[] = [];
      for (const item of busy) {
        const r = await this.transResult(item.transNo, 'IN');
        const hit = r.body?.data?.status === 'NOT_FOUND' && businessState(r.body) === 'NOT_FOUND';
        if (hit) missing++;
        else if (samples.length < 3) samples.push(`${item.transNo}:${JSON.stringify(r.body)}`);
      }
      await this.check('用例#API-PAY-103-①(API-PAY-103) 所有 BALANCE_PROCESSING 请求均未入账', async (): Promise<CheckResult> => ({
        expect: `busy=${busy.length} 笔全部 getTransResult=NOT_FOUND`,
        real: `not_found=${missing}/${busy.length}${samples.length ? '，异常样例=' + samples.join(' | ') : ''}`,
        pass: missing === busy.length,
      }));

      const afterBatch = await this.amount();
      const expected = Number((beforeBatch + 0.01 * ok.length).toFixed(2));
      await this.check('用例#API-PAY-104-①(API-PAY-104) 批次后余额等于批次前余额加成功笔数金额', async (): Promise<CheckResult> => ({
        expect: `余额=${expected.toFixed(2)}（批次前 ${beforeBatch.toFixed(2)} + 0.01×${ok.length}）`,
        real: `余额=${Number.isFinite(afterBatch) ? afterBatch.toFixed(2) : String(afterBatch)}`,
        pass: afterBatch === expected,
      }));

      const normal = await this.add(0.01, '105-AFTER-BATCH');
      await this.check('用例#API-PAY-105-①(API-PAY-105) 批次结束后普通加钱可立即成功（锁已释放）', async (): Promise<CheckResult> => ({
        expect: 'state=OK，data.status=OK',
        real: `state=${businessState(normal.response.body)}，data.status=${String(normal.response.body?.data?.status)}`,
        pass: isOk(normal.response.body),
      }));

      // 重试一笔 busy 请求：同一 transNo 重试应成功且只入账一次
      let retryOk = false;
      let retryBalanceOk = false;
      if (busy.length > 0) {
        const target = busy[0];
        const beforeRetry = await this.amount();
        const retry = await this.client.post(`${PREFIX}/addAccountMoney`, {
          param: { biz: BIZ, userId: USER_ID, transNo: target.transNo, amount: 0.01, type: 'ADD_MONEY', remark: `TK-0249 retry ${target.transNo}`, inDealType: 'coin' },
        });
        retryOk = isOk(retry.body);
        const afterRetry = await this.amount();
        retryBalanceOk = retryOk && afterRetry === Number((beforeRetry + 0.01).toFixed(2));
        await this.check('用例#API-PAY-106-①(API-PAY-106) 对 BALANCE_PROCESSING 的 transNo 用同一流水号重试成功', async (): Promise<CheckResult> => ({
          expect: 'state=OK，data.status=OK',
          real: `state=${businessState(retry.body)}，data.status=${String(retry.body?.data?.status)}`,
          pass: retryOk,
        }));
        await this.check('用例#API-PAY-106-②(API-PAY-106) 重试只入账一次（余额仅增加 0.01）', async (): Promise<CheckResult> => ({
          expect: `余额=${(beforeRetry + 0.01).toFixed(2)}`,
          real: `余额=${afterRetry.toFixed(2)}`,
          pass: retryBalanceOk,
        }));
      } else {
        await this.check('用例#API-PAY-106-①(API-PAY-106) 对 BALANCE_PROCESSING 的 transNo 用同一流水号重试成功', async (): Promise<CheckResult> => ({
          expect: '存在至少 1 笔 busy 请求可供重试',
          real: '无 busy 请求，无法验证重试',
          pass: false,
        }));
        await this.check('用例#API-PAY-106-②(API-PAY-106) 重试只入账一次（余额仅增加 0.01）', async (): Promise<CheckResult> => ({
          expect: '存在至少 1 笔 busy 请求可供重试',
          real: '无 busy 请求，无法验证',
          pass: false,
        }));
      }

      const metricsAfter = await this.metrics();
      const timeoutFail = /redis_lock_acquire_fail_total\{[^}]*reason="timeout"[^}]*\}\s+([1-9]\d*\.?\d*)/.test(metricsAfter);
      await this.check('用例#API-PAY-107-①(API-PAY-107) 快速失败产生 redis_lock_acquire_fail{reason=timeout} 指标', async (): Promise<CheckResult> => ({
        expect: '存在 redis_lock_acquire_fail_total{reason="timeout"} 且计数>0',
        real: `命中=${timeoutFail}`,
        pass: timeoutFail,
      }));

      // 清理：把余额回补到基线（包含 setup、批次成功、普通加钱、重试成功）
      await this.restoreToBaseline('108');
      const final = await this.amount();
      await this.check('用例#API-PAY-108-①(API-PAY-108) 测试结束余额回补到基线', async (): Promise<CheckResult> => ({
        expect: `余额=${this.baseline.toFixed(2)}`,
        real: `余额=${Number.isFinite(final) ? final.toFixed(2) : String(final)}`,
        pass: final === this.baseline,
      }));
    } catch (e) {
      await this.restoreToBaseline('LOCK-ON-ERROR');
      await this.check('用例#API-PAY-101~108 执行异常', async (): Promise<CheckResult> => ({
        expect: '锁开启场景可完整执行',
        real: (e as Error).message,
        pass: false,
      }));
    }
  }

  private async skipCase(id: string, reason: string): Promise<void> {
    await this.check(`用例#API-PAY-${id}-①(API-PAY-${id}) 锁开启场景`, async (): Promise<CheckResult> => {
      this.skip(reason);
    });
  }

  private async add(amount: number, tag: string): Promise<{ transNo: string; response: PaymentResponse }> {
    const transNo = `TK249-${this.runId}-${tag}`;
    const response = await this.client.post(`${PREFIX}/addAccountMoney`, {
      param: { biz: BIZ, userId: USER_ID, transNo, amount, type: 'ADD_MONEY', remark: `TK-0249 ${tag}`, inDealType: 'coin' },
    });
    return { transNo, response };
  }

  private async amount(): Promise<number> {
    const r = await this.client.post(`${PREFIX}/getAmountByBiz`, { userId: USER_ID, biz: BIZ });
    return amountOf(r.body);
  }

  private async transResult(transNo: string, direction: 'IN' | 'OUT'): Promise<PaymentResponse> {
    return this.client.post(`${PREFIX}/getTransResult`, { param: { biz: BIZ, userId: USER_ID, transNo, direction, inDealType: 'coin' } });
  }

  private async metrics(): Promise<string> {
    const res = await fetch(`${this.client.host}/actuator/prometheus`, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(20_000),
    });
    return res.text();
  }

  private async restoreToBaseline(tag: string): Promise<void> {
    if (!Number.isFinite(this.baseline)) return;
    const current = await this.amount();
    if (!Number.isFinite(current)) return;
    const diff = Number((current - this.baseline).toFixed(2));
    if (Math.abs(diff) < 0.005) return;
    const amount = Math.abs(diff).toFixed(2);
    const transNo = `TK249-${this.runId}-CLEAN-${tag}`;
    const response = diff > 0
      ? await this.client.post(`${PREFIX}/subAccountMoney`, { param: { biz: BIZ, userId: USER_ID, transNo, amount: Number(amount), type: 'SUB_MONEY', remark: `TK-0249 cleanup ${tag}`, inDealType: 'coin' } })
      : await this.client.post(`${PREFIX}/addAccountMoney`, { param: { biz: BIZ, userId: USER_ID, transNo, amount: Number(amount), type: 'ADD_MONEY', remark: `TK-0249 cleanup ${tag}`, inDealType: 'coin' } });
    if (!isOk(response.body)) this.log(`清理失败 tag=${tag} response=${JSON.stringify(response.body)}`);
  }
}

const test = new PaymentRedisLockOnTest();
await test.execute();
