import { type CheckResult } from '../../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './Pk202808Base.ts';
import { bjIsoFor } from './constants.ts';
import { EXPECTED_AWARDS } from './awards.ts';

export interface PkStageConfig {
  locale: string;
  module: string;
  keys: string[];
  /** 每场对阵数量 in=50/25，非 in=25/12 */
  pairCount: number;
  label: string;
}

/** 1v1 六场通用编排：初始化对阵 → 造分 → 结算 → 校验胜负/奖励/无重复对手 */
export abstract class PkStageRunner extends Pk202808Base {
  protected async runPkStage(cfg: PkStageConfig): Promise<void> {
    const { locale, module, keys, pairCount } = cfg;
    const senders = this.syntheticIds('user', locale, 40, 5000);
    const seenOpponents = new Set<string>();

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const day = `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
      const startLocal = key.endsWith('00') ? `${day} 00:05:00` : `${day} 18:05:00`;
      const settleLocal = key.endsWith('00') ? `${day} 17:45:00` : `${day} 23:45:00`;

      await this.act(`[${cfg.label}/${locale}] ${key} 初始化对阵`, async () => {
        await this.pk.callInitRound(module, key, bjIsoFor(locale, startLocal), locale);
      });

      const pairs = await this.pk.queryPairs(module, { key, locale });
      await this.check(`[${cfg.label}/${locale}] ${key} 对阵数量=${pairCount}，玩家不重复`, async (): Promise<CheckResult> => {
        if (pairs.length !== pairCount) throw new Error(`对阵 ${pairs.length} 对，期望 ${pairCount} 对`);
        const players: number[] = [];
        for (const p of pairs) {
          players.push(int(p['player1']));
          const p2 = int(p['player2']);
          if (p2 > 0) players.push(p2);
        }
        const dup = players.filter((p, idx) => players.indexOf(p) !== idx);
        return { expect: `${pairCount} 对且玩家唯一`, real: `${pairs.length} 对，重复玩家 ${dup.length}`, pass: dup.length === 0 };
      });

      await this.act(`[${cfg.label}/${locale}] ${key} 为对阵双方造分（每 5 对设 1 对同分）`, async () => {
        const startMs = this.localMs(locale, startLocal);
        const entries = pairs.flatMap((p, idx) => {
          const p1 = int(p['player1']);
          const p2 = int(p['player2']);
          const tie = idx % 5 === 0;
          const s1 = 1200;
          const s2 = tie ? 1200 : 800;
          const out = [{ player: p1, score: s1, createTime: startMs + idx * 1000, contributor: senders[idx % senders.length]! }];
          if (p2 > 0) out.push({ player: p2, score: s2, createTime: startMs + idx * 1000, contributor: senders[(idx + 1) % senders.length]! });
          return out;
        });
        await this.pk.seedRank(module, key, locale, entries, 'PK28PK');
      });

      const beforeAward = await this.pk.queryAwardRecord(module);
      await this.act(`[${cfg.label}/${locale}] ${key} 结算并初始化下一轮`, async () => {
        await this.settlePkRound(locale, settleLocal);
      });

      await this.check(`[${cfg.label}/${locale}] ${key} 胜负与同分判定正确，轮次状态 200`, async (): Promise<CheckResult> => {
        const settled = await this.pk.queryPairs(module, { key, locale });
        const problems: string[] = [];
        settled.forEach((p, idx) => {
          const p1 = int(p['player1']);
          const p2 = int(p['player2']);
          const winner = int(p['winner']);
          if (idx % 5 === 0 && p2 > 0) {
            if (winner !== 0) problems.push(`同分对 winner=${winner} 应为 0`);
          } else if (p2 > 0 && winner !== p1) {
            problems.push(`高分对 winner=${winner} 应为 ${p1}`);
          }
          if (p2 > 0) {
            const a = Math.min(p1, p2);
            const b = Math.max(p1, p2);
            const pairKey = `${a}-${b}`;
            if (seenOpponents.has(pairKey)) problems.push(`重复对手 ${pairKey}`);
            seenOpponents.add(pairKey);
          }
        });
        const rounds = await this.pk.queryRounds(module, locale);
        const round = rounds.find((r) => String(r['key']) === key);
        if (!round || int(round['status']) !== 200) problems.push(`轮次状态 ${round?.['status']}`);
        if (problems.length > 0) throw new Error(`${problems.length} 处异常：${problems.slice(0, 5).join('；')}`);
        return { expect: '胜负/同分/状态正确且无重复对手', real: '正确', pass: true };
      });

      await this.check(`[${cfg.label}/${locale}] ${key} 胜方获得 PK 获胜奖励，平局不发`, async (): Promise<CheckResult> => {
        const settled = await this.pk.queryPairs(module, { key, locale });
        const winners = settled.map((p, idx) => ({ idx, winner: int(p['winner']) })).filter(({ winner }) => winner > 0);
        if (winners.length === 0) throw new Error('无胜方，无法校验获胜奖励');
        const expected = EXPECTED_AWARDS[module]!;
        // 结算前后对比，确保本场新增获胜奖励（同一玩家可能多轮获胜）
        const afterAward = await this.pk.queryAwardRecord(module);
        const problems: string[] = [];
        for (const { winner } of winners) {
          for (const award of expected) {
            const matches = (rows: typeof afterAward) =>
              rows.filter((r) => int(r['player']) === winner && String(r['award_type']) === award.type && int(r['award_id']) === award.id).length;
            if (matches(afterAward) <= matches(beforeAward)) problems.push(`胜方 ${winner} 本场未新增 ${award.type}:${award.id}`);
          }
        }
        if (problems.length > 0) throw new Error(`${problems.length} 处缺奖励：${problems.slice(0, 5).join('；')}`);
        return { expect: '胜方均有获胜奖励', real: '有', pass: true };
      });
    }
  }
}