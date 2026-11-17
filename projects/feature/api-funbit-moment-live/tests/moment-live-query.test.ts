import { CheckBaseClass } from '../../../../src/base/CheckBaseClass.ts';
import {
  isEmpty,
  loadTestAccount,
  MomentLiveClient,
  num,
  RateWindow,
  sleep,
  type HttpResponse,
  type TestAccount,
} from './lib/moment-live-client.ts';

/**
 * TK-0314 动态类型 live（分享直播间）—— 查询填充与回归测试
 *
 * 需求：TK-0310 REQUIREMENTS.md R1（2.4.2 查询 / 2.4.4 填充规则 / 2.6 边界 / 2.7 兼容）
 * 被测接口：
 *   GET /v2/api/moment/user/list、/v2/api/moment/user/one、/v2/api/moment/attention/list
 *   GET /v2/moment/user/list、/v2/moment/info、/v2/moment/user/one
 *   GET /v2/moment/hotsort/list、/v2/moment/hotsort/listv2
 *   GET /litalive/internalcall/localeRooms（增量字段 noLiveList）
 * 覆盖用例：API-LIVE-101 ~ 114（见 COVERAGE.md）
 * 运行：
 *   cd projects/feature/api-funbit-moment-live/tests
 *   node moment-live-query.test.ts
 */

interface Room {
  roomId: string;
  roomName: string;
  tagType: string;
  tagName: string;
  anchorId: string;
  userId: string;
}

class MomentLiveQuery extends CheckBaseClass {
  private readonly client = new MomentLiveClient();
  private readonly publishWindow = new RateWindow(9, 61_000);
  private account: TestAccount | null = null;

  private token = '';
  private userId = '';
  private locale = '';
  private liveRoom: Room | null = null;
  private noLiveRoom: Room | null = null;
  private liveMomentId = '';
  private noLiveMomentId = '';
  private textMomentId = '';
  private publishLiving: Record<string, unknown> = {};
  private readonly createdIds: string[] = [];
  private cleaned = false;

  constructor() {
    super();
    this.total = 18;
  }

  protected async run(): Promise<void> {
    try {
      const ready = await this.setup();
      if (!ready) return;

      await this.check('【API-LIVE-101】P0 登录版用户动态列表：live 动态返回填充后的 content.live（living=true）', async () => {
        const res = await this.get(`/v2/api/moment/user/list?authorId=${this.userId}&momentId=0`, true);
        const item = findItem(res, this.liveMomentId);
        if (!item) return notFound(res, this.liveMomentId);
        return compareLive(item, this.liveRoom!, true);
      });

      await this.check('【API-LIVE-102】P0 登录版动态详情 /user/one：content.live 填充正确（living=true）', async () => {
        const res = await this.get(`/v2/api/moment/user/one?momentId=${this.liveMomentId}&authorId=${this.userId}`, true);
        const data = res.json?.data;
        if (!data) return notFound(res, this.liveMomentId);
        return compareLive(data, this.liveRoom!, true);
      });

      await this.check('【API-LIVE-103】P0 免登版用户动态列表：content.live 填充正确（living=true）', async () => {
        const res = await this.get(`/v2/moment/user/list?authorId=${this.userId}&momentId=0`, false);
        const item = findItem(res, this.liveMomentId);
        if (!item) return notFound(res, this.liveMomentId);
        return compareLive(item, this.liveRoom!, true);
      });

      await this.check('【API-LIVE-104】P0 免登版动态详情 /info：content.live 填充正确（living=true）', async () => {
        const res = await this.get(`/v2/moment/info?authorId=${this.userId}&momentId=${this.liveMomentId}`, false);
        const data = res.json?.data;
        if (!data) return notFound(res, this.liveMomentId);
        return compareLive(data, this.liveRoom!, true);
      });

      await this.check('【API-LIVE-105】P0 免登版动态详情 /user/one：content.live 填充正确（living=true）', async () => {
        const res = await this.get(`/v2/moment/user/one?momentId=${this.liveMomentId}&authorId=${this.userId}`, false);
        const data = res.json?.data;
        if (!data) return notFound(res, this.liveMomentId);
        return compareLive(data, this.liveRoom!, true);
      });

      await this.check('【API-LIVE-106】P1 关注流：live 动态返回填充后的 content.live（living=true）', async () => {
        const res = await this.get('/v2/api/moment/attention/list?momentId=0', true);
        const item = findItem(res, this.liveMomentId);
        if (!item) {
          return {
            expect: `关注流包含动态 ${this.liveMomentId} 且 content.live 填充完整`,
            real: `关注流未返回该动态（列表条数=${(res.json?.data?.datas ?? []).length}）`,
            pass: false,
            message: '关注流未返回本次发布的动态，无法验证填充（若为关注关系/分页原因需人工确认）',
          };
        }
        return compareLive(item, this.liveRoom!, true);
      });

      await this.check('【API-LIVE-107】P1 多条 live 动态批量填充：在播/未开播 living 各自正确', async () => {
        const res = await this.get(`/v2/moment/user/list?authorId=${this.userId}&momentId=0`, true);
        const liveItem = findItem(res, this.liveMomentId);
        const noLiveItem = findItem(res, this.noLiveMomentId);
        if (!liveItem || !noLiveItem) {
          return notFound(res, `${this.liveMomentId},${this.noLiveMomentId}`);
        }
        const a = compareLive(liveItem, this.liveRoom!, true);
        const b = compareLive(noLiveItem, this.noLiveRoom!, false);
        return {
          expect: '在播动态 living=true，未开播动态 living=false，且房间信息各自匹配',
          real: `在播 living=${liveItem.content?.live?.living} roomId=${num(liveItem.content?.live?.roomId)}；未开播 living=${noLiveItem.content?.live?.living} roomId=${num(noLiveItem.content?.live?.roomId)}`,
          pass: a.pass && b.pass,
          message: a.pass && b.pass ? undefined : [a.message, b.message].filter(Boolean).join('；'),
        };
      });

      await this.check('【API-LIVE-108】P1 热门流 /hotsort/list：命中 live 动态时 content.live 填充正确', async () => {
        const hit = await this.findInHotsort('/v2/moment/hotsort/list?len=20&nextIndex=0&batchNo=0');
        if (!hit) {
          return this.skip(
            `热门流批次（batchNo=now）未包含本次发布的 live 动态（${this.liveMomentId}），无法验证该接口的 live 填充；` +
              'hotsort 由定时批次从 state=pass 的动态中生成，新发布动态进入批次存在延迟，按阻塞记录',
          );
        }
        return compareLive(hit, this.liveRoom!, true);
      });

      await this.check('【API-LIVE-109】P1 热门流 /hotsort/listv2：命中 live 动态时 content.live 填充正确', async () => {
        const hit = await this.findInHotsort('/v2/moment/hotsort/listv2?len=20&nextIndex=0&batchNo=0', 2);
        if (!hit) {
          return this.skip(
            `热门流 listv2 批次未包含本次发布的 live 动态（${this.liveMomentId}），无法验证该接口的 live 填充；按阻塞记录`,
          );
        }
        return compareLive(hit, this.liveRoom!, true);
      });

      await this.check('【API-LIVE-110】P1 其他类型回归：text 动态发布与查询正常，content 无 live 字段', async () => {
        const res = await this.get(`/v2/api/moment/user/list?authorId=${this.userId}&momentId=0`, true);
        const item = findItem(res, this.textMomentId);
        if (!item) return notFound(res, this.textMomentId);
        const live = item.content?.live;
        const textValue = String(item.content?.text?.text ?? '');
        return {
          expect: 'momentType=text，content.text 正常，无 content.live',
          real: `momentType=${item.momentType} text=${textValue.slice(0, 40)} live=${JSON.stringify(live ?? null)}`,
          pass: item.momentType === 'text' && textValue.includes('TK-0314 text-regression') && (live === undefined || live === null),
        };
      });

      await this.check('【API-LIVE-111】P1 回归：其他用户历史动态列表不受影响，非 live 动态不携带 content.live', async () => {
        const res = await this.get('/v2/moment/user/list?authorId=7969&momentId=0', false);
        if (res.httpStatus !== 200 || res.json?.status !== '0') {
          return {
            expect: 'status=0 且返回 datas 列表',
            real: `HTTP ${res.httpStatus} status=${res.json?.status} msg=${res.json?.msg}`,
            pass: false,
          };
        }
        const datas: any[] = res.json?.data?.datas ?? [];
        const polluted = datas.filter((x) => x.momentType !== 'live' && x.content?.live !== undefined && x.content?.live !== null);
        return {
          expect: `${datas.length} 条历史动态中非 live 动态均无 content.live`,
          real: `条数=${datas.length} 污染条数=${polluted.length}`,
          pass: datas.length > 0 && polluted.length === 0,
          message: polluted.length > 0 ? `非 live 动态出现 content.live：${polluted.map((x) => x.momentId).join(',')}` : undefined,
        };
      });

      await this.check('【API-LIVE-112】P2 数字字段兼容：content.live.roomId / anchorId 可为字符串数字且可解析', async () => {
        const res = await this.get(`/v2/moment/info?authorId=${this.userId}&momentId=${this.liveMomentId}`, false);
        const live = res.json?.data?.content?.live ?? {};
        const roomOk = ['string', 'number'].includes(typeof live.roomId) && Number.isFinite(Number(live.roomId));
        const anchorOk = ['string', 'number'].includes(typeof live.anchorId) && Number.isFinite(Number(live.anchorId));
        return {
          expect: 'roomId/anchorId 为 string 或 number 且可解析为数字',
          real: `roomId=${typeof live.roomId}:${live.roomId} anchorId=${typeof live.anchorId}:${live.anchorId}`,
          pass: roomOk && anchorOk,
        };
      });

      await this.check('【API-LIVE-113】P2 localeRooms 增量兼容：list/noLiveList 同时存在，list 原有字段齐全', async () => {
        const res = await this.client.localeRooms(this.locale);
        const required = ['roomId', 'roomName', 'roomType', 'tagType', 'tagName', 'anchorId', 'userId', 'locale'];
        const missing = (res.list[0] ? required.filter((k) => !(k in res.list[0])) : required).filter(Boolean);
        return {
          expect: 'noLiveList 存在；list 项包含 roomId/roomName/roomType/tagType/tagName/anchorId/userId/locale',
          real: `list=${res.list.length} noLiveList=${res.noLiveList.length} 缺失字段=${missing.join(',') || '无'}`,
          pass: Array.isArray(res.noLiveList) && res.list.length > 0 && missing.length === 0,
        };
      });

      await this.check('【API-LIVE-114】P2 发布响应与随后查询的 living 一致（2 分钟缓存窗口内）', async () => {
        const res = await this.get(`/v2/moment/user/list?authorId=${this.userId}&momentId=0`, true);
        const liveItem = findItem(res, this.liveMomentId);
        const noLiveItem = findItem(res, this.noLiveMomentId);
        if (!liveItem || !noLiveItem) return notFound(res, `${this.liveMomentId},${this.noLiveMomentId}`);
        const publishLive = this.publishLiving[this.liveMomentId];
        const publishNoLive = this.publishLiving[this.noLiveMomentId];
        return {
          expect: `发布响应 living：在播=${publishLive} 未开播=${publishNoLive}`,
          real: `查询响应 living：在播=${liveItem.content?.live?.living} 未开播=${noLiveItem.content?.live?.living}`,
          pass:
            publishLive === liveItem.content?.live?.living && publishNoLive === noLiveItem.content?.live?.living,
        };
      });
    } finally {
      await this.cleanup();
    }
  }

  private async setup(): Promise<boolean> {
    await this.act('前置：登录测试账号、读取直播间数据并发布测试动态', async () => {
      const account = loadTestAccount();
      this.account = account;
      const login = await this.client.login(account);
      this.token = login.token;
      this.userId = login.userId;
      this.locale = login.locale;
      if (!this.locale) throw new Error('账号 locale 为空，无法按大区获取直播间数据');

      const rooms = await this.client.localeRooms(this.locale);
      if (rooms.list.length === 0) throw new Error(`locale=${this.locale} 无在播房间`);
      if (rooms.noLiveList.length === 0) throw new Error(`locale=${this.locale} 无未开播房间`);
      this.liveRoom = toRoom(rooms.list.find((r) => num(r.anchorId) !== '0' && !isEmpty(r.tagName)) ?? rooms.list[0]);
      this.noLiveRoom =
        rooms.noLiveList.map(toRoom).find((r) => !isEmpty(r.tagName) && num(r.anchorId) !== '0') ??
        toRoom(rooms.noLiveList[0]);
      this.log(`登录用户=${this.userId} locale=${this.locale} 在播=${this.liveRoom.roomId} 未开播=${this.noLiveRoom.roomId}`);

      await this.publishWindow.acquire((m) => this.log(m));
      const live = await this.client.publish(
        { momentType: 'live', content: { text: { text: `TK-0314 query-live ${Date.now()}` }, live: { roomId: Number(this.liveRoom.roomId) } } },
        this.token,
      );
      if (live.httpStatus !== 200 || live.json?.status !== '0') throw new Error(`发布在播 live 动态失败: ${live.raw.slice(0, 300)}`);
      this.liveMomentId = String(live.json.data.momentId);
      this.createdIds.push(this.liveMomentId);
      this.publishLiving[this.liveMomentId] = live.json.data.content?.live?.living;

      await this.publishWindow.acquire((m) => this.log(m));
      const noLive = await this.client.publish(
        { momentType: 'live', content: { text: { text: `TK-0314 query-nolive ${Date.now()}` }, live: { roomId: Number(this.noLiveRoom.roomId) } } },
        this.token,
      );
      if (noLive.httpStatus !== 200 || noLive.json?.status !== '0') throw new Error(`发布未开播 live 动态失败: ${noLive.raw.slice(0, 300)}`);
      this.noLiveMomentId = String(noLive.json.data.momentId);
      this.createdIds.push(this.noLiveMomentId);
      this.publishLiving[this.noLiveMomentId] = noLive.json.data.content?.live?.living;

      await this.publishWindow.acquire((m) => this.log(m));
      const textRes = await this.client.publish(
        { momentType: 'text', content: { text: { text: `TK-0314 text-regression ${Date.now()}` } } },
        this.token,
      );
      if (textRes.httpStatus !== 200 || textRes.json?.status !== '0') throw new Error(`发布 text 动态失败: ${textRes.raw.slice(0, 300)}`);
      this.textMomentId = String(textRes.json.data.momentId);
      this.createdIds.push(this.textMomentId);

      this.log(`已发布：live=${this.liveMomentId}(living=${this.publishLiving[this.liveMomentId]}) ` +
        `noLive=${this.noLiveMomentId}(living=${this.publishLiving[this.noLiveMomentId]}) text=${this.textMomentId}`);
    });
    return !!this.token && !!this.liveMomentId && !!this.noLiveMomentId && !!this.textMomentId;
  }

  private async cleanup(): Promise<void> {
    if (this.cleaned || !this.token) return;
    this.cleaned = true;
    await this.act('清理：删除本次发布的测试动态', async () => {
      const ids = [...new Set(this.createdIds)];
      if (ids.length === 0) {
        this.log('本次无新增动态');
        return;
      }
      for (const id of ids) {
        const res = await this.client.deleteMoment(id, this.token);
        if (res.httpStatus !== 200 || res.json?.status !== '0') {
          throw new Error(`删除动态 ${id} 失败: HTTP ${res.httpStatus} ${res.raw.slice(0, 300)}`);
        }
      }
      this.log(`已删除 ${ids.length} 条动态：${ids.join(',')}`);
    });
  }

  private async get(path: string, auth: boolean): Promise<HttpResponse> {
    return this.client.request(path, { token: auth ? this.token : undefined });
  }

  private async findInHotsort(path: string, attempts = 4): Promise<any | null> {
    for (let i = 0; i < attempts; i++) {
      const res = await this.client.request(path, { headers: { 'l-user-locale': this.locale } });
      const datas: any[] = res.json?.data?.datas ?? [];
      const hit = datas.find((x) => String(x.momentId) === this.liveMomentId);
      this.log(`热门流轮询 ${i + 1}/${attempts}：HTTP ${res.httpStatus} 条数=${datas.length} 命中=${!!hit}`);
      if (hit) return hit;
      if (i < attempts - 1) await sleep(15_000);
    }
    return null;
  }
}

function toRoom(r: any): Room {
  return {
    roomId: num(r.roomId),
    roomName: String(r.roomName ?? ''),
    tagType: String(r.tagType ?? ''),
    tagName: String(r.tagName ?? ''),
    anchorId: num(r.anchorId),
    userId: num(r.userId),
  };
}

function findItem(res: HttpResponse, momentId: string): any | null {
  const datas: any[] = res.json?.data?.datas ?? [];
  return datas.find((x) => String(x.momentId) === momentId) ?? null;
}

function notFound(res: HttpResponse, momentId: string) {
  return {
    expect: `响应包含动态 ${momentId}`,
    real: `HTTP ${res.httpStatus} status=${res.json?.status} 条数=${(res.json?.data?.datas ?? []).length}`,
    pass: false,
    message: `响应未包含动态 ${momentId}：HTTP ${res.httpStatus} status=${res.json?.status} msg=${res.json?.msg ?? ''}`,
  };
}

function compareLive(data: any, room: Room, living: boolean) {
  const live = data?.content?.live ?? {};
  const expectAnchor = room.anchorId && room.anchorId !== '0' ? room.anchorId : room.userId;
  const problems: string[] = [];
  if (data?.momentType !== 'live') problems.push(`momentType=${data?.momentType}`);
  if (num(live.roomId) !== room.roomId) problems.push(`roomId=${num(live.roomId)}≠${room.roomId}`);
  if (num(live.anchorId) !== expectAnchor) problems.push(`anchorId=${num(live.anchorId)}≠${expectAnchor}`);
  if (isEmpty(live.anchorNickname)) problems.push('anchorNickname 为空');
  if (isEmpty(live.anchorAvatarUrl)) problems.push('anchorAvatarUrl 为空');
  if (String(live.roomName ?? '') !== room.roomName) problems.push(`roomName=${live.roomName}≠${room.roomName}`);
  if (String(live.tagType ?? '') !== room.tagType) problems.push(`tagType=${live.tagType}≠${room.tagType}`);
  if (String(live.tagName ?? '') !== room.tagName) problems.push(`tagName=${live.tagName}≠${room.tagName}`);
  if (live.living !== living) problems.push(`living=${live.living}≠${living}`);
  return {
    expect:
      `roomId=${room.roomId} anchorId=${expectAnchor} living=${living} roomName=${room.roomName} ` +
      `tagType=${room.tagType} tagName=${room.tagName}`,
    real:
      `roomId=${num(live.roomId)} anchorId=${num(live.anchorId)} living=${live.living} ` +
      `roomName=${live.roomName} tagType=${live.tagType} tagName=${live.tagName}`,
    pass: problems.length === 0,
    message: problems.length === 0 ? undefined : `字段不符：${problems.join('；')}`,
  };
}

await new MomentLiveQuery().execute();
