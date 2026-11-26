import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type CheckResult } from '../../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../../src/base/TestBaseClass.ts';
import { localAtMs, expireSeconds } from '../../../../../src/base/TimeUtils.ts';
import type { MysqlRow } from '../../../../../src/resources/MySQLTestResource.ts';
import {
  ACTIVITY_FINISH_MS,
  ACTIVITY_START_MS,
  BIZ,
  DAILY_KEYS,
  GIFTS,
  bjIsoFor,
  dailyFinishMs,
  finishMsOf,
  startMsOf,
  type StageDef,
} from './constants.ts';
import { EXPECTED_AWARDS, diffAwardConfig, type AwardRow } from './awards.ts';

export interface Fixtures {
  users?: Record<string, number[]>;
  /** 有效陪玩 UID */
  players?: Record<string, number[]>;
  rooms?: Record<string, number[]>;
  families?: Record<string, Array<{ id: number; members: number[] }>>;
  identities?: { normal?: number[]; svip?: number[]; rich?: number[] };
  couples?: Record<string, Array<{ a: number; b: number; genderA?: number; genderB?: number }>>;
}

export function loadFixtures(): Fixtures {
  const path = process.env['PK_FIXTURES'] ?? resolve(process.cwd(), 'config.pk-202808.json');
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Fixtures;
  } catch {
    return {};
  }
}

export function int(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function float(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface PkRankItem {
  player: number;
  amount: number;
  rank: number;
  playerType?: string;
  contributors?: unknown;
}

/** pk-v202808 用例基类：清理、造数、Cron/结算、断言工具。 */
export abstract class Pk202808Base extends TestBaseClass {
  protected readonly fx: Fixtures = loadFixtures();

  protected requireFixture<T>(value: T | undefined, what: string): T {
    if (value === undefined) {
      this.skip(`缺少 fixtures：${what}（配置 config.pk-202808.json 或 PK_FIXTURES 后重跑）`);
    }
    return value as T;
  }

  protected requirePlayers(locale: string, n: number): number[] {
    const list = this.fx.players?.[locale] ?? [];
    if (list.length < n) this.skip(`fixtures.players.${locale} 需要至少 ${n} 个有效陪玩，当前 ${list.length} 个`);
    return list.slice(0, n);
  }

  protected requireRooms(locale: string, n: number): number[] {
    const list = this.fx.rooms?.[locale] ?? [];
    if (list.length < n) this.skip(`fixtures.rooms.${locale} 需要至少 ${n} 个房间，当前 ${list.length} 个`);
    return list.slice(0, n);
  }

  protected requireFamilies(locale: string, n: number): Array<{ id: number; members: number[] }> {
    const list = this.fx.families?.[locale] ?? [];
    if (list.length < n) this.skip(`fixtures.families.${locale} 需要至少 ${n} 个家族，当前 ${list.length} 个`);
    return list.slice(0, n);
  }

  /** 无 fixtures 时使用隔离的合成用户/房间/家族 ID（不用于有效陪玩校验） */
  protected syntheticIds(kind: 'user' | 'room' | 'family', locale: string, n: number, offset = 0): number[] {
    const base = { user: 910_000_000, room: 920_000_000, family: 930_000_000 }[kind];
    const localeBase = { in: 0, vi: 10_000_000, ph: 20_000_000, ko: 30_000_000 }[locale] ?? 0;
    return Array.from({ length: n }, (_, i) => base + localeBase + offset + i + 1);
  }

  protected async cleanTopic(topic: string, locale?: string): Promise<void> {
    await this.pk.cleanTopic(topic, locale);
    await this.pk.cleanPlayerListPrefix(topic, locale);
    for (const key of [...DAILY_KEYS, '-']) {
      await this.pk.cleanRedis(topic, key, locale ?? 'in');
    }
  }

  protected async cleanAllForCase(): Promise<void> {
    await this.pk.cleanAll();
  }

  /** 用 Cron 入口模拟北京时间；localDt 为请求大区的本地时刻 */
  protected cronTs(locale: string, localDt: string): string {
    return bjIsoFor(locale, localDt);
  }

  protected async runCronAt(locale: string, localDt: string): Promise<void> {
    await this.pk.callCron(this.cronTs(locale, localDt));
  }

  protected async settleStage(locale: string, topic: string, localSettleDt: string): Promise<void> {
    await this.pk.callModuleSettle(topic, bjIsoFor(locale, localSettleDt), locale);
  }

  protected async initStage(locale: string, topic: string, localInitDt: string): Promise<void> {
    await this.pk.callModuleInit(topic, bjIsoFor(locale, localInitDt), locale);
  }

  protected rankItems(resp: Record<string, unknown>): PkRankItem[] {
    const list = (resp['rankResult'] ?? []) as Array<Record<string, unknown>>;
    return list.map((r) => ({
      player: int(r['player']),
      amount: int(r['amount'] ?? 0),
      rank: int(r['rank'] ?? 0),
      playerType: r['playerType'] === undefined ? undefined : String(r['playerType']),
      contributors: r['contributors'],
    }));
  }

  protected async assertRoundStartsEnds(
    topic: string,
    locale: string,
    stage: StageDef,
    opts: { key?: string; allowFinishBefore?: boolean } = {},
  ): Promise<CheckResult> {
    const rows = await this.pk.queryRounds(topic, locale);
    const key = opts.key ?? '-';
    const row = rows.find((r) => String(r['key']) === key);
    if (!row) throw new Error(`mod_common_round 缺少 ${topic}/${locale}/key=${key}`);
    const expStart = startMsOf(locale, stage);
    const expFinish = finishMsOf(locale, stage);
    const realStart = int(row['start_time']);
    const realFinish = int(row['finish_time']);
    const startOk = Math.abs(realStart - expStart) <= 1000;
    const finishOk = opts.allowFinishBefore
      ? realFinish <= expFinish + 1000 && realFinish >= expFinish - 3600_000
      : Math.abs(realFinish - expFinish) <= 1000;
    return {
      expect: `start=${expStart} finish=${expFinish}`,
      real: `start=${realStart} finish=${realFinish}`,
      pass: startOk && finishOk,
      message: `${topic}/${locale} 轮次时间不一致`,
    };
  }

  protected async assertRankEqualsRecords(topic: string, key: string, locale: string, count = 200): Promise<CheckResult> {
    const resp = await this.pk.queryRank(topic, key, locale, { count });
    const items = this.rankItems(resp);
    const records = await this.pk.queryRankRecords(topic, { key, locale });
    const sums = new Map<number, number>();
    for (const r of records) {
      const p = int(r['player']);
      sums.set(p, (sums.get(p) ?? 0) + float(r['amount']));
    }
    const ranked = [...sums.entries()].sort((a, b) => b[1] - a[1]).slice(0, count);
    const mismatch = ranked
      .map(([p, s], i) => ({ p, s, item: items.find((x) => x.player === p), rank: i + 1 }))
      .filter(({ p, s, item }) => !item || Math.abs(item.amount - s) > 0.5 || item.rank !== rankOf(ranked, p));
    return {
      expect: `${ranked.length} 条流水汇总与接口一致`,
      real: `${items.length} 条接口记录，${mismatch.length} 处不一致`,
      pass: mismatch.length === 0 && items.length === Math.min(count, ranked.length),
      message: mismatch.length ? `不一致示例：${JSON.stringify(mismatch.slice(0, 3))}` : '',
    };
  }

  protected async assertAwardConfig(name: string, expected = EXPECTED_AWARDS[name]): Promise<CheckResult> {
    if (!expected) throw new Error(`未维护 ${name} 的期望奖励配置`);
    const rows = await this.pk.queryAwardConfig(name);
    if (rows.length === 0) throw new Error(`mod_common_award 无 ${name} 配置`);
    const diff = diffAwardConfig(rows, expected);
    return {
      expect: `${expected.length} 条奖励配置`,
      real: diff === null ? `${rows.length} 条一致` : `${rows.length} 条不一致`,
      pass: diff === null,
      message: diff ?? '',
    };
  }

  /**
   * 校验某 topic 的结算发奖：expected 按名次给出奖励行，recipients 按名次给出获奖对象。
   * 自动奖励校验数量/有效期，VIEW 奖励校验只生成记录（mod=VIEW）。
   */
  protected async maxAwardRecordId(topic: string): Promise<number> {
    let max = 0;
    for (const t of [topic, `${topic}-daily`, `${topic}-contributor`]) {
      const rows = await this.pk.queryAwardRecord(t);
      for (const r of rows) max = Math.max(max, int(r['id']));
    }
    return max;
  }

  protected async assertSettleAwards(
    topic: string,
    expected: AwardRow[],
    recipients: Record<number, Array<{ player: number; playerType: string }>>,
    opts: { afterId?: number; minCreateTime?: number; occurrences?: number } = {},
  ): Promise<void> {
    await sleep(1000);
    // 日榜/贡献者奖励可能以 `{topic}-daily` / `{topic}-contributor` 落记录，合并查询
    const records: MysqlRow[] = [];
    for (const t of [topic, `${topic}-daily`, `${topic}-contributor`]) {
      records.push(...(await this.pk.queryAwardRecord(t, opts)));
    }
    const problems: string[] = [];
    // 同名次可能有多条同 type/id 的 VIEW 奖励（如 CUSTOM 占位），按 key 聚合数量后校验
    const grouped = new Map<string, AwardRow[]>();
    for (const row of expected) {
      const key = `${row.stage}|${row.playerType}|${row.type}|${row.id}|${row.mod}`;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    for (const rows of grouped.values()) {
      const row = rows[0]!;
      const targets = recipients[row.stage] ?? [];
      for (const target of targets) {
        if (target.playerType !== row.playerType) continue;
        const matched = records.filter(
          (r) =>
            int(r['player']) === target.player &&
            String(r['player_type']) === row.playerType &&
            String(r['award_type']) === row.type &&
            int(r['award_id']) === row.id &&
            String(r['mod']) === row.mod,
        );
        const expectedCount = rows.length * (opts.occurrences ?? 1);
        if (matched.length !== expectedCount) {
          problems.push(`${row.mod} ${row.type}:${row.id} stage=${row.stage} player=${target.player} 记录数=${matched.length} 期望 ${expectedCount}`);
          continue;
        }
        for (const rec of matched) {
          if (int(rec['award_count']) !== row.count) {
            problems.push(`${row.type}:${row.id} player=${target.player} count=${rec['award_count']} 期望 ${row.count}`);
          }
          if (row.mod === 'ADD') {
            const expSecond = expireSeconds(row.days === null ? '' : `P${row.days}D`);
            if (expSecond > 0 && int(rec['expire_second']) !== expSecond) {
              problems.push(`${row.type}:${row.id} player=${target.player} expire=${rec['expire_second']} 期望 ${expSecond}`);
            }
          }
        }
      }
    }
    if (problems.length > 0) throw new Error(`发奖不一致 ${problems.length} 处：${problems.slice(0, 5).join('；')}`);
  }

  protected async sendGift(opts: {
    locale: string;
    sender: number;
    receiver: number;
    roomId?: number;
    familyId?: number;
    giftId?: number;
    totalCoin?: number;
    sendTimeMs: number;
    debugTs?: string;
    orderNo?: string;
  }): Promise<string> {
    return this.pk.sendGift({
      locale: opts.locale,
      sender: opts.sender,
      receiver: opts.receiver,
      roomId: opts.roomId ?? 0,
      familyId: opts.familyId ?? 0,
      giftId: opts.giftId ?? GIFTS[0]!.id,
      totalCoin: opts.totalCoin ?? 1000,
      sendTimeMs: opts.sendTimeMs,
      debugTs: opts.debugTs ?? this.cronTs(opts.locale, '2028-08-18 10:00:00'),
      orderNo: opts.orderNo,
    });
  }

  /** CP player 标识：min(uid1,uid2) * 1e10 + max(uid1,uid2)，用字符串避免精度丢失 */
  protected coupleId(a: number, b: number): string {
    const lo = BigInt(Math.min(a, b));
    const hi = BigInt(Math.max(a, b));
    return (lo * 10000000000n + hi).toString();
  }

  protected async recordsOfOrder(orderNo: string): Promise<MysqlRow[]> {
    const rows = await this.pk.mysql.query(
      `SELECT id, topic, locale, \`key\`, player, trans_no, amount, total_amount, contributor, create_time FROM mod_common_rank_record WHERE biz='pk-v202808' AND trans_no LIKE ${`'%${orderNo}%'`} ORDER BY id`,
      'lita_active',
    );
    return rows;
  }

  protected async recordsForTopic(topic: string, locale: string, key = '-'): Promise<MysqlRow[]> {
    return this.pk.queryRankRecords(topic, { key, locale });
  }

  /** 大批量造数：按分数降序写入流水 + Redis（每阶段另需一笔真实送礼验证消费链路） */
  protected async seedStage(
    topic: string,
    locale: string,
    players: number[],
    opts: { key?: string; baseScore?: number; step?: number; contributorOf?: (player: number, i: number) => number } = {},
  ): Promise<Array<{ player: number; score: number }>> {
    const key = opts.key ?? '-';
    const base = opts.baseScore ?? 20000;
    const step = opts.step ?? 100;
    const startMs = this.localMs(locale, '2028-08-18 10:00:00');
    const entries = players.map((player, i) => ({
      player,
      score: base - i * step,
      createTime: startMs + i * 1000,
      contributor: opts.contributorOf?.(player, i) ?? players[(i + 1) % players.length]!,
    }));
    await this.pk.seedRank(topic, key, locale, entries);
    return entries.map(({ player, score }) => ({ player, score }));
  }

  protected async settlePlayerStage(locale: string, localSettleDt: string): Promise<void> {
    await this.pk.callPlayerSettleAndInit(this.cronTs(locale, localSettleDt), locale);
  }

  protected async settlePlayerDaily(locale: string, localSettleDt: string): Promise<void> {
    await this.pk.callPlayerDailySettle(this.cronTs(locale, localSettleDt), locale);
  }

  protected async settlePkRound(locale: string, localSettleDt: string): Promise<void> {
    await this.pk.callPlayerPkSettleAndInit(this.cronTs(locale, localSettleDt), locale);
  }

  /** 生成按分数降序、时间升序的造数条目 */
  protected seedEntries(players: number[], base: number, step = 1000, startMs = ACTIVITY_START_MS + 3600_000) {
    return players.map((player, i) => ({
      player,
      score: base - i * step,
      createTime: startMs + i * 1000,
      contributor: players[(i + 1) % players.length]!,
    }));
  }

  protected assertCount(expect: number, real: number, label: string): CheckResult {
    return { expect: String(expect), real: String(real), pass: expect === real, message: `${label} 数量不一致` };
  }

  protected assertActivityWindow(start: number, finish: number): CheckResult {
    const ok = start === ACTIVITY_START_MS && finish === ACTIVITY_FINISH_MS;
    return {
      expect: `${ACTIVITY_START_MS} ~ ${ACTIVITY_FINISH_MS}`,
      real: `${start} ~ ${finish}`,
      pass: ok,
      message: '活动统一起止时间不符合北京时间口径',
    };
  }

  protected dailyFinish(locale: string, day: string): number {
    return dailyFinishMs(locale, day);
  }

  protected localMs(locale: string, dt: string): number {
    return localAtMs(locale, dt);
  }

  protected biz(): string {
    return BIZ;
  }

  protected async dumpRounds(topic?: string): Promise<MysqlRow[]> {
    return this.pk.queryRounds(topic);
  }
}

/** 造数分数唯一时，名次即降序下标 + 1（同分场景由调用方单独断言） */
function rankOf(ranked: Array<[number, number]>, player: number): number {
  return ranked.findIndex(([p]) => p === player) + 1;
}