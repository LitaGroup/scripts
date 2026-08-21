export type AwardTuple = [awardType: string, awardId: number, awardCount: number, expireExpress: string];

export type ExpectedAwards = Record<number, AwardTuple[]>;

export const MEMBER_AWARD_EXPECTED: Record<string, ExpectedAwards> = {
  family_in_n_200: {
    1: [['NAMEPLATE', 8473, 1, 'P5D']],
    2: [['NAMEPLATE', 8473, 1, 'P3D']],
    3: [['NAMEPLATE', 8473, 1, 'P1D']],
  },
  family_in_200_100: {
    1: [['NAMEPLATE', 8474, 1, 'P5D']],
    2: [['NAMEPLATE', 8474, 1, 'P3D']],
    3: [['NAMEPLATE', 8474, 1, 'P1D']],
  },
  family_in_100_50: {
    1: [['NAMEPLATE', 8475, 1, 'P5D']],
    2: [['NAMEPLATE', 8475, 1, 'P3D']],
    3: [['NAMEPLATE', 8475, 1, 'P1D']],
  },
  family_in_50_20: {
    1: [['NAMEPLATE', 8476, 1, 'P5D']],
    2: [['NAMEPLATE', 8476, 1, 'P3D']],
    3: [['NAMEPLATE', 8476, 1, 'P1D']],
  },
  family_in_20_10: {
    1: [['NAMEPLATE', 8477, 1, 'P5D']],
    2: [['NAMEPLATE', 8477, 1, 'P3D']],
    3: [['NAMEPLATE', 8477, 1, 'P1D']],
  },
};

export const SELF_AWARD_EXPECTED: Record<string, ExpectedAwards> = {
  family_in_100_50: {
    1: [['FAMILY_HEADBOX', 15, 1, 'P5D']],
    2: [['FAMILY_HEADBOX', 15, 1, 'P3D']],
    3: [['FAMILY_HEADBOX', 15, 1, 'P1D']],
  },
  family_in_50_20: {
    1: [['FAMILY_HEADBOX', 16, 1, 'P5D']],
    2: [['FAMILY_HEADBOX', 16, 1, 'P3D']],
    3: [['FAMILY_HEADBOX', 16, 1, 'P1D']],
  },
  family_in_20_10: {
    1: [['FAMILY_HEADBOX', 17, 1, 'P5D']],
    2: [['FAMILY_HEADBOX', 17, 1, 'P3D']],
    3: [['FAMILY_HEADBOX', 17, 1, 'P1D']],
  },
  family_in_10_1: {
    1: [
      ['FAMILY_BACKGROUND', 21, 1, 'P125D'],
      ['FAMILY_TAG', 16, 1, 'P125D'],
      ['FAMILY_HEADBOX', 18, 1, 'P125D'],
    ],
    2: [
      ['FAMILY_BACKGROUND', 21, 1, 'P75D'],
      ['FAMILY_TAG', 17, 1, 'P75D'],
      ['FAMILY_HEADBOX', 19, 1, 'P75D'],
    ],
    3: [
      ['FAMILY_BACKGROUND', 21, 1, 'P50D'],
      ['FAMILY_TAG', 18, 1, 'P50D'],
      ['FAMILY_HEADBOX', 20, 1, 'P50D'],
    ],
  },
};
