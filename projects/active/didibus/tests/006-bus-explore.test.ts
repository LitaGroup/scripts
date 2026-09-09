import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import type { DrawResult } from '../../../../src/services/DidibusService.ts';
import { LOCALE, USER_A, POOL_FLYING } from './_lib/constants.ts';
import { T_D1, localIso } from './_lib/times.ts';
import { int, uniq } from './_lib/helpers.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

const INIT_BALANCE = 200000;
const MAX_DRAWS = 20;

interface MapInfo {
  name: string;
  distance: number;
  awardName: string;
  points: Array<{ distance: number; stage: number }>;
}

/**
 * 006-bus-explore —— 里程探索与循环
 * 模拟时间：全部 T_D1。反复抽飞行巴士（flying×50）累积里程，直到 map-1 被第二次越过（进入第二圈）。
 */
class BusExplore006 extends DidibusTestBase {
  private maps: MapInfo[] = [];
  private draws: DrawResult[] = [];

  constructor() {
    super();
    this.total = 10;
  }

  private ts(): string {
    return localIso(LOCALE, T_D1);
  }

  private allCrossed(): Array<{ mapName: string; stage: number; loopNo: number; awardName: string }> {
    return this.draws.flatMap((d) => d.bus?.crossed ?? []);
  }

  protected async run(): Promise<void> {
    await this.probeActive();

    await this.act('清理 A 数据与 Redis', async () => {
      this.needActive();
      await this.didibus.cleanUsers([USER_A]);
      await this.didibus.cleanRedis();
    });

    await this.act('读取地图配置（/m/bus/detail）', async () => {
      this.needActive();
      const d = await this.didibus.busDetail(USER_A, LOCALE, this.ts());
      const maps = (d['maps'] ?? []) as Array<Record<string, unknown>>;
      if (!Array.isArray(maps) || maps.length === 0) throw new Error('bus/detail 未返回地图配置');
      this.maps = maps.map((m) => ({
        name: String(m['name']),
        distance: int(m['distance']),
        awardName: String(m['awardName'] ?? `bus.${m['name']}`),
        points: ((m['points'] ?? []) as Array<Record<string, unknown>>).map((p) => ({ distance: int(p['distance']), stage: int(p['stage']) })),
      }));
      this.log(`地图：${this.maps.map((m) => `${m.name}=${m.distance}里程/${m.points.length}点`).join('，')}`);
    });

    await this.act(`准备余额 ${INIT_BALANCE} 券`, async () => {
      this.needActive();
      await this.didibus.setTicketBalance(USER_A, LOCALE, INIT_BALANCE);
    });

    await this.act(`循环抽奖 flying×50（上限 ${MAX_DRAWS} 次），直至 map-1 第二次越过`, async () => {
      this.needActive();
      const firstMap = this.maps[0].name;
      for (let i = 0; i < MAX_DRAWS; i++) {
        const d = await this.didibus.draw(USER_A, LOCALE, this.ts(), POOL_FLYING, 50);
        this.draws.push(d);
        const crossedCount = this.allCrossed().filter((c) => c.mapName === firstMap && c.stage === this.maps[0].points[0].stage).length;
        this.log(`第 ${i + 1} 抽：totalMileage=${d.totalMileage}，crossed=${(d.bus?.crossed ?? []).map((c) => `${c.mapName}#${c.stage}#loop${c.loopNo}`).join(',') || '无'}`);
        if (crossedCount >= 2) return;
      }
      throw new Error(`${MAX_DRAWS} 次抽奖后仍未进入第二圈（总里程过小）`);
    });

    await this.check('循环：map-1 首探索点被越过 2 次（loopNo 递增）', async (): Promise<CheckResult> => {
      this.needActive();
      const firstMap = this.maps[0].name;
      const firstStage = this.maps[0].points[0].stage;
      const hits = this.allCrossed().filter((c) => c.mapName === firstMap && c.stage === firstStage);
      const loops = uniq(hits.map((h) => h.loopNo)).sort((a, b) => a - b);
      return {
        expect: '≥2 次且 loopNo 递增',
        real: `${hits.length} 次，loopNo=${JSON.stringify(loops)}`,
        pass: hits.length >= 2 && loops.length >= 2,
      };
    });

    await this.check('里程记录一致：Σ delta = Σ totalMileage = DB distance，trans_no 唯一', async (): Promise<CheckResult> => {
      this.needActive();
      const sumMileage = this.draws.reduce((s, d) => s + int(d.totalMileage), 0);
      const records = await this.didibus.queryBusDistanceRecords(USER_A);
      const sumDelta = records.reduce((s, r) => s + int(r['delta_distance']), 0);
      const transNos = records.map((r) => String(r['trans_no']));
      const distRows = await this.didibus.queryBusDistance(USER_A);
      const dbDistance = distRows.length > 0 ? int(distRows[0]['distance']) : -1;
      const uniqueOk = uniq(transNos).length === transNos.length;
      return {
        expect: `Σdelta=${sumMileage}，DB=${sumMileage}，trans_no 唯一`,
        real: `Σdelta=${sumDelta}，DB=${dbDistance}，记录=${records.length} 条，trans_no 唯一=${uniqueOk}`,
        pass: sumDelta === sumMileage && dbDistance === sumMileage && uniqueOk && records.length === this.draws.length,
      };
    });

    await this.check('map-1 全部探索点 loop0 均已发奖', async (): Promise<CheckResult> => {
      this.needActive();
      const firstMap = this.maps[0];
      const awards = await this.didibus.queryBusAwards(USER_A);
      const missing = firstMap.points.filter(
        (p) => !awards.some((a) => String(a['map_name']) === firstMap.name && int(a['stage']) === p.stage && int(a['loop_no']) === 0),
      );
      return {
        expect: `${firstMap.name} loop0 全部 ${firstMap.points.length} 点`,
        real: missing.length === 0 ? '全部覆盖' : `缺失 stage=${missing.map((p) => p.stage).join('/')}`,
        pass: missing.length === 0,
      };
    });

    await this.check('循环重置：map-1 探索点 loop1 重新发奖', async (): Promise<CheckResult> => {
      this.needActive();
      const firstMap = this.maps[0];
      const awards = await this.didibus.queryBusAwards(USER_A);
      const loop1 = awards.filter((a) => String(a['map_name']) === firstMap.name && int(a['loop_no']) === 1);
      return {
        expect: `${firstMap.name} loop1 ≥1 条`,
        real: `${loop1.length} 条（stage=${loop1.map((a) => a['stage']).join(',')}）`,
        pass: loop1.length >= 1,
      };
    });

    await this.check('发奖幂等：每个 (map, stage, loop) 恰好 1 行账本', async (): Promise<CheckResult> => {
      this.needActive();
      const awards = await this.didibus.queryBusAwards(USER_A);
      const keys = awards.map((a) => `${a['map_name']}#${a['stage']}#${a['loop_no']}`);
      const dup = keys.length - uniq(keys).length;
      const crossedCount = this.allCrossed().length;
      return {
        expect: `账本=crossed 数=${crossedCount}，无重复`,
        real: `账本=${awards.length}，重复=${dup}`,
        pass: dup === 0 && awards.length === crossedCount,
      };
    });
  }
}

await new BusExplore006().execute();
