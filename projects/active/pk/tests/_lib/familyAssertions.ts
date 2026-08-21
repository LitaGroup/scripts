import { PkFamilyService, type FamilyRankEntry } from '../../../../../src/services/PkFamilyService.ts';
import type { MysqlRow } from '../../../../../src/resources/MySQLTestResource.ts';
import { expireSeconds } from '../../../../../src/base/TimeUtils.ts';
import { TEST_FAMILIES } from './constants.ts';
import type { ExpectedAwards, AwardTuple } from './expectedAwards.ts';

export interface FamilyStore {
  settleMs?: number;
  families?: FamilyRankEntry[];
  playerList?: MysqlRow[];
  orderNos?: string[];
  sendMs?: number;
  initTsMs?: number;
  awardConfig?: MysqlRow[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function int(v: unknown): number {
  return Math.trunc(Number(v));
}

function awardTypesOf(expected: ExpectedAwards): Set<string> {
  const types = new Set<string>();
  for (const awards of Object.values(expected)) {
    for (const a of awards) types.add(a[0]);
  }
  return types;
}

function sortTuples(list: AwardTuple[]): AwardTuple[] {
  return [...list].sort(
    (a, b) => a[0].localeCompare(b[0]) || a[1] - b[1] || a[2] - b[2] || a[3].localeCompare(b[3]),
  );
}

/** 校验 mod_common_award 配置与 config 一致：合并成员奖励与家族本体奖励两类配置（mod=ADD 行） */
export async function checkFamilyAwardConfig(
  svc: PkFamilyService,
  name: string,
  memberExpected: ExpectedAwards,
  selfExpected: ExpectedAwards,
): Promise<MysqlRow[]> {
  const rows = await svc.queryAwardConfig(name);
  if (rows.length === 0) throw new Error(`mod_common_award 无 ${name} 配置`);
  const addRows = rows.filter((r) => r['mod'] === 'ADD');
  if (addRows.length === 0) throw new Error(`mod_common_award ${name} 无 mod=ADD 配置`);

  const actual: Record<number, AwardTuple[]> = {};
  for (const r of addRows) {
    const stage = int(r['stage']);
    (actual[stage] ??= []).push([
      String(r['award_type']),
      int(r['award_id']),
      int(r['award_count']),
      String(r['expire_express']),
    ]);
  }

  const stageSet = new Set<number>();
  for (const k of Object.keys(memberExpected)) stageSet.add(Number(k));
  for (const k of Object.keys(selfExpected)) stageSet.add(Number(k));
  const combined: Record<number, AwardTuple[]> = {};
  for (const stage of stageSet) {
    combined[stage] = [...(memberExpected[stage] ?? []), ...(selfExpected[stage] ?? [])];
  }

  const actualStages = Object.keys(actual).map(Number).sort((a, b) => a - b);
  const combinedStages = Object.keys(combined).map(Number).sort((a, b) => a - b);
  if (JSON.stringify(actualStages) !== JSON.stringify(combinedStages)) {
    throw new Error(`${name} 名次段不一致：期望 ${JSON.stringify(combinedStages)}，实际 ${JSON.stringify(actualStages)}`);
  }
  for (const stageStr of Object.keys(combined)) {
    const stage = Number(stageStr);
    const a = sortTuples(actual[stage] ?? []);
    const e = sortTuples(combined[stage] ?? []);
    if (JSON.stringify(a) !== JSON.stringify(e)) {
      throw new Error(`${name} 第${stage}名配置不一致：期望 ${JSON.stringify(e)}，实际 ${JSON.stringify(a)}`);
    }
  }
  return addRows;
}

function topFamilies(store: FamilyStore, topN: number): Record<number, number> {
  const families = store.families ?? [];
  const top: Record<number, number> = {};
  for (let i = 0; i < Math.min(topN, families.length); i++) {
    top[families[i].rank] = families[i].player;
  }
  return top;
}

/** 校验 top-N 家族的每个成员均收到对应奖励（发放对象=家族内所有用户，player_type=USER） */
export async function checkMemberAwards(
  svc: PkFamilyService,
  store: FamilyStore,
  topic: string,
  topN: number,
  expected: ExpectedAwards,
): Promise<void> {
  await sleep(1000);
  const settleMs = store.settleMs ?? 0;
  const top3 = topFamilies(store, topN);
  const types = awardTypesOf(expected);
  const records = (await svc.queryAwardRecord(topic, { minCreateTime: settleMs })).filter(
    (r) => types.has(String(r['award_type'])),
  );
  for (const rankStr of Object.keys(expected)) {
    const rank = Number(rankStr);
    const familyId = top3[rank];
    if (familyId === undefined) throw new Error(`家族榜缺少第 ${rank} 名`);
    const members = TEST_FAMILIES[familyId];
    if (!members) throw new Error(`家族 ${familyId} 无成员配置，无法校验成员发奖`);
    for (const member of members) {
      for (const [aType, aId, aCount, expire] of expected[rank]) {
        const matched = records.some(
          (r) =>
            int(r['player']) === member &&
            r['player_type'] === 'USER' &&
            r['award_type'] === aType &&
            int(r['award_id']) === aId &&
            int(r['award_count']) === aCount &&
            int(r['expire_second'] ?? 0) === expireSeconds(expire),
        );
        if (!matched) {
          const detail = records.map(
            (r) => `(${r['player']}, ${r['player_type']}, ${r['award_type']}, ${r['award_id']}, ${r['award_count']}, ${r['expire_second']})`,
          );
          throw new Error(
            `家族 ${familyId}（第${rank}名）成员 ${member} 缺少奖励 ${aType}_${aId}_${aCount} expire=${expireSeconds(expire)}，实际 ${JSON.stringify(detail)}`,
          );
        }
      }
    }
  }
}

/** 校验 top-N 家族本体（family_id）收到对应奖励（发放对象=家族，player_type=FAMILY） */
export async function checkFamilySelfAwards(
  svc: PkFamilyService,
  store: FamilyStore,
  topic: string,
  topN: number,
  expected: ExpectedAwards,
): Promise<void> {
  await sleep(1000);
  const settleMs = store.settleMs ?? 0;
  const top3 = topFamilies(store, topN);
  const types = awardTypesOf(expected);
  const records = (await svc.queryAwardRecord(topic, { minCreateTime: settleMs })).filter(
    (r) => types.has(String(r['award_type'])),
  );
  for (const rankStr of Object.keys(expected)) {
    const rank = Number(rankStr);
    const familyId = top3[rank];
    if (familyId === undefined) throw new Error(`家族榜缺少第 ${rank} 名`);
    for (const [aType, aId, aCount, expire] of expected[rank]) {
      const matched = records.some(
        (r) =>
          int(r['player']) === familyId &&
          r['player_type'] === 'FAMILY' &&
          r['award_type'] === aType &&
          int(r['award_id']) === aId &&
          int(r['award_count']) === aCount &&
          int(r['expire_second'] ?? 0) === expireSeconds(expire),
      );
      if (!matched) {
        const detail = records.map(
          (r) => `(${r['player']}, ${r['player_type']}, ${r['award_type']}, ${r['award_id']}, ${r['award_count']}, ${r['expire_second']})`,
        );
        throw new Error(
          `家族 ${familyId}（第${rank}名）缺少家族本体奖励 ${aType}_${aId}_${aCount} expire=${expireSeconds(expire)}，实际 ${JSON.stringify(detail)}`,
        );
      }
    }
  }
}

/** 校验白名单（mod_common_player_list）与接口榜单记录数量一致、名次一致（含并列分组比对） */
export function assertPlayerListMatchRank(store: FamilyStore): void {
  const listRows = store.playerList ?? [];
  const families = store.families ?? [];
  if (listRows.length !== families.length) {
    throw new Error(`白名单数量 ${listRows.length} 应与接口记录数量 ${families.length} 一致`);
  }
  const listMap = new Map<number, number>();
  for (const r of listRows) listMap.set(int(r['player']), int(float(r['score'])));
  const rankMap = new Map<number, number>();
  for (const f of families) rankMap.set(f.player, f.amount);

  const listSet = new Set(listMap.keys());
  const rankSet = new Set(rankMap.keys());
  const onlyList = [...listSet].filter((p) => !rankSet.has(p)).sort((a, b) => a - b);
  const onlyRank = [...rankSet].filter((p) => !listSet.has(p)).sort((a, b) => a - b);
  if (onlyList.length || onlyRank.length) {
    throw new Error(`白名单家族 ${JSON.stringify(onlyList)} 与接口家族 ${JSON.stringify(onlyRank)} 应一致`);
  }
  for (const [player, score] of listMap) {
    if (score !== rankMap.get(player)) {
      throw new Error(`家族 ${player} 白名单得分 ${score} 应与接口 ${rankMap.get(player)} 一致`);
    }
  }

  const listSeq = listRows.map((r) => [int(r['player']), int(float(r['score']))] as [number, number]);
  const rankSeq = families.map((f) => [f.player, f.amount] as [number, number]);
  let expectedRank = 1;
  let i = 0;
  let j = 0;
  while (i < listSeq.length && j < rankSeq.length) {
    if (listSeq[i][1] === rankSeq[j][1]) {
      const li = i;
      const lj = j;
      while (i < listSeq.length && listSeq[i][1] === listSeq[li][1]) i++;
      while (j < rankSeq.length && rankSeq[j][1] === rankSeq[lj][1]) j++;
      const listGroup = listSeq.slice(li, i).map((p) => p[0]).sort((a, b) => a - b);
      const rankGroup = rankSeq.slice(lj, j).map((p) => p[0]).sort((a, b) => a - b);
      if (JSON.stringify(listGroup) !== JSON.stringify(rankGroup)) {
        throw new Error(
          `得分 ${rankSeq[lj][1]} 的名次区间 [${expectedRank}, ${expectedRank + (j - lj) - 1}] 白名单家族 ${JSON.stringify(listGroup)} 与接口家族 ${JSON.stringify(rankGroup)} 不一致`,
        );
      }
      expectedRank += j - lj;
    } else {
      throw new Error(`白名单与接口得分序列不一致：白名单第${i}名=${JSON.stringify(listSeq[i])}，接口第${j}名=${JSON.stringify(rankSeq[j])}`);
    }
  }
}

function float(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
