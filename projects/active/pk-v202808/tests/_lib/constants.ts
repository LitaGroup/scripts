import { beijingMs, localAtMs } from '../../../../../src/base/TimeUtils.ts';

export const BIZ = 'pk-v202808';

export const LOCALES = ['in', 'vi', 'ph', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];
export const OTHER_LOCALES: Locale[] = ['vi', 'ph', 'ko'];

export const ACTIVITY_START_BJ = '2028-08-17 14:00:00';
export const ACTIVITY_FINISH_BJ = '2028-08-29 23:59:59';

export const ACTIVITY_START_MS = beijingMs(ACTIVITY_START_BJ);
export const ACTIVITY_FINISH_MS = beijingMs(ACTIVITY_FINISH_BJ);

/** 12 个赛事礼物及倍率，stage 仅用于展示分组，不参与计分判断 */
export const GIFTS: Array<{ id: number; buff: number; stage: 0 | 1 | 2; special: boolean }> = [
  { id: 10561, buff: 1, stage: 1, special: false },
  { id: 10562, buff: 1, stage: 1, special: false },
  { id: 10563, buff: 1, stage: 1, special: false },
  { id: 10564, buff: 1, stage: 1, special: false },
  { id: 10565, buff: 1, stage: 2, special: false },
  { id: 10566, buff: 1, stage: 2, special: false },
  { id: 10567, buff: 1, stage: 2, special: false },
  { id: 10568, buff: 1, stage: 2, special: false },
  { id: 10569, buff: 1, stage: 0, special: false },
  { id: 10570, buff: 1, stage: 0, special: false },
  { id: 10628, buff: 2, stage: 0, special: true },
  { id: 10637, buff: 2, stage: 0, special: true },
];

export const GIFT_BUFF: Record<number, number> = Object.fromEntries(GIFTS.map((g) => [g.id, g.buff]));

/** 送礼人身份 Buff（未声明项沿用历史） */
export const IDENTITY_BUFF = { normal: 1.1, svip: 1.2, rich: 1.5 } as const;

export const TOP_STAGE_BUFF = [1.2, 1.2, 1.2, 1.1, 1.1, 1.05, 1.05, 1.05, 1.05, 1.05];
export const PK_WIN_BUFF = [1, 1, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];

export interface StageDef {
  topic: string;
  /** 首阶段使用活动统一开始（绝对时刻） */
  startBj?: string;
  startLocal?: string;
  /** 晋级阶段锁榜（本地） */
  lockLocal: string;
  /** 结束使用活动统一结束（绝对时刻） */
  finishBj?: string;
  top: number;
  inherit: number;
  daily?: boolean;
}

const roomFamilyStages = (prefix: 'room' | 'family'): StageDef[] => [
  { topic: `${prefix}_in_n_200`, startBj: ACTIVITY_START_BJ, lockLocal: '2028-08-19 23:30:00', top: 200, inherit: 0 },
  { topic: `${prefix}_in_200_100`, startLocal: '2028-08-20 00:00:00', lockLocal: '2028-08-22 23:30:00', top: 100, inherit: 1 },
  { topic: `${prefix}_in_100_50`, startLocal: '2028-08-23 00:00:00', lockLocal: '2028-08-24 23:30:00', top: 50, inherit: 1 },
  { topic: `${prefix}_in_50_20`, startLocal: '2028-08-25 00:00:00', lockLocal: '2028-08-26 23:30:00', top: 20, inherit: 1 },
  { topic: `${prefix}_in_20_10`, startLocal: '2028-08-27 00:00:00', lockLocal: '2028-08-28 23:30:00', top: 10, inherit: 1 },
  {
    topic: `${prefix}_in_10_1`,
    startLocal: '2028-08-29 00:00:00',
    lockLocal: '2028-08-29 23:30:00',
    finishBj: ACTIVITY_FINISH_BJ,
    top: 1,
    inherit: 1,
  },
];

export const ROOM_STAGES = roomFamilyStages('room');
export const FAMILY_STAGES = roomFamilyStages('family');

export const PLAYER_STAGES_IN: StageDef[] = [
  { topic: 'player_in_n_200', startBj: ACTIVITY_START_BJ, lockLocal: '2028-08-19 23:30:00', top: 200, inherit: 0, daily: true },
  { topic: 'player_in_200_100', startLocal: '2028-08-20 00:00:00', lockLocal: '2028-08-22 23:30:00', top: 100, inherit: 0.5, daily: true },
  { topic: 'player_in_100_46', startLocal: '2028-08-23 00:00:00', lockLocal: '2028-08-25 23:30:00', top: 46, inherit: 0.5 },
  { topic: 'player_in_50_20', startLocal: '2028-08-26 00:00:00', lockLocal: '2028-08-28 23:30:00', top: 20, inherit: 0.5 },
  { topic: 'player_in_20_1', startLocal: '2028-08-29 00:00:00', lockLocal: '2028-08-29 23:30:00', finishBj: ACTIVITY_FINISH_BJ, top: 1, inherit: 0.5 },
];

export const PLAYER_STAGES_OTHER: StageDef[] = [
  { topic: 'player_n_100', startBj: ACTIVITY_START_BJ, lockLocal: '2028-08-19 23:30:00', top: 100, inherit: 0, daily: true },
  { topic: 'player_100_50', startLocal: '2028-08-20 00:00:00', lockLocal: '2028-08-22 23:30:00', top: 50, inherit: 0.5, daily: true },
  { topic: 'player_50_20', startLocal: '2028-08-23 00:00:00', lockLocal: '2028-08-25 23:30:00', top: 20, inherit: 0.5 },
  { topic: 'player_24_10', startLocal: '2028-08-26 00:00:00', lockLocal: '2028-08-28 23:30:00', top: 10, inherit: 0.5 },
  { topic: 'player_10_1', startLocal: '2028-08-29 00:00:00', lockLocal: '2028-08-29 23:30:00', finishBj: ACTIVITY_FINISH_BJ, top: 1, inherit: 0.5 },
];

export const PLAYER_REVIVAL_IN = 'player_in_n_4';
export const PLAYER_REVIVAL_OTHER = 'player_n_4';

export const PK_MODULES: Record<string, { stages: string[]; joins: 'in' | 'other' }> = {
  player_in_1v1_100_46: { stages: ['2028082300', '2028082318', '2028082400', '2028082418', '2028082500', '2028082518'], joins: 'in' },
  player_in_1v1_50_20: { stages: ['2028082600', '2028082618', '2028082700', '2028082718', '2028082800', '2028082818'], joins: 'in' },
  player_1v1_50_20: { stages: ['2028082300', '2028082318', '2028082400', '2028082418', '2028082500', '2028082518'], joins: 'other' },
  player_1v1_24_10: { stages: ['2028082600', '2028082618', '2028082700', '2028082718', '2028082800', '2028082818'], joins: 'other' },
};

export const DAILY_KEYS = Array.from({ length: 13 }, (_, i) => `202808${String(17 + i).padStart(2, '0')}`);

export const ALL_STAGE_TOPICS = [
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

export const ALL_MODULES = [...ALL_STAGE_TOPICS, ...Object.keys(PK_MODULES)];

/**
 * 大区本地时刻转带偏移的 ISO 字符串（表达同一绝对时刻）。
 * 例：in 的 "2028-08-19 23:40:00" → "2028-08-19T23:40:00+07:00"（= 北京 8/20 00:40）。
 */
export function bjIsoFor(locale: string, localDt: string): string {
  const tz = tzOf(locale);
  const sign = tz < 0 ? '-' : '+';
  return `${localDt.replace(' ', 'T')}${sign}${String(Math.abs(tz)).padStart(2, '0')}:00`;
}

export function tzOf(locale: string): number {
  return { in: 7, vi: 7, ph: 8, ko: 9 }[locale] ?? 8;
}

export function startMsOf(locale: string, stage: StageDef): number {
  if (stage.startBj) return beijingMs(stage.startBj);
  return localAtMs(locale, stage.startLocal!);
}

export function finishMsOf(locale: string, stage: StageDef): number {
  if (stage.finishBj) return beijingMs(stage.finishBj);
  return localAtMs(locale, stage.lockLocal);
}

/** 日榜结束（本地次日 00:00） */
export function dailyFinishMs(locale: string, day: string): number {
  const ms = localAtMs(locale, `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)} 00:00:00`);
  return ms + 24 * 3600_000;
}

export const CRON = {
  /** 各榜单阶段结算时刻（本地 23:36/23:37/23:38/23:39/23:40） */
  roomSettle: '23:36:00',
  familySettle: '23:37:00',
  userSettle: '23:38:00',
  coupleSettle: '23:39:00',
  playerSettle: '23:40:00',
  /** 日榜补结算（本地次日 00:06） */
  dailySettle: '00:06:00',
  /** 1v1 白天/晚间结算（本地 17:45 / 23:45） */
  pkDaySettle: '17:45:00',
  pkNightSettle: '23:45:00',
};