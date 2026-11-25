import { APIProdResource } from '../../../../../src/resources/APIProdResource.ts';
import type { APITestResource } from '../../../../../src/resources/APITestResource.ts';
import { beijingMs, localAtMs } from '../../../../../src/base/TimeUtils.ts';

/**
 * 2612 年度 PK 赛事（pk-v202612）测试公共常量与方法。
 *
 * 需求来源：文档 3458《【2026年度盛典】赛事PK》、文档 3459 奖励配置表、文档 3452 需求澄清。
 * 方案来源：TK-0607 TECH_DESIGN（v15）。
 *
 * 约定：
 * - 顶层活动起止使用 UTC+8 绝对时间（Q25，A 后缀）。
 * - 阶段开始/结束、日榜使用各大区本地自然边界（R 后缀）。
 * - 印尼(in)使用 player_in_* / room_in_* / family_in_* 分阶段 topic；
 *   非印尼(vi/ph/ko)使用 player_* / room / family 总榜 topic。
 */

export const BIZ = 'pk-v202612';
export const ALIAS = 'pk';
export const OLD_BIZ = 'pk-v202608';

export const IN = 'in';
export const NON_IN = ['vi', 'ph', 'ko'];
export const ALL_LOCALES = ['in', 'vi', 'ph', 'ko'];

/** 活动顶层开始：2026-12-17 11:00 UTC+8 */
export const ACTIVITY_START_BJ = '2026-12-17 11:00:00';
/** 活动顶层结束：2027-01-02 23:59:59 UTC+8（Q25） */
export const ACTIVITY_END_BJ = '2027-01-02 23:59:59';

/** 测试执行使用的业务时间（活动期内） */
export const RUN_DEBUG_TS = '2026-12-18T12:00:00+08:00';
/** 初始化各模块轮次使用的业务时间（活动期内、首阶段） */
export const INIT_DEBUG_TS = '2026-12-18T10:00:00+08:00';

export type TimeSpec =
  | { kind: 'bj'; value: string }
  | { kind: 'local'; value: string }
  | { kind: 'abs'; value: string };

export interface TopicSpec {
  topic: string;
  module: 'RankModule' | 'PkModule';
  locales: string[];
  start: TimeSpec;
  finish: TimeSpec;
  /** 日榜本地日期（yyyyMMdd），无日榜则为空 */
  dailyDays?: string[];
  /** 1V1 PK 轮次本地日期（yyyyMMdd），无则为空 */
  pkDays?: string[];
}

export function expectMs(spec: TimeSpec, locale: string): number {
  if (spec.kind === 'bj') return beijingMs(spec.value);
  if (spec.kind === 'abs') return Date.parse(spec.value);
  return localAtMs(locale, spec.value);
}

/** 生成 1V1 PK 轮次 key：每天本地 00 点与 18 点各一场 */
export function pkKeys(days: string[]): string[] {
  const keys: string[] = [];
  for (const day of days) keys.push(`${day}00`, `${day}18`);
  return keys.sort();
}

/** 生成日榜 key */
export function dailyKeys(days: string[]): string[] {
  return [...days].sort();
}

const STAGE_1_START: TimeSpec = { kind: 'bj', value: '2026-12-17 11:00:00' };
const FINAL_FINISH: TimeSpec = { kind: 'bj', value: '2027-01-02 23:59:59' };
const TOTAL_FINISH: TimeSpec = { kind: 'bj', value: '2027-01-02 23:59:59' };

/** 陪陪榜（印尼） */
const PLAYER_IN_TOPICS: TopicSpec[] = [
  {
    topic: 'player_in_n_200',
    module: 'RankModule',
    locales: [IN],
    start: STAGE_1_START,
    finish: { kind: 'local', value: '2026-12-20 23:30:00' },
    dailyDays: ['20261217', '20261218', '20261219', '20261220'],
  },
  {
    topic: 'player_in_200_100',
    module: 'RankModule',
    locales: [IN],
    start: { kind: 'local', value: '2026-12-21 00:00:00' },
    finish: { kind: 'local', value: '2026-12-24 23:30:00' },
    dailyDays: ['20261221', '20261222', '20261223', '20261224'],
  },
  {
    topic: 'player_in_100_46',
    module: 'RankModule',
    locales: [IN],
    start: { kind: 'local', value: '2026-12-25 00:00:00' },
    finish: { kind: 'local', value: '2026-12-28 23:30:00' },
  },
  {
    topic: 'player_in_1v1_100_46',
    module: 'PkModule',
    locales: [IN],
    start: { kind: 'local', value: '2026-12-25 00:00:00' },
    finish: { kind: 'local', value: '2026-12-28 23:30:00' },
    pkDays: ['20261225', '20261226', '20261227', '20261228'],
  },
  {
    topic: 'player_in_50_20',
    module: 'RankModule',
    locales: [IN],
    start: { kind: 'local', value: '2026-12-29 00:00:00' },
    finish: { kind: 'local', value: '2027-01-01 23:30:00' },
  },
  {
    topic: 'player_in_1v1_50_20',
    module: 'PkModule',
    locales: [IN],
    start: { kind: 'local', value: '2026-12-29 00:00:00' },
    finish: { kind: 'local', value: '2027-01-01 23:30:00' },
    pkDays: ['20261229', '20261230', '20261231', '20270101'],
  },
  {
    topic: 'player_in_n_4',
    module: 'RankModule',
    locales: [IN],
    start: { kind: 'local', value: '2026-12-29 00:00:00' },
    finish: { kind: 'local', value: '2026-12-29 23:30:00' },
  },
  {
    topic: 'player_in_20_1',
    module: 'RankModule',
    locales: [IN],
    start: { kind: 'local', value: '2027-01-02 00:00:00' },
    finish: FINAL_FINISH,
  },
];

/** 陪陪榜（非印尼） */
const PLAYER_TOPICS: TopicSpec[] = [
  {
    topic: 'player_n_100',
    module: 'RankModule',
    locales: NON_IN,
    start: STAGE_1_START,
    finish: { kind: 'local', value: '2026-12-20 23:30:00' },
    dailyDays: ['20261217', '20261218', '20261219', '20261220'],
  },
  {
    topic: 'player_100_50',
    module: 'RankModule',
    locales: NON_IN,
    start: { kind: 'local', value: '2026-12-21 00:00:00' },
    finish: { kind: 'local', value: '2026-12-24 23:30:00' },
    dailyDays: ['20261221', '20261222', '20261223', '20261224'],
  },
  {
    topic: 'player_50_20',
    module: 'RankModule',
    locales: NON_IN,
    // 沿用六周年 +07 绝对时间（非 R），ph/ko 本地分别 01:00/02:00 开始
    start: { kind: 'abs', value: '2026-12-25T00:00:00+07:00' },
    finish: { kind: 'abs', value: '2026-12-28T23:30:00+07:00' },
  },
  {
    topic: 'player_1v1_50_20',
    module: 'PkModule',
    locales: NON_IN,
    start: { kind: 'local', value: '2026-12-25 00:00:00' },
    finish: { kind: 'local', value: '2026-12-28 23:30:00' },
    pkDays: ['20261225', '20261226', '20261227', '20261228'],
  },
  {
    topic: 'player_24_10',
    module: 'RankModule',
    locales: NON_IN,
    start: { kind: 'local', value: '2026-12-29 00:00:00' },
    finish: { kind: 'local', value: '2027-01-01 23:30:00' },
  },
  {
    topic: 'player_1v1_24_10',
    module: 'PkModule',
    locales: NON_IN,
    start: { kind: 'local', value: '2026-12-29 00:00:00' },
    finish: { kind: 'local', value: '2027-01-01 23:30:00' },
    pkDays: ['20261229', '20261230', '20261231', '20270101'],
  },
  {
    topic: 'player_n_4',
    module: 'RankModule',
    locales: NON_IN,
    start: { kind: 'local', value: '2026-12-29 00:00:00' },
    finish: { kind: 'local', value: '2026-12-29 23:30:00' },
  },
  {
    topic: 'player_10_1',
    module: 'RankModule',
    locales: NON_IN,
    // 沿用六周年 +07 绝对时间（非 R），ph/ko 本地分别 01:00/02:00 开始
    start: { kind: 'abs', value: '2027-01-02T00:00:00+07:00' },
    finish: FINAL_FINISH,
  },
];

/** 房间榜（印尼分阶段） */
const ROOM_IN_TOPICS: TopicSpec[] = [
  {
    topic: 'room_in_n_200',
    module: 'RankModule',
    locales: [IN],
    start: STAGE_1_START,
    finish: { kind: 'local', value: '2026-12-20 23:59:59' },
  },
  {
    topic: 'room_in_200_100',
    module: 'RankModule',
    locales: [IN],
    start: { kind: 'local', value: '2026-12-21 00:00:00' },
    finish: { kind: 'local', value: '2026-12-24 23:59:59' },
  },
  {
    topic: 'room_in_100_50',
    module: 'RankModule',
    locales: [IN],
    start: { kind: 'local', value: '2026-12-25 00:00:00' },
    finish: { kind: 'local', value: '2026-12-27 23:59:59' },
  },
  {
    topic: 'room_in_50_20',
    module: 'RankModule',
    locales: [IN],
    start: { kind: 'local', value: '2026-12-28 00:00:00' },
    finish: { kind: 'local', value: '2026-12-30 23:59:59' },
  },
  {
    topic: 'room_in_20_10',
    module: 'RankModule',
    locales: [IN],
    start: { kind: 'local', value: '2026-12-31 00:00:00' },
    finish: { kind: 'local', value: '2026-12-31 23:59:59' },
  },
  {
    topic: 'room_in_10_1',
    module: 'RankModule',
    locales: [IN],
    start: { kind: 'local', value: '2027-01-02 00:00:00' },
    finish: FINAL_FINISH,
  },
];

/** 家族榜（印尼分阶段） */
const FAMILY_IN_TOPICS: TopicSpec[] = ROOM_IN_TOPICS.map((t) => ({
  ...t,
  topic: t.topic.replace('room_', 'family_'),
}));

/** 房间/家族/用户/CP 的总榜 */
const TOTAL_TOPICS: TopicSpec[] = [
  {
    topic: 'room',
    module: 'RankModule',
    locales: NON_IN,
    start: STAGE_1_START,
    finish: TOTAL_FINISH,
  },
  {
    topic: 'family',
    module: 'RankModule',
    locales: NON_IN,
    start: STAGE_1_START,
    finish: TOTAL_FINISH,
  },
  {
    topic: 'user',
    module: 'RankModule',
    locales: ALL_LOCALES,
    start: STAGE_1_START,
    finish: TOTAL_FINISH,
    dailyDays: [
      '20261217', '20261218', '20261219', '20261220', '20261221', '20261222', '20261223',
      '20261224', '20261225', '20261226', '20261227', '20261228', '20261229', '20261230',
      '20261231', '20270101', '20270102',
    ],
  },
  {
    topic: 'couple',
    module: 'RankModule',
    locales: ALL_LOCALES,
    start: STAGE_1_START,
    finish: TOTAL_FINISH,
    dailyDays: [
      '20261217', '20261218', '20261219', '20261220', '20261221', '20261222', '20261223',
      '20261224', '20261225', '20261226', '20261227', '20261228', '20261229', '20261230',
      '20261231', '20270101', '20270102',
    ],
  },
];

export const ALL_TOPICS: TopicSpec[] = [
  ...PLAYER_IN_TOPICS,
  ...PLAYER_TOPICS,
  ...ROOM_IN_TOPICS,
  ...FAMILY_IN_TOPICS,
  ...TOTAL_TOPICS,
];

export interface ModuleDetail {
  id: number;
  biz: string;
  topic: string;
  locale: string;
  key: string;
  startTime: number;
  finishTime: number;
  rounds?: Array<{
    id: number;
    topic: string;
    locale: string;
    key: string;
    startTime: number;
    finishTime: number;
    status?: unknown;
  }>;
}

/** 调用模块 init，创建主轮次与日榜/PK 轮次（幂等，重复 key 会被忽略） */
export async function initTopic(api: APITestResource, topic: string, debugTs = INIT_DEBUG_TS): Promise<unknown> {
  return api.request(`active/v3/${BIZ}/m/${topic}/init`, {
    body: {},
    locale: IN,
    debugTimestamp: debugTs,
  });
}

/** 查询模块详情（含主轮次与日榜/PK 轮次） */
export async function queryModuleDetail(
  api: APITestResource,
  topic: string,
  locale: string,
  debugTs = RUN_DEBUG_TS,
  biz = BIZ,
): Promise<ModuleDetail | null> {
  const data = await api.request(`active/v3/${biz}/m/${topic}/detail`, {
    body: {},
    locale,
    debugTimestamp: debugTs,
  });
  const detail = (data as { detail?: ModuleDetail | null } | null)?.detail;
  return detail ?? null;
}

/** 测试环境只读 SQL（复用 admin-ai 查询网关，逻辑库名 active） */
const testSql = new APIProdResource({ host: 'https://api.test.cinta.team/' });

export async function queryActiveSql(sql: string): Promise<unknown[][]> {
  const result = await testSql.query('active', sql);
  return result.data;
}

export interface AwardRow {
  name: string;
  stage: number;
  sequence: number;
  mod: string;
  award_type: string;
  award_id: number;
  award_count: number;
  expire_express: string;
  player_type: string;
  locale: string;
}

export interface SendGiftParams {
  sender: number;
  receiver: number;
  familyId?: number;
  roomId?: number;
  giftId: number;
  giftPrice: number;
  sendTimeMs: number;
  orderNo?: string;
  locale?: string;
}

let giftSeq = 0;

/** 通过 __consumer/funbit.gift_send 模拟真实送礼消息（测试环境） */
export async function sendGift(api: APITestResource, params: SendGiftParams): Promise<string> {
  const locale = params.locale ?? IN;
  const orderNo = params.orderNo ?? `AI_PK2612_${Date.now()}_${++giftSeq}`;
  const roomId = params.roomId ?? 10100001;
  const payload = [{
    id: 193566294,
    order_no: orderNo,
    batch_no: orderNo,
    free: 0,
    sender_id: params.sender,
    receiver_id: params.receiver,
    room_id: roomId,
    gift_id: params.giftId,
    gift_class_id: 3790,
    gift_shelf_type: 'voiceroom',
    gift_price: params.giftPrice,
    gift_count: 1,
    scene: null,
    locale,
    total_coin: params.giftPrice,
    send_time: params.sendTimeMs,
    create_time: params.sendTimeMs,
    guild_id: params.familyId ?? 900000197,
    sign_guild_id: 0,
    mic_index: 0,
    source_name: 'MST',
    host_id: 17084268,
    room_source: 'voiceroom',
    rank_coin: 200,
    box_id: null,
    shumei_token: 'TEST_TOKEN',
    drbddid: 'TEST_DDBDID',
    ip: '103.158.82.166',
    group_id: null,
    gift_type: 'basic',
    is_fake: 0,
  }];
  await api.request('active/v3/__consumer/funbit.gift_send', {
    body: payload,
    debugTimestamp: new Date(params.sendTimeMs).toISOString(),
    extraHeaders: { 'l-trace-id': '888888' },
  });
  return orderNo;
}

export interface RankEntry {
  player: number;
  amount: number;
  rank?: number;
  [key: string]: unknown;
}

export interface RankResponse {
  rankResult?: RankEntry[];
  my?: RankEntry | null;
  myAll?: RankEntry[];
  [key: string]: unknown;
}

/** 查询榜单（返回原始结构，便于断言 my/rankResult） */
export async function queryRank(
  api: APITestResource,
  topic: string,
  key: string,
  locale: string,
  userId: number,
  debugTs = RUN_DEBUG_TS,
  count = 50,
): Promise<RankResponse> {
  const data = await api.request(`active/v3/${BIZ}/m/${topic}/rank`, {
    body: { key, count, locale: null, includeMine: true },
    userId,
    locale,
    debugTimestamp: debugTs,
  });
  return (data ?? {}) as RankResponse;
}

