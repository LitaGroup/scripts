import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import {
  BIZ,
  FAMILY_STAGES,
  PK_MODULES,
  PLAYER_REVIVAL_IN,
  PLAYER_REVIVAL_OTHER,
  PLAYER_STAGES_IN,
  PLAYER_STAGES_OTHER,
  ROOM_STAGES,
} from './_lib/constants.ts';

const RANK_MODULES = [
  ...PLAYER_STAGES_IN.map((s) => s.topic),
  ...PLAYER_STAGES_OTHER.map((s) => s.topic),
  PLAYER_REVIVAL_IN,
  PLAYER_REVIVAL_OTHER,
  ...ROOM_STAGES.map((s) => s.topic),
  'room',
  ...FAMILY_STAGES.map((s) => s.topic),
  'family',
  'user',
  'couple',
];

class Pk016QueryApi extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    await this.check('28 个 RankModule 的 /rank 与 /award-detail 可查询', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      if (RANK_MODULES.length !== 28) problems.push(`RankModule 数量 ${RANK_MODULES.length}`);
      for (const topic of RANK_MODULES) {
        const locale = topic.includes('_in_') || ['family_in_n_200', 'room_in_n_200', 'user', 'couple'].includes(topic) ? 'in' : 'vi';
        const key = topic === 'user' || topic === 'couple' ? '-' : '-';
        try {
          const rank = await this.pk.queryRank(topic, key, locale, { count: 10 });
          const round = (rank['round'] ?? {}) as Record<string, unknown>;
          if (round['biz'] !== undefined && String(round['biz']) !== BIZ) problems.push(`${topic} round.biz=${round['biz']}`);
          const items = (rank['rankResult'] ?? []) as Array<Record<string, unknown>>;
          for (const it of items.slice(0, 3)) {
            if (it['rank'] === undefined || it['amount'] === undefined) problems.push(`${topic} 榜单项缺 rank/amount`);
          }
          await this.pk.queryAwardDetail(topic, locale);
        } catch (e) {
          problems.push(`${topic}: ${(e as Error).message.slice(0, 80)}`);
        }
      }
      if (problems.length > 0) throw new Error(`${problems.length} 处异常：${problems.slice(0, 5).join('；')}`);
      return { expect: '28 个 RankModule 可查询', real: '全部可查询', pass: true };
    });

    await this.check('4 个 PkModule 的 /score 可查询且 key 与请求一致', async (): Promise<CheckResult> => {
      const problems: string[] = [];
      for (const [module, cfg] of Object.entries(PK_MODULES)) {
        const locale = cfg.joins === 'in' ? 'in' : 'vi';
        const key = cfg.stages[0]!;
        try {
          const resp = await this.pk.queryScore(module, key, locale);
          const round = (resp['round'] ?? {}) as Record<string, unknown>;
          if (round['key'] !== undefined && String(round['key']) !== key) problems.push(`${module} round.key=${round['key']}`);
        } catch (e) {
          problems.push(`${module}: ${(e as Error).message.slice(0, 80)}`);
        }
      }
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: '4 个 PkModule 可查询', real: '全部可查询', pass: true };
    });

    await this.check('贡献者接口最多返回 Top20 且按贡献降序', async (): Promise<CheckResult> => {
      const topic = 'room_in_n_200';
      const rank = await this.pk.queryRank(topic, '-', 'in', { count: 1 });
      const top = this.rankItems(rank)[0];
      if (!top) this.skip('room 榜为空，无法校验贡献者');
      const resp = await this.pk.queryContributor(topic, '-', top.player, 'in');
      const list = (resp['rankResult'] ?? []) as Array<Record<string, unknown>>;
      const amounts = list.map((r) => Number(r['amount'] ?? 0));
      const desc = amounts.every((v, i) => i === 0 || amounts[i - 1]! >= v);
      return {
        expect: '≤20 条且降序',
        real: `${list.length} 条，降序=${desc}`,
        pass: list.length <= 20 && desc,
      };
    });

    await this.check('登录用户查询 /get-pair：player1 始终为自己，无对阵返回 endTimestamp=0', async (): Promise<CheckResult> => {
      const user = (this.fx.users?.in ?? this.syntheticIds('user', 'in', 1, 9000))[0]!;
      const resp = await this.pk.queryPair(user, 'in', '2028-08-23T10:00:00+07:00');
      const p1 = (resp['player1'] ?? null) as Record<string, unknown> | null;
      const end = int(resp['endTimestamp'] ?? 0);
      const ok = p1 === null || int(p1['id']) === user || end === 0;
      return {
        expect: 'player1 为自己或空对阵 endTimestamp=0',
        real: `player1=${p1 ? p1['id'] : 'null'} end=${end}`,
        pass: ok,
      };
    });

    await this.check('公网调用 init/settle/init-round/player-settle-and-init 被拒绝', async (): Promise<CheckResult> => {
      const paths = [
        `active/v3/${BIZ}/m/user/init`,
        `active/v3/${BIZ}/m/user/settle`,
        `active/v3/${BIZ}/m/player_in_n_200/init-round`,
        `active/v3/${BIZ}/p/player-settle-and-init`,
      ];
      const problems: string[] = [];
      for (const path of paths) {
        const raw = await this.pk.requestRaw(path, {
          method: 'POST',
          body: {},
          locale: 'in',
          debugTimestamp: '2028-08-18T10:00:00+07:00',
        });
        const status = Number(raw.body['status'] ?? 0);
        if (raw.httpStatus < 400 && status === 0) problems.push(`${path} 未被拒绝（HTTP ${raw.httpStatus} status=0）`);
      }
      if (problems.length > 0) throw new Error(problems.join('；'));
      return { expect: '全部拒绝', real: '全部拒绝', pass: true };
    });
  }
}

await new Pk016QueryApi().execute();