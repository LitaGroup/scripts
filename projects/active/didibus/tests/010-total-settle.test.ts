import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { LOCALE, USER_A, USER_B, USER_C, RANK_USERS, ALL_USERS, TOPIC_SEND, TOPIC_RECV, AWARD_SEND_TOTAL, AWARD_RECV, AWARD_RECV_CONTRIBUTOR } from './_lib/constants.ts';
import { T_D1, CRON_TOTAL_KO, CRON_TOTAL_PH, CRON_TOTAL_INVI, CRON_TOTAL_EARLY, localIso, localTs } from './_lib/times.ts';
import { int } from './_lib/helpers.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

const [S1, S2, S3, S4, S5, S6] = RANK_USERS; // 13128~13133

/**
 * 010-total-settle —— 总榜结算（Cron）
 * 造数（Redis ZADD + mod_common_rank_record 直写 contributor）：
 *   in 送礼总榜：S2=900、S1=600、S4=400、S3=200、S5=50 → Top3 = S2/S1/S4
 *   in 收礼总榜：B=1000（贡献 S1=500）、A=650（贡献 S2=600）、C=500（贡献 S4=400） → Top3 = B/A/C，贡献者 = S1/S2/S4
 *   ko 送礼/收礼各 1 条（S6=100）—— 时区覆盖验证
 * 触发：__cron 北京时间精确到 cron 分钟（ko=10-02 23:05 / ph=10-03 00:05 / in+vi=10-03 01:05）。
 * 结算判定：mod_common_round.status=200 + 发奖记录（mod_common_rank_result 已废弃，不再断言结果快照）。
 */
class TotalSettle010 extends DidibusTestBase {
  private awardCountBeforeIdem = 0;

  constructor() {
    super();
    this.total = 16;
  }

  private async awardIdsOf(name: string, stage: number): Promise<number[]> {
    const rows = await this.didibus.queryAwardConfig(name);
    return rows.filter((r) => int(r['stage']) === stage).map((r) => int(r['award_id'])).sort();
  }

  private async playerAwardIds(player: number): Promise<number[]> {
    const rows = await this.didibus.queryAwardRecords({ player });
    return rows.map((r) => int(r['award_id']));
  }

  protected async run(): Promise<void> {
    await this.probeActive();

    await this.act('清理轮次、全部测试用户数据、历史发奖记录与 Redis', async () => {
      this.needActive();
      await this.didibus.cleanRounds();
      await this.didibus.cleanUsers(ALL_USERS);
      await this.didibus.cleanAwardRecords();
      await this.didibus.cleanRedis();
    });

    await this.act('触发轮次初始化（/p/init round=1，T_D1）', async () => {
      this.needActive();
      await this.didibus.initActivity(USER_A, LOCALE, localIso(LOCALE, T_D1));
    });

    await this.act('构造总榜数据（in 送礼/收礼 + 贡献者记录；ko 少量）', async () => {
      this.needActive();
      const t = localTs('in', T_D1);
      // in 送礼总榜
      const sendScores: Array<[number, number]> = [[S1, 600], [S2, 900], [S3, 200], [S4, 400], [S5, 50]];
      for (const [u, s] of sendScores) {
        await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_SEND), u, s);
        await this.didibus.seedRankRecord(TOPIC_SEND, 'in', '-', u, u, s, t);
      }
      // in 收礼总榜 + 贡献者
      const recvScores: Array<[number, number]> = [[USER_B, 1000], [USER_A, 650], [USER_C, 500]];
      for (const [u, s] of recvScores) {
        await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_RECV), u, s);
      }
      // 贡献者明细：B←S1 500 / S2 300 / S3 200；A←S2 600 / S5 50；C←S4 400 / S1 100
      await this.didibus.seedRankRecord(TOPIC_RECV, 'in', '-', USER_B, S1, 500, t);
      await this.didibus.seedRankRecord(TOPIC_RECV, 'in', '-', USER_B, S2, 300, t);
      await this.didibus.seedRankRecord(TOPIC_RECV, 'in', '-', USER_B, S3, 200, t);
      await this.didibus.seedRankRecord(TOPIC_RECV, 'in', '-', USER_A, S2, 600, t);
      await this.didibus.seedRankRecord(TOPIC_RECV, 'in', '-', USER_A, S5, 50, t);
      await this.didibus.seedRankRecord(TOPIC_RECV, 'in', '-', USER_C, S4, 400, t);
      await this.didibus.seedRankRecord(TOPIC_RECV, 'in', '-', USER_C, S1, 100, t);
      // ko 少量数据
      await this.didibus.rankSeed(this.didibus.rankKey('ko', TOPIC_SEND), S6, 100);
      await this.didibus.seedRankRecord(TOPIC_SEND, 'ko', '-', S6, S6, 100, localTs('ko', T_D1));
      await this.didibus.rankSeed(this.didibus.rankKey('ko', TOPIC_RECV), USER_B, 100);
      await this.didibus.seedRankRecord(TOPIC_RECV, 'ko', '-', USER_B, S6, 100, localTs('ko', T_D1));
    });

    await this.act('活动期内触发 __cron（北京 09-26 00:05，总榜未结束）', async () => {
      this.needActive();
      await this.didibus.runCron(CRON_TOTAL_EARLY);
    });

    await this.check('活动未结束不结算总榜：两榜 key=\'-\' 轮次均未结算', async (): Promise<CheckResult> => {
      this.needActive();
      const send = await this.didibus.roundStatus(TOPIC_SEND, 'in', '-');
      const recv = await this.didibus.roundStatus(TOPIC_RECV, 'in', '-');
      return {
        expect: 'send≠200，recv≠200',
        real: `send=${send}，recv=${recv}`,
        pass: send !== 200 && recv !== 200,
      };
    });

    await this.act('触发 ko 总榜结算（__cron 北京 10-02 23:05）', async () => {
      this.needActive();
      await this.didibus.runCron(CRON_TOTAL_KO);
    });

    await this.check('时区覆盖：仅 ko 总榜已结算，in 未结算', async (): Promise<CheckResult> => {
      this.needActive();
      const koSend = await this.didibus.roundStatus(TOPIC_SEND, 'ko', '-');
      const inSend = await this.didibus.roundStatus(TOPIC_SEND, 'in', '-');
      const inRecv = await this.didibus.roundStatus(TOPIC_RECV, 'in', '-');
      return {
        expect: 'ko send=200；in send/recv≠200',
        real: `ko send=${koSend}；in send=${inSend}，recv=${inRecv}`,
        pass: koSend === 200 && inSend !== 200 && inRecv !== 200,
      };
    });

    await this.act('触发 ph 总榜结算（__cron 北京 10-03 00:05）', async () => {
      this.needActive();
      await this.didibus.runCron(CRON_TOTAL_PH);
    });

    await this.check('时区覆盖：in 仍未结算（in/vi 需等 01:05）', async (): Promise<CheckResult> => {
      this.needActive();
      const inSend = await this.didibus.roundStatus(TOPIC_SEND, 'in', '-');
      return { expect: '≠200', real: String(inSend), pass: inSend !== 200 };
    });

    await this.act('触发 in/vi 总榜结算（__cron 北京 10-03 01:05）', async () => {
      this.needActive();
      await this.didibus.runCron(CRON_TOTAL_INVI);
    });

    await this.check('送礼总榜发奖：Top2(S1)/Top3(S4) 自动发放，Top1(S2) CUSTOM 仅留 view_only 记录不发放', async (): Promise<CheckResult> => {
      this.needActive();
      const stage2Ids = await this.awardIdsOf(AWARD_SEND_TOTAL, 2);
      const stage3Ids = await this.awardIdsOf(AWARD_SEND_TOTAL, 3);
      if (stage2Ids.length === 0 || stage3Ids.length === 0) {
        return { expect: 'gift-send-total stage2/3 配置存在', real: '缺失', pass: false, message: '预置数据缺失：mod_common_award gift-send-total' };
      }
      const s1Awards = await this.playerAwardIds(S1);
      const s4Awards = await this.playerAwardIds(S4);
      // Top1 CUSTOM：应恰好 1 条 view_only 审计记录（不实际发放）
      const s2Rows = await this.didibus.queryAwardRecords({ player: S2 });
      const s2ViewOnly = s2Rows.filter((r) => String(r['mod']) === 'view_only');
      const s2RealIssued = s2Rows.filter((r) => String(r['mod']) !== 'view_only');
      const s1Ok = stage2Ids.every((id) => s1Awards.includes(id));
      const s4Ok = stage3Ids.every((id) => s4Awards.includes(id));
      const s2Ok = s2ViewOnly.length === 1 && s2RealIssued.length === 0;
      return {
        expect: `S1 含 stage2 奖励 ${JSON.stringify(stage2Ids)}，S4 含 stage3 ${JSON.stringify(stage3Ids)}，S2 仅 1 条 view_only 记录`,
        real: `S1=${JSON.stringify(s1Awards)}，S4=${JSON.stringify(s4Awards)}，S2 view_only=${s2ViewOnly.length} 条/实发=${s2RealIssued.length} 条`,
        pass: s1Ok && s4Ok && s2Ok,
      };
    });

    await this.check('in 收礼总榜发奖：Top3(B/A/C) 按 stage=排名 发放 gift-recv 奖励', async (): Promise<CheckResult> => {
      this.needActive();
      const problems: string[] = [];
      const rankOf: Array<[number, number]> = [[USER_B, 1], [USER_A, 2], [USER_C, 3]];
      for (const [player, rank] of rankOf) {
        const expectIds = await this.awardIdsOf(AWARD_RECV, rank);
        if (expectIds.length === 0) {
          problems.push(`stage${rank} 配置缺失`);
          continue;
        }
        const gotIds = await this.playerAwardIds(player);
        if (!expectIds.every((id) => gotIds.includes(id))) {
          problems.push(`rank${rank}/player${player}：期望含 ${JSON.stringify(expectIds)}，实际 ${JSON.stringify(gotIds)}`);
        }
      }
      return {
        expect: 'Top1~3 各得 gift-recv stage=排名 奖励',
        real: problems.length === 0 ? '全部正确' : problems.join('；'),
        pass: problems.length === 0,
      };
    });

    await this.check('收礼贡献者发奖：S1(stage1)/S2(stage2)/S4(stage3) 得 gift-recv-contributor', async (): Promise<CheckResult> => {
      this.needActive();
      const expectMap: Array<[number, number]> = [[S1, 1], [S2, 2], [S4, 3]]; // 贡献者 → 玩家排名
      const problems: string[] = [];
      for (const [contributor, stage] of expectMap) {
        const expectIds = await this.awardIdsOf(AWARD_RECV_CONTRIBUTOR, stage);
        if (expectIds.length === 0) {
          problems.push(`stage${stage} 配置缺失`);
          continue;
        }
        // 只看 gift-recv topic 的发奖记录，避免与送礼榜同 award_id 的奖励混淆
        const gotIds = (await this.didibus.queryAwardRecords({ player: contributor, topic: TOPIC_RECV })).map((r) => int(r['award_id']));
        if (!expectIds.every((id) => gotIds.includes(id))) {
          problems.push(`贡献者${contributor}(stage${stage})：期望含 ${JSON.stringify(expectIds)}，实际 ${JSON.stringify(gotIds)}`);
        }
      }
      return {
        expect: 'S1/S2/S4 按玩家排名 stage=1/2/3 发放',
        real: problems.length === 0 ? '全部正确' : problems.join('；'),
        pass: problems.length === 0,
      };
    });

    await this.act('重复触发 in/vi 总榜结算（幂等验证）', async () => {
      this.needActive();
      this.awardCountBeforeIdem = (await this.didibus.queryAwardRecords({})).length;
      await this.didibus.runCron(CRON_TOTAL_INVI);
    });

    await this.check('幂等：重复触发不产生新奖励', async (): Promise<CheckResult> => {
      this.needActive();
      const awards = (await this.didibus.queryAwardRecords({})).length;
      return {
        expect: `award=${this.awardCountBeforeIdem}（不变）`,
        real: `award=${awards}`,
        pass: awards === this.awardCountBeforeIdem,
      };
    });
  }
}

await new TotalSettle010().execute();
