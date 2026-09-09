import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import type { DrawResult } from '../../../../src/services/DidibusService.ts';
import {
  LOCALE,
  USER_A,
  MILEAGE_POOL_NAME,
  POOL_NORMAL,
  POOL_FLYING,
  TOPIC_SEND,
  TOPIC_RECV,
} from './_lib/constants.ts';
import { T_D1, localIso } from './_lib/times.ts';
import { int, uniq } from './_lib/helpers.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

const INIT_BALANCE = 100000;

/**
 * 004-draw —— 抽奖核心链路（扣费 + 里程必得 + bus 探索 + 探索不影响榜单 + 轮播）
 * 模拟时间：全部 T_D1。里程档位/奖池价格从配置动态读取（mod_common_award / m/lucky-gift/detail）。
 * v1.4.0 双 LuckydrawModule：每次 /draw 写 2 批抽奖记录（topic=lucky-gift 扣券 + topic=lucky-mileage 里程必得），
 * 两巴士里程奖池独立（bus.mileage.normal / bus.mileage.flying，档位各不相同）。
 */
class Draw004 extends DidibusTestBase {
  private tiers: Record<string, number[]> = { [POOL_NORMAL]: [], [POOL_FLYING]: [] };
  private priceNormal = 30;
  private priceFlying = 80;
  private draw1!: DrawResult;
  private draw2!: DrawResult;

  constructor() {
    super();
    this.total = 17;
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

    await this.act('清理 A 数据、历史发奖记录与 Redis', async () => {
      this.needActive();
      await this.didibus.cleanUsers([USER_A]);
      await this.didibus.cleanAwardRecords();
      await this.didibus.cleanRedis();
    });

    await this.act('读取里程档位配置（mod_common_award bus.mileage.normal / bus.mileage.flying）', async () => {
      this.needActive();
      for (const pool of [POOL_NORMAL, POOL_FLYING]) {
        const name = MILEAGE_POOL_NAME[pool];
        const rows = await this.didibus.queryAwardConfig(name);
        if (rows.length === 0) throw new Error(`预置数据缺失：mod_common_award ${name}`);
        this.tiers[pool] = uniq(rows.map((r) => int(r['award_count']))).sort((a, b) => a - b);
      }
      this.log(`里程档位：normal=${JSON.stringify(this.tiers[POOL_NORMAL])}，flying=${JSON.stringify(this.tiers[POOL_FLYING])}`);
    });

    await this.act('读取奖池价格（/m/lucky-gift/detail）', async () => {
      this.needActive();
      try {
        const d = await this.didibus.luckyGiftDetail(USER_A, LOCALE, this.ts());
        const pools = d['pools'] as Record<string, Record<string, unknown>> | undefined;
        const normal = pools?.[POOL_NORMAL];
        const flying = pools?.[POOL_FLYING];
        if (normal?.['price'] !== undefined) this.priceNormal = int(normal['price']);
        if (flying?.['price'] !== undefined) this.priceFlying = int(flying['price']);
        this.log(`奖池价格：normal=${this.priceNormal}，flying=${this.priceFlying}`);
      } catch (e) {
        this.log(`lucky-gift/detail 读取失败，使用默认价格 normal=30/flying=80：${(e as Error).message}`);
      }
    });

    await this.act(`准备余额 ${INIT_BALANCE} 券（MySQL 直写）`, async () => {
      this.needActive();
      await this.didibus.setTicketBalance(USER_A, LOCALE, INIT_BALANCE);
    });

    await this.act('普通巴士抽 1 次（pool=normal, count=1）', async () => {
      this.needActive();
      this.draw1 = await this.didibus.draw(USER_A, LOCALE, this.ts(), POOL_NORMAL, 1);
      this.log(`draw1: totalMileage=${this.draw1.totalMileage}，bus=${JSON.stringify(this.draw1.bus)}`);
    });

    await this.check('扣费：余额 = 初始 - normal 单价×1', async (): Promise<CheckResult> => {
      this.needActive();
      const expect = INIT_BALANCE - this.priceNormal;
      const real = await this.balance();
      return { expect: String(expect), real: String(real) };
    });

    await this.check('里程必得：totalMileage ∈ normal 档位集合 且 > 0', async (): Promise<CheckResult> => {
      this.needActive();
      const m = int(this.draw1.totalMileage);
      return {
        expect: `∈ ${JSON.stringify(this.tiers[POOL_NORMAL])}`,
        real: String(m),
        pass: m > 0 && this.tiers[POOL_NORMAL].includes(m),
      };
    });

    await this.check('抽奖记录：lucky-gift/lucky-mileage 各 1 批 + item 各 1 条，双 result 接口可查', async (): Promise<CheckResult> => {
      this.needActive();
      const records = await this.didibus.queryLuckydrawRecords(USER_A);
      const giftRec = records.find((r) => String(r['topic']) === 'lucky-gift');
      const mileageRec = records.find((r) => String(r['topic']) === 'lucky-mileage');
      if (!giftRec || !mileageRec || records.length !== 2) {
        return { expect: '2 批记录（lucky-gift + lucky-mileage）', real: `${records.length} 批`, pass: false };
      }
      const giftItems = await this.didibus.queryLuckydrawItems(giftRec['id'] as number);
      const mileageItems = await this.didibus.queryLuckydrawItems(mileageRec['id'] as number);
      const giftId = int(giftRec['id']);
      const mileageId = int(mileageRec['id']);
      // 里程 item 的 award_count 即本次抽中里程值，应与 totalMileage 一致
      const mileageSum = mileageItems.reduce((s, r) => s + int(r['award_count']), 0);
      let resultOk = false;
      let resultMsg = '';
      try {
        await this.didibus.luckyGiftResult(USER_A, LOCALE, this.ts(), POOL_NORMAL, giftId);
        await this.didibus.luckyMileageResult(USER_A, LOCALE, this.ts(), POOL_NORMAL, mileageId);
        resultOk = true;
      } catch (e) {
        resultMsg = (e as Error).message;
      }
      return {
        expect: `record=2、item=1+1、里程 item 里程和=${int(this.draw1.totalMileage)}、result 均可查`,
        real: `item=${giftItems.length}+${mileageItems.length}、里程和=${mileageSum}、result=${resultOk ? '可查' : `失败:${resultMsg}`}`,
        pass: giftItems.length === 1 && mileageItems.length === 1 && mileageSum === int(this.draw1.totalMileage) && resultOk,
      };
    });

    await this.check('bus 推进：oldDistance=0、newDistance=totalMileage，DB 里程一致', async (): Promise<CheckResult> => {
      this.needActive();
      const bus = this.draw1.bus;
      const rows = await this.didibus.queryBusDistance(USER_A);
      const dbDistance = rows.length > 0 ? int(rows[0]['distance']) : -1;
      const m = int(this.draw1.totalMileage);
      return {
        expect: `old=0, new=${m}, DB=${m}`,
        real: `old=${bus?.oldDistance}, new=${bus?.newDistance}, DB=${dbDistance}`,
        pass: int(bus?.oldDistance) === 0 && int(bus?.newDistance) === m && dbDistance === m,
      };
    });

    await this.act('飞行巴士抽 10 次（pool=flying, count=10）', async () => {
      this.needActive();
      this.draw2 = await this.didibus.draw(USER_A, LOCALE, this.ts(), POOL_FLYING, 10);
      this.log(`draw2: totalMileage=${this.draw2.totalMileage}，crossed=${JSON.stringify(this.draw2.bus?.crossed ?? [])}`);
    });

    await this.check('扣费：余额 = 初始 - normal×1 - flying×10', async (): Promise<CheckResult> => {
      this.needActive();
      const expect = INIT_BALANCE - this.priceNormal - this.priceFlying * 10;
      const real = await this.balance();
      return { expect: String(expect), real: String(real) };
    });

    await this.check('里程：flying×10 每次 ∈ flying 档位集合（item.award_count 逐条校验），bus 累计 = 两次之和', async (): Promise<CheckResult> => {
      this.needActive();
      const m2 = int(this.draw2.totalMileage);
      const flyingTiers = this.tiers[POOL_FLYING];
      const min = 10 * flyingTiers[0];
      const max = 10 * flyingTiers[flyingTiers.length - 1];
      const totalMiles = int(this.draw1.totalMileage) + m2;
      const rows = await this.didibus.queryBusDistance(USER_A);
      const dbDistance = rows.length > 0 ? int(rows[0]['distance']) : -1;
      // 逐条校验里程 item：flying×10 的里程记录应有 10 条 item，每条 ∈ flying 档位，和 = totalMileage
      const mileageRec = (await this.didibus.queryLuckydrawRecords(USER_A))
        .filter((r) => String(r['topic']) === 'lucky-mileage' && String(r['pool']) === POOL_FLYING)
        .pop();
      const items = mileageRec ? await this.didibus.queryLuckydrawItems(mileageRec['id'] as number) : [];
      const itemTiers = items.map((r) => int(r['award_count']));
      const itemsOk = items.length === 10 && itemTiers.every((t) => flyingTiers.includes(t))
        && itemTiers.reduce((s, t) => s + t, 0) === m2;
      return {
        expect: `totalMileage ∈ [${min}, ${max}]，10 条 item 均 ∈ ${JSON.stringify(flyingTiers)}，DB 累计=${totalMiles}`,
        real: `totalMileage=${m2}，item=${items.length} 条 ${itemsOk ? '全部符合' : `不符:${JSON.stringify(itemTiers)}`}，DB=${dbDistance}`,
        pass: m2 >= min && m2 <= max && itemsOk && dbDistance === totalMiles,
      };
    });

    await this.check('探索点发奖：crossed 点与 mod_bus_user_award 账本一一对应', async (): Promise<CheckResult> => {
      this.needActive();
      const crossed = [...(this.draw1.bus?.crossed ?? []), ...(this.draw2.bus?.crossed ?? [])];
      const awards = await this.didibus.queryBusAwards(USER_A);
      const crossedKeys = crossed.map((c) => `${c.mapName}#${c.stage}#${c.loopNo}`).sort();
      const awardKeys = awards.map((a) => `${a['map_name']}#${a['stage']}#${a['loop_no']}`).sort();
      return {
        expect: `crossed=${JSON.stringify(crossedKeys)}`,
        real: `award=${JSON.stringify(awardKeys)}`,
        pass: JSON.stringify(crossedKeys) === JSON.stringify(awardKeys),
        message: crossed.length === 0 ? '两次抽奖未越过任何探索点（里程过小或配置缺失）' : undefined,
      };
    });

    await this.check('探索点奖励发放：mod_common_award_record 条数 ≥ crossed 点数', async (): Promise<CheckResult> => {
      this.needActive();
      const crossed = [...(this.draw1.bus?.crossed ?? []), ...(this.draw2.bus?.crossed ?? [])];
      if (crossed.length === 0) this.skip('未越过探索点，无发奖可校验');
      const records = await this.didibus.queryAwardRecords({ topic: 'bus', player: USER_A });
      return {
        expect: `≥ ${crossed.length} 条（每个探索点 ≥1 条奖励）`,
        real: `${records.length} 条（biz+topic=bus）`,
        pass: records.length >= crossed.length,
      };
    });

    await this.check('探索获得礼物仅入背包：送礼/收礼总榜无变化（buff 倍率在赠送环节计入，见 003）', async (): Promise<CheckResult> => {
      this.needActive();
      // 需求口径（2026-09-09 确认）：探索发奖不造成 rank 变化；只有礼物被赠送时才按 coin×buff 计分
      const crossed = [...(this.draw1.bus?.crossed ?? []), ...(this.draw2.bus?.crossed ?? [])];
      if (crossed.length === 0) this.skip('未越过探索点');
      const send = await this.didibus.rankScoreOf(TOPIC_SEND, USER_A, LOCALE, this.ts());
      const recv = await this.didibus.rankScoreOf(TOPIC_RECV, USER_A, LOCALE, this.ts());
      return {
        expect: 'send=recv=0（不在榜）',
        real: `send=${send}，recv=${recv}`,
        pass: (send ?? 0) === 0 && (recv ?? 0) === 0,
        message: (send ?? 0) > 0 ? '探索发奖导致榜单加分——与需求口径不符（见 CASES.md 问题#8）' : undefined,
      };
    });

    await this.check('轮播：最新 1 条为本次飞行巴士 ×10 记录', async (): Promise<CheckResult> => {
      this.needActive();
      const list = await this.didibus.marquee(USER_A, LOCALE, this.ts());
      const latest = list[0];
      const ok = latest !== undefined
        && String(latest.playerId) === String(USER_A)
        && latest.pool === POOL_FLYING
        && int(latest.count) === 10;
      return {
        expect: `{playerId:${USER_A}, pool:${POOL_FLYING}, count:10}`,
        real: latest ? JSON.stringify(latest) : '轮播为空',
        pass: ok,
      };
    });
  }
}

await new Draw004().execute();
