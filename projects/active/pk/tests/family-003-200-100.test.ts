import { FamilySettleBase } from './_lib/FamilySettleBase.ts';
import { MEMBER_AWARD_EXPECTED } from './_lib/expectedAwards.ts';

class Family003N100 extends FamilySettleBase {
  constructor() {
    super({
      topic: 'family_in_200_100',
      prevTopic: 'family_in_n_200',
      initTs: '2026-08-19T23:40:23+07:00',
      hasInit: true,
      statusToSet: 0,
      sendDay: '20260821',
      sendDebugTs: '2026-08-21T10:00:00+07:00',
      settleTs: '2026-08-23T00:10:23+07:00',
      settleTitle: '调用 family-settle 结算 200进100',
      rankDebugTs: '2026-08-23T13:24:23+08:00',
      rankCount: 200,
      topN: 3,
      memberExpected: MEMBER_AWARD_EXPECTED.family_in_200_100,
      selfExpected: {},
    });
  }
}

await new Family003N100().execute();
