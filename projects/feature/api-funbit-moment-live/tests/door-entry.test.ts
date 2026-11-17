import { CheckBaseClass } from '../../../../src/base/CheckBaseClass.ts';
import { MomentLiveClient } from './lib/moment-live-client.ts';

/**
 * TK-0314 补充（同 PRD R2）：直播入口显示规则的 3/4 开播边界
 *
 * 说明：
 *  - 本任务测试目标是 R1（动态 live 类型）；R2「直播入口显示逻辑改造」不在任务测试范围内，
 *    但任务交付要求点名「3/4 个开播」边界，故补充本组只读用例（不修改任何配置/房间状态）。
 *  - 规则（TK-0310 REQUIREMENTS 3.2）：当前 locale 开播直播间数 >= 阈值（默认 4）→ 入口显示；
 *    < 4 → 不显示；doorplate 在显示时返回 voice_room/live，不显示时返回 live_room_broadcast3（NOT_OPEN_LIVE_ROOM）。
 *  - 期望值由「实时开播数 + 需求规则」推导，不依赖实现现状。
 *
 * 覆盖用例：API-LIVE-024 / 025
 * 运行：
 *   cd projects/feature/api-funbit-moment-live/tests
 *   node door-entry.test.ts
 */

const LOCALE_CANDIDATES = ['in', 'zh', 'th', 'en', 'ar', 'vi'];
const MIN_ROOMS = 4;

class DoorEntryBoundary extends CheckBaseClass {
  private readonly client = new MomentLiveClient();
  private counts: Record<string, number> = {};
  private highLocale: string | null = null;
  private lowLocale: string | null = null;

  constructor() {
    super();
    this.total = 3;
  }

  protected async run(): Promise<void> {
    const ready = await this.setup();
    if (!ready) return;

    await this.check(`【API-LIVE-024】P1 开播数≥${MIN_ROOMS}（locale=${this.highLocale}）：入口显示，doorplate 返回 voice_room/live`, async () => {
      const open = await this.client.doorOpen(this.highLocale!);
      const plate = await this.client.doorplate(this.highLocale!);
      const show = open.json?.data?.show;
      const action = plate.json?.data?.action?.data ?? {};
      const pass =
        open.httpStatus === 200 &&
        open.json?.status === '0' &&
        show === true &&
        plate.httpStatus === 200 &&
        plate.json?.status === '0' &&
        action.tab === 'voice_room' &&
        action.subtab === 'live';
      return {
        expect: `开播数=${this.counts[this.highLocale!]}≥${MIN_ROOMS}：openDoor.show=true，doorplate.action=voice_room/live`,
        real: `openDoor.show=${show}；doorplate.status=${plate.json?.status} action=${JSON.stringify(action)}`,
        pass,
        message: pass ? undefined : `入口显示规则不符：openDoor=${JSON.stringify(open.json)} doorplate=${JSON.stringify(plate.json)}`,
      };
    });

    await this.check(`【API-LIVE-025】P1 开播数<${MIN_ROOMS}（locale=${this.lowLocale}）：入口不显示，doorplate 返回 NOT_OPEN_LIVE_ROOM`, async () => {
      const open = await this.client.doorOpen(this.lowLocale!);
      const plate = await this.client.doorplate(this.lowLocale!);
      const show = open.json?.data?.show;
      const pass =
        open.httpStatus === 200 &&
        open.json?.status === '0' &&
        show === false &&
        plate.httpStatus === 200 &&
        plate.json?.status === '400002' &&
        plate.json?.state === 'NOT_OPEN_LIVE_ROOM';
      return {
        expect: `开播数=${this.counts[this.lowLocale!]}<${MIN_ROOMS}：openDoor.show=false，doorplate.status=400002/NOT_OPEN_LIVE_ROOM`,
        real: `openDoor.show=${show}；doorplate.status=${plate.json?.status} state=${plate.json?.state}`,
        pass,
        message: pass ? undefined : `入口显示规则不符：openDoor=${JSON.stringify(open.json)} doorplate=${JSON.stringify(plate.json)}`,
      };
    });

    await this.check('【API-LIVE-026】P2 入口判断与实时开播数一致：各 locale openDoor.show 与 localeRooms 数量匹配规则', async () => {
      const details: string[] = [];
      const mismatches: string[] = [];
      for (const locale of Object.keys(this.counts)) {
        const res = await this.client.doorOpen(locale);
        const show = res.json?.data?.show;
        const expected = this.counts[locale] >= MIN_ROOMS;
        details.push(`${locale}:${this.counts[locale]}→${show}`);
        if (show !== expected) mismatches.push(`${locale}(开播=${this.counts[locale]} 期望show=${expected} 实际=${show})`);
      }
      return {
        expect: Object.keys(this.counts).length + ' 个 locale 的 openDoor.show 均满足「开播数≥4 显示」',
        real: details.join(' '),
        pass: mismatches.length === 0,
        message: mismatches.length === 0 ? undefined : `不一致：${mismatches.join('；')}`,
      };
    });
  }

  private async setup(): Promise<boolean> {
    await this.act('前置：读取候选 locale 的在播房间数（只读）', async () => {
      for (const locale of LOCALE_CANDIDATES) {
        const rooms = await this.client.localeRooms(locale);
        this.counts[locale] = rooms.list.length;
        if (rooms.list.length >= MIN_ROOMS && !this.highLocale) this.highLocale = locale;
        if (rooms.list.length < MIN_ROOMS && rooms.list.length > 0 && !this.lowLocale) this.lowLocale = locale;
      }
      this.log(`各 locale 在播房间数：${JSON.stringify(this.counts)}`);
      this.log(`选中：≥${MIN_ROOMS} → ${this.highLocale ?? '无'}；<${MIN_ROOMS} 且 >0 → ${this.lowLocale ?? '无'}`);
      if (!this.highLocale) throw new Error(`无开播数≥${MIN_ROOMS} 的 locale，无法验证显示侧`);
      if (!this.lowLocale) throw new Error(`无 0<开播数<${MIN_ROOMS} 的 locale，无法验证 3/4 边界的不显示侧`);
    });
    return !!this.highLocale && !!this.lowLocale;
  }
}

await new DoorEntryBoundary().execute();
