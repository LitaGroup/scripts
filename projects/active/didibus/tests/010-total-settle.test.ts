import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { LOCALE, USER_A, USER_B, USER_C, RANK_USERS, ALL_USERS, ACTIVITY_GIFTS, TOPIC_SEND, TOPIC_RECV, AWARD_SEND_DAILY, AWARD_SEND_TOTAL, AWARD_RECV, AWARD_RECV_CONTRIBUTOR } from './_lib/constants.ts';
import { T_D1, CRON_TOTAL_KO, CRON_TOTAL_PH, CRON_TOTAL_INVI, CRON_TOTAL_EARLY, localIso, localTs } from './_lib/times.ts';
import { int } from './_lib/helpers.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

const [S1, S2, S3, S4, S5, S6] = RANK_USERS; // 13128~13133

/**
 * 010-total-settle —— 总榜结算（Cron）
 * 造数：真实 gift_send 消息（禁止直写 DB/Redis）；用 buff=1.0 的活动礼物，score=totalCoin 精确造分。
 *   in 送礼总榜：S2=900、S1=600、S4=400、S3=200、S5=50 → Top3 = S2/S1/S4
 *   in 收礼总榜：B=1000（贡献 S1=500/S2=300/S3=200）、A=650（贡献 S2=600/S5=50）、C=500（贡献 S4=400/S1=100）
 *     → Top3 = B/A/C，贡献 Top1 = S1/S2/S4
 *   ko：S6→B 100 —— 时区覆盖验证
 * 触发：__cron 北京时间精确到 cron 分钟（ko=10-02 23:05 / ph=10-03 00:05 / in+vi=10-03 01:05）。
 * 结算判定：mod_common_round.status=200 + 发奖记录（mod_common_rank_result 已废弃，不再断言结果快照）。
 */
class TotalSettle010 extends DidibusTestBase {
  private awardCountBeforeIdem = 0;

  constructor() {
    super();
    this.total = 17;
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

    await this.act('构造总榜数据：真实送礼消息（in 7 笔 + ko 1 笔，score=totalCoin×buff）', async () => {
      this.needActive();
      // buff=1.0 的活动礼物：score = totalCoin × 1.0，可用 totalCoin 精确造分
      const flatGift = Number(Object.entries(ACTIVITY_GIFTS).find(([, b]) => b === 1)?.[0] ?? 0);
      if (flatGift === 0) this.skip('ACTIVITY_GIFTS 中无 buff=1.0 的活动礼物');
      const send = async (locale: string, sender: number, receiver: number, coin: number): Promise<void> => {
        await this.didibus.sendGift({
          sender,
          receiver,
          giftId: flatGift,
          giftPrice: coin,
          totalCoin: coin,
          sendTimeMs: localTs(locale, T_D1),
          debugTs: localIso(locale, T_D1),
          locale,
        });
      };
      // in 收礼：B←S1 500 / S2 300 / S3 200（=1000）；A←S2 600 / S5 50（=650）；C←S4 400 / S1 100（=500）
      await send('in', S1, USER_B, 500);
      await send('in', S2, USER_B, 300);
      await send('in', S3, USER_B, 200);
      await send('in', S2, USER_A, 600);
      await send('in', S5, USER_A, 50);
      await send('in', S4, USER_C, 400);
      await send('in', S1, USER_C, 100);
      // ko：S6→B 100（时区覆盖验证）
      await send('ko', S6, USER_B, 100);
      // 造数自检（走 /rank 接口）：送礼总榜 S2=900/S1=600/S4=400/S3=200/S5=50；收礼总榜 B=1000/A=650/C=500
      const iso = localIso(LOCALE, T_D1);
      const expectSend: Array<[number, number]> = [[S1, 600], [S2, 900], [S3, 200], [S4, 400], [S5, 50]];
      const expectRecv: Array<[number, number]> = [[USER_B, 1000], [USER_A, 650], [USER_C, 500]];
      const problems: string[] = [];
      for (const [u, s] of expectSend) {
        const real = await this.didibus.rankScoreOf(TOPIC_SEND, u, LOCALE, iso);
        if (real !== s) problems.push(`send ${u}=${real}（期望 ${s}）`);
      }
      for (const [u, s] of expectRecv) {
        const real = await this.didibus.rankScoreOf(TOPIC_RECV, u, LOCALE, iso);
        if (real !== s) problems.push(`recv ${u}=${real}（期望 ${s}）`);
      }
      if (problems.length > 0) throw new Error(`造数自检失败：${problems.join('；')}`);
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
      // 注意：活动期内的提前 cron 会顺带结算已结束的 0924 日榜（catch-up，正确行为），
      // S1/S2/S4 会额外含日榜奖励；此处只断言总榜奖励存在性 + Top1 CUSTOM 无实发
      const s1Awards = await this.playerAwardIds(S1);
      const s4Awards = await this.playerAwardIds(S4);
      const s2Rows = (await this.didibus.queryAwardRecords({ player: S2 })).filter((r) => String(r['topic']) === TOPIC_SEND);
      const s2ViewOnly = s2Rows.filter((r) => String(r['mod']) === 'view_only');
      const dailyStage1 = (await this.awardIdsOf(AWARD_SEND_DAILY, 1)).sort();
      const s2Adds = s2Rows.filter((r) => String(r['mod']) !== 'view_only').map((r) => int(r['award_id'])).sort();
      const s1Ok = stage2Ids.every((id) => s1Awards.includes(id));
      const s4Ok = stage3Ids.every((id) => s4Awards.includes(id));
      // S2（送礼总榜 Top1 CUSTOM）：view_only 恰好 1 条；gift-send 实发仅允许日榜 stage1 奖励（总榜奖励不得实发）
      const s2Ok = s2ViewOnly.length === 1 && JSON.stringify(s2Adds) === JSON.stringify(dailyStage1);
      return {
        expect: `S1 含 stage2 奖励 ${JSON.stringify(stage2Ids)}，S4 含 stage3 ${JSON.stringify(stage3Ids)}，S2 view_only=1 且实发仅日榜 stage1 ${JSON.stringify(dailyStage1)}`,
        real: `S1=${JSON.stringify(s1Awards)}，S4=${JSON.stringify(s4Awards)}，S2 view_only=${s2ViewOnly.length} 条/实发=${JSON.stringify(s2Adds)}`,
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

    await this.check('大区隔离：ko 收礼贡献 Top1 奖励发给 ko 本地贡献者(S6)，不跨大区串数据', async (): Promise<CheckResult> => {
      this.needActive();
      const stage1Ids = (await this.awardIdsOf(AWARD_RECV_CONTRIBUTOR, 1)).sort();
      if (stage1Ids.length === 0) {
        return { expect: 'gift-recv-contributor stage1 配置存在', real: '缺失', pass: false, message: '预置数据缺失：mod_common_award gift-recv-contributor' };
      }
      const s6Recv = (await this.didibus.queryAwardRecords({ player: S6, topic: TOPIC_RECV })).map((r) => int(r['award_id']));
      const s1Recv = (await this.didibus.queryAwardRecords({ player: S1, topic: TOPIC_RECV })).map((r) => int(r['award_id']));
      // S1 仅是 in 大区 B 的贡献 Top1，只应在 in 结算时得 1 次 stage1；ko 大区 B 的贡献 Top1 是 S6
      const s1Stage1Count = s1Recv.filter((id) => stage1Ids.includes(id)).length;
      const s6Ok = stage1Ids.every((id) => s6Recv.includes(id));
      return {
        expect: `S6 含 stage1 贡献奖励 ${JSON.stringify(stage1Ids)}；S1 的 stage1 贡献奖励恰好 1 次（仅 in 结算）`,
        real: `S6 gift-recv=${JSON.stringify(s6Recv)}；S1 stage1 次数=${s1Stage1Count}`,
        pass: s6Ok && s1Stage1Count === 1,
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
