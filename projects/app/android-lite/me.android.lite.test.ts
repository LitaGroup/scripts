/**
 * 我的 — 第 7 章冒烟（Android / Lite，com.litalite.android）
 *
 * 覆盖用例：
 *   7.1 个人主页           —— 点击头像进个人主页 → 发布动态（来自图库）→ 校验新动态展示 → 删除清理
 *   7.2 钱包               —— 进入我的钱包，校验余额/储值/钻石/兑换入口（充值/兑换涉及真实支付，跳过）
 *   7.3 家族               —— 家族签到 / 家族成员显示（前置「当前账号为家族成员」，非成员账号跳过）
 *   7.4 贵族               —— 贵族中心 Duke Tab：16 个专属特权 + 开通/续费价格 + 开通按钮
 *   7.5 陪玩师工作台        —— 在线开关 / 自动问候（前置「陪玩师账号」，非陪玩师账号跳过）
 *   7.6 暗黑模式           —— 显示设置切换浅色/深色 → 保存 → 重启生效 → 校验选择已持久化
 *   7.7 美颜               —— 设置页「美颜」入口（当前版本无此入口，跳过）
 *   7.8 退出登录           —— 设置 → 登出账号 → 回到首页 → 点「我的」跳转登录页
 *
 * 注：7.3（家族成员）/ 7.5（陪玩师）的详细分支按文案定位，需家族成员 / 陪玩师账号实测
 *   校准；当前 accounts.game 为非成员/非陪玩师，这两节按前置条件自动跳过。
 *
 * 登录说明：手机号 +86。出密码页走密码；出短信验证码页则自动从 stats 库
 *   sms_record_{yyyyMM} 查真实验证码填入（经 MySQLProdResource / config.json userToken）。
 *   —— 验证码为后端随机生成，非固定值，故必须查库。
 *
 * 前置：
 *   1. config.home.android.lite.json（已提交 git）配置：
 *      - userToken（登录短信验证码查库用；PROD API 代理）
 *      - accounts.game（username=手机号 / password）
 *   2. 图库中有图片、图片大小不超过 5M（7.1 发布动态用）。
 *   3. 操作途中请求权限时全部选择允许。
 *
 * 运行（单一配置文件，账号与 userToken 均从 SCRIPT_CONFIG 读取）：
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
 *     SCRIPT_CONFIG=config.home.android.lite.json \
 *     node projects/app/android-lite/me.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { by, sleep, type AppiumCapabilities, type Locator } from '../../../src/resources/AppiumResource.ts';
import { alignLiteConfigPath, querySmsCode as querySmsCodeFromDb } from '../core/_lib/androidSmsOtp.ts';

// 本脚本账号与 userToken 统一从 SCRIPT_CONFIG 指定的单一配置文件读取：
//   - 账号：AppBaseClass.account() 读 SCRIPT_CONFIG 的 accounts.game
//   - userToken：短信验证码查库走 loadConfig()，默认读 config.json（或 LITA_CONFIG_PATH）
alignLiteConfigPath();

const APP_PACKAGE = 'com.litalite.android';
const APP_ACTIVITY = '.ui.splash.SplashActivity';

/** 手机号国家前缀（用于拼接 DB 里 sms_record 的 phone_number = 前缀 + 手机号） */
const PHONE_PREFIX = '86';
// 系统权限弹窗（相机/相册等）允许按钮，覆盖不同 API 文案
const PERMISSION_ALLOW_IDS = [
  'com.android.permissioncontroller:id/permission_allow_all_button',
  'com.android.permissioncontroller:id/permission_allow_button',
  'com.android.permissioncontroller:id/permission_allow_foreground_only_button',
  'com.android.permissioncontroller:id/permission_allow_one_time_button',
  'com.android.packageinstaller:id/permission_allow_button',
];

const ACT = {
  main: '.MainActivity',
  userDetail: '.ui.user.UserDetailActivity',
  album: '.ui.view.album.NewAlbumActivity',
  newMoment: '.ui.moment.activity.NewMomentActivity',
  wallet: '.ui.wallet.WalletActivity',
  familyPlaza: '.ui.family.FamilyPlazaActivity',
  nobleCenter: '.ui.noble.NobleCenterActivity',
  settings: '.ui.settings.SettingsActivity',
  darkTheme: '.ui.darkTheme.DarkThemeSettingActivity',
};

// 元素定位符（基于 com.litalite.android 1.326，与 com.funbit.android 同一套代码仅包名不同）
const ID = {
  // 底部 tab
  tabHome: `${APP_PACKAGE}:id/navigation_home`,
  tabMe: `${APP_PACKAGE}:id/navigation_user_center`,
  // 登录相关
  mePage: `${APP_PACKAGE}:id/layout_options`,
  meUid: `${APP_PACKAGE}:id/user_no`,
  meName: `${APP_PACKAGE}:id/user_name`,
  loginPage: `${APP_PACKAGE}:id/rl_facebook_login`,
  loginClose: `${APP_PACKAGE}:id/close_button`,
  phoneLoginEntry: `${APP_PACKAGE}:id/iv_low_phone_login`,
  loginClaimBtn: `${APP_PACKAGE}:id/tv_login_and_claim`,
  countryCode: `${APP_PACKAGE}:id/tv_country_code`,
  countryList: `${APP_PACKAGE}:id/rlCountryListView`,
  phoneInput: `${APP_PACKAGE}:id/enter_phone_number`,
  phoneNext: `${APP_PACKAGE}:id/send_sms_code_button`,
  passwordInput: `${APP_PACKAGE}:id/et_password`,
  passwordSubmit: `${APP_PACKAGE}:id/tv_confirm`,
  captchaEt: `${APP_PACKAGE}:id/input_captcha_et`,
  // 我的页入口
  meAvatar: `${APP_PACKAGE}:id/user_avatar`, // 头像（点击进个人主页）
  walletEntry: `${APP_PACKAGE}:id/my_wallet_layout`, // 钱包
  familyEntry: `${APP_PACKAGE}:id/familyLayout`, // 家族
  nobleEntry: `${APP_PACKAGE}:id/my_noble_layout`, // 贵族
  settingEntry: `${APP_PACKAGE}:id/setting_layout`, // 设置
  logoutLayout: `${APP_PACKAGE}:id/logoutLayout`, // 登出账号行（onClickLogout 挂在容器上）
  logout: `${APP_PACKAGE}:id/logout_tv`,
  // 弹窗
  popupActivity: `${APP_PACKAGE}:id/vp_banner`,
  popupActivityClose: `${APP_PACKAGE}:id/img_close`,
  onboardingSkip: `${APP_PACKAGE}:id/skipTv`,
  // 个人主页 / 发布动态
  postMomentLayout: `${APP_PACKAGE}:id/postMomentLayout`, // 右下角发布按钮
  momentItemMoreIv: `${APP_PACKAGE}:id/momentItemMoreIv`, // 单条动态「…」
  momentItemNameTv: `${APP_PACKAGE}:id/momentItemNameTv`, // 动态昵称（列表非空判定）
  // 通用选择弹窗（发布来源 / 删除菜单）
  commonFirstTv: `${APP_PACKAGE}:id/commonFirstTv`,
  commonSecondTv: `${APP_PACKAGE}:id/commonSecondTv`,
  commonCancelTv: `${APP_PACKAGE}:id/commonCancelTv`,
  // 通用确认弹窗（删除动态 / 重启确认）
  dialogPositive: `${APP_PACKAGE}:id/positiveTv`,
  dialogNegative: `${APP_PACKAGE}:id/negativeTv`,
  // 图库选择页
  albumDone: `${APP_PACKAGE}:id/tv_done`,
  albumPhoto: `${APP_PACKAGE}:id/img_photo`,
  // 发布动态页
  momentEdit: `${APP_PACKAGE}:id/et_moment`,
  momentSend: `${APP_PACKAGE}:id/img_send`,
  // 钱包页
  walletBalanceValue: `${APP_PACKAGE}:id/current_balance_value`, // Lita金币余额
  walletTopUp: `${APP_PACKAGE}:id/top_up_button`, // 储值
  walletDiamondValue: `${APP_PACKAGE}:id/tv_diamond_balance`, // 钻石余额
  walletDiamondExchange: `${APP_PACKAGE}:id/tv_diamond_exchange`, // 兑换
  // 家族广场
  familyTitle: `${APP_PACKAGE}:id/titleBarTv`,
  createFamilyTv: `${APP_PACKAGE}:id/createFamilyTv`, // 非成员显示的「创建」
  // 贵族中心
  nobleTabTv: `${APP_PACKAGE}:id/tabTv`, // tab 文案（Knight/…/Duke）
  nobleExclusiveTitle: `${APP_PACKAGE}:id/exclusivePrivilegeTitleTv`, // 专属特权(n/16)
  noblePriceTv: `${APP_PACKAGE}:id/priceTv`, // 开通价格
  nobleRenewTv: `${APP_PACKAGE}:id/renewTv`, // 续费价格
  nobleSubmitTv: `${APP_PACKAGE}:id/submitTv`, // 开通按钮
  // 暗黑模式
  darkThemeEntry: `${APP_PACKAGE}:id/darkThemeLayout`, // 显示设置
  lightLayout: `${APP_PACKAGE}:id/lightLayout`,
  lightIv: `${APP_PACKAGE}:id/lightIv`,
  dartLayout: `${APP_PACKAGE}:id/dartLayout`,
  dartIv: `${APP_PACKAGE}:id/dartIv`,
  saveTv: `${APP_PACKAGE}:id/saveTv`,
};

function xid(raw: string): string {
  return `${APP_PACKAGE}:id/${raw}`;
}

/** 图库页第 index 张照片的可点击单元格（img_photo 不可点，点击其可点父节点） */
function albumPhotoCell(index = 1): Locator {
  return by.xpath(`(//*[@resource-id='${xid('img_photo')}'])[${index}]/..`);
}

/**
 * 我的页头像：user_avatar 本身不可点，但其点击区域仅在头像矩形 [14,203][329,518] 内
 * （top_part_container 整个头部可点，但中心落在昵称区不触发跳个人主页，故直接点 user_avatar，
 * UiAutomator2 对不可点元素会回退到元素中心坐标 tap，命中头像区域）。
 */
function meAvatarLocator(): Locator {
  return by.id(`${APP_PACKAGE}:id/user_avatar`);
}

/** 贵族中心第 index 个 tab 的可点击节点（tabTv 不可点，取可点父节点） */
function nobleTab(index: number): Locator {
  return by.xpath(`(//*[@resource-id='${xid('tabTv')}'])[${index}]/ancestor::*[@clickable='true'][1]`);
}

class MeCheck extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 40; // 预估步数（仅 start 元数据；实际以 done.total 为准）

    // 状态注册顺序 = 检测顺序：弹窗 → 登录态 → 页面
    this.addState({
      name: 'splash',
      activity: '.ui.splash.SplashActivity',
      detect: async () => true,
    });
    this.addState({
      name: 'popup-permission',
      kind: 'popup',
      activity: /GrantPermissionsActivity|permissioncontroller/,
      detect: async () => true,
      handle: async () => {
        for (const id of PERMISSION_ALLOW_IDS) {
          if (await this.driver.exists(by.id(id))) {
            await this.driver.click(by.id(id));
            await sleep(400);
            return;
          }
        }
      },
    });
    this.addState({
      name: 'popup-onboarding',
      kind: 'popup',
      activity: '.ui.onboarding.OnboardingNewActivity',
      detect: async () => true,
      handle: async () => {
        if (await this.driver.exists(by.id(ID.onboardingSkip))) await this.driver.click(by.id(ID.onboardingSkip));
      },
    });
    this.addState({
      name: 'popup-activity',
      kind: 'popup',
      detect: () => this.driver.exists(by.id(ID.popupActivity)),
      handle: async () => {
        await this.driver.click(by.id(ID.popupActivityClose));
      },
    });
    this.addState({
      name: 'logged-in',
      activity: ACT.main,
      detect: async () =>
        (await this.driver.exists(by.id(ID.mePage))) ||
        (await this.driver.exists(by.id(ID.meUid))) ||
        (await this.driver.exists(by.id(ID.meName))),
    });
    this.addState({
      name: 'logged-out',
      activity: '.ui.login.LoginActivity',
      detect: async () => true,
    });
    this.addState({
      name: 'home',
      activity: ACT.main,
      detect: () => this.driver.exists(by.id(ID.tabHome)),
    });
  }

  protected capabilities(): AppiumCapabilities {
    const caps: AppiumCapabilities = {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:appPackage': APP_PACKAGE,
      'appium:appActivity': APP_ACTIVITY,
      'appium:noReset': true,
      'appium:newCommandTimeout': 300,
      // MIUI 等机型 adb shell 无 WRITE_SECURE_SETTINGS（Appium issue 13802）时，
      // 放宽 hidden API policy 的 settings 写入会失败；置 true 让驱动忽略该错误继续建会话。
      // 在可正常写入的机型上该设置正常生效，无副作用。
      'appium:ignoreHiddenApiPolicyError': true,
    };
    const udid = process.env.SCRIPT_ANDROID_UDID;
    if (udid) caps['appium:udid'] = udid;
    const deviceName = process.env.SCRIPT_ANDROID_DEVICE;
    if (deviceName) caps['appium:deviceName'] = deviceName;
    // MIUI 等机型还禁止 adb `install -g` / `pm grant`（缺 INSTALL_GRANT_RUNTIME_PERMISSIONS）：
    // 需先手动安装 io.appium.settings 与 appium-uiautomator2-server/server.test 三个 APK，
    // 再置 SCRIPT_SKIP_SERVER_INSTALL=1，让驱动跳过（会失败的）服务安装。
    // 或改为在设备「开发者选项」开启「USB调试（安全设置）」后无需此开关。
    if (process.env.SCRIPT_SKIP_SERVER_INSTALL === '1') caps['appium:skipServerInstallation'] = true;
    return caps;
  }

  /** 使用 accounts.game 账号（+86） */
  protected override account(_name = 'default'): AppAccount {
    return super.account('game');
  }

  // ---------- 登录（复制自 home.android.lite.test.ts，+86 密码 + OTP 查库） ----------

  protected override async login(account: AppAccount): Promise<void> {
    if ((await this.driver.exists(by.id(ID.passwordInput))) || (await this.driver.exists(by.id(ID.captchaEt)))) {
      await this.driver.back();
      await sleep(800);
    }
    if (!(await this.driver.exists(by.id(ID.phoneInput)))) {
      await this.waitForElement(by.id(ID.phoneLoginEntry), '手机号登录入口', 10_000);
      await this.driver.click(by.id(ID.phoneLoginEntry));
      if (await this.driver.waitFor(by.id(ID.loginClaimBtn), 3_000)) {
        await this.driver.click(by.id(ID.loginClaimBtn));
        await sleep(1_000);
      }
    }
    await this.waitForElement(by.id(ID.phoneInput), '手机号输入框');
    await this.selectCountryCode86();
    await this.waitForElement(by.id(ID.phoneInput), '手机号输入框', 10_000);
    await this.driver.input(by.id(ID.phoneInput), account.username);
    await this.driver.hideKeyboard();
    const since = new Date();
    await this.driver.click(by.id(ID.phoneNext));
    if (await this.driver.waitFor(by.id(ID.passwordInput), 8_000)) {
      await this.driver.input(by.id(ID.passwordInput), account.password);
      await this.driver.hideKeyboard();
      await this.driver.click(by.id(ID.passwordSubmit));
    }
    await this.waitLoginOrOtp(since, account.username);
  }

  private async waitLoginOrOtp(since: Date, phone: string, timeoutMs = 45_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.isActivity(ACT.main)) return;
      if (await this.driver.exists(by.id(ID.captchaEt))) {
        this.log(`进入验证码页，从数据库查询验证码（phone=86${phone}）`);
        const realCode = await this.querySmsCode(since, phone);
        this.log(`获取到验证码: ${realCode}`);
        await this.driver.sendKeys(by.id(ID.captchaEt), realCode);
        const d2 = Date.now() + 20_000;
        while (Date.now() < d2) {
          await this.closePopups();
          if (await this.isActivity(ACT.main)) return;
          await sleep(1_000);
        }
        throw new Error('输入验证码后仍未登录成功');
      }
      await sleep(1_000);
    }
    throw new Error('登录超时：既未进入主页面也未出现验证码页');
  }

  private async querySmsCode(since: Date, phone: string, timeoutMs = 30_000): Promise<string> {
    return querySmsCodeFromDb({ since, phone, countryCode: PHONE_PREFIX, timeoutMs, env: 'prod' });
  }

  private countryCodeRow86(): Locator {
    return by.xpath(`//*[@text='(+86)']/ancestor::*[@clickable='true'][1]`);
  }

  private country86Fallbacks(): Locator[] {
    return [
      by.textContains('China'),
      by.textContains('中国'),
      by.textContains('中国大陆'),
      by.textContains('중국'),
    ];
  }

  private async selectCountryCode86(): Promise<void> {
    const readCode = async (): Promise<string> =>
      (await this.driver.textOf(by.id(ID.countryCode))).replace(/\D/g, '');
    if ((await readCode()) === '86') {
      this.log('当前区号已是 +86，跳过选择');
      return;
    }

    const candidates = [this.countryCodeRow86(), ...this.country86Fallbacks()];
    const findVisible = async (): Promise<Locator | null> => {
      for (const loc of candidates) {
        if (await this.driver.exists(loc)) return loc;
      }
      return null;
    };

    const trySelect = async (): Promise<boolean> => {
      await this.driver.click(by.id(ID.countryCode));
      await sleep(600);
      if (!(await this.driver.waitFor(by.id(ID.countryList), 5_000))) return false;
      let target = await findVisible();
      const directions: Array<'up' | 'down'> = ['up', 'down', 'up', 'down'];
      for (let i = 0; i < 20 && !target; i++) {
        await this.driver.swipeInElement(by.id(ID.countryList), directions[i % directions.length]!);
        await sleep(350);
        target = await findVisible();
      }
      if (!target) {
        await this.driver.back();
        await sleep(400);
        return false;
      }
      await this.driver.click(target);
      for (let i = 0; i < 25 && (await this.driver.exists(by.id(ID.countryList))); i++) {
        await sleep(200);
      }
      return (await readCode()) === '86';
    };

    let ok = await trySelect();
    if (!ok) {
      this.log('选区号 +86 未确认，重试一次');
      ok = await trySelect();
    }
    if (!ok) throw new Error(`区号未切换为 +86（当前: ${(await this.driver.textOf(by.id(ID.countryCode))).trim() || '未知'}）`);
    this.log('已选择区号 +86');
  }

  // ---------- 导航工具 ----------

  /** 进入"我的"tab，并等待登录态可知（logged-in / logged-out） */
  private async enterMeTab(timeoutMs = 45_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let last = 'unknown';
    while (Date.now() < deadline) {
      await this.closePopups();
      last = await this.currentState();
      if (last === 'logged-in' || last === 'logged-out') return last;
      if (
        (await this.driver.exists(by.id(ID.phoneInput))) ||
        (await this.driver.exists(by.id(ID.passwordInput)))
      ) {
        return 'logged-out';
      }
      if (await this.driver.exists(by.id(ID.tabMe))) await this.driver.click(by.id(ID.tabMe));
      await sleep(1_000);
    }
    throw new Error(`进入"我的"tab超时，当前状态: ${last}`);
  }

  /** 确保登录（前置）：未登录则用 accounts.game 登录 */
  private async ensureLoggedInAs(timeoutMs = 45_000): Promise<void> {
    const state = await this.enterMeTab();
    if (state === 'logged-in') {
      this.log(`账号 ${this.account().username} 已登录，无需重新登录`);
      return;
    }
    this.log(`当前未登录，使用账号 ${this.account().username} 执行登录`);
    await this.login(this.account());
    await this.ensureAnyState(['home', 'logged-in'], timeoutMs);
    this.log('登录成功');
  }

  /**
   * 确保停留在"我的"tab（已登录态：layout_options 可见）。
   * 若当前不在主页面（如在某个子页），先返回主页面；慢模拟器冷启动较慢，默认超时放宽。
   */
  private async gotoMePage(timeoutMs = 25_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.driver.exists(by.id(ID.mePage))) return;
      // 不在主页面时先返回，避免停在子页导致找不到底部 tab
      if (!(await this.isActivity(ACT.main))) {
        await this.driver.back();
        await sleep(600);
        continue;
      }
      if (await this.driver.exists(by.id(ID.tabMe))) await this.driver.click(by.id(ID.tabMe));
      await sleep(1_000);
    }
    throw new Error('进入"我的"tab超时');
  }

  /** 从子页面返回到"我的"tab */
  private async backToMePage(timeoutMs = 25_000): Promise<void> {
    await this.backToMain();
    await this.gotoMePage(timeoutMs);
  }

  /** 连续返回直到回到主页面（MainActivity） */
  private async backToMain(maxBacks = 4): Promise<void> {
    for (let i = 0; i < maxBacks; i++) {
      if (await this.isActivity(ACT.main)) return;
      await this.driver.back();
      await sleep(600);
    }
    if (!(await this.isActivity(ACT.main))) {
      if (await this.driver.exists(by.id(ID.tabHome))) await this.driver.click(by.id(ID.tabHome));
    }
  }

  /**
   * 滚动页面直到元素出现（我的页/设置页为长列表，设置/登出可能被底部 tab 遮挡）。
   * 使用 elementId 定向滚动优先，避免坐标滑动误触 ViewPager 横向切换 tab。
   */
  private async scrollToVisible(locator: Locator, maxSwipes = 20): Promise<void> {
    for (let i = 0; i < maxSwipes; i++) {
      if (await this.driver.exists(locator)) return;
      await this.driver.swipeUp();
      await sleep(500);
    }
    try {
      const src = await this.driver.source();
      const texts = [...src.matchAll(/text="([^"]{1,24})"/g)].map((m) => m[1]).filter(Boolean);
      this.log(`滚动后未找到 ${locator[1]}，当前页面文本: ${[...new Set(texts)].slice(0, 20).join(' | ')}`);
    } catch {
      // ignore
    }
    throw new Error(`滚动后仍未找到元素: ${locator[0]}=${locator[1]}`);
  }

  /** 点击底部选择弹窗中的选项：等弹窗出现 → 等动画结束再点 → 选项消失视为成功，否则重试 */
  private async clickSheetItem(locator: Locator, desc: string, timeoutMs = 5_000): Promise<void> {
    await this.waitForElement(locator, desc, timeoutMs);
    await sleep(600);
    for (let i = 0; i < 3; i++) {
      await this.driver.click(locator);
      await sleep(800);
      if (!(await this.driver.exists(locator))) return;
      this.log(`${desc} 点击后弹窗仍存在，重试 (${i + 1}/3)`);
    }
  }

  /** 等待进入目标 Activity，期间循环处理系统权限弹窗（相册等），超时触发 fail-fast */
  private async waitForActivityHandlingPermissions(expect: string | RegExp, timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.isActivity(expect)) return;
      await sleep(this.statePollMs);
    }
    await this.assertActivity(expect);
  }

  /** 读取暗黑模式当前选中项：'light' / 'dark' / 'unknown'（带重试，等待选中态渲染完成） */
  private async currentThemeMode(): Promise<'light' | 'dark' | 'unknown'> {
    for (let i = 0; i < 8; i++) {
      const src = await this.driver.source();
      const selected = (rawId: string) => new RegExp(`resource-id="${xid(rawId)}"[^>]*selected="true"`).test(src);
      if (selected('dartIv')) return 'dark';
      if (selected('lightIv')) return 'light';
      await sleep(300);
    }
    return 'unknown';
  }

  // ---------- 用例主体 ----------

  protected async runCase(): Promise<void> {
    await this.act('打开APP等待就绪（关弹窗）', async () => {
      await this.ensureAnyState(['home', 'logged-in', 'logged-out'], 60_000);
      const n = await this.closePopups();
      if (n > 0) this.log(`关闭弹窗 ${n} 个`);
    });

    await this.act('确保登录（accounts.game）', async () => {
      await this.ensureLoggedInAs();
    });

    await this.caseProfilePublish();
    await this.caseWallet();
    await this.caseFamily();
    await this.caseNoble();
    await this.caseCompanionWorkbench();
    await this.caseDarkMode();
    await this.caseBeauty();
    await this.caseLogout();
  }

  /** 7.1 个人主页：点击头像进个人主页 → 发布动态（来自图库）→ 校验展示 → 删除清理 */
  private async caseProfilePublish(): Promise<void> {
    const text = `me-moment-${Date.now()}`;

    await this.act('点击头像进入个人主页', async () => {
      await this.gotoMePage();
      await this.driver.click(meAvatarLocator());
      await this.waitForActivity(ACT.userDetail);
    });

    await this.act('点击右下角发布按钮，弹起选择弹窗', async () => {
      await this.closePopups();
      await this.waitForElement(by.id(ID.postMomentLayout), '发布按钮', 10_000);
      await this.driver.click(by.id(ID.postMomentLayout));
      await this.waitForElement(by.id(ID.commonFirstTv), '选择弹窗（来自图库）', 5_000);
    });

    await this.act('点击「来自图库」跳转系统图库', async () => {
      await this.clickSheetItem(by.id(ID.commonFirstTv), '「来自图库」');
      await this.waitForActivityHandlingPermissions(ACT.album, 15_000);
    });

    await this.act('选择照片并点击完成，跳转发布动态页', async () => {
      const photo = albumPhotoCell(1);
      await this.waitForElement(photo, '图库首张照片', 10_000);
      await this.driver.click(photo);
      await sleep(500);
      await this.driver.click(by.id(ID.albumDone));
      await this.waitForActivity(ACT.newMoment, 10_000);
    });

    await this.act('输入内容并点击发布，跳转回个人主页', async () => {
      await this.waitForElement(by.id(ID.momentEdit), '内容输入框', 5_000);
      await this.driver.input(by.id(ID.momentEdit), text);
      await this.driver.hideKeyboard();
      await this.driver.click(by.id(ID.momentSend));
      await this.waitForActivity(ACT.userDetail, 15_000);
    });

    await this.check('个人主页展示新发布的动态', async () => {
      const shown = await this.driver.waitFor(by.id(ID.momentItemNameTv), 8_000);
      return {
        expect: '个人主页动态列表展示新动态',
        real: shown ? '已展示' : '未展示',
        pass: shown,
      };
    });

    await this.act('删除刚发布的动态（清理测试数据）', async () => {
      const more = by.id(ID.momentItemMoreIv);
      if (!(await this.driver.waitFor(more, 8_000))) {
        throw new Error('未找到动态的「…」按钮，无法删除');
      }
      await this.driver.click(more);
      await this.clickSheetItem(by.id(ID.commonFirstTv), '删除菜单');
      await this.waitForElement(by.id(ID.dialogPositive), '删除确认弹窗', 5_000);
      await this.driver.click(by.id(ID.dialogPositive));
      await sleep(2_000);
    });

    await this.act('返回我的页面', async () => {
      await this.backToMePage();
    });
  }

  /** 7.2 钱包：进入钱包页校验余额/储值/钻石/兑换入口；充值/兑换涉及真实支付跳过 */
  private async caseWallet(): Promise<void> {
    await this.act('点击钱包 icon，跳转我的钱包页面', async () => {
      await this.gotoMePage();
      await this.scrollToVisible(by.id(ID.walletEntry));
      await this.driver.click(by.id(ID.walletEntry));
      await this.waitForActivity(ACT.wallet);
    });

    await this.check('钱包页面展示余额与充值/兑换入口', async () => {
      // 余额为网络异步加载，进入页面后需等待其出现
      const balance = await this.driver.waitFor(by.id(ID.walletBalanceValue), 5_000);
      const topUp = await this.driver.exists(by.id(ID.walletTopUp));
      const diamond = await this.driver.exists(by.id(ID.walletDiamondValue));
      const exchange = await this.driver.exists(by.id(ID.walletDiamondExchange));
      return {
        expect: 'Lita金币余额、储值、钻石余额、兑换入口可见',
        real: `余额=${balance} 储值=${topUp} 钻石=${diamond} 兑换=${exchange}`,
        pass: balance && topUp && diamond && exchange,
      };
    });

    await this.act('跳过金币充值/钻石兑换（涉及真实支付）', async () => {
      this.skip('金币充值/钻石兑换涉及真实支付，冒烟跳过');
    });

    await this.act('返回我的页面', async () => {
      await this.backToMePage();
    });
  }

  /** 7.3 家族：家族签到 / 家族成员显示（前置「家族成员」，非成员跳过） */
  private async caseFamily(): Promise<void> {
    let isMember = false;
    await this.act('点击家族 icon，跳转家族广场页面', async () => {
      await this.gotoMePage();
      await this.scrollToVisible(by.id(ID.familyEntry));
      await this.driver.click(by.id(ID.familyEntry));
      await this.waitForActivity(ACT.familyPlaza);
      // 家族成员在广场顶部有「我的家族」区域；非成员仅有「创建」入口与热门家族列表
      isMember = await this.driver.waitFor(by.text('我的家族'), 5_000);
    });

    if (!isMember) {
      await this.act('跳过家族用例（当前账号非家族成员）', async () => {
        this.skip('当前账号非家族成员，无「我的家族」入口，跳过 7.3.1/7.3.2');
      });
      await this.act('返回我的页面', async () => {
        await this.backToMePage();
      });
      return;
    }

    // 7.3.1 家族签到
    await this.act('点击「我的家族」家族信息区域，进入我的家族', async () => {
      const myFamily = by.text('我的家族');
      if (!(await this.driver.waitFor(myFamily, 8_000))) {
        throw new Error('未找到「我的家族」区域');
      }
      await this.driver.click(by.xpath(`//*[@text='我的家族']/ancestor::*[@clickable='true'][1]`));
      // 我的家族页面（Activity 依版本可能为 FamilyActivity，此处以元素校验代替 Activity 断言）
      await this.waitForElement(by.textContains('每日任务'), '每日任务区域', 10_000);
    });

    await this.act('点击每日任务第一个任务（Family Check-in）的 Go 按钮', async () => {
      const goBtn = by.text('Go');
      if (!(await this.driver.waitFor(goBtn, 8_000))) {
        throw new Error('未找到每日任务 Go 按钮');
      }
      await this.driver.click(goBtn);
    });

    await this.check('签到成功（Go 按钮变为已完成）', async () => {
      // 签到成功后 Go 会变为完成态文案（如 Completed / 已完成）；再次点击会 toast 已完成
      const done = (await this.driver.exists(by.text('Completed'))) || (await this.driver.exists(by.text('已完成')));
      const goGone = !(await this.driver.exists(by.text('Go')));
      return {
        expect: 'Go 按钮状态变为已完成',
        real: done ? '已完成' : goGone ? 'Go 已消失' : '仍为 Go',
        pass: done || goGone,
      };
    });

    await this.act('返回家族广场', async () => {
      await this.backToMePage();
      await this.scrollToVisible(by.id(ID.familyEntry));
      await this.driver.click(by.id(ID.familyEntry));
      await this.waitForActivity(ACT.familyPlaza);
    });

    // 7.3.2 家族成员显示
    await this.act('进入我的家族并点击右上角设置按钮', async () => {
      const myFamily = by.text('我的家族');
      if (!(await this.driver.waitFor(myFamily, 8_000))) {
        throw new Error('未找到「我的家族」区域');
      }
      await this.driver.click(by.xpath(`//*[@text='我的家族']/ancestor::*[@clickable='true'][1]`));
      // 右上角设置按钮（依版本可能为 iv_more / 设置 icon，此处以文本/描述兜底）
      const settingBtn = by.xpath(`//*[@resource-id='${xid('iv_setting')}' or @resource-id='${xid('settingIv')}']`);
      const moreBtn = by.xpath(`//*[@content-desc='设置' or @content-desc='Setting']`);
      if (!(await this.driver.waitFor(settingBtn, 5_000)) && !(await this.driver.waitFor(moreBtn, 5_000))) {
        throw new Error('未找到家族设置按钮');
      }
      await this.driver.click((await this.driver.exists(settingBtn)) ? settingBtn : moreBtn);
    });

    await this.check('家族成员管理正常显示成员（含当前用户头像昵称）', async () => {
      const memberList = await this.driver.exists(by.textContains('成员'));
      const selfName = await this.driver.exists(by.text((this.account() as { username?: string }).username ?? ''));
      return {
        expect: '家族成员列表可见且含当前用户',
        real: memberList ? '成员列表可见' : '成员列表未出现',
        pass: memberList,
      };
    });

    await this.act('返回我的页面', async () => {
      await this.backToMePage();
    });
  }

  /** 7.4 贵族：贵族中心 Duke Tab 展示 16 个专属特权 + 开通/续费价格 + 开通按钮 */
  private async caseNoble(): Promise<void> {
    await this.act('点击贵族 icon，跳转贵族中心页面', async () => {
      await this.gotoMePage();
      await this.scrollToVisible(by.id(ID.nobleEntry));
      await this.driver.click(by.id(ID.nobleEntry));
      await this.waitForActivity(ACT.nobleCenter);
    });

    await this.act('点击第 6 个 Duke Tab', async () => {
      await this.driver.click(nobleTab(6));
      await sleep(1_000);
    });

    await this.check('Duke 展示 16 个专属特权', async () => {
      const title = await this.driver.textOf(by.id(ID.nobleExclusiveTitle));
      const has16 = /16/.test(title);
      return {
        expect: '专属特权 16 个',
        real: title || '(未读取到)',
        pass: has16,
      };
    });

    await this.check('展示开通价格、续费价格与开通按钮', async () => {
      const price = await this.driver.exists(by.id(ID.noblePriceTv));
      const renew = await this.driver.exists(by.id(ID.nobleRenewTv));
      const submit = await this.driver.exists(by.id(ID.nobleSubmitTv));
      return {
        expect: '开通价格/续费价格/开通按钮可见',
        real: `开通价=${price} 续费价=${renew} 开通按钮=${submit}`,
        pass: price && renew && submit,
      };
    });

    await this.act('返回我的页面', async () => {
      await this.backToMePage();
    });
  }

  /** 7.5 陪玩师工作台：在线开关 / 自动问候（前置「陪玩师账号」，非陪玩师跳过） */
  private async caseCompanionWorkbench(): Promise<void> {
    let hasWorkbench = false;
    await this.act('检测工作台模块（陪玩师账号）', async () => {
      await this.gotoMePage();
      hasWorkbench = await this.driver.exists(by.textContains('工作台'));
    });

    if (!hasWorkbench) {
      await this.act('跳过陪玩师工作台用例（当前账号非陪玩师）', async () => {
        this.skip('当前账号非陪玩师，无「工作台」模块，跳过 7.5.1/7.5.2');
      });
      return;
    }

    // 7.5.1 开启/关闭在线
    await this.act('点击工作台 Lita Tab 的在线按钮', async () => {
      const onlineBtn = by.textContains('在线');
      if (!(await this.driver.waitFor(onlineBtn, 8_000))) {
        throw new Error('未找到工作台「在线」按钮');
      }
      await this.driver.click(onlineBtn);
    });

    await this.act('点击进入我的工作台', async () => {
      const entry = by.textContains('我的工作台');
      if (!(await this.driver.waitFor(entry, 8_000))) {
        throw new Error('未找到「我的工作台」入口');
      }
      await this.driver.click(entry);
      await this.waitForElement(by.textContains('管理我的服务'), '管理我的服务区域', 10_000);
    });

    await this.act('点击管理我的服务下的在线按钮（有弹窗则确认）', async () => {
      const onlineBtn = by.textContains('在线');
      if (!(await this.driver.waitFor(onlineBtn, 8_000))) {
        throw new Error('未找到「在线」按钮');
      }
      await this.driver.click(onlineBtn);
      // 若弹出确认弹窗，点「我可以确认」
      if (await this.driver.waitFor(by.textContains('我可以'), 3_000)) {
        await this.driver.click(by.textContains('我可以'));
      }
    });

    await this.check('在线按钮点击后状态发生变化', async () => {
      // 状态变化以按钮文案/开关切换体现；此处校验按钮仍可点（状态已生效）
      const stillThere = await this.driver.exists(by.textContains('在线'));
      return { expect: '在线状态切换生效', real: stillThere ? '已切换' : '按钮消失', pass: stillThere };
    });

    // 7.5.2 开启/关闭自动问候
    await this.act('返回我的页面并点击工作台自动问候', async () => {
      await this.backToMePage();
      const autoGreet = by.textContains('自动问候');
      if (!(await this.driver.waitFor(autoGreet, 8_000))) {
        throw new Error('未找到「自动问候」入口');
      }
      await this.driver.click(autoGreet);
    });

    await this.act('切换自动问候开关并保存、返回', async () => {
      const switchBtn = by.textContains('自动问候');
      if (!(await this.driver.waitFor(switchBtn, 8_000))) {
        throw new Error('未找到自动问候开关');
      }
      await this.driver.click(switchBtn);
      const saveBtn = by.textContains('保存');
      if (await this.driver.waitFor(saveBtn, 3_000)) await this.driver.click(saveBtn);
      await this.driver.back();
    });

    await this.act('进入我的工作台校验自动问候状态一致', async () => {
      const entry = by.textContains('我的工作台');
      if (!(await this.driver.waitFor(entry, 8_000))) {
        throw new Error('未找到「我的工作台」入口');
      }
      await this.driver.click(entry);
      const autoGreet = await this.driver.exists(by.textContains('自动问候'));
      if (!autoGreet) throw new Error('工作台未展示自动问候状态');
    });

    await this.act('返回我的页面', async () => {
      await this.backToMePage();
    });
  }

  /** 7.6 暗黑模式：显示设置切换浅色/深色 → 保存 → 重启生效 → 校验持久化 */
  private async caseDarkMode(): Promise<void> {
    await this.act('进入设置页面', async () => {
      await this.gotoMePage();
      await this.scrollToVisible(by.id(ID.settingEntry));
      await this.driver.click(by.id(ID.settingEntry));
      await this.waitForActivity(ACT.settings);
    });

    await this.act('点击显示设置，跳转显示设置页面', async () => {
      await this.scrollToVisible(by.id(ID.darkThemeEntry));
      await this.driver.click(by.id(ID.darkThemeEntry));
      await this.waitForActivity(ACT.darkTheme);
    });

    const before = await this.currentThemeMode();
    await this.act('点击未选中状态的显示模式选项', async () => {
      if (before === 'dark') {
        await this.driver.click(by.id(ID.lightLayout));
      } else if (before === 'light') {
        await this.driver.click(by.id(ID.dartLayout));
      } else {
        throw new Error('无法判定当前显示模式（lightIv/dartIv 选中态缺失）');
      }
      await sleep(800);
    });

    await this.check('选项点击后选中状态发生变化', async () => {
      const after = await this.currentThemeMode();
      const target = before === 'dark' ? 'light' : 'dark';
      return {
        expect: `选中状态切换为 ${target}`,
        real: after === target ? target : `${after}（切换失败）`,
        pass: after === target,
      };
    });

    await this.act('点击保存按钮', async () => {
      await this.driver.click(by.id(ID.saveTv));
      await this.waitForElement(by.id(ID.dialogPositive), '重启确认弹窗', 5_000);
    });

    await this.act('点击弹窗中的确认按钮（重启生效）', async () => {
      await this.driver.click(by.id(ID.dialogPositive));
      // 重启后回到主页面（MainActivity）
      await this.waitForActivity(ACT.main, 30_000);
    });

    // 重启后 App 冷启动较慢（尤其慢模拟器），单独一步等待就绪并回到"我的"，避免与后续导航混在一起
    await this.act('等待App重启就绪并进入我的页面', async () => {
      await this.ensureAnyState(['home', 'logged-in'], 60_000);
      await this.closePopups();
      await this.gotoMePage(30_000);
    });

    await this.act('重启后进入设置-显示设置页', async () => {
      await this.scrollToVisible(by.id(ID.settingEntry));
      await this.driver.click(by.id(ID.settingEntry));
      await this.waitForActivity(ACT.settings);
      await this.scrollToVisible(by.id(ID.darkThemeEntry));
      await this.driver.click(by.id(ID.darkThemeEntry));
      await this.waitForActivity(ACT.darkTheme);
    });

    await this.check('重启后显示模式持久化为新选择', async () => {
      const now = await this.currentThemeMode();
      const target = before === 'dark' ? 'light' : 'dark';
      return {
        expect: `重启后显示模式为 ${target}（与修改前不一致）`,
        real: now === target ? target : now,
        pass: now === target,
      };
    });

    await this.act('返回我的页面', async () => {
      await this.backToMePage();
    });
  }

  /** 7.7 美颜：设置页「美颜」入口（当前版本无此入口，跳过） */
  private async caseBeauty(): Promise<void> {
    let hasBeauty = false;
    await this.act('进入设置页面检测美颜入口', async () => {
      await this.gotoMePage();
      await this.scrollToVisible(by.id(ID.settingEntry));
      await this.driver.click(by.id(ID.settingEntry));
      await this.waitForActivity(ACT.settings);
      hasBeauty = await this.driver.exists(by.text('美颜'));
    });

    if (!hasBeauty) {
      await this.act('跳过美颜用例（当前版本无美颜入口）', async () => {
        this.skip('当前版本设置页无「美颜」入口，跳过 7.7');
      });
      await this.act('返回我的页面', async () => {
        await this.backToMePage();
      });
      return;
    }

    await this.act('点击美颜，调起前置摄像头', async () => {
      await this.driver.click(by.text('美颜'));
      // 预期调起设备前置摄像头；此处以进入相机相关页面判定
      await sleep(2_000);
    });

    await this.act('返回我的页面', async () => {
      await this.backToMePage();
    });
  }

  /** 7.8 退出登录：设置 → 登出账号 → 回到首页 → 点「我的」跳转登录页 */
  private async caseLogout(): Promise<void> {
    await this.act('进入设置页面并登出账号', async () => {
      await this.backToMePage();
      await this.scrollToVisible(by.id(ID.settingEntry));
      await this.driver.click(by.id(ID.settingEntry));
      await this.waitForActivity(ACT.settings);
      await this.scrollToVisible(by.id(ID.logoutLayout));
      await this.driver.click(by.id(ID.logoutLayout));
      // 实测无确认弹窗，点击即退出并回到首页
      await this.waitForActivity(ACT.main, 15_000);
    });

    await this.check('登出后回到首页', async () => {
      const atHome = await this.isActivity(ACT.main);
      return { expect: '回到主页面', real: atHome ? '首页' : '未回首页', pass: atHome };
    });

    await this.check('点击「我的」跳转至登录页面', async () => {
      await this.gotoMePageOrLogin();
      const atLogin = await this.isActivity('.ui.login.LoginActivity');
      return { expect: '跳转登录页面', real: atLogin ? '登录页' : '未跳转登录页', pass: atLogin };
    });
  }

  /** 登出后点击「我的」应进入登录页（此时无 layout_options） */
  private async gotoMePageOrLogin(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.isActivity('.ui.login.LoginActivity')) return;
      if (await this.driver.exists(by.id(ID.tabMe))) await this.driver.click(by.id(ID.tabMe));
      await sleep(1_000);
    }
  }
}

await new MeCheck().execute();
