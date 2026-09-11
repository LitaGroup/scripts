/**
 * 首页核心检查（Android / Lite，com.litalite.android）
 *
 * 双账号执行（按冒烟用例区分的账号类型，均需 +86）：
 *   - accounts.game（游戏账号，首页有「游戏」tab + 智能推荐陪玩师）→ 2.1 首页-游戏
 *   - accounts.friend（交友账号，首页有「交友」tab + Cinta 陪陪）→ 2.2 首页-交友
 * 脚本流程：登出(若已登录) → 登录游戏账号 → 2.1 → 切交友账号 → 2.2。
 *
 * 覆盖用例：
 *   2.1 首页-游戏
 *     2.1.1 陪玩师搜索   —— 从智能推荐随机选陪玩师读其 ID → 搜索 → 结果 → 陪玩师主页
 *     2.1.2 技能推荐     —— 热门游戏技能 icon → 技能陪玩师列表 → 陪玩师主页
 *     2.1.3 智能推荐     —— 智能推荐列表陪玩师 → 陪玩师主页
 *   2.2 首页-交友
 *     2.2.1 缘分推荐     —— 缘分推荐列表陪陪头像 → 陪陪主页
 *     2.2.2 视频匹配(单侧) —— 进 5 秒倒计时待匹配页 → 自动匹配中 → 关闭
 *     2.2.3 语音匹配(单侧) —— 进语音匹配页(匹配中) → 关闭
 *
 * 登录说明：手机号 +86。出密码页走密码；出短信验证码页则自动从
 *   stats 库 sms_record_{yyyyMM} 查真实验证码填入（经 MySQLProdResource / config.json userToken）。
 *   —— 验证码为后端随机生成，非固定值，故必须查库。
 *
 * 前置：
 *   1. config.home.android.lite.json（已提交 git，不被 ignore）配置：
 *      - userToken（登录短信验证码查库用；PROD API 代理）
 *      - accounts.game / accounts.friend（username=手机号 / password）
 *   2. 交友账号需 ≥10 金币（2.2.2/2.2.3 匹配前置，不足会跳充值页并 fail-fast）。
 *
 * 运行（单一配置文件，账号与 userToken 均从 SCRIPT_CONFIG 读取）：
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
 *     SCRIPT_CONFIG=config.home.android.lite.json \
 *     node projects/app/android-lite/home.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { by, sleep, type AppiumCapabilities, type Locator } from '../../../src/resources/AppiumResource.ts';
import { alignLiteConfigPath, querySmsCode as querySmsCodeFromDb } from '../core/_lib/androidSmsOtp.ts';

// 本脚本账号与 userToken 统一从 SCRIPT_CONFIG 指定的单一配置文件读取：
//   - 账号：AppBaseClass.account() 读 SCRIPT_CONFIG 的 accounts.{game|friend}
//   - userToken：短信验证码查库走 loadConfig()，默认读 config.json（或 LITA_CONFIG_PATH）
alignLiteConfigPath();

const APP_PACKAGE = 'com.litalite.android';
const APP_ACTIVITY = '.ui.splash.SplashActivity';

/** 手机号国家前缀（用于拼接 DB 里 sms_record 的 phone_number = 前缀 + 手机号） */
const PHONE_PREFIX = '86';
// 系统权限弹窗（相机/麦克风）允许按钮
const ID_PERMISSION_ALLOW = 'com.android.packageinstaller:id/permission_allow_button';

const ACT = {
  main: '.MainActivity',
  search: '.ui.search.SearchActivity',
  skill: '.ui.categorizedSkill.CategorizedSkillActivity',
  userDetail: '.ui.user.UserDetailActivity',
  userService: '.ui.user.UserServiceActivity',
  friendDetail: '.ui.friends.FriendUserDetailActivity',
  videoMatch: '.ui.random.RandomVideoMatchActivity',
  voiceMatch: '.ui.random.RandomVoiceMatchActivity',
  topUp: '.ui.wallet.TopUpActivity',
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
  loginClaimBtn: `${APP_PACKAGE}:id/tv_login_and_claim`, // 新用户优惠弹窗 - 登录并领取（点它继续登录）
  countryCode: `${APP_PACKAGE}:id/tv_country_code`,
  countryList: `${APP_PACKAGE}:id/rlCountryListView`,
  phoneInput: `${APP_PACKAGE}:id/enter_phone_number`,
  phoneNext: `${APP_PACKAGE}:id/send_sms_code_button`,
  passwordInput: `${APP_PACKAGE}:id/et_password`,
  passwordSubmit: `${APP_PACKAGE}:id/tv_confirm`,
  captchaEt: `${APP_PACKAGE}:id/input_captcha_et`,
  // 我的/设置（退出登录）
  settingEntry: `${APP_PACKAGE}:id/setting_layout`,
  logout: `${APP_PACKAGE}:id/logout_tv`,
  // 弹窗
  popupActivity: `${APP_PACKAGE}:id/vp_banner`,
  popupActivityClose: `${APP_PACKAGE}:id/img_close`,
  onboardingSkip: `${APP_PACKAGE}:id/skipTv`, // 首启引导页 - 跳过
  // 首页标题栏
  imgSearch: `${APP_PACKAGE}:id/img_search`,
  tvGameTitle: `${APP_PACKAGE}:id/tv_game_title`,
  tvFriendTitle: `${APP_PACKAGE}:id/tv_friend_title`,
  imgGameLine: `${APP_PACKAGE}:id/img_game_line`, // 游戏 tab 选中下划线（选中才可见）
  imgFriendLine: `${APP_PACKAGE}:id/img_friend_line`, // 交友 tab 选中下划线
  // 游戏/交友 tab 内容（categorySkills、recommendPlayers、rv_friend 的 raw id 统一放 RAW_CONTAINER）
  // 搜索页
  searchEt: `${APP_PACKAGE}:id/searchEt`,
  searchResultRv: `${APP_PACKAGE}:id/searchResultRv`,
  // 技能列表页
  categorizedList: `${APP_PACKAGE}:id/categorizedListRecyclerView`,
  // 详情标记
  userDetailProfile: `${APP_PACKAGE}:id/userDetailProfileView`,
  friendDetailBottomBar: `${APP_PACKAGE}:id/layout_bottom_bar`, // 陪陪主页底部操作栏
  playerUserNo: `${APP_PACKAGE}:id/tv_user_no`, // 陪玩师主页 - 用户ID数字（文本形如 "ID 9174567"）
  // 视频匹配页
  videoMatchStart: `${APP_PACKAGE}:id/tv_start_match`,
  videoMatchTime: `${APP_PACKAGE}:id/tv_start_time`,
  videoMatchMatching: `${APP_PACKAGE}:id/ll_matching_view`,
  videoMatchClose: `${APP_PACKAGE}:id/iv_close`,
  videoMatchBack: `${APP_PACKAGE}:id/iv_back`,
  // 语音匹配页
  voiceMatchTitle: `${APP_PACKAGE}:id/tvTitle`,
  voiceMatchName: `${APP_PACKAGE}:id/tv_user_name`,
  voiceMatchClose: `${APP_PACKAGE}:id/iv_close`,
  // 通用弹窗按钮
  dialogPositive: `${APP_PACKAGE}:id/positiveTv`,
  dialogNegative: `${APP_PACKAGE}:id/negativeTv`,
};

// 列表容器（RecyclerView/GridView）的 raw resource-id —— 仅取 `:id/` 后的部分。
// 注意：命名与布局保持一致（rv_friend 为 snake_case，其余为 camelCase），
//       避免 inContainer 传入错误大小写导致定位失败。
const RAW_CONTAINER = {
  searchResultRv: 'searchResultRv',
  categorySkills: 'categorySkills',
  recommendPlayers: 'recommendPlayers',
  categorizedList: 'categorizedListRecyclerView',
  rvFriend: 'rv_friend',
};

// 列表条目内的子元素（仅 raw id，用于在指定容器内 scoped 定位，避免 ViewPager2 预加载页干扰）
const RAW = {
  recommendAvatarNew: 'img_avatar', // item_new_recommend_player.xml（新推荐卡片）
  recommendAvatarOld: 'player_profile_pic', // item_recommend_player.xml（旧推荐卡片）
  friendAvatar: 'img_avatar', // item_friend_user*.xml
  skillItem: 'mShadowLayout', // item_skill_category_home.xml（技能 icon，可点击根布局）
  searchResultItem: 'searchResultLayout', // item_search_result.xml
  videoMatchEntry: 'img_video_match', // item_friend_user_header.xml - 视频匹配入口
  voiceMatchEntry: 'img_voice_match', // item_friend_user_header.xml - 语音匹配入口
};

function xid(raw: string): string {
  return `${APP_PACKAGE}:id/${raw}`;
}

/** 在指定容器（RecyclerView/GridView）内定位其首个匹配子元素；容器/子元素均传 raw id */
function inContainer(containerRaw: string, childRaw: string): Locator {
  return by.xpath(`//*[@resource-id='${xid(containerRaw)}']//*[@resource-id='${xid(childRaw)}']`);
}

class HomeCheck extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 33; // 预估步数（仅 start 元数据；实际以 done.total 为准，含跳过分支时动态变化）

    // 状态注册顺序 = 检测顺序：弹窗 → 登录态 → 页面
    this.addState({
      name: 'splash', // 冷启动 SplashActivity（避免被当作 unknown 触发返回键）
      activity: '.ui.splash.SplashActivity',
      detect: async () => true,
    });
    this.addState({
      name: 'popup-permission', // 系统权限弹窗（首启/清数据后出现）
      kind: 'popup',
      activity: /GrantPermissionsActivity/,
      detect: async () => true,
      handle: async () => {
        const allow = by.id(ID_PERMISSION_ALLOW);
        if (await this.driver.exists(allow)) await this.driver.click(allow);
      },
    });
    this.addState({
      name: 'popup-onboarding', // 首启引导页（清数据后出现，点跳过）
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
      name: 'logged-in', // 我的 tab：已登录（先比对 Activity，再做元素级判定）
      activity: ACT.main,
      detect: async () =>
        (await this.driver.exists(by.id(ID.mePage))) ||
        (await this.driver.exists(by.id(ID.meUid))) ||
        (await this.driver.exists(by.id(ID.meName))),
    });
    this.addState({
      name: 'logged-out', // 登录相关页面
      activity: '.ui.login.LoginActivity',
      detect: async () =>
        (await this.driver.exists(by.id(ID.loginPage))) ||
        (await this.driver.exists(by.id(ID.phoneInput))) ||
        (await this.driver.exists(by.id(ID.passwordInput))) ||
        (await this.driver.exists(by.id(ID.captchaEt))),
    });
    this.addState({
      name: 'home', // 主页面（底部 tab 容器）
      activity: ACT.main,
      detect: () => this.driver.exists(by.id(ID.tabHome)),
    });
  }

  protected capabilities(): AppiumCapabilities {
    return {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:appPackage': APP_PACKAGE,
      'appium:appActivity': APP_ACTIVITY,
      'appium:noReset': true,
      'appium:newCommandTimeout': 300,
    };
  }

  /** 当前分段所用账号：2.1 游戏段=game，2.2 交友段=friend（config.app.json accounts.{game|friend}） */
  private currentAccount: 'game' | 'friend' = 'game';

  protected override account(_name = 'default'): AppAccount {
    return super.account(this.currentAccount);
  }

  /** 确保以指定账号登录：先进入"我的"tab 判定登录态，未登录则执行登录 */
  private async ensureLoggedInAs(name: 'game' | 'friend', timeoutMs = 45_000): Promise<void> {
    this.currentAccount = name;
    const state = await this.enterMeTab();
    if (state === 'logged-in') {
      this.log(`账号 ${this.account().username} 已登录，无需重新登录`);
      return;
    }
    this.log(`当前未登录，执行登录（${name} 账号）`);
    await this.login(this.account());
    // 登录成功后回到主页面（MainActivity 即登录成功）
    await this.ensureAnyState(['home', 'logged-in'], timeoutMs);
    this.log('登录成功');
  }

  /**
   * 手机号登录（必须 +86）：
   *   流程：手机号登录入口 →（新用户优惠弹窗选「登录并领取」）→ 选 +86 并校验 → 输入手机号 → 下一步。
   *   出密码页则输密码；否则会进短信验证码页 → waitLoginOrOtp 查库取码。
   *   注意：区号若未切到 +86（默认 +62）会走错的 OTP 流程甚至查不到该账号。
   */
  protected override async login(account: AppAccount): Promise<void> {
    // 会话恢复可能落在登录流程中间页：验证码/密码页 → 返回手机号页
    if ((await this.driver.exists(by.id(ID.passwordInput))) || (await this.driver.exists(by.id(ID.captchaEt)))) {
      await this.driver.back();
      await sleep(800);
    }
    if (!(await this.driver.exists(by.id(ID.phoneInput)))) {
      await this.waitForElement(by.id(ID.phoneLoginEntry), '手机号登录入口');
      await this.driver.click(by.id(ID.phoneLoginEntry));
      // 新用户优惠弹窗（确认放弃优惠）→ 点「登录并领取」继续登录
      if (await this.driver.waitFor(by.id(ID.loginClaimBtn), 3_000)) {
        await this.driver.click(by.id(ID.loginClaimBtn));
        await sleep(1_000);
      }
    }
    await this.waitForElement(by.id(ID.phoneInput), '手机号输入框');
    // 选择区号 +86（默认 +62，需切换中国；选错区号会走短信 OTP 而非密码登录）
    await this.driver.click(by.id(ID.countryCode));
    if (await this.driver.waitFor(by.id(ID.countryList), 5_000)) {
      const china = by.text('中国');
      for (let i = 0; i < 6 && !(await this.driver.exists(china)); i++) {
        await this.driver.swipeInElement(by.id(ID.countryList), 'up');
        await sleep(500);
      }
      if (await this.driver.exists(china)) {
        await this.driver.click(china);
        await sleep(1_000);
      }
    }
    // 校验区号已切到 +86：切错会走短信 OTP 路径（该手机号在 +86 下是有密码/直接可达的账号）
    const cc = (await this.driver.textOf(by.id(ID.countryCode))).trim();
    if (!cc.includes('86')) {
      throw new Error(`区号未切换为 +86（当前: ${cc || '未知'}）`);
    }
    await this.driver.input(by.id(ID.phoneInput), account.username);
    await this.driver.hideKeyboard();
    const since = new Date(); // 记录发码时间基线，供查库取验证码
    await this.driver.click(by.id(ID.phoneNext)); // 下一步
    // 阶段1：可能出现密码页 → 输入密码并提交
    if (await this.driver.waitFor(by.id(ID.passwordInput), 8_000)) {
      await this.driver.input(by.id(ID.passwordInput), account.password);
      await this.driver.hideKeyboard();
      await this.driver.click(by.id(ID.passwordSubmit)); // 登录
    }
    // 阶段2：等待登录成功（进入主页面）或出现短信验证码页（密码后二次验证 / 直接 OTP）
    await this.waitLoginOrOtp(since, account.username);
  }

  /**
   * 登录提交后等待结果：进入主页面即成功；出现 OTP 验证码页则从数据库查真实验证码并填入。
   * 覆盖两种路径：直接短信 OTP 登录、密码提交后二次短信验证。
   */
  private async waitLoginOrOtp(since: Date, phone: string, timeoutMs = 45_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.isActivity(ACT.main)) return; // 已进入主页面 = 登录成功
      if (await this.driver.exists(by.id(ID.captchaEt))) {
        // 短信 OTP：从 stats 库 sms_record_{yyyyMM} 查真实验证码（经 PROD API 代理 userToken）
        this.log(`进入验证码页，从数据库查询验证码（phone=86${phone}）`);
        const realCode = await this.querySmsCode(since, phone);
        this.log(`获取到验证码: ${realCode}`);
        // CaptchaInputView 自定义输入框：W3C Actions 静默失败，改用原生 sendKeys（setText）
        await this.driver.sendKeys(by.id(ID.captchaEt), realCode);
        // 输入后等自动提交登录成功
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

  /** 轮询查询最新短信验证码（见 androidSmsOtp.querySmsCode） */
  private async querySmsCode(since: Date, phone: string, timeoutMs = 30_000): Promise<string> {
    return querySmsCodeFromDb({
      since,
      phone,
      countryCode: PHONE_PREFIX,
      timeoutMs,
      env: 'prod',
    });
  }

  protected async runCase(): Promise<void> {
    // ---------- 0. 就绪 ----------
    await this.act('打开APP等待就绪（关弹窗）', async () => {
      await this.ensureAnyState(['home', 'logged-in', 'logged-out'], 60_000);
      const n = await this.closePopups();
      if (n > 0) this.log(`关闭弹窗 ${n} 个`);
    });

    // ---------- 2.1 游戏段（accounts.game） ----------
    await this.act('确保登录游戏账号（accounts.game）', async () => {
      await this.logoutIfNeeded(); // 无法判断当前登录账号，统一登出保证从游戏账号开始
      await this.ensureLoggedInAs('game');
    });
    await this.runGameSection();

    // ---------- 2.2 交友段（accounts.friend）：先退出游戏账号再登录交友账号 ----------
    await this.act('退出游戏账号，切换至交友账号', async () => {
      await this.logoutIfNeeded();
      await this.ensureLoggedInAs('friend');
    });
    await this.runFriendSection();
  }

  /** 已登录则退出登录（我的 → Settings → Log Out），确保可切换到另一账号 */
  private async logoutIfNeeded(): Promise<void> {
    const state = await this.enterMeTab();
    if (state === 'logged-out') return;
    this.log('当前已登录，执行退出登录');
    await this.scrollToVisible(by.id(ID.settingEntry));
    await this.driver.click(by.id(ID.settingEntry));
    await this.scrollToVisible(by.id(ID.logout));
    await this.driver.click(by.id(ID.logout)); // 实测无确认弹窗，点击即退出并回到首页
    await this.ensureState('home', 15_000);
    const after = await this.enterMeTab();
    if (after !== 'logged-out') throw new Error(`退出登录后状态异常: ${after}`);
    if (await this.driver.waitFor(by.id(ID.loginClose), 5_000)) await this.driver.click(by.id(ID.loginClose));
    this.log('已退出登录');
  }

  // ---------- 2.1 首页-游戏 ----------

  private async runGameSection(): Promise<void> {
    await this.act('进入首页-游戏 tab', async () => {
      await this.enterHome();
      await this.gotoGameTab();
    });

    await this.caseSearch();
    await this.caseSkillRecommend();
    await this.caseSmartRecommend();
  }

  /** 2.1.1 陪玩师搜索：从首页智能推荐列表随机选一位陪玩师，读取其 ID 后去搜索 */
  private async caseSearch(): Promise<void> {
    let playerId = '';
    let gotId = false;
    await this.act('从智能推荐列表随机选陪玩师并读取其ID', async () => {
      // 等智能推荐列表加载出陪玩师
      const avatar = this.recommendFirstItemLocator();
      if (!(await this.waitListItem(avatar, '智能推荐陪玩师条目', 15_000))) {
        this.skip('智能推荐列表为空，无法取得陪玩师ID');
      }
      playerId = await this.readPlayerIdFromRecommend();
      gotId = true;
      this.log(`取到陪玩师 ID: ${playerId}`);
    });

    // 无论是否取到ID，先回到首页-游戏 tab，保证后续步骤页面正确
    await this.act('返回首页-游戏 tab', async () => {
      await this.backToMain();
      await this.gotoGameTab();
    });
    if (!gotId) return; // 未能取得陪玩师ID，跳过后续搜索步骤

    // 搜索最多尝试 3 次：搜不到结果就回到推荐列表另选一位陪玩师重试
    let found = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.act('点击右上角搜索 icon', async () => {
        await this.driver.click(by.id(ID.imgSearch));
        await this.waitForActivity(ACT.search);
      });

      await this.act(`输入陪玩师 ID 并搜索（${playerId}）`, async () => {
        await this.waitForElement(by.id(ID.searchEt), '搜索输入框');
        await this.driver.input(by.id(ID.searchEt), playerId);
        await sleep(300);
        // 搜索框无「搜索」按钮，触发 IME 搜索动作（imeOptions=actionSearch）
        try {
          await this.driver.execute('mobile: performEditorAction', [{ action: 'search' }]);
        } catch {
          await this.driver.execute('mobile: pressKey', [{ keycode: 66 }]);
        }
      });

      let attemptFound = false;
      await this.check('搜索列表展示陪玩师信息', async () => {
        if (!(await this.waitDisplayed(by.id(ID.searchResultRv), '搜索结果列表', 8_000))) {
          return { expect: '搜索结果列表可见', real: '列表未出现', pass: false };
        }
        const first = inContainer(RAW_CONTAINER.searchResultRv, RAW.searchResultItem);
        const has = await this.driver.isDisplayed(first);
        attemptFound = has;
        return { expect: '展示陪玩师列表项', real: has ? '已展示' : '列表为空', pass: has };
      });

      if (attemptFound) {
        found = true;
        break;
      }

      // 未搜到结果：回到推荐列表另选一位陪玩师再试
      if (attempt < 3) {
        await this.act('搜索无结果，从推荐列表另选陪玩师', async () => {
          await this.backToMain();
          await this.gotoGameTab();
          playerId = await this.readPlayerIdFromRecommend();
          this.log(`另选陪玩师 ID: ${playerId}`);
        });
        // 重新回到首页-游戏 tab，准备下一次搜索
        await this.act('返回首页-游戏 tab', async () => {
          await this.backToMain();
          await this.gotoGameTab();
        });
      }
    }
    if (!found) return; // 3 次均未搜到结果（最后一次 check 已 fail）

    await this.act('点击陪玩师列表项', async () => {
      await this.driver.click(inContainer(RAW_CONTAINER.searchResultRv, RAW.searchResultItem));
      await this.waitForActivity(ACT.userDetail, 12_000);
    });

    await this.check('跳转至陪玩师个人主页', async () => {
      const ok = await this.waitDisplayed(by.id(ID.userDetailProfile), '陪玩师个人主页', 8_000);
      return { expect: '陪玩师个人主页', real: ok ? '已进入' : '未进入', pass: ok };
    });

    await this.act('返回首页-游戏 tab', async () => {
      await this.backToMain();
      await this.gotoGameTab();
    });
  }

  /**
   * 从首页智能推荐列表随机选一位陪玩师并读取其用户 ID。
   * 前置：已处于首页-游戏 tab（推荐列表可见）；结束停在陪玩师主页（UserServiceActivity）。
   */
  private async readPlayerIdFromRecommend(): Promise<string> {
    const avatar = this.recommendFirstItemLocator();
    if (!(await this.waitListItem(avatar, '智能推荐陪玩师条目', 15_000))) {
      throw new Error('智能推荐列表为空或未加载');
    }
    const avatars = await this.driver.findElements(avatar);
    const n = avatars.length;
    const pick = n > 0 ? Math.floor(Math.random() * n) + 1 : 1;
    this.log(`从 ${n} 位推荐陪玩师中随机选择第 ${pick} 位`);
    await this.driver.click(by.xpath(`(${avatar[1]})[${pick}]`));
    await this.waitForActivity(ACT.userService, 12_000);
    // 主页展示用户ID数字（tv_user_no 文本形如 "ID 9174567"）
    if (!(await this.driver.waitFor(by.id(ID.playerUserNo), 8_000))) {
      throw new Error('陪玩师主页未展示用户ID');
    }
    const id = (await this.driver.textOf(by.id(ID.playerUserNo))).replace(/[^\d]/g, '').trim();
    if (!/^\d+$/.test(id)) throw new Error(`陪玩师主页用户ID格式异常: "${id}"`);
    return id;
  }

  /** 2.1.2 技能推荐 */
  private async caseSkillRecommend(): Promise<void> {
    await this.act('点击热门游戏下技能 icon', async () => {
      await this.driver.click(inContainer(RAW_CONTAINER.categorySkills, RAW.skillItem));
      await this.waitForActivity(ACT.skill);
    });

    await this.check('技能陪玩师列表展示陪玩师信息', async () => {
      if (!(await this.waitDisplayed(by.id(ID.categorizedList), '技能陪玩师列表', 8_000))) {
        return { expect: '技能陪玩师列表可见', real: '列表未出现', pass: false };
      }
      const first = this.skillFirstItemLocator();
      const has = await this.waitListItem(first, '技能陪玩师条目', 15_000);
      return { expect: '展示陪玩师条目', real: has ? '已展示' : '列表为空或未加载', pass: has };
    });

    await this.act('点击技能列表首个陪玩师', async () => {
      const first = this.skillFirstItemLocator();
      if (!(await this.waitListItem(first, '技能陪玩师条目', 15_000))) {
        throw new Error('技能陪玩师列表为空或未加载');
      }
      await this.driver.click(first);
      await this.waitForActivity(ACT.userService, 12_000);
    });

    await this.check('跳转至陪玩师个人主页', async () => {
      const ok = await this.waitDisplayed(by.id(ID.playerUserNo), '陪玩师个人主页', 8_000);
      return { expect: '陪玩师个人主页', real: ok ? '已进入' : '未进入', pass: ok };
    });

    await this.act('返回首页-游戏 tab', async () => {
      await this.backToMain();
      await this.gotoGameTab();
    });
  }

  /** 2.1.3 智能推荐 */
  private async caseSmartRecommend(): Promise<void> {
    await this.act('点击智能推荐下陪玩师', async () => {
      const item = this.recommendFirstItemLocator();
      if (!(await this.waitListItem(item, '智能推荐陪玩师条目', 15_000))) {
        throw new Error('智能推荐列表为空或未加载');
      }
      await this.driver.click(item);
      await this.waitForActivity(ACT.userService, 12_000);
    });

    await this.check('跳转至陪玩师个人主页', async () => {
      const ok = await this.waitDisplayed(by.id(ID.playerUserNo), '陪玩师个人主页', 8_000);
      return { expect: '陪玩师个人主页', real: ok ? '已进入' : '未进入', pass: ok };
    });

    await this.act('返回首页', async () => {
      await this.backToMain();
    });
  }

  // ---------- 2.2 首页-交友 ----------

  private async runFriendSection(): Promise<void> {
    let skipped = false;
    await this.act('进入首页-交友 tab', async () => {
      await this.enterHome();
      if (!(await this.driver.exists(by.id(ID.tvFriendTitle)))) {
        skipped = true;
        this.skip('当前账号无交友(Cinta)入口，跳过首页-交友用例');
      }
      await this.gotoFriendTab();
    });
    if (skipped) return;

    await this.caseFateRecommend();
    // 生产环境去除充值步骤：视频/语音匹配需 ≥10 金币，不足会跳充值页，
    // 生产账号不做充值，故跳过匹配相关用例。
    if (this.env === 'prod') {
      await this.act('跳过视频/语音匹配（生产环境去除充值步骤）', async () => {
        this.skip('生产环境去除充值步骤，跳过视频/语音匹配用例');
      });
      return;
    }
    await this.caseVideoMatch();
    await this.caseVoiceMatch();
  }

  /** 2.2.1 缘分推荐 */
  private async caseFateRecommend(): Promise<void> {
    await this.act('点击缘分推荐下陪陪头像', async () => {
      const item = inContainer(RAW_CONTAINER.rvFriend, RAW.friendAvatar);
      if (!(await this.driver.waitFor(item, 15_000))) {
        throw new Error('缘分推荐列表为空或未加载');
      }
      await this.driver.click(item);
      await this.waitForActivity(ACT.friendDetail, 12_000);
    });

    await this.check('跳转至陪陪个人主页', async () => {
      const ok = await this.driver.waitFor(by.id(ID.friendDetailBottomBar), 8_000);
      return { expect: '陪陪个人主页', real: ok ? '已进入' : '未进入', pass: ok };
    });

    await this.act('返回首页-交友 tab', async () => {
      await this.backToMain();
      await this.gotoFriendTab();
    });
  }

  /** 2.2.2 视频匹配（单账号侧：进入倒计时待匹配页 → 开始匹配 → 匹配中 → 关闭） */
  private async caseVideoMatch(): Promise<void> {
    let insufficient = false;
    await this.act('点击视频匹配按钮，进入待匹配页面', async () => {
      const entry = inContainer(RAW_CONTAINER.rvFriend, RAW.videoMatchEntry);
      if (!(await this.driver.waitFor(entry, 15_000))) {
        throw new Error('视频匹配入口未出现');
      }
      await this.driver.click(entry);
      await this.grantPermissions(); // 相机+麦克风权限
      // 金币不足会跳充值页（TopUpActivity），此时跳过后续匹配步骤
      if (await this.waitForActivityOr(ACT.topUp, 5_000)) {
        insufficient = true;
        this.skip('交友账号金币不足，跳转充值页，跳过视频匹配用例');
        return;
      }
      await this.waitForActivity(ACT.videoMatch, 12_000);
    });
    if (insufficient) {
      await this.backToMain();
      await this.gotoFriendTab();
      return;
    }

    await this.check('进入 5 秒倒计时待匹配页面', async () => {
      const countdown = await this.driver.isDisplayed(by.id(ID.videoMatchTime));
      const start = await this.driver.isDisplayed(by.id(ID.videoMatchStart));
      return {
        expect: '倒计时与开始匹配按钮可见',
        real: `倒计时=${countdown} 开始匹配=${start}`,
        pass: countdown && start,
      };
    });

    await this.act('等待 5 秒倒计时结束，自动进入匹配中', async () => {
      if (!(await this.waitDisplayed(by.id(ID.videoMatchMatching), '匹配中视图', 20_000))) {
        throw new Error('倒计时结束后未进入匹配中状态');
      }
    });

    await this.check('匹配中 UI 展示', async () => {
      const matching = await this.driver.isDisplayed(by.id(ID.videoMatchMatching));
      return { expect: '匹配中视图可见', real: matching ? '匹配中' : '未匹配', pass: matching };
    });

    await this.act('关闭视频匹配', async () => {
      await this.driver.click(by.id(ID.videoMatchClose));
      // 弹「确定要停止匹配吗？」→ 点「确认停止」（negativeTv）
      if (!(await this.waitDisplayed(by.id(ID.dialogNegative), '停止匹配弹窗', 5_000))) {
        throw new Error('停止匹配弹窗未出现');
      }
      await this.driver.click(by.id(ID.dialogNegative));
      // 回到待匹配页（无倒计时），点返回退出
      if (!(await this.waitDisplayed(by.id(ID.videoMatchBack), '返回按钮', 5_000))) {
        throw new Error('停止匹配后返回按钮未出现');
      }
      await this.driver.click(by.id(ID.videoMatchBack));
      await this.waitForActivity(ACT.main);
      await this.gotoFriendTab();
    });
  }

  /** 2.2.3 语音匹配（单账号侧：进入匹配页 → 匹配中 → 关闭） */
  private async caseVoiceMatch(): Promise<void> {
    let insufficient = false;
    await this.act('点击语音匹配按钮，进入待匹配页面', async () => {
      const entry = inContainer(RAW_CONTAINER.rvFriend, RAW.voiceMatchEntry);
      if (!(await this.driver.waitFor(entry, 15_000))) {
        throw new Error('语音匹配入口未出现');
      }
      await this.driver.click(entry);
      await this.grantPermissions(); // 麦克风权限
      // 金币不足会跳充值页（TopUpActivity），此时跳过后续匹配步骤
      if (await this.waitForActivityOr(ACT.topUp, 5_000)) {
        insufficient = true;
        this.skip('交友账号金币不足，跳转充值页，跳过语音匹配用例');
        return;
      }
      await this.waitForActivity(ACT.voiceMatch, 12_000);
    });
    if (insufficient) {
      await this.backToMain();
      await this.gotoFriendTab();
      return;
    }

    await this.check('进入语音匹配页面（正在匹配中）', async () => {
      const title = await this.driver.isDisplayed(by.id(ID.voiceMatchTitle));
      const name = await this.driver.isDisplayed(by.id(ID.voiceMatchName));
      return {
        expect: '语音匹配标题与匹配中状态可见',
        real: `标题=${title} 匹配中=${name}`,
        pass: title && name,
      };
    });

    await this.act('关闭语音匹配', async () => {
      await this.driver.click(by.id(ID.voiceMatchClose));
      // 弹「退出语音匹配？」→ 点「确认」（positiveTv）
      if (!(await this.waitDisplayed(by.id(ID.dialogPositive), '退出语音匹配弹窗', 5_000))) {
        throw new Error('退出语音匹配弹窗未出现');
      }
      await this.driver.click(by.id(ID.dialogPositive));
      await this.waitForActivity(ACT.main);
      await this.gotoFriendTab();
    });
  }

  // ---------- 工具方法 ----------

  /** 在 timeoutMs 内是否进入指定 Activity（用于检测「意外跳转页」，如金币不足跳充值页） */
  private async waitForActivityOr(expect: string | RegExp, timeoutMs = 5_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    do {
      if (await this.isActivity(expect)) return true;
      await sleep(this.statePollMs);
    } while (Date.now() < deadline);
    return false;
  }

  /** 进入"我的"tab，并等待登录态可知（logged-in / logged-out） */
  private async enterMeTab(timeoutMs = 45_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let last = 'unknown';
    while (Date.now() < deadline) {
      await this.closePopups();
      last = await this.currentState();
      if (last === 'logged-in' || last === 'logged-out') return last;
      // 兜底：已落在登录流程页（手机号/密码输入框可见）直接判定为 logged-out
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

  /** 进入首页（底部首页 tab），判定任一首页子 tab 已选中（标题下划线可见） */
  private async enterHome(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (
        (await this.driver.exists(by.id(ID.imgGameLine))) ||
        (await this.driver.exists(by.id(ID.imgFriendLine)))
      ) {
        return;
      }
      if (await this.driver.exists(by.id(ID.tabHome))) await this.driver.click(by.id(ID.tabHome));
      await sleep(1_000);
    }
    throw new Error('进入首页超时');
  }

  /** 切到首页-游戏 tab（选中下划线可见；避免用 rv/categorySkills 的 isDisplayed 误判离屏预加载页） */
  private async gotoGameTab(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.driver.exists(by.id(ID.imgGameLine))) return;
      if (await this.driver.exists(by.id(ID.tvGameTitle))) await this.driver.click(by.id(ID.tvGameTitle));
      await sleep(1_000);
    }
    throw new Error('进入游戏tab超时');
  }

  /** 切到首页-交友 tab */
  private async gotoFriendTab(timeoutMs = 15_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await this.closePopups();
      if (await this.driver.exists(by.id(ID.imgFriendLine))) return;
      if (await this.driver.exists(by.id(ID.tvFriendTitle))) await this.driver.click(by.id(ID.tvFriendTitle));
      await sleep(1_000);
    }
    throw new Error('进入交友tab超时');
  }

  /** 智能推荐列表首个陪玩师条目定位（兼容新旧两套 item 布局：新卡片 img_avatar / 旧卡片 player_profile_pic） */
  private recommendFirstItemLocator(): Locator {
    return by.xpath(
      `//*[@resource-id='${xid(RAW_CONTAINER.recommendPlayers)}']//*[@resource-id='${xid(RAW.recommendAvatarNew)}' or @resource-id='${xid(RAW.recommendAvatarOld)}']`,
    );
  }

  /** 技能列表首个陪玩师条目定位（兼容新旧两套 item 布局） */
  private skillFirstItemLocator(): Locator {
    return by.xpath(
      `//*[@resource-id='${xid(RAW_CONTAINER.categorizedList)}']//*[@resource-id='${xid(RAW.recommendAvatarNew)}' or @resource-id='${xid(RAW.recommendAvatarOld)}']`,
    );
  }

  /** 等待元素可见（isDisplayed 判定，区别于 exists 的可离屏预加载页）；期间周期性关弹窗 */
  private async waitDisplayed(locator: Locator, desc: string, timeoutMs = this.pageTimeoutMs): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let lastClose = 0;
    while (Date.now() < deadline) {
      if (await this.driver.isDisplayed(locator)) return true;
      if (Date.now() - lastClose >= 2_000) {
        await this.closePopups();
        lastClose = Date.now();
      }
      await sleep(this.statePollMs);
    }
    await this.refreshActivity();
    this.log(`等待可见超时: ${desc}，当前 Activity: ${this.activity || '(未知)'}`);
    try {
      const src = await this.driver.source();
      const texts = [...src.matchAll(/text="([^"]{1,24})"/g)].map((m) => m[1]).filter(Boolean);
      this.log(`  当前页面文本: ${[...new Set(texts)].slice(0, 20).join(' | ')}`);
    } catch {
      // ignore
    }
    return false;
  }

  /** 等待列表条目出现（isDisplayed；期间周期性上滑露出折叠区条目，应对异步加载/首屏下方条目） */
  private async waitListItem(locator: Locator, desc: string, timeoutMs = 15_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let lastSwipe = 0;
    let lastClose = 0;
    while (Date.now() < deadline) {
      if (await this.driver.isDisplayed(locator)) return true;
      if (Date.now() - lastClose >= 2_000) {
        await this.closePopups();
        lastClose = Date.now();
      }
      if (Date.now() - lastSwipe >= 2_000) {
        await this.driver.swipeUp();
        lastSwipe = Date.now();
      }
      await sleep(this.statePollMs);
    }
    await this.refreshActivity();
    this.log(`等待列表条目超时: ${desc}，当前 Activity: ${this.activity || '(未知)'}`);
    return false;
  }

  /** 处理系统权限弹窗（相机/麦克风），点击允许直到弹窗消失 */
  private async grantPermissions(maxTries = 3): Promise<void> {
    const allow = by.id(ID_PERMISSION_ALLOW);
    for (let i = 0; i < maxTries; i++) {
      if (!(await this.driver.exists(allow))) break;
      await this.driver.click(allow);
      await sleep(1_500);
    }
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
    await this.enterHome();
  }

  /** 滚动页面直到元素出现（用于我的页/设置页的长列表） */
  private async scrollToVisible(locator: Locator, maxSwipes = 15): Promise<void> {
    for (let i = 0; i < maxSwipes; i++) {
      if (await this.driver.exists(locator)) return;
      await this.driver.swipeUp();
      await sleep(500);
    }
    // 元素仍在 DOM 外（懒渲染列表）或滚动容器非 ScrollView：改用坐标滑动兜底
    for (let i = 0; i < maxSwipes; i++) {
      if (await this.driver.exists(locator)) return;
      await this.swipeByCoordinates();
      await sleep(500);
    }
    // 诊断：失败时输出当前页面文本，便于定位远端布局差异
    try {
      const src = await this.driver.source();
      const texts = [...src.matchAll(/text="([^"]{1,24})"/g)].map((m) => m[1]).filter(Boolean);
      this.log(`滚动后未找到 ${locator[1]}，当前页面文本: ${[...new Set(texts)].slice(0, 20).join(' | ')}`);
    } catch {
      // ignore
    }
    throw new Error(`滚动后仍未找到元素: ${locator[0]}=${locator[1]}`);
  }

  /** 屏幕中段坐标滑动（元素滚动失效时的兜底，如懒渲染 RecyclerView / ViewPager 内嵌列表） */
  private async swipeByCoordinates(): Promise<void> {
    const { width, height } = await this.driver.windowRect();
    const left = Math.round(width * 0.15);
    const top = Math.round(height * 0.25);
    await this.driver.execute('mobile: scrollGesture', [
      { left, top, width: width - left * 2, height: Math.round(height * 0.5), direction: 'down', percent: 0.8 },
    ]);
  }
}

await new HomeCheck().execute();
