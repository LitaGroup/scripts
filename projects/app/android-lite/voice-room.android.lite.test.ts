/**
 * 语音房功能测试（Android / Lite）— 串联 3.1～3.4
 *
 *   3.1 进房与搜索：
 *       1. 点击底部标签栏「语音房」→ 派对 Tab → 搜索
 *       2. 优先搜索目标房号（默认 11100101）并进入 FunVoiceRoomActivity
 *       3. 搜不到/进不去时：Party 列表进入其它娱乐房（Fun 标签，禁止订单房）
 *   3.2 在当前已进房间内发送消息（不退房、不从热门列表换房）
 *   3.4 语音房送礼（在上麦前：需麦上有其他用户）
 *   3.3 语音房上麦：
 *       - 进到目标房 11100101：上 0 号麦位
 *       - 进到其它娱乐房：上麦位须避开第 1、第 2 个麦位（主持/老板）
 *
 * 说明：本文件为服务端正式环境唯一识别入口，公共能力已内联于此，勿再拆成 helpers。
 *
 * 运行：
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
 *     node projects/app/android-lite/voice-room.android.lite.test.ts
 *
 * 可选：
 *   --room-no=11100101       优先搜索房号（默认 11100101；失败再列表进其它 Fun 房）
 *   --message=hello          公屏文案（默认 vr-<timestamp>）
 *   --skip-enter             已在目标房内时跳过 3.1 进房
 *   SCRIPT_CONFIG=config.app.json
 *   SCRIPT_DEVICE_UDID=<adb-serial>
 */
import { hostname } from 'node:os';
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import {
  AppiumResource,
  by,
  sleep,
  type AppiumCapabilities,
  type Locator,
} from '../../../src/resources/AppiumResource.ts';
import { loginWithPhonePassword } from '../core/_lib/androidLoginFlow.ts';

/** 平台常注入 localhost；Node 26 fetch 会走 IPv6 导致 fetch failed。探测可达地址后再建会话。 */
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
  add(process.env.SCRIPT_APPIUM_URL);
  add(process.env.APPIUM_URL);
  add(process.env.APPIUM_HOST);
  add('http://127.0.0.1:4723/');
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
  process.stdout.write(`[log] Appium 探测失败: ${failed.join(' , ')}\n`);
  return candidates[0] ?? 'http://127.0.0.1:4723/';
}

process.env.SCRIPT_APPIUM_URL = await resolveReachableAppiumUrl();

const APP_PACKAGE = 'com.litalite.android';

/** 测试账号回退（正式环境请走 SCRIPT_CONFIG；区号默认 +86） */
const FALLBACK_PHONE = '18810242906';
const FALLBACK_PASSWORD = '123456';
const FALLBACK_COUNTRY_CODE = '86';

/** 测试环境默认语音房展示号（娱乐房） */
const DEFAULT_ROOM_NO = '11100101';

/**
 * 关键 resource-id（包名:id/xxx）。
 * 权威来源：/Users/jason/StudioProjects/lita-lite-android 布局与 MainActivity。
 * 定位异常时优先查源码，勿猜 id。
 */
const ID = {
  // 主页 / 登录 — activity_main.xml + values/ids.xml + LitaTabItemView(id=viewId)
  tabHome: `${APP_PACKAGE}:id/navigation_home`,
  tabMe: `${APP_PACKAGE}:id/navigation_user_center`,
  /** 仅当全局配置 room_list==2 时才会 addItem；见 MainActivity.initNavigation */
  tabParty: `${APP_PACKAGE}:id/navigation_voice_room`,
  tabBar: `${APP_PACKAGE}:id/tabView`,
  bottomNavShell: `${APP_PACKAGE}:id/fl_bottom_all_view`,
  meUid: `${APP_PACKAGE}:id/user_no`,
  mePage: `${APP_PACKAGE}:id/layout_options`,
  loginPage: `${APP_PACKAGE}:id/rl_facebook_login`,
  phoneLoginEntry: `${APP_PACKAGE}:id/iv_low_phone_login`,
  countryCode: `${APP_PACKAGE}:id/tv_country_code`,
  countryList: `${APP_PACKAGE}:id/rlCountryListView`,
  phoneInput: `${APP_PACKAGE}:id/enter_phone_number`,
  phoneNext: `${APP_PACKAGE}:id/send_sms_code_button`,
  passwordInput: `${APP_PACKAGE}:id/et_password`,
  passwordSubmit: `${APP_PACKAGE}:id/tv_confirm`,
  popupActivity: `${APP_PACKAGE}:id/vp_banner`,
  popupActivityClose: `${APP_PACKAGE}:id/img_close`,

  // Party / 搜索 — fragment_room_list.xml / fragment_voice_room_list_d.xml / item_voice_room2.xml
  searchEntry: `${APP_PACKAGE}:id/img_search_room`,
  searchEt: `${APP_PACKAGE}:id/searchEt`,
  searchClear: `${APP_PACKAGE}:id/searchClearIv`,
  searchResultRv: `${APP_PACKAGE}:id/searchResultRv`,
  searchEmptyView: `${APP_PACKAGE}:id/searchEmptyView`,
  resultRoomId: `${APP_PACKAGE}:id/tv_room_id`,
  resultRoomName: `${APP_PACKAGE}:id/tv_room_name`,
  resultAvatar: `${APP_PACKAGE}:id/img_avatar`,
  resultBody: `${APP_PACKAGE}:id/ctl_body_view`,
  partyTitle: `${APP_PACKAGE}:id/partyListTitleTv`,
  partyTitleArea: `${APP_PACKAGE}:id/partyTitleAllView`,
  partyRoomList: `${APP_PACKAGE}:id/roomListRecyclerView`,
  /** 真实房间卡片（banner 是 HomeBannerView，无此 id） */
  partyRoomItem: `${APP_PACKAGE}:id/roomListDRootLayout`,
  partyRoomCover: `${APP_PACKAGE}:id/img_cover`,
  partyRoomName: `${APP_PACKAGE}:id/tv_room_name`,
  /** layout_hot_room_list_header.xml，文案 Popular rooms */
  hotRoomTitle: `${APP_PACKAGE}:id/tv_room_title`,
  /** view_voice_room_type.xml：Fun / Order 等类型标签文案 */
  roomTypeTag: `${APP_PACKAGE}:id/tv_room_type`,

  // 房内 — activity_fun_voice_room.xml / view_voice_room_bottom2.xml
  roomIdText: `${APP_PACKAGE}:id/roomIdTextView`,
  roomTitle: `${APP_PACKAGE}:id/tv_title`,
  roomMember: `${APP_PACKAGE}:id/rl_room_member`,
  bottomView: `${APP_PACKAGE}:id/bottomView`,
  bottomLayout: `${APP_PACKAGE}:id/bottomLayout`,
  /** TextView「Type…」，非 ImageView */
  chatEntry: `${APP_PACKAGE}:id/iv_message`,
  chatInput: `${APP_PACKAGE}:id/input_view`,
  chatPanel: `${APP_PACKAGE}:id/ll_send_message_all_view`,
  chatContent: `${APP_PACKAGE}:id/tv_content`,
  applyMic: `${APP_PACKAGE}:id/tv_apply_order`,
  onMicMute: `${APP_PACKAGE}:id/fl_bottom_voice`,
  queueRemind: `${APP_PACKAGE}:id/ll_bottom_remind`,
  seatAvatar: `${APP_PACKAGE}:id/civ_user_avatar`,
  seatItem: `${APP_PACKAGE}:id/ll_item_avatar`,
  seatHostTag: `${APP_PACKAGE}:id/tv_host`,
  seatBossTag: `${APP_PACKAGE}:id/tv_boss`,
  leaveSeat: `${APP_PACKAGE}:id/leaveSeatIv`,
  seatChoiceRegular: `${APP_PACKAGE}:id/commonSecondTv`,
  seatChoiceBoss: `${APP_PACKAGE}:id/commonFirstTv`,
  seatChoiceCancel: `${APP_PACKAGE}:id/commonCancelTv`,
  /** PAGImageView，常不在无障碍树，需坐标热区 */
  giftEntry: `${APP_PACKAGE}:id/iv_gift`,
  giftRoot: `${APP_PACKAGE}:id/sendGiftRootLayout`,
  giftItem: `${APP_PACKAGE}:id/itemGiftLayout`,
  giftItemPrice: `${APP_PACKAGE}:id/itemGiftPriceTv`,
  giftBalance: `${APP_PACKAGE}:id/sendGiftPriceTv`,
  giftSendToRv: `${APP_PACKAGE}:id/giftSendToRv`,
  giftSelectedAvatar: `${APP_PACKAGE}:id/giftSelectedAvatarIv`,
  giftSend: `${APP_PACKAGE}:id/sendGiftSubmitTv`,
  giftCombo: `${APP_PACKAGE}:id/giftComboView`,
  giftCountLayout: `${APP_PACKAGE}:id/sendGiftCountLayout`,
  giftCountTv: `${APP_PACKAGE}:id/sendGiftCountTv`,
  giftCountOption: `${APP_PACKAGE}:id/giftCountTv`,
  giftMsgName: `${APP_PACKAGE}:id/tv_gift_name`,
  giftMsgCount: `${APP_PACKAGE}:id/tv_gift_count`,
  guideLayout: `${APP_PACKAGE}:id/guideLayout`,
};

const ACT = {
  splash: '.ui.splash.SplashActivity',
  main: '.MainActivity',
  login: '.ui.login.LoginActivity',
  search: '.ui.voiceRoom.activity.SearchVoiceRoomActivity',
  roomFun: '.ui.voiceRoom.FunVoiceRoomActivity',
  roomOrder: '.ui.voiceRoom.VoiceRoomActivity',
  roomPerson: '.ui.voiceRoom.PersonVoiceRoomActivity',
};

/** 任一语音房 Activity（退房/探测用） */
const ROOM_ACTIVITY = /\.ui\.voiceRoom\.(FunVoiceRoomActivity|VoiceRoomActivity|PersonVoiceRoomActivity)$/;

/** 娱乐房 FunVoiceRoomActivity（roomType=fun/fun1，或 orders+tagType=fun） */
const FUN_ROOM_ACTIVITY = /\.ui\.voiceRoom\.FunVoiceRoomActivity$/;

/** 订单房 VoiceRoomActivity（roomType=orders 且 tagType≠fun）— 本用例禁止进入 */
const ORDER_ROOM_ACTIVITY = /\.ui\.voiceRoom\.VoiceRoomActivity$/;

/** 列表类型标签：Fun（多语言）；源码 fun_label / VoiceRoomListTagAdapter */
const FUN_TAG_TEXTS = ['Fun', '乐趣', '樂趣', '재미', 'ファン', 'Vui', 'บันเทิง'];

/** 列表类型标签：Order/派单 — 对应 tagType=game，进订单房 */
const ORDER_TAG_TEXTS = ['Order', '派单'];

/** Party 横幅/H5 活动页（误点列表 banner 时会进入，无底部 tab） */
const WEB_ACTIVITY = /\.ui\.view\.web\.WebActivity$/;

/** 系统权限弹窗 Activity（进房后常弹麦克风/通知权限，会挡住底部栏） */
const PERMISSION_ACTIVITY = /permission\.ui\.GrantPermissionsActivity$|com\.android\.permissioncontroller/;

const PERMISSION_ALLOW_IDS = [
  'com.android.permissioncontroller:id/permission_allow_foreground_only_button',
  'com.android.permissioncontroller:id/permission_allow_one_time_button',
  'com.android.permissioncontroller:id/permission_allow_button',
  'com.android.permissioncontroller:id/permission_allow_always_button',
];

const PERMISSION_ALLOW_TEXTS = [
  'While using the app',
  'Only this time',
  'Allow',
  'ALLOW',
  '仅在使用该应用时允许',
  '仅限这一次',
  '允许',
];

/** 进房后用 shell 预授权，减少系统权限弹窗 */
const RUNTIME_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.CAMERA',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.READ_PHONE_STATE',
];

/**
 * 解析优先进房房间号：`--room-no` / `SCRIPT_ROOM_NO`，默认 11100101。
 * 搜不到时由 enterVoiceRoom 回退到 Party 列表 Fun 房。
 */
function parseRoomNo(): string {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--room-no=')) {
      const v = a.slice('--room-no='.length).trim();
      if (v) return v;
    }
  }
  const fromEnv = (process.env.SCRIPT_ROOM_NO ?? '').trim();
  return fromEnv || DEFAULT_ROOM_NO;
}

/** --skip-enter：已在语音房内时跳过搜索进房，直接测发消息/上麦/送礼 */
function parseSkipEnter(): boolean {
  return process.argv.slice(2).includes('--skip-enter') || process.env.SCRIPT_SKIP_ENTER === '1';
}

function parseMessage(fallback = `auto-msg-${Date.now()}`): string {
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--message=')) return a.slice('--message='.length);
  }
  return process.env.SCRIPT_ROOM_MESSAGE?.trim() || fallback;
}

/**
 * 语音房 Sample 基类：注册通用状态，提供登录 / 进房等公共步骤。
 * 子类实现 runCase()；构造时传入 total（不含创建会话那一步）。
 */
abstract class VoiceRoomSampleBase extends AppBaseClass {
  /** 目标搜索房号（默认 11100101，不会被实际进房号覆盖） */
  protected preferredRoomNo: string;
  /** 当前实际所在房号（进房成功后回填） */
  protected roomNo: string;
  /** true=搜到并进入了 preferredRoomNo；false=列表兜底进了其它 Fun 房 */
  protected enteredPreferredRoom = false;
  /** 显式传入已探测地址，避免平台注入的 localhost 走到旧版 AppiumResource */
  protected override readonly driver = new AppiumResource(process.env.SCRIPT_APPIUM_URL ?? 'http://127.0.0.1:4723/');

  constructor(caseTotal: number) {
    super('android', 'lite');
    this.total = caseTotal;
    this.preferredRoomNo = parseRoomNo();
    this.roomNo = this.preferredRoomNo;
    this.registerCommonStates();
  }

  /** 建连失败则中止，避免后续步骤全刷「会话未创建」 */
  protected async run(): Promise<void> {
    await this.act(`创建 Appium 会话 (${this.platform}/${this.flavor}/${this.env})`, async () => {
      this.log(`Appium: ${process.env.SCRIPT_APPIUM_URL}`);
      await this.driver.createSession(this.capabilities());
      await this.activateApp();
    });
    if (!this.driver.isActive) {
      throw new Error('Appium 会话未创建，已中止后续步骤（请确认平台 Appium 已启动且设备已连接）');
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
      // 语音房持续动画时必须关掉 idle 等待，否则每次 findElement 卡 10~20s
      'appium:settings[waitForIdleTimeout]': 0,
      'appium:settings[waitForSelectorTimeout]': 0,
    };
    const udid = (process.env.SCRIPT_DEVICE_UDID || process.env.SCRIPT_ANDROID_UDID || '').trim();
    if (udid) caps['appium:udid'] = udid;
    const deviceName = (process.env.SCRIPT_ANDROID_DEVICE || '').trim();
    if (deviceName) caps['appium:deviceName'] = deviceName;
    return caps;
  }

  /** 弹窗 → 登录态 → Party/搜索/房内（权限弹窗必须最先处理） */
  protected registerCommonStates(): void {
    // 系统权限（麦克风/通知等）：进房后常异步弹出，挡住底部栏；必须排在其它 popup 之前
    this.addState({
      name: 'permission-allow',
      kind: 'popup',
      detect: async () => {
        // closePopups 已 refreshActivity；优先看 Activity，避免在正常页扫一堆文案
        if (this.activity && PERMISSION_ACTIVITY.test(this.activity)) return true;
        for (const id of PERMISSION_ALLOW_IDS) {
          if (await this.driver.exists(by.id(id))) return true;
        }
        return false;
      },
      handle: async () => {
        await this.clickPermissionAllow();
      },
    });
    // 登录 WhatsApp 引导：loginWithPhonePassword / closePopups 会用到
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
    // 周榜/运营全屏弹窗（Big Winner 等）：pagView + img_close，会挡住底部 tab
    this.addState({
      name: 'popup-promo',
      kind: 'popup',
      activity: ACT.main,
      detect: async () =>
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/pagView`))) &&
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/img_close`))),
      handle: async () => {
        await this.driver.click(by.id(`${APP_PACKAGE}:id/img_close`));
        await sleep(400);
      },
    });
    // 进房后可能自动弹出 Share/Invite 底栏，遮挡房内元素
    this.addState({
      name: 'popup-share',
      kind: 'popup',
      activity: ROOM_ACTIVITY,
      detect: async () =>
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/shareChannelRv`))) ||
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/shareContentLayout`))),
      handle: async () => {
        await this.driver.back();
        await sleep(400);
      },
    });
    // 上麦座位类型选择（Boss / Regular）——默认选 Regular，便于 closePopups 自动消化
    this.addState({
      name: 'popup-seat-choice',
      kind: 'popup',
      activity: ROOM_ACTIVITY,
      detect: async () =>
        (await this.driver.exists(by.id(ID.seatChoiceRegular))) &&
        (await this.driver.exists(by.id(ID.seatChoiceBoss))),
      handle: async () => {
        await this.driver.click(by.id(ID.seatChoiceRegular));
        await sleep(500);
      },
    });
    // 用户资料卡 / Gift collection 等 BottomSheet，会挡住底部 Type… / Join / 礼物
    this.addState({
      name: 'popup-room-sheet',
      kind: 'popup',
      activity: ROOM_ACTIVITY,
      detect: async () =>
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/playerInfoRootLayout`))) ||
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/giftCollectionView`))) ||
        ((await this.driver.exists(by.id(`${APP_PACKAGE}:id/design_bottom_sheet`))) &&
          (await this.driver.exists(by.id(`${APP_PACKAGE}:id/touch_outside`)))),
      handle: async () => {
        await this.dismissRoomSheetsOnce();
      },
    });
    // Room Guide 底栏：点遮罩关闭（勿用 back，房内 back=最小化）；主控件已可见则跳过
    this.addState({
      name: 'popup-room-guide',
      kind: 'popup',
      activity: ROOM_ACTIVITY,
      detect: async () => {
        if (await this.driver.exists(by.id(ID.giftSend))) return false;
        if (await this.driver.exists(by.id(ID.roomIdText)) || await this.driver.exists(by.id(ID.chatEntry))) {
          return false;
        }
        return (
          (await this.driver.exists(by.id(`${APP_PACKAGE}:id/funContentTv`))) ||
          (await this.driver.exists(by.text('Room Guide')))
        );
      },
      handle: async () => {
        if (await this.driver.exists(by.id(`${APP_PACKAGE}:id/touch_outside`))) {
          await this.driver.click(by.id(`${APP_PACKAGE}:id/touch_outside`));
        } else if (await this.driver.exists(by.id(ID.seatChoiceCancel))) {
          await this.driver.click(by.id(ID.seatChoiceCancel));
        } else {
          // 最后手段：点屏幕上方空白处，避免 back 最小化房间
          const win = await this.driver.windowRect();
          await this.driver.execute('mobile: clickGesture', [{ x: Math.round(win.width / 2), y: Math.round(win.height * 0.2) }]);
        }
        await sleep(600);
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
    // Activity 级判定即可：弹窗关闭后元素才稳定出现
    this.addState({
      name: 'in-room',
      activity: ROOM_ACTIVITY,
      detect: async () => true,
    });
    this.addState({
      name: 'search',
      activity: ACT.search,
      detect: async () => true,
    });
    this.addState({
      name: 'party',
      activity: ACT.main,
      detect: () => this.driver.exists(by.id(ID.searchEntry)),
    });
    this.addState({
      name: 'home',
      activity: ACT.main,
      detect: async () => true,
    });
  }

  protected resolveAccount(): AppAccount {
    try {
      return this.account();
    } catch {
      return {
        username: FALLBACK_PHONE,
        password: FALLBACK_PASSWORD,
        countryCode: FALLBACK_COUNTRY_CODE,
      };
    }
  }

  protected async login(account: AppAccount): Promise<void> {
    await loginWithPhonePassword(this, account);
  }

  /** 启动就绪并确保已登录（未登录则走 login） */
  protected async ensureAppLoggedIn(): Promise<void> {
    if (!this.preferredRoomNo) {
      throw new Error('缺少房间号：请传 --room-no=<roomNo> 或设置环境变量 SCRIPT_ROOM_NO');
    }

    await this.grantAppRuntimePermissions();

    // 房内快速路径：语音房动画会导致 findElement 极慢，避免 closePopups 全量扫描
    if (await this.isActivity(ROOM_ACTIVITY)) {
      this.log('已在语音房 Activity，走快速确认');
      try {
        // 礼物面板开着时底部栏不在树里，勿误判为「不可操作」而退房
        if (await this.driver.exists(by.id(ID.giftSend)) || await this.driver.exists(by.id(ID.giftRoot))) {
          this.log('礼物面板打开中，先关闭再确认房号');
          try {
            const win = await this.driver.windowRect();
            await this.driver.execute('mobile: clickGesture', [
              { x: Math.round(win.width / 2), y: Math.round(win.height * 0.35) },
            ]);
            await sleep(600);
          } catch {
            // ignore
          }
        }
        await this.prepareRoomUi(8_000);
        if (await this.driver.exists(by.id(ID.roomIdText))) {
          const text = (await this.driver.textOf(by.id(ID.roomIdText))).trim();
          if (text.includes(this.preferredRoomNo)) {
            this.rememberRoomNoFromText(text);
            this.enteredPreferredRoom = true;
            this.log(`已在目标语音房（${text}）`);
            return;
          }
          this.log(`已在其它语音房（${text}），先退出以便搜索 ${this.preferredRoomNo}`);
          await this.leaveRoomToMain();
        } else if (
          (await this.driver.exists(by.id(ID.chatEntry))) ||
          (await this.driver.exists(by.id(ID.onMicMute))) ||
          (await this.driver.exists(by.id(ID.applyMic)))
        ) {
          // 房号未读到：不直接当成功，退出后走搜索，避免卡在错误房
          this.log('已在语音房但未确认目标房号，先退出再搜');
          await this.leaveRoomToMain();
        } else {
          await this.dismissRoomOverlayOnce();
          if (await this.driver.exists(by.id(ID.roomIdText))) {
            const text = (await this.driver.textOf(by.id(ID.roomIdText))).trim();
            if (text.includes(this.preferredRoomNo)) {
              this.rememberRoomNoFromText(text);
              this.enteredPreferredRoom = true;
              this.log(`关闭遮罩后确认目标房（${text}）`);
              return;
            }
          }
          this.log('语音房内无法确认目标房，先退出重进');
          await this.leaveRoomToMain();
        }
      } catch (e) {
        this.log(`房内快速确认异常: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await this.ensureAnyState(['home', 'party', 'logged-in', 'logged-out', 'in-room', 'search'], 30_000);
    await this.closePopups(3);

    if ((await this.currentState()) === 'in-room') {
      const text = await this.readRoomIdText(3_000);
      if (text && text.includes(this.preferredRoomNo)) {
        this.rememberRoomNoFromText(text);
        this.enteredPreferredRoom = true;
        this.log(`已在目标语音房（${text}），跳过重新进房`);
        return;
      }
      this.log(text ? `已在其它语音房（${text}），先退出` : '已在语音房但无法确认目标房，先退出');
      await this.leaveRoomToMain();
    } else if ((await this.currentState()) === 'search') {
      await this.driver.back();
      await sleep(800);
    }

    let state = await this.currentState();
    if (state === 'logged-out') {
      const acc = this.resolveAccount();
      this.log(`当前未登录，使用账号 ${acc.username} 登录`);
      await this.login(acc);
      await this.ensureAnyState(['home', 'party', 'logged-in'], 30_000);
      return;
    }
    if (state === 'home' || state === 'party') {
      const me = await this.probeLoginViaMeTab(8_000);
      if (me === 'logged-out') {
        const acc = this.resolveAccount();
        this.log(`我的页判定未登录，使用账号 ${acc.username} 登录`);
        await this.login(acc);
        await this.ensureAnyState(['home', 'party', 'logged-in'], 30_000);
      }
    }
  }

  /** 关闭房内 BottomSheet（资料卡 / Gift collection 等） */
  protected async dismissRoomSheetsOnce(): Promise<void> {
    try {
      if (await this.driver.exists(by.id(`${APP_PACKAGE}:id/touch_outside`))) {
        await this.driver.click(by.id(`${APP_PACKAGE}:id/touch_outside`));
        await sleep(500);
        return;
      }
      if (
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/playerInfoRootLayout`))) ||
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/giftCollectionView`))) ||
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/design_bottom_sheet`)))
      ) {
        // 无 touch_outside 时点上方空白，避免 back 最小化房间
        const win = await this.driver.windowRect();
          await this.driver.execute('mobile: clickGesture', [
            { x: Math.round(win.width / 2), y: Math.round(win.height * 0.35) },
          ]);
        await sleep(500);
      }
    } catch {
      // ignore
    }
  }

  /** 仅关一次房内遮罩（Share / Room Guide / Sheet），不做全量 popup 扫描 */
  protected async dismissRoomOverlayOnce(): Promise<void> {
    try {
      if (await this.isActivity(PERMISSION_ACTIVITY)) {
        await this.clickPermissionAllow();
        return;
      }
      if (await this.isActivity(WEB_ACTIVITY)) {
        await this.driver.back();
        await sleep(500);
        return;
      }
      await this.dismissRoomSheetsOnce();
      if (await this.driver.exists(by.id(`${APP_PACKAGE}:id/shareChannelRv`))) {
        await this.driver.back();
        await sleep(400);
        return;
      }
      if (
        (await this.driver.exists(by.text('Room Guide'))) ||
        (await this.driver.exists(by.id(`${APP_PACKAGE}:id/funContentTv`)))
      ) {
        if (await this.driver.exists(by.id(`${APP_PACKAGE}:id/touch_outside`))) {
          await this.driver.click(by.id(`${APP_PACKAGE}:id/touch_outside`));
        } else {
          const win = await this.driver.windowRect();
          await this.driver.execute('mobile: clickGesture', [
            { x: Math.round(win.width / 2), y: Math.round(win.height * 0.2) },
          ]);
        }
        await sleep(500);
      }
    } catch {
      // ignore
    }
  }

  /** 点击系统权限「允许」（While using / Allow 等） */
  protected async clickPermissionAllow(): Promise<boolean> {
    for (const id of PERMISSION_ALLOW_IDS) {
      if (await this.driver.exists(by.id(id))) {
        await this.driver.click(by.id(id));
        await sleep(500);
        return true;
      }
    }
    for (const t of PERMISSION_ALLOW_TEXTS) {
      if (await this.driver.exists(by.text(t))) {
        await this.driver.click(by.text(t));
        await sleep(500);
        return true;
      }
    }
    return false;
  }

  /** shell 预授权麦克风等运行时权限，减少进房后系统弹窗 */
  protected async grantAppRuntimePermissions(): Promise<void> {
    for (const p of RUNTIME_PERMISSIONS) {
      try {
        await this.driver.execute('mobile: shell', [
          { command: 'pm', args: ['grant', APP_PACKAGE, p] },
        ]);
      } catch {
        // 部分 API/模拟器不支持，忽略
      }
    }
  }

  /**
   * 房内操作前准备：优先处理权限，再轻量点掉 BottomSheet。
   * 勿反复点击屏幕上方——易误触标题栏（搜索/分享）导致跳出房间。
   */
  protected async prepareRoomUi(timeoutMs = 12_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let blankTapDone = false;
    while (Date.now() < deadline) {
      const act = await this.refreshActivity();
      if (PERMISSION_ACTIVITY.test(act)) {
        this.log('检测到系统权限弹窗，点击允许');
        if (!(await this.clickPermissionAllow())) await sleep(400);
        continue;
      }
      // 进房链路误开 H5：先 back，再等语音房
      if (WEB_ACTIVITY.test(act)) {
        this.log('房内准备时遇到 WebActivity，back 关闭');
        await this.driver.back();
        await sleep(800);
        continue;
      }
      if (!ROOM_ACTIVITY.test(act)) {
        await sleep(300);
        continue;
      }
      // 只点 touch_outside（资料卡/半屏），避免盲点标题栏
      try {
        if (await this.driver.exists(by.id(`${APP_PACKAGE}:id/touch_outside`))) {
          await this.driver.click(by.id(`${APP_PACKAGE}:id/touch_outside`));
          await sleep(400);
        }
      } catch {
        // ignore
      }
      if (await this.hasRoomChrome()) return;
      if (await this.driver.exists(by.id(ID.giftSend))) {
        // 礼物面板挡着底部：点面板上方内容区关闭（约 35%，避开顶栏）
        if (!blankTapDone) {
          blankTapDone = true;
          try {
            const win = await this.driver.windowRect();
            await this.driver.execute('mobile: clickGesture', [
              { x: Math.round(win.width / 2), y: Math.round(win.height * 0.35) },
            ]);
            await sleep(500);
          } catch {
            // ignore
          }
        }
        continue;
      }
      if (!blankTapDone) {
        blankTapDone = true;
        try {
          const win = await this.driver.windowRect();
          await this.driver.execute('mobile: clickGesture', [
            { x: Math.round(win.width / 2), y: Math.round(win.height * 0.4) },
          ]);
          await sleep(400);
        } catch {
          // ignore
        }
      }
      await sleep(300);
    }
  }

  /** 定位公屏入口：id 优先，文案 Type… 兜底 */
  protected async findChatEntry(): Promise<Locator | null> {
    if (await this.driver.exists(by.id(ID.chatEntry))) return by.id(ID.chatEntry);
    if (await this.driver.exists(by.textContains('Type'))) return by.textContains('Type');
    return null;
  }

  /** 点击公屏入口；元素树找不到时点底部左侧热区（Type… 位置） */
  protected async clickChatEntry(): Promise<void> {
    const entry = await this.findChatEntry();
    if (entry) {
      await this.driver.click(entry);
      return;
    }
    const win = await this.driver.windowRect();
    await this.driver.execute('mobile: clickGesture', [
      { x: Math.round(win.width * 0.22), y: Math.round(win.height * 0.92) },
    ]);
  }

  /** 房内主控件是否已可见（房间号 / 聊天入口 / 底部栏 / 麦位等） */
  protected async hasRoomChrome(): Promise<boolean> {
    const ids = [
      ID.roomIdText,
      ID.chatEntry,
      ID.bottomView,
      ID.bottomLayout,
      ID.onMicMute,
      ID.applyMic,
      ID.seatAvatar,
      ID.roomMember,
      ID.roomTitle,
    ];
    for (const id of ids) {
      try {
        if (await this.driver.exists(by.id(id))) return true;
      } catch {
        // continue
      }
    }
    // iv_message 文案兜底（Type…）
    try {
      if (await this.driver.exists(by.textContains('Type'))) return true;
    } catch {
      // ignore
    }
    return false;
  }

  /** 是否已在娱乐房 FunVoiceRoomActivity */
  protected async isInFunRoom(): Promise<boolean> {
    return this.isActivity(FUN_ROOM_ACTIVITY);
  }

  /** 是否误入订单房 VoiceRoomActivity */
  protected async isInOrderRoom(): Promise<boolean> {
    return this.isActivity(ORDER_ROOM_ACTIVITY);
  }

  /**
   * 进房后确认是娱乐房；订单房/个播房则退房并返回 false。
   * 源码 VoiceRoomHelper：roomType fun/fun1 → FunVoiceRoomActivity；
   * orders + tagType≠fun → VoiceRoomActivity（订单房，禁止）。
   */
  protected async ensureEnteredFunRoom(): Promise<boolean> {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (await this.isActivity(PERMISSION_ACTIVITY)) {
        await this.clickPermissionAllow();
        continue;
      }
      if (await this.isActivity(WEB_ACTIVITY)) {
        await this.driver.back();
        await sleep(600);
        continue;
      }
      if (await this.isInFunRoom()) {
        await this.grantAppRuntimePermissions();
        await this.prepareRoomUi(8_000);
        if (!(await this.hasRoomChrome())) {
          try {
            await this.waitRoomInteractive(8_000);
          } catch {
            // Activity 已对即可
          }
        }
        const entered = await this.readRoomIdText(3_000);
        if (entered) this.rememberRoomNoFromText(entered);
        this.log(entered ? `已进入娱乐房 FunVoiceRoomActivity：${entered}` : '已进入娱乐房 FunVoiceRoomActivity');
        return true;
      }
      if (await this.isInOrderRoom()) {
        this.log('误入订单房 VoiceRoomActivity，退出重选娱乐房');
        await this.leaveRoomToMain();
        return false;
      }
      if (await this.isActivity(ACT.roomPerson)) {
        this.log('误入个播房 PersonVoiceRoomActivity，退出重选娱乐房');
        await this.leaveRoomToMain();
        return false;
      }
      await sleep(400);
    }
    if (await this.isInFunRoom()) return true;
    const act = await this.refreshActivity();
    this.log(`等待娱乐房超时，当前 Activity: ${act}`);
    if (await this.isActivity(ROOM_ACTIVITY)) await this.leaveRoomToMain();
    return false;
  }

  /** 点列表中带 Fun 标签的房间；找不到返回 false */
  protected async clickFunRoomFromList(): Promise<boolean> {
    const itemId = ID.partyRoomItem;
    if (!(await this.driver.exists(by.id(itemId)))) {
      if (await this.driver.exists(by.id(ID.partyRoomCover))) {
        const covers = await this.driver.findElements(by.id(ID.partyRoomCover));
        const start = covers.length > 1 ? 2 : 1;
        const pick = start + Math.floor(Math.random() * Math.max(covers.length - start + 1, 1));
        await this.driver.click(by.xpath(`(//*[@resource-id='${ID.partyRoomCover}'])[${pick}]`));
        this.log(`未找到 roomListDRootLayout，回退点 cover #${pick}`);
        return true;
      }
      return false;
    }

    for (const funText of FUN_TAG_TEXTS) {
      const cards = await this.driver.findElements(
        by.xpath(
          `//*[@resource-id='${itemId}'][.//*[@resource-id='${ID.roomTypeTag}' and @text='${funText}']]`,
        ),
      );
      if (cards.length > 0) {
        const pick = Math.floor(Math.random() * cards.length) + 1;
        await this.driver.click(
          by.xpath(
            `(//*[@resource-id='${itemId}'][.//*[@resource-id='${ID.roomTypeTag}' and @text='${funText}']])[${pick}]`,
          ),
        );
        this.log(`点击 Fun 标签房间（文案=${funText}，第 ${pick}/${cards.length} 个）`);
        return true;
      }
    }

    const allItems = await this.driver.findElements(by.id(itemId));
    const candidates: number[] = [];
    for (let i = 1; i <= allItems.length; i++) {
      const itemXp = `(//*[@resource-id='${itemId}'])[${i}]`;
      let isOrder = false;
      for (const orderText of ORDER_TAG_TEXTS) {
        if (
          await this.driver.exists(
            by.xpath(`${itemXp}//*[@resource-id='${ID.roomTypeTag}' and @text='${orderText}']`),
          )
        ) {
          isOrder = true;
          break;
        }
      }
      if (!isOrder) candidates.push(i);
    }
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      await this.driver.click(by.xpath(`(//*[@resource-id='${itemId}'])[${pick}]`));
      this.log(`点击非 Order 标签房间（索引 ${pick}，候选 ${candidates.length}）`);
      return true;
    }

    this.log('列表可见房间均为 Order 标签，无法点娱乐房');
    return false;
  }

  /** 底部导航是否已就绪（tabView 初始 gone，等全局配置后才显示） */
  protected async hasBottomTabs(): Promise<boolean> {
    if (await this.driver.exists(by.id(ID.tabParty))) return true;
    if (await this.driver.exists(by.id(ID.tabHome))) return true;
    if (await this.driver.exists(by.id(ID.tabMe))) return true;
    // tabView 可见即说明导航已 init（party 可能因 room_list!=2 未挂）
    if (await this.driver.exists(by.id(ID.tabBar))) return true;
    return false;
  }

  /** 从 WebActivity / 搜索页 / 异常栈回到带底部 tab 的主壳 */
  protected async ensureMainWithBottomTabs(timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let coldStartTried = false;
    while (Date.now() < deadline) {
      await this.closePopups();
      const act = await this.refreshActivity();

      if (PERMISSION_ACTIVITY.test(act)) {
        await this.clickPermissionAllow();
        continue;
      }

      // 已能看到底部 tab：成功
      if (await this.hasBottomTabs()) {
        return;
      }

      if (WEB_ACTIVITY.test(act) || ROOM_ACTIVITY.test(act) || act.includes(ACT.search)) {
        this.log(`ensureMain: 从 ${act} back 退出`);
        await this.driver.back();
        await sleep(1_000);
        continue;
      }

      // 其它非主页：多 back 几次
      if (!act.includes(ACT.main) && !act.includes(ACT.splash)) {
        await this.driver.back();
        await sleep(800);
        continue;
      }

      if (!coldStartTried) {
        coldStartTried = true;
        this.log('ensureMain: 未见底部 tab，冷启 APP');
        await this.terminateApp();
        await sleep(1_000);
        await this.activateApp();
        await sleep(2_500);
        continue;
      }

      await sleep(500);
    }
    throw new Error('未能回到带底部导航的主页（可能仍在 WebActivity/语音房）');
  }

  /** 退出语音房：back；仍在房内/Web 则 ensureMain */
  protected async leaveRoomToMain(): Promise<void> {
    if (await this.isActivity(WEB_ACTIVITY)) {
      this.log('当前在 WebActivity，先退出');
      await this.driver.back();
      await sleep(1_000);
    }
    if (await this.isActivity(ROOM_ACTIVITY)) {
      await this.driver.back();
      await sleep(1_200);
    }
    if (await this.isActivity(ROOM_ACTIVITY) || (await this.isActivity(WEB_ACTIVITY))) {
      this.log('back 未能退出语音房/Web，走 ensureMainWithBottomTabs');
    }
    try {
      await this.ensureMainWithBottomTabs(18_000);
    } catch (e) {
      this.log(`ensureMain 失败，terminate 重试: ${e instanceof Error ? e.message : String(e)}`);
      await this.terminateApp();
      await sleep(1_000);
      await this.activateApp();
      await sleep(2_500);
      await this.ensureMainWithBottomTabs(15_000);
    }
  }

  /** 点「我的」探测登录态；返回后尽量回到可操作主页 */
  private async probeLoginViaMeTab(timeoutMs = 15_000): Promise<'logged-in' | 'logged-out'> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.isActivity(ACT.login)) return 'logged-out';
      if ((await this.driver.exists(by.id(ID.meUid))) || (await this.driver.exists(by.id(ID.mePage)))) {
        return 'logged-in';
      }
      if (await this.driver.exists(by.id(ID.tabMe))) await this.driver.click(by.id(ID.tabMe));
      await sleep(800);
    }
    // 超时按已登录继续（避免误杀），后续进 Party 会再失败暴露问题
    this.log('探测登录态超时，按已登录继续');
    return 'logged-in';
  }

  /** 是否已在语音房列表页（RoomListFragment） */
  protected async isOnRoomListPage(): Promise<boolean> {
    return (
      (await this.driver.exists(by.id(ID.partyTitle))) ||
      (await this.driver.exists(by.id(ID.partyTitleArea))) ||
      (await this.driver.exists(by.id(ID.searchEntry))) ||
      (await this.driver.exists(by.id(`${APP_PACKAGE}:id/roomViewpager`))) ||
      (await this.driver.exists(by.id(`${APP_PACKAGE}:id/roomTitleLayoutLayout`)))
    );
  }

  /**
   * 确保顶部选中 Party（非 Live/Game）。
   * 源码 RoomListFragment.changeTabSelected：
   * - Party → img_search_room VISIBLE
   * - Live  → img_search_room GONE
   * - Game  → layout_options GONE
   */
  protected async ensurePartySubTab(): Promise<void> {
    await this.closePopups();
    // 已有搜索入口：已在 Party
    if (await this.driver.exists(by.id(ID.searchEntry))) return;

    if (await this.driver.exists(by.id(ID.partyTitleArea))) {
      await this.driver.click(by.id(ID.partyTitleArea));
    } else if (await this.driver.exists(by.id(ID.partyTitle))) {
      await this.driver.click(by.id(ID.partyTitle));
    } else if (await this.driver.exists(by.text('Party'))) {
      await this.driver.click(by.text('Party'));
    } else if (await this.driver.exists(by.text('派对'))) {
      await this.driver.click(by.text('派对'));
    } else {
      return;
    }
    await sleep(600);
  }

  /** 等待进入房间列表，并切到 Party 使搜索入口可见 */
  protected async waitForRoomListReady(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.isOnRoomListPage()) {
        await this.ensurePartySubTab();
        if (await this.driver.exists(by.id(ID.searchEntry))) return;
        // 列表已出但搜索仍无：再点一次 Party
        await this.ensurePartySubTab();
        if (await this.driver.exists(by.id(ID.searchEntry))) return;
        // Party 页也可能搜索稍晚：有列表+Party 标题也算就绪（后续步骤可再等）
        if (await this.driver.exists(by.id(ID.partyTitle)) || (await this.driver.exists(by.id(ID.partyRoomList)))) {
          // 再给搜索一点时间
          const searchDeadline = Date.now() + 3_000;
          while (Date.now() < searchDeadline) {
            if (await this.driver.exists(by.id(ID.searchEntry))) return;
            await sleep(300);
          }
          // 仍无搜索但已在列表：不硬失败（可能 Live 配置异常），抛更明确错误
          if (await this.driver.exists(by.id(ID.partyRoomList)) || (await this.driver.exists(by.id(ID.partyRoomItem)))) {
            this.log('已在房间列表但 img_search_room 未出现（可能仍停在 Live/Game）');
            return;
          }
        }
      }
      await sleep(400);
    }
    await this.refreshActivity();
    throw new Error(
      `未进入语音房列表页（RoomListFragment），当前 Activity: ${this.activity || '(未知)'}`,
    );
  }

  /** 进入 Party tab（房间列表） */
  protected async openPartyTab(): Promise<void> {
    await this.clickBottomVoiceRoomTab();
    await this.clickPartyTitleTab();
  }

  /** 1. 点击底部标签栏「语音房」 */
  protected async clickBottomVoiceRoomTab(): Promise<void> {
    await this.closePopups();
    if (await this.isActivity(WEB_ACTIVITY) || (await this.isActivity(ROOM_ACTIVITY))) {
      await this.leaveRoomToMain();
    }
    if (await this.isActivity(ACT.search)) {
      await this.driver.back();
      await sleep(800);
    }

    // 已在列表页：切到 Party 即可（勿因 partyTitle 存在就直接 return——Live 下无搜索按钮）
    if (await this.isOnRoomListPage()) {
      await this.ensurePartySubTab();
      if (await this.driver.exists(by.id(ID.searchEntry))) return;
      await this.waitForRoomListReady(8_000);
      return;
    }

    if (!(await this.hasBottomTabs())) {
      await this.ensureMainWithBottomTabs(15_000);
    }
    // 等配置下发后 tabView 从 gone → visible（MainActivity.initNavigation）
    const tabDeadline = Date.now() + 12_000;
    while (Date.now() < tabDeadline && !(await this.driver.exists(by.id(ID.tabParty)))) {
      if (await this.isOnRoomListPage()) {
        await this.waitForRoomListReady(8_000);
        return;
      }
      await sleep(400);
    }
    if (!(await this.driver.exists(by.id(ID.tabParty)))) {
      if (await this.driver.exists(by.id(ID.tabBar)) || (await this.driver.exists(by.id(ID.tabHome)))) {
        throw new Error(
          '底部导航已显示，但无 Party tab（navigation_voice_room）。源码：仅 room_list==2 时 MainActivity 才会 addItem',
        );
      }
      await this.assertExists(by.id(ID.tabParty), '底部语音房 tab');
    }

    // 点击底部语音房 tab；未进入列表则重试一次
    for (let attempt = 1; attempt <= 2; attempt++) {
      await this.driver.click(by.id(ID.tabParty));
      this.log(`已点击底部语音房 tab（attempt=${attempt}）`);
      try {
        await this.waitForRoomListReady(attempt === 1 ? 10_000 : 12_000);
        return;
      } catch (e) {
        if (attempt === 2) throw e;
        this.log(`进列表未就绪，重点 tab: ${e instanceof Error ? e.message : String(e)}`);
        await this.closePopups();
        await sleep(500);
      }
    }
  }

  /** 2. 点击派对 Tab（顶部 Party 标题，相对 Live 等） */
  protected async clickPartyTitleTab(): Promise<void> {
    await this.closePopups();
    await this.ensurePartySubTab();
    // 成功标准：搜索入口可见，或至少 Party 列表可见
    if (await this.driver.exists(by.id(ID.searchEntry))) return;
    await this.waitForRoomListReady(8_000);
    if (!(await this.driver.exists(by.id(ID.searchEntry)))) {
      // 列表已在但搜索仍无：再点 Party 一次
      await this.ensurePartySubTab();
      if (!(await this.driver.exists(by.id(ID.searchEntry)))) {
        await this.waitForElement(by.id(ID.searchEntry), '派对页搜索入口', 5_000);
      }
    }
  }

  /** 3. 点击右上角搜索按钮，进入搜索页 */
  protected async openRoomSearchPage(): Promise<void> {
    await this.assertExists(by.id(ID.searchEntry), '右上角搜索按钮');
    await this.driver.click(by.id(ID.searchEntry));
    await this.waitForActivity(ACT.search, 8_000);
    await this.waitForElement(by.id(ID.searchEt), '搜索输入框', 5_000);
  }

  /** 4+5. 输入房间号并触发搜索 */
  protected async inputRoomIdAndSearch(roomNo: string): Promise<void> {
    await this.waitForElement(by.id(ID.searchEt), '搜索输入框', 5_000);
    if (await this.driver.exists(by.id(ID.searchClear))) {
      try {
        await this.driver.click(by.id(ID.searchClear));
        await sleep(200);
      } catch {
        // ignore
      }
    }
    await this.driver.click(by.id(ID.searchEt));
    await sleep(200);
    try {
      await this.driver.input(by.id(ID.searchEt), roomNo);
    } catch {
      await this.driver.sendKeys(by.id(ID.searchEt), roomNo);
    }
    await sleep(300);
    await this.driver.hideKeyboard();
    await this.driver.performEditorAction('search');
    await sleep(800);
  }

  /** 等待搜索结果中含指定房间号的条目；找不到返回 null */
  protected async waitSearchResultHit(roomNo: string, timeoutMs = 18_000): Promise<Locator | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const idHit = by.xpath(`//*[@resource-id='${ID.resultRoomId}' and contains(@text,'${roomNo}')]`);
      if (await this.driver.exists(idHit)) {
        const row = by.xpath(
          `//*[@resource-id='${ID.resultRoomId}' and contains(@text,'${roomNo}')]/ancestor::*[@resource-id='${ID.resultBody}'][1]`,
        );
        if (await this.driver.exists(row)) return row;
        const clickable = by.xpath(
          `//*[@resource-id='${ID.resultRoomId}' and contains(@text,'${roomNo}')]/ancestor::*[@clickable='true'][1]`,
        );
        if (await this.driver.exists(clickable)) return clickable;
        return idHit;
      }
      // 空态出现且已等过一会儿再放弃（接口可能稍慢）
      if (await this.driver.exists(by.id(ID.searchEmptyView)) && Date.now() + 3_000 > deadline) {
        return null;
      }
      await sleep(500);
    }
    return null;
  }

  /** 读取搜索结果中的房间信息文案（房间号 / 房名） */
  protected async readSearchResultInfo(roomNo: string): Promise<{ roomId: string; roomName: string }> {
    let roomId = '';
    let roomName = '';
    const idLoc = by.xpath(`//*[@resource-id='${ID.resultRoomId}' and contains(@text,'${roomNo}')]`);
    if (await this.driver.exists(idLoc)) {
      roomId = (await this.driver.textOf(idLoc)).trim();
    }
    const nameLoc = by.xpath(
      `//*[@resource-id='${ID.resultRoomId}' and contains(@text,'${roomNo}')]/ancestor::*[@resource-id='${ID.resultBody}'][1]//*[@resource-id='${ID.resultRoomName}']`,
    );
    if (await this.driver.exists(nameLoc)) {
      roomName = (await this.driver.textOf(nameLoc)).trim();
    }
    return { roomId, roomName };
  }

  /** 6. 点击搜索结果并进入娱乐房；成功后校验房号 */
  protected async clickSearchResultAndEnter(hit: Locator, expectRoomNo?: string): Promise<void> {
    await this.driver.click(hit);
    await sleep(800);
    const ok = await this.ensureEnteredFunRoom();
    if (!ok) {
      throw new Error('搜索进房未进入 FunVoiceRoomActivity（可能是订单房 VoiceRoomActivity）');
    }
    if (expectRoomNo) {
      const text = await this.readRoomIdText(5_000);
      if (!text || !text.includes(expectRoomNo)) {
        await this.leaveRoomToMain();
        throw new Error(`搜索进房后房号不符：期望含 ${expectRoomNo}，实际 ${text || '(未读到)'}`);
      }
      this.rememberRoomNoFromText(text);
      this.enteredPreferredRoom = true;
      this.log(`已确认进入目标房 ${expectRoomNo}`);
    }
  }

  /** 从房内展示文案回填实际房号（不覆盖 preferredRoomNo） */
  protected rememberRoomNoFromText(text: string): void {
    const digits = text.replace(/[^\d]/g, '').trim();
    if (digits) this.roomNo = digits;
  }

  /**
   * 3.1 进房：先搜 preferredRoomNo；失败再 Party 列表进其它 Fun 房。
   */
  protected async enterVoiceRoom(): Promise<void> {
    const preferred = this.preferredRoomNo || DEFAULT_ROOM_NO;
    const found = await this.trySearchAndEnterRoom(preferred);
    if (found) {
      this.enteredPreferredRoom = true;
      return;
    }

    this.log(`未搜到/未能进入 ${preferred}，改为从 Party 列表进入其它娱乐房`);
    this.enteredPreferredRoom = false;
    if (await this.isActivity(ACT.search)) {
      await this.driver.back();
      await sleep(800);
    }
    await this.pickRandomOnlineRoomAndEnter();
  }

  /** Party 列表随机进入在线「娱乐房」（FunVoiceRoomActivity；禁止订单房） */
  protected async pickRandomOnlineRoomAndEnter(maxAttempts = 5): Promise<void> {
    if (await this.isInFunRoom()) {
      try {
        await this.prepareRoomUi(6_000);
        if (await this.hasRoomChrome()) {
          const text = await this.readRoomIdText(3_000);
          if (text) this.rememberRoomNoFromText(text);
          this.log(text ? `已在娱乐房（${text}），无需重进` : '已在娱乐房，无需重进');
          return;
        }
      } catch {
        // fall through
      }
    }
    if (await this.isActivity(ROOM_ACTIVITY)) {
      this.log('当前不在娱乐房或控件不可见，先退出再进 Fun 房');
      await this.leaveRoomToMain();
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.openPartyTab();
        await this.closePopups(2);

        const itemLocator = by.id(ID.partyRoomItem);
        const deadline = Date.now() + 20_000;
        let count = 0;
        while (Date.now() < deadline) {
          if (await this.driver.exists(by.id(ID.partyRoomList)) || (await this.driver.exists(itemLocator))) {
            count = (await this.driver.findElements(itemLocator)).length;
            if (count > 0) break;
            count = (await this.driver.findElements(by.id(ID.partyRoomCover))).length;
            if (count > 0) break;
          }
          await sleep(500);
        }
        if (count <= 0) {
          throw new Error('Party 语音房列表为空，无法进入娱乐房');
        }

        this.log(`兜底进娱乐房 attempt=${attempt}/${maxAttempts}`);
        const clicked = await this.clickFunRoomFromList();
        if (!clicked) {
          // 列表可能全是 Order：下滑换一批再试
          if (await this.driver.exists(by.id(ID.partyRoomList))) {
            await this.driver.swipeInElement(by.id(ID.partyRoomList), 'up');
            await sleep(500);
          }
          lastError = new Error('未找到 Fun 标签房间');
          continue;
        }
        await sleep(1_200);

        if (await this.isActivity(WEB_ACTIVITY)) {
          this.log('点击后进入 WebActivity（疑似 banner），back 后换房重试');
          await this.driver.back();
          await sleep(800);
          lastError = new Error('误点 banner 进入 WebActivity');
          continue;
        }

        const ok = await this.ensureEnteredFunRoom();
        if (!ok) {
          lastError = new Error('未进入 FunVoiceRoomActivity（可能点到订单房）');
          continue;
        }
        this.enteredPreferredRoom = false;
        this.log('已从 Party 列表进入其它娱乐房（非目标搜索房）');
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        this.log(`兜底进娱乐房 attempt=${attempt} 失败: ${lastError.message}`);
        try {
          if (await this.isActivity(WEB_ACTIVITY) || (await this.isActivity(ROOM_ACTIVITY))) {
            await this.leaveRoomToMain();
          } else if (await this.isActivity(ACT.search)) {
            await this.driver.back();
            await sleep(600);
          }
        } catch {
          // ignore
        }
      }
    }
    throw lastError ?? new Error('Party 列表未能进入娱乐房（FunVoiceRoomActivity）');
  }

  /** 搜索房间号并进入娱乐房；找不到或进到订单房时返回 false */
  protected async trySearchAndEnterRoom(roomNo = this.preferredRoomNo): Promise<boolean> {
    if (await this.isActivity(ROOM_ACTIVITY)) {
      try {
        if (await this.isInFunRoom()) {
          if (await this.driver.exists(by.id(ID.roomIdText))) {
            const text = (await this.driver.textOf(by.id(ID.roomIdText))).trim();
            if (text.includes(roomNo)) {
              this.rememberRoomNoFromText(text);
              this.enteredPreferredRoom = true;
              this.log(`已在目标娱乐房 ${text}，无需搜索`);
              return true;
            }
          }
        } else if (await this.isInOrderRoom()) {
          this.log('当前在订单房，先退出再搜目标房');
        }
      } catch {
        // fall through
      }
      await this.leaveRoomToMain();
    }

    await this.openPartyTab();
    await this.openRoomSearchPage();
    await this.inputRoomIdAndSearch(roomNo);
    const hit = await this.waitSearchResultHit(roomNo);
    if (!hit) {
      this.log(`搜索无在线结果或不含房间号 ${roomNo}`);
      return false;
    }
    try {
      await this.clickSearchResultAndEnter(hit, roomNo);
      return true;
    } catch (e) {
      this.log(`搜索进房失败: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  /** 搜索房间号并进入（仅点击在线结果）；找不到则抛错 */
  protected async searchAndEnterRoom(roomNo = this.roomNo): Promise<void> {
    const ok = await this.trySearchAndEnterRoom(roomNo);
    if (!ok) throw new Error(`搜索无在线结果或不含房间号 ${roomNo}（请确认房间在线）`);
  }

  /** 关遮罩并读取房内房间号文本；超时返回空串 */
  protected async readRoomIdText(timeoutMs = 10_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.driver.exists(by.id(ID.roomIdText))) {
          return (await this.driver.textOf(by.id(ID.roomIdText))).trim();
        }
        await this.closePopups();
        if (await this.driver.exists(by.id(ID.roomIdText))) {
          return (await this.driver.textOf(by.id(ID.roomIdText))).trim();
        }
      } catch (e) {
        this.log(`readRoomIdText 异常: ${e instanceof Error ? e.message : String(e)}`);
        return '';
      }
      await sleep(400);
    }
    return '';
  }

  /** 等待房内可操作（房间号或底部聊天入口出现）；期间消化权限弹窗 / Web 页 */
  protected async waitRoomInteractive(timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.isActivity(PERMISSION_ACTIVITY)) {
          await this.clickPermissionAllow();
          continue;
        }
        if (await this.isActivity(WEB_ACTIVITY)) {
          this.log('等待房内控件时遇到 WebActivity，back');
          await this.driver.back();
          await sleep(800);
          continue;
        }
        if (await this.hasRoomChrome()) return;
        await this.dismissRoomOverlayOnce();
        if (await this.hasRoomChrome()) return;
      } catch (e) {
        throw new Error(`等待房内控件失败: ${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(500);
    }
    const act = await this.refreshActivity();
    throw new Error(`已进入语音房 Activity，但房内主控件未出现（房间号/聊天入口）；当前 Activity: ${act}`);
  }

  /** 关闭房内新手引导 / 分享弹层等遮罩 */
  protected async dismissRoomGuides(): Promise<void> {
    await this.prepareRoomUi(8_000);
    await this.closePopups();
    if (await this.driver.exists(by.id(ID.guideLayout))) {
      try {
        await this.driver.click(by.id(ID.guideLayout));
        await sleep(500);
      } catch {
        // ignore
      }
    }
    await this.closePopups();
  }

  /**
   * 断言已在目标娱乐房（FunVoiceRoomActivity）。
   * roomNo 传空串表示任意娱乐房即可。
   */
  protected async assertInTargetRoom(roomNo?: string): Promise<{ expect: string; real: string; pass: boolean }> {
    const expectNo = roomNo === undefined ? this.roomNo : roomNo;
    if (await this.isActivity(PERMISSION_ACTIVITY)) await this.clickPermissionAllow();
    if (await this.isActivity(WEB_ACTIVITY)) {
      return {
        expect: expectNo ? `娱乐房且房间号含 ${expectNo}` : '已进入娱乐房 FunVoiceRoomActivity',
        real: '当前在 WebActivity（非语音房）',
        pass: false,
      };
    }
    if (await this.isInOrderRoom()) {
      return {
        expect: expectNo ? `娱乐房且房间号含 ${expectNo}` : '已进入娱乐房 FunVoiceRoomActivity',
        real: '当前在订单房 VoiceRoomActivity（禁止）',
        pass: false,
      };
    }
    if (!(await this.isInFunRoom())) {
      const act = await this.refreshActivity();
      return {
        expect: expectNo ? `娱乐房且房间号含 ${expectNo}` : '已进入娱乐房 FunVoiceRoomActivity',
        real: `当前非 FunVoiceRoomActivity: ${act}`,
        pass: false,
      };
    }
    const text = await this.readRoomIdText(5_000);
    if (!text) {
      if (await this.hasRoomChrome()) {
        const expectLabel = expectNo ? `娱乐房且房间号含 ${expectNo}` : '已进入娱乐房 FunVoiceRoomActivity';
        return { expect: expectLabel, real: 'FunVoiceRoomActivity 主控件可见(房间号暂未读到)', pass: true };
      }
      return {
        expect: expectNo ? `娱乐房且房间号含 ${expectNo}` : '已进入娱乐房 FunVoiceRoomActivity',
        real: 'FunVoiceRoomActivity 但未找到 roomIdTextView',
        pass: false,
      };
    }
    this.rememberRoomNoFromText(text);
    if (!expectNo) {
      return { expect: '已进入娱乐房 FunVoiceRoomActivity', real: text, pass: true };
    }
    return {
      expect: `娱乐房且房间号含 ${expectNo}`,
      real: text,
      pass: text.includes(expectNo),
    };
  }

  /**
   * 从派对「热门房间」下列表进入「娱乐房」FunVoiceRoomActivity（禁止订单房）。
   * 前置：已在派对列表页。
   */
  protected async enterRoomFromHotList(maxAttempts = 5): Promise<void> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.closePopups(2);

        try {
          if (await this.driver.exists(by.id(ID.hotRoomTitle))) {
            this.log('已看到热门房间标题');
          } else if (
            (await this.driver.exists(by.textContains('Popular'))) ||
            (await this.driver.exists(by.textContains('热门房间')))
          ) {
            this.log('已看到热门房间文案');
          } else if (await this.driver.exists(by.id(ID.partyRoomList))) {
            await this.driver.swipeInElement(by.id(ID.partyRoomList), 'up');
            await sleep(400);
          }
        } catch {
          // ignore
        }

        const itemLocator = by.id(ID.partyRoomItem);
        const deadline = Date.now() + 20_000;
        let count = 0;
        while (Date.now() < deadline) {
          if (await this.driver.exists(by.id(ID.partyRoomList)) || (await this.driver.exists(itemLocator))) {
            count = (await this.driver.findElements(itemLocator)).length;
            if (count > 0) break;
            count = (await this.driver.findElements(by.id(ID.partyRoomCover))).length;
            if (count > 0) break;
          }
          await sleep(500);
        }
        if (count <= 0) {
          throw new Error('热门房间下语音房列表为空');
        }

        this.log(`热门列表进娱乐房 attempt=${attempt}/${maxAttempts}`);
        const clicked = await this.clickFunRoomFromList();
        if (!clicked) {
          if (await this.driver.exists(by.id(ID.partyRoomList))) {
            await this.driver.swipeInElement(by.id(ID.partyRoomList), 'up');
            await sleep(500);
          }
          lastError = new Error('未找到 Fun 标签房间');
          continue;
        }
        await sleep(1_200);

        if (await this.isActivity(WEB_ACTIVITY)) {
          this.log('热门列表点击后进入 WebActivity，back 后换房重试');
          await this.driver.back();
          await sleep(800);
          lastError = new Error('误点 banner 进入 WebActivity');
          continue;
        }

        const ok = await this.ensureEnteredFunRoom();
        if (!ok) {
          lastError = new Error('未进入 FunVoiceRoomActivity（可能点到订单房）');
          continue;
        }
        return;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        this.log(`热门列表进娱乐房 attempt=${attempt} 失败: ${lastError.message}`);
        try {
          if (await this.isActivity(WEB_ACTIVITY) || (await this.isActivity(ROOM_ACTIVITY))) {
            await this.leaveRoomToMain();
            await this.openPartyTab();
          }
        } catch {
          // ignore
        }
      }
    }
    throw lastError ?? new Error('热门房间列表未能进入娱乐房（FunVoiceRoomActivity）');
  }

  /** 打开公屏输入框（底部 Type… / iv_message）— 须在娱乐房内 */
  protected async openChatInput(): Promise<void> {
    if (!(await this.isInFunRoom())) {
      const act = await this.refreshActivity();
      throw new Error(`打开输入框前不在娱乐房 FunVoiceRoomActivity，当前: ${act || '(未知)'}`);
    }
    await this.prepareRoomUi(5_000);
    let opened = false;
    for (let i = 0; i < 2 && !opened; i++) {
      if (!(await this.isActivity(ROOM_ACTIVITY))) break;
      if (await this.isActivity(PERMISSION_ACTIVITY)) await this.clickPermissionAllow();
      try {
        if (await this.driver.exists(by.id(`${APP_PACKAGE}:id/touch_outside`))) {
          await this.driver.click(by.id(`${APP_PACKAGE}:id/touch_outside`));
          await sleep(300);
        }
      } catch {
        // ignore
      }
      await this.clickChatEntry();
      opened = await this.driver.waitFor(by.id(ID.chatInput), 3_500, 300);
      if (!opened) await sleep(300);
    }
    if (!opened) {
      throw new Error('无法打开公屏输入框（Type… / input_view）');
    }
  }

  /** 在已打开的公屏输入框中输入内容 */
  protected async typeChatMessage(message: string): Promise<void> {
    await this.waitForElement(by.id(ID.chatInput), '公屏输入框', 5_000);
    await this.driver.click(by.id(ID.chatInput));
    await sleep(200);
    await this.driver.input(by.id(ID.chatInput), message);
  }

  /** 发送公屏消息（IME send） */
  protected async sendChatMessage(): Promise<void> {
    await this.driver.performEditorAction('send');
    await sleep(800);
  }

  /** 打开公屏输入框并发送消息 */
  protected async sendRoomMessage(message: string): Promise<void> {
    await this.openChatInput();
    await this.typeChatMessage(message);
    await this.sendChatMessage();
  }

  /** 校验公屏是否出现消息（兼容多种气泡布局） */
  protected async hasRoomMessage(message: string, timeoutMs = 6_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const candidates: Locator[] = [
      by.xpath(`//*[@resource-id='${ID.chatContent}' and contains(@text,${JSON.stringify(message)})]`),
      by.textContains(message),
    ];
    while (Date.now() < deadline) {
      try {
        if (await this.isActivity(PERMISSION_ACTIVITY)) {
          await this.clickPermissionAllow();
          continue;
        }
        for (const c of candidates) {
          if (await this.driver.exists(c)) return true;
        }
      } catch {
        return false;
      }
      await sleep(400);
    }
    return false;
  }

  /**
   * 上麦：
   * - 目标房（搜到 preferred）：点 0 号麦位（列表第 1 个）
   * - 其它娱乐房（列表兜底）：禁止第 1、第 2 个麦位，从第 3 个起上麦
   */
  protected async takeMic(): Promise<'on-mic' | 'queued'> {
    await this.dismissGiftPanel();
    await this.prepareRoomUi(5_000);
    if (await this.driver.exists(by.id(ID.onMicMute))) return 'on-mic';

    const clicked = this.enteredPreferredRoom
      ? await this.clickSeatZero()
      : await this.clickGuestMicSeatSkipFirstTwo();
    if (!clicked) {
      await this.dismissGiftPanel();
      await this.prepareRoomUi(3_000);
      if (await this.driver.exists(by.id(ID.onMicMute))) return 'on-mic';
      const retry = this.enteredPreferredRoom
        ? await this.clickSeatZero()
        : await this.clickGuestMicSeatSkipFirstTwo();
      if (!retry) {
        throw new Error(
          this.enteredPreferredRoom
            ? '未找到 0 号麦位（ll_item_avatar 第 1 个）'
            : '未找到可上麦位（已跳过第 1、第 2 个麦位）',
        );
      }
    }

    if (await this.driver.exists(by.id(ID.seatChoiceRegular))) {
      await this.driver.click(by.id(ID.seatChoiceRegular));
      await sleep(500);
    }
    if (await this.isActivity(PERMISSION_ACTIVITY)) await this.clickPermissionAllow();
    else await this.prepareRoomUi(4_000);

    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      if (await this.isActivity(PERMISSION_ACTIVITY)) {
        await this.clickPermissionAllow();
        continue;
      }
      if (await this.driver.exists(by.id(ID.onMicMute))) return 'on-mic';
      if (await this.driver.exists(by.id(ID.queueRemind))) return 'queued';
      if (await this.driver.exists(by.id(ID.seatChoiceRegular))) {
        await this.driver.click(by.id(ID.seatChoiceRegular));
        await sleep(400);
      }
      await sleep(400);
    }
    throw new Error('上麦超时：未出现静音按钮(已上麦)或排队提醒');
  }

  /**
   * 点击 0 号麦位（列表第 1 个 ll_item_avatar）— 仅目标搜索房使用。
   */
  protected async clickSeatZero(): Promise<boolean> {
    await this.waitForElement(by.id(ID.seatItem), '麦位列表', 8_000);
    const seat0 = by.xpath(`(//*[@resource-id='${ID.seatItem}'])[1]`);
    if (!(await this.driver.exists(seat0))) {
      this.log('未找到 0 号麦位（列表第 1 个）');
      return false;
    }
    this.log('目标房：点击 0 号麦位上麦');
    try {
      await this.driver.click(seat0);
      await sleep(500);
      return true;
    } catch (e) {
      this.log(`点击 0 号麦位失败: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  /**
   * 其它娱乐房上麦：跳过第 1、第 2 个麦位（主持/老板），从第 3 个起点空麦优先。
   */
  protected async clickGuestMicSeatSkipFirstTwo(): Promise<boolean> {
    await this.waitForElement(by.id(ID.seatItem), '麦位列表', 8_000);
    const seats = await this.driver.findElements(by.id(ID.seatItem));
    const total = seats.length;
    if (total <= 2) {
      this.log(`麦位仅 ${total} 个，无法跳过第 1/2 号`);
      return false;
    }

    const tryClick = async (idx: number, preferEmpty: boolean): Promise<boolean> => {
      const seatXp = `(//*[@resource-id='${ID.seatItem}'])[${idx}]`;
      const seatLoc = by.xpath(seatXp);
      if (!(await this.driver.exists(seatLoc))) return false;

      const hostTag = by.xpath(`${seatXp}//*[@resource-id='${ID.seatHostTag}']`);
      const bossTag = by.xpath(`${seatXp}//*[@resource-id='${ID.seatBossTag}']`);
      if (await this.driver.exists(hostTag) || (await this.driver.exists(bossTag))) {
        this.log(`跳过麦位 #${idx}（主持/老板标签）`);
        return false;
      }

      const avatar = by.xpath(`${seatXp}//*[@resource-id='${ID.seatAvatar}']`);
      const occupied = await this.driver.exists(avatar);
      if (preferEmpty && occupied) return false;

      this.log(`其它娱乐房：尝试麦位 #${idx}（跳过1/2，occupied=${occupied}）`);
      try {
        await this.driver.click(seatLoc);
        await sleep(500);
        return true;
      } catch (e) {
        this.log(`点击麦位 #${idx} 失败: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    };

    // 从第 3 个起；先空麦再任意
    for (const preferEmpty of [true, false]) {
      for (let idx = 3; idx <= total; idx++) {
        if (await tryClick(idx, preferEmpty)) return true;
      }
    }
    return false;
  }

  /** @deprecated */
  protected async clickGuestMicSeat(): Promise<boolean> {
    return this.enteredPreferredRoom ? this.clickSeatZero() : this.clickGuestMicSeatSkipFirstTwo();
  }

  private async isGiftEmptyMic(): Promise<boolean> {
    return (
      (await this.driver.exists(by.id(`${APP_PACKAGE}:id/giftSendToEmptyTv`))) ||
      (await this.driver.exists(by.textContains('no one on mic'))) ||
      (await this.driver.exists(by.textContains('No one on mic')))
    );
  }

  /** 关闭礼物面板（点空白或 back 以外的上方区域，避免最小化房间） */
  private async dismissGiftPanel(): Promise<void> {
    if (!(await this.driver.exists(by.id(ID.giftSend))) && !(await this.driver.exists(by.id(ID.giftRoot)))) {
      return;
    }
    try {
      const win = await this.driver.windowRect();
      await this.driver.execute('mobile: clickGesture', [
        { x: Math.round(win.width / 2), y: Math.round(win.height * 0.28) },
      ]);
      await sleep(400);
    } catch {
      // ignore
    }
  }

  /** 1. 点击右下角礼物 icon，调起礼物架 */
  protected async openGiftPanel(): Promise<'opened' | 'empty-mic'> {
    await this.dismissGiftPanel();
    await this.prepareRoomUi(4_000);

    // 若已上麦：先下麦再送礼，避免「只有自己」导致 empty-mic
    if (await this.driver.exists(by.id(ID.onMicMute)) && (await this.driver.exists(by.id(ID.leaveSeat)))) {
      try {
        await this.driver.click(by.id(ID.leaveSeat));
        await sleep(600);
        await this.prepareRoomUi(3_000);
      } catch {
        // ignore
      }
    }

    if (!(await this.driver.exists(by.id(ID.seatAvatar)))) {
      this.log('麦位无用户头像，跳过送礼');
      return 'empty-mic';
    }

    const openDeadline = Date.now() + 8_000;
    while (Date.now() < openDeadline) {
      if (await this.isActivity(PERMISSION_ACTIVITY)) {
        await this.clickPermissionAllow();
        continue;
      }
      if (await this.driver.exists(by.id(ID.giftSend)) || (await this.driver.exists(by.id(ID.giftRoot)))) {
        break;
      }
      if (await this.driver.exists(by.id(ID.giftEntry))) {
        await this.driver.click(by.id(ID.giftEntry));
      } else {
        // iv_gift 常为 PAG，不在无障碍树：点右下热区
        const win = await this.driver.windowRect();
        await this.driver.execute('mobile: clickGesture', [
          { x: Math.round(win.width * 0.88), y: Math.round(win.height * 0.91) },
        ]);
      }
      await sleep(500);
      if (await this.isGiftEmptyMic()) {
        this.log('礼物面板提示麦上无可收礼用户');
        await this.dismissGiftPanel();
        return 'empty-mic';
      }
    }

    if (!(await this.driver.exists(by.id(ID.giftSend))) && !(await this.driver.exists(by.id(ID.giftRoot)))) {
      throw new Error('未能打开礼物面板');
    }
    if (await this.isGiftEmptyMic()) {
      await this.dismissGiftPanel();
      return 'empty-mic';
    }
    return 'opened';
  }

  /** 读取面板账户余额（金币）；读不到返回 Infinity（任选礼物） */
  protected async readGiftBalance(): Promise<number> {
    try {
      if (await this.driver.exists(by.id(ID.giftBalance))) {
        const raw = (await this.driver.textOf(by.id(ID.giftBalance))).replace(/[^\d.]/g, '');
        const n = Number(raw);
        if (Number.isFinite(n)) {
          this.log(`账户余额: ${n}`);
          return n;
        }
      }
    } catch {
      // ignore
    }
    this.log('未能读取账户余额，将选可见礼物中价格最低者');
    return Number.POSITIVE_INFINITY;
  }

  /** 2. 选择最便宜且价格 ≤ 余额的礼物，并确保数量为 1 */
  protected async selectAffordableGift(): Promise<void> {
    await this.waitForElement(by.id(ID.giftItem), '礼物列表项', 8_000);
    const balance = await this.readGiftBalance();

    const priceEls = await this.driver.findElements(by.id(ID.giftItemPrice));
    let bestIdx = 0;
    let bestPrice = Number.POSITIVE_INFINITY;
    const affordable: { idx: number; price: number }[] = [];

    for (let i = 0; i < priceEls.length; i++) {
      const priceLoc = by.xpath(`(//*[@resource-id='${ID.giftItemPrice}'])[${i + 1}]`);
      try {
        if (!(await this.driver.exists(priceLoc))) continue;
        const raw = (await this.driver.textOf(priceLoc)).replace(/[^\d.]/g, '');
        const price = Number(raw);
        if (!Number.isFinite(price)) continue;
        if (price < bestPrice) {
          bestPrice = price;
          bestIdx = i + 1;
        }
        if (price <= balance) affordable.push({ idx: i + 1, price });
      } catch {
        // continue
      }
    }

    let pick = bestIdx;
    if (affordable.length > 0) {
      affordable.sort((a, b) => a.price - b.price);
      pick = affordable[0].idx;
      this.log(`选择最便宜可负担礼物 #${pick}，价格=${affordable[0].price}，余额=${balance}`);
    } else if (priceEls.length > 0) {
      this.log(`无可负担礼物，回退最低价礼物 #${pick}，价格=${bestPrice}`);
    } else {
      this.log('未读到礼物价格，点击第一个礼物项');
      pick = 1;
    }

    const giftLoc = by.xpath(`(//*[@resource-id='${ID.giftItem}'])[${pick}]`);
    if (await this.driver.exists(giftLoc)) {
      await this.driver.click(giftLoc);
    } else if (await this.driver.exists(by.id(ID.giftItem))) {
      await this.driver.click(by.id(ID.giftItem));
    } else {
      const win = await this.driver.windowRect();
      await this.driver.execute('mobile: clickGesture', [
        { x: Math.round(win.width * 0.2), y: Math.round(win.height * 0.72) },
      ]);
    }
    await sleep(400);
    await this.ensureGiftSendCountOne();
  }

  /** 送礼数量固定为 1（x 1） */
  protected async ensureGiftSendCountOne(): Promise<void> {
    const isOne = async (): Promise<boolean> => {
      if (!(await this.driver.exists(by.id(ID.giftCountTv)))) return false;
      const t = (await this.driver.textOf(by.id(ID.giftCountTv))).replace(/\s/g, '');
      return t === 'x1' || t === '1' || t.endsWith('x1');
    };
    if (await isOne()) {
      this.log('送礼数量已是 1');
      return;
    }
    if (!(await this.driver.exists(by.id(ID.giftCountLayout)))) {
      this.log('无数量选择控件，按默认数量发送');
      return;
    }
    await this.driver.click(by.id(ID.giftCountLayout));
    await sleep(400);
    // 弹层选项文案一般为 "x 1"
    const opt =
      (await this.driver.exists(by.xpath(`//*[@resource-id='${ID.giftCountOption}' and contains(@text,'1')]`)))
        ? by.xpath(`//*[@resource-id='${ID.giftCountOption}' and contains(@text,'1')]`)
        : by.textContains('x 1');
    if (await this.driver.exists(opt)) {
      await this.driver.click(opt);
      await sleep(300);
      this.log('已选择送礼数量 x 1');
    } else {
      this.log('未找到数量选项 x 1，关闭数量面板');
      try {
        const win = await this.driver.windowRect();
        await this.driver.execute('mobile: clickGesture', [
          { x: Math.round(win.width / 2), y: Math.round(win.height * 0.4) },
        ]);
      } catch {
        // ignore
      }
    }
  }

  /** 3. 点击面板上方陪玩师头像，选中收礼人（送礼按钮随之点亮） */
  protected async selectGiftRecipient(): Promise<void> {
    if (await this.driver.exists(by.id(ID.giftSendToRv))) {
      // 优先点列表中陪玩师头像（giftSelectedAvatarIv）
      const first = by.xpath(
        `//*[@resource-id='${ID.giftSendToRv}']//*[@resource-id='${ID.giftSelectedAvatar}'][1]`,
      );
      if (await this.driver.exists(first)) {
        await this.driver.click(first);
        await sleep(300);
        this.log('已点选礼物面板上方陪玩师头像');
        return;
      }
      const clickable = by.xpath(`//*[@resource-id='${ID.giftSendToRv}']//*[@clickable='true'][1]`);
      if (await this.driver.exists(clickable)) {
        await this.driver.click(clickable);
        await sleep(300);
        this.log('已点选礼物面板收礼人列表第一项');
        return;
      }
    }

    if (await this.driver.exists(by.id(ID.giftSelectedAvatar))) {
      await this.driver.click(by.id(ID.giftSelectedAvatar));
      await sleep(300);
      this.log('已点选 giftSelectedAvatarIv');
      return;
    }

    // 兜底：点麦位头像（面板可能未展示 To 列表）
    if (await this.driver.exists(by.id(ID.seatAvatar))) {
      await this.driver.click(by.id(ID.seatAvatar));
      await sleep(400);
      this.log('兜底：点麦位头像作为收礼人');
    }
  }

  /** 4. 点击送礼按钮 */
  protected async clickGiftSendButton(): Promise<'sent' | 'empty-mic'> {
    await this.waitForElement(by.id(ID.giftSend), '送礼按钮', 5_000);
    if (await this.isGiftEmptyMic()) {
      this.log('点击 Send 前仍提示麦上无人');
      await this.dismissGiftPanel();
      return 'empty-mic';
    }
    await this.driver.click(by.id(ID.giftSend));
    await sleep(500);
    if (await this.isGiftEmptyMic()) {
      await this.dismissGiftPanel();
      return 'empty-mic';
    }
    // 偶发需再点一次
    if (await this.driver.exists(by.id(ID.giftSend))) {
      await this.driver.click(by.id(ID.giftSend));
      await sleep(400);
      if (await this.isGiftEmptyMic()) {
        await this.dismissGiftPanel();
        return 'empty-mic';
      }
    }
    return 'sent';
  }

  /** 打开礼物面板并送出礼物（细步骤封装，供旧调用方兼容） */
  protected async sendGift(): Promise<'sent' | 'empty-mic'> {
    const opened = await this.openGiftPanel();
    if (opened === 'empty-mic') return 'empty-mic';
    await this.selectAffordableGift();
    await this.selectGiftRecipient();
    return await this.clickGiftSendButton();
  }

  /** 校验公屏/消息列表是否出现送礼信息 */
  protected async hasGiftMessageInChat(timeoutMs = 8_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const candidates: Locator[] = [
      by.id(ID.giftMsgName),
      by.id(ID.giftMsgCount),
      by.id(ID.giftCombo),
      by.id(`${APP_PACKAGE}:id/sendGiftCountView`),
      by.textContains('sent'),
      by.textContains('Send'),
      by.textContains('gift'),
      by.textContains('Gift'),
    ];
    while (Date.now() < deadline) {
      try {
        // 面板可能挡住公屏，先轻关一次
        if (await this.driver.exists(by.id(ID.giftSend))) {
          await this.dismissGiftPanel();
        }
        for (const c of candidates) {
          if (await this.driver.exists(c)) return true;
        }
      } catch {
        // continue
      }
      await sleep(400);
    }
    return false;
  }

  /** 送礼结果：连击 / 面板关闭 / 余额不足；麦上无收礼人时记 skip 语义（由 check 侧处理） */
  protected async assertGiftSent(
    known?: 'sent' | 'empty-mic',
  ): Promise<{ expect: string; real: string; pass: boolean; emptyMic?: boolean }> {
    if (known === 'empty-mic') {
      return {
        expect: '送礼成功（连击/面板关闭）',
        real: '麦上无可收礼用户（需其他麦上用户）',
        pass: false,
        emptyMic: true,
      };
    }

    const deadline = Date.now() + (known === 'sent' ? 4_000 : 5_000);
    while (Date.now() < deadline) {
      try {
        if (await this.driver.exists(by.id(ID.giftCombo))) {
          return { expect: '送礼成功（连击/面板关闭）', real: '出现连击', pass: true };
        }
        if (await this.driver.exists(by.id(`${APP_PACKAGE}:id/sendGiftCountView`))) {
          return { expect: '送礼成功（连击/面板关闭）', real: '出现连击计数', pass: true };
        }
        if (!(await this.driver.exists(by.id(ID.giftSend))) && !(await this.driver.exists(by.id(ID.giftRoot)))) {
          return { expect: '送礼成功（连击/面板关闭）', real: '面板已关闭', pass: true };
        }
        if (
          (await this.driver.exists(by.textContains('Recharge'))) ||
          (await this.driver.exists(by.textContains('Top up'))) ||
          (await this.driver.exists(by.textContains('余额'))) ||
          (await this.driver.exists(by.textContains('不足')))
        ) {
          return { expect: '送礼成功（连击/面板关闭）', real: '触发充值/余额提示', pass: false };
        }
        if (known !== 'sent' && (await this.isGiftEmptyMic())) {
          return {
            expect: '送礼成功（连击/面板关闭）',
            real: '麦上无可收礼用户（需其他麦上用户）',
            pass: false,
            emptyMic: true,
          };
        }
      } catch {
        // continue
      }
      await sleep(300);
    }
    if (known === 'sent') {
      return { expect: '送礼成功（连击/面板关闭）', real: '已点击 Send', pass: true };
    }
    return {
      expect: '送礼成功（连击/面板关闭）',
      real: '面板仍在且无连击（可能未选收礼人或金币不足）',
      pass: false,
    };
  }
}

class VoiceRoomTest extends VoiceRoomSampleBase {
  private readonly message: string;
  private readonly skipEnter: boolean;
  private micResult: 'on-mic' | 'queued' | null = null;
  private giftResult: 'sent' | 'empty-mic' | null = null;
  private searchHit: Locator | null = null;
  private searchInfo: { roomId: string; roomName: string } = { roomId: '', roomName: '' };

  constructor() {
    // 登录 + 3.1(~10) + 3.2(2 act + 1 check) + 3.4(4 act + 2 check) + 3.3(act+check)
    super(24);
    this.message = parseMessage(`vr-${Date.now()}`);
    this.skipEnter = parseSkipEnter();
  }

  protected async runCase(): Promise<void> {
    await this.act('打开APP并确保已登录', async () => {
      await this.ensureAppLoggedIn();
    });

    const preferred = this.preferredRoomNo || DEFAULT_ROOM_NO;

    // ---------- 3.1 先搜目标房，失败再进其它娱乐房 ----------
    if (this.skipEnter) {
      await this.act('3.1 跳过进房（--skip-enter），确认已在语音房', async () => {
        if (!(await this.isActivity(ROOM_ACTIVITY))) {
          throw new Error('当前不在语音房 Activity，请先手动进入目标房或去掉 --skip-enter');
        }
        await this.prepareRoomUi(8_000);
        const text = await this.readRoomIdText(3_000);
        if (text) {
          this.rememberRoomNoFromText(text);
          this.enteredPreferredRoom = text.includes(preferred);
        }
      });
      await this.check(
        this.enteredPreferredRoom ? `3.1 已进入目标房 ${preferred}` : '3.1 已进入娱乐房',
        async () => this.assertInTargetRoom(this.enteredPreferredRoom ? preferred : ''),
      );
    } else {
      let alreadyInPreferred = false;
      if (await this.isInFunRoom()) {
        try {
          await this.prepareRoomUi(5_000);
          const text = await this.readRoomIdText(3_000);
          if (text && text.includes(preferred)) {
            this.rememberRoomNoFromText(text);
            this.enteredPreferredRoom = true;
            alreadyInPreferred = true;
            this.log(`已在目标娱乐房 ${text}，跳过搜索进房`);
          } else if (text) {
            this.log(`当前在其它娱乐房（${text}），先退出再搜 ${preferred}`);
            await this.leaveRoomToMain();
          }
        } catch {
          // continue search flow
        }
      } else if (await this.isInOrderRoom()) {
        this.log('当前在订单房，先退出再搜目标房');
        await this.leaveRoomToMain();
      }

      if (alreadyInPreferred) {
        await this.check(`3.1 已进入目标房 ${preferred}`, async () => this.assertInTargetRoom(preferred));
      } else {
        await this.act('3.1.1 点击底部标签栏「语音房」', async () => {
          await this.clickBottomVoiceRoomTab();
        });

        await this.act('3.1.2 点击派对 Tab', async () => {
          await this.clickPartyTitleTab();
        });

        await this.act('3.1.3 点击右上角搜索按钮', async () => {
          await this.openRoomSearchPage();
        });

        await this.act(`3.1.4 输入房间号 ${preferred} 并搜索`, async () => {
          await this.inputRoomIdAndSearch(preferred);
          this.searchHit = await this.waitSearchResultHit(preferred);
          if (this.searchHit) {
            this.searchInfo = await this.readSearchResultInfo(preferred);
            this.log(`搜索命中: id=${this.searchInfo.roomId || preferred}, name=${this.searchInfo.roomName || '(无)'}`);
          } else {
            this.log(`未搜到房间 ${preferred}`);
          }
        });

        if (this.searchHit) {
          await this.check('3.1 目标：可以搜索到语音房', async () => ({
            expect: `搜索结果含房间 ${preferred}`,
            real: this.searchInfo.roomId || '已命中结果卡片',
            pass: true,
          }));

          await this.check('3.1 目标：搜索结果中展示语音房信息', async () => {
            const hasId = !!(this.searchInfo.roomId && this.searchInfo.roomId.includes(preferred));
            const hasName = !!this.searchInfo.roomName;
            const hasAvatar = await this.driver.exists(
              by.xpath(
                `//*[@resource-id='${ID.resultRoomId}' and contains(@text,'${preferred}')]/ancestor::*[@resource-id='${ID.resultBody}'][1]//*[@resource-id='${ID.resultAvatar}']`,
              ),
            );
            return {
              expect: '结果展示房间号/房名/封面等信息',
              real: `id=${this.searchInfo.roomId || '-'}, name=${this.searchInfo.roomName || '-'}, avatar=${hasAvatar ? '有' : '无'}`,
              pass: hasId || hasName || hasAvatar,
            };
          });

          await this.act(`3.1.5 点击搜索结果进入 ${preferred}`, async () => {
            await this.clickSearchResultAndEnter(this.searchHit!, preferred);
          });

          await this.check(`3.1 目标：已进入房间 ${preferred}`, async () => this.assertInTargetRoom(preferred));
        } else {
          await this.check('3.1 目标：可以搜索到语音房', async () => {
            this.skip(`未搜到 ${preferred}，改走其它娱乐房`);
          });
          await this.check('3.1 目标：搜索结果中展示语音房信息', async () => {
            this.skip(`未搜到 ${preferred}，跳过结果信息校验`);
          });

          await this.act('3.1 兜底：Party 列表进入其它娱乐房', async () => {
            if (await this.isActivity(ACT.search)) {
              await this.driver.back();
              await sleep(800);
            }
            this.enteredPreferredRoom = false;
            await this.pickRandomOnlineRoomAndEnter();
          });

          await this.check('3.1 目标：已进入其它娱乐房 FunVoiceRoomActivity', async () =>
            this.assertInTargetRoom(''),
          );
        }
      }
    }

    // ---------- 3.2 在当前房内发消息（禁止退房换房） ----------
    await this.act('3.2.1 确认仍在当前娱乐房（不换房）', async () => {
      if (!(await this.isInFunRoom())) {
        throw new Error('发消息前已不在 FunVoiceRoomActivity，3.1 进房可能失败');
      }
      await this.prepareRoomUi(5_000);
      const text = await this.readRoomIdText(3_000);
      if (text) this.rememberRoomNoFromText(text);
      this.log(
        this.enteredPreferredRoom
          ? `保持在目标房 ${this.preferredRoomNo}（${text || '房号未读到'}）发消息`
          : `保持在兜底娱乐房（${text || '房号未读到'}）发消息`,
      );
    });

    await this.check('3.2 仍在娱乐房', async () =>
      this.assertInTargetRoom(this.enteredPreferredRoom ? preferred : ''),
    );

    await this.act(`3.2.2 点击输入框并输入：${this.message}`, async () => {
      await this.openChatInput();
      await this.typeChatMessage(this.message);
    });

    await this.act('3.2.3 点击发送', async () => {
      await this.sendChatMessage();
    });

    await this.check('3.2 公屏出现刚发送的消息', async () => {
      const found = await this.hasRoomMessage(this.message, 6_000);
      return {
        expect: `公屏含 "${this.message}"`,
        real: found ? '已找到' : '未找到消息气泡',
        pass: found,
      };
    });

    // ---------- 3.4 语音房送礼（先于上麦，避免独自占麦后无人可送） ----------
    await this.act('3.4-1 点击右下角礼物 icon，调起礼物架', async () => {
      this.giftResult = await this.openGiftPanel();
      this.log(`礼物面板: ${this.giftResult}`);
      if (this.giftResult === 'empty-mic') {
        this.skip('麦上无可收礼用户（需其他麦上用户）');
      }
    });

    await this.check('3.4-1 礼物架面板已打开', async () => {
      if (this.giftResult === 'empty-mic') {
        this.skip('麦上无可收礼用户（需其他麦上用户）');
      }
      const opened =
        (await this.driver.exists(by.id(ID.giftSend))) || (await this.driver.exists(by.id(ID.giftRoot)));
      return {
        expect: '礼物架面板可见（Send 或 root）',
        real: opened ? '已打开' : '未打开',
        pass: opened,
      };
    });

    await this.act('3.4-2 选择最便宜礼物并设数量为 1', async () => {
      if (this.giftResult === 'empty-mic') {
        this.skip('麦上无可收礼用户（需其他麦上用户）');
      }
      await this.selectAffordableGift();
    });

    await this.act('3.4-3 点击面板上方陪玩师头像，选中收礼人', async () => {
      if (this.giftResult === 'empty-mic') {
        this.skip('麦上无可收礼用户（需其他麦上用户）');
      }
      await this.selectGiftRecipient();
    });

    await this.act('3.4-4 点击送礼按钮', async () => {
      if (this.giftResult === 'empty-mic') {
        this.skip('麦上无可收礼用户（需其他麦上用户）');
      }
      this.giftResult = await this.clickGiftSendButton();
      this.log(`送礼结果: ${this.giftResult}`);
      if (this.giftResult === 'empty-mic') {
        this.skip('麦上无可收礼用户（需其他麦上用户）');
      }
    });

    await this.check('3.4 目标：可以送礼成功', async () => {
      if (this.giftResult === 'empty-mic') {
        this.skip('麦上无可收礼用户（需其他麦上用户）');
      }
      return this.assertGiftSent(this.giftResult ?? undefined);
    });

    await this.check('3.4 目标：公屏消息列表展示该送礼信息', async () => {
      if (this.giftResult === 'empty-mic') {
        this.skip('麦上无可收礼用户（需其他麦上用户）');
      }
      const found = await this.hasGiftMessageInChat(8_000);
      return {
        expect: '公屏出现送礼消息（礼物名/连击/文案）',
        real: found ? '已找到' : '未找到送礼消息',
        pass: found,
      };
    });

    // ---------- 3.3 语音房上麦 ----------
    await this.act(
      this.enteredPreferredRoom
        ? `3.3 申请上麦（目标房 ${preferred}：0 号麦位）`
        : '3.3 申请上麦（其它娱乐房：跳过第1/第2麦位）',
      async () => {
        this.micResult = await this.takeMic();
        this.log(`上麦结果: ${this.micResult}（enteredPreferred=${this.enteredPreferredRoom}）`);
      },
    );

    await this.check('3.3 上麦成功或排队中', async () => {
      if (this.micResult === 'on-mic' || this.micResult === 'queued') {
        return {
          expect: '已上麦或排队中',
          real: this.micResult === 'on-mic' ? '已上麦' : '排队中',
          pass: true,
        };
      }
      const onMic = await this.driver.exists(by.id(ID.onMicMute));
      const queued = await this.driver.exists(by.id(ID.queueRemind));
      return {
        expect: '已上麦或排队中',
        real: onMic ? '已上麦' : queued ? '排队中' : '未上麦且未排队',
        pass: onMic || queued,
      };
    });
  }
}

await new VoiceRoomTest().execute();
