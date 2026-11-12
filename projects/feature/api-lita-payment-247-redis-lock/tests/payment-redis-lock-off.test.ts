/**
 * TK-0249 / 被测变更 TK-0247：lita-payment 余额变更接口 Redis 锁改造 · 锁关闭路径回归
 *
 * 用例来源：/task/20261112/TK-0247/API（接口说明）、TECH_DESIGN（Redis 锁技术方案）
 * 运行：LITA_PAYMENT_TRANS_PASSWORD=*** node payment-redis-lock-off.test.ts [--evidence-dir=...]
 * 环境：测试环境 https://lita-payment.test.cinta.team（默认，可用 LITA_PAYMENT_HOST 覆盖）
 * 账号：测试用户 7586，业务 gamecenter_baishun1043（与灰度配置 1043 一致）
 *
 * 说明：本文件只覆盖 redis-lock.enabled=false（默认开关关闭）时的接口兼容性/回归；
 *      锁开启路径见 payment-redis-lock-on.test.ts。所有写操作在 finally 中按基线回补。
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

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

class PaymentRedisLockOffTest extends CheckBaseClass {
  private readonly client: PaymentClient;
  private readonly evidenceDir: string;
  private readonly runId: string;
  private baseline = Number.NaN;

  constructor() {
    super();
    this.client = new PaymentClient();
    this.evidenceDir = resolve(arg('evidence-dir', join(process.cwd(), 'evidence', `tk0249-lock-off-${stamp()}`)));
    this.runId = process.env.LITA_PAYMENT_RUN_ID ?? stamp();
    this.total = 38;
  }

  async execute(): Promise<void> {
    mkdirSync(this.evidenceDir, { recursive: true });
    try {
      await super.execute();
    } finally {
      const file = join(this.evidenceDir, 'calls.json');
      writeFileSync(file, JSON.stringify({ task: 'TK-0249', case: 'redis-lock-off', host: this.client.host, runId: this.runId, calls: this.client.calls }, null, 2), 'utf8');
      this.log(`接口留痕文件: ${file}`);
    }
  }

  protected async run(): Promise<void> {
    this.baseline = await this.amount();
    if (!Number.isFinite(this.baseline)) {
      throw new Error('读取基线余额失败，无法继续');
    }
    await this.act('读取基线', async () => {
      this.log(`基线余额 userId=${USER_ID} biz=${BIZ} amount=${this.baseline.toFixed(2)}`);
    });

    await this.runCase('001', () => this.case001AddSuccess());
    await this.runCase('002', () => this.case002SubSuccess());
    await this.runCase('003', () => this.case003RefundSuccess());
    await this.runCase('004', () => this.case004AuthMissing());
    await this.runCase('005', () => this.case005AuthWrong());
    await this.runCase('006', () => this.case006AuthVersion());
    await this.runCase('007', () => this.case007AmountZero());
    await this.runCase('008', () => this.case008AmountNegative());
    await this.runCase('009', () => this.case009Insufficient());
    await this.runCase('010', () => this.case010MissingBiz());
    await this.runCase('011', () => this.case011MissingTransNo());
    await this.runCase('012', () => this.case012DuplicateAdd());
    await this.runCase('013', () => this.case013RefundNotFound());
    await this.runCase('014', () => this.case014ReadConsistency());
    await this.runCase('015', () => this.case015Cleanup());
  }

  private async runCase(id: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      await this.check(`用例#API-PAY-${id}-执行异常`, async (): Promise<CheckResult> => ({
        expect: '用例可执行且请求成功返回',
        real: (e as Error).message,
        pass: false,
      }));
    }
  }

  private transNo(tag: string): string {
    return `TK249-${this.runId}-${tag}`;
  }

  private async add(amount: number, tag: string): Promise<{ transNo: string; response: PaymentResponse }> {
    const transNo = this.transNo(tag);
    const response = await this.client.post(`${PREFIX}/addAccountMoney`, {
      param: { biz: BIZ, userId: USER_ID, transNo, amount, type: 'ADD_MONEY', remark: `TK-0249 ${tag}`, inDealType: 'coin' },
    });
    return { transNo, response };
  }

  private async sub(amount: number, tag: string): Promise<{ transNo: string; response: PaymentResponse }> {
    const transNo = this.transNo(tag);
    const response = await this.client.post(`${PREFIX}/subAccountMoney`, {
      param: { biz: BIZ, userId: USER_ID, transNo, amount, type: 'SUB_MONEY', remark: `TK-0249 ${tag}`, inDealType: 'coin' },
    });
    return { transNo, response };
  }

  private async refund(sourceTransNo: string, tag: string): Promise<PaymentResponse> {
    return this.client.post(`${PREFIX}/refund`, {
      param: { biz: BIZ, userId: USER_ID, transNo: sourceTransNo, type: 'SUB_MONEY', remark: `TK-0249 ${tag}`, message: `TK-0249 ${tag}` },
    });
  }

  private async amount(): Promise<number> {
    const r = await this.client.post(`${PREFIX}/getAmountByBiz`, { userId: USER_ID, biz: BIZ });
    return amountOf(r.body);
  }

  private async transResult(transNo: string, direction: 'IN' | 'OUT'): Promise<PaymentResponse> {
    return this.client.post(`${PREFIX}/getTransResult`, {
      param: { biz: BIZ, userId: USER_ID, transNo, direction, inDealType: 'coin' },
    });
  }

  private async restoreToBaseline(tag: string): Promise<void> {
    if (!Number.isFinite(this.baseline)) return;
    const current = await this.amount();
    if (!Number.isFinite(current)) {
      this.log(`清理跳过：读取余额失败 tag=${tag}`);
      return;
    }
    const diff = Number((current - this.baseline).toFixed(2));
    if (Math.abs(diff) < 0.005) return;
    const amount = Math.abs(diff).toFixed(2);
    const transNo = this.transNo(`CLEAN-${tag}`);
    const response = diff > 0
      ? await this.client.post(`${PREFIX}/subAccountMoney`, { param: { biz: BIZ, userId: USER_ID, transNo, amount: Number(amount), type: 'SUB_MONEY', remark: `TK-0249 cleanup ${tag}`, inDealType: 'coin' } })
      : await this.client.post(`${PREFIX}/addAccountMoney`, { param: { biz: BIZ, userId: USER_ID, transNo, amount: Number(amount), type: 'ADD_MONEY', remark: `TK-0249 cleanup ${tag}`, inDealType: 'coin' } });
    if (!isOk(response.body)) {
      this.log(`清理失败 tag=${tag} diff=${diff} response=${JSON.stringify(response.body)}`);
    }
  }

  private async ensureAtLeast(min: number, tag: string): Promise<void> {
    const current = await this.amount();
    if (current >= min) return;
    const need = Number((min - current).toFixed(2));
    const r = await this.add(need, `${tag}-SETUP`);
    if (!isOk(r.response.body)) {
      throw new Error(`造数失败：${tag} 需要 ${need}，response=${JSON.stringify(r.response.body)}`);
    }
  }

  private async case001AddSuccess(): Promise<void> {
    const before = await this.amount();
    try {
      const { transNo, response } = await this.add(0.01, '001-ADD');
      const data = response.body?.data ?? {};
      await this.check('用例#API-PAY-001-①(API-PAY-001) addAccountMoney 成功返回 state=OK 且 data.status=OK', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=OK，data.status=OK',
        real: `HTTP ${response.httpStatus}，state=${businessState(response.body)}，data.status=${String(data.status)}`,
        pass: response.httpStatus === 200 && isOk(response.body),
      }));
      await this.check('用例#API-PAY-001-②(API-PAY-001) 成功响应余额与订单号符合约定', async (): Promise<CheckResult> => {
        const residue = Number(data?.residueAmounts?.coin);
        const expected = Number((before + 0.01).toFixed(2));
        const orderOk = String(data?.orderNo ?? '').includes(`${BIZ}_${USER_ID}_${transNo}_`);
        return {
          expect: `residueAmounts.coin=${expected.toFixed(2)}，orderNo 含 ${BIZ}_${USER_ID}_${transNo}_`,
          real: `residueAmounts.coin=${data?.residueAmounts?.coin}，orderNo=${data?.orderNo}`,
          pass: residue === expected && orderOk,
        };
      });
      await this.check('用例#API-PAY-001-③(API-PAY-001) 加钱后 getAmountByBiz 余额同步增加', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return {
          expect: `余额=${(before + 0.01).toFixed(2)}`,
          real: `余额=${Number.isFinite(after) ? after.toFixed(2) : String(after)}`,
          pass: after === Number((before + 0.01).toFixed(2)),
        };
      });
      await this.check('用例#API-PAY-001-④(API-PAY-001) getTransResult 可查到该笔加钱交易且 status=OK', async (): Promise<CheckResult> => {
        const r = await this.transResult(transNo, 'IN');
        return {
          expect: 'state=OK，data.status=OK，orderNo 与加钱响应一致',
          real: `state=${businessState(r.body)}，data.status=${String(r.body?.data?.status)}，orderNo=${r.body?.data?.orderNo}`,
          pass: businessState(r.body) === 'OK' && r.body?.data?.status === 'OK' && r.body?.data?.orderNo === data?.orderNo,
        };
      });
    } finally {
      await this.restoreToBaseline('001');
    }
  }

  private async case002SubSuccess(): Promise<void> {
    try {
      await this.ensureAtLeast(0.01, '002');
      const before = await this.amount();
      const { transNo, response } = await this.sub(0.01, '002-SUB');
      const data = response.body?.data ?? {};
      await this.check('用例#API-PAY-002-①(API-PAY-002) subAccountMoney 成功返回 state=OK 且 data.status=OK', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=OK，data.status=OK',
        real: `HTTP ${response.httpStatus}，state=${businessState(response.body)}，data.status=${String(data.status)}`,
        pass: response.httpStatus === 200 && isOk(response.body),
      }));
      await this.check('用例#API-PAY-002-②(API-PAY-002) 扣钱金额与剩余余额符合约定', async (): Promise<CheckResult> => {
        const deduct = Number(data?.deductAmounts?.coin);
        const residue = Number(data?.residueAmounts?.coin);
        const expected = Number((before - 0.01).toFixed(2));
        return {
          expect: `deductAmounts.coin=0.01，residueAmounts.coin=${expected.toFixed(2)}`,
          real: `deductAmounts.coin=${data?.deductAmounts?.coin}，residueAmounts.coin=${data?.residueAmounts?.coin}`,
          pass: deduct === 0.01 && residue === expected,
        };
      });
      await this.check('用例#API-PAY-002-③(API-PAY-002) 扣钱后 getAmountByBiz 余额同步减少', async (): Promise<CheckResult> => {
        const after = await this.amount();
        const expected = Number((before - 0.01).toFixed(2));
        return {
          expect: `余额=${expected.toFixed(2)}`,
          real: `余额=${Number.isFinite(after) ? after.toFixed(2) : String(after)}`,
          pass: after === expected,
        };
      });
      await this.check('用例#API-PAY-002-④(API-PAY-002) getTransResult 可查到该笔扣钱交易且 status=OK', async (): Promise<CheckResult> => {
        const r = await this.transResult(transNo, 'OUT');
        return {
          expect: 'state=OK，data.status=OK，orderNo 与扣钱响应一致',
          real: `state=${businessState(r.body)}，data.status=${String(r.body?.data?.status)}，orderNo=${r.body?.data?.orderNo}`,
          pass: businessState(r.body) === 'OK' && r.body?.data?.status === 'OK' && r.body?.data?.orderNo === data?.orderNo,
        };
      });
    } finally {
      await this.restoreToBaseline('002');
    }
  }

  private async case003RefundSuccess(): Promise<void> {
    try {
      await this.ensureAtLeast(0.01, '003');
      const before = await this.amount();
      const source = await this.sub(0.01, '003-SRC');
      if (!isOk(source.response.body)) {
        throw new Error(`退款前置扣钱失败：${JSON.stringify(source.response.body)}`);
      }
      const response = await this.refund(source.transNo, '003-REFUND');
      await this.check('用例#API-PAY-003-①(API-PAY-003) refund 成功返回 state=OK 且 data.status=OK', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=OK，data.status=OK，message=退款成功',
        real: `HTTP ${response.httpStatus}，state=${businessState(response.body)}，data.status=${String(response.body?.data?.status)}，message=${String(response.body?.msg)}`,
        pass: response.httpStatus === 200 && isOk(response.body) && String(response.body?.msg ?? '').includes('退款成功'),
      }));
      await this.check('用例#API-PAY-003-②(API-PAY-003) 退款后余额恢复到扣钱前', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return {
          expect: `余额=${before.toFixed(2)}`,
          real: `余额=${Number.isFinite(after) ? after.toFixed(2) : String(after)}`,
          pass: after === before,
        };
      });
      await this.check('用例#API-PAY-003-③(API-PAY-003) getTransResult 显示原扣钱交易为 REFUND', async (): Promise<CheckResult> => {
        const r = await this.transResult(source.transNo, 'OUT');
        return {
          expect: 'state=REFUND，data.status=REFUND',
          real: `state=${businessState(r.body)}，data.status=${String(r.body?.data?.status)}`,
          pass: businessState(r.body) === 'REFUND' && r.body?.data?.status === 'REFUND',
        };
      });
    } finally {
      await this.restoreToBaseline('003');
    }
  }

  private async case004AuthMissing(): Promise<void> {
    const before = await this.amount();
    try {
      const r = await this.client.post(`${PREFIX}/getAmountByBiz`, { userId: USER_ID, biz: BIZ }, { password: null });
      await this.check('用例#API-PAY-004-①(API-PAY-004) 缺少 password 头时拒绝访问且返回 400002', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=R_OPERATION_FAIL，status=400002，msg=operation failure',
        real: `HTTP ${r.httpStatus}，state=${businessState(r.body)}，status=${businessStatus(r.body)}，msg=${String(r.body?.msg)}`,
        pass: r.httpStatus === 200 && businessState(r.body) === 'R_OPERATION_FAIL' && businessStatus(r.body) === '400002' && String(r.body?.msg ?? '') === 'operation failure',
      }));
      await this.check('用例#API-PAY-004-②(API-PAY-004) 鉴权失败不改变余额', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return { expect: `余额=${before.toFixed(2)}`, real: `余额=${after.toFixed(2)}`, pass: after === before };
      });
    } finally {
      await this.restoreToBaseline('004');
    }
  }

  private async case005AuthWrong(): Promise<void> {
    const before = await this.amount();
    try {
      const r = await this.client.post(`${PREFIX}/getAmountByBiz`, { userId: USER_ID, biz: BIZ }, { password: `TK249-wrong-${this.runId}` });
      await this.check('用例#API-PAY-005-①(API-PAY-005) password 错误时拒绝访问且返回 400002', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=R_OPERATION_FAIL，status=400002',
        real: `HTTP ${r.httpStatus}，state=${businessState(r.body)}，status=${businessStatus(r.body)}`,
        pass: r.httpStatus === 200 && businessState(r.body) === 'R_OPERATION_FAIL' && businessStatus(r.body) === '400002',
      }));
      await this.check('用例#API-PAY-005-②(API-PAY-005) 鉴权失败不改变余额', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return { expect: `余额=${before.toFixed(2)}`, real: `余额=${after.toFixed(2)}`, pass: after === before };
      });
    } finally {
      await this.restoreToBaseline('005');
    }
  }

  private async case006AuthVersion(): Promise<void> {
    const before = await this.amount();
    try {
      const r = await this.client.post(`${PREFIX}/getAmountByBiz`, { userId: USER_ID, biz: BIZ }, { passwordVersion: '2' });
      await this.check('用例#API-PAY-006-①(API-PAY-006) passwordVersion=2 时拒绝访问且返回 400002', async (): Promise<CheckResult> => ({
        expect: 'HTTP 200，state=R_OPERATION_FAIL，status=400002',
        real: `HTTP ${r.httpStatus}，state=${businessState(r.body)}，status=${businessStatus(r.body)}`,
        pass: r.httpStatus === 200 && businessState(r.body) === 'R_OPERATION_FAIL' && businessStatus(r.body) === '400002',
      }));
      await this.check('用例#API-PAY-006-②(API-PAY-006) 鉴权失败不改变余额', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return { expect: `余额=${before.toFixed(2)}`, real: `余额=${after.toFixed(2)}`, pass: after === before };
      });
    } finally {
      await this.restoreToBaseline('006');
    }
  }

  private async case007AmountZero(): Promise<void> {
    const before = await this.amount();
    try {
      const { response } = await this.add(0, '007-AMT0');
      await this.check('用例#API-PAY-007-①(API-PAY-007) amount=0 被拒绝且返回 FAIL', async (): Promise<CheckResult> => ({
        expect: 'state=FAIL，data.status=FAIL，msg 含 amount 必须是大于0的数值',
        real: `state=${businessState(response.body)}，data.status=${String(response.body?.data?.status)}，msg=${String(response.body?.msg)}`,
        pass: businessState(response.body) === 'FAIL' && response.body?.data?.status === 'FAIL' && String(response.body?.msg ?? '').includes('amount 必须是大于0的数值'),
      }));
      await this.check('用例#API-PAY-007-②(API-PAY-007) amount=0 失败不改变余额', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return { expect: `余额=${before.toFixed(2)}`, real: `余额=${after.toFixed(2)}`, pass: after === before };
      });
    } finally {
      await this.restoreToBaseline('007');
    }
  }

  private async case008AmountNegative(): Promise<void> {
    const before = await this.amount();
    try {
      const { response } = await this.add(-1, '008-AMTNEG');
      await this.check('用例#API-PAY-008-①(API-PAY-008) amount=-1 被拒绝且返回 FAIL', async (): Promise<CheckResult> => ({
        expect: 'state=FAIL，data.status=FAIL，msg 含 amount 必须是大于0的数值',
        real: `state=${businessState(response.body)}，data.status=${String(response.body?.data?.status)}，msg=${String(response.body?.msg)}`,
        pass: businessState(response.body) === 'FAIL' && response.body?.data?.status === 'FAIL' && String(response.body?.msg ?? '').includes('amount 必须是大于0的数值'),
      }));
      await this.check('用例#API-PAY-008-②(API-PAY-008) amount=-1 失败不改变余额', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return { expect: `余额=${before.toFixed(2)}`, real: `余额=${after.toFixed(2)}`, pass: after === before };
      });
    } finally {
      await this.restoreToBaseline('008');
    }
  }

  private async case009Insufficient(): Promise<void> {
    const before = await this.amount();
    try {
      const { response } = await this.sub(999999.99, '009-INSUF');
      await this.check('用例#API-PAY-009-①(API-PAY-009) 余额不足时返回 LESS_MONEY', async (): Promise<CheckResult> => ({
        expect: 'state=LESS_MONEY，data.status=LESS_MONEY，msg 含 no account is available',
        real: `state=${businessState(response.body)}，data.status=${String(response.body?.data?.status)}，msg=${String(response.body?.msg)}`,
        pass: businessState(response.body) === 'LESS_MONEY' && response.body?.data?.status === 'LESS_MONEY' && String(response.body?.msg ?? '').includes('no account is available'),
      }));
      await this.check('用例#API-PAY-009-②(API-PAY-009) 余额不足失败不改变余额', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return { expect: `余额=${before.toFixed(2)}`, real: `余额=${after.toFixed(2)}`, pass: after === before };
      });
    } finally {
      await this.restoreToBaseline('009');
    }
  }

  private async case010MissingBiz(): Promise<void> {
    const before = await this.amount();
    try {
      const r = await this.client.post(`${PREFIX}/addAccountMoney`, {
        param: { userId: USER_ID, transNo: this.transNo('010-NOBIZ'), amount: 0.01, type: 'ADD_MONEY', remark: 'TK-0249 010', inDealType: 'coin' },
      });
      await this.check('用例#API-PAY-010-①(API-PAY-010) biz 缺失时返回 FAIL 且提示必填', async (): Promise<CheckResult> => ({
        expect: 'state=FAIL，data.status=FAIL，msg 含 biz 业务类型必填',
        real: `state=${businessState(r.body)}，data.status=${String(r.body?.data?.status)}，msg=${String(r.body?.msg)}`,
        pass: businessState(r.body) === 'FAIL' && r.body?.data?.status === 'FAIL' && String(r.body?.msg ?? '').includes('biz 业务类型必填'),
      }));
      await this.check('用例#API-PAY-010-②(API-PAY-010) biz 缺失失败不改变余额', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return { expect: `余额=${before.toFixed(2)}`, real: `余额=${after.toFixed(2)}`, pass: after === before };
      });
    } finally {
      await this.restoreToBaseline('010');
    }
  }

  private async case011MissingTransNo(): Promise<void> {
    const before = await this.amount();
    try {
      const r = await this.client.post(`${PREFIX}/addAccountMoney`, {
        param: { biz: BIZ, userId: USER_ID, amount: 0.01, type: 'ADD_MONEY', remark: 'TK-0249 011', inDealType: 'coin' },
      });
      await this.check('用例#API-PAY-011-①(API-PAY-011) transNo 缺失时返回 FAIL 且提示必填', async (): Promise<CheckResult> => ({
        expect: 'state=FAIL，data.status=FAIL，msg 含 transNo 交易流水号必填项',
        real: `state=${businessState(r.body)}，data.status=${String(r.body?.data?.status)}，msg=${String(r.body?.msg)}`,
        pass: businessState(r.body) === 'FAIL' && r.body?.data?.status === 'FAIL' && String(r.body?.msg ?? '').includes('transNo 交易流水号必填项'),
      }));
      await this.check('用例#API-PAY-011-②(API-PAY-011) transNo 缺失失败不改变余额', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return { expect: `余额=${before.toFixed(2)}`, real: `余额=${after.toFixed(2)}`, pass: after === before };
      });
    } finally {
      await this.restoreToBaseline('011');
    }
  }

  private async case012DuplicateAdd(): Promise<void> {
    const before = await this.amount();
    try {
      const first = await this.add(0.01, '012-DUP');
      const second = await this.client.post(`${PREFIX}/addAccountMoney`, {
        param: { biz: BIZ, userId: USER_ID, transNo: first.transNo, amount: 0.01, type: 'ADD_MONEY', remark: `TK-0249 012-DUP`, inDealType: 'coin' },
      });
      await this.check('用例#API-PAY-012-①(API-PAY-012) 首次加钱成功', async (): Promise<CheckResult> => ({
        expect: 'state=OK，data.status=OK',
        real: `state=${businessState(first.response.body)}，data.status=${String(first.response.body?.data?.status)}`,
        pass: isOk(first.response.body),
      }));
      await this.check('用例#API-PAY-012-②(API-PAY-012) 相同 biz+userId+transNo 重复加钱返回同一订单号', async (): Promise<CheckResult> => ({
        expect: `state=OK，orderNo=${String(first.response.body?.data?.orderNo)}`,
        real: `state=${businessState(second.body)}，orderNo=${String(second.body?.data?.orderNo)}`,
        pass: businessState(second.body) === 'OK' && second.body?.data?.orderNo === first.response.body?.data?.orderNo,
      }));
      await this.check('用例#API-PAY-012-③(API-PAY-012) 重复提交不重复入账', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return {
          expect: `余额=${(before + 0.01).toFixed(2)}`,
          real: `余额=${Number.isFinite(after) ? after.toFixed(2) : String(after)}`,
          pass: after === Number((before + 0.01).toFixed(2)),
        };
      });
      await this.check('用例#API-PAY-012-④(API-PAY-012) getAmountByBiz 与重复提交后的余额一致', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return {
          expect: `余额=${(before + 0.01).toFixed(2)}`,
          real: `余额=${after.toFixed(2)}`,
          pass: after === Number((before + 0.01).toFixed(2)),
        };
      });
    } finally {
      await this.restoreToBaseline('012');
    }
  }

  private async case013RefundNotFound(): Promise<void> {
    const before = await this.amount();
    try {
      const r = await this.refund(this.transNo('013-NOT-EXIST'), '013');
      await this.check('用例#API-PAY-013-①(API-PAY-013) 退款不存在的交易返回 NOT_FOUND', async (): Promise<CheckResult> => ({
        expect: 'state=NOT_FOUND，data.status=NOT_FOUND，msg 含 交易未成功, 退款失败',
        real: `state=${businessState(r.body)}，data.status=${String(r.body?.data?.status)}，msg=${String(r.body?.msg)}`,
        pass: businessState(r.body) === 'NOT_FOUND' && r.body?.data?.status === 'NOT_FOUND' && String(r.body?.msg ?? '').includes('交易未成功, 退款失败'),
      }));
      await this.check('用例#API-PAY-013-②(API-PAY-013) 退款不存在交易不改变余额', async (): Promise<CheckResult> => {
        const after = await this.amount();
        return { expect: `余额=${before.toFixed(2)}`, real: `余额=${after.toFixed(2)}`, pass: after === before };
      });
    } finally {
      await this.restoreToBaseline('013');
    }
  }

  private async case014ReadConsistency(): Promise<void> {
    try {
      const b = await this.amount();
      const map = await this.client.post(`${PREFIX}/getAccountMap`, { userId: USER_ID, dealTypes: ['coin'] });
      const byBiz = await this.client.post(`${PREFIX}/getAccountMapByBiz`, { userId: USER_ID, biz: BIZ });
      const byDeal = await this.client.post(`${PREFIX}/getAmountByDealTypes`, { userId: USER_ID, dealTypes: ['coin'] });
      await this.check('用例#API-PAY-014-①(API-PAY-014) getAccountMap 返回的 coin 余额与 getAmountByBiz 一致', async (): Promise<CheckResult> => {
        const v = Number(map.body?.data?.infos?.coin?.amount);
        return { expect: `coin=${b.toFixed(2)}`, real: `coin=${map.body?.data?.infos?.coin?.amount}`, pass: v === b };
      });
      await this.check('用例#API-PAY-014-②(API-PAY-014) getAccountMapByBiz 返回的 coin 余额与 getAmountByBiz 一致', async (): Promise<CheckResult> => {
        const v = Number(byBiz.body?.data?.infos?.coin?.amount);
        return { expect: `coin=${b.toFixed(2)}`, real: `coin=${byBiz.body?.data?.infos?.coin?.amount}`, pass: v === b };
      });
      await this.check('用例#API-PAY-014-③(API-PAY-014) getAmountByDealTypes 返回的 coin 余额与 getAmountByBiz 一致', async (): Promise<CheckResult> => {
        const v = Number(byDeal.body?.data?.amount);
        return { expect: `amount=${b.toFixed(2)}`, real: `amount=${byDeal.body?.data?.amount}`, pass: v === b };
      });
      await this.check('用例#API-PAY-014-④(API-PAY-014) 四个只读接口响应 state 均为 OK', async (): Promise<CheckResult> => {
        const states = [map, byBiz, byDeal].map((x) => businessState(x.body));
        return { expect: 'state=OK', real: `states=${states.join(',')}`, pass: states.every((s) => s === 'OK') };
      });
    } finally {
      await this.restoreToBaseline('014');
    }
  }

  private async case015Cleanup(): Promise<void> {
    const final = await this.amount();
    await this.check('用例#API-PAY-015-①(API-PAY-015) 测试结束后余额已回补到基线', async (): Promise<CheckResult> => ({
      expect: `余额=${this.baseline.toFixed(2)}`,
      real: `余额=${Number.isFinite(final) ? final.toFixed(2) : String(final)}`,
      pass: final === this.baseline,
    }));
  }
}

const test = new PaymentRedisLockOffTest();
await test.execute();
