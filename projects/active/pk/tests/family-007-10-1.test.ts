import { FamilySettleBase } from './_lib/FamilySettleBase.ts';
import { SELF_AWARD_EXPECTED } from './_lib/expectedAwards.ts';

class Family007N1 extends FamilySettleBase {
  constructor() {
    super({
      topic: 'family_in_10_1',
      prevTopic: 'family_in_20_10',
      initTs: '2026-08-28T23:40:23+07:00',
      hasInit: true,
      statusToSet: 0,
      sendDay: '20260829',
      sendDebugTs: '2026-08-29T10:00:00+07:00',
      settleTs: '2026-08-30T00:10:23+07:00',
      settleTitle: '调用 family-settle 结算决赛',
      rankDebugTs: '2026-08-30T13:24:23+08:00',
      rankCount: 10,
      topN: 3,
      memberExpected: {},
      selfExpected: SELF_AWARD_EXPECTED.family_in_10_1,
      litaFinal: true,
    });
  }
}

await new Family007N1().execute();
