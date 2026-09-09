import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import type { DrawResult } from '../../../../src/services/DidibusService.ts';
import {
  LOCALE,
  USER_A,
  ACTIVITY_GIFTS,
  MILEAGE_NAME,
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
 * 004-draw —— 抽奖核心链路（扣费 + 里程必得 + bus 探索 + 榜单加成 + 轮播）
 * 模拟时间：全部 T_D1。里程档位/奖池价格从配置动态读取（mod_common_award / m/luckydraw/detail）。
 */
class Draw004 extends DidibusTestBase {
  private tiers: number[] = [];
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

    await this.act('清理 A 数据与 Redis', async () => {
      this.needActive();
      await this.didibus.cleanUsers([USER_A]);
      await this.didibus.cleanRedis();
    });

    await this.act('读取里程档位配置（mod_common_award DIDIBUS_MILEAGE）', async () => {
      this.needActive();
      const rows = await this.didibus.queryAwardConfig(MILEAGE_NAME);
      if (rows.length === 0) throw new Error('预置数据缺失：mod_common_award DIDIBUS_MILEAGE');
      this.tiers = uniq(rows.map((r) => int(r['award_count']))).sort((a, b) => a - b);
      this.log(`里程档位=${JSON.stringify(this.tiers)}`);
    });

    await this.act('读取奖池价格（/m/luckydraw/detail）', async () => {
      this.needActive();
      try {
        const d = await this.didibus.luckydrawDetail(USER_A, LOCALE, this.ts());
        const pools = d['pools'] as Record<string, Record<string, unknown>> | undefined;
        const normal = pools?.[POOL_NORMAL];
        const flying = pools?.[POOL_FLYING];
        if (normal?.['price'] !== undefined) this.priceNormal = int(normal['price']);
        if (flying?.['price'] !== undefined) this.priceFlying = int(flying['price']);
        this.log(`奖池价格：normal=${this.priceNormal}，flying=${this.priceFlying}`);
      } catch (e) {
        this.log(`luckydraw/detail 读取失败，使用默认价格 normal=30/flying=80：${(e as Error).message}`);
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

    await this.check('里程必得：totalMileage ∈ 配置档位集合 且 > 0', async (): Promise<CheckResult> => {
      this.needActive();
      const m = int(this.draw1.totalMileage);
      return {
        expect: `∈ ${JSON.stringify(this.tiers)}`,
        real: String(m),
        pass: m > 0 && this.tiers.includes(m),
      };
    });

    await this.check('抽奖记录：mod_luckydraw_record 1 批 + item 1 条，/m/luckydraw/result 可查', async (): Promise<CheckResult> => {
      this.needActive();
      const records = await this.didibus.queryLuckydrawRecords(USER_A);
      if (records.length !== 1) {
        return { expect: '1 批记录', real: `${records.length} 批`, pass: false };
      }
      const items = await this.didibus.queryLuckydrawItems(records[0]['id'] as number);
      const recordId = int(records[0]['id']);
      let resultOk = false;
      let resultMsg = '';
      try {
        await this.didibus.luckydrawResult(USER_A, LOCALE, this.ts(), POOL_NORMAL, recordId);
        resultOk = true;
      } catch (e) {
        resultMsg = (e as Error).message;
      }
      return {
        expect: 'record=1、item=1、result 可查',
        real: `record=${records.length}、item=${items.length}、result=${resultOk ? '可查' : `失败:${resultMsg}`}`,
        pass: items.length === 1 && resultOk,
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

    await this.check('里程：totalMileage ∈ [10×minTier, 10×maxTier]，bus 累计 = 两次之和', async (): Promise<CheckResult> => {
      this.needActive();
      const m2 = int(this.draw2.totalMileage);
      const min = 10 * this.tiers[0];
      const max = 10 * this.tiers[this.tiers.length - 1];
      const totalMiles = int(this.draw1.totalMileage) + m2;
      const rows = await this.didibus.queryBusDistance(USER_A);
      const dbDistance = rows.length > 0 ? int(rows[0]['distance']) : -1;
      return {
        expect: `totalMileage ∈ [${min}, ${max}]，DB 累计=${totalMiles}`,
        real: `totalMileage=${m2}，DB=${dbDistance}`,
        pass: m2 >= min && m2 <= max && dbDistance === totalMiles,
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
      const records = await this.didibus.queryAwardRecords({ player: USER_A });
      const busAwards = records.filter((r) => String(r['topic']).startsWith('bus.'));
      return {
        expect: `≥ ${crossed.length} 条（每个探索点 ≥1 条奖励）`,
        real: `${busAwards.length} 条（topic=bus.*）`,
        pass: busAwards.length >= crossed.length,
      };
    });

    await this.check('榜单加成：crossed 白名单礼物 buff 加到送礼/收礼总榜', async (): Promise<CheckResult> => {
      this.needActive();
      const crossed = [...(this.draw1.bus?.crossed ?? []), ...(this.draw2.bus?.crossed ?? [])];
      if (crossed.length === 0) this.skip('未越过探索点');
      const giftIds = Object.keys(ACTIVITY_GIFTS).map(Number);
      if (giftIds.length === 0) this.skip('活动礼物 ID 待提供（无法计算 buff 期望）');
      let expectBuff = 0;
      for (const c of crossed) {
        const rows = await this.didibus.queryAwardConfig(c.awardName);
        for (const r of rows) {
          if (int(r['stage']) !== c.stage) continue;
          if (String(r['award_type']) !== 'GIFT') continue;
          const buff = ACTIVITY_GIFTS[int(r['award_id'])];
          if (buff !== undefined) expectBuff += buff;
        }
      }
      const send = await this.didibus.rankScore(this.didibus.rankKey(LOCALE, TOPIC_SEND), USER_A);
      const recv = await this.didibus.rankScore(this.didibus.rankKey(LOCALE, TOPIC_RECV), USER_A);
      return {
        expect: `send=recv=${expectBuff}`,
        real: `send=${send}，recv=${recv}`,
        pass: (send ?? 0) === expectBuff && (recv ?? 0) === expectBuff,
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
