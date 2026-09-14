import { type CheckResult } from '../../../../src/base/CheckBaseClass.ts';
import { TestBaseClass } from '../../../../src/base/TestBaseClass.ts';
import {
  albumKey,
  type AlbumGiftConfig,
  type AlbumPanelData,
  type AlbumRewardConfig,
} from '../../../../src/services/SpinDrawService.ts';

/**
 * 水果机图鉴冒烟检查（测试环境）
 * 用例来源：http://project.cinta.team/api/documents/31.md 《水果机图鉴冒烟测试用例》
 *
 * 流程：清数据 → 中级场初始态(panel.albumStar/albumPanel 为空) → 抽奖多次并收下 →
 * 图鉴 collectNum/nextStarNum/可领取状态校验 → 造数达标 → 领取礼包 → 开启礼包 → 落库确认。
 *
 * 运行：node album-smoke.test.ts [--user-id=40] [--room-id=10100001] [--draw-level=2]
 *        [--deal-type=diamond] [--draw-times=5] [--star=1]
 * 前置：config.json（测试 MySQL/Redis 直连，见 config.example.json）。
 * 说明：albumReceive 依赖真实抽取链路验证后，用 SQL 直补进度到目标星级（随机抽奖达标耗时不可控）。
 */

function arg(name: string, def: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
}

const USER_ID = Number(arg('user-id', '40')); // 默认测试用户 40（大区 in，图鉴池已配置）
const ROOM_ID = Number(arg('room-id', '10100001'));
const DRAW_LEVEL = Number(arg('draw-level', '2')); // 中级场=稀有场
const DEAL_TYPE = arg('deal-type', 'diamond');
const DRAW_TIMES = Number(arg('draw-times', '5'));
const STAR = Number(arg('star', '1')) as 1 | 2 | 3;

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** 池内项 star 档要求数量 */
function starNeed(item: AlbumGiftConfig, star: number): number {
  return star === 1 ? item.star1Num : star === 2 ? item.star2Num : item.star3Num;
}

/** 镜像 SpinDrawAlbumParser#isStarSatisfiable：池内每个有要求的项进度均达标 */
function starSatisfiable(pool: AlbumGiftConfig[], progress: Map<string, number>, star: number): boolean {
  let hasRequirement = false;
  for (const item of pool) {
    const need = starNeed(item, star);
    if (need <= 0) continue;
    hasRequirement = true;
    if ((progress.get(albumKey(item.awardType, item.awardId)) ?? 0) < need) return false;
  }
  return hasRequirement;
}

/** 镜像 SpinDrawAlbumParser 展示规则：currentStar（达到门槛才亮星）/ nextStarNum（超过当前星门槛才切下一档） */
function expectDisplay(collectNum: number, item: AlbumGiftConfig): { currentStar: number; nextStarNum: number } {
  const [s1, s2, s3] = [item.star1Num, item.star2Num, item.star3Num];
  if (collectNum <= s1) return { currentStar: collectNum >= s1 ? 1 : 0, nextStarNum: s1 };
  if (collectNum <= s2) return { currentStar: collectNum >= s2 ? 2 : 1, nextStarNum: s2 };
  if (collectNum <= s3) return { currentStar: collectNum >= s3 ? 3 : 2, nextStarNum: s3 };
  return { currentStar: 3, nextStarNum: s3 };
}

function progressMapOf(rows: Array<Record<string, unknown>>): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(albumKey(String(r['award_type']), String(r['award_id'])), toNum(r['collect_num']));
  }
  return m;
}

function mapToString(m: Map<string, number>): string {
  return JSON.stringify(Object.fromEntries([...m.entries()].sort()));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

class AlbumSmoke extends TestBaseClass {
  private locale = '';
  private phase = 1;
  private pool: AlbumGiftConfig[] = [];
  private rewards: AlbumRewardConfig[] = [];
  private packId = 0;
  private queueBaseline = 0;
  private batchNos: string[] = [];
  private progressBeforeReceive = new Map<string, number>();
  private receivedPackCount = 0;
  private openedGroupKey = '';

  constructor() {
    super();
    this.total = 13;
  }

  /** 图鉴池未配置时后续步骤全部 skip（step 1 已给出原因） */
  private requirePool(): void {
    if (this.pool.length === 0) this.skip('图鉴池未配置，见步骤 1');
  }

  private async actP(title: string, fn: () => unknown | Promise<unknown>): Promise<void> {
    await this.act(title, async () => {
      this.requirePool();
      await fn();
    });
  }

  private async checkP(title: string, fn: () => CheckResult | Promise<CheckResult>): Promise<void> {
    await this.check(title, async () => {
      this.requirePool();
      return fn();
    });
  }

  protected async run(): Promise<void> {
    await this.act('读取用户大区、期数与图鉴配置', async () => {
      const locale = await this.spindraw.queryUserLocale(USER_ID);
      if (!locale) throw new Error(`用户 ${USER_ID} 不存在或无大区配置`);
      this.locale = locale;
      this.pool = await this.spindraw.queryAlbumGiftConfig(locale, DRAW_LEVEL);
      if (this.pool.length === 0) {
        this.skip(`大区 ${locale} 场次 ${DRAW_LEVEL} 未配置图鉴礼物池（spin_draw_album_gift_config）`);
      }
      this.rewards = await this.spindraw.queryAlbumRewardConfig(locale, DRAW_LEVEL);
      const reward = this.rewards.find((r) => r.star === STAR);
      if (!reward) this.skip(`大区 ${locale} 场次 ${DRAW_LEVEL} 未配置 ${STAR} 星奖励`);
      this.packId = reward!.awardId;
      // 期数取自 config 接口（panel 必传 phase）
      const cfg = (await this.spindraw.request('litaroom/spin/draw/config', USER_ID)) as Record<string, unknown>;
      this.phase = toNum(cfg?.['phase']) || 1;
      this.log(`用户=${USER_ID} locale=${locale} phase=${this.phase} 池内项=${this.pool.length} 宝藏袋packId=${this.packId}`);
    });

    await this.actP('清空测试数据（MySQL 图鉴/宝藏袋 + Redis）', async () => {
      this.queueBaseline = await this.spindraw.giftAwardQueueBaseline(USER_ID);
      await this.spindraw.cleanAlbumData(USER_ID);
      await this.spindraw.cleanBlindPack(USER_ID, this.packId);
      await this.spindraw.cleanRedis(USER_ID);
    });

    await this.checkP('外层 panel 可领取星级 albumStar=0', async (): Promise<CheckResult> => {
      const panel = await this.spindraw.panel(USER_ID, DRAW_LEVEL, this.phase);
      return { expect: '0', real: String(panel['albumStar'] ?? 'null') };
    });

    await this.checkP('图鉴面板初始为空（进度/星星/可领取）', async (): Promise<CheckResult> => {
      const album = await this.spindraw.albumPanel(USER_ID, DRAW_LEVEL);
      if (!album) return { expect: '面板非空', real: 'null', pass: false, message: 'albumPanel 返回 null（池已配置不应为空）' };
      const bad: string[] = [];
      if (album.defaultStarTab !== 0) bad.push(`defaultStarTab=${album.defaultStarTab}`);
      if (album.giftList.length !== this.pool.length) bad.push(`giftList=${album.giftList.length}!=池配置${this.pool.length}`);
      for (const g of album.giftList) {
        if (g.collectNum !== 0 || g.currentStar !== 0) bad.push(`${g.awardType}:${g.awardId} collectNum=${g.collectNum} currentStar=${g.currentStar}`);
        const cfg = this.pool.find((p) => p.awardId === g.awardId && p.awardType === g.awardType);
        if (cfg && g.nextStarNum !== cfg.star1Num) bad.push(`${g.awardType}:${g.awardId} nextStarNum=${g.nextStarNum}!=star1Num=${cfg.star1Num}`);
      }
      for (const r of album.rewardList) {
        if (r.canReceive) bad.push(`${r.star}星 canReceive=true`);
      }
      return { expect: '全空/不可领取', real: bad.length === 0 ? '全空/不可领取' : bad.join('; '), pass: bad.length === 0 };
    });

    await this.actP(`中级场抽奖 ${DRAW_TIMES} 次并逐批收下（dealType=${DEAL_TYPE}）`, async () => {
      for (let i = 0; i < DRAW_TIMES; i++) {
        const draw = await this.spindraw.doDraw(USER_ID, { dealType: DEAL_TYPE, drawLevel: DRAW_LEVEL, drawNum: 1, roomId: ROOM_ID });
        if (!draw.batchNo) throw new Error(`第 ${i + 1} 次抽奖未返回 batchNo`);
        await this.spindraw.confirmReceive(USER_ID, draw.batchNo);
        this.batchNos.push(draw.batchNo);
        const hits = draw.shouAwardList
          .filter((a) => this.pool.some((p) => p.awardId === a.awardId && p.awardType === a.awardType))
          .map((a) => `${a.awardType}:${a.awardId}x${a.awardNum}`);
        this.log(`第 ${i + 1} 抽 batchNo=${draw.batchNo} 池内命中: ${hits.length > 0 ? hits.join(',') : '无'}`);
      }
    });

    await this.checkP('图鉴进度 = 抽奖明细汇总 = 面板 collectNum', async (): Promise<CheckResult> => {
      // 实际到手明细（spin_draw_record_detail）按池内项聚合
      const detail = await this.spindraw.queryDrawDetailSummary(USER_ID, this.batchNos);
      const expectMap = new Map<string, number>();
      for (const item of this.pool) {
        const key = albumKey(item.awardType, item.awardId);
        expectMap.set(key, detail.get(key) ?? 0);
      }
      // DB 进度
      const dbMap = progressMapOf(await this.spindraw.queryAlbumProgress(USER_ID, DRAW_LEVEL));
      for (const item of this.pool) {
        const key = albumKey(item.awardType, item.awardId);
        if (!dbMap.has(key)) dbMap.set(key, 0);
      }
      // 面板进度
      const album = await this.albumPanelOrThrow();
      const panelMap = new Map<string, number>();
      for (const item of this.pool) {
        const key = albumKey(item.awardType, item.awardId);
        const g = album.giftList.find((x) => x.awardId === item.awardId && x.awardType === item.awardType);
        panelMap.set(key, g?.collectNum ?? -1);
      }
      const expect = mapToString(expectMap);
      const pass = mapToString(dbMap) === expect && mapToString(panelMap) === expect;
      return {
        expect,
        real: `db=${mapToString(dbMap)} panel=${mapToString(panelMap)}`,
        pass,
        message: pass ? '' : '三方进度不一致（明细/DB/面板）',
      };
    });

    await this.checkP('面板星星/下一档数字展示规则正确', async (): Promise<CheckResult> => {
      const album = await this.albumPanelOrThrow();
      const bad: string[] = [];
      for (const item of this.pool) {
        const g = album.giftList.find((x) => x.awardId === item.awardId && x.awardType === item.awardType);
        if (!g) {
          bad.push(`缺池内项 ${item.awardType}:${item.awardId}`);
          continue;
        }
        const exp = expectDisplay(g.collectNum, item);
        if (g.currentStar !== exp.currentStar || g.nextStarNum !== exp.nextStarNum) {
          bad.push(`${item.awardType}:${item.awardId} 实际(${g.currentStar}星,/${g.nextStarNum}) 期望(${exp.currentStar}星,/${exp.nextStarNum})`);
        }
      }
      return { expect: '全部符合展示规则', real: bad.length === 0 ? '全部符合' : bad.join('; '), pass: bad.length === 0 };
    });

    await this.actP(`造数：池内各项进度直补到 ${STAR} 星要求`, async () => {
      const collectDate = await this.spindraw.currentCollectDate(USER_ID, DRAW_LEVEL);
      await this.spindraw.seedProgressToStar(USER_ID, this.locale, DRAW_LEVEL, this.pool, STAR, collectDate);
      this.progressBeforeReceive = progressMapOf(await this.spindraw.queryAlbumProgress(USER_ID, DRAW_LEVEL));
      this.log(`collectDate=${collectDate} 造数后进度: ${mapToString(this.progressBeforeReceive)}`);
    });

    await this.checkP(`礼包可领取状态：panel.albumStar=${STAR} 且 ${STAR} 星 canReceive`, async (): Promise<CheckResult> => {
      const panel = await this.spindraw.panel(USER_ID, DRAW_LEVEL, this.phase);
      const album = await this.albumPanelOrThrow();
      // 以 DB 进度本地推算期望（最高可满足星级），与服务端口径一致
      const dbMap = progressMapOf(await this.spindraw.queryAlbumProgress(USER_ID, DRAW_LEVEL));
      let expectStar = 0;
      for (let s = 3; s >= 1; s--) {
        if (starSatisfiable(this.pool, dbMap, s)) {
          expectStar = s;
          break;
        }
      }
      const reward = album.rewardList.find((r) => r.star === expectStar);
      const bad: string[] = [];
      if (toNum(panel['albumStar']) !== expectStar) bad.push(`albumStar=${panel['albumStar']}!=${expectStar}`);
      if (album.defaultStarTab !== expectStar) bad.push(`defaultStarTab=${album.defaultStarTab}!=${expectStar}`);
      if (expectStar > 0 && reward?.canReceive !== true) bad.push(`${expectStar}星 canReceive=${reward?.canReceive}`);
      return { expect: `albumStar=${expectStar} 可领取`, real: bad.length === 0 ? '符合' : bad.join('; '), pass: bad.length === 0 };
    });

    await this.actP(`调用图鉴领取接口领取 ${STAR} 星礼包`, async () => {
      const reward = this.rewards.find((r) => r.star === STAR)!;
      const resp = await this.spindraw.albumReceive(USER_ID, { drawLevel: DRAW_LEVEL, star: STAR, roomId: ROOM_ID });
      this.receivedPackCount = resp.awardNum;
      if (resp.awardId !== reward.awardId || resp.awardType !== reward.awardType) {
        throw new Error(`领取返回奖励不符: 实际 ${resp.awardType}:${resp.awardId}x${resp.awardNum}，期望 ${reward.awardType}:${reward.awardId}`);
      }
      this.log(`领取成功: ${resp.awardType}:${resp.awardId}(${resp.awardName})x${resp.awardNum}`);
    });

    await this.checkP('领取落库：领取记录 + 进度扣减 + 发奖队列', async (): Promise<CheckResult> => {
      const bad: string[] = [];
      // 领取记录
      const records = await this.spindraw.queryAlbumReceiveRecords(USER_ID, DRAW_LEVEL);
      const hit = records.find((r) => toNum(r['star']) === STAR && toNum(r['award_id']) === this.packId);
      if (!hit) bad.push('spin_draw_album_receive_record 无对应记录');
      // 进度扣减：池内每个有要求的项 collect_num 减少 star 档要求
      const afterMap = progressMapOf(await this.spindraw.queryAlbumProgress(USER_ID, DRAW_LEVEL));
      for (const item of this.pool) {
        const need = starNeed(item, STAR);
        if (need <= 0) continue;
        const key = albumKey(item.awardType, item.awardId);
        const before = this.progressBeforeReceive.get(key) ?? 0;
        const after = afterMap.get(key) ?? 0;
        if (after !== before - need) bad.push(`${key} 进度 ${before}→${after}，应扣 ${need}`);
      }
      // 发奖队列（gift_award_queue 同步写入，worker 异步发放）
      const queue = await this.spindraw.queryGiftAwardQueueNew(USER_ID, this.queueBaseline);
      const q = queue.find((r) => String(r['award_type']) === 'BLINDPACK' && toNum(r['award_id']) === this.packId);
      if (!q) bad.push('gift_award_queue 无新增 BLINDPACK 发放单');
      return { expect: '记录/扣减/发放单齐全', real: bad.length === 0 ? '齐全' : bad.join('; '), pass: bad.length === 0 };
    });

    await this.actP('等待宝藏袋入账并调用开启礼包接口', async () => {
      // gift_award_queue → worker → user_blind_pack 为异步链路，轮询等待
      const deadline = Date.now() + 60_000;
      let packs: Array<Record<string, unknown>> = [];
      while (Date.now() < deadline) {
        packs = await this.spindraw.queryUserBlindPacks(USER_ID, this.packId);
        if (packs.some((p) => toNum(p['pack_count']) > 0)) break;
        await sleep(2_000);
      }
      const pack = packs.find((p) => toNum(p['pack_count']) > 0);
      if (!pack) throw new Error('60s 内宝藏袋未入账 user_blind_pack（gift_award_queue 发放链路异常）');
      this.openedGroupKey = String(pack['group_key']);
      this.log(`宝藏袋入账 groupKey=${this.openedGroupKey} packCount=${pack['pack_count']}`);
      await this.spindraw.openBlindPack(USER_ID, this.openedGroupKey, 1);
    });

    await this.checkP('开启落库：开袋记录生成且背包数量扣减', async (): Promise<CheckResult> => {
      // user_blind_pack_award 由开袋写入（worker 再拷贝到 gift_award_queue）
      const deadline = Date.now() + 30_000;
      let awards: Array<Record<string, unknown>> = [];
      while (Date.now() < deadline) {
        awards = await this.spindraw.queryUserBlindPackAwards(USER_ID, this.packId);
        if (awards.length > 0) break;
        await sleep(2_000);
      }
      const bad: string[] = [];
      if (awards.length === 0) bad.push('user_blind_pack_award 无开袋记录');
      const packs = await this.spindraw.queryUserBlindPacks(USER_ID, this.packId);
      const cur = packs.find((p) => String(p['group_key']) === this.openedGroupKey);
      // 开 1 个后：数量为 receivedPackCount-1，归零时行可能被删除
      const remain = cur ? toNum(cur['pack_count']) : 0;
      if (remain !== this.receivedPackCount - 1) {
        bad.push(`背包剩余 ${remain}，期望 ${this.receivedPackCount - 1}`);
      }
      return { expect: '开袋记录存在且数量扣减', real: bad.length === 0 ? `开袋记录 ${awards.length} 条，剩余 ${remain}` : bad.join('; '), pass: bad.length === 0 };
    });
  }

  private async albumPanelOrThrow(): Promise<AlbumPanelData> {
    const album = await this.spindraw.albumPanel(USER_ID, DRAW_LEVEL);
    if (!album) throw new Error('albumPanel 返回 null（图鉴池未配置或大区不符）');
    return album;
  }
}

await new AlbumSmoke().execute();
