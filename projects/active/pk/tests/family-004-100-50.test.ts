import { FamilySettleBase } from './_lib/FamilySettleBase.ts';
import { MEMBER_AWARD_EXPECTED, SELF_AWARD_EXPECTED } from './_lib/expectedAwards.ts';

class Family004N50 extends FamilySettleBase {
  constructor() {
    super({
      topic: 'family_in_100_50',
      prevTopic: 'family_in_200_100',
      initTs: '2026-08-22T23:40:23+07:00',
      hasInit: true,
      statusToSet: 0,
      sendDay: '20260824',
      sendDebugTs: '2026-08-24T10:00:00+07:00',
      settleTs: '2026-08-25T00:10:23+07:00',
      settleTitle: '调用 family-settle 结算 100进50',
      rankDebugTs: '2026-08-25T13:24:23+08:00',
      rankCount: 100,
      topN: 3,
      memberExpected: MEMBER_AWARD_EXPECTED.family_in_100_50,
      selfExpected: SELF_AWARD_EXPECTED.family_in_100_50,
    });
  }
}

await new Family004N50().execute();
