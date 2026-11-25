import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { ALIAS, BIZ, IN, RUN_DEBUG_TS, queryModuleDetail, queryRank } from './_lib/pk2612.ts';

type Dict = Record<string, unknown>;

function detailOf(v: unknown): { biz?: string; key?: string; rounds?: unknown[] } | null {
  const d = (v as { detail?: unknown } | null)?.detail;
  return d && typeof d === 'object' ? (d as { biz?: string; key?: string; rounds?: unknown[] }) : null;
}

function mapDetails(data: unknown): Array<{ topic: string; biz: string; key: string; rounds: number }> {
  const out: Array<{ topic: string; biz: string; key: string; rounds: number }> = [];
  for (const [topic, value] of Object.entries((data ?? {}) as Dict)) {
    const d = detailOf(value);
    if (d) out.push({ topic, biz: String(d.biz ?? ''), key: String(d.key ?? ''), rounds: (d.rounds ?? []).length });
  }
  return out;
}

/**
 * TK-0649 / 2612 年度 PK：alias `/active/v3/pk/**` 接口用例。
 *
 * H5 入口使用 alias `pk`（router alias），本用例验证 alias 路由下 H5 实际消费的接口
 * 与完整 biz `pk-v202612` 行为一致，数据归属仍为 pk-v202612。
 */
class Pk2612AliasApi extends TestBaseClass {
  constructor() {
    super();
    this.total = 27;
  }

  protected async run(): Promise<void> {
    await this.check('alias active-gifts 返回 12 个礼物，4/4/4，special=2', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${ALIAS}/active-gifts`, {
        body: {},
        locale: IN,
        debugTimestamp: RUN_DEBUG_TS,
      })) as { gifts?: Array<{ stage?: number; special?: boolean }> };
      const gifts = data?.gifts ?? [];
      const stages = [0, 1, 2].map((s) => gifts.filter((g) => Number(g.stage) === s).length);
      const special = gifts.filter((g) => g.special === true).length;
      return {
        expect: 'total=12, stage0/1/2=4/4/4, special=2',
        real: `total=${gifts.length}, stage0/1/2=${stages.join('/')}, special=${special}`,
        pass: gifts.length === 12 && stages.every((n) => n === 4) && special === 2,
      };
    });

    await this.check('alias m/player_in_n_200/detail 返回 pk-v202612 主轮次与 4 个日榜', async (): Promise<CheckResult> => {
      const d = await queryModuleDetail(this.api, 'player_in_n_200', IN, RUN_DEBUG_TS, ALIAS);
      return {
        expect: `biz=${BIZ}, key=-, rounds=4`,
        real: d === null ? 'null' : `biz=${d.biz}, key=${d.key}, rounds=${(d.rounds ?? []).length}`,
        pass: d !== null && d.biz === BIZ && d.key === '-' && (d.rounds ?? []).length === 4,
      };
    });

    await this.check('alias m/player_in_1v1_100_46/detail 返回 8 个 1V1 轮次', async (): Promise<CheckResult> => {
      const d = await queryModuleDetail(this.api, 'player_in_1v1_100_46', IN, RUN_DEBUG_TS, ALIAS);
      const keys = (d?.rounds ?? []).map((r) => String((r as { key?: string }).key)).sort();
      const expected = [
        '2026122500', '2026122518', '2026122600', '2026122618',
        '2026122700', '2026122718', '2026122800', '2026122818',
      ];
      return {
        expect: `biz=${BIZ}, rounds=[${expected.join(',')}]`,
        real: d === null ? 'null' : `biz=${d.biz}, rounds=[${keys.join(',')}]`,
        pass: d !== null && d.biz === BIZ && keys.join(',') === expected.join(','),
      };
    });

    await this.check('alias p/player-detail 返回模块详情且全部归属 pk-v202612', async (): Promise<CheckResult> => {
      const data = await this.api.request(`active/v3/${ALIAS}/p/player-detail`, {
        body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS,
      });
      const details = mapDetails(data);
      const bad = details.filter((d) => d.biz !== BIZ || d.key !== '-');
      return {
        expect: `模块数 >= 8，全部 biz=${BIZ} key=-`,
        real: `模块数=${details.length}，异常=${bad.length}${bad.length ? `(${bad.slice(0, 3).map((d) => d.topic).join(',')})` : ''}`,
        pass: details.length >= 8 && bad.length === 0,
      };
    });

    await this.check('alias p/player-in-detail 返回印尼/非印尼陪陪阶段详情', async (): Promise<CheckResult> => {
      const data = await this.api.request(`active/v3/${ALIAS}/p/player-in-detail`, {
        body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS,
      });
      const details = mapDetails(data);
      const bad = details.filter((d) => d.biz !== BIZ || d.key !== '-');
      return {
        expect: `模块数 >= 8，全部 biz=${BIZ} key=-`,
        real: `模块数=${details.length}，异常=${bad.length}`,
        pass: details.length >= 8 && bad.length === 0,
      };
    });

    await this.check('alias p/family-detail 返回印尼家族阶段详情', async (): Promise<CheckResult> => {
      const data = await this.api.request(`active/v3/${ALIAS}/p/family-detail`, {
        body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS,
      });
      const details = mapDetails(data);
      const bad = details.filter((d) => d.biz !== BIZ || d.key !== '-');
      return {
        expect: `模块数 >= 5，全部 biz=${BIZ} key=-`,
        real: `模块数=${details.length}，异常=${bad.length}`,
        pass: details.length >= 5 && bad.length === 0,
      };
    });

    await this.check('alias p/room-detail 返回房间总榜详情', async (): Promise<CheckResult> => {
      const data = await this.api.request(`active/v3/${ALIAS}/p/room-detail`, {
        body: {}, locale: 'vi', debugTimestamp: RUN_DEBUG_TS,
      });
      const details = mapDetails(data);
      return {
        expect: `room 详情 biz=${BIZ} key=-`,
        real: details.length ? `${details[0].topic}/${details[0].biz}/${details[0].key}` : '空',
        pass: details.length >= 1 && details.every((d) => d.biz === BIZ && d.key === '-'),
      };
    });

    await this.check('alias p/player-awards 返回陪陪奖励详情', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${ALIAS}/p/player-awards`, {
        body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS,
      })) as Dict;
      const modules = Object.entries(data ?? {});
      const withAwards = modules.filter(([, v]) => {
        const awards = (v as { mainAwards?: unknown[] }).mainAwards;
        return Array.isArray(awards) && awards.length > 0;
      });
      return {
        expect: '模块数 >= 8 且 >=1 个有 mainAwards',
        real: `模块数=${modules.length}, 有奖励模块=${withAwards.length}`,
        pass: modules.length >= 8 && withAwards.length >= 1,
      };
    });

    await this.check('alias p/user-awards 返回用户榜奖励详情', async (): Promise<CheckResult> => {
      return this.expectAwardModule('p/user-awards', 'user', 'vi');
    });

    await this.check('alias p/room-awards 返回房间榜奖励详情', async (): Promise<CheckResult> => {
      return this.expectAwardModule('p/room-awards', 'room', 'vi');
    });

    await this.check('alias p/family-awards 返回家族榜奖励详情', async (): Promise<CheckResult> => {
      return this.expectAwardModule('p/family-awards', 'family', 'vi');
    });

    await this.check('alias p/couple-awards 返回 CP 榜奖励详情', async (): Promise<CheckResult> => {
      return this.expectAwardModule('p/couple-awards', 'couple', 'vi');
    });

    await this.check('alias m/user/detail 返回 17 个日榜', async (): Promise<CheckResult> => {
      const d = await queryModuleDetail(this.api, 'user', 'vi', RUN_DEBUG_TS, ALIAS);
      return {
        expect: `biz=${BIZ}, rounds=17`,
        real: d === null ? 'null' : `biz=${d.biz}, rounds=${(d.rounds ?? []).length}`,
        pass: d !== null && d.biz === BIZ && (d.rounds ?? []).length === 17,
      };
    });

    await this.check('alias m/couple/detail 返回 17 个日榜', async (): Promise<CheckResult> => {
      const d = await queryModuleDetail(this.api, 'couple', 'vi', RUN_DEBUG_TS, ALIAS);
      return {
        expect: `biz=${BIZ}, rounds=17`,
        real: d === null ? 'null' : `biz=${d.biz}, rounds=${(d.rounds ?? []).length}`,
        pass: d !== null && d.biz === BIZ && (d.rounds ?? []).length === 17,
      };
    });

    await this.check('alias m/room/detail 返回房间总榜主轮次', async (): Promise<CheckResult> => {
      const d = await queryModuleDetail(this.api, 'room', 'vi', RUN_DEBUG_TS, ALIAS);
      return {
        expect: `biz=${BIZ}, key=-`,
        real: d === null ? 'null' : `biz=${d.biz}, key=${d.key}`,
        pass: d !== null && d.biz === BIZ && d.key === '-',
      };
    });

    await this.check('alias m/family/detail 返回家族总榜主轮次', async (): Promise<CheckResult> => {
      const d = await queryModuleDetail(this.api, 'family', 'vi', RUN_DEBUG_TS, ALIAS);
      return {
        expect: `biz=${BIZ}, key=-`,
        real: d === null ? 'null' : `biz=${d.biz}, key=${d.key}`,
        pass: d !== null && d.biz === BIZ && d.key === '-',
      };
    });

    await this.check('alias m/player_in_n_200/rank 返回主轮次（榜单可为空）', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${ALIAS}/m/player_in_n_200/rank`, {
        body: { key: '-', count: 10, locale: null, includeMine: false },
        locale: IN, debugTimestamp: RUN_DEBUG_TS,
      })) as { round?: { biz?: string; key?: string }; rankResult?: unknown[] };
      const round = data?.round;
      return {
        expect: `round.biz=${BIZ}, round.key=-`,
        real: `biz=${String(round?.biz ?? 'null')}, key=${String(round?.key ?? 'null')}, rankResult=${data?.rankResult?.length ?? 'null'}`,
        pass: String(round?.biz ?? '') === BIZ && String(round?.key ?? '') === '-',
      };
    });

    await this.check('alias m/user/rank 返回 20261219 日榜结构', async (): Promise<CheckResult> => {
      const resp = await queryRank(this.api, 'user', '20261219', IN, 13128, RUN_DEBUG_TS, 50, ALIAS);
      const round = (resp as { round?: { biz?: string; key?: string } }).round;
      return {
        expect: `round.biz=${BIZ}, round.key=20261219, rankResult 为数组`,
        real: `biz=${String(round?.biz ?? 'null')}, key=${String(round?.key ?? 'null')}, rankResult=${Array.isArray(resp.rankResult) ? resp.rankResult.length : 'null'}`,
        pass: String(round?.biz ?? '') === BIZ && String(round?.key ?? '') === '20261219' && Array.isArray(resp.rankResult),
      };
    });

    await this.check('alias m/player_in_1v1_100_46/score 返回 1V1 轮次', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${ALIAS}/m/player_in_1v1_100_46/score`, {
        body: { key: '2026122500' },
        locale: IN, debugTimestamp: RUN_DEBUG_TS,
      })) as { round?: { biz?: string; key?: string }; scoreResult?: unknown[] };
      const round = data?.round;
      return {
        expect: `round.biz=${BIZ}, round.key=2026122500`,
        real: `biz=${String(round?.biz ?? 'null')}, key=${String(round?.key ?? 'null')}, scoreResult=${Array.isArray(data?.scoreResult) ? data.scoreResult.length : 'null'}`,
        pass: String(round?.biz ?? '') === BIZ && String(round?.key ?? '') === '2026122500',
      };
    });

    await this.check('alias global-family-rank 返回数组', async (): Promise<CheckResult> => {
      const data = await this.api.request(`active/v3/${ALIAS}/global-family-rank`, {
        body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS,
      });
      return {
        expect: 'data 为数组',
        real: Array.isArray(data) ? `array(${(data as unknown[]).length})` : typeof data,
        pass: Array.isArray(data),
      };
    });

    await this.check('alias get-pair 返回对阵结构', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${ALIAS}/get-pair`, {
        body: { playerId: 13128 }, locale: IN, debugTimestamp: RUN_DEBUG_TS,
      })) as { player1?: unknown; player2?: unknown; endTimestamp?: number };
      return {
        expect: '包含 player1/player2/endTimestamp',
        real: `player1=${data?.player1 ? 'yes' : 'no'}, player2=${data?.player2 ? 'yes' : 'no'}, endTimestamp=${String(data?.endTimestamp ?? 'null')}`,
        pass: data?.player1 !== undefined && data?.player2 !== undefined && data?.endTimestamp !== undefined,
      };
    });

    await this.check('alias p/room-rank 返回房间阶段榜', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${ALIAS}/p/room-rank`, {
        body: {}, locale: 'vi', debugTimestamp: RUN_DEBUG_TS,
      })) as Dict;
      const room = data?.room as { round?: { biz?: string }; rankResult?: unknown[] } | undefined;
      return {
        expect: '存在 room.round 且 biz=pk-v202612',
        real: room ? `biz=${String(room.round?.biz ?? 'null')}, rankResult=${room.rankResult?.length ?? 'null'}` : '无 room',
        pass: String(room?.round?.biz ?? '') === BIZ,
      };
    });

    await this.check('alias p/family-rank 返回印尼家族阶段榜', async (): Promise<CheckResult> => {
      const data = (await this.api.request(`active/v3/${ALIAS}/p/family-rank`, {
        body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS,
      })) as Dict;
      const topics = Object.keys(data ?? {});
      const bad = topics.filter((t) => {
        const v = data[t] as { round?: { biz?: string } };
        return String(v?.round?.biz ?? '') !== BIZ;
      });
      return {
        expect: '模块数 >= 5，全部 round.biz=pk-v202612',
        real: `模块数=${topics.length}, 异常=${bad.length}`,
        pass: topics.length >= 5 && bad.length === 0,
      };
    });

    await this.check('alias 与完整 biz 的 player_in_n_200 detail 一致', async (): Promise<CheckResult> => {
      const [alias, full] = await Promise.all([
        queryModuleDetail(this.api, 'player_in_n_200', IN, RUN_DEBUG_TS, ALIAS),
        queryModuleDetail(this.api, 'player_in_n_200', IN, RUN_DEBUG_TS, BIZ),
      ]);
      const pick = (d: typeof alias) => d === null ? 'null' : `${d.biz}|${d.topic}|${d.locale}|${d.key}|${d.startTime}|${d.finishTime}|${(d.rounds ?? []).map((r) => String((r as { key?: string }).key)).sort().join(',')}`;
      return { expect: pick(full), real: pick(alias), pass: pick(alias) === pick(full) };
    });

    await this.check('alias 与完整 biz 的 active-gifts 一致', async (): Promise<CheckResult> => {
      const [alias, full] = await Promise.all([
        this.api.request(`active/v3/${ALIAS}/active-gifts`, { body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS }),
        this.api.request(`active/v3/${BIZ}/active-gifts`, { body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS }),
      ]);
      const pick = (v: unknown) => {
        const gifts = ((v as { gifts?: Array<{ stage?: number; special?: boolean }> })?.gifts ?? []);
        return JSON.stringify(gifts.map((g) => [g.stage, g.special]));
      };
      return { expect: pick(full), real: pick(alias), pass: pick(alias) === pick(full) };
    });

    await this.check('alias 与完整 biz 的 player-in-detail 模块集合一致', async (): Promise<CheckResult> => {
      const [alias, full] = await Promise.all([
        this.api.request(`active/v3/${ALIAS}/p/player-in-detail`, { body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS }),
        this.api.request(`active/v3/${BIZ}/p/player-in-detail`, { body: {}, locale: IN, debugTimestamp: RUN_DEBUG_TS }),
      ]);
      const keys = (v: unknown) => Object.keys((v ?? {}) as Dict).sort().join(',');
      return { expect: keys(full), real: keys(alias), pass: keys(alias) === keys(full) };
    });

    await this.check('alias 与完整 biz 的 m/user/rank 积分一致', async (): Promise<CheckResult> => {
      const [alias, full] = await Promise.all([
        queryRank(this.api, 'user', '20261219', IN, 13128, RUN_DEBUG_TS, 50, ALIAS),
        queryRank(this.api, 'user', '20261219', IN, 13128, RUN_DEBUG_TS, 50, BIZ),
      ]);
      const amount = (r: Awaited<ReturnType<typeof queryRank>>) => {
        const mine = (r.my ?? r.myAll?.find((x) => Number(x.player) === 13128)) as { amount?: number } | undefined;
        return Number(mine?.amount ?? 0);
      };
      return { expect: `amount=${amount(full)}`, real: `amount=${amount(alias)}`, pass: amount(alias) === amount(full) };
    });
  }

  private async expectAwardModule(path: string, topic: string, locale: string): Promise<CheckResult> {
    const data = (await this.api.request(`active/v3/${ALIAS}/${path}`, {
      body: {}, locale, debugTimestamp: RUN_DEBUG_TS,
    })) as Dict;
    const item = data?.[topic] as { detail?: { biz?: string }; mainAwards?: unknown[] } | undefined;
    const awards = item?.mainAwards ?? [];
    return {
      expect: `${topic}: detail.biz=${BIZ} 且 mainAwards 非空`,
      real: item ? `biz=${String(item.detail?.biz ?? 'null')}, mainAwards=${awards.length}` : '模块缺失',
      pass: String(item?.detail?.biz ?? '') === BIZ && awards.length > 0,
    };
  }
}

await new Pk2612AliasApi().execute();
