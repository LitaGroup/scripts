import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import { BIZ, queryActiveSql } from './_lib/pk2612.ts';

/**
 * TK-0649 / 2612 年度 PK：PK 获胜 Buff 用例。
 *
 * 口径（需求澄清 Q24 / 技术方案 6.1）：只统计当前 1V1 阶段内累计胜场，不跨阶段累计；
 * pkWinnerBuff = [1, 1, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3]，下标为胜场数。
 * 当前 1V1 阶段 3 天 × 2 场 = 6 场，7/8 档不可达。
 *
 * 本用例依赖测试环境已存在 2612 的 1V1 对局与下一阶段 Buff 数据；
 * 无数据时按 BLOCKED 上报（不伪造通过）。
 */
const WINNER_BUFF = [1, 1, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];

const SOURCE_TARGETS: Array<{ sourceTopic: string; targetTopics: string[] }> = [
  { sourceTopic: 'player_in_1v1_100_46', targetTopics: ['player_in_50_20', 'player_in_1v1_50_20'] },
  { sourceTopic: 'player_1v1_50_20', targetTopics: ['player_24_10', 'player_1v1_24_10'] },
];

class Pk2612WinnerBuff extends TestBaseClass {
  constructor() {
    super();
    this.total = 2;
  }

  protected async run(): Promise<void> {
    const pairs = await queryActiveSql(
      `SELECT topic, winner, COUNT(*) AS c FROM mod_buff11pk_pair` +
      ` WHERE biz='${BIZ}' AND topic IN ('player_in_1v1_100_46','player_1v1_50_20','player_in_1v1_50_20','player_1v1_24_10')` +
      ` AND winner > 0 GROUP BY topic, winner ORDER BY topic, winner`,
    );

    await this.check('2612 已产生 1V1 胜场数据（前置条件）', async (): Promise<CheckResult> => {
      const total = pairs.reduce((s, r) => s + Number(r[2] ?? 0), 0);
      if (total === 0) {
        this.skip('BLOCKED: 测试环境无 2612 已结算的 1V1 胜场数据，需 1v1 全链路造数与写权限授权');
      }
      return { expect: '胜场记录 > 0', real: `${total} 条`, pass: total > 0 };
    });

    await this.check('下一阶段玩家 Buff 与当前阶段胜场映射一致（0–6 胜）', async (): Promise<CheckResult> => {
      const winMap = new Map<string, number>();
      for (const row of pairs) {
        winMap.set(`${String(row[0])}|${String(row[1])}`, Number(row[2] ?? 0));
      }

      const problems: string[] = [];
      let checked = 0;
      for (const { sourceTopic, targetTopics } of SOURCE_TARGETS) {
        const buffRows = await queryActiveSql(
          `SELECT topic, player, buff FROM mod_buffpk_player_buff WHERE biz='${BIZ}'` +
          ` AND topic IN (${targetTopics.map((t) => `'${t}'`).join(',')}) ORDER BY topic, player`,
        );
        for (const row of buffRows) {
          const topic = String(row[0]);
          const player = String(row[1]);
          const buff = Number(row[2]);
          const wins = winMap.get(`${sourceTopic}|${player}`) ?? 0;
          const expected = WINNER_BUFF[wins] ?? 1;
          checked++;
          if (Math.abs(buff - expected) > 1e-9) {
            problems.push(`${sourceTopic}->${topic}/${player}: 胜场${wins} 期望${expected} 实际${buff}`);
          }
        }
      }

      if (checked === 0) {
        this.skip('BLOCKED: 无下一阶段 mod_buffpk_player_buff 记录，需 1v1 结算与阶段初始化数据');
      }
      return {
        expect: '全部 Buff 记录与胜场映射一致（1/2→1.0, 3→1.05, 4→1.1, 5→1.15, 6→1.2）',
        real: problems.length === 0 ? `核对 ${checked} 条全部一致` : problems.slice(0, 5).join('；'),
        pass: problems.length === 0,
      };
    });
  }
}

await new Pk2612WinnerBuff().execute();
