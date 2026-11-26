import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { Pk202808Base, int } from './_lib/Pk202808Base.ts';
import { ROOM_STAGES, bjIsoFor } from './_lib/constants.ts';
import { EXPECTED_AWARDS } from './_lib/awards.ts';

class Pk012RoomInStages extends Pk202808Base {
  constructor() {
    super();
    this.total = 0;
  }

  protected async run(): Promise<void> {
    const locale = 'in';
    const rooms = this.requireRooms(locale, 201);
    const contributor = (room: number) => 950_000_000 + (room % 1_000_000);

    for (const stage of ROOM_STAGES) await this.cleanTopic(stage.topic, locale);

    let previous: number[] = [];
    for (let i = 0; i < ROOM_STAGES.length; i++) {
      const stage = ROOM_STAGES[i]!;
      const label = stage.topic;

      await this.act(`[${locale}] ${label} 造数/继承`, async () => {
        if (i === 0) {
          await this.seedStage(stage.topic, locale, rooms, { baseScore: 20000, step: 50, contributorOf: (room) => contributor(room) });
        } else {
          const inherited = await this.pk.queryRankRecords(stage.topic, { key: '-', locale });
          if (inherited.length === 0) {
            await this.initStage(locale, stage.topic, stage.startLocal ?? '2028-08-20 00:00:00');
            const again = await this.pk.queryRankRecords(stage.topic, { key: '-', locale });
            if (again.length === 0) throw new Error(`${label} 未从上一阶段名单继承`);
          }
        }
        await this.sendGift({
          locale,
          sender: contributor(previous[0] ?? rooms[0]!),
          receiver: rooms[0]!,
          roomId: previous[0] ?? rooms[0]!,
          giftId: 10561,
          totalCoin: 1000,
          sendTimeMs: this.localMs(locale, `${stage.startLocal ? stage.startLocal.slice(0, 10) : '2028-08-18'} 10:00:00`),
          debugTs: bjIsoFor(locale, `${stage.startLocal ? stage.startLocal.slice(0, 10) : '2028-08-18'} 10:00:00`),
        });
      });

      await this.check(`[${label}] ${i === 0 ? 'Top1 新增 1100' : '继承上阶段原始分 100% 后再加 1100'}`, async (): Promise<CheckResult> => {
        const records = await this.pk.queryRankRecords(stage.topic, { key: '-', locale });
        const top = [...records].sort((a, b) => Number(b['amount']) - Number(a['amount']))[0];
        if (!top) throw new Error('无流水');
        const sum = records
          .filter((r) => String(r['player']) === String(top['player']))
          .reduce((s, r) => s + Number(r['amount']), 0);
        if (i === 0) {
          return { expect: 'Top1 = 20000+1100', real: String(sum), pass: Math.abs(sum - 21100) <= 1 };
        }
        const prevRecords = await this.pk.queryRankRecords(ROOM_STAGES[i - 1]!.topic, { key: '-', locale });
        const prevSum = prevRecords
          .filter((r) => String(r['player']) === String(top['player']))
          .reduce((s, r) => s + Number(r['amount']), 0);
        return {
          expect: `Top1 = 上阶段 ${prevSum} + 1100`,
          real: String(sum),
          pass: Math.abs(sum - (prevSum + 1100)) <= 1,
        };
      });

      await this.act(`[${locale}] ${label} 本地 23:40 结算并初始化下一阶段`, async () => {
        const settleDt = stage.lockLocal.replace('23:30:00', '23:40:00');
        await this.runCronAt(locale, settleDt);
      });

      // 结算后读取晋级名单（下一步依赖）
      const list = await this.pk.queryPlayerList(stage.topic, locale);
      const expectedCount = Math.min(stage.top, i === 0 ? rooms.length : previous.length || stage.top);
      await this.check(`[${label}] 晋级名单数量=${expectedCount}`, async (): Promise<CheckResult> => {
        return { expect: String(expectedCount), real: String(list.length), pass: list.length === expectedCount };
      });

      if (i === 0 || i === ROOM_STAGES.length - 1) {
        await this.check(`[${label}] 房间/贡献者奖励与配置一致`, async (): Promise<CheckResult> => {
          const sorted = [...(await this.pk.queryRankRecords(stage.topic, { key: '-', locale }))]
            .reduce<Map<number, number>>((m, r) => {
              const p = int(r['player']);
              m.set(p, (m.get(p) ?? 0) + Number(r['amount']));
              return m;
            }, new Map());
          const top = [...sorted.entries()].sort((a, b) => b[1] - a[1]);
          const recipients: Record<number, Array<{ player: number; playerType: string }>> = {};
          top.slice(0, 3).forEach(([p], idx) => { recipients[idx + 1] = [{ player: p, playerType: 'ROOM' }]; });
          const add = EXPECTED_AWARDS[stage.topic]!.filter((r) => r.mod === 'ADD' && r.playerType === 'ROOM');
          await this.assertSettleAwards(stage.topic, add, recipients);
          const contributors = await this.pk.queryRankRecords(stage.topic, { key: '-', locale });
          const byContributor = new Map<number, number>();
          for (const r of contributors) {
            const c = int(r['contributor']);
            if (c > 0) byContributor.set(c, (byContributor.get(c) ?? 0) + Number(r['amount']));
          }
          const topC = [...byContributor.entries()].sort((a, b) => b[1] - a[1])[0];
          if (topC) {
            await this.assertSettleAwards(
              stage.topic,
              EXPECTED_AWARDS[`${stage.topic}-contributor`]!.filter((r) => r.stage === 1),
              { 1: [{ player: topC[0], playerType: 'USER' }] },
            );
          }
          return { expect: '奖励正确', real: '正确', pass: true };
        });
      }

      previous = list.map((r) => int(r['player']));
    }
  }
}

await new Pk012RoomInStages().execute();