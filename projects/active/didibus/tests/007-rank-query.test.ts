import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { USER_A, USER_B, USER_C, RANK_USERS, ALL_USERS, TOPIC_SEND, TOPIC_RECV } from './_lib/constants.ts';
import { T_D1, DAY1_KEY, localIso } from './_lib/times.ts';
import { DidibusTestBase } from './_lib/DidibusTestBase.ts';

const U1 = RANK_USERS[0]; // 13128
const U2 = RANK_USERS[1]; // 13129
const U3 = RANK_USERS[2]; // 13130

/**
 * 007-rank-query —— 榜单查询
 * 模拟时间：全部 T_D1。榜单数据用 Redis ZADD 直接造数（003 已覆盖 consumer 真实链路）。
 * 造数（in）：送礼 A=100、U1=300、U2=200；收礼 B=100、C=500。（vi）：送礼 U3=50 —— 大区隔离验证。
 */
class RankQuery007 extends DidibusTestBase {
  constructor() {
    super();
    this.total = 8;
  }

  private ts(locale: string): string {
    return localIso(locale, T_D1);
  }

  protected async run(): Promise<void> {
    await this.probeActive();

    await this.act('清理全部测试用户数据与 Redis', async () => {
      this.needActive();
      await this.didibus.cleanUsers(ALL_USERS);
      await this.didibus.cleanRedis();
    });

    await this.act('构造榜单数据（Redis 直写）：in 送礼 A=100/U1=300/U2=200、收礼 B=100/C=500；vi 送礼 U3=50', async () => {
      this.needActive();
      const d1 = DAY1_KEY;
      // in 送礼总榜 + 日榜
      await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_SEND), USER_A, 100);
      await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_SEND), U1, 300);
      await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_SEND), U2, 200);
      await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_SEND, d1), USER_A, 100);
      await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_SEND, d1), U1, 300);
      await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_SEND, d1), U2, 200);
      // in 收礼总榜
      await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_RECV), USER_B, 100);
      await this.didibus.rankSeed(this.didibus.rankKey('in', TOPIC_RECV), USER_C, 500);
      // vi 送礼总榜（大区隔离验证）
      await this.didibus.rankSeed(this.didibus.rankKey('vi', TOPIC_SEND), U3, 50);
    });

    await this.check('送礼总榜（in）：按分降序 U1(300) > U2(200) > A(100)，selfRank(A)=3', async (): Promise<CheckResult> => {
      this.needActive();
      const data = await this.didibus.rankQuery(TOPIC_SEND, USER_A, 'in', this.ts('in'));
      const list = this.didibus.parseRankList(data);
      const orderOk = list.length >= 3 && list[0].player === U1 && list[1].player === U2 && list[2].player === USER_A;
      const selfRank = data['selfRank'] as Record<string, unknown> | number | null | undefined;
      const selfRankVal = typeof selfRank === 'object' && selfRank !== null ? Number(selfRank['rank']) : Number(selfRank);
      return {
        expect: 'U1>U2>A，selfRank(A)=3',
        real: `list=${list.map((e) => `${e.player}:${e.amount}`).join(',')}，selfRank=${JSON.stringify(selfRank)}`,
        pass: orderOk && selfRankVal === 3,
      };
    });

    await this.check('收礼总榜（in）：C(500) > B(100)', async (): Promise<CheckResult> => {
      this.needActive();
      const data = await this.didibus.rankQuery(TOPIC_RECV, USER_B, 'in', this.ts('in'));
      const list = this.didibus.parseRankList(data);
      const ok = list.length >= 2 && list[0].player === USER_C && list[0].amount === 500 && list[1].player === USER_B && list[1].amount === 100;
      return {
        expect: 'C:500 > B:100',
        real: list.map((e) => `${e.player}:${e.amount}`).join(','),
        pass: ok,
      };
    });

    await this.check('日榜 Top1（领航探险，m/gift-send/round-top，in）= U1', async (): Promise<CheckResult> => {
      this.needActive();
      const data = await this.didibus.roundTop(TOPIC_SEND, USER_A, 'in', this.ts('in'));
      const str = JSON.stringify(data ?? null);
      return {
        expect: `包含 U1=${U1}`,
        real: str.slice(0, 200),
        pass: str.includes(String(U1)) && !str.includes(String(U2)),
      };
    });

    await this.check('大区隔离：in 送礼榜不含 U3，vi 送礼榜含 U3=50', async (): Promise<CheckResult> => {
      this.needActive();
      const inData = await this.didibus.rankQuery(TOPIC_SEND, USER_A, 'in', this.ts('in'));
      const inList = this.didibus.parseRankList(inData);
      const viData = await this.didibus.rankQuery(TOPIC_SEND, U3, 'vi', this.ts('vi'));
      const viList = this.didibus.parseRankList(viData);
      const inHasU3 = inList.some((e) => e.player === U3);
      const viU3 = viList.find((e) => e.player === U3);
      return {
        expect: 'in 无 U3；vi 有 U3:50',
        real: `in 含 U3=${inHasU3}；vi=${viList.map((e) => `${e.player}:${e.amount}`).join(',')}`,
        pass: !inHasU3 && viU3?.amount === 50,
      };
    });

    await this.check('/detail 聚合：account / bus / luckydraw / dailyTop1 / marquee 五块齐全', async (): Promise<CheckResult> => {
      this.needActive();
      const d = await this.didibus.detail(USER_A, 'in', this.ts('in'));
      const keys = ['account', 'bus', 'luckydraw', 'dailyTop1', 'marquee'];
      const missing = keys.filter((k) => !(k in d));
      return {
        expect: `含 ${keys.join('/')}`,
        real: `实际字段=${Object.keys(d).join(',')}`,
        pass: missing.length === 0,
      };
    });
  }
}

await new RankQuery007().execute();
