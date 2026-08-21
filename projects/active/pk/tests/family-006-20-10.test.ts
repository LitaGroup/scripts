import { FamilySettleBase } from './_lib/FamilySettleBase.ts';
import { MEMBER_AWARD_EXPECTED, SELF_AWARD_EXPECTED } from './_lib/expectedAwards.ts';

class Family006N10 extends FamilySettleBase {
  constructor() {
    super({
      topic: 'family_in_20_10',
      prevTopic: 'family_in_50_20',
      initTs: '2026-08-26T23:40:23+07:00',
      hasInit: true,
      statusToSet: 0,
      sendDay: '20260828',
      sendDebugTs: '2026-08-28T10:00:00+07:00',
      settleTs: '2026-08-29T00:10:23+07:00',
      settleTitle: '调用 family-settle 结算 20进10',
      rankDebugTs: '2026-08-29T13:24:23+08:00',
      rankCount: 20,
      topN: 3,
      memberExpected: MEMBER_AWARD_EXPECTED.family_in_20_10,
      selfExpected: SELF_AWARD_EXPECTED.family_in_20_10,
    });
  }
}

await new Family006N10().execute();
