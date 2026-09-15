import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import type { DrawResult } from '../../../../src/services/DidibusService.ts';
import { DidibusTestBase } from '../tests/_lib/DidibusTestBase.ts';
import {
  LOCALE,
  ACTIVITY_GIFTS,
  POOL_NORMAL,
  POOL_FLYING,
  TOPIC_SEND,
  TOPIC_RECV,
  EXPECT_TICKET_PER_COIN_SENDER,
  EXPECT_TICKET_PER_COIN_RECEIVER,
} from '../tests/_lib/constants.ts';
import { T_D1, DAY1_KEY, localIso, localTs } from '../tests/_lib/times.ts';
import { int, pollUntil } from '../tests/_lib/helpers.ts';

/** 解析 --key=value 命令行参数 */
function argValue(key: string): string | undefined {
  const prefix = `--${key}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit === undefined ? undefined : hit.slice(prefix.length);
}

const UID = int(argValue('uid') ?? '3101'); // 造数目标用户
const PEER = int(argValue('peer') ?? '13125'); // 送礼对手方（收礼人/送礼人对照）
const INIT_BALANCE = 50000; // 抽奖前直写的探险券余额

/** 解析正整数参数，非法值抛错 */
function intArg(key: string, def: number): number {
  const raw = argValue(key);
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`参数 --${key}=${raw} 非法（需正整数）`);
  return n;
}

const FLYING_ROUNDS = intArg('flying-rounds', 3); // 飞行巴士 50 连抽轮数（累积里程、探索地图）

/** 抽奖计划：normal 覆盖全部 count 档位（奖池 options 仅支持 1/10/50），flying 多轮 50 连抽 */
const DRAW_PLAN: Array<{ pool: string; count: number }> = [
  { pool: POOL_NORMAL, count: 1 },
  { pool: POOL_NORMAL, count: 10 },
  { pool: POOL_NORMAL, count: 50 },
  ...Array.from({ length: FLYING_ROUNDS }, () => ({ pool: POOL_FLYING, count: 50 })),
];
/** 抽奖总消耗（按默认价格预估，实际扣费以 detail 价格为准） */
const DRAW_COST = DRAW_PLAN.reduce((s, p) => s + p.count * (p.pool === POOL_NORMAL ? 30 : 80), 0);

/** 送礼计划（礼物须在活动白名单 ACTIVITY_GIFTS 内）：UID 为主视角，3 笔送出 + 1 笔收到 */
const GIFT_PLAN = [
  { from: UID, to: PEER, giftId: 1001, totalCoin: 100 },
  { from: UID, to: PEER, giftId: 1005, totalCoin: 500 },
  { from: UID, to: PEER, giftId: 1003, totalCoin: 1000 },
  { from: PEER, to: UID, giftId: 1002, totalCoin: 300 },
];

/**
 * seed —— didibus-v202609 用户测试数据一键造数（开发/联调用，非自动化用例）
 * 运行：node projects/active/didibus/data/seed.ts [--uid=3101] [--peer=13125] [--flying-rounds=3]
 * 造数内容：
 * 1. /p/init 初始化轮次 + /enter 每日进入发券
 * 2. 送礼数据：真实 gift_send 消息链路（发券 + 送礼总榜/日榜 + 收礼总榜，禁直写）
 * 3. 地图/里程数据：直写余额后多轮抽奖（mod_luckydraw_record 双批次、
 *    mod_bus_user_distance[_record] 里程、mod_bus_user_award 探索点发奖）
 * 模拟时间固定为活动第 1 天 T_D1。
 */
class DidibusSeed extends DidibusTestBase {
  private enterTickets = 0;
  private prices: Record<string, number> = { [POOL_NORMAL]: 30, [POOL_FLYING]: 80 };
  private draws: DrawResult[] = [];

  constructor() {
    super();
    this.total = 14 + DRAW_PLAN.length;
  }

  private ts(): string {
    return localIso(LOCALE, T_D1);
  }

  private crossedDesc(d: DrawResult): string {
    return (d.bus?.crossed ?? []).map((c) => `${c.mapName}#${c.stage}#loop${c.loopNo}`).join(',') || '无';
  }

  protected async run(): Promise<void> {
    if (UID === PEER) throw new Error(`uid 与 peer 不能相同（当前均为 ${UID}）`);
    await this.probeActive();

    await this.act('初始化活动轮次（/p/init round=1，幂等）', async () => {
      this.needActive();
      await this.didibus.initActivity(UID, LOCALE, this.ts(), 1);
    });

    await this.act(`清理旧数据（uid=${UID}、peer=${PEER} 的业务数据 + Redis 榜单）`, async () => {
      this.needActive();
      await this.didibus.cleanUsers([UID, PEER]);
      await this.didibus.cleanRedis();
    });

    await this.act('/enter 每日进入领券', async () => {
      this.needActive();
      const resp = await this.didibus.enter(UID, LOCALE, this.ts());
      this.enterTickets = int(resp.tickets);
      if (this.enterTickets <= 0) throw new Error(`/enter 返回 tickets=${this.enterTickets}，应大于 0`);
      this.log(`dailyEntryTickets=${this.enterTickets}`);
    });

    await this.act(`送礼数据：${UID} → ${PEER} 共 3 笔（100/500/1000 金币，真实 gift_send 链路）`, async () => {
      this.needActive();
      const invalid = GIFT_PLAN.filter((g) => ACTIVITY_GIFTS[g.giftId] === undefined);
      if (invalid.length > 0) this.skip(`礼物不在白名单：${invalid.map((g) => g.giftId).join(',')}（检查 ACTIVITY_GIFTS）`);
      for (const g of GIFT_PLAN.filter((x) => x.from === UID)) {
        const orderNo = await this.didibus.sendGift({
          sender: g.from,
          receiver: g.to,
          giftId: g.giftId,
          giftPrice: g.totalCoin,
          totalCoin: g.totalCoin,
          sendTimeMs: localTs(LOCALE, T_D1),
          debugTs: this.ts(),
          locale: LOCALE,
        });
        this.log(`${g.from} → ${g.to} giftId=${g.giftId} coin=${g.totalCoin} buff=${ACTIVITY_GIFTS[g.giftId]}，orderNo=${orderNo}`);
      }
    });

    await this.act(`收礼数据：${PEER} → ${UID} 1 笔（300 金币，${UID} 侧收礼榜/券）`, async () => {
      this.needActive();
      const g = GIFT_PLAN.find((x) => x.to === UID);
      if (!g) this.skip('送礼计划中无收礼条目');
      const orderNo = await this.didibus.sendGift({
        sender: g.from,
        receiver: g.to,
        giftId: g.giftId,
        giftPrice: g.totalCoin,
        totalCoin: g.totalCoin,
        sendTimeMs: localTs(LOCALE, T_D1),
        debugTs: this.ts(),
        locale: LOCALE,
      });
      this.log(`${g.from} → ${g.to} giftId=${g.giftId} coin=${g.totalCoin}，orderNo=${orderNo}`);
    });

    await this.check(`券余额：enter + 送礼(coin×${EXPECT_TICKET_PER_COIN_SENDER}) + 收礼(coin×${EXPECT_TICKET_PER_COIN_RECEIVER}) 入账`, async (): Promise<CheckResult> => {
      this.needActive();
      const sent = GIFT_PLAN.filter((g) => g.from === UID).reduce((s, g) => s + g.totalCoin, 0);
      const received = GIFT_PLAN.filter((g) => g.to === UID).reduce((s, g) => s + g.totalCoin, 0);
      const expectAmt = this.enterTickets + sent * EXPECT_TICKET_PER_COIN_SENDER + received * EXPECT_TICKET_PER_COIN_RECEIVER;
      const real = await pollUntil(
        async () => {
          const rows = await this.didibus.queryAccount(UID);
          return rows.length > 0 ? int(rows[0]['amount']) : 0;
        },
        (v) => v === expectAmt,
      );
      return { expect: String(expectAmt), real: String(real) };
    });

    await this.act(`直写余额补足至 ${INIT_BALANCE} 券（抽奖预计消耗约 ${DRAW_COST}）`, async () => {
      this.needActive();
      if (INIT_BALANCE <= DRAW_COST) throw new Error(`余额 ${INIT_BALANCE} 不足以覆盖抽奖消耗 ${DRAW_COST}，请调大 INIT_BALANCE`);
      await this.didibus.setTicketBalance(UID, LOCALE, INIT_BALANCE);
    });

    await this.act('读取奖池价格（/m/lucky-gift/detail）', async () => {
      this.needActive();
      try {
        const d = await this.didibus.luckyGiftDetail(UID, LOCALE, this.ts());
        const pools = d['pools'] as Record<string, Record<string, unknown>> | undefined;
        for (const pool of [POOL_NORMAL, POOL_FLYING]) {
          if (pools?.[pool]?.['price'] !== undefined) this.prices[pool] = int(pools[pool]['price']);
        }
      } catch (e) {
        this.log(`lucky-gift/detail 读取失败，使用默认价格 normal=30/flying=80：${(e as Error).message}`);
      }
      this.log(`奖池价格：normal=${this.prices[POOL_NORMAL]}，flying=${this.prices[POOL_FLYING]}`);
    });

    for (const [i, plan] of DRAW_PLAN.entries()) {
      await this.act(`抽奖 ${i + 1}/${DRAW_PLAN.length}：${plan.pool}×${plan.count}`, async () => {
        this.needActive();
        const d = await this.didibus.draw(UID, LOCALE, this.ts(), plan.pool, plan.count);
        this.draws.push(d);
        this.log(`${plan.pool}×${plan.count}: totalMileage=${d.totalMileage}，crossed=${this.crossedDesc(d)}`);
      });
    }

    await this.check(`抽奖扣费：余额 = ${INIT_BALANCE} - Σ(单价×次数)，共 ${DRAW_PLAN.length} 次调用`, async (): Promise<CheckResult> => {
      this.needActive();
      const expectAmt = INIT_BALANCE - DRAW_PLAN.reduce((s, p) => s + this.prices[p.pool] * p.count, 0);
      const rows = await this.didibus.queryAccount(UID);
      const real = rows.length > 0 ? int(rows[0]['amount']) : 0;
      return { expect: String(expectAmt), real: String(real) };
    });

    await this.check('里程一致性：ΣtotalMileage = DB distance = Σdelta，每抽 1 条记录且 trans_no 唯一', async (): Promise<CheckResult> => {
      this.needActive();
      const sumMileage = this.draws.reduce((s, d) => s + int(d.totalMileage), 0);
      const records = await this.didibus.queryBusDistanceRecords(UID);
      const sumDelta = records.reduce((s, r) => s + int(r['delta_distance']), 0);
      const distRows = await this.didibus.queryBusDistance(UID);
      const dbDistance = distRows.length > 0 ? int(distRows[0]['distance']) : -1;
      const transNos = records.map((r) => String(r['trans_no']));
      return {
        expect: `Σ=${sumMileage}，DB=${sumMileage}，记录=${this.draws.length} 条，trans_no 唯一`,
        real: `Σdelta=${sumDelta}，DB=${dbDistance}，记录=${records.length} 条，唯一=${transNos.length === new Set(transNos).size}`,
        pass: sumDelta === sumMileage && dbDistance === sumMileage && records.length === this.draws.length
          && transNos.length === new Set(transNos).size,
      };
    });

    await this.check('地图探索点：mod_bus_user_award 账本与 crossed 一一对应（含 loop）', async (): Promise<CheckResult> => {
      this.needActive();
      const crossed = this.draws.flatMap((d) => d.bus?.crossed ?? []);
      if (crossed.length === 0) this.skip('两次抽奖未越过任何探索点（里程过小或地图配置缺失）');
      const awards = await this.didibus.queryBusAwards(UID);
      const crossedKeys = crossed.map((c) => `${c.mapName}#${c.stage}#${c.loopNo}`).sort();
      const awardKeys = awards.map((a) => `${a['map_name']}#${int(a['stage'])}#${int(a['loop_no'])}`).sort();
      return {
        expect: JSON.stringify(crossedKeys),
        real: JSON.stringify(awardKeys),
        pass: JSON.stringify(crossedKeys) === JSON.stringify(awardKeys),
      };
    });

    await this.check(`榜单：送礼总榜/日榜(${DAY1_KEY})、收礼总榜 = Σcoin×buff`, async (): Promise<CheckResult> => {
      this.needActive();
      const expectSend = GIFT_PLAN.filter((g) => g.from === UID).reduce((s, g) => s + g.totalCoin * (ACTIVITY_GIFTS[g.giftId] ?? 1), 0);
      const expectRecv = GIFT_PLAN.filter((g) => g.to === UID).reduce((s, g) => s + g.totalCoin * (ACTIVITY_GIFTS[g.giftId] ?? 1), 0);
      const scores = await pollUntil(
        async () => [
          await this.didibus.rankScoreOf(TOPIC_SEND, UID, LOCALE, this.ts()),
          await this.didibus.rankScoreOf(TOPIC_SEND, UID, LOCALE, this.ts(), DAY1_KEY),
          await this.didibus.rankScoreOf(TOPIC_RECV, UID, LOCALE, this.ts()),
        ],
        ([s, sd, r]) => s === expectSend && sd === expectSend && r === expectRecv,
      );
      return {
        expect: `send=${expectSend}，send.${DAY1_KEY}=${expectSend}，recv=${expectRecv}`,
        real: `send=${scores[0]}，send.${DAY1_KEY}=${scores[1]}，recv=${scores[2]}`,
        pass: scores[0] === expectSend && scores[1] === expectSend && scores[2] === expectRecv,
      };
    });

    await this.act('输出造数汇总', async () => {
      this.needActive();
      const balRows = await this.didibus.queryAccount(UID);
      const balance = balRows.length > 0 ? int(balRows[0]['amount']) : 0;
      const logs = await this.didibus.queryAccountLogs(UID);
      const distRows = await this.didibus.queryBusDistance(UID);
      const distance = distRows.length > 0 ? int(distRows[0]['distance']) : 0;
      const awards = await this.didibus.queryBusAwards(UID);
      const byMap: Record<string, string[]> = {};
      for (const a of awards) {
        const k = String(a['map_name']);
        (byMap[k] ??= []).push(`stage${int(a['stage'])}#loop${int(a['loop_no'])}`);
      }
      const drawRecords = await this.didibus.queryLuckydrawRecords(UID);
      const giftBatches = drawRecords.filter((r) => String(r['topic']) === 'lucky-gift').length;
      const mileageBatches = drawRecords.filter((r) => String(r['topic']) === 'lucky-mileage').length;
      const marquee = await this.didibus.marquee(UID, LOCALE, this.ts());
      const sendTotal = await this.didibus.rankScoreOf(TOPIC_SEND, UID, LOCALE, this.ts());
      const recvTotal = await this.didibus.rankScoreOf(TOPIC_RECV, UID, LOCALE, this.ts());
      this.log(`[汇总] uid=${UID}，peer=${PEER}，模拟时间=${this.ts()}`);
      this.log(`[汇总] 探险券余额=${balance}，账户流水=${logs.length} 条`);
      this.log(`[汇总] 总里程=${distance}，探索点=${awards.length} 个：${Object.entries(byMap).map(([m, ps]) => `${m}[${ps.join(',')}]`).join('，') || '无'}`);
      this.log(`[汇总] 抽奖=${this.draws.length} 次，明细=${DRAW_PLAN.map((p) => `${p.pool}×${p.count}`).join(' + ')}（lucky-gift=${giftBatches} 批 / lucky-mileage=${mileageBatches} 批）`);
      this.log(`[汇总] 榜单：送礼总榜=${sendTotal}，收礼总榜=${recvTotal}`);
      this.log(`[汇总] 轮播=${marquee.length} 条，最新=${marquee.length > 0 ? JSON.stringify(marquee[0]) : '无'}`);
    });
  }
}

await new DidibusSeed().execute();
