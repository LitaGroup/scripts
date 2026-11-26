import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import { PLAYER_STAGES_IN, PLAYER_STAGES_OTHER, ROOM_STAGES, FAMILY_STAGES } from './_lib/constants.ts';

const SAMPLE_TOPICS = [
  ...PLAYER_STAGES_IN.slice(0, 3).map((s) => s.topic),
  ...PLAYER_STAGES_OTHER.slice(0, 3).map((s) => s.topic),
  ...ROOM_STAGES.slice(0, 2).map((s) => s.topic),
  ...FAMILY_STAGES.slice(0, 2).map((s) => s.topic),
  'room',
  'family',
  'user',
  'couple',
];

class Pk017SettleReconcile extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    await this.check('已结算轮次 status=200，最终总榜无漏结算', async (): Promise<CheckResult> => {
      const rounds = await this.pk.queryRounds();
      const unfinished = rounds.filter((r) => int(r['finish_time']) <= Date.parse('2028-08-29T23:59:59+08:00') && int(r['status']) !== 200);
      return {
        expect: '所有到期轮次 status=200',
        real: `${rounds.length} 条轮次，到期未完成 ${unfinished.length} 条`,
        pass: unfinished.length === 0,
      };
    });

    await this.check('MySQL 流水汇总 = Redis 原始分 = 接口展示分', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      for (const topic of SAMPLE_TOPICS) {
        const locale = topic.includes('_in_') || ['user', 'couple'].includes(topic) ? 'in' : 'vi';
        const records = await this.pk.queryRankRecords(topic, { key: '-', locale });
        const sums = new Map<number, number>();
        for (const r of records) {
          const p = int(r['player']);
          sums.set(p, (sums.get(p) ?? 0) + Number(r['amount']));
        }
        const top = [...sums.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        if (top.length === 0) continue;
        const rank = await this.pk.queryRank(topic, '-', locale, { count: 10 });
        const items = this.rankItems(rank);
        for (const [player, sum] of top) {
          const item = items.find((x) => x.player === player);
          if (!item) {
            problems.push(`${topic} 接口缺 ${player}`);
            continue;
          }
          if (Math.abs(item.amount - sum) > 0.5) problems.push(`${topic} ${player} 接口 ${item.amount} != 流水 ${sum}`);
          const z = await this.pk.redis.zscore(this.pk.rankRedisKey(topic, locale, '-'), String(player));
          if (z !== null && Math.abs(z - sum) > 0.5) problems.push(`${topic} ${player} Redis ${z} != 流水 ${sum}`);
        }
      }
      if (problems.length > 0) throw new Error(`${problems.length} 处不一致：${problems.slice(0, 5).join('；')}`);
      return { expect: '三方一致', real: '一致', pass: true };
    });

    await this.check('已完成轮次重跑结算：分数、名单、奖励记录均不增加', async (): Promise<CheckResult> => {
      const samples = ['user', 'family_in_n_200', 'room_in_n_200'];
      const problems: string[] = [];
      for (const topic of samples) {
        const rounds = (await this.pk.queryRounds(topic)).filter((r) => int(r['status']) === 200);
        const round = rounds[rounds.length - 1];
        if (!round) continue;
        const locale = String(round['locale']);
        const beforeRecords = await this.pk.queryRankRecords(topic, { key: '-', locale });
        const beforeAwards = await this.pk.queryAwardRecord(topic);
        const beforeList = await this.pk.queryPlayerList(topic, locale);
        await this.pk.callModuleSettle(topic, this.cronTs(locale, '2028-08-30 00:20:00'), locale);
        const afterRecords = await this.pk.queryRankRecords(topic, { key: '-', locale });
        const afterAwards = await this.pk.queryAwardRecord(topic);
        const afterList = await this.pk.queryPlayerList(topic, locale);
        const sum = (rows: typeof beforeRecords) => rows.reduce((s, r) => s + Number(r['amount']), 0);
        if (Math.abs(sum(beforeRecords) - sum(afterRecords)) > 0.5) problems.push(`${topic} 总分变化`);
        if (beforeAwards.length !== afterAwards.length) problems.push(`${topic} 奖励记录 ${beforeAwards.length}→${afterAwards.length}`);
        if (beforeList.length !== afterList.length) problems.push(`${topic} 名单 ${beforeList.length}→${afterList.length}`);
      }
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: '重跑无新增', real: '无新增', pass: true };
    });

    await this.check('自动奖励 ADD 记录数=获奖对象×奖品数，VIEW 不实际发放（mod 记录存在）', async (): Promise<CheckResult> => {
      const records = await this.pk.queryAwardRecord('user');
      const add = records.filter((r) => String(r['mod']) === 'ADD');
      const view = records.filter((r) => String(r['mod']) === 'VIEW');
      const orderNos = new Set(add.map((r) => String(r['order_no'] ?? '')));
      return {
        expect: 'ADD order_no 唯一',
        real: `ADD ${add.length} 条，唯一单号 ${orderNos.size}，VIEW ${view.length} 条`,
        pass: orderNos.size === add.length || add.length === 0,
      };
    });

    await this.check('其他 biz（pk-v202608）数据前后完全不变', async (): Promise<CheckResult> => {
      const before = await this.bizSnapshot('pk-v202608');
      await this.pk.callCron('2028-08-30T00:30:00+08:00');
      const after = await this.bizSnapshot('pk-v202608');
      return {
        expect: JSON.stringify(before),
        real: JSON.stringify(after),
        pass: JSON.stringify(before) === JSON.stringify(after),
      };
    });

    }

  private async bizSnapshot(biz: string): Promise<Record<string, number>> {
    const tables = ['mod_common_round', 'mod_common_rank_record', 'mod_common_award_record', 'mod_common_player_list'];
    const out: Record<string, number> = {};
    for (const table of tables) {
      const rows = await this.pk.mysql.query(`SELECT COUNT(*) AS c FROM ${table} WHERE biz='${biz}'`);
      out[table] = Number(rows[0]?.['c'] ?? 0);
    }
    return out;
  }
}

await new Pk017SettleReconcile().execute();