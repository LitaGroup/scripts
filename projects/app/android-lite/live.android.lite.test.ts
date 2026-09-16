/**
 * 直播开播冒烟（Android / Lite）— 语音房 Live 页开播 → 关播
 *
 * 前置：
 *   1. Lita 账号已登录（脚本会 ensure 登录）
 *   2. 账号具备开播资格（Live 页右上角 startLiveIV 可见）
 *   3. 权限弹窗一律允许（autoGrant + LivePermissionDialog「全部打开」+ 系统 Allow）
 *
 * 步骤：
 *   1. 底部语音房 → Live Tab → 点右上角开播
 *   2. 选择直播间页：点「个人直播间」下封面
 *   3. 开播编辑页：点「相机」Tab →「开始直播」
 *   4. 进入直播间后右上角关播（img_more）→ 确认结束
 *
 * 运行：
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
 *     SCRIPT_CONFIG=config.app.json \
 *     node projects/app/android-lite/live.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import {
  AppiumResource,
  by,
  sleep,
  type AppiumCapabilities,
  type Locator,
} from '../../../src/resources/AppiumResource.ts';
import { loginWithPhonePassword, ensureAndroidLoggedIn } from '../core/_lib/androidLoginFlow.ts';
import { resolveAndroidStrings } from '../core/_lib/androidAppStrings.ts';

/**
 * Appium 建连：与 voice-room.android.lite.test.ts 保持一致。
 * 平台可能晚于脚本启动才拉起 Appium，故探测失败时轮询等待，不在模块加载时一锤定音。
 */
function normalizeAppiumBase(raw: string): string {
  let u = raw.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  u = u.replace(/^(https?:\/\/)localhost(?=[:/]|$)/i, '$1127.0.0.1');
  if (!u.endsWith('/')) u += '/';
  return u;
}

async function probeAppium(url: string): Promise<boolean> {
  try {
    const res = await fetch(new URL('status', url), { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

function appiumCandidates(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw?: string) => {
    const n = normalizeAppiumBase(raw ?? '');
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };
  add(process.env.SCRIPT_APPIUM_URL);
  add(process.env.APPIUM_URL);
  add(process.env.APPIUM_HOST);
  add('http://127.0.0.1:4723/');
  return out;
}

/** 轮询直到 Appium 可达（默认最多 90s），与语音房同一探测方式 */
async function waitForReachableAppiumUrl(timeoutMs = 90_000): Promise<string> {
  const candidates = appiumCandidates();
  const fallback = candidates[0] ?? 'http://127.0.0.1:4723/';
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    for (const u of candidates) {
      if (await probeAppium(u)) {
        process.stdout.write(`[log] Appium 可用: ${u}（attempt=${attempt}）\n`);
        return u;
      }
    }
    process.stdout.write(
      `[log] Appium 暂不可达（attempt=${attempt}）：${candidates.join(' , ')}，2s 后重试\n`,
    );
    await sleep(2_000);
  }
  process.stdout.write(`[log] Appium 探测超时，仍将尝试: ${fallback}\n`);
  return fallback;
}

const APP_PACKAGE = 'com.litalite.android';
const id = (name: string) => `${APP_PACKAGE}:id/${name}`;

const ACT = {
  splash: '.ui.splash.SplashActivity',
  main: '.MainActivity',
  login: '.ui.login.LoginActivity',
  chooseRoom: '.ui.videoRoom.start.LiveChooseRoomActivity',
  chooseGame: '.ui.videoRoom.start.LiveChooseGameActivity',
  editInfo: '.ui.videoRoom.start.LiveEditInfoActivity',
  videoRoom: '.ui.videoRoom.VideoRoomActivity',
};

const VIDEO_ROOM_ACTIVITY = /\.ui\.videoRoom\.VideoRoomActivity$/;
const PERMISSION_ACTIVITY = /permission\.ui\.GrantPermissionsActivity$|com\.android\.permissioncontroller/;

/** 布局 id — 对照 lita-lite-android */
const ID = {
  tabParty: id('navigation_voice_room'),
  tabHome: id('navigation_home'),
  tabBar: id('tabView'),
  meUid: id('user_no'),
  mePage: id('layout_options'),
  popupActivity: id('vp_banner'),
  popupActivityClose: id('img_close'),

  // RoomListFragment — Live 页
  liveTitleAll: id('liveTitleAllView'),
  liveTitle: id('liveTitleView'),
  liveTitleTag: id('liveTitleTagView'),
  startLive: id('startLiveIV'),
  searchEntry: id('img_search_room'),
  partyTitleArea: id('partyTitleAllView'),

  // LivePermissionDialog
  openAllPermission: id('tv_open_all_permission'),
  permissionDialogClose: id('iv_close'),

  // LiveChooseRoomActivity — 个人直播间封面在 gameListView
  myRoomList: id('gameListView'),
  roomCover: id('iv_room_cover'),
  chooseRoomClose: id('iv_close'),

  // LiveChooseGameActivity
  gameList: id('gameListView'),
  entertainmentList: id('rv_entertainment'),
  skillLogo: id('mlbb_logo'),
  skillName: id('tv_game_name'),

  // LiveEditInfoActivity
  cameraTab: id('ll_camera'),
  cameraTitle: id('tv_camera'),
  startLiveBtn: id('tv_start_live'),
  editClose: id('img_close'),

  // VideoRoomTopFragment — 房主时 img_more = 关播
  closeLive: id('img_more'),
  roomName: id('roomNameTv'),
  roomId: id('roomIdTv'),
  liveTime: id('liveTimeTv'),

  // CommonDialog
  positive: id('positiveTv'),
  negative: id('negativeTv'),
  /** LiveFinishDataDialog 返回（源码拼写 tv_retrun） */
  finishReturn: id('tv_retrun'),
};

const PERMISSION_ALLOW_IDS = [
  'com.android.permissioncontroller:id/permission_allow_foreground_only_button',
  'com.android.permissioncontroller:id/permission_allow_one_time_button',
  'com.android.permissioncontroller:id/permission_allow_button',
  'com.android.permissioncontroller:id/permission_allow_always_button',
  'com.android.packageinstaller:id/permission_allow_button',
];

const RUNTIME_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_EXTERNAL_STORAGE',
];

class LiveAndroidLiteTest extends AppBaseClass {
  /** 与语音房一致：显式传入地址；真正建连前再 waitForReachableAppiumUrl 刷新 env */
  protected override readonly driver = new AppiumResource(
    process.env.SCRIPT_APPIUM_URL ?? 'http://127.0.0.1:4723/',
  );

  constructor() {
    super('android', 'lite');
    // 登录 → Live 页 → 开播 → 选房 → 相机 → 开始 → 断言关播 → 结束
    this.total = 10;
    this.registerLiveStates();
  }

  /** 建连失败则中止；先轮询等待 Appium（对齐语音房可达机） */
  protected async run(): Promise<void> {
    await this.act(`创建 Appium 会话 (${this.platform}/${this.flavor}/${this.env})`, async () => {
      const url = await waitForReachableAppiumUrl(90_000);
      process.env.SCRIPT_APPIUM_URL = url;
      this.log(`Appium: ${url}`);
      await this.driver.createSession(this.capabilities());
      await this.activateApp();
    });
    if (!this.driver.isActive) {
      throw new Error(
        'Appium 会话未创建，已中止后续步骤（请确认执行机 Appium 已启动，且与语音房任务跑在同一执行机）',
      );
    }
    try {
      await this.runCase();
    } finally {
      try {
        await this.driver.deleteSession();
      } catch {
        // ignore
      }
    }
  }

  /** capabilities 与 voice-room 对齐，避免额外依赖差异 */
  protected capabilities(): AppiumCapabilities {
    const caps: AppiumCapabilities = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:appPackage': APP_PACKAGE,
      'appium:appActivity': ACT.splash,
      'appium:noReset': true,
      'appium:autoGrantPermissions': true,
      'appium:newCommandTimeout': 300,
      'appium:skipLogcatCapture': true,
      'appium:disableWindowAnimation': true,
      'appium:uiautomator2ServerInstallTimeout': 60_000,
      'appium:adbExecTimeout': 60_000,
      'appium:settings[waitForIdleTimeout]': 0,
      'appium:settings[waitForSelectorTimeout]': 0,
    };
    const udid = (process.env.SCRIPT_DEVICE_UDID || process.env.SCRIPT_ANDROID_UDID || '').trim();
    if (udid) caps['appium:udid'] = udid;
    const deviceName = (process.env.SCRIPT_ANDROID_DEVICE || '').trim();
    if (deviceName) caps['appium:deviceName'] = deviceName;
    return caps;
  }

  protected async login(account: AppAccount): Promise<void> {
    await loginWithPhonePassword(this, account);
  }

  protected resolveAccount(): AppAccount {
    try {
      return this.account();
    } catch {
      return {
        username: '18810242906',
        password: '123456',
        countryCode: '86',
      };
    }
  }

  /** 直播链路状态：权限 / 弹窗 / 登录态 / 页面 */
  protected registerLiveStates(): void {
    this.addState({
      name: 'permission-system',
      kind: 'popup',
      detect: async () => {
        if (this.activity && PERMISSION_ACTIVITY.test(this.activity)) return true;
        for (const pid of PERMISSION_ALLOW_IDS) {
          if (await this.driver.exists(by.id(pid))) return true;
        }
        return false;
      },
      handle: async () => {
        await this.clickPermissionAllow();
      },
    });
    this.addState({
      name: 'popup-live-permission',
      kind: 'popup',
      detect: () => this.driver.exists(by.id(ID.openAllPermission)),
      handle: async () => {
        await this.driver.click(by.id(ID.openAllPermission));
        await sleep(600);
        for (let i = 0; i < 6; i++) {
          if (!(await this.clickPermissionAllow())) break;
          await sleep(400);
        }
      },
    });
    this.addState({
      name: 'popup-whatsapp',
      kind: 'popup',
      detect: async () =>
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/tv_not_have_whatsapp`))) ||
        ((await this.driver.exists(by.id(`${APP_PACKAGE}:id/iv_close`))) &&
          (await this.driver.exists(by.id(`${APP_PACKAGE}:id/tv_continue`)))),
      handle: async () => {
        if (await this.driver.exists(by.id(`${APP_PACKAGE}:id/tv_not_have_whatsapp`))) {
          await this.driver.click(by.id(`${APP_PACKAGE}:id/tv_not_have_whatsapp`));
        } else if (await this.driver.exists(by.id(`${APP_PACKAGE}:id/iv_close`))) {
          await this.driver.click(by.id(`${APP_PACKAGE}:id/iv_close`));
        }
        await sleep(500);
      },
    });
    this.addState({
      name: 'popup-activity',
      kind: 'popup',
      activity: ACT.main,
      detect: () => this.driver.exists(by.id(ID.popupActivity)),
      handle: async () => {
        await this.driver.click(by.id(ID.popupActivityClose));
      },
    });
    this.addState({
      name: 'logged-in',
      activity: ACT.main,
      detect: async () =>
        (await this.driver.exists(by.id(ID.meUid))) || (await this.driver.exists(by.id(ID.mePage))),
    });
    this.addState({
      name: 'logged-out',
      activity: ACT.login,
      detect: async () => true,
    });
    this.addState({
      name: 'live-room',
      activity: VIDEO_ROOM_ACTIVITY,
      detect: async () => true,
    });
    this.addState({
      name: 'live-edit',
      activity: ACT.editInfo,
      detect: async () => true,
    });
    this.addState({
      name: 'live-choose-room',
      activity: ACT.chooseRoom,
      detect: async () => true,
    });
  }

  protected async runCase(): Promise<void> {
    await this.act('启动后关闭弹窗并预授权', async () => {
      await this.grantRuntimePermissions();
      await this.closePopups();
    });

    await this.act('确保已登录', async () => {
      await ensureAndroidLoggedIn(this, this.resolveAccount());
      await this.closePopups();
    });

    await this.act('进入语音房 Live 页', async () => {
      await this.openVoiceRoomLiveTab();
    });

    await this.act('点击右上角开播按钮', async () => {
      await this.assertExists(by.id(ID.startLive), '开播按钮 startLiveIV（账号需具备开播资格）');
      await this.driver.click(by.id(ID.startLive));
      await sleep(800);
      await this.closePopups();
      // 若已在播：点「关闭直播」结束后再点开播
      await this.handleAlreadyLiveDialogIfNeeded();
      await this.waitUntilStartLiveFlow(20_000);
    });

    await this.act('选择个人直播间封面', async () => {
      if (await this.isActivity(ACT.editInfo) || (await this.isActivity(ACT.chooseGame))) {
        this.log('无官方房列表，已直达开播编辑/选品类页，跳过选封面');
        return;
      }
      await this.waitForActivity(ACT.chooseRoom, 12_000);
      const cover = await this.firstPersonalRoomCover();
      if (!cover) throw new Error('选择直播间页未找到个人直播间封面（iv_room_cover）');
      await this.driver.click(cover);
      await sleep(800);
      await this.closePopups();
      // 首次开播可能先选品类
      if (await this.isActivity(ACT.chooseGame)) {
        await this.pickFirstLiveCategory();
      }
      await this.waitForActivity(ACT.editInfo, 15_000);
    });

    await this.act('点击相机 Tab', async () => {
      if (await this.isActivity(ACT.chooseGame)) {
        await this.pickFirstLiveCategory();
        await this.waitForActivity(ACT.editInfo, 12_000);
      }
      await this.waitForActivity(ACT.editInfo, 8_000);
      await this.waitForElement(by.id(ID.cameraTab), '相机 Tab', 8_000);
      await this.driver.click(by.id(ID.cameraTab));
      await sleep(600);
      await this.closePopups();
    });

    await this.act('点击开始直播', async () => {
      const startBtn = by.xpath(
        `//*[@resource-id='${ID.startLiveBtn}' and (@displayed='true' or @enabled='true')]`,
      );
      if (await this.driver.exists(startBtn)) {
        await this.driver.click(startBtn);
      } else {
        await this.assertExists(by.id(ID.startLiveBtn), '开始直播按钮');
        await this.driver.click(by.id(ID.startLiveBtn));
      }
      await sleep(1_000);
      await this.closePopups();
      await this.waitForActivity(ACT.videoRoom, 25_000);
    });

    await this.check('已进入开播直播间且右上角关播按钮可见', async () => {
      const inRoom = await this.isActivity(VIDEO_ROOM_ACTIVITY);
      // 直播间动画多，多等一会
      const deadline = Date.now() + 12_000;
      let closeVisible = false;
      while (Date.now() < deadline) {
        await this.closePopups();
        if (await this.driver.exists(by.id(ID.closeLive))) {
          closeVisible = true;
          break;
        }
        await sleep(400);
      }
      return {
        expect: 'VideoRoomActivity + img_more（关播）',
        real: `inRoom=${inRoom} closeVisible=${closeVisible}`,
        pass: !!(inRoom && closeVisible),
      };
    });

    await this.act('点击关播并确认结束直播', async () => {
      await this.waitForElement(by.id(ID.closeLive), '关播按钮 img_more', 8_000);
      await this.driver.click(by.id(ID.closeLive));
      await sleep(600);
      // CommonDialog：positive = 结束直播
      const deadline = Date.now() + 8_000;
      let confirmed = false;
      while (Date.now() < deadline) {
        if (await this.driver.exists(by.id(ID.positive))) {
          await this.driver.click(by.id(ID.positive));
          confirmed = true;
          break;
        }
        const endTexts = await resolveAndroidStrings(this, ['live_room_broadcast47']);
        for (const t of endTexts) {
          if (t && (await this.driver.exists(by.text(t)))) {
            await this.driver.click(by.text(t));
            confirmed = true;
            break;
          }
        }
        if (confirmed) break;
        await sleep(300);
      }
      if (!confirmed) throw new Error('未出现「结束直播」确认弹窗');

      // 关播后会弹出 LiveFinishDataDialog，点「返回」才 finish Activity
      const returnDeadline = Date.now() + 20_000;
      while (Date.now() < returnDeadline) {
        if (await this.driver.exists(by.id(ID.finishReturn))) {
          await this.driver.click(by.id(ID.finishReturn));
          await sleep(800);
          break;
        }
        await sleep(400);
      }

      const leaveDeadline = Date.now() + 12_000;
      while (Date.now() < leaveDeadline) {
        if (!(await this.isActivity(VIDEO_ROOM_ACTIVITY))) return;
        // 结算页仍在时再点一次返回
        if (await this.driver.exists(by.id(ID.finishReturn))) {
          await this.driver.click(by.id(ID.finishReturn));
          await sleep(800);
        }
        await sleep(400);
      }
      throw new Error(`关播后仍停留在 VideoRoomActivity: ${this.activity || '(未知)'}`);
    });

    await this.check('关播后已离开直播间', async () => {
      const stillLive = await this.isActivity(VIDEO_ROOM_ACTIVITY);
      return {
        expect: '非 VideoRoomActivity',
        real: this.activity || '(未知)',
        pass: !stillLive,
      };
    });
  }

  // ─── helpers ───────────────────────────────────────────────

  protected async grantRuntimePermissions(): Promise<void> {
    for (const p of RUNTIME_PERMISSIONS) {
      try {
        await this.driver.execute('mobile: shell', [
          { command: 'pm', args: ['grant', APP_PACKAGE, p] },
        ]);
      } catch {
        // 部分 API 不支持，忽略
      }
    }
  }

  protected async clickPermissionAllow(): Promise<boolean> {
    for (const pid of PERMISSION_ALLOW_IDS) {
      if (await this.driver.exists(by.id(pid))) {
        await this.driver.click(by.id(pid));
        await sleep(400);
        return true;
      }
    }
    for (const t of ['While using the app', 'Only this time', 'Allow', 'ALLOW', '仅在使用该应用时允许', '仅限这一次', '允许']) {
      if (await this.driver.exists(by.text(t))) {
        await this.driver.click(by.text(t));
        await sleep(400);
        return true;
      }
    }
    return false;
  }

  /** 底部语音房 tab → Live 子 Tab，直到开播按钮可见 */
  protected async openVoiceRoomLiveTab(): Promise<void> {
    await this.closePopups();

    // 已在直播间：先退出
    if (await this.isActivity(VIDEO_ROOM_ACTIVITY)) {
      this.log('已在直播间，先尝试关播退出');
      try {
        if (await this.driver.exists(by.id(ID.closeLive))) {
          await this.driver.click(by.id(ID.closeLive));
          await sleep(500);
          if (await this.driver.exists(by.id(ID.positive))) {
            await this.driver.click(by.id(ID.positive));
            await sleep(2_000);
          }
        } else {
          await this.driver.back();
          await sleep(800);
        }
      } catch {
        // ignore
      }
    }

    // 开播编辑 / 选房：先关掉
    if (
      (await this.isActivity(ACT.editInfo)) ||
      (await this.isActivity(ACT.chooseRoom)) ||
      (await this.isActivity(ACT.chooseGame))
    ) {
      await this.driver.back();
      await sleep(800);
    }

    if (!(await this.driver.exists(by.id(ID.tabParty)))) {
      // 等主页底部导航
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline && !(await this.driver.exists(by.id(ID.tabParty)))) {
        await this.closePopups();
        await sleep(400);
      }
    }
    await this.assertExists(by.id(ID.tabParty), '底部语音房 tab');
    await this.driver.click(by.id(ID.tabParty));
    await sleep(800);
    await this.closePopups();

    // 切到 Live（开播入口仅 Live tab 可见）
    await this.ensureLiveSubTab();
    const readyDeadline = Date.now() + 15_000;
    while (Date.now() < readyDeadline) {
      if (await this.driver.exists(by.id(ID.startLive))) return;
      await this.ensureLiveSubTab();
      await sleep(500);
    }
    throw new Error(
      'Live 页未出现开播按钮 startLiveIV：请确认当前账号具备开播资格（liveShow），且已切到 Live Tab',
    );
  }

  protected async ensureLiveSubTab(): Promise<void> {
    await this.closePopups();
    if (await this.driver.exists(by.id(ID.startLive))) return;

    if (await this.driver.exists(by.id(ID.liveTitleAll))) {
      await this.driver.click(by.id(ID.liveTitleAll));
    } else if (await this.driver.exists(by.id(ID.liveTitle))) {
      await this.driver.click(by.id(ID.liveTitle));
    } else {
      // 文案兜底：Live tab 标题多为 "Live"
      const liveTexts = await resolveAndroidStrings(this, ['live_room_broadcast1']);
      for (const t of [...liveTexts, 'Live']) {
        if (t && (await this.driver.exists(by.text(t)))) {
          await this.driver.click(by.text(t));
          break;
        }
      }
    }
    await sleep(700);
  }

  /**
   * 点击开播后，等待进入选房 / 选品类 / 编辑页。
   * 若弹出「已在开播」对话框：点关闭直播，冷却后再点开播。
   */
  protected async handleAlreadyLiveDialogIfNeeded(): Promise<void> {
    // negative = 关闭直播（live_room_broadcast37）；positive = 继续直播
    const closeTexts = await resolveAndroidStrings(this, ['live_room_broadcast37']);
    const titleTexts = await resolveAndroidStrings(this, ['live_room_broadcast36']);
    const hasTitle = async () => {
      for (const t of titleTexts) {
        if (t && (await this.driver.exists(by.textContains(t.slice(0, Math.min(12, t.length)))))) {
          return true;
        }
      }
      return false;
    };

    if (!(await hasTitle()) && !(await this.driver.exists(by.id(ID.negative)))) {
      return;
    }

    this.log('检测到已在开播对话框，先关闭直播再重新开播');
    let closed = false;
    for (const t of closeTexts) {
      if (t && (await this.driver.exists(by.text(t)))) {
        await this.driver.click(by.text(t));
        closed = true;
        break;
      }
    }
    if (!closed && (await this.driver.exists(by.id(ID.negative)))) {
      await this.driver.click(by.id(ID.negative));
      closed = true;
    }
    if (!closed) return;

    // 关播冷却约 20s（live_room_broadcast35）
    this.log('等待关播冷却 ~22s');
    await sleep(22_000);
    await this.closePopups();
    if (await this.driver.exists(by.id(ID.startLive))) {
      await this.driver.click(by.id(ID.startLive));
      await sleep(800);
      await this.closePopups();
    }
  }

  protected async waitUntilStartLiveFlow(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.isActivity(ACT.chooseRoom)) return;
      if (await this.isActivity(ACT.chooseGame)) return;
      if (await this.isActivity(ACT.editInfo)) return;
      // 权限引导仍在处理
      if (await this.driver.exists(by.id(ID.openAllPermission))) {
        await this.driver.click(by.id(ID.openAllPermission));
        await sleep(500);
        continue;
      }
      await sleep(400);
    }
    throw new Error(
      `点击开播后未进入选房/编辑页，当前 Activity: ${this.activity || '(未知)'}`,
    );
  }

  protected async firstPersonalRoomCover(): Promise<Locator | null> {
    // 个人直播间列表 = gameListView；官方列表 = rv_entertainment
    const inMyList = by.xpath(
      `//*[@resource-id='${ID.myRoomList}']//*[@resource-id='${ID.roomCover}']`,
    );
    if (await this.driver.exists(inMyList)) return inMyList;
    if (await this.driver.exists(by.id(ID.roomCover))) return by.id(ID.roomCover);
    return null;
  }

  protected async pickFirstLiveCategory(): Promise<void> {
    await this.waitForActivity(ACT.chooseGame, 8_000);
    // 优先点娱乐品类，否则游戏品类第一项
    const entertainmentItem = by.xpath(
      `(//*[@resource-id='${ID.entertainmentList}']//*[@resource-id='${ID.skillLogo}' or @resource-id='${ID.skillName}'])[1]`,
    );
    const gameItem = by.xpath(
      `(//*[@resource-id='${ID.gameList}']//*[@resource-id='${ID.skillLogo}' or @resource-id='${ID.skillName}'])[1]`,
    );
    if (await this.driver.exists(entertainmentItem)) {
      await this.driver.click(entertainmentItem);
    } else if (await this.driver.exists(gameItem)) {
      await this.driver.click(gameItem);
    } else {
      throw new Error('直播品类页未找到可选品类');
    }
    await sleep(800);
  }
}

await new LiveAndroidLiteTest().execute();
