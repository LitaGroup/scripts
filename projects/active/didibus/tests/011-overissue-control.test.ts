import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import type { DrawResult } from '../../../../src/services/DidibusService.ts';
import {
  LOCALE,
  USER_A,
  USER_B,
  POOL_NORMAL,
  POOL_FLYING,
  POOL_NAME_NORMAL,
  POOL_NAME_FLYING,
  SAMPLE_TICKET_GIFT,
  ALARM_INCOME_KEY,
} from './_lib/constants.ts';
import { T_D1, localIso, localTs } from './_lib/times.ts';
import { int, pollUntil } from './_lib/helpers.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

const INIT_BALANCE = 200000;
/** 单次送礼消耗（income 走真实链路：gift_send 消息 totalCoin） */
const SEND_COIN = 1000;
/** 超发造数倍率：expend = 消耗 × 1.03（≥102.5% 触发拦截） */
const OVER_SEED_RATIO = 1.03;
/** 需求新增2（2026-09-21）：支出÷消耗 ≥ 102.5% 时奖池不出 GIFT 奖励（含等于），回落 < 102.5% 后恢复 */
const RATIO_LIMIT = 1.025;
/** 恢复期抽样：按池内 GIFT 权重，抽 N 次至少中 1 次 GIFT 的概率 ≥ 99.9% */
const MISS_TOLERANCE = 0.001;
const BATCH = 50;
const MAX_BATCHES = 3;
const PRICE_FALLBACK: Record<string, number> = { [POOL_NORMAL]: 30, [POOL_FLYING]: 80 };

/** GIFT 类型判定（DB award_type / 响应 award.type，兼容 N-S- 前缀） */
function isGiftType(t: unknown): boolean {
  return /GIFT$/i.test(String(t));
}

/**
 * 011-overissue-control —— 超发风控（2026-09-21 需求新增2）
 * 消耗 income = 普通礼物（ticketGifts）消耗流水；支出 expend = 活动发出的所有背包礼物价值（有 ID）。
 * 支出÷消耗 ≥ 102.5% 时 lucky-gift 奖池不出 GIFT 奖励（里程/道具/探索点不受影响），回落 < 102.5% 后恢复。
 * 风控计数（框架 common:alarm 模式，与 crazy-lamb/floral-isle/loong_awaken/new_recharge 一致）：
 *   {biz}:common:alarm:income | {biz}:common:alarm:expend（Redis Hash，field=大区）。
 * 造数：income 走真实送礼链路（顺带验证登记），expend 用 Redis HSET 直写精确构造占比。
 * 前置：服务端已实现风控 + bus.normal/bus.flying 奖池预置完整（问题#19）；
 *       未实现时对应步骤 fail 并明确提示（充当验收用例）。
 */
class Overissue011 extends DidibusTestBase {
  private price: Record<string, number> = { ...PRICE_FALLBACK };
  private giftIds: Record<string, number[]> = {};
  private needBatches: Record<string, number> = {};
  /** 前置就绪位：null=未校验 / false=缺失（后续步骤 skip） */
  private envReady: boolean | null = null;
  private incomeReady: boolean | null = null;
  private suppressDraws: DrawResult[] = [];
  private restoreDraws: DrawResult[] = [];
  private koDraws: DrawResult[] = [];
  private boundaryDraw!: DrawResult;
  private restoreBaselineId = 0;
  private boundaryBaselineId = 0;
  private koBaselineId = 0;
  private restoreGiftIds: number[] = [];

  constructor() {
    super();
    this.total = 22;
  }

  private ts(locale = LOCALE): string {
    return localIso(locale, T_D1);
  }

  /** 前置就绪门（预置奖池 + income 登记），缺失则 skip 后续场景 */
  private needReady(): void {
    this.needActive();
    if (this.envReady === false) this.skip('奖池预置数据缺失（见前置校验步骤），无法验证超发拦截');
    if (this.incomeReady === false) this.skip('超发风控 income 未登记（需求未部署或 key 结构不符），后续场景跳过');
  }

  private async balance(): Promise<number> {
    const rows = await this.didibus.queryAccount(USER_A);
    return rows.length > 0 ? int(rows[0]['amount']) : 0;
  }

  /** 收集 lucky-gift 抽奖记录中的 GIFT item award_id（record_id > sinceRecordId 的新增部分） */
  private async giftItemIds(sinceRecordId = 0): Promise<number[]> {
    const records = await this.didibus.queryLuckydrawRecords(USER_A);
    const ids: number[] = [];
    for (const r of records) {
      if (String(r['topic']) !== 'lucky-gift') continue;
      if (int(r['id']) <= sinceRecordId) continue;
      const items = await this.didibus.queryLuckydrawItems(r['id'] as number);
      for (const i of items) {
        if (isGiftType(i['award_type'])) ids.push(int(i['award_id']));
      }
    }
    return ids;
  }

  private async maxGiftRecordId(): Promise<number> {
    const records = await this.didibus.queryLuckydrawRecords(USER_A);
    return records.filter((r) => String(r['topic']) === 'lucky-gift').reduce((m, r) => Math.max(m, int(r['id'])), 0);
  }

  /** 分批抽奖（每批 BATCH 次），响应出现 GIFT 即提前结束 */
  private async drawBatches(pool: string, locale: string, batches: number): Promise<DrawResult[]> {
    const draws: DrawResult[] = [];
    for (let i = 0; i < batches; i++) {
      const d = await this.didibus.draw(USER_A, locale, this.ts(locale), pool, BATCH);
      draws.push(d);
      if ((d.awards ?? []).some((a) => isGiftType(a.type))) break;
    }
    return draws;
  }

  private respGiftCount(draws: DrawResult[]): number {
    return draws.reduce((s, d) => s + (d.awards ?? []).filter((a) => isGiftType(a.type)).length, 0);
  }

  protected async run(): Promise<void> {
    await this.probeActive();

    await this.act('清理 A/B 数据、历史发奖记录与 Redis（含超发风控 alarm 计数）', async () => {
      this.needActive();
      await this.didibus.cleanUsers([USER_A, USER_B]);
      await this.didibus.cleanAwardRecords();
      await this.didibus.cleanRedis();
      await this.didibus.cleanAlarm();
    });

    await this.act('预置校验：读取奖池 GIFT 条目/权重与价格（bus.normal / bus.flying）', async () => {
      this.needActive();
      try {
        for (const pool of [POOL_NORMAL, POOL_FLYING]) {
          const name = pool === POOL_NORMAL ? POOL_NAME_NORMAL : POOL_NAME_FLYING;
          const rows = await this.didibus.queryAwardConfig(name);
          if (rows.length === 0) throw new Error(`预置数据缺失：${name} 为 0 条（init.sql 未重灌，见 CASES.md 问题#19），无法验证超发拦截`);
          const giftRows = rows.filter((r) => isGiftType(r['award_type']));
          if (giftRows.length === 0) throw new Error(`预置数据缺失：${name} 无 GIFT 条目，超发拦截无从验证`);
          this.giftIds[pool] = giftRows.map((r) => int(r['award_id']));
          const w = giftRows.reduce((s, r) => s + Number(r['weight']), 0);
          const need = w >= 1 ? 1 : Math.ceil(Math.log(MISS_TOLERANCE) / Math.log(1 - w));
          this.needBatches[pool] = Math.max(1, Math.min(MAX_BATCHES, Math.ceil(need / BATCH)));
          this.log(`${name}: GIFT=${JSON.stringify(this.giftIds[pool])}，权重和=${w.toFixed(4)}，恢复/隔离抽样 ${this.needBatches[pool]} 批×${BATCH} 次`);
        }
        try {
          const d = await this.didibus.luckyGiftDetail(USER_A, LOCALE, this.ts());
          const pools = d['pools'] as Record<string, Record<string, unknown>> | undefined;
          for (const pool of [POOL_NORMAL, POOL_FLYING]) {
            const p = pools?.[pool];
            if (p?.['price'] !== undefined) this.price[pool] = int(p['price']);
          }
        } catch (e) {
          this.log(`lucky-gift/detail 读取失败，使用默认价格：${(e as Error).message}`);
        }
        this.log(`奖池价格：normal=${this.price[POOL_NORMAL]}，flying=${this.price[POOL_FLYING]}`);
        this.envReady = true;
      } catch (e) {
        this.envReady = false;
        throw e;
      }
    });

    await this.act(`准备余额 ${INIT_BALANCE} 券（MySQL 直写）`, async () => {
      this.needReady();
      await this.didibus.setTicketBalance(USER_A, LOCALE, INIT_BALANCE);
    });

    await this.act(`真实送礼登记消耗：10797 × totalCoin=${SEND_COIN}（locale=in，T_D1）`, async () => {
      this.needReady();
      const orderNo = this.didibus.makeOrderNo('AI_DIDIBUS_OV1');
      await this.didibus.sendGift({
        sender: USER_A,
        receiver: USER_B,
        giftId: SAMPLE_TICKET_GIFT,
        giftPrice: 60,
        totalCoin: SEND_COIN,
        sendTimeMs: localTs(LOCALE, T_D1),
        orderNo,
        debugTs: this.ts(),
      });
    });

    await this.check(`income 登记消耗流水：真实送礼后 alarm income(in)=${SEND_COIN}`, async (): Promise<CheckResult> => {
      this.needActive();
      const income = await pollUntil(() => this.didibus.alarmIncome(LOCALE), (v) => v === SEND_COIN);
      const raw = await this.didibus.redis.hgetall(ALARM_INCOME_KEY);
      const keyExists = Object.keys(raw).length > 0;
      this.incomeReady = income === SEND_COIN;
      return {
        expect: `income(in)=${SEND_COIN}`,
        real: `income(in)=${income}${keyExists ? '' : `（key 不存在：${ALARM_INCOME_KEY}）`}`,
        pass: income === SEND_COIN,
        message: income !== SEND_COIN ? '消耗流水未登记：送礼 consumer 未写超发风控 income（需求未部署），或 key/field 与 {biz}:common:alarm:income 不符' : undefined,
      };
    });

    await this.act(`造数超发：直写 expend(in)=${Math.ceil(SEND_COIN * OVER_SEED_RATIO)}（支出占比 103% ≥ 102.5%）`, async () => {
      this.needReady();
      await this.didibus.seedAlarm(LOCALE, { expend: Math.ceil(SEND_COIN * OVER_SEED_RATIO) });
    });

    await this.act('超发状态下抽奖：普通巴士 ×50 + 飞行巴士 ×50', async () => {
      this.needReady();
      this.suppressDraws = [
        await this.didibus.draw(USER_A, LOCALE, this.ts(), POOL_NORMAL, BATCH),
        await this.didibus.draw(USER_A, LOCALE, this.ts(), POOL_FLYING, BATCH),
      ];
      this.log(`超发期 totalMileage：${this.suppressDraws.map((d) => int(d.totalMileage)).join(' / ')}`);
    });

    await this.check('超发拦截：100 次抽奖 0 条 GIFT 奖励（DB item + 响应 awards）', async (): Promise<CheckResult> => {
      this.needReady();
      if (this.suppressDraws.length < 2) throw new Error('抽奖步骤未完成，无法校验拦截');
      const dbIds = await this.giftItemIds();
      const respGift = this.respGiftCount(this.suppressDraws);
      return {
        expect: 'GIFT 奖励=0',
        real: `DB item=${dbIds.length}${dbIds.length > 0 ? `(${JSON.stringify(dbIds)})` : ''}，响应 awards=${respGift}`,
        pass: dbIds.length === 0 && respGift === 0,
        message: dbIds.length + respGift > 0 ? `超发占比 ≥102.5% 时仍发出 GIFT（池内 GIFT=${JSON.stringify(this.giftIds)}）：102.5% 拦截未实现或未生效` : undefined,
      };
    });

    await this.check('非礼物奖励不受影响：里程必得且扣费正确', async (): Promise<CheckResult> => {
      this.needReady();
      if (this.suppressDraws.length < 2) throw new Error('抽奖步骤未完成，无法校验');
      const expectBalance = INIT_BALANCE - this.price[POOL_NORMAL] * BATCH - this.price[POOL_FLYING] * BATCH;
      const real = await this.balance();
      const m1 = int(this.suppressDraws[0].totalMileage);
      const m2 = int(this.suppressDraws[1].totalMileage);
      return {
        expect: `余额=${expectBalance}，两池 totalMileage 均 > 0`,
        real: `余额=${real}，totalMileage=${m1} / ${m2}`,
        pass: real === expectBalance && m1 > 0 && m2 > 0,
        message: m1 === 0 || m2 === 0 ? '里程奖池不应受超发拦截影响（拦截范围仅 lucky-gift 奖池 GIFT）' : undefined,
      };
    });

    await this.act(`恢复驱动：再送 10797 × totalCoin=${SEND_COIN}（income(in)=2000，占比降至 51.5%）`, async () => {
      this.needReady();
      const orderNo = this.didibus.makeOrderNo('AI_DIDIBUS_OV2');
      await this.didibus.sendGift({
        sender: USER_A,
        receiver: USER_B,
        giftId: SAMPLE_TICKET_GIFT,
        giftPrice: 60,
        totalCoin: SEND_COIN,
        sendTimeMs: localTs(LOCALE, T_D1),
        orderNo,
        debugTs: this.ts(),
      });
    });

    await this.check('income 累计：alarm income(in)=2000', async (): Promise<CheckResult> => {
      this.needReady();
      const income = await pollUntil(() => this.didibus.alarmIncome(LOCALE), (v) => v === SEND_COIN * 2);
      return {
        expect: `income(in)=${SEND_COIN * 2}`,
        real: String(income),
        pass: income === SEND_COIN * 2,
      };
    });

    await this.act(`恢复后抽样抽奖：飞行巴士 ×50×${this.needBatches[POOL_FLYING] ?? MAX_BATCHES} 批（出现 GIFT 即止）`, async () => {
      this.needReady();
      this.restoreBaselineId = await this.maxGiftRecordId();
      this.restoreDraws = await this.drawBatches(POOL_FLYING, LOCALE, this.needBatches[POOL_FLYING] ?? MAX_BATCHES);
      this.log(`恢复期抽 ${this.restoreDraws.length} 批，totalMileage=${this.restoreDraws.map((d) => int(d.totalMileage)).join(' / ')}`);
    });

    await this.check('恢复：回落 <102.5% 后奖池重新发出 GIFT', async (): Promise<CheckResult> => {
      this.needReady();
      this.restoreGiftIds = await this.giftItemIds(this.restoreBaselineId);
      const respGift = this.respGiftCount(this.restoreDraws);
      const batches = this.needBatches[POOL_FLYING] ?? MAX_BATCHES;
      const inPool = this.restoreGiftIds.every((id) => (this.giftIds[POOL_FLYING] ?? []).includes(id));
      return {
        expect: `新增 GIFT item ≥1 且 award_id ∈ 飞行池 GIFT（${batches} 批×${BATCH} 次按权重 99.9% 置信度）`,
        real: `DB 新增=${JSON.stringify(this.restoreGiftIds)}，响应 awards=${respGift}（实际抽 ${this.restoreDraws.length * BATCH} 次）`,
        pass: this.restoreGiftIds.length >= 1 && inPool,
        message: this.restoreGiftIds.length === 0 ? '回落 <102.5% 后仍无 GIFT：恢复逻辑未实现，或 GIFT 权重过低导致抽样不足' : inPool ? undefined : 'GIFT award_id 不在飞行池配置内：发放口径异常',
      };
    });

    await this.check('支出登记：发出背包礼物后 expend(in) 增长（> 造数基线 1030）', async (): Promise<CheckResult> => {
      this.needReady();
      if (this.restoreGiftIds.length === 0) this.skip('恢复期未发出 GIFT，无支出登记可校验');
      const seeded = Math.ceil(SEND_COIN * OVER_SEED_RATIO);
      const expend = await pollUntil(() => this.didibus.alarmExpend(LOCALE), (v) => v > seeded);
      return {
        expect: `> ${seeded}`,
        real: String(expend),
        pass: expend > seeded,
        message: expend <= seeded ? '活动发出的背包礼物未登记支出：expend 口径缺失（需求：支出=消耗+所有发出的背包礼物）' : undefined,
      };
    });

    await this.act(`边界造数：直写 expend(in)=${Math.ceil(SEND_COIN * 2 * RATIO_LIMIT)}（2000×1.025，占比恰好等于阈值）并记录抽奖记录基线`, async () => {
      this.needReady();
      this.boundaryBaselineId = await this.maxGiftRecordId();
      await this.didibus.seedAlarm(LOCALE, { expend: Math.ceil(SEND_COIN * 2 * RATIO_LIMIT) });
    });

    await this.act('边界抽奖：普通巴士 ×50（占比=102.5%，应拦截）', async () => {
      this.needReady();
      this.boundaryDraw = await this.didibus.draw(USER_A, LOCALE, this.ts(), POOL_NORMAL, BATCH);
    });

    await this.check('边界拦截：支出÷消耗恰好 102.5%（≥ 含等于）仍不出 GIFT', async (): Promise<CheckResult> => {
      this.needReady();
      const newIds = await this.giftItemIds(this.boundaryBaselineId);
      const respGift = this.respGiftCount([this.boundaryDraw]);
      return {
        expect: '新增 GIFT=0（阈值含等于）',
        real: `DB 新增=${newIds.length}，响应 awards=${respGift}`,
        pass: newIds.length === 0 && respGift === 0,
        message: newIds.length + respGift > 0 ? '占比恰好 102.5% 未拦截：实现可能用了严格大于（>）或阈值口径不符' : undefined,
      };
    });

    await this.act('大区隔离造数：ko income=1000 / expend=1000（占比 100%，in 保持超发）', async () => {
      this.needReady();
      await this.didibus.seedAlarm('ko', { income: SEND_COIN, expend: SEND_COIN });
    });

    await this.act(`ko 大区抽样抽奖：飞行巴士 ×50×${this.needBatches[POOL_FLYING] ?? MAX_BATCHES} 批（locale=ko，出现 GIFT 即止）`, async () => {
      this.needReady();
      this.koBaselineId = await this.maxGiftRecordId();
      this.koDraws = await this.drawBatches(POOL_FLYING, 'ko', this.needBatches[POOL_FLYING] ?? MAX_BATCHES);
    });

    await this.check('大区隔离：ko 占比 100% 未超发 → GIFT 正常出现（不受 in 超发影响）', async (): Promise<CheckResult> => {
      this.needReady();
      const newIds = await this.giftItemIds(this.koBaselineId);
      const respGift = this.respGiftCount(this.koDraws);
      const batches = this.needBatches[POOL_FLYING] ?? MAX_BATCHES;
      return {
        expect: 'GIFT ≥1（in 超发不应影响 ko）',
        real: `DB 新增=${newIds.length}，响应 awards=${respGift}（实际抽 ${this.koDraws.length * BATCH} 次）`,
        pass: newIds.length + respGift > 0,
        message: newIds.length + respGift === 0 ? `ko 未超发却无 GIFT：大区隔离实现异常（in 超发串扰）或概率未命中（按权重 ${batches} 批×${BATCH} 次应达 99.9% 置信度）` : undefined,
      };
    });

    await this.act('收尾清理：测试用户数据与超发风控计数', async () => {
      await this.didibus.cleanUsers([USER_A, USER_B]);
      await this.didibus.cleanAlarm();
    });
  }
}

await new Overissue011().execute();
