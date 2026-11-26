import type { MysqlRow } from '../../../../../src/resources/MySQLTestResource.ts';

export type PlayerType = 'USER' | 'ROOM' | 'FAMILY';
export type AwardMod = 'ADD' | 'VIEW';

export interface AwardRow {
  stage: number;
  playerType: PlayerType;
  locale: string;
  mod: AwardMod;
  type: string;
  id: number;
  count: number;
  /** null 表示配置为空过期表达式（手动奖励/金币） */
  days: number | null;
  awardName?: string;
}

type Def = [type: string, id: number, count: number, days: number | null, awardName?: string];

function build(playerType: PlayerType, mod: AwardMod, byStage: Record<number, Def[]>, locale = '*'): AwardRow[] {
  const out: AwardRow[] = [];
  for (const [stageStr, defs] of Object.entries(byStage)) {
    for (const [type, id, count, days, awardName] of defs) {
      out.push({ stage: Number(stageStr), playerType, locale, mod, type, id, count, days, awardName });
    }
  }
  return out;
}

function stageDefs(
  groups: Array<{ stages: number[]; awards: Def[] }>,
): Record<number, Def[]> {
  const out: Record<number, Def[]> = {};
  for (const g of groups) {
    for (const s of g.stages) out[s] = [...(out[s] ?? []), ...g.awards];
  }
  return out;
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** ---------------------------------------------------------------- 房间榜 */

const ROOM_MAIN: Record<string, AwardRow[]> = {
  room_in_n_200: build('ROOM', 'ADD', {
    1: [['DRESS_NAMEPLATE', 141, 1, 7]],
    2: [['DRESS_NAMEPLATE', 142, 1, 7]],
    3: [['DRESS_NAMEPLATE', 143, 1, 7]],
  }),
  room_in_200_100: build('ROOM', 'ADD', {
    1: [['DRESS_NAMEPLATE', 144, 1, 7]],
    2: [['DRESS_NAMEPLATE', 145, 1, 7]],
    3: [['DRESS_NAMEPLATE', 146, 1, 7]],
  }),
  room_in_100_50: build('ROOM', 'ADD', {
    1: [['DRESS_NAMEPLATE', 147, 1, 7]],
    2: [['DRESS_NAMEPLATE', 148, 1, 7]],
    3: [['DRESS_NAMEPLATE', 149, 1, 7]],
  }),
  room_in_50_20: build('ROOM', 'ADD', {
    1: [['DRESS_NAMEPLATE', 150, 1, 7], ['DRESS_FRAME', 67, 1, 3]],
    2: [['DRESS_NAMEPLATE', 151, 1, 7], ['DRESS_FRAME', 67, 1, 3]],
    3: [['DRESS_NAMEPLATE', 152, 1, 7], ['DRESS_FRAME', 67, 1, 3]],
  }),
  room_in_20_10: build('ROOM', 'ADD', {
    1: [['DRESS_NAMEPLATE', 153, 1, 7], ['DRESS_FRAME', 68, 1, 3]],
    2: [['DRESS_NAMEPLATE', 154, 1, 7], ['DRESS_FRAME', 68, 1, 3]],
    3: [['DRESS_NAMEPLATE', 155, 1, 7], ['DRESS_FRAME', 68, 1, 3]],
  }),
  room_in_10_1: build('ROOM', 'ADD', {
    1: [['DRESS_FRAME', 69, 1, 125], ['DRESS_NAMEPLATE', 138, 1, 125], ['ROOM_THEME', 78, 1, 125]],
    2: [['DRESS_FRAME', 69, 1, 75], ['DRESS_NAMEPLATE', 139, 1, 75], ['ROOM_THEME', 78, 1, 75]],
    3: [['DRESS_FRAME', 69, 1, 50], ['DRESS_NAMEPLATE', 140, 1, 50], ['ROOM_THEME', 78, 1, 50]],
  }),
};

ROOM_MAIN.room = build('ROOM', 'ADD', {
  1: [['DRESS_FRAME', 69, 1, 125], ['DRESS_NAMEPLATE', 138, 1, 125], ['ROOM_THEME', 78, 1, 125]],
  2: [['DRESS_FRAME', 69, 1, 75], ['DRESS_NAMEPLATE', 139, 1, 75], ['ROOM_THEME', 78, 1, 75]],
  3: [['DRESS_FRAME', 69, 1, 50], ['DRESS_NAMEPLATE', 140, 1, 50], ['ROOM_THEME', 78, 1, 50]],
});

const ROOM_CONTRIB: Record<string, AwardRow[]> = {
  room_in_n_200: build('USER', 'ADD', { 1: [['BUBBLE', 962, 1, 7]], 2: [['BUBBLE', 962, 1, 5]], 3: [['BUBBLE', 962, 1, 3]] }),
  room_in_200_100: build('USER', 'ADD', { 1: [['MICBOX', 14268, 1, 7]], 2: [['MICBOX', 14268, 1, 5]], 3: [['MICBOX', 14268, 1, 3]] }),
  room_in_100_50: build('USER', 'ADD', { 1: [['MICBOX', 14269, 1, 7]], 2: [['MICBOX', 14269, 1, 5]], 3: [['MICBOX', 14269, 1, 3]] }),
  room_in_50_20: build('USER', 'ADD', { 1: [['MICBOX', 14270, 1, 7]], 2: [['MICBOX', 14270, 1, 5]], 3: [['MICBOX', 14270, 1, 3]] }),
  room_in_20_10: build('USER', 'ADD', { 1: [['MICBOX', 14271, 1, 7]], 2: [['MICBOX', 14271, 1, 5]], 3: [['MICBOX', 14271, 1, 3]] }),
  room_in_10_1: build('USER', 'ADD', { 1: [['CAR', 668, 1, 25]], 2: [['CAR', 668, 1, 15]], 3: [['CAR', 668, 1, 10]] }),
  room: build('USER', 'ADD', { 1: [['CAR', 668, 1, 25]], 2: [['CAR', 668, 1, 15]], 3: [['CAR', 668, 1, 10]] }),
};

const ROOM_VIEW: Record<string, AwardRow[]> = {
  room: [
    ...build('ROOM', 'VIEW', { 1: [['GIFT', 10627, 1, 60, 'room_limited_gift'], ['CUSTOM', -1, 1, 10, 'annual_festival25_listbonus6']] }, 'in'),
  ],
  room_in_10_1: [
    ...build('ROOM', 'VIEW', { 1: [['GIFT', 10627, 1, 60, 'room_limited_gift'], ['CUSTOM', -1, 1, 10, 'annual_festival25_listbonus6']] }, 'in'),
  ],
};

/** ---------------------------------------------------------------- 陪玩榜 */

const PLAYER_MAIN: Record<string, AwardRow[]> = {
  player_in_n_200: build('USER', 'ADD', stageDefs([
    { stages: range(1, 3), awards: [['MICBOX', 10921, 1, 7], ['NAMEPLATE', 8439, 1, 7]] },
    { stages: range(4, 5), awards: [['MICBOX', 10921, 1, 5], ['NAMEPLATE', 8440, 1, 5]] },
    { stages: range(6, 10), awards: [['MICBOX', 10921, 1, 3], ['NAMEPLATE', 8442, 1, 3]] },
  ])),
  player_in_200_100: build('USER', 'ADD', stageDefs([
    { stages: range(1, 3), awards: [['MICBOX', 10953, 1, 7], ['NAMEPLATE', 8443, 1, 7]] },
    { stages: range(4, 5), awards: [['MICBOX', 10953, 1, 5], ['NAMEPLATE', 8444, 1, 5]] },
    { stages: range(6, 10), awards: [['MICBOX', 10953, 1, 3], ['NAMEPLATE', 8445, 1, 3]] },
  ])),
  player_in_100_46: build('USER', 'ADD', stageDefs([
    { stages: range(1, 3), awards: [['MICBOX', 14273, 1, 7], ['NAMEPLATE', 8446, 1, 7]] },
    { stages: range(4, 5), awards: [['MICBOX', 14273, 1, 5], ['NAMEPLATE', 8453, 1, 5]] },
    { stages: range(6, 10), awards: [['MICBOX', 14273, 1, 3], ['NAMEPLATE', 8454, 1, 3]] },
  ])),
  player_in_50_20: build('USER', 'ADD', stageDefs([
    { stages: range(1, 3), awards: [['MICBOX', 12079, 1, 7], ['NAMEPLATE', 8455, 1, 7]] },
    { stages: range(4, 5), awards: [['MICBOX', 12079, 1, 5], ['NAMEPLATE', 8456, 1, 5]] },
    { stages: range(6, 10), awards: [['MICBOX', 12079, 1, 3], ['NAMEPLATE', 8457, 1, 3]] },
  ])),
};

PLAYER_MAIN.player_in_20_1 = build('USER', 'ADD', {
  1: [['NAMEPLATE', 8464, 1, 125], ['BUBBLE', 965, 1, 125], ['MICBOX', 14276, 1, 125], ['HEADBOX', 4059, 1, 125], ['INFOCARD', 51, 1, 125], ['HOMEANIMATION', 14, 1, 125]],
  2: [['NAMEPLATE', 8465, 1, 75], ['BUBBLE', 965, 1, 75], ['MICBOX', 14276, 1, 75], ['HEADBOX', 4059, 1, 75], ['INFOCARD', 51, 1, 75], ['HOMEANIMATION', 14, 1, 75]],
  3: [['NAMEPLATE', 8472, 1, 50], ['BUBBLE', 966, 1, 50], ['MICBOX', 14276, 1, 50], ['HEADBOX', 4059, 1, 50], ['INFOCARD', 51, 1, 50], ['HOMEANIMATION', 14, 1, 50]],
});

PLAYER_MAIN.player_10_1 = PLAYER_MAIN.player_in_20_1.map((r) => ({ ...r }));

PLAYER_MAIN.player_n_100 = PLAYER_MAIN.player_in_n_200;
PLAYER_MAIN.player_100_50 = PLAYER_MAIN.player_in_200_100;
PLAYER_MAIN.player_50_20 = PLAYER_MAIN.player_in_100_46;
PLAYER_MAIN.player_24_10 = PLAYER_MAIN.player_in_50_20;

const PLAYER_CONTRIB: Record<string, AwardRow[]> = {
  player_in_n_200: build('USER', 'ADD', stageDefs([
    { stages: range(1, 3), awards: [['MICBOX', 12081, 1, 5]] },
    { stages: range(4, 5), awards: [['MICBOX', 12081, 1, 3]] },
    { stages: range(6, 10), awards: [['MICBOX', 12081, 1, 1]] },
  ])),
  player_in_200_100: build('USER', 'ADD', {
    1: [['CAR', 669, 1, 7]], 2: [['CAR', 669, 1, 5]], 3: [['CAR', 669, 1, 3]],
    4: [['CAR', 669, 1, 5]], 5: [['CAR', 669, 1, 5]], 6: [['CAR', 669, 1, 3]], 7: [['CAR', 669, 1, 3]], 8: [['CAR', 669, 1, 3]], 9: [['CAR', 669, 1, 3]], 10: [['CAR', 669, 1, 3]],
  }),
  player_in_100_46: build('USER', 'ADD', {
    1: [['SOUNDWAVE', 35, 1, 7]], 2: [['SOUNDWAVE', 35, 1, 5]], 3: [['SOUNDWAVE', 35, 1, 3]],
    4: [['SOUNDWAVE', 35, 1, 5]], 5: [['SOUNDWAVE', 35, 1, 5]], 6: [['SOUNDWAVE', 35, 1, 3]], 7: [['SOUNDWAVE', 35, 1, 3]], 8: [['SOUNDWAVE', 35, 1, 3]], 9: [['SOUNDWAVE', 35, 1, 3]], 10: [['SOUNDWAVE', 35, 1, 3]],
  }),
  player_in_50_20: build('USER', 'ADD', {
    1: [['CAR', 682, 1, 7]], 2: [['CAR', 682, 1, 5]], 3: [['CAR', 682, 1, 3]],
    4: [['CAR', 682, 1, 5]], 5: [['CAR', 682, 1, 5]], 6: [['CAR', 682, 1, 3]], 7: [['CAR', 682, 1, 3]], 8: [['CAR', 682, 1, 3]], 9: [['CAR', 682, 1, 3]], 10: [['CAR', 682, 1, 3]],
  }),
  player_in_20_1: build('USER', 'ADD', {
    1: [['INFOCARD', 31, 1, 30], ['BUBBLE', 967, 1, 25]],
    2: [['INFOCARD', 31, 1, 15], ['BUBBLE', 967, 1, 15]],
    3: [['INFOCARD', 31, 1, 7], ['BUBBLE', 967, 1, 10]],
  }),
};
PLAYER_CONTRIB.player_10_1 = PLAYER_CONTRIB.player_in_20_1;
PLAYER_CONTRIB.player_n_100 = PLAYER_CONTRIB.player_in_n_200;
PLAYER_CONTRIB.player_100_50 = PLAYER_CONTRIB.player_in_200_100;
PLAYER_CONTRIB.player_50_20 = PLAYER_CONTRIB.player_in_100_46;
PLAYER_CONTRIB.player_24_10 = PLAYER_CONTRIB.player_in_50_20;

const PLAYER_DAILY: Record<string, AwardRow[]> = {
  'player_in_n_200-daily': build('USER', 'ADD', { 1: [['HEADBOX', 739, 1, 3], ['BUBBLE', 963, 1, 3]] }),
  'player_in_200_100-daily': build('USER', 'ADD', { 1: [['WIDGET', 126, 1, 3], ['BUBBLE', 964, 1, 3]] }),
  'player_n_100-daily': build('USER', 'ADD', { 1: [['HEADBOX', 739, 1, 3], ['BUBBLE', 963, 1, 3]] }),
  'player_100_50-daily': build('USER', 'ADD', { 1: [['WIDGET', 126, 1, 3], ['BUBBLE', 964, 1, 3]] }),
};

const PK_WIN: Record<string, AwardRow[]> = {
  player_in_1v1_100_46: build('USER', 'ADD', { 1: [['MICBOX', 12083, 1, 5], ['FLOATING', 115, 1, 5]] }),
  player_in_1v1_50_20: build('USER', 'ADD', { 1: [['FLOATING', 116, 1, 7], ['SOUNDWAVE', 36, 1, 7]] }),
  player_1v1_50_20: build('USER', 'ADD', { 1: [['MICBOX', 12083, 1, 5], ['FLOATING', 115, 1, 5]] }),
  player_1v1_24_10: build('USER', 'ADD', { 1: [['FLOATING', 116, 1, 7], ['SOUNDWAVE', 36, 1, 7]] }),
};

const PLAYER_VIEW: Record<string, AwardRow[]> = {
  player_in_20_1: [
    ...build('USER', 'VIEW', {
      1: [
        ['CUSTOM', -1, 1, null, 'annual_festival25_listbonus3'],
        ['COIN', -1, 26666, null],
        ['CUSTOM', -1, 1, 10, 'annual_festival25_listbonus4'],
        ['CUSTOM', -1, 1, 10, 'annual_festival25_listbonus6'],
      ],
      2: [['CUSTOM', -1, 1, null, 'annual_festival25_listbonus3'], ['COIN', -1, 16666, null]],
      3: [['CUSTOM', -1, 1, null, 'annual_festival25_listbonus3'], ['COIN', -1, 6666, null]],
    }, 'in'),
  ],
  player_10_1: [
    ...build('USER', 'VIEW', {
      1: [['COIN', -1, 5000, null], ['CUSTOM', -1, 1, 10, 'annual_festival25_listbonus4'], ['CUSTOM', -1, 1, 10, 'annual_festival25_listbonus6']],
    }, 'vi'),
    ...build('USER', 'VIEW', {
      1: [['COIN', -1, 5000, null], ['CUSTOM', -1, 1, 10, 'annual_festival25_listbonus4'], ['CUSTOM', -1, 1, 10, 'annual_festival25_listbonus6']],
    }, 'ph'),
    ...build('USER', 'VIEW', {
      1: [['COIN', -1, 10000, null], ['CUSTOM', -1, 1, 10, 'annual_festival25_listbonus4'], ['CUSTOM', -1, 1, 10, 'annual_festival25_listbonus6']],
      2: [['COIN', -1, 5000, null]],
      3: [['COIN', -1, 3000, null]],
    }, 'ko'),
  ],
};

/** ---------------------------------------------------------------- 用户/CP/家族 */

const USER_AWARDS: Record<string, AwardRow[]> = {
  'user-daily': build('USER', 'ADD', {
    1: [['MICBOX', 14280, 1, 5], ['BUBBLE', 968, 1, 5]],
    2: [['MICBOX', 14280, 1, 3], ['BUBBLE', 968, 1, 3]],
    3: [['MICBOX', 14280, 1, 1], ['BUBBLE', 968, 1, 1]],
  }),
  user: build('USER', 'ADD', {
    1: [['NAMEPLATE', 8458, 1, 125], ['HOMEANIMATION', 119, 1, 125], ['MICBOX', 14279, 1, 125], ['HEADBOX', 4062, 1, 125], ['SOUNDWAVE', 39, 1, 125], ['CAR', 671, 1, 125]],
    2: [['NAMEPLATE', 8459, 1, 75], ['HOMEANIMATION', 119, 1, 75], ['MICBOX', 14314, 1, 75], ['HEADBOX', 4096, 1, 75], ['SOUNDWAVE', 39, 1, 75], ['CAR', 671, 1, 75]],
    3: [['NAMEPLATE', 8460, 1, 50], ['HOMEANIMATION', 119, 1, 50], ['MICBOX', 14315, 1, 50], ['HEADBOX', 4097, 1, 50], ['SOUNDWAVE', 39, 1, 50], ['CAR', 671, 1, 50]],
  }),
};

const USER_VIEW: AwardRow[] = [
  ...build('USER', 'VIEW', {
    1: [['CUSTOM', -1, 1, null, 'annual_festival25_listbonus3'], ['COIN', -1, 36666, null]],
    2: [['CUSTOM', -1, 1, null, 'annual_festival25_listbonus3'], ['COIN', -1, 26666, null]],
    3: [['CUSTOM', -1, 1, null, 'annual_festival25_listbonus3'], ['COIN', -1, 16666, null]],
  }, 'in'),
  ...build('USER', 'VIEW', { 1: [['COIN', -1, 5000, null]] }, 'vi'),
  ...build('USER', 'VIEW', { 1: [['COIN', -1, 5000, null]] }, 'ph'),
  ...build('USER', 'VIEW', { 1: [['COIN', -1, 16666, null]], 2: [['COIN', -1, 10000, null]], 3: [['COIN', -1, 5000, null]] }, 'ko'),
];

const COUPLE_AWARDS: Record<string, AwardRow[]> = {
  'couple-male-daily': build('USER', 'ADD', {
    1: [['SOUNDWAVE', 65, 1, 5], ['BUBBLE', 969, 1, 5]],
    2: [['SOUNDWAVE', 65, 1, 3], ['BUBBLE', 969, 1, 3]],
    3: [['SOUNDWAVE', 65, 1, 1], ['BUBBLE', 969, 1, 1]],
  }),
  'couple-female-daily': build('USER', 'ADD', {
    1: [['SOUNDWAVE', 66, 1, 5], ['BUBBLE', 970, 1, 5]],
    2: [['SOUNDWAVE', 66, 1, 3], ['BUBBLE', 970, 1, 3]],
    3: [['SOUNDWAVE', 66, 1, 1], ['BUBBLE', 970, 1, 1]],
  }),
  'couple-male': build('USER', 'ADD', {
    1: [['HEADBOX', 4058, 1, 125], ['MICBOX', 14275, 1, 125], ['FLOATING', 118, 1, 125], ['CAR', 1016, 1, 125]],
    2: [['HEADBOX', 4058, 1, 75], ['MICBOX', 14275, 1, 75], ['FLOATING', 118, 1, 75], ['CAR', 1016, 1, 75]],
    3: [['HEADBOX', 4058, 1, 50], ['MICBOX', 14275, 1, 50], ['FLOATING', 118, 1, 50], ['CAR', 1016, 1, 50]],
  }),
  'couple-female': build('USER', 'ADD', {
    1: [['HEADBOX', 4057, 1, 125], ['MICBOX', 14274, 1, 125], ['FLOATING', 117, 1, 125], ['CAR', 1016, 1, 125]],
    2: [['HEADBOX', 4057, 1, 75], ['MICBOX', 14274, 1, 75], ['FLOATING', 117, 1, 75], ['CAR', 1016, 1, 75]],
    3: [['HEADBOX', 4057, 1, 50], ['MICBOX', 14274, 1, 50], ['FLOATING', 117, 1, 50], ['CAR', 1016, 1, 50]],
  }),
};

const FAMILY_AWARDS: Record<string, AwardRow[]> = {
  family_in_n_200: build('USER', 'ADD', { 1: [['NAMEPLATE', 8473, 1, 5]], 2: [['NAMEPLATE', 8473, 1, 3]], 3: [['NAMEPLATE', 8473, 1, 1]] }),
  family_in_200_100: build('USER', 'ADD', { 1: [['NAMEPLATE', 8474, 1, 5]], 2: [['NAMEPLATE', 8474, 1, 3]], 3: [['NAMEPLATE', 8474, 1, 1]] }),
  family_in_100_50: [
    ...build('USER', 'ADD', { 1: [['NAMEPLATE', 8475, 1, 5]], 2: [['NAMEPLATE', 8475, 1, 3]], 3: [['NAMEPLATE', 8475, 1, 1]] }),
    ...build('FAMILY', 'ADD', { 1: [['FAMILY_HEADBOX', 15, 1, 5]], 2: [['FAMILY_HEADBOX', 15, 1, 3]], 3: [['FAMILY_HEADBOX', 15, 1, 1]] }),
  ],
  family_in_50_20: [
    ...build('USER', 'ADD', { 1: [['NAMEPLATE', 8476, 1, 5]], 2: [['NAMEPLATE', 8476, 1, 3]], 3: [['NAMEPLATE', 8476, 1, 1]] }),
    ...build('FAMILY', 'ADD', { 1: [['FAMILY_HEADBOX', 16, 1, 5]], 2: [['FAMILY_HEADBOX', 16, 1, 3]], 3: [['FAMILY_HEADBOX', 16, 1, 1]] }),
  ],
  family_in_20_10: [
    ...build('USER', 'ADD', { 1: [['NAMEPLATE', 8477, 1, 5]], 2: [['NAMEPLATE', 8477, 1, 3]], 3: [['NAMEPLATE', 8477, 1, 1]] }),
    ...build('FAMILY', 'ADD', { 1: [['FAMILY_HEADBOX', 17, 1, 5]], 2: [['FAMILY_HEADBOX', 17, 1, 3]], 3: [['FAMILY_HEADBOX', 17, 1, 1]] }),
  ],
  family_in_10_1: build('FAMILY', 'ADD', {
    1: [['FAMILY_BACKGROUND', 21, 1, 125], ['FAMILY_TAG', 16, 1, 125], ['FAMILY_HEADBOX', 18, 1, 125]],
    2: [['FAMILY_BACKGROUND', 21, 1, 75], ['FAMILY_TAG', 17, 1, 75], ['FAMILY_HEADBOX', 19, 1, 75]],
    3: [['FAMILY_BACKGROUND', 21, 1, 50], ['FAMILY_TAG', 18, 1, 50], ['FAMILY_HEADBOX', 20, 1, 50]],
  }),
  family: build('FAMILY', 'ADD', {
    1: [['FAMILY_BACKGROUND', 21, 1, 125], ['FAMILY_TAG', 16, 1, 125], ['FAMILY_HEADBOX', 18, 1, 125]],
    2: [['FAMILY_BACKGROUND', 21, 1, 75], ['FAMILY_TAG', 17, 1, 75], ['FAMILY_HEADBOX', 19, 1, 75]],
    3: [['FAMILY_BACKGROUND', 21, 1, 50], ['FAMILY_TAG', 18, 1, 50], ['FAMILY_HEADBOX', 20, 1, 50]],
  }),
};

const FAMILY_VIEW: Record<string, AwardRow[]> = {
  family_in_10_1: build('FAMILY', 'VIEW', { 1: [['CUSTOM', -1, 1, 15, 'annual_festival25_listbonus6']] }, 'in'),
  family: ['in', 'vi', 'ph', 'ko'].flatMap((loc) =>
    build('FAMILY', 'VIEW', { 1: [['CUSTOM', -1, 1, 15, 'annual_festival25_listbonus6']] }, loc),
  ),
};

/** 期望奖励配置（ADD/VIEW 全量，按需求奖励表） */
export const EXPECTED_AWARDS: Record<string, AwardRow[]> = {};
for (const [topic, rows] of Object.entries(ROOM_MAIN)) EXPECTED_AWARDS[topic] = [...rows];
for (const [topic, rows] of Object.entries(ROOM_CONTRIB)) EXPECTED_AWARDS[`${topic}-contributor`] = rows;
for (const [topic, rows] of Object.entries(ROOM_VIEW)) EXPECTED_AWARDS[topic] = [...(EXPECTED_AWARDS[topic] ?? []), ...rows];
for (const [topic, rows] of Object.entries(PLAYER_MAIN)) EXPECTED_AWARDS[topic] = [...rows];
for (const [topic, rows] of Object.entries(PLAYER_CONTRIB)) EXPECTED_AWARDS[`${topic}-contributor`] = rows;
for (const [topic, rows] of Object.entries(PLAYER_DAILY)) EXPECTED_AWARDS[topic] = [...rows];
for (const [topic, rows] of Object.entries(PK_WIN)) EXPECTED_AWARDS[topic] = [...rows];
for (const [topic, rows] of Object.entries(PLAYER_VIEW)) EXPECTED_AWARDS[topic] = [...(EXPECTED_AWARDS[topic] ?? []), ...rows];
for (const [topic, rows] of Object.entries(USER_AWARDS)) EXPECTED_AWARDS[topic] = [...rows];
EXPECTED_AWARDS.user = [...(EXPECTED_AWARDS.user ?? []), ...USER_VIEW];
for (const [topic, rows] of Object.entries(COUPLE_AWARDS)) EXPECTED_AWARDS[topic] = [...rows];
for (const [topic, rows] of Object.entries(FAMILY_AWARDS)) EXPECTED_AWARDS[topic] = [...(EXPECTED_AWARDS[topic] ?? []), ...rows];
for (const [topic, rows] of Object.entries(FAMILY_VIEW)) EXPECTED_AWARDS[topic] = [...(EXPECTED_AWARDS[topic] ?? []), ...rows];

export const AWARD_NAMES = Object.keys(EXPECTED_AWARDS).sort();

function expireOf(days: number | null): string {
  return days === null ? '' : `P${days}D`;
}

function normalize(rows: Array<{
  stage?: unknown; playerType?: unknown; locale?: unknown; mod?: unknown; type?: unknown; id?: unknown; count?: unknown; days?: number | null; expire?: unknown;
}>): string[] {
  return rows
    .map((r) => {
      const days = r.days !== undefined ? expireOf(r.days ?? null) : String(r.expire ?? '');
      return `${Number(r.stage)}|${String(r.playerType)}|${String(r.locale)}|${String(r.mod)}|${String(r.type)}|${Number(r.id)}|${Number(r.count)}|${days}`;
    })
    .sort();
}

/** 返回 null 表示一致，否则返回人类可读差异 */
export function diffAwardConfig(actualRows: MysqlRow[], expected: AwardRow[]): string | null {
  const actual = normalize(actualRows.map((r) => ({
    stage: r['stage'], playerType: r['player_type'], locale: r['locale'], mod: r['mod'],
    type: r['award_type'], id: r['award_id'], count: r['award_count'], expire: r['expire_express'],
  })));
  const exp = normalize(expected);
  const onlyActual = actual.filter((x) => !exp.includes(x));
  const onlyExp = exp.filter((x) => !actual.includes(x));
  if (onlyActual.length === 0 && onlyExp.length === 0) return null;
  return `实际多出 ${onlyActual.length} 条：${onlyActual.slice(0, 5).join(' ; ')}；期望缺少 ${onlyExp.length} 条：${onlyExp.slice(0, 5).join(' ; ')}`;
}