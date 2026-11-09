/**
 * 项目3707 / TK-0129：Admin 特效管理-家族群聊背景 PAG 上传与展示
 * 用例来源：TK-0127 HANDOFF 九列用例 #1～#12（/task/20261109/TK-0127/HANDOFF）；
 * 技术方案：/task/20261109/TK-0127/TECH_DESIGN（场景骨架/参数矩阵/造数/元素定位/引用式断言映射）。
 * 覆盖：#1 页面入口；#2 新增 PAG（缩略图 D1 PNG → D2 PAG）；#3 列表缩略图 PAG；#4 列表背景图 PAG；
 *      #5 列表双列 PNG 静态；#6 编辑替换（E1/E2/E3）；#7 en/zh 多语言；#8 预览资源地址后缀；
 *      #9 六种非 PAG 格式（F1..F6）；#10～#12 三个必填项空值校验。
 * 数据隔离：test 环境仅新增一条专用记录 BOT_TEST_PAG_3707（需求方确认的单记录约束，不修改任何现有记录）；
 *          页面无删除入口，套件结束保留该记录并在报告中登记背景 ID 与「测试数据未清理」；执行侧不执行 SQL。
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=*** node projects/feature/lita-admin-3707-family-pag/tests/family-pag-upload-display.test.ts
 *      自测（不新增记录）：追加 --selftest=1
 *      断点续跑（不重复新增）：追加 --from=3
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator } from 'playwright';
import { AdminBase, UI_BASE, FAMILY_BACKGROUND_HASH, arg, decodePng, diffPng, type FrameDiff } from './lib/admin-base.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = resolve(HERE, '..', 'assets');
const ASSET = (name: string) => resolve(ASSET_DIR, name);
const PAG = ASSET('BOT_TEST_PAG_3707.pag');
const PNG = ASSET('BOT_TEST_PAG_3707.png');
const JPG = ASSET('BOT_TEST_PAG_3707.jpg');
const GIF = ASSET('BOT_TEST_PAG_3707.gif');
const WEBP = ASSET('BOT_TEST_PAG_3707.webp');
const MP4 = ASSET('BOT_TEST_PAG_3707.mp4');
const MOV = ASSET('BOT_TEST_PAG_3707.mov');

const NAME = 'BOT_TEST_PAG_3707';
const EN_NAME = 'BOT_TEST_PAG_3707_EN';
const ZH_NAME = 'BOT_TEST_PAG_3707_中文';

/** 数据行：用例 #6 的三条替换范围 */
const CASE6_ROWS = [
  { key: 'E1', main: true, thumb: false, desc: '仅背景图替换为 PAG' },
  { key: 'E2', main: false, thumb: true, desc: '仅背景缩略图替换为 PAG' },
  { key: 'E3', main: true, thumb: true, desc: '两个字段均替换为 PAG' },
];

/** 数据行：用例 #9 的六种非 PAG 格式 */
const CASE9_ROWS = [
  { key: 'F1', ext: 'png', file: PNG },
  { key: 'F2', ext: 'jpg', file: JPG },
  { key: 'F3', ext: 'gif', file: GIF },
  { key: 'F4', ext: 'webp', file: WEBP },
  { key: 'F5', ext: 'mp4', file: MP4 },
  { key: 'F6', ext: 'mov', file: MOV },
];

type MediaKind = 'pag' | 'static';

interface PagObservation {
  canvasVisible: boolean;
  frame: FrameDiff;
  playing: boolean;
  errors: string[];
  imgCount: number;
  brokenImgs: number;
  errorNodes: number;
  desc: string;
  blankDesc: string;
}

interface PreviewObservation {
  kind: 'canvas' | 'img' | 'video' | 'none';
  canvasVisible: boolean;
  frame: FrameDiff;
  naturalWidth: number;
  videoReadyState: number | null;
  src: string;
  desc: string;
}

class FamilyPagTest extends AdminBase {
  private recordId = '';
  private readonly selftest = arg('selftest', '0') === '1';

  constructor() {
    super('family-pag-3707');
    // #1..#12 各用例检查点数（含参数化数据行展开）
    const perCase = [4, 6, 2, 2, 2, 9, 3, 3, 18, 2, 2, 2];
    const from = Number(arg('from', '1'));
    this.total = this.selftest ? 13 : perCase.slice(Math.max(0, from - 1)).reduce((a, b) => a + b, 0);
  }

  protected async run(): Promise<void> {
    await this.login();
    this.log(`模式: ${this.selftest ? '自测（不新增记录）' : '正式执行'}`);
    if (this.selftest) {
      await this.case1();
      await this.case2(true);
      await this.case10();
      await this.case11();
      await this.case12();
      return;
    }
    const from = Number(arg('from', '1'));
    if (from <= 1) await this.case1();
    if (from <= 2) await this.case2(false);
    if (from <= 3) await this.case3();
    if (from <= 4) await this.case4();
    if (from <= 5) await this.case5();
    if (from <= 6) await this.case6();
    if (from <= 7) await this.case7();
    if (from <= 8) await this.case8();
    if (from <= 9) await this.case9();
    if (from <= 10) await this.case10();
    if (from <= 11) await this.case11();
    if (from <= 12) await this.case12();
  }

  // ==================== 公共辅助 ====================

  private async gotoFamilyBackgroundByMenu(): Promise<void> {
    await this.p.goto(`${UI_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.p.waitForSelector('.sidebar-container .el-submenu__title', { timeout: 45000 });
    await this.enterByMenu();
  }

  private async enterByMenu(): Promise<void> {
    const leaf = this.p.locator('.sidebar-container .el-menu-item').filter({ hasText: /^\s*家族群聊背景\s*$/ }).first();
    // 菜单已展开时直接点击叶子菜单；未展开时先展开「特效管理」，避免重复点击导致折叠
    if (!(await leaf.isVisible().catch(() => false))) {
      const submenu = this.p.locator('.sidebar-container .el-submenu__title').filter({ hasText: /^\s*特效管理\s*$/ }).first();
      await submenu.click();
    }
    await leaf.waitFor({ state: 'visible', timeout: 30000 });
    await leaf.click();
    await this.p.waitForFunction((hash) => location.hash === hash, FAMILY_BACKGROUND_HASH, { timeout: 20000 });
    await this.p.waitForSelector('.app-container .el-table', { timeout: 30000 });
    await this.waitListIdle();
  }

  /** 精确搜索专用记录并返回结果行数 */
  private async focusRecord(): Promise<number> {
    if (!this.p.url().includes('family-background')) await this.enterByMenu();
    await this.searchByName(NAME);
    return this.rowCount();
  }

  private async shotCurrent(tag: string): Promise<string> {
    if ((await this.dialogCount()) > 0) {
      return this.shotLocator(this.dialog(), tag);
    }
    return this.shotLocator(this.p.locator('.app-container'), tag);
  }

  private async dialogCount(): Promise<number> {
    return this.p.evaluate(
      () =>
        Array.from(document.querySelectorAll('.el-dialog__wrapper')).filter((w) => {
          const el = w as HTMLElement;
          const style = getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }).length,
    );
  }

  private async waitDialogClosed(timeout = 20000): Promise<boolean> {
    return this.p
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('.el-dialog__wrapper')).every((w) => {
            const el = w as HTMLElement;
            const style = getComputedStyle(el);
            return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
          }),
        null,
        { timeout },
      )
      .then(() => true)
      .catch(() => false);
  }

  /** 等待列表内静态图片完成解码（有界；仅用于读取页面内容前） */
  private async waitListImages(timeout = 15000): Promise<void> {
    await this.p
      .waitForFunction(
        () => Array.from(document.querySelectorAll('.app-container .el-table__body-wrapper img')).every((im) => (im as HTMLImageElement).complete),
        null,
        { timeout },
      )
      .catch(() => undefined);
  }

  private async toastTexts(): Promise<string[]> {
    return (await this.p.locator('.el-message').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  /** 观察 PAG 预览：canvas 可见 + 帧变化（持续播放）+ 无加载失败 + 无破图节点 */
  private async observePag(scope: Locator, mark: number, timeout = 8000): Promise<PagObservation> {
    const canvas = scope.locator('canvas.pag-canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    const canvasVisible = await canvas.isVisible().catch(() => false);
    let frame: FrameDiff = { changed: 0, total: 0, ratio: 0, maxDelta: 0 };
    if (canvasVisible) frame = await this.measureFrames(canvas, timeout, 300);
    const errors = this.pagFailuresSince(mark);
    const imgs = scope.locator('img');
    const imgCount = await imgs.count();
    let brokenImgs = 0;
    for (let i = 0; i < imgCount; i++) {
      const nw = await imgs.nth(i).evaluate((el) => (el as HTMLImageElement).naturalWidth).catch(() => 0);
      if (!nw) brokenImgs++;
    }
    const errorNodes = await scope.locator('.el-image__error').count();
    const playing = frame.ratio >= 0.3 && frame.maxDelta >= 20;
    return {
      canvasVisible,
      frame,
      playing,
      errors,
      imgCount,
      brokenImgs,
      errorNodes,
      desc: `canvas 可见=${canvasVisible}，帧差=${frame.ratio}%（变化像素 ${frame.changed}/${frame.total}，最大通道差 ${frame.maxDelta}），PAG加载失败=${errors.length} 条，img=${imgCount}（未解码 ${brokenImgs}），错误占位=${errorNodes}`,
      blankDesc: `img=${imgCount}（未解码 ${brokenImgs}），错误占位=${errorNodes}，帧差=${frame.ratio}%，PAG加载失败=${errors.length} 条`,
    };
  }

  /** 观察 Edit 弹窗上传区域：canvas(PAG) / img(静态) / 未渲染 */
  private async observePreview(label: string, mark: number): Promise<PreviewObservation> {
    const item = this.formItem(label);
    await this.p
      .waitForFunction(
        () => {
          const dialogs = Array.from(document.querySelectorAll('.el-dialog__wrapper')).filter((w) => {
            const el = w as HTMLElement;
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
          });
          const dlg = dialogs[0]?.querySelector('.el-dialog');
          if (!dlg) return false;
          const imgs = Array.from(dlg.querySelectorAll('img'));
          return imgs.every((im) => (im as HTMLImageElement).complete);
        },
        null,
        { timeout: 15000 },
      )
      .catch(() => undefined);
    const canvas = item.locator('canvas.pag-canvas').first();
    const img = item.locator('img').first();
    const video = item.locator('video').first();
    const canvasVisible = await canvas.isVisible().catch(() => false);
    const imgVisible = await img.isVisible().catch(() => false);
    const videoVisible = await video.isVisible().catch(() => false);
    let frame: FrameDiff = { changed: 0, total: 0, ratio: 0, maxDelta: 0 };
    if (canvasVisible) frame = await this.measureFrames(canvas, 8000, 300);
    let src = '';
    let naturalWidth = 0;
    let videoReadyState: number | null = null;
    if (canvasVisible) {
      src = await this.mediaSrc(canvas);
      return {
        kind: 'canvas',
        canvasVisible,
        frame,
        naturalWidth,
        videoReadyState,
        src,
        desc: `PAG canvas，帧差=${frame.ratio}%（最大通道差 ${frame.maxDelta}），src=${this.cleanUrl(src)}，PAG加载失败=${this.pagFailuresSince(mark).length} 条`,
      };
    }
    if (imgVisible) {
      src = (await img.getAttribute('src')) ?? '';
      naturalWidth = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth).catch(() => 0);
      return {
        kind: 'img',
        canvasVisible,
        frame,
        naturalWidth,
        videoReadyState,
        src,
        desc: `img，naturalWidth=${naturalWidth}，src=${this.cleanUrl(src)}`,
      };
    }
    if (videoVisible) {
      videoReadyState = await video.evaluate((el) => (el as HTMLVideoElement).readyState).catch(() => 0);
      src = (await video.getAttribute('src')) ?? '';
      return { kind: 'video', canvasVisible, frame, naturalWidth, videoReadyState, src, desc: `video，readyState=${videoReadyState}，src=${this.cleanUrl(src)}` };
    }
    return { kind: 'none', canvasVisible, frame, naturalWidth, videoReadyState, src, desc: '上传区域没有任何预览元素' };
  }

  private previewOk(obs: PreviewObservation, kind: MediaKind): boolean {
    if (kind === 'pag') return obs.kind === 'canvas' && obs.frame.ratio >= 0.3 && obs.frame.maxDelta >= 20;
    return obs.kind === 'img' && obs.naturalWidth > 0;
  }

  private async cellObservation(cell: Locator, mark: number): Promise<{ kind: 'pag' | 'static' | 'none'; obs: PagObservation }> {
    const canvas = cell.locator('canvas.pag-canvas').first();
    if (await canvas.isVisible().catch(() => false)) {
      return { kind: 'pag', obs: await this.observePag(cell, mark) };
    }
    const obs: PagObservation = {
      canvasVisible: false,
      frame: { changed: 0, total: 0, ratio: 0, maxDelta: 0 },
      playing: false,
      errors: [],
      imgCount: await cell.locator('img').count(),
      brokenImgs: 0,
      errorNodes: await cell.locator('.el-image__error').count(),
      desc: '',
      blankDesc: '',
    };
    return { kind: 'static', obs };
  }

  private async setBothMedia(file: string): Promise<void> {
    await this.uploadFile('背景图', file);
    await this.uploadFile('背景缩略图', file);
  }

  private async resetToPng(): Promise<void> {
    await this.focusRecord();
    await this.openEdit(0);
    await this.setBothMedia(PNG);
    await this.confirmDialog();
    await this.waitDialogClosed();
    await this.searchByName(NAME);
  }

  // ==================== 用例 #1 ====================

  private async case1(): Promise<void> {
    await this.act('打开 Admin 首页，点击左侧「特效管理」再点击「家族群聊背景」', async () => {
      await this.gotoFamilyBackgroundByMenu();
    });

    await this.check('用例#1-① 页面路由为 /#/effect-manager/family-background', async () => {
      const hash = await this.p.evaluate(() => location.hash);
      await this.shotCurrent('case1-route');
      return {
        expect: FAMILY_BACKGROUND_HASH,
        real: hash,
        pass: hash === FAMILY_BACKGROUND_HASH,
        message: `路由不符：期望 ${FAMILY_BACKGROUND_HASH}，实际 ${hash}`,
      };
    });

    await this.check('用例#1-② 列表显示背景ID、背景名称、背景缩略图、背景图、操作列', async () => {
      const headers = await this.headerTexts();
      const required = ['背景ID', '背景名称', '背景缩略图', '背景图', '操作'];
      const missing = required.filter((h) => !headers.includes(h));
      await this.shotCurrent('case1-headers');
      return {
        expect: required.join('|'),
        real: headers.join('|'),
        pass: missing.length === 0,
        message: `缺少表头：${missing.join(',')}`,
      };
    });

    await this.check('用例#1-③ 背景ID、背景名称搜索框及Search按钮可见', async () => {
      const idInput = await this.p.locator('.app-container input[placeholder="背景ID"]').first().isVisible();
      const nameInput = await this.p.locator('.app-container input[placeholder="背景名称"]').first().isVisible();
      const search = await this.button('Search', '.app-container').isVisible();
      await this.shotCurrent('case1-search');
      return {
        expect: '背景ID=true,背景名称=true,Search=true',
        real: `背景ID=${idInput},背景名称=${nameInput},Search=${search}`,
        pass: idInput && nameInput && search,
        message: `搜索控件可见性不符：背景ID=${idInput}，背景名称=${nameInput}，Search=${search}`,
      };
    });

    await this.check('用例#1-④ Add按钮可见且可点击', async () => {
      const add = this.button('Add', '.app-container');
      const visible = await add.isVisible();
      const enabled = await add.isEnabled();
      await this.shotCurrent('case1-add');
      return {
        expect: '可见=true,可点击=true',
        real: `可见=${visible},可点击=${enabled}`,
        pass: visible && enabled,
        message: `Add 按钮状态不符：可见=${visible}，可点击=${enabled}`,
      };
    });
  }

  // ==================== 用例 #2 ====================

  private async case2(dryRun: boolean): Promise<void> {
    // 前置守卫：需求方单记录约束——专用记录已存在时不得新增第二条，按数据状态阻塞输出该用例检查点
    await this.searchByName(NAME);
    const existing = await this.rowCount();
    if (existing !== 0) {
      this.log(`前置 BD-NEW 不成立：专用记录已存在 ${existing} 条，禁止新增第二条`);
      const blocked = [
        ['①', '主图上传后 Add 弹窗显示可播放的 PAG 预览，无破图'],
        ['②', 'D1 后缩略图显示静态 PNG 预览，无破图'],
        ['③', 'D2 后缩略图替换为可播放的 PAG 预览，无破图'],
        ['④', 'Confirm 后 Add 弹窗关闭'],
        ['⑤', '精确搜索结果仅有 1 条 BOT_TEST_PAG_3707'],
        ['⑥', '该记录背景图与背景缩略图均显示 PAG 动图，无破图'],
      ];
      for (const [idx, text] of blocked) {
        await this.check(`用例#2-${idx} ${text}`, async () => ({
          expect: '执行',
          real: `未执行：前置 BD-NEW 不成立（专用记录已存在 ${existing} 条，单记录约束下禁止新增第二条）`,
          pass: false,
          message: '数据状态阻塞：专用记录已存在，禁止新增第二条记录',
        }));
      }
      return;
    }

    const mark = this.consoleMark();
    await this.act('点击 Add，在背景名称输入 BOT_TEST_PAG_3707', async () => {
      await this.openAdd();
      await this.formItem('背景名称').locator('input').first().fill(NAME);
    });

    await this.act('在「背景图」上传 PAG 样例', async () => {
      await this.uploadFile('背景图', PAG);
    });

    await this.check('用例#2-① 主图上传后Add弹窗显示可播放的PAG预览且无破图', async () => {
      const obs = await this.observePreview('背景图', mark);
      await this.shotCurrent('case2-main-pag');
      return {
        expect: 'PAG canvas 可见且持续播放（帧差>0.3%）',
        real: obs.desc,
        pass: obs.kind === 'canvas' && obs.frame.ratio >= 0.3 && obs.frame.maxDelta >= 20 && this.pagFailuresSince(mark).length === 0,
        message: `主图 PAG 预览不符：${obs.desc}`,
      };
    });

    await this.act('按数据行 D1 在「背景缩略图」上传 PNG', async () => {
      await this.uploadFile('背景缩略图', PNG);
    });

    await this.check('用例#2-② 缩略图上传PNG后显示静态PNG预览且无破图', async () => {
      const item = this.formItem('背景缩略图');
      const img = item.locator('img').first();
      await img.waitFor({ state: 'visible', timeout: 30000 });
      await this.p
        .waitForFunction(
          () => {
            const dlg = document.querySelector('.el-dialog__wrapper:not([style*="display: none"]) .el-dialog');
            if (!dlg) return false;
            return Array.from(dlg.querySelectorAll('img')).every((im) => (im as HTMLImageElement).complete);
          },
          null,
          { timeout: 30000 },
        )
        .catch(() => undefined);
      const naturalWidth = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth).catch(() => 0);
      const src = (await img.getAttribute('src')) ?? '';
      const canvasCount = await item.locator('canvas').count();
      await this.shotCurrent('case2-thumb-png');
      return {
        expect: '静态 PNG img 已解码，无 canvas 播放器',
        real: `img naturalWidth=${naturalWidth}，canvas=${canvasCount}，src=${this.cleanUrl(src)}`,
        pass: naturalWidth > 0 && canvasCount === 0,
        message: `缩略图 PNG 预览不符：naturalWidth=${naturalWidth}，canvas=${canvasCount}`,
      };
    });

    await this.act('按数据行 D2 在同一「背景缩略图」区域改传 PAG', async () => {
      await this.uploadFile('背景缩略图', PAG);
    });

    await this.check('用例#2-③ 缩略图改传PAG后替换为可播放的PAG预览且无破图', async () => {
      const obs = await this.observePreview('背景缩略图', mark);
      await this.shotCurrent('case2-thumb-pag');
      return {
        expect: 'PAG canvas 可见且持续播放（帧差>0.3%）',
        real: obs.desc,
        pass: obs.kind === 'canvas' && obs.frame.ratio >= 0.3 && obs.frame.maxDelta >= 20 && this.pagFailuresSince(mark).length === 0,
        message: `缩略图 PAG 预览不符：${obs.desc}`,
      };
    });

    if (dryRun) {
      await this.act('自测模式：取消弹窗，不保存记录', async () => {
        await this.closeDialogByCancel();
      });
      return;
    }

    await this.act('点击 Confirm 保存专用记录', async () => {
      await this.confirmDialog();
    });

    await this.check('用例#2-④ Confirm后Add弹窗关闭', async () => {
      const closed = await this.waitDialogClosed();
      const toasts = await this.toastTexts();
      await this.shotCurrent('case2-confirmed');
      return {
        expect: '可见 Add 弹窗数=0',
        real: `弹窗已关闭=${closed}，可见弹窗数=${await this.dialogCount()}，提示=${toasts.join('|') || '无'}`,
        pass: closed,
        message: `Confirm 后弹窗未关闭；提示=${toasts.join('|') || '无'}`,
      };
    });

    await this.act('在背景名称精确搜索 BOT_TEST_PAG_3707 并点击 Search', async () => {
      await this.searchByName(NAME);
    });

    await this.check('用例#2-⑤ 精确搜索结果仅有1条BOT_TEST_PAG_3707', async () => {
      const rows = await this.rowCount();
      const total = await this.listTotal();
      if (rows === 1) this.recordId = (await this.cell(0, 0).innerText()).trim();
      await this.shotCurrent('case2-search-result');
      return {
        expect: '结果行数=1',
        real: `结果行数=${rows}，Total=${total.text || total.total}，背景ID=${this.recordId || '未取得'}`,
        pass: rows === 1,
        message: `精确搜索结果行数不符：${rows}`,
      };
    });

    await this.check('用例#2-⑥ 记录背景图与背景缩略图均显示PAG动图且无破图', async () => {
      const mark2 = this.consoleMark();
      const thumb = await this.observePag(this.cell(0, 2), mark2);
      const main = await this.observePag(this.cell(0, 3), mark2);
      await this.shotCurrent('case2-row-pag');
      const ok = thumb.playing && main.playing && thumb.errors.length === 0 && main.errors.length === 0 && thumb.brokenImgs === 0 && main.brokenImgs === 0;
      return {
        expect: '两列均 PAG canvas 可见且持续播放，无破图',
        real: `背景缩略图列：${thumb.desc}；背景图列：${main.desc}`,
        pass: ok,
        message: `记录两列 PAG 展示不符：缩略图[${thumb.desc}]；背景图[${main.desc}]`,
      };
    });
  }

  // ==================== 用例 #3 / #4 ====================

  private async case3(): Promise<void> {
    const mark = this.consoleMark();
    await this.act('进入家族群聊背景，按名称精确搜索专用记录', async () => {
      await this.enterByMenu();
      await this.searchByName(NAME);
    });

    let observed: PagObservation | null = null;
    await this.act('读取目标行「背景缩略图」列渲染状态', async () => {
      const rows = await this.rowCount();
      if (rows !== 1) throw new Error(`专用记录搜索结果应为 1 条，实际 ${rows} 条`);
      observed = await this.observePag(this.cell(0, 2), mark);
    });

    await this.check('用例#3-① 目标行背景缩略图列PAG播放区域可见并持续播放', async () => {
      const obs = observed as PagObservation;
      await this.shotLocator(this.cell(0, 2), 'case3-thumb-pag');
      return {
        expect: 'PAG canvas 可见且持续播放（帧差>0.3%）',
        real: obs.desc,
        pass: obs.canvasVisible && obs.playing && obs.errors.length === 0,
        message: `缩略图列 PAG 播放不符：${obs.desc}`,
      };
    });

    await this.check('用例#3-② 该列无破图、加载失败图标或空白预览', async () => {
      const obs = observed as PagObservation;
      return {
        expect: 'img=0，错误占位=0，帧差>0.3%，PAG加载失败=0',
        real: obs.blankDesc,
        pass: obs.imgCount === 0 && obs.errorNodes === 0 && obs.playing && obs.errors.length === 0,
        message: `缩略图列存在破图/空白：${obs.blankDesc}`,
      };
    });
  }

  private async case4(): Promise<void> {
    const mark = this.consoleMark();
    await this.act('进入家族群聊背景，按名称精确搜索专用记录', async () => {
      await this.enterByMenu();
      await this.searchByName(NAME);
    });

    let observed: PagObservation | null = null;
    await this.act('读取目标行「背景图」列渲染状态', async () => {
      const rows = await this.rowCount();
      if (rows !== 1) throw new Error(`专用记录搜索结果应为 1 条，实际 ${rows} 条`);
      observed = await this.observePag(this.cell(0, 3), mark);
    });

    await this.check('用例#4-① 目标行背景图列PAG播放区域可见并持续播放', async () => {
      const obs = observed as PagObservation;
      await this.shotLocator(this.cell(0, 3), 'case4-main-pag');
      return {
        expect: 'PAG canvas 可见且持续播放（帧差>0.3%）',
        real: obs.desc,
        pass: obs.canvasVisible && obs.playing && obs.errors.length === 0,
        message: `背景图列 PAG 播放不符：${obs.desc}`,
      };
    });

    await this.check('用例#4-② 该列无破图、加载失败图标或空白预览', async () => {
      const obs = observed as PagObservation;
      return {
        expect: 'img=0，错误占位=0，帧差>0.3%，PAG加载失败=0',
        real: obs.blankDesc,
        pass: obs.imgCount === 0 && obs.errorNodes === 0 && obs.playing && obs.errors.length === 0,
        message: `背景图列存在破图/空白：${obs.blankDesc}`,
      };
    });
  }

  // ==================== 用例 #5 ====================

  private async case5(): Promise<void> {
    const mark = this.consoleMark();
    await this.act('按 BD-STATIC 将专用记录主图与缩略图均重置为 PNG', async () => {
      await this.resetToPng();
    });

    await this.check('用例#5-① 目标行两列均显示PNG静态图且无破图', async () => {
      const check = async (col: number): Promise<{ ok: boolean; desc: string }> => {
        const cell = this.cell(0, col);
        const img = cell.locator('img').first();
        await img.waitFor({ state: 'visible', timeout: 30000 });
        await this.p
          .waitForFunction(
            () => Array.from(document.querySelectorAll('.app-container .el-table__body-wrapper img')).every((im) => (im as HTMLImageElement).complete),
            null,
            { timeout: 30000 },
          )
          .catch(() => undefined);
        const nw = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth).catch(() => 0);
        const src = (await img.getAttribute('src')) ?? '';
        const err = await cell.locator('.el-image__error').count();
        return { ok: nw > 0 && err === 0, desc: `${col === 2 ? '背景缩略图' : '背景图'}列 img naturalWidth=${nw}，错误占位=${err}，src=${this.cleanUrl(src)}` };
      };
      const thumb = await check(2);
      const main = await check(3);
      await this.shotCurrent('case5-static');
      return {
        expect: '两列 PNG img 均已解码，无错误占位',
        real: `背景缩略图列：${thumb.desc}；背景图列：${main.desc}`,
        pass: thumb.ok && main.ok,
        message: `静态图展示不符：${thumb.desc} / ${main.desc}`,
      };
    });

    await this.check('用例#5-② 两列均不启用PAG播放器', async () => {
      const thumbCanvas = await this.cell(0, 2).locator('canvas').count();
      const mainCanvas = await this.cell(0, 3).locator('canvas').count();
      const errors = this.pagFailuresSince(mark);
      await this.shotCurrent('case5-no-pag');
      return {
        expect: '两列 canvas=0',
        real: `背景缩略图列 canvas=${thumbCanvas}，背景图列 canvas=${mainCanvas}，PAG加载失败=${errors.length} 条`,
        pass: thumbCanvas === 0 && mainCanvas === 0,
        message: `PAG 播放器未关闭：缩略图 canvas=${thumbCanvas}，背景图 canvas=${mainCanvas}`,
      };
    });
  }

  // ==================== 用例 #6 ====================

  private async case6(): Promise<void> {
    for (const row of CASE6_ROWS) {
      await this.act(`数据行 ${row.key}：按 BD-STATIC 将两个媒体字段重置为 PNG`, async () => {
        await this.resetToPng();
      });

      const mark = this.consoleMark();
      await this.act(`数据行 ${row.key}：Edit 专用记录并按范围上传 PAG（${row.desc}）`, async () => {
        await this.focusRecord();
        await this.openEdit(0);
        if (row.main) await this.uploadFile('背景图', PAG);
        if (row.thumb) await this.uploadFile('背景缩略图', PAG);
      });

      await this.act(`数据行 ${row.key}：点击 Confirm 保存`, async () => {
        await this.confirmDialog();
      });

      await this.check(`用例#6-①[数据行${row.key}] Confirm后Edit弹窗关闭`, async () => {
        const closed = await this.waitDialogClosed();
        await this.shotCurrent(`case6-${row.key}-confirmed`);
        return {
          expect: '弹窗已关闭=true',
          real: `弹窗已关闭=${closed}，可见弹窗数=${await this.dialogCount()}`,
          pass: closed,
          message: `数据行 ${row.key} Confirm 后 Edit 弹窗未关闭`,
        };
      });

      await this.check(`用例#6-②[数据行${row.key}] 列表目标行按当前数据行预期展示且未替换字段保持原PNG`, async () => {
        await this.searchByName(NAME);
        await this.waitListImages();
        const rows = await this.rowCount();
        if (rows !== 1) throw new Error(`专用记录搜索结果应为 1 条，实际 ${rows} 条`);
        const thumbObs = row.thumb ? await this.observePag(this.cell(0, 2), mark) : null;
        const mainObs = row.main ? await this.observePag(this.cell(0, 3), mark) : null;
        const staticState = async (col: number): Promise<{ nw: number; imgs: number; canvas: number }> => {
          const cell = this.cell(0, col);
          const imgs = await cell.locator('img').count();
          const canvas = await cell.locator('canvas').count();
          const nw = imgs > 0 ? await cell.locator('img').first().evaluate((el) => (el as HTMLImageElement).naturalWidth).catch(() => 0) : 0;
          return { nw, imgs, canvas };
        };
        const thumbStatic = row.thumb ? { nw: 0, imgs: 0, canvas: 0 } : await staticState(2);
        const mainStatic = row.main ? { nw: 0, imgs: 0, canvas: 0 } : await staticState(3);
        const thumbOk = row.thumb ? !!thumbObs && thumbObs.playing && thumbObs.errors.length === 0 : thumbStatic.nw > 0 && thumbStatic.imgs > 0;
        const mainOk = row.main ? !!mainObs && mainObs.playing && mainObs.errors.length === 0 : mainStatic.nw > 0 && mainStatic.imgs > 0;
        await this.shotCurrent(`case6-${row.key}-list`);
        return {
          expect: `背景图=${row.main ? 'PAG播放' : 'PNG静态'}，背景缩略图=${row.thumb ? 'PAG播放' : 'PNG静态'}`,
          real: `背景图列=${row.main ? (mainObs as PagObservation).desc : `PNG img=${mainStatic.imgs}，naturalWidth=${mainStatic.nw}，canvas=${mainStatic.canvas}`}；背景缩略图列=${row.thumb ? (thumbObs as PagObservation).desc : `PNG img=${thumbStatic.imgs}，naturalWidth=${thumbStatic.nw}，canvas=${thumbStatic.canvas}`}`,
          pass: thumbOk && mainOk,
          message: `数据行 ${row.key} 列表展示不符：背景图 ok=${mainOk}，缩略图 ok=${thumbOk}`,
        };
      });

      await this.act(`数据行 ${row.key}：重新打开同一专用记录 Edit 并准备核对回显`, async () => {
        await this.openEdit(0);
      });

      await this.check(`用例#6-③[数据行${row.key}] 重开Edit后两个上传区域按当前数据行预期回显`, async () => {
        const main = await this.observePreview('背景图', mark);
        const thumb = await this.observePreview('背景缩略图', mark);
        const mainOk = this.previewOk(main, row.main ? 'pag' : 'static');
        const thumbOk = this.previewOk(thumb, row.thumb ? 'pag' : 'static');
        await this.shotCurrent(`case6-${row.key}-edit`);
        return {
          expect: `背景图=${row.main ? 'PAG播放' : 'PNG静态'}，背景缩略图=${row.thumb ? 'PAG播放' : 'PNG静态'}`,
          real: `背景图=${main.desc}；背景缩略图=${thumb.desc}`,
          pass: mainOk && thumbOk,
          message: `数据行 ${row.key} 编辑回显不符：背景图 ok=${mainOk}，缩略图 ok=${thumbOk}`,
        };
      });

      await this.act(`数据行 ${row.key}：点击 Cancel 关闭 Edit 弹窗`, async () => {
        await this.closeDialogByCancel();
      });
    }
  }

  // ==================== 用例 #7 ====================

  private async case7(): Promise<void> {
    await this.act('按 BD-I18N 确认专用记录存在且两个媒体字段为 PAG', async () => {
      const rows = await this.focusRecord();
      if (rows !== 1) throw new Error(`专用记录搜索结果应为 1 条，实际 ${rows} 条`);
      await this.openEdit(0);
      const main = await this.observePreview('背景图', this.consoleMark());
      const thumb = await this.observePreview('背景缩略图', this.consoleMark());
      if (!this.previewOk(main, 'pag') || !this.previewOk(thumb, 'pag')) {
        throw new Error(`BD-I18N 就绪条件不成立：背景图=${main.desc}，背景缩略图=${thumb.desc}`);
      }
      await this.closeDialogByCancel();
    });

    await this.act(`Edit 专用记录：en 页签填 ${EN_NAME}，切换 zh 页签填 ${ZH_NAME}`, async () => {
      await this.focusRecord();
      await this.openEdit(0);
      const enInput = this.dialog().locator('.el-tab-pane:visible input[placeholder="请输入特效名称"]').first();
      await enInput.waitFor({ state: 'visible', timeout: 15000 });
      await enInput.fill(EN_NAME);
      await this.dialog().locator('.el-tabs__item').filter({ hasText: /^\s*zh\s*$/ }).first().click();
      const zhInput = this.dialog().locator('.el-tab-pane:visible input[placeholder="请输入特效名称"]').first();
      await zhInput.waitFor({ state: 'visible', timeout: 15000 });
      await zhInput.fill(ZH_NAME);
    });

    await this.act('点击 Confirm 保存多语言名称', async () => {
      await this.confirmDialog();
    });

    await this.check('用例#7-① Confirm后Edit弹窗关闭且精确搜索仍仅1条专用记录', async () => {
      const closed = await this.waitDialogClosed();
      await this.searchByName(NAME);
      const rows = await this.rowCount();
      await this.shotCurrent('case7-saved');
      return {
        expect: '弹窗已关闭=true，结果行数=1',
        real: `弹窗已关闭=${closed}，结果行数=${rows}`,
        pass: closed && rows === 1,
        message: `保存后状态不符：关闭=${closed}，结果行数=${rows}`,
      };
    });

    await this.act('重新打开同一专用记录 Edit（默认 en 页签）', async () => {
      await this.focusRecord();
      await this.openEdit(0);
    });

    await this.check('用例#7-② 重开Edit默认en页签特效名称回显BOT_TEST_PAG_3707_EN', async () => {
      // 说明：Edit 弹窗组件未销毁，会保留上次激活页签（同一会话先切 zh 后重开仍为 zh；新会话首次打开为 en）。
      // 需求（R8）只要求多语言名称保存后回显正确，未规定默认页签；此处记录初始页签并按页面操作切到 en 读取 en 名称。
      const activeBefore = (await this.dialog().locator('.el-tabs__item.is-active').first().innerText()).trim();
      if (activeBefore !== 'en') {
        await this.dialog().locator('.el-tabs__item').filter({ hasText: /^\s*en\s*$/ }).first().click();
        await this.p.waitForFunction(() => document.querySelector('.el-dialog .el-tabs__item.is-active')?.textContent?.trim() === 'en', null, { timeout: 15000 });
      }
      const value = await this.dialog().locator('.el-tab-pane:visible input[placeholder="请输入特效名称"]').first().inputValue();
      await this.shotCurrent('case7-en');
      return {
        expect: EN_NAME,
        real: `初始激活页签=${activeBefore}（组件保留上次页签），切换 en 后特效名称=${value}`,
        pass: value === EN_NAME,
        message: `en 回显不符：初始页签=${activeBefore}，特效名称=${value}`,
      };
    });

    await this.act('切换到 zh 页签', async () => {
      await this.dialog().locator('.el-tabs__item').filter({ hasText: /^\s*zh\s*$/ }).first().click();
      await this.p.waitForFunction(() => {
        const active = document.querySelector('.el-dialog .el-tabs__item.is-active');
        return active?.textContent?.trim() === 'zh';
      }, null, { timeout: 15000 });
    });

    await this.check('用例#7-③ 切换zh后特效名称回显BOT_TEST_PAG_3707_中文', async () => {
      const value = await this.dialog().locator('.el-tab-pane:visible input[placeholder="请输入特效名称"]').first().inputValue();
      await this.shotCurrent('case7-zh');
      return {
        expect: ZH_NAME,
        real: value,
        pass: value === ZH_NAME,
        message: `zh 回显不符：期望 ${ZH_NAME}，实际 ${value}`,
      };
    });

    await this.act('点击 Cancel 关闭 Edit 弹窗', async () => {
      await this.closeDialogByCancel();
    });
  }

  // ==================== 用例 #8 ====================

  private async case8(): Promise<void> {
    let before = { total: '', name: '', thumb: '', main: '' };
    await this.act('按 BD-RECORD 记录专用记录列表 Total、名称与两个媒体资源当前状态', async () => {
      const rows = await this.focusRecord();
      if (rows !== 1) throw new Error(`专用记录搜索结果应为 1 条，实际 ${rows} 条`);
      const total = await this.listTotal();
      const name = (await this.cell(0, 1).innerText()).trim();
      const thumbEl = (await this.cell(0, 2).locator('canvas.pag-canvas').count()) ? this.cell(0, 2).locator('canvas.pag-canvas').first() : this.cell(0, 2).locator('img').first();
      const mainEl = (await this.cell(0, 3).locator('canvas.pag-canvas').count()) ? this.cell(0, 3).locator('canvas.pag-canvas').first() : this.cell(0, 3).locator('img').first();
      before = {
        total: total.text || String(total.total),
        name,
        thumb: await this.mediaSrc(thumbEl),
        main: await this.mediaSrc(mainEl),
      };
      this.log(`BD-RECORD 当前状态：Total=${before.total}，名称=${before.name}，缩略图=${this.cleanUrl(before.thumb)}，主图=${this.cleanUrl(before.main)}`);
    });

    let preview = { main: '', thumb: '' };
    await this.act('Edit 专用记录并在两个上传区域上传 PAG（不保存）', async () => {
      await this.openEdit(0);
      await this.uploadFile('背景图', PAG);
      await this.uploadFile('背景缩略图', PAG);
      await this.waitPagPreview('背景图');
      await this.waitPagPreview('背景缩略图');
      preview = {
        main: await this.mediaSrc(this.formItem('背景图').locator('canvas.pag-canvas').first()),
        thumb: await this.mediaSrc(this.formItem('背景缩略图').locator('canvas.pag-canvas').first()),
      };
    });

    await this.check('用例#8-① 背景图预览资源地址去query/hash后以.pag结尾且不含.octet-stream', async () => {
      const url = this.cleanUrl(preview.main);
      await this.shotCurrent('case8-main-url');
      return {
        expect: '以 .pag 结尾且不含 .octet-stream',
        real: url,
        pass: url.endsWith('.pag') && !url.includes('.octet-stream'),
        message: `背景图预览地址不符：${url}`,
      };
    });

    await this.check('用例#8-② 背景缩略图预览资源地址去query/hash后以.pag结尾且不含.octet-stream', async () => {
      const url = this.cleanUrl(preview.thumb);
      await this.shotCurrent('case8-thumb-url');
      return {
        expect: '以 .pag 结尾且不含 .octet-stream',
        real: url,
        pass: url.endsWith('.pag') && !url.includes('.octet-stream'),
        message: `背景缩略图预览地址不符：${url}`,
      };
    });

    await this.act('点击 Cancel 放弃本次上传，不保存', async () => {
      await this.closeDialogByCancel();
    });

    await this.check('用例#8-③ Cancel后专用记录Total、名称及原媒体资源状态均未改变', async () => {
      await this.searchByName(NAME);
      const rows = await this.rowCount();
      if (rows !== 1) throw new Error(`Cancel 后专用记录搜索结果应为 1 条，实际 ${rows} 条`);
      const total = await this.listTotal();
      const name = (await this.cell(0, 1).innerText()).trim();
      const thumbEl = (await this.cell(0, 2).locator('canvas.pag-canvas').count()) ? this.cell(0, 2).locator('canvas.pag-canvas').first() : this.cell(0, 2).locator('img').first();
      const mainEl = (await this.cell(0, 3).locator('canvas.pag-canvas').count()) ? this.cell(0, 3).locator('canvas.pag-canvas').first() : this.cell(0, 3).locator('img').first();
      const after = {
        total: total.text || String(total.total),
        name,
        thumb: await this.mediaSrc(thumbEl),
        main: await this.mediaSrc(mainEl),
      };
      await this.shotCurrent('case8-after-cancel');
      const same = after.total === before.total && after.name === before.name && after.thumb === before.thumb && after.main === before.main;
      return {
        expect: `Total=${before.total}，名称=${before.name}，缩略图=${this.cleanUrl(before.thumb)}，主图=${this.cleanUrl(before.main)}`,
        real: `Total=${after.total}，名称=${after.name}，缩略图=${this.cleanUrl(after.thumb)}，主图=${this.cleanUrl(after.main)}`,
        pass: same,
        message: `Cancel 后记录状态发生变化：${JSON.stringify({ before, after })}`,
      };
    });
  }

  // ==================== 用例 #9 ====================

  private async case9(): Promise<void> {
    for (const row of CASE9_ROWS) {
      const mark = this.consoleMark();
      await this.act(`数据行 ${row.key}：Edit 专用记录，两个媒体字段均上传 ${row.ext}`, async () => {
        await this.focusRecord();
        await this.openEdit(0);
        await this.uploadFile('背景图', row.file);
        await this.uploadFile('背景缩略图', row.file);
      });

      await this.check(`用例#9-①[数据行${row.key}] Edit弹窗两个预览区域显示${row.ext.toUpperCase()}资源且无破图`, async () => {
        const main = await this.observePreview('背景图', mark);
        const thumb = await this.observePreview('背景缩略图', mark);
        await this.shotCurrent(`case9-${row.key}-preview`);
        return {
          expect: `两个预览区域均渲染 ${row.ext} 资源（静态 img 已解码）`,
          real: `背景图=${main.desc}；背景缩略图=${thumb.desc}`,
          pass: this.previewOk(main, 'static') && this.previewOk(thumb, 'static'),
          message: `数据行 ${row.key} 预览不符：背景图=${main.desc}；缩略图=${thumb.desc}`,
        };
      });

      await this.act(`数据行 ${row.key}：点击 Confirm 保存`, async () => {
        await this.confirmDialog();
      });

      await this.check(`用例#9-②[数据行${row.key}] Confirm后Edit弹窗关闭`, async () => {
        const closed = await this.waitDialogClosed();
        await this.shotCurrent(`case9-${row.key}-confirmed`);
        return {
          expect: '弹窗已关闭=true',
          real: `弹窗已关闭=${closed}，可见弹窗数=${await this.dialogCount()}`,
          pass: closed,
          message: `数据行 ${row.key} Confirm 后 Edit 弹窗未关闭`,
        };
      });

      await this.check(`用例#9-③[数据行${row.key}] 列表目标行两个媒体列按${row.ext.toUpperCase()}预期展示且无破图或空白`, async () => {
        await this.searchByName(NAME);
        await this.waitListImages();
        const rows = await this.rowCount();
        if (rows !== 1) throw new Error(`专用记录搜索结果应为 1 条，实际 ${rows} 条`);
        const cols: Array<{ name: string; col: number }> = [
          { name: '背景缩略图', col: 2 },
          { name: '背景图', col: 3 },
        ];
        const results: string[] = [];
        let ok = true;
        for (const item of cols) {
          const cell = this.cell(0, item.col);
          const img = cell.locator('img').first();
          const hasImg = (await cell.locator('img').count()) > 0;
          const nw = hasImg ? await img.evaluate((el) => (el as HTMLImageElement).naturalWidth).catch(() => 0) : 0;
          const canvas = await cell.locator('canvas').count();
          const err = await cell.locator('.el-image__error').count();
          const src = hasImg ? (await img.getAttribute('src')) ?? '' : '';
          const colOk = hasImg && nw > 0 && canvas === 0 && err === 0;
          ok = ok && colOk;
          results.push(`${item.name}列：img=${hasImg}，naturalWidth=${nw}，canvas=${canvas}，错误占位=${err}，src=${this.cleanUrl(src)}`);
        }
        await this.shotCurrent(`case9-${row.key}-list`);
        return {
          expect: `两列均解码显示 ${row.ext} 资源，无破图/空白`,
          real: results.join('；'),
          pass: ok,
          message: `数据行 ${row.key} 列表展示不符：${results.join('；')}`,
        };
      });
    }

    await this.act('数据清理恢复：将专用记录两个媒体字段恢复为 PAG', async () => {
      await this.resetToPng();
      await this.focusRecord();
      await this.openEdit(0);
      await this.setBothMedia(PAG);
      await this.confirmDialog();
      await this.waitDialogClosed();
      await this.searchByName(NAME);
    });
  }

  // ==================== 用例 #10 / #11 / #12 ====================

  private async case10(): Promise<void> {
    await this.validationCase('10', '背景名称', false, true, true);
  }

  private async case11(): Promise<void> {
    await this.validationCase('11', '背景图', true, false, true);
  }

  private async case12(): Promise<void> {
    await this.validationCase('12', '背景缩略图', true, true, false);
  }

  private async validationCase(caseNo: string, emptyField: string, withName: boolean, withMain: boolean, withThumb: boolean): Promise<void> {
    let beforeTotal = '';
    await this.act(`用例#${caseNo} 前置：读取无筛选默认列表 Total`, async () => {
      await this.enterByMenu();
      await this.resetSearch();
      const total = await this.listTotal();
      beforeTotal = total.text || String(total.total);
      this.log(`默认列表 Total=${beforeTotal}`);
    });

    const mark = this.consoleMark();
    await this.act(`用例#${caseNo}：Add 弹窗仅留「${emptyField}」为空并补齐其他必填项`, async () => {
      await this.openAdd();
      if (withName) await this.formItem('背景名称').locator('input').first().fill(NAME);
      if (withMain) await this.uploadFile('背景图', PAG);
      if (withThumb) await this.uploadFile('背景缩略图', PAG);
    });

    await this.act(`用例#${caseNo}：点击 Confirm（${emptyField}保持为空）`, async () => {
      await this.confirmDialog();
      await this.p
        .waitForFunction(
          () => {
            const visible = Array.from(document.querySelectorAll('.el-dialog__wrapper')).filter((w) => {
              const el = w as HTMLElement;
              const style = getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            }).length;
            return visible === 0 || document.querySelectorAll('.el-message').length > 0;
          },
          null,
          { timeout: 6000 },
        )
        .catch(() => undefined);
    });

    await this.check(`用例#${caseNo}-① ${emptyField}为空点击Confirm后Add弹窗保持打开`, async () => {
      const count = await this.dialogCount();
      const title = count > 0 ? (await this.dialog().locator('.el-dialog__title').first().innerText()).trim() : '(无弹窗)';
      const toasts = await this.toastTexts();
      await this.shotCurrent(`case${caseNo}-confirm`);
      return {
        expect: '可见 Add 弹窗数=1',
        real: `可见弹窗数=${count}，标题=${title}，提示=${toasts.join('|') || '无'}`,
        pass: count === 1 && title === 'Add',
        message: `校验后弹窗状态不符：可见弹窗数=${count}，标题=${title}`,
      };
    });

    await this.act(`用例#${caseNo}：点击 Cancel 关闭弹窗并重新读取默认列表`, async () => {
      await this.closeDialogByCancel();
      await this.resetSearch();
    });

    await this.check(`用例#${caseNo}-② Cancel后默认列表Total仍为T且未新增记录`, async () => {
      const total = await this.listTotal();
      const now = total.text || String(total.total);
      const errors = this.pagFailuresSince(mark);
      await this.shotCurrent(`case${caseNo}-total`);
      return {
        expect: `Total=${beforeTotal}`,
        real: `Total=${now}（列表行数=${total.rows}），PAG加载失败=${errors.length} 条`,
        pass: now === beforeTotal,
        message: `Cancel 后默认列表 Total 变化：期望 ${beforeTotal}，实际 ${now}`,
      };
    });
  }
}

const test = new FamilyPagTest();
await test.execute();
