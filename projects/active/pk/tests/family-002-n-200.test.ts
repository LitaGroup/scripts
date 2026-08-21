import { FamilySettleBase } from './_lib/FamilySettleBase.ts';
import { MEMBER_AWARD_EXPECTED } from './_lib/expectedAwards.ts';

class Family002N200 extends FamilySettleBase {
  constructor() {
    super({
      topic: 'family_in_n_200',
      hasInit: false,
      statusToSet: 100,
      sendDay: '20260818',
      sendDebugTs: '2026-08-18T10:00:00+07:00',
      settleTs: '2026-08-20T00:10:23+07:00',
      settleTitle: '调用 family-settle 结算海选赛',
      rankDebugTs: '2026-08-20T13:24:23+08:00',
      rankCount: 200,
      topN: 3,
      memberExpected: MEMBER_AWARD_EXPECTED.family_in_n_200,
      selfExpected: {},
    });
  }
}

await new Family002N200().execute();
