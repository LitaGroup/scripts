import { CheckBaseClass } from '../../../../src/base/CheckBaseClass.ts';
import {
  isEmpty,
  loadTestAccount,
  MomentLiveClient,
  num,
  RateWindow,
  type HttpResponse,
  type TestAccount,
} from './lib/moment-live-client.ts';

/**
 * TK-0314 动态类型 live（分享直播间）—— 发布接口测试
 *
 * 需求：TK-0310 REQUIREMENTS.md（原始需求 3724）R1；接口文档见任务文档 /task/20261117/TK-0314/API.md
 * 被测接口：
 *   POST /v2/api/moment/publish  （兼容 POST /moment/publish）
 * 覆盖用例：API-LIVE-001 ~ 016（见 COVERAGE.md）
 * 运行：
 *   cd projects/feature/api-funbit-moment-live/tests
 *   node moment-live-publish.test.ts
 * 前置：
 *   测试环境可登录账号（环境变量 MOMENT_LIVE_COUNTRY_CODE / MOMENT_LIVE_MOBILE / MOMENT_LIVE_VERIFY_CODE，
 *   或 config.json 的 momentLive 段；凭证不得写入仓库）。
 * 数据：
 *   直播间列表实时取自 GET /litalive/internalcall/localeRooms（locale=账号 locale），
 *   本次发布的动态在 finally 阶段全部删除。
 */

interface Room {
  roomId: string;
  roomName: string;
  tagType: string;
  tagName: string;
  anchorId: string;
  userId: string;
}

class MomentLivePublish extends CheckBaseClass {
  private readonly client = new MomentLiveClient();
  private account: TestAccount | null = null;
  private readonly publishWindow = new RateWindow(9, 61_000);

  private token = '';
  private userId = '';
  private locale = '';
  private liveRoom: Room | null = null;
  private fallbackRoom: Room | null = null;
  private noLiveRoom: Room | null = null;
  private crossRoom: Room | null = null;
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

      await this.check('【API-LIVE-001】P0 发布 live（在播房间）：成功且返回填充后的 content.live（living=true）', async () => {
        const res = await this.publishLive({ text: text('publish-live'), roomId: Number(this.liveRoom!.roomId) });
        if (!ok(res)) return failExpectation(res, 'status=0 且 content.live 填充完整（living=true）');
        this.createdIds.push(String(res.json.data.momentId));
        return compareLive(res, this.liveRoom!, true);
      });

      await this.check('【API-LIVE-002】P0 发布 live（未开播房间）：成功且 living=false，其余展示信息完整', async () => {
        const res = await this.publishLive({ text: text('publish-nolive'), roomId: Number(this.noLiveRoom!.roomId) });
        if (!ok(res)) return failExpectation(res, 'status=0 且 content.live 填充完整（living=false）');
        this.createdIds.push(String(res.json.data.momentId));
        return compareLive(res, this.noLiveRoom!, false);
      });

      await this.check('【API-LIVE-003】P1 anchorId 填充：房间 anchor_id 为空时回退 user_id', async () => {
        if (!this.fallbackRoom) return this.skip('测试环境当前无 anchor_id 为空的直播间，无法构造该场景');
        const res = await this.publishLive({ text: text('publish-fallback'), roomId: Number(this.fallbackRoom.roomId) });
        if (!ok(res)) return failExpectation(res, 'status=0 且 anchorId 回退为房间 userId');
        this.createdIds.push(String(res.json.data.momentId));
        const live = res.json.data.content?.live ?? {};
        const expect = num(this.fallbackRoom.userId);
        const real = num(live.anchorId);
        return {
          expect,
          real,
          message: real === expect ? undefined : `anchor_id 为空的房间应回退 user_id=${expect}，实际 anchorId=${real}`,
        };
      });

      await this.check('【API-LIVE-004】P0 roomId=0：发布失败，提示 live.roomId 传入的值错误', async () => {
        const res = await this.publishLive({ text: text('roomid-zero'), roomId: 0 });
        return expectBizError(res, 'live.roomId 传入的值错误');
      });

      await this.check('【API-LIVE-005】P0 content.live 缺失：发布失败，提示 live.roomId 传入的值错误', async () => {
        const res = await this.publishLive({ text: text('live-missing') });
        return expectBizError(res, 'live.roomId 传入的值错误');
      });

      await this.check('【API-LIVE-006】P1 roomId<0：发布失败，提示 live.roomId 传入的值错误', async () => {
        const res = await this.publishLive({ text: text('roomid-negative'), roomId: -1 });
        return expectBizError(res, 'live.roomId 传入的值错误');
      });

      await this.check('【API-LIVE-007】P0 roomId 不存在：发布失败，提示 live room not exist', async () => {
        const res = await this.publishLive({ text: text('roomid-absent'), roomId: 999_999_999 });
        return expectBizError(res, 'live room not exist');
      });

      await this.check('【API-LIVE-008】P1 跨大区 roomId（其他 locale 直播间）：发布失败，提示 live room not exist', async () => {
        if (!this.crossRoom) return this.skip('测试环境其他 locale 无可用直播间，无法构造跨大区场景');
        const res = await this.publishLive({ text: text('roomid-cross'), roomId: Number(this.crossRoom.roomId) });
        return expectBizError(res, 'live room not exist');
      });

      await this.check('【API-LIVE-009】P0 未登录发布：返回未登录（status=2）', async () => {
        await this.publishWindow.acquire((m) => this.log(m));
        const res = await this.client.publish(
          { momentType: 'live', content: { text: text('unauth'), live: { roomId: Number(this.noLiveRoom!.roomId) } } },
          undefined,
        );
        return {
          expect: 'status=2 msg=未登录',
          real: `status=${res.json?.status} msg=${res.json?.msg}`,
          pass: res.httpStatus === 200 && res.json?.status === '2' && res.json?.msg === '未登录',
        };
      });

      await this.check('【API-LIVE-010】P1 content 缺失：发布失败，提示 必须传入内容!', async () => {
        const res = await this.publishRaw({ momentType: 'live' });
        return expectBizError(res, '必须传入内容!');
      });

      await this.check('【API-LIVE-011】P1 momentType 非法（livex）：发布失败，提示 作品类型错误！livex', async () => {
        const res = await this.publishRaw({
          momentType: 'livex',
          content: { text: text('bad-type'), live: { roomId: Number(this.noLiveRoom!.roomId) } },
        });
        return expectBizError(res, '作品类型错误！livex');
      });

      await this.check('【API-LIVE-012】P1 momentType 缺失：发布失败，提示 作品类型错误！null', async () => {
        const res = await this.publishRaw({
          content: { text: text('no-type'), live: { roomId: Number(this.noLiveRoom!.roomId) } },
        });
        return expectBizError(res, '作品类型错误！null');
      });

      await this.check('【API-LIVE-013】P2 兼容路径 /moment/publish：live 类型可正常发布', async () => {
        await this.publishWindow.acquire((m) => this.log(m));
        const res = await this.client.publishLegacy(
          {
            momentType: 'live',
            content: { text: text('legacy-path'), live: { roomId: Number(this.noLiveRoom!.roomId) } },
          },
          this.token,
        );
        if (!ok(res)) return failExpectation(res, 'status=0');
        this.createdIds.push(String(res.json.data.momentId));
        return { expect: 'momentType=live living=false', real: `momentType=${res.json.data.momentType} living=${res.json.data.content?.live?.living}`, pass: res.json.data.momentType === 'live' && res.json.data.content?.live?.living === false };
      });

      await this.check('【API-LIVE-014】P2 请求侧伪造展示字段：服务端以直播间数据覆盖，客户端传值不生效', async () => {
        await this.publishWindow.acquire((m) => this.log(m));
        const res = await this.client.publish(
          {
            momentType: 'live',
            content: {
              text: text('override'),
              live: {
                roomId: Number(this.noLiveRoom!.roomId),
                anchorId: 1,
                anchorNickname: 'fake-nick',
                anchorAvatarUrl: 'https://fake/avatar.jpg',
                roomName: 'fake-room',
                tagType: 'fake-type',
                tagName: 'fake-tag',
                living: true,
              },
            },
          },
          this.token,
        );
        if (!ok(res)) return failExpectation(res, 'status=0 且展示字段全部以服务端直播间数据为准');
        this.createdIds.push(String(res.json.data.momentId));
        return compareLive(res, this.noLiveRoom!, false);
      });

      await this.check('【API-LIVE-015】P2 authorId 缺省/为 0：发布归属当前登录用户', async () => {
        await this.publishWindow.acquire((m) => this.log(m));
        const absent = await this.client.publish(
          { momentType: 'live', content: { text: text('author-default'), live: { roomId: Number(this.noLiveRoom!.roomId) } } },
          this.token,
        );
        if (!ok(absent)) return failExpectation(absent, 'authorId 缺省时 status=0 且 authorId=登录用户');
        this.createdIds.push(String(absent.json.data.momentId));
        await this.publishWindow.acquire((m) => this.log(m));
        const zero = await this.client.publish(
          { momentType: 'live', authorId: 0, content: { text: text('author-zero'), live: { roomId: Number(this.noLiveRoom!.roomId) } } },
          this.token,
        );
        if (!ok(zero)) return failExpectation(zero, 'authorId=0 时 status=0 且 authorId=登录用户');
        this.createdIds.push(String(zero.json.data.momentId));
        const a = num(absent.json.data.authorId);
        const b = num(zero.json.data.authorId);
        return {
          expect: `authorId=${this.userId}`,
          real: `缺省=${a} 传0=${b}`,
          pass: a === this.userId && b === this.userId,
        };
      });

      await this.check('【API-LIVE-016】P1 content.text 可选：不传 text 时发布成功', async () => {
        await this.publishWindow.acquire((m) => this.log(m));
        const res = await this.client.publish(
          { momentType: 'live', content: { live: { roomId: Number(this.noLiveRoom!.roomId) } } },
          this.token,
        );
        if (!ok(res)) return failExpectation(res, '不传 content.text 时 status=0');
        this.createdIds.push(String(res.json.data.momentId));
        return {
          expect: 'status=0 momentType=live living=false',
          real: `status=${res.json.status} momentType=${res.json.data.momentType} living=${res.json.data.content?.live?.living}`,
          pass: res.json.data.momentType === 'live' && res.json.data.content?.live?.living === false,
        };
      });
    } finally {
      await this.cleanup();
    }
  }

  private async setup(): Promise<boolean> {
    let okSetup = true;
    await this.act('前置：登录测试账号并读取 locale 直播间数据', async () => {
      const account = loadTestAccount();
      this.account = account;
      const login = await this.client.login(account);
      this.token = login.token;
      this.userId = login.userId;
      this.locale = login.locale;
      if (!this.locale) throw new Error('账号 locale 为空，无法按大区获取直播间数据');
      this.log(`登录用户=${this.userId} locale=${this.locale}`);

      const rooms = await this.client.localeRooms(this.locale);
      this.log(`locale=${this.locale} 在播房间=${rooms.list.length} 未开播房间=${rooms.noLiveList.length}`);
      if (rooms.list.length === 0) throw new Error(`locale=${this.locale} 无在播房间，无法执行发布用例`);

      this.liveRoom = toRoom(
        rooms.list.find((r) => num(r.anchorId) !== '0' && !isEmpty(r.tagName)) ?? rooms.list[0],
      );
      this.fallbackRoom = rooms.list.map(toRoom).find((r) => r.anchorId === '0' || r.anchorId === '') ?? null;
      this.noLiveRoom =
        rooms.noLiveList.map(toRoom).find((r) => !isEmpty(r.tagName) && num(r.anchorId) !== '0') ??
        (rooms.noLiveList.length > 0 ? toRoom(rooms.noLiveList[0]) : null);
      if (!this.noLiveRoom) throw new Error(`locale=${this.locale} 无未开播房间，无法执行 living=false 用例`);

      const others = ['zh', 'th', 'en', 'ar', 'vi'].filter((l) => l !== this.locale);
      for (const l of others) {
        const other = await this.client.localeRooms(l);
        const candidate = [...other.list, ...other.noLiveList][0];
        if (candidate) {
          const inCurrent = [...rooms.list, ...rooms.noLiveList].some((r) => num(r.roomId) === num(candidate.roomId));
          if (!inCurrent) {
            this.crossRoom = toRoom(candidate);
            this.log(`跨大区直播间取自 locale=${l} roomId=${this.crossRoom.roomId}`);
            break;
          }
        }
      }
      if (!this.crossRoom) this.log('未找到其他 locale 的直播间，跨大区用例将标记阻塞');
      if (!this.fallbackRoom) this.log('未找到 anchor_id 为空的在播房间，回退用例将标记阻塞');

      this.log(
        `用例房间：在播=${this.liveRoom.roomId} 未开播=${this.noLiveRoom.roomId} ` +
          `回退=${this.fallbackRoom?.roomId ?? 'N/A'} 跨大区=${this.crossRoom?.roomId ?? 'N/A'}`,
      );
    });
    if (!this.token || !this.noLiveRoom) okSetup = false;
    return okSetup;
  }

  private async cleanup(): Promise<void> {
    if (this.cleaned || !this.token) return;
    this.cleaned = true;
    await this.act('清理：删除本次发布的 live 动态', async () => {
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
      const verify = await this.client.request(`/v2/moment/info?authorId=${this.userId}&momentId=${ids[0]}`);
      this.log(`已删除 ${ids.length} 条动态：${ids.join(',')}；抽查 ${ids[0]} 查询结果 data=${JSON.stringify(verify.json?.data)}`);
    });
  }

  private async publishLive(payload: { text: string; roomId?: number }): Promise<HttpResponse> {
    await this.publishWindow.acquire((m) => this.log(m));
    const content: Record<string, unknown> = { text: { text: payload.text } };
    if (payload.roomId !== undefined) content.live = { roomId: payload.roomId };
    return this.client.publish({ momentType: 'live', content }, this.token);
  }

  private async publishRaw(body: unknown): Promise<HttpResponse> {
    await this.publishWindow.acquire((m) => this.log(m));
    return this.client.publish(body, this.token);
  }
}

function text(tag: string): string {
  return `TK-0314 ${tag} ${Date.now()}`;
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

function ok(res: HttpResponse): boolean {
  return res.httpStatus === 200 && res.json?.status === '0';
}

function failExpectation(res: HttpResponse, expect: string) {
  return {
    expect,
    real: `HTTP ${res.httpStatus} status=${res.json?.status} msg=${res.json?.msg ?? res.raw.slice(0, 200)}`,
    pass: false,
    message: `发布未成功：HTTP ${res.httpStatus} status=${res.json?.status} msg=${res.json?.msg ?? res.raw.slice(0, 300)}`,
  };
}

function expectBizError(res: HttpResponse, msg: string) {
  return {
    expect: `status=1 msg=${msg}`,
    real: `HTTP ${res.httpStatus} status=${res.json?.status} msg=${res.json?.msg}`,
    pass: res.httpStatus === 200 && res.json?.status === '1' && res.json?.msg === msg,
    message:
      res.httpStatus === 200 && res.json?.status === '1' && res.json?.msg === msg
        ? undefined
        : `期望 status=1 msg=${msg}，实际 HTTP ${res.httpStatus} status=${res.json?.status} msg=${res.json?.msg}`,
  };
}

function compareLive(res: HttpResponse, room: Room, living: boolean) {
  const data = res.json?.data ?? {};
  const live = data.content?.live ?? {};
  const expectAnchor = room.anchorId && room.anchorId !== '0' ? room.anchorId : room.userId;
  const problems: string[] = [];
  if (data.momentType !== 'live') problems.push(`momentType=${data.momentType}`);
  if (num(live.roomId) !== room.roomId) problems.push(`roomId=${num(live.roomId)}≠${room.roomId}`);
  if (num(live.anchorId) !== expectAnchor) problems.push(`anchorId=${num(live.anchorId)}≠${expectAnchor}`);
  if (isEmpty(live.anchorNickname)) problems.push('anchorNickname 为空');
  if (isEmpty(live.anchorAvatarUrl)) problems.push('anchorAvatarUrl 为空');
  if (String(live.roomName ?? '') !== room.roomName) problems.push(`roomName=${live.roomName}≠${room.roomName}`);
  if (String(live.tagType ?? '') !== room.tagType) problems.push(`tagType=${live.tagType}≠${room.tagType}`);
  if (String(live.tagName ?? '') !== room.tagName) problems.push(`tagName=${live.tagName}≠${room.tagName}`);
  if (live.living !== living) problems.push(`living=${live.living}≠${living}`);
  const real =
    `roomId=${num(live.roomId)} anchorId=${num(live.anchorId)} living=${live.living} ` +
    `roomName=${live.roomName} tagType=${live.tagType} tagName=${live.tagName}`;
  return {
    expect:
      `roomId=${room.roomId} anchorId=${expectAnchor} living=${living} roomName=${room.roomName} ` +
      `tagType=${room.tagType} tagName=${room.tagName}`,
    real,
    pass: problems.length === 0,
    message: problems.length === 0 ? undefined : `字段不符：${problems.join('；')}`,
  };
}

await new MomentLivePublish().execute();
