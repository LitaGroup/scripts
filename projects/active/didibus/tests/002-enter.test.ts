import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { LOCALE, USER_A } from './_lib/constants.ts';
import { T_D1, T_D2, DAY1_KEY, localIso } from './_lib/times.ts';
import { int, pollUntil } from './_lib/helpers.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

/**
 * 002-enter —— 每日进入发券
 * 模拟时间：首次/同日再次=T_D1（第 1 天），跨天=T_D2（第 2 天）。
 * 链路：/enter → task.update(daily-entry, REPEAT) → settle 发 ACTIVE_COIN → active_user_account 入账。
 */
class Enter002 extends DidibusTestBase {
  private tickets = 0;

  constructor() {
    super();
    this.total = 10;
  }

  protected async run(): Promise<void> {
    await this.probeActive();

    await this.act('清理用户 A 数据', async () => {
      this.needActive();
      await this.didibus.cleanUsers([USER_A]);
    });

    await this.act('首次调用 /enter（T_D1）', async () => {
      this.needActive();
      const resp = await this.didibus.enter(USER_A, LOCALE, localIso(LOCALE, T_D1));
      this.tickets = int(resp.tickets);
      if (this.tickets <= 0) throw new Error(`/enter 返回 tickets=${this.tickets}，应大于 0`);
      this.log(`dailyEntryTickets=${this.tickets}`);
    });

    await this.check('账户余额增加 dailyEntryTickets', async (): Promise<CheckResult> => {
      this.needActive();
      const amount = await pollUntil(
        async () => {
          const rows = await this.didibus.queryAccount(USER_A);
          return rows.length > 0 ? int(rows[0]['amount']) : 0;
        },
        (v) => v === this.tickets,
      );
      return { expect: String(this.tickets), real: String(amount) };
    });

    await this.check(`任务记录：当日轮次（round=${DAY1_KEY}）condition=enter 已完成`, async (): Promise<CheckResult> => {
      this.needActive();
      const rows = await this.didibus.queryTaskRounds(USER_A);
      const day1 = rows.filter((r) => String(r['round']) === DAY1_KEY);
      const enter = day1.filter((r) => String(r['name']) === 'enter');
      const ok = enter.length === 1 && Number(enter[0]['value']) >= 1;
      return {
        expect: `round=${DAY1_KEY} name=enter 1 条且 value>=1`,
        real: enter.length === 0
          ? `无 enter 记录（${DAY1_KEY} 行：${day1.map((r) => r['name']).join(',') || '无'}；全部轮次：${rows.map((r) => String(r['round'])).join(',') || '空'}）`
          : `value=${enter[0]['value']}, value_step=${enter[0]['value_step']}, award_step=${enter[0]['award_step']}`,
        pass: ok,
      };
    });

    await this.act('同日再次调用 /enter（T_D1）', async () => {
      this.needActive();
      await this.didibus.enter(USER_A, LOCALE, localIso(LOCALE, T_D1));
    });

    await this.check('同日重复进入不重复发券（REPEAT maxTimes=1）', async (): Promise<CheckResult> => {
      this.needActive();
      const rows = await this.didibus.queryAccount(USER_A);
      const amount = rows.length > 0 ? int(rows[0]['amount']) : 0;
      return { expect: String(this.tickets), real: String(amount) };
    });

    await this.act('跨天调用 /enter（T_D2）', async () => {
      this.needActive();
      await this.didibus.enter(USER_A, LOCALE, localIso(LOCALE, T_D2));
    });

    await this.check('跨天进入触发新一轮发券（REPEAT 按日重置）', async (): Promise<CheckResult> => {
      this.needActive();
      const amount = await pollUntil(
        async () => {
          const rows = await this.didibus.queryAccount(USER_A);
          return rows.length > 0 ? int(rows[0]['amount']) : 0;
        },
        (v) => v === this.tickets * 2,
      );
      return { expect: String(this.tickets * 2), real: String(amount) };
    });

    await this.check('账户接口：/m/account/detail 余额与 /m/account/records 变动记录', async (): Promise<CheckResult> => {
      this.needActive();
      const detail = await this.didibus.accountDetail(USER_A, LOCALE, localIso(LOCALE, T_D2));
      const records = await this.didibus.accountRecords(USER_A, LOCALE, localIso(LOCALE, T_D2));
      const detailStr = JSON.stringify(detail);
      const balanceOk = detailStr.includes(String(this.tickets * 2));
      return {
        expect: `detail 含余额 ${this.tickets * 2}，records ≥2 条`,
        real: `balanceOk=${balanceOk}，records=${records.length} 条`,
        pass: balanceOk && records.length >= 2,
        message: balanceOk ? undefined : `detail=${detailStr.slice(0, 200)}`,
      };
    });
  }
}

await new Enter002().execute();
