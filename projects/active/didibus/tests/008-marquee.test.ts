import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { LOCALE, USER_A, POOL_NORMAL } from './_lib/constants.ts';
import { T_D1, localIso } from './_lib/times.ts';
import { int } from './_lib/helpers.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

const DRAW_TIMES = 25;
const MARQUEE_MAX = 20;

/**
 * 008-marquee —— 轮播记录
 * 模拟时间：全部 T_D1。连续抽奖 25 次（normal×1），验证 LPUSH+LTRIM(0,19) 行为与大区隔离。
 */
class Marquee008 extends DidibusTestBase {
  constructor() {
    super();
    this.total = 7;
  }

  protected async run(): Promise<void> {
    await this.probeActive();

    await this.act('清理 A 数据与 Redis，准备余额 1000 券', async () => {
      this.needActive();
      await this.didibus.cleanUsers([USER_A]);
      await this.didibus.cleanRedis();
      await this.didibus.setTicketBalance(USER_A, LOCALE, 1000);
    });

    await this.act(`连续抽奖 ${DRAW_TIMES} 次（normal×1，locale=in）`, async () => {
      this.needActive();
      for (let i = 0; i < DRAW_TIMES; i++) {
        await this.didibus.draw(USER_A, LOCALE, localIso(LOCALE, T_D1), POOL_NORMAL, 1);
      }
    });

    await this.check(`条数上限：/marquee 返回 ≤ ${MARQUEE_MAX} 条（LTRIM 生效）`, async (): Promise<CheckResult> => {
      this.needActive();
      const list = await this.didibus.marquee(USER_A, LOCALE, localIso(LOCALE, T_D1));
      return {
        expect: `≤ ${MARQUEE_MAX} 条`,
        real: `${list.length} 条`,
        pass: list.length === MARQUEE_MAX,
      };
    });

    await this.check('顺序：最新记录在最前（LPUSH）', async (): Promise<CheckResult> => {
      this.needActive();
      const raw = await this.didibus.marqueeRaw(LOCALE);
      const apiList = await this.didibus.marquee(USER_A, LOCALE, localIso(LOCALE, T_D1));
      const firstApi = apiList[0];
      const firstRaw = raw.length > 0 ? (JSON.parse(raw[0]) as Record<string, unknown>) : null;
      const ok = firstApi !== undefined && firstRaw !== null
        && String(firstRaw['playerId']) === String(firstApi.playerId)
        && firstRaw['pool'] === firstApi.pool;
      return {
        expect: 'API 首条 = Redis List 首条',
        real: `api=${JSON.stringify(firstApi ?? null)}，redis=${raw[0] ?? '空'}`,
        pass: ok,
      };
    });

    await this.check('内容：每条含 playerId / pool / count', async (): Promise<CheckResult> => {
      this.needActive();
      const list = await this.didibus.marquee(USER_A, LOCALE, localIso(LOCALE, T_D1));
      const bad = list.filter(
        (it) => it.playerId === undefined || it.pool === undefined || it.count === undefined
          || String(it.playerId) !== String(USER_A) || it.pool !== POOL_NORMAL || int(it.count) !== 1,
      );
      return {
        expect: `全部 {playerId:${USER_A}, pool:${POOL_NORMAL}, count:1}`,
        real: bad.length === 0 ? `${list.length} 条均符合` : `${bad.length} 条不符：${JSON.stringify(bad[0])}`,
        pass: bad.length === 0 && list.length > 0,
      };
    });

    await this.check('大区隔离：vi 轮播为空', async (): Promise<CheckResult> => {
      this.needActive();
      const viList = await this.didibus.marquee(USER_A, 'vi', localIso('vi', T_D1));
      const viRaw = await this.didibus.marqueeRaw('vi');
      return {
        expect: 'vi API/Redis 均空',
        real: `api=${viList.length} 条，redis=${viRaw.length} 条`,
        pass: viList.length === 0 && viRaw.length === 0,
      };
    });
  }
}

await new Marquee008().execute();
