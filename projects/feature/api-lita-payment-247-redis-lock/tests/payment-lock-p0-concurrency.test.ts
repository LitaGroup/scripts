/**
 * TK-0251 / 被测变更 TK-0250：lita-payment 余额 Redis 锁 P0 审计整改
 * 阶段 C1/C2：同一用户并发互斥（P0-4/P0-7）
 *
 * 用例：API-LOCK-201 ~ 208
 * 前置：redis-lock.enabled=true，wait-ms 有界（建议 300），fail-fast=true；
 *      C1 白名单 A 或 C2 空白名单全量。B 在 C1 不加锁、C2 加锁。
 * 运行：
 *   LITA_PAYMENT_TRANS_PASSWORD=*** LITA_PAYMENT_GRAY_SCOPE=whitelist \
 *   LITA_PAYMENT_GRAY_USER_ID=7586 LITA_PAYMENT_NON_GRAY_USER_ID=7587 \
 *   node payment-lock-p0-concurrency.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CheckBaseClass, type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { PaymentClient, businessState, isOk } from './lib/payment-client.ts';
import {
  add,
  arg,
  classify,
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
  type BatchItem,
  type LockMetrics,
} from './lib/payment-lock-helpers.ts';

const BIZ = process.env.LITA_PAYMENT_BIZ ?? 'gamecenter_baishun1043';
const USER_A = envUserId('LITA_PAYMENT_GRAY_USER_ID', process.env.LITA_PAYMENT_TEST_USER_ID ?? '7586');
const USER_B = envUserId('LITA_PAYMENT_NON_GRAY_USER_ID');
const SCOPE = (arg('scope', process.env.LITA_PAYMENT_GRAY_SCOPE ?? 'whitelist') || 'whitelist').toLowerCase();
const CONCURRENCY = Number(process.env.LITA_PAYMENT_CONCURRENCY ?? '30');
const RUN_ID = process.env.LITA_PAYMENT_RUN_ID ?? stamp();
const EVIDENCE_DIR = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `tk0251-concurrency-${SCOPE}-${stamp()}`)));

if (SCOPE !== 'whitelist' && SCOPE !== 'all') {
  throw new Error(`LITA_PAYMENT_GRAY_SCOPE 必须是 whitelist 或 all，实际=${SCOPE}`);
}

class PaymentLockP0ConcurrencyTest extends CheckBaseClass {
  private readonly client: PaymentClient;
  private baselineA = Number.NaN;
  private baselineB = Number.NaN;
  private highConcurrencyItems: BatchItem[] = [];
  private metricSnapshots: Array<{ at: string; lock: LockMetrics }> = [];

  constructor() {
    super();
    this.client = new PaymentClient();
    this.total = 16;
  }

  async execute(): Promise<void> {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    try {
      await super.execute();
    } finally {
      writeFileSync(join(EVIDENCE_DIR, 'calls.json'), JSON.stringify({
        task: 'TK-0251', phase: `concurrency-${SCOPE}`, host: this.client.host, userA: USER_A, userB: USER_B,
        biz: BIZ, runId: RUN_ID, calls: this.client.calls,
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
      await this.case201DifferentTransNo();
      await this.case202SameTransNo();
      await this.case203AddAndSub();
      await this.case204AddAndRefund();
      await this.case205DifferentUsers();
      await this.case206HighConcurrency();
      await this.case207Transactions();
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, 'CONC-A-END');
      await restoreToBaseline(this.client, USER_B, BIZ, this.baselineB, RUN_ID, 'CONC-B-END');
    }
    await this.case208Cleanup();
  }

  private async case201DifferentTransNo(): Promise<void> {
    try {
      const before = await getAmount(this.client, USER_A, BIZ);
      const items = await Promise.all([
        add(this.client, USER_A, BIZ, RUN_ID, '201-A'),
        add(this.client, USER_A, BIZ, RUN_ID, '201-B'),
      ]);
      const summary = summarize(items);
      await this.check('用例#API-LOCK-201-①(API-LOCK-201) 同用户 2 并发 add（不同 transNo）仅返回 OK 或 BUSY', async (): Promise<CheckResult> => ({
        expect: 'total=2，other=0',
        real: `ok=${summary.ok.length}，busy=${summary.busy.length}，other=${summary.other.length}${summary.other.length ? '，sample=' + JSON.stringify(summary.other[0].response.body) : ''}`,
        pass: summary.other.length === 0 && summary.ok.length + summary.busy.length === 2,
      }));
      await this.check('用例#API-LOCK-201-②(API-LOCK-201) 余额与成功笔数一致且 BUSY 未入账', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        const expected = Number((before + 0.01 * summary.ok.length).toFixed(2));
        const details: string[] = [];
        let pass = after === expected;
        for (const item of summary.ok) {
          const r = await transResult(this.client, USER_A, BIZ, item.transNo, 'IN');
          const ok = businessState(r.body) === 'OK' && r.body?.data?.status === 'OK';
          if (!ok) { pass = false; details.push(`${item.transNo}:${JSON.stringify(r.body)}`); }
        }
        for (const item of summary.busy) {
          const r = await transResult(this.client, USER_A, BIZ, item.transNo, 'IN');
          const busyNotBooked = businessState(r.body) === 'NOT_FOUND' && r.body?.data?.status === 'NOT_FOUND';
          if (!busyNotBooked) { pass = false; details.push(`${item.transNo}:${JSON.stringify(r.body)}`); }
        }
        return {
          expect: `余额=${formatAmount(expected)}；OK 交易均可查，BUSY 交易均 NOT_FOUND`,
          real: `余额=${formatAmount(after)}；异常=${details.length}${details.length ? '，' + details.join(' | ') : ''}`,
          pass,
        };
      });
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '201');
    }
  }

  private async case202SameTransNo(): Promise<void> {
    try {
      const before = await getAmount(this.client, USER_A, BIZ);
      const items = await Promise.all([
        add(this.client, USER_A, BIZ, RUN_ID, '202-SAME'),
        add(this.client, USER_A, BIZ, RUN_ID, '202-SAME'),
      ]);
      const summary = summarize(items);
      const okItems = summary.ok;
      const orderNos = okItems.map((item) => String(item.response.body?.data?.orderNo ?? ''));
      const bothOkSameOrder = okItems.length === 2 && orderNos[0] !== '' && orderNos[0] === orderNos[1];
      const oneOk = okItems.length === 1;
      await this.check('用例#API-LOCK-202-①(API-LOCK-202) 相同 transNo 2 并发最多一笔成功或复用同一订单号', async (): Promise<CheckResult> => ({
        expect: 'other=0；1 笔 OK 或 2 笔 OK 且 orderNo 相同',
        real: `ok=${okItems.length}，busy=${summary.busy.length}，other=${summary.other.length}，orderNos=${orderNos.join(',')}`,
        pass: summary.other.length === 0 && (oneOk || bothOkSameOrder),
      }));
      await this.check('用例#API-LOCK-202-②(API-LOCK-202) 相同 transNo 并发只入账一次', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        const expected = Number((before + 0.01).toFixed(2));
        const target = okItems[0];
        let transOk = false;
        if (target) {
          const r = await transResult(this.client, USER_A, BIZ, target.transNo, 'IN');
          transOk = businessState(r.body) === 'OK' && r.body?.data?.status === 'OK';
        }
        return {
          expect: `余额=${formatAmount(expected)} 且 OK 交易可查`,
          real: `余额=${formatAmount(after)}，ok=${okItems.length}，busy=${summary.busy.length}，transOk=${transOk}`,
          pass: after === expected && transOk,
        };
      });
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '202');
    }
  }

  private async case203AddAndSub(): Promise<void> {
    try {
      let current = await getAmount(this.client, USER_A, BIZ);
      if (current < 0.01) {
        const seed = await add(this.client, USER_A, BIZ, RUN_ID, '203-SEED', 0.01);
        if (!isOk(seed.response.body)) throw new Error(`203 前置造数失败: ${JSON.stringify(seed.response.body)}`);
      }
      const before = await getAmount(this.client, USER_A, BIZ);
      const items = await Promise.all([
        add(this.client, USER_A, BIZ, RUN_ID, '203-ADD'),
        sub(this.client, USER_A, BIZ, RUN_ID, '203-SUB'),
      ]);
      const summary = summarize(items);
      const addItem = items.find((item) => item.tag === '203-ADD')!;
      const subItem = items.find((item) => item.tag === '203-SUB')!;
      const addOk = classify(addItem.response.body) === 'ok' ? 1 : 0;
      const subOk = classify(subItem.response.body) === 'ok' ? 1 : 0;
      await this.check('用例#API-LOCK-203-①(API-LOCK-203) 同用户并发 add+sub 仅返回 OK 或 BUSY，且至少一笔执行', async (): Promise<CheckResult> => ({
        expect: `other=0，ok>=1`,
        real: `ok=${summary.ok.length}，busy=${summary.busy.length}，other=${summary.other.length}${summary.other.length ? '，sample=' + JSON.stringify(summary.other[0].response.body) : ''}`,
        pass: summary.other.length === 0 && summary.ok.length >= 1,
      }));
      await this.check('用例#API-LOCK-203-②(API-LOCK-203) add+sub 并发后余额精确且不为负', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        const expected = Number((before + 0.01 * addOk - 0.01 * subOk).toFixed(2));
        return {
          expect: `余额=${formatAmount(expected)}（before ${formatAmount(before)} + add ${addOk} - sub ${subOk}）且>=0`,
          real: `余额=${formatAmount(after)}`,
          pass: after === expected && after >= 0,
        };
      });
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '203');
    }
  }

  private async case204AddAndRefund(): Promise<void> {
    try {
      let current = await getAmount(this.client, USER_A, BIZ);
      if (current < 0.01) {
        const seed = await add(this.client, USER_A, BIZ, RUN_ID, '204-SEED', 0.01);
        if (!isOk(seed.response.body)) throw new Error(`204 前置造数失败: ${JSON.stringify(seed.response.body)}`);
      }
      const source = await sub(this.client, USER_A, BIZ, RUN_ID, '204-SRC');
      if (!isOk(source.response.body)) throw new Error(`204 前置扣钱失败: ${JSON.stringify(source.response.body)}`);
      const before = await getAmount(this.client, USER_A, BIZ);
      const addItemPromise = add(this.client, USER_A, BIZ, RUN_ID, '204-ADD');
      const refundPromise = refund(this.client, USER_A, BIZ, source.transNo, '204-REFUND');
      const [addItem, refundResponse] = await Promise.all([addItemPromise, refundPromise]);
      const addOk = classify(addItem.response.body) === 'ok' ? 1 : 0;
      const refundOk = isOk(refundResponse.body) ? 1 : 0;
      const addOther = classify(addItem.response.body) === 'other';
      const refundOther = classify(refundResponse.body) === 'other';
      await this.check('用例#API-LOCK-204-①(API-LOCK-204) 同用户并发 add+refund 仅返回 OK 或 BUSY', async (): Promise<CheckResult> => ({
        expect: 'add 与 refund 均无 other 错误；refund 最多成功一次',
        real: `addOk=${addOk}，addState=${businessState(addItem.response.body)}，refundOk=${refundOk}，refundState=${businessState(refundResponse.body)}`,
        pass: !addOther && !refundOther && refundOk <= 1,
      }));
      await this.check('用例#API-LOCK-204-②(API-LOCK-204) add+refund 并发后余额精确且退款状态正确', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        const expected = Number((before + 0.01 * addOk + 0.01 * refundOk).toFixed(2));
        const r = await transResult(this.client, USER_A, BIZ, source.transNo, 'OUT');
        const refundStateOk = refundOk === 1
          ? businessState(r.body) === 'REFUND' && r.body?.data?.status === 'REFUND'
          : businessState(r.body) === 'OK' && r.body?.data?.status === 'OK';
        return {
          expect: `余额=${formatAmount(expected)}（before ${formatAmount(before)} + add ${addOk} + refund ${refundOk}）；refund 成功时原交易 REFUND，否则保持 OK`,
          real: `余额=${formatAmount(after)}，refundOk=${refundOk}，sourceState=${businessState(r.body)}/${String(r.body?.data?.status)}`,
          pass: after === expected && refundStateOk,
        };
      });
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '204');
    }
  }

  private async case205DifferentUsers(): Promise<void> {
    try {
      const beforeA = await getAmount(this.client, USER_A, BIZ);
      const beforeB = await getAmount(this.client, USER_B, BIZ);
      const items = await Promise.all([
        add(this.client, USER_A, BIZ, RUN_ID, '205-A'),
        add(this.client, USER_B, BIZ, RUN_ID, '205-B'),
      ]);
      const summary = summarize(items);
      await this.check('用例#API-LOCK-205-①(API-LOCK-205) 不同用户并发 add 均成功且无 BUSY', async (): Promise<CheckResult> => ({
        expect: '2 笔均 OK，无 BUSY/other',
        real: `ok=${summary.ok.length}，busy=${summary.busy.length}，other=${summary.other.length}${summary.other.length ? '，sample=' + JSON.stringify(summary.other[0].response.body) : ''}`,
        pass: summary.ok.length === 2 && summary.busy.length === 0 && summary.other.length === 0,
      }));
      await this.check('用例#API-LOCK-205-②(API-LOCK-205) 不同用户各自余额准确增加 0.01', async (): Promise<CheckResult> => {
        const afterA = await getAmount(this.client, USER_A, BIZ);
        const afterB = await getAmount(this.client, USER_B, BIZ);
        return {
          expect: `A=${formatAmount(beforeA + 0.01)}，B=${formatAmount(beforeB + 0.01)}`,
          real: `A=${formatAmount(afterA)}，B=${formatAmount(afterB)}`,
          pass: afterA === Number((beforeA + 0.01).toFixed(2)) && afterB === Number((beforeB + 0.01).toFixed(2)),
        };
      });
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '205-A');
      await restoreToBaseline(this.client, USER_B, BIZ, this.baselineB, RUN_ID, '205-B');
    }
  }

  private async case206HighConcurrency(): Promise<void> {
    try {
      const before = await getAmount(this.client, USER_A, BIZ);
      const m0 = await this.snapshot();
      const items = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) =>
        add(this.client, USER_A, BIZ, RUN_ID, `206-${i}`),
      ));
      const m1 = await this.snapshot();
      const d = metricsDelta(m0, m1);
      const summary = summarize(items);
      this.highConcurrencyItems = items;
      await this.check('用例#API-LOCK-206-①(API-LOCK-206) 同用户 30 并发 add 结果仅为 OK 或 BUSY', async (): Promise<CheckResult> => ({
        expect: `total=${CONCURRENCY}，other=0`,
        real: `ok=${summary.ok.length}，busy=${summary.busy.length}，other=${summary.other.length}${summary.other.length ? '，sample=' + JSON.stringify(summary.other[0].response.body) : ''}`,
        pass: summary.other.length === 0 && summary.ok.length + summary.busy.length === CONCURRENCY,
      }));
      await this.check('用例#API-LOCK-206-②(API-LOCK-206) 高并发后余额等于基线加成功笔数金额', async (): Promise<CheckResult> => {
        const after = await getAmount(this.client, USER_A, BIZ);
        const expected = Number((before + 0.01 * summary.ok.length).toFixed(2));
        return {
          expect: `余额=${formatAmount(expected)}（before ${formatAmount(before)} + 0.01×${summary.ok.length}）`,
          real: `余额=${formatAmount(after)}`,
          pass: after === expected,
        };
      });
      await this.check('用例#API-LOCK-206-③(API-LOCK-206) 高并发期间锁指标增量覆盖成功笔数', async (): Promise<CheckResult> => ({
        expect: `acquireDelta>=${summary.ok.length} 且 acquireDelta>0`,
        real: `acquireDelta=${d.acquire}，ok=${summary.ok.length}，busy=${summary.busy.length}，timeoutDelta=${d.timeout}`,
        pass: summary.ok.length > 0 && d.acquire > 0 && d.acquire >= summary.ok.length,
      }));
    } finally {
      await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, '206');
    }
  }

  private async case207Transactions(): Promise<void> {
    const summary = summarize(this.highConcurrencyItems);
    await this.check('用例#API-LOCK-207-①(API-LOCK-207) 并发后 OK 交易可查、BUSY 交易未入账', async (): Promise<CheckResult> => {
      const bad: string[] = [];
      for (const item of summary.ok) {
        const r = await transResult(this.client, USER_A, BIZ, item.transNo, 'IN');
        if (!(businessState(r.body) === 'OK' && r.body?.data?.status === 'OK')) bad.push(`${item.transNo}:${JSON.stringify(r.body)}`);
      }
      for (const item of summary.busy) {
        const r = await transResult(this.client, USER_A, BIZ, item.transNo, 'IN');
        if (!(businessState(r.body) === 'NOT_FOUND' && r.body?.data?.status === 'NOT_FOUND')) bad.push(`${item.transNo}:${JSON.stringify(r.body)}`);
      }
      return {
        expect: `ok=${summary.ok.length} 均可查，busy=${summary.busy.length} 均 NOT_FOUND`,
        real: `异常=${bad.length}${bad.length ? '，' + bad.slice(0, 5).join(' | ') : ''}`,
        pass: bad.length === 0,
      };
    });
    await this.check('用例#API-LOCK-207-②(API-LOCK-207) 并发成功后 orderNo 无重复', async (): Promise<CheckResult> => {
      const orderNos = summary.ok.map((item) => String(item.response.body?.data?.orderNo ?? ''));
      const unique = new Set(orderNos);
      return {
        expect: `ok=${orderNos.length}，orderNo 唯一数=${orderNos.length}`,
        real: `orderNo 唯一数=${unique.size}，空值=${orderNos.filter((x) => !x).length}`,
        pass: unique.size === orderNos.length && orderNos.every((x) => x.length > 0),
      };
    });
  }

  private async case208Cleanup(): Promise<void> {
    const resultA = await restoreToBaseline(this.client, USER_A, BIZ, this.baselineA, RUN_ID, 'CONC-208-A');
    const resultB = await restoreToBaseline(this.client, USER_B, BIZ, this.baselineB, RUN_ID, 'CONC-208-B');
    const finalA = await getAmount(this.client, USER_A, BIZ);
    const finalB = await getAmount(this.client, USER_B, BIZ);
    await this.check('用例#API-LOCK-208-①(API-LOCK-208) 并发阶段结束 A/B 余额回补至基线', async (): Promise<CheckResult> => ({
      expect: `A=${formatAmount(this.baselineA)}，B=${formatAmount(this.baselineB)}`,
      real: `A=${formatAmount(finalA)}（ok=${resultA.ok}），B=${formatAmount(finalB)}（ok=${resultB.ok}）`,
      pass: finalA === this.baselineA && finalB === this.baselineB && resultA.ok && resultB.ok,
    }));
  }
}

const test = new PaymentLockP0ConcurrencyTest();
await test.execute();
