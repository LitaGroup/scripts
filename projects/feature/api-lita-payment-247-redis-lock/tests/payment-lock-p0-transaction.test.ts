/**
 * TK-0251 / 被测变更 TK-0250：lita-payment 余额 Redis 锁 P0 审计整改
 * 阶段 C1/C2：事务边界（P0-4）
 *
 * 用例：API-LOCK-301 ~ 305
 * 目的：业务失败/参数失败后锁仍释放；成功响应后下一笔可立即获取锁。
 * 限制：接口层无法观察“提交/回滚完成后才释放”的顺序，API-LOCK-304 以 skip 记录，并引用
 *      TK-0250 P0-7 集成测试证据；引用不作为接口级通过结论。
 *
 * 运行：
 *   LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_USER_ID=7586 \
 *   node payment-lock-p0-transaction.test.ts
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
  restoreToBaseline,
  stamp,
  sub,
  type BatchItem,
} from './lib/payment-lock-helpers.ts';

const BIZ = process.env.LITA_PAYMENT_BIZ ?? 'gamecenter_baishun1043';
const USER_A = envUserId('LITA_PAYMENT_GRAY_USER_ID', process.env.LITA_PAYMENT_TEST_USER_ID ?? '7586');
const RUN_ID = process.env.LITA_PAYMENT_RUN_ID ?? stamp();
const EVIDENCE_DIR = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `tk0251-transaction-${stamp()}`)));

class PaymentLockP0TransactionTest extends CheckBaseClass {
  private readonly client: PaymentClient;
  private baselineA = Number.NaN;

  constructor() {
    super();
    this.client = new PaymentClient();
    this.total = 7;
  }

  async execute(): Promise<void> {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    try {
      await super.execute();
    } finally {
      writeFileSync(join(EVIDENCE_DIR, 'calls.json'), JSON.stringify({
        task: 'TK-0251', phase: 'transaction', host: this.client.host, userA: USER_A, biz: BIZ,
        runId: RUN_ID, calls: this.client.calls,
      }, null, 2), 'utf8');
      this.log(`证据目录: ${EVIDENCE_DIR}`);
    }
  }

  protected async run(): Promise<void> {
    this.baselineA = await getAmount(this.client, USER_A, BIZ);
    if (!Number.isFinite(this.baselineA)) throw new Error(`读取用户 ${USER_A} 基线余额失败`);
    await this.act('读取基线', async () => {
      this.log(`phase=transaction userA=${USER_A} baseline=${formatAmount(this.baselineA)} biz=${BIZ}`);
    });

    try {
      await this.case301RollbackRelease();
      await this.case302ValidationRelease();
      await this.case303SuccessReleaseSmoke();
      await this.case304CommitOrderLimit();
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, 'TX-END');
    }
    await this.case305Cleanup();
  }

  private async case301RollbackRelease(): Promise<void> {
    try {
      const before = await getAmount(this.client, USER_A, BIZ);
      const failed: BatchItem = await sub(this.client, USER_A, BIZ, RUN_ID, '301-INSUFFICIENT', 999999.99);
      await this.check('用例#API-LOCK-301-①(API-LOCK-301) 余额不足导致业务回滚且余额不变', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        const rejected = businessState(failed.response.body) === 'LESS_MONEY'
          && failed.response.body?.data?.status === 'LESS_MONEY'
          && String(failed.response.body?.msg ?? '').includes('no account is available');
        return {
          expect: 'state=LESS_MONEY，data.status=LESS_MONEY，余额不变',
          real: `state=${businessState(failed.response.body)}，data.status=${String(failed.response.body?.data?.status)}，余额=${formatAmount(after)}`,
          pass: rejected && after === before,
        };
      });
      const afterFailure = await add(this.client, USER_A, BIZ, RUN_ID, '301-AFTER-FAIL', 0.01);
      await this.check('用例#API-LOCK-301-②(API-LOCK-301) 回滚后锁已释放，下一笔 add 立即成功', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=OK，data.status=OK',
        real: `HTTP ${afterFailure.response.httpStatus}，state=${businessState(afterFailure.response.body)}，data.status=${String(afterFailure.response.body?.data?.status)}`,
        pass: afterFailure.response.httpStatus === 200 && isOk(afterFailure.response.body),
      }));
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '301');
    }
  }

  private async case302ValidationRelease(): Promise<void> {
    try {
      const before = await getAmount(this.client, USER_A, BIZ);
      const failed = await add(this.client, USER_A, BIZ, RUN_ID, '302-AMOUNT-ZERO', 0);
      await this.check('用例#API-LOCK-302-①(API-LOCK-302) amount=0 参数失败且余额不变', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        const rejected = businessState(failed.response.body) === 'FAIL'
          && failed.response.body?.data?.status === 'FAIL'
          && String(failed.response.body?.msg ?? '').includes('amount 必须是大于0的数值');
        return {
          expect: 'state=FAIL，data.status=FAIL，msg 含 amount 必须是大于0的数值，余额不变',
          real: `state=${businessState(failed.response.body)}，data.status=${String(failed.response.body?.data?.status)}，msg=${String(failed.response.body?.msg)}，余额=${formatAmount(after)}`,
          pass: rejected && after === before,
        };
      });
      const afterFailure = await add(this.client, USER_A, BIZ, RUN_ID, '302-AFTER-FAIL', 0.01);
      await this.check('用例#API-LOCK-302-②(API-LOCK-302) 参数失败后锁已释放，下一笔 add 立即成功', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=OK，data.status=OK',
        real: `HTTP ${afterFailure.response.httpStatus}，state=${businessState(afterFailure.response.body)}，data.status=${String(afterFailure.response.body?.data?.status)}`,
        pass: afterFailure.response.httpStatus === 200 && isOk(afterFailure.response.body),
      }));
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '302');
    }
  }

  private async case303SuccessReleaseSmoke(): Promise<void> {
    try {
      const before = await getAmount(this.client, USER_A, BIZ);
      const first = await add(this.client, USER_A, BIZ, RUN_ID, '303-FIRST', 0.01);
      const second = await add(this.client, USER_A, BIZ, RUN_ID, '303-SECOND', 0.01);
      await this.check('用例#API-LOCK-303-①(API-LOCK-303) 成功响应后下一笔 add 可立即获取锁', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        const expected = Number((before + 0.02).toFixed(2));
        return {
          expect: '两笔均 OK，余额=before+0.02（仅证明释放冒烟，不证明提交顺序）',
          real: `first=${businessState(first.response.body)}/${String(first.response.body?.data?.status)}，second=${businessState(second.response.body)}/${String(second.response.body?.data?.status)}，余额=${formatAmount(after)}`,
          pass: isOk(first.response.body) && isOk(second.response.body) && after === expected,
        };
      });
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '303');
    }
  }

  private async case304CommitOrderLimit(): Promise<void> {
    await this.check('用例#API-LOCK-304-①(API-LOCK-304) 锁释放发生在事务提交之后', async (): Promise<CheckResult> => {
      this.skip('接口层无法观察事务提交/回滚顺序；引用 TK-0250 P0-7 的 UserBalanceLockTransactionTest（commit→unlock、rollback→unlock）与 UserBalanceLockRedisIT，不替代接口级结论');
      return { expect: '', real: '', pass: false };
    });
  }

  private async case305Cleanup(): Promise<void> {
    const result = await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, 'TX-305');
    const final = await getAmount(this.client, USER_A, BIZ);
    await this.check('用例#API-LOCK-305-①(API-LOCK-305) 事务边界阶段结束余额回补至基线', async (): Promise<CheckResult> => ({
      expect: `余额=${formatAmount(this.baselineA)}，清理结果 ok=true`,
      real: `余额=${formatAmount(final)}，清理结果 ok=${result.ok}，action=${result.action}`,
      pass: final === this.baselineA && result.ok,
    }));
  }
}

const test = new PaymentLockP0TransactionTest();
await test.execute();
