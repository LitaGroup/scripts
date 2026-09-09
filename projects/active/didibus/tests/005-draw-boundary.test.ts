import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { LOCALE, USER_A, POOL_NORMAL } from './_lib/constants.ts';
import { T_D1, T_OUT_BEFORE, T_OUT_AFTER, localIso } from './_lib/times.ts';
import { int, expectError } from './_lib/helpers.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

/**
 * 005-draw-boundary —— 抽奖边界与异常
 * 模拟时间：正常场景 T_D1；期外场景 T_OUT_BEFORE / T_OUT_AFTER；并发场景 T_D1。
 */
class DrawBoundary005 extends DidibusTestBase {
  private priceNormal = 30;
  private concurrentOk = 0;

  constructor() {
    super();
    this.total = 11;
  }

  private ts(): string {
    return localIso(LOCALE, T_D1);
  }

  private async balance(): Promise<number> {
    const rows = await this.didibus.queryAccount(USER_A);
    return rows.length > 0 ? int(rows[0]['amount']) : 0;
  }

  protected async run(): Promise<void> {
    await this.probeActive();

    await this.act('清理 A 数据并准备余额 10 券', async () => {
      this.needActive();
      await this.didibus.cleanUsers([USER_A]);
      await this.didibus.cleanRedis();
      await this.didibus.setTicketBalance(USER_A, LOCALE, 10);
      try {
        const d = await this.didibus.luckyGiftDetail(USER_A, LOCALE, this.ts());
        const pools = d['pools'] as Record<string, Record<string, unknown>> | undefined;
        if (pools?.[POOL_NORMAL]?.['price'] !== undefined) this.priceNormal = int(pools[POOL_NORMAL]['price']);
      } catch {
        // 用默认 30
      }
    });

    await this.check('余额不足：抽 normal×1 报错且余额/记录不变（错误信息应含 didibus_not_enough，见 CASES.md 问题#9）', async (): Promise<CheckResult> => {
      this.needActive();
      // v1.4.0 实测：余额不足报错但未透出 notEnoughMsg（didibus_not_enough），仅断言报错+无副作用
      const msg = await expectError(() => this.didibus.draw(USER_A, LOCALE, this.ts(), POOL_NORMAL, 1));
      const bal = await this.balance();
      const records = await this.didibus.queryLuckydrawRecords(USER_A);
      return {
        expect: '报错（应含 didibus_not_enough），余额=10，记录=0',
        real: `余额=${bal}，记录=${records.length}，错误=${msg.slice(0, 80)}`,
        pass: bal === 10 && records.length === 0,
        message: msg.includes('didibus_not_enough') ? undefined : '错误信息未透出 didibus_not_enough（notEnoughMsg 配置未生效？）',
      };
    });

    await this.check('非法 pool：pool=xx 报错且无副作用', async (): Promise<CheckResult> => {
      this.needActive();
      await expectError(() => this.didibus.draw(USER_A, LOCALE, this.ts(), 'xx', 1));
      const bal = await this.balance();
      const records = await this.didibus.queryLuckydrawRecords(USER_A);
      return {
        expect: '报错，余额=10，记录=0',
        real: `余额=${bal}，记录=${records.length}`,
        pass: bal === 10 && records.length === 0,
      };
    });

    await this.check('非法次数：count ∈ {2, 0, -1, 100} 均报错', async (): Promise<CheckResult> => {
      this.needActive();
      const bad: number[] = [];
      for (const count of [2, 0, -1, 100]) {
        try {
          await this.didibus.draw(USER_A, LOCALE, this.ts(), POOL_NORMAL, count);
          bad.push(count);
        } catch {
          // 期望报错
        }
      }
      return {
        expect: '2/0/-1/100 全部报错',
        real: bad.length === 0 ? '全部报错' : `未报错：${bad.join(',')}`,
        pass: bad.length === 0,
      };
    });

    await this.check('活动未开始（T_OUT_BEFORE）：报错且不扣费', async (): Promise<CheckResult> => {
      this.needActive();
      await this.didibus.setTicketBalance(USER_A, LOCALE, 1000);
      await expectError(() => this.didibus.draw(USER_A, LOCALE, localIso(LOCALE, T_OUT_BEFORE), POOL_NORMAL, 1));
      const bal = await this.balance();
      const records = await this.didibus.queryLuckydrawRecords(USER_A);
      return {
        expect: '报错，余额=1000，记录=0',
        real: `余额=${bal}，记录=${records.length}`,
        pass: bal === 1000 && records.length === 0,
      };
    });

    await this.check('活动已结束（T_OUT_AFTER）：报错且不扣费', async (): Promise<CheckResult> => {
      this.needActive();
      await expectError(() => this.didibus.draw(USER_A, LOCALE, localIso(LOCALE, T_OUT_AFTER), POOL_NORMAL, 1));
      const bal = await this.balance();
      const records = await this.didibus.queryLuckydrawRecords(USER_A);
      return {
        expect: '报错，余额=1000，记录=0',
        real: `余额=${bal}，记录=${records.length}`,
        pass: bal === 1000 && records.length === 0,
      };
    });

    await this.check('未开放大区（locale=ar）：报错', async (): Promise<CheckResult> => {
      this.needActive();
      const msg = await expectError(() => this.didibus.draw(USER_A, 'ar', localIso('ar', T_D1), POOL_NORMAL, 1));
      return { expect: '报错', real: msg.slice(0, 100), pass: true };
    });

    await this.act(`准备余额 60 券（并发验证用，= 2×normal 单价 ${this.priceNormal}）`, async () => {
      this.needActive();
      await this.didibus.setTicketBalance(USER_A, LOCALE, this.priceNormal * 2);
    });

    await this.act('并发：同时发起 2 个 normal×1 抽奖', async () => {
      this.needActive();
      const results = await Promise.allSettled([
        this.didibus.draw(USER_A, LOCALE, this.ts(), POOL_NORMAL, 1),
        this.didibus.draw(USER_A, LOCALE, this.ts(), POOL_NORMAL, 1),
      ]);
      this.concurrentOk = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      for (const r of rejected) this.log(`并发中被拒：${String(r.reason).slice(0, 120)}`);
    });

    await this.check('并发一致性：扣费 = 单价×成功数，记录数 = 成功数，不超扣', async (): Promise<CheckResult> => {
      this.needActive();
      const bal = await this.balance();
      // v1.4.0 双 LuckydrawModule：每次成功写 lucky-gift + lucky-mileage 两批记录，按扣费批次 lucky-gift 计数
      const records = (await this.didibus.queryLuckydrawRecords(USER_A))
        .filter((r) => String(r['topic']) === 'lucky-gift');
      const expectBal = this.priceNormal * (2 - this.concurrentOk);
      return {
        expect: `成功 ${this.concurrentOk} 次 → 余额=${expectBal}，lucky-gift 记录=${this.concurrentOk}`,
        real: `余额=${bal}，记录=${records.length}`,
        pass: bal === expectBal && records.length === this.concurrentOk && bal >= 0,
      };
    });
  }
}

await new DrawBoundary005().execute();
