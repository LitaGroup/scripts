/**
 * 直播冒烟（Android / Lite）— Live 列表进房发消息 + 开播关播
 *
 * 前置：
 *   1. Lita 账号已登录（脚本会 ensure 登录），当前在一级页面
 *   2. 账号具备开播资格（Live 页右上角 startLiveIV 可见；开播段需要）
 *   3. 权限弹窗一律允许（autoGrant + LivePermissionDialog「全部打开」+ 系统 Allow）
 *
 * 步骤：
 *   A. 进房发消息
 *      1. 底部语音房 → Live Tab
 *      2. 展示列表中点免密直播间进入
 *      3. 点输入框输入任意内容 → 发送 → 公屏回显
 *   B. 开播关播（原流程）
 *      1. Live 页右上角开播 → 选个人房封面 → 相机 → 开始直播
 *      2. 关播（img_more）→ 确认结束
 *
 * 运行：
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
 *     SCRIPT_CONFIG=config.app.json \
 *     node projects/app/android-lite/live.android.lite.test.ts
 */
import { hostname } from 'node:os';
import http from 'node:http';
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
 * Appium 建连：与 voice-room 同一套。
 * 先探 127.0.0.1（执行机本机 Appium）；局域网 IP 仅作 env 指定或次选，避免不可达 IP 把探测/建连卡死。
 */
function normalizeAppiumBase(raw: string): string {
  let u = raw.trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  u = u.replace(/^(https?:\/\/)localhost(?=[:/]|$)/i, '$1127.0.0.1');
  if (!u.endsWith('/')) u += '/';
  return u;
}

/** 短超时 HTTP 探测，不可达地址最多卡 ~1.5s，避免「一直卡住」 */
function probeAppium(url: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const u = new URL('status', url);
      const req = http.request(
        {
          hostname: u.hostname === 'localhost' ? '127.0.0.1' : u.hostname,
          port: Number(u.port || 4723),
          path: `${u.pathname}${u.search}`,
          method: 'GET',
          family: 4,
          timeout: timeoutMs,
        },
        (res) => {
          res.resume();
          resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300);
        },
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.on('error', () => resolve(false));
      req.end();
    } catch {
      resolve(false);
    }
  });
}

async function resolveReachableAppiumUrl(): Promise<string> {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const add = (raw?: string) => {
    const n = normalizeAppiumBase(raw ?? '');
    if (n && !seen.has(n)) {
      seen.add(n);
      candidates.push(n);
    }
  };
  // env 优先；本机 127.0.0.1 先于局域网 IP（不可达时会拖死）
  add(process.env.SCRIPT_APPIUM_URL);
  add(process.env.APPIUM_URL);
  add(process.env.APPIUM_HOST);
  add('http://127.0.0.1:4723/');
  add('http://10.20.0.157:4723/');
  add('http://172.20.1.79:4723/');

  process.stdout.write(
    `[log] 执行机 hostname=${hostname()} cwd=${process.cwd()} SCRIPT_APPIUM_URL=${process.env.SCRIPT_APPIUM_URL ?? '(未设)'} APPIUM_HOST=${process.env.APPIUM_HOST ?? '(未设)'}\n`,
  );

  const failed: string[] = [];
  for (const u of candidates) {
    if (await probeAppium(u)) {
      process.stdout.write(`[log] Appium 可用: ${u}\n`);
      return u;
    }
    failed.push(u);
  }
  const msg =
    `Appium 探测失败: ${failed.join(' , ')}。` +
    `执行机=${hostname()}。请把直播任务改到与语音房相同的 Agent（本机有 Appium），` +
    `或设置 SCRIPT_APPIUM_URL 为该 Agent 能访问的地址。`;
  process.stdout.write(`[log] ${msg}\n`);
  throw new Error(msg);
}

process.env.SCRIPT_APPIUM_URL = await resolveReachableAppiumUrl();

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
  /** Live 列表 */
  roomList: id('roomListRecyclerView'),
  liveCover: id('liveCoverView'),
  roomListEmpty: id('roomListEmptyView'),

  // LivePermissionDialog
  openAllPermission: id('tv_open_all_permission'),
  permissionDialogClose: id('iv_close'),

  // EnterPasswordDialog — 加密房
  passwordField: id('password'),
  passwordClose: id('img_close'),

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

  // VideoRoomTopFragment — 房主时 img_more = 关播；观众时弹出 More 菜单
  closeLive: id('img_more'),
  roomName: id('roomNameTv'),
  roomId: id('roomIdTv'),
  liveTime: id('liveTimeTv'),
  /** MoreMenuPopWindow — 观众退出 */
  exitRoom: id('tv_exit'),
  exitRoomIcon: id('img_exit'),
  floatLeave: id('tv_leave'),
  floatStay: id('tv_stay'),

  // VideoRoomBottomFragment — 公屏
  chatEntry: id('tv_input_text'),
  chatEntryBg: id('input_view_bg'),
  chatInput: id('input_view'),
  chatContent: id('tv_content'),
  chatList: id('rv_message'),

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

  /** 进房后发送的公屏文案（唯一，便于回显校验） */
  protected readonly chatMessage = `live-msg-${Date.now().toString().slice(-6)}`;

  constructor() {
    super('android', 'lite');
    // 登录 → Live → 列表进房发消息 → 开播 → 选房 → 相机 → 开始 → 关播
    this.total = 17;
    this.registerLiveStates();
  }

  /** 建连与语音房一致：用模块加载时已探测的 SCRIPT_APPIUM_URL */
  protected async run(): Promise<void> {
    await this.act(`创建 Appium 会话 (${this.platform}/${this.flavor}/${this.env})`, async () => {
      this.log(`Appium: ${process.env.SCRIPT_APPIUM_URL} hostname=${hostname()}`);
      await this.driver.createSession(this.capabilities());
      await this.activateApp();
    });
    if (!this.driver.isActive) {
      throw new Error(
        'Appium 会话未创建。127.0.0.1 是跑 node 的电脑，不是手机。请确认直播任务与语音房任务的执行机/Agent 是同一台（装 Appium 的那台）。',
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

    // ---------- A. Live 列表进房并发消息 ----------
    await this.check('可以展示直播间列表', async () => {
      const deadline = Date.now() + 15_000;
      let listVisible = false;
      let coverCount = 0;
      while (Date.now() < deadline) {
        await this.closePopups();
        await this.ensureLiveSubTab();
        listVisible = await this.driver.exists(by.id(ID.roomList));
        coverCount = (await this.driver.findElements(by.id(ID.liveCover))).length;
        if (listVisible && coverCount > 0) break;
        // 空态也算「列表页已出」但后续无法进房
        if (listVisible && (await this.driver.exists(by.id(ID.roomListEmpty)))) break;
        await sleep(400);
      }
      return {
        expect: 'roomListRecyclerView + liveCoverView',
        real: `list=${listVisible} covers=${coverCount}`,
        pass: !!(listVisible && coverCount > 0),
        message: coverCount <= 0 ? 'Live 列表无在播房间，无法进房发消息' : undefined,
      };
    });

    await this.act('点击免密直播间进入', async () => {
      await this.enterUnlockedLiveFromList();
    });

    await this.check('可以进入直播间', async () => {
      const inRoom = await this.isActivity(VIDEO_ROOM_ACTIVITY);
      const deadline = Date.now() + 10_000;
      let chatReady = false;
      while (Date.now() < deadline) {
        await this.closePopups();
        if (
          (await this.driver.exists(by.id(ID.chatEntry))) ||
          (await this.driver.exists(by.id(ID.chatEntryBg))) ||
          (await this.driver.exists(by.id(ID.roomName)))
        ) {
          chatReady = true;
          break;
        }
        await sleep(400);
      }
      return {
        expect: 'VideoRoomActivity + 底部输入区',
        real: `inRoom=${inRoom} chatReady=${chatReady}`,
        pass: !!(inRoom && chatReady),
      };
    });

    await this.act(`点击输入框并输入：${this.chatMessage}`, async () => {
      await this.openLiveChatInput();
      await this.driver.input(by.id(ID.chatInput), this.chatMessage);
      await sleep(300);
    });

    await this.act('点击发送', async () => {
      await this.driver.performEditorAction('send');
      await sleep(800);
    });

    await this.check('发送消息后消息区域正常展示发送内容', async () => {
      const found = await this.hasLiveChatMessage(this.chatMessage, 8_000);
      return {
        expect: `公屏含 "${this.chatMessage}"`,
        real: found ? '已找到' : '未找到消息气泡',
        pass: found,
      };
    });

    await this.act('退出直播间（观众 More → Exit）', async () => {
      await this.leaveAudienceLiveRoom();
    });

    // ---------- B. 开播 → 关播（原流程） ----------
    await this.act('点击右上角开播按钮', async () => {
      // 退房后可能不在 Live Tab，先确保回到 Live 页
      if (!(await this.driver.exists(by.id(ID.startLive)))) {
        await this.openVoiceRoomLiveTab();
      }
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

  /** Live 列表依次尝试封面：遇密码弹窗则关闭换下一个，直到进入 VideoRoom */
  protected async enterUnlockedLiveFromList(maxAttempts = 8): Promise<void> {
    await this.waitForElement(by.id(ID.roomList), '直播间列表 roomListRecyclerView', 15_000);

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.closePopups();
      if (await this.isActivity(VIDEO_ROOM_ACTIVITY)) {
        this.log('已在直播间，无需再点列表');
        return;
      }

      const covers = await this.driver.findElements(by.id(ID.liveCover));
      const total = covers.length;
      if (total <= 0) {
        // 下滑换一批
        if (await this.driver.exists(by.id(ID.roomList))) {
          await this.driver.swipeInElement(by.id(ID.roomList), 'up');
          await sleep(800);
        }
        lastError = new Error('Live 列表无 liveCoverView');
        continue;
      }

      const index = ((attempt - 1) % total) + 1;
      const cover = by.xpath(`(//*[@resource-id='${ID.liveCover}'])[${index}]`);
      this.log(`尝试进房 attempt=${attempt}/${maxAttempts} cover=${index}/${total}`);
      try {
        await this.driver.click(cover);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        continue;
      }
      await sleep(1_200);

      if (await this.isPasswordDialogVisible()) {
        this.log('该房需密码，关闭弹窗换下一个');
        await this.dismissPasswordDialog();
        lastError = new Error('点到加密房');
        // 略下滑避免一直点同一批
        if (attempt % 3 === 0 && (await this.driver.exists(by.id(ID.roomList)))) {
          await this.driver.swipeInElement(by.id(ID.roomList), 'up');
          await sleep(600);
        }
        continue;
      }

      const entered = await this.waitEnteredLiveRoom(18_000);
      if (entered) {
        this.log('已进入免密直播间');
        return;
      }

      if (await this.isPasswordDialogVisible()) {
        await this.dismissPasswordDialog();
        lastError = new Error('进房过程弹出密码框');
        continue;
      }
      lastError = new Error(`点击后未进入 VideoRoomActivity，当前: ${this.activity || '(未知)'}`);
    }

    throw lastError ?? new Error('未能进入免密直播间');
  }

  protected async waitEnteredLiveRoom(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.isPasswordDialogVisible()) return false;
      if (await this.isActivity(VIDEO_ROOM_ACTIVITY)) {
        // 等底部输入区就绪
        if (
          (await this.driver.exists(by.id(ID.chatEntry))) ||
          (await this.driver.exists(by.id(ID.chatEntryBg))) ||
          (await this.driver.exists(by.id(ID.roomName)))
        ) {
          return true;
        }
      }
      await sleep(400);
    }
    return await this.isActivity(VIDEO_ROOM_ACTIVITY);
  }

  protected async isPasswordDialogVisible(): Promise<boolean> {
    if (await this.driver.exists(by.id(ID.passwordField))) return true;
    const titles = await resolveAndroidStrings(this, ['chat_room_private_room4']);
    for (const t of titles) {
      if (t && (await this.driver.exists(by.textContains(t.slice(0, Math.min(16, t.length)))))) {
        return true;
      }
    }
    return false;
  }

  protected async dismissPasswordDialog(): Promise<void> {
    const closeNearPassword = by.xpath(
      `//*[@resource-id='${ID.passwordField}']/..//*[@resource-id='${ID.passwordClose}']`,
    );
    if (await this.driver.exists(closeNearPassword)) {
      await this.driver.click(closeNearPassword);
    } else if (await this.driver.exists(by.id(ID.passwordClose))) {
      await this.driver.click(by.id(ID.passwordClose));
    } else {
      await this.driver.back();
    }
    await sleep(600);
  }

  /** 打开直播间公屏输入框（tv_input_text / input_view_bg → input_view） */
  protected async openLiveChatInput(): Promise<void> {
    if (!(await this.isActivity(VIDEO_ROOM_ACTIVITY))) {
      throw new Error(`打开输入框前不在 VideoRoomActivity，当前: ${this.activity || '(未知)'}`);
    }
    let opened = false;
    for (let i = 0; i < 3 && !opened; i++) {
      await this.closePopups();
      if (await this.driver.exists(by.id(ID.chatEntry))) {
        await this.driver.click(by.id(ID.chatEntry));
      } else if (await this.driver.exists(by.id(ID.chatEntryBg))) {
        await this.driver.click(by.id(ID.chatEntryBg));
      } else {
        throw new Error('直播间未找到输入入口 tv_input_text / input_view_bg');
      }
      opened = await this.driver.waitFor(by.id(ID.chatInput), 3_500, 300);
      if (!opened) await sleep(300);
    }
    if (!opened) throw new Error('无法打开公屏输入框 input_view');
    await this.driver.click(by.id(ID.chatInput));
    await sleep(200);
  }

  protected async hasLiveChatMessage(message: string, timeoutMs = 6_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const candidates: Locator[] = [
      by.xpath(
        `//*[@resource-id='${ID.chatContent}' and contains(@text,${JSON.stringify(message)})]`,
      ),
      by.textContains(message),
    ];
    while (Date.now() < deadline) {
      for (const c of candidates) {
        if (await this.driver.exists(c)) return true;
      }
      // 新消息提示条
      if (await this.driver.exists(by.id(id('tv_new_message')))) {
        try {
          await this.driver.click(by.id(id('tv_new_message')));
          await sleep(400);
        } catch {
          // ignore
        }
      }
      await sleep(400);
    }
    return false;
  }

  /**
   * 观众退出：顶部 img_more → MoreMenu → Exit（tv_exit）。
   * 顶部/底部都有 img_more，优先点能弹出 Exit 菜单的那一个。
   */
  protected async leaveAudienceLiveRoom(): Promise<void> {
    if (!(await this.isActivity(VIDEO_ROOM_ACTIVITY))) {
      this.log('已不在直播间，跳过退出');
      return;
    }

    const moreButtons = await this.driver.findElements(by.id(ID.closeLive));
    this.log(`img_more 数量=${moreButtons.length}，尝试打开退出菜单`);

    let menuOpened = false;
    for (let i = 1; i <= Math.max(moreButtons.length, 1); i++) {
      const more = by.xpath(`(//*[@resource-id='${ID.closeLive}'])[${i}]`);
      if (!(await this.driver.exists(more))) continue;
      try {
        await this.driver.click(more);
      } catch {
        continue;
      }
      await sleep(600);
      if (
        (await this.driver.exists(by.id(ID.exitRoom))) ||
        (await this.driver.exists(by.id(ID.exitRoomIcon)))
      ) {
        menuOpened = true;
        break;
      }
      // 可能点到房主关播确认或底部工具栏：取消/返回
      if (await this.driver.exists(by.id(ID.negative))) {
        await this.driver.click(by.id(ID.negative));
        await sleep(400);
      } else {
        await this.driver.back();
        await sleep(400);
      }
    }

    if (!menuOpened) {
      // 兜底：系统返回 → 若浮窗权限弹窗出现则点 leave 无效，再试 back
      this.log('未打开 Exit 菜单，尝试 back 离开');
      await this.driver.back();
      await sleep(600);
      if (await this.driver.exists(by.id(ID.floatLeave))) {
        // tv_leave 仅关弹窗不退房；有悬浮窗权限时 back 会 finish
        await this.driver.click(by.id(ID.floatLeave));
        await sleep(400);
      }
    } else {
      if (await this.driver.exists(by.id(ID.exitRoom))) {
        await this.driver.click(by.id(ID.exitRoom));
      } else {
        await this.driver.click(by.id(ID.exitRoomIcon));
      }
      await sleep(1_000);
    }

    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (!(await this.isActivity(VIDEO_ROOM_ACTIVITY))) {
        this.log('已退出直播间');
        await this.closePopups();
        return;
      }
      if (await this.driver.exists(by.id(ID.floatLeave))) {
        await this.driver.click(by.id(ID.floatLeave));
        await sleep(400);
      }
      await sleep(400);
    }
    throw new Error(`退出直播间失败，仍在: ${this.activity || '(未知)'}`);
  }
}

await new LiveAndroidLiteTest().execute();
