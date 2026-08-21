import { FamilySettleBase } from './_lib/FamilySettleBase.ts';
import { MEMBER_AWARD_EXPECTED, SELF_AWARD_EXPECTED } from './_lib/expectedAwards.ts';

class Family005N20 extends FamilySettleBase {
  constructor() {
    super({
      topic: 'family_in_50_20',
      prevTopic: 'family_in_100_50',
      initTs: '2026-08-24T23:40:23+07:00',
      hasInit: true,
      statusToSet: 0,
      sendDay: '20260826',
      sendDebugTs: '2026-08-26T10:00:00+07:00',
      settleTs: '2026-08-27T00:10:23+07:00',
      settleTitle: '调用 family-settle 结算 50进20',
      rankDebugTs: '2026-08-27T13:24:23+08:00',
      rankCount: 50,
      topN: 3,
      memberExpected: MEMBER_AWARD_EXPECTED.family_in_50_20,
      selfExpected: SELF_AWARD_EXPECTED.family_in_50_20,
    });
  }
}

await new Family005N20().execute();
