import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { LOCALE, USER_A, USER_B, USER_C, RANK_USERS, ALL_USERS, TOPIC_SEND, AWARD_SEND_DAILY } from './_lib/constants.ts';
import {
  T_D1,
  T_D2,
  DAY1_KEY,
  DAY2_KEY,
  CRON_DAILY_KO,
  CRON_DAILY_PH,
  CRON_DAILY_INVI,
  CRON_DAILY_KO_DAY2,
  localIso,
} from './_lib/times.ts';
import { int } from './_lib/helpers.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

/** in 大区第 1 天日榜造数：8 人不同分值（前 6 进 Top6） */
const IN_DAY1: Array<[number, number]> = [
  [RANK_USERS[0], 600],
  [RANK_USERS[1], 500],
  [RANK_USERS[2], 400],
  [RANK_USERS[3], 300],
  [RANK_USERS[4], 200],
  [RANK_USERS[5], 100],
  [RANK_USERS[6], 80],
  [RANK_USERS[7], 60],
];
const IN_TOP6 = IN_DAY1.slice(0, 6);

/**
 * 009-daily-settle —— 日榜结算（Cron）
 * 造数：Redis ZADD 直写日榜分片（003 已覆盖 consumer 真实链路）。
 * 触发：__cron 模拟时间用北京时间、精确到 cron 分钟（ko=23:05 / ph=00:05 / in+vi=01:05）。
 */
class DailySettle009 extends DidibusTestBase {
  private resultCountBeforeIdem = 0;
  private awardCountBeforeIdem = 0;

  constructor() {
    super();
    this.total = 18;
  }

  /** 某大区某日榜的结算结果数 */
  private async dailyResultCount(locale: string, dayKey: string): Promise<number> {
    const rows = await this.didibus.queryRankResults(TOPIC_SEND, { locale, keyPrefix: dayKey });
    return rows.length;
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

    await this.check('榜单轮次已初始化：gift-send 各大区总榜(-)+日榜(20260924) 存在', async (): Promise<CheckResult> => {
      this.needActive();
      const rows = await this.didibus.queryRounds(TOPIC_SEND);
      const problems: string[] = [];
      for (const locale of ['in', 'vi', 'ph', 'ko']) {
        const keys = rows.filter((r) => String(r['locale']) === locale).map((r) => String(r['key']));
        if (!keys.includes('-')) problems.push(`${locale} 缺总榜(-)`);
        if (!keys.includes(DAY1_KEY)) problems.push(`${locale} 缺日榜(${DAY1_KEY})`);
      }
      return {
        expect: '4 大区均有 key=- 与 20260924',
        real: problems.length === 0 ? `齐全（共 ${rows.length} 条）` : problems.join('；'),
        pass: problems.length === 0,
      };
    });

    await this.act('构造第 1 天日榜数据：in 8 人（600~60）+ ko/ph/vi 各 1 人', async () => {
      this.needActive();
      for (const [user, score] of IN_DAY1) {
        await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_SEND, DAY1_KEY), user, score);
      }
      await this.didibus.rankSeed(this.didibus.rankKey('ko', TOPIC_SEND, DAY1_KEY), USER_A, 50);
      await this.didibus.rankSeed(this.didibus.rankKey('ph', TOPIC_SEND, DAY1_KEY), USER_C, 50);
      await this.didibus.rankSeed(this.didibus.rankKey('vi', TOPIC_SEND, DAY1_KEY), USER_B, 50);
    });

    await this.act('触发 ko 日榜结算（__cron 北京 09-23 23:05）', async () => {
      this.needActive();
      await this.didibus.runCron(CRON_DAILY_KO);
    });

    await this.check('时区覆盖 1/3：仅 ko 第 1 天子榜已结算', async (): Promise<CheckResult> => {
      this.needActive();
      const [ko, ph, vi, ind] = await Promise.all([
        this.dailyResultCount('ko', DAY1_KEY),
        this.dailyResultCount('ph', DAY1_KEY),
        this.dailyResultCount('vi', DAY1_KEY),
        this.dailyResultCount('in', DAY1_KEY),
      ]);
      return {
        expect: 'ko>0，ph/vi/in=0',
        real: `ko=${ko}，ph=${ph}，vi=${vi}，in=${ind}`,
        pass: ko > 0 && ph === 0 && vi === 0 && ind === 0,
      };
    });

    await this.act('触发 ph 日榜结算（__cron 北京 09-24 00:05）', async () => {
      this.needActive();
      await this.didibus.runCron(CRON_DAILY_PH);
    });

    await this.check('时区覆盖 2/3：ph 已结算，in/vi 未结算', async (): Promise<CheckResult> => {
      this.needActive();
      const [ph, vi, ind] = await Promise.all([
        this.dailyResultCount('ph', DAY1_KEY),
        this.dailyResultCount('vi', DAY1_KEY),
        this.dailyResultCount('in', DAY1_KEY),
      ]);
      return {
        expect: 'ph>0，vi/in=0',
        real: `ph=${ph}，vi=${vi}，in=${ind}`,
        pass: ph > 0 && vi === 0 && ind === 0,
      };
    });

    await this.act('触发 in/vi 日榜结算（__cron 北京 09-24 01:05）', async () => {
      this.needActive();
      await this.didibus.runCron(CRON_DAILY_INVI);
    });

    await this.check('时区覆盖 3/3：in/vi 均已结算', async (): Promise<CheckResult> => {
      this.needActive();
      const [vi, ind] = await Promise.all([this.dailyResultCount('vi', DAY1_KEY), this.dailyResultCount('in', DAY1_KEY)]);
      return {
        expect: 'in>0，vi>0',
        real: `in=${ind}，vi=${vi}`,
        pass: ind > 0 && vi > 0,
      };
    });

    await this.check('in 第 1 天 Top6 结算结果与分值正确', async (): Promise<CheckResult> => {
      this.needActive();
      const rows = await this.didibus.queryRankResults(TOPIC_SEND, { locale: 'in', keyPrefix: DAY1_KEY });
      const got = rows.map((r) => `${r['player']}:${int(r['total_amount'])}`).sort();
      const expect = IN_TOP6.map(([u, s]) => `${u}:${s}`).sort();
      return {
        expect: JSON.stringify(expect),
        real: JSON.stringify(got),
        pass: JSON.stringify(got) === JSON.stringify(expect),
      };
    });

    await this.check('日榜发奖：Top1~6 各得 gift-send-daily stage=排名 对应奖励', async (): Promise<CheckResult> => {
      this.needActive();
      const config = await this.didibus.queryAwardConfig(AWARD_SEND_DAILY);
      if (config.length === 0) {
        return { expect: 'gift-send-daily 配置存在', real: '0 条', pass: false, message: '预置数据缺失：mod_common_award gift-send-daily' };
      }
      const problems: string[] = [];
      for (let rank = 1; rank <= 6; rank++) {
        const [player] = IN_TOP6[rank - 1];
        const expectIds = config.filter((c) => int(c['stage']) === rank).map((c) => int(c['award_id'])).sort();
        const records = await this.didibus.queryAwardRecords({ player });
        const gotIds = records.map((r) => int(r['award_id'])).sort();
        const hit = expectIds.every((id) => gotIds.includes(id));
        if (!hit) problems.push(`rank${rank}/player${player}：期望含 ${JSON.stringify(expectIds)}，实际 ${JSON.stringify(gotIds)}`);
      }
      return {
        expect: 'Top1~6 奖励按 stage=排名 发放',
        real: problems.length === 0 ? '全部正确' : problems.join('；'),
        pass: problems.length === 0,
      };
    });

    await this.act('重复触发 in/vi 日榜结算（幂等验证）', async () => {
      this.needActive();
      this.resultCountBeforeIdem = (await this.didibus.queryRankResults(TOPIC_SEND, { keyPrefix: DAY1_KEY })).length;
      const awardRows = await this.didibus.queryAwardRecords({});
      this.awardCountBeforeIdem = awardRows.length;
      await this.didibus.runCron(CRON_DAILY_INVI);
    });

    await this.check('幂等：重复触发不产生新结果/奖励', async (): Promise<CheckResult> => {
      this.needActive();
      const results = (await this.didibus.queryRankResults(TOPIC_SEND, { keyPrefix: DAY1_KEY })).length;
      const awards = (await this.didibus.queryAwardRecords({})).length;
      return {
        expect: `result=${this.resultCountBeforeIdem}，award=${this.awardCountBeforeIdem}（不变）`,
        real: `result=${results}，award=${awards}`,
        pass: results === this.resultCountBeforeIdem && awards === this.awardCountBeforeIdem,
      };
    });

    await this.act('构造第 2 天数据：ko（A=70）+ in（13128=70）日榜', async () => {
      this.needActive();
      await this.didibus.rankSeed(this.didibus.rankKey('ko', TOPIC_SEND, DAY2_KEY), USER_A, 70);
      await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_SEND, DAY2_KEY), RANK_USERS[0], 70);
      this.log(`T_D2=${localIso(LOCALE, T_D2)}`);
    });

    await this.act('触发 ko 第 2 天日榜结算（__cron 北京 09-24 23:05）', async () => {
      this.needActive();
      await this.didibus.runCron(CRON_DAILY_KO_DAY2);
    });

    await this.check('未结束不误结算：ko 第 2 天已结算，in 第 2 天（未结束）不结算', async (): Promise<CheckResult> => {
      this.needActive();
      const ko = await this.dailyResultCount('ko', DAY2_KEY);
      const ind = await this.dailyResultCount('in', DAY2_KEY);
      return {
        expect: 'ko>0，in=0',
        real: `ko=${ko}，in=${ind}`,
        pass: ko > 0 && ind === 0,
      };
    });
  }
}

await new DailySettle009().execute();
