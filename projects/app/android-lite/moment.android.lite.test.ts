/**
 * 热门&关注 — 5.1 发布动态（Android / Lite，com.litalite.android）
 *
 * 流程：
 *   1. 点击底部标签栏第 3 个「热门&关注」（navigation_moment）
 *   2. 点击「关注」Tab
 *   3. 点击右下角发布动态按钮（newMomentIv）→ 弹起选择弹窗
 *   4. 点击「来自图库」→ 跳转系统图库页（NewAlbumActivity）
 *   5. 选择照片 → 点击「完成」→ 跳转发布动态页（NewMomentActivity）
 *   6. 输入任意内容 → 点击发布（img_send）→ 跳转回关注动态页
 *   7. 下拉刷新页面
 *   8. 校验新动态在页面正常展示
 *   9. 删除刚发布的动态（清理测试数据）
 *
 * 前置：
 *   1. Lita 账号已登录（未登录时用 accounts.game 手机号 +86 登录，密码登录后若出 OTP 查库取码）
 *   2. 图库中有图片、图片大小不超过 5M
 *   3. 操作途中请求权限时全部选择允许
 *
 * 运行：
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
 *     SCRIPT_CONFIG=config.home.android.lite.json \
 *     node projects/app/android-lite/moment.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { by, sleep, type AppiumCapabilities, type Locator } from '../../../src/resources/AppiumResource.ts';
import { alignLiteConfigPath, querySmsCode as querySmsCodeFromDb } from '../core/_lib/androidSmsOtp.ts';

// 账号与 userToken 统一从 SCRIPT_CONFIG 读取（accounts.game + userToken）
alignLiteConfigPath();

const APP_PACKAGE = 'com.litalite.android';
const APP_ACTIVITY = '.ui.splash.SplashActivity';

/** 手机号国家前缀（+86；查库时拼接 sms_record.phone_number = 前缀 + 手机号） */
const PHONE_PREFIX = '86';
// 系统权限弹窗允许按钮（相机/相册等）
const PERMISSION_ALLOW_IDS = [
  // API 33+ 相册/媒体权限弹窗（Allow all）
  'com.android.permissioncontroller:id/permission_allow_all_button',
  'com.android.permissioncontroller:id/permission_allow_button',
  'com.android.permissioncontroller:id/permission_allow_foreground_only_button',
  'com.android.permissioncontroller:id/permission_allow_one_time_button',
  'com.android.packageinstaller:id/permission_allow_button',
];

const ACT = {
  main: '.MainActivity',
  album: '.ui.view.album.NewAlbumActivity',
  newMoment: '.ui.moment.activity.NewMomentActivity',
  momentDetail: '.ui.moment.activity.MomentDetailActivity',
};

// 元素定位符（基于 com.litalite.android，与 com.funbit.android 同一套代码仅包名不同）
const ID = {
  // 底部 tab
  tabHome: `${APP_PACKAGE}:id/navigation_home`,
  tabMe: `${APP_PACKAGE}:id/navigation_user_center`,
  tabMoment: `${APP_PACKAGE}:id/navigation_moment`,
  // 登录相关
  mePage: `${APP_PACKAGE}:id/layout_options`,
  meUid: `${APP_PACKAGE}:id/user_no`,
  meName: `${APP_PACKAGE}:id/user_name`,
  phoneLoginEntry: `${APP_PACKAGE}:id/iv_low_phone_login`,
  loginClaimBtn: `${APP_PACKAGE}:id/tv_login_and_claim`,
  countryCode: `${APP_PACKAGE}:id/tv_country_code`,
  countryList: `${APP_PACKAGE}:id/rlCountryListView`,
  phoneInput: `${APP_PACKAGE}:id/enter_phone_number`,
  phoneNext: `${APP_PACKAGE}:id/send_sms_code_button`,
  passwordInput: `${APP_PACKAGE}:id/et_password`,
  passwordSubmit: `${APP_PACKAGE}:id/tv_confirm`,
  captchaEt: `${APP_PACKAGE}:id/input_captcha_et`,
  // 弹窗
  popupActivity: `${APP_PACKAGE}:id/vp_banner`,
  popupActivityClose: `${APP_PACKAGE}:id/img_close`,
  onboardingSkip: `${APP_PACKAGE}:id/skipTv`,
  // 热门&关注
  hotTitleAllView: `${APP_PACKAGE}:id/hotTitleAllView`,
  followingTitleAllView: `${APP_PACKAGE}:id/followingTitleAllView`,
  momentListRefreshLayout: `${APP_PACKAGE}:id/momentListRefreshLayout`,
  momentListRecyclerView: `${APP_PACKAGE}:id/momentListRecyclerView`,
  newMomentIv: `${APP_PACKAGE}:id/newMomentIv`, // 发布动态按钮（右下角 FAB）
  momentItemRoot: `${APP_PACKAGE}:id/rlItemAllView`,
  momentItemMoreIv: `${APP_PACKAGE}:id/momentItemMoreIv`, // 单条动态右上角「…」
  momentItemDescriptionTv: `${APP_PACKAGE}:id/momentItemDescriptionTv`,
  // 通用选择弹窗（发布来源 / 更多菜单）
  commonFirstTv: `${APP_PACKAGE}:id/commonFirstTv`,
  commonSecondTv: `${APP_PACKAGE}:id/commonSecondTv`,
  commonCancelTv: `${APP_PACKAGE}:id/commonCancelTv`,
  // 通用确认弹窗（删除动态确认）
  dialogTitle: `${APP_PACKAGE}:id/titleTv`,
  dialogPositive: `${APP_PACKAGE}:id/positiveTv`,
  dialogNegative: `${APP_PACKAGE}:id/negativeTv`,
  // 图库选择页（NewAlbumActivity）
  albumDone: `${APP_PACKAGE}:id/tv_done`, // 完成
  albumPhoto: `${APP_PACKAGE}:id/img_photo`,
  // 发布动态页（NewMomentActivity）
  momentEdit: `${APP_PACKAGE}:id/et_moment`, // 内容输入框
  momentSend: `${APP_PACKAGE}:id/img_send`, // 发布按钮
};

function xid(raw: string): string {
  return `${APP_PACKAGE}:id/${raw}`;
}

/** 图库页第 index 张照片的可点击单元格（img_photo 不可点，点击其可点父节点） */
function albumPhotoCell(index = 1): Locator {
  return by.xpath(`(//*[@resource-id='${xid('img_photo')}'])[${index}]/..`);
}

/** 动态列表中含指定文本的条目内的「…」更多按钮 */
function momentItemMoreByText(text: string): Locator {
  return by.xpath(
    `//*[@resource-id='${xid('rlItemAllView')}'][.//*[@resource-id='${xid('momentItemDescriptionTv')}' and contains(@text,${JSON.stringify(text)})]]//*[@resource-id='${xid('momentItemMoreIv')}']`,
  );
}

/** 动态列表中含指定文本的描述 TextView */
function momentDescByText(text: string): Locator {
  return by.xpath(`//*[@resource-id='${xid('momentItemDescriptionTv')}' and contains(@text,${JSON.stringify(text)})]`);
}

class MomentPublishCheck extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 15; // 预估步数（仅 start 元数据）

    // 状态注册顺序 = 检测顺序：弹窗 → 登录态 → 页面
    this.addState({
      name: 'splash',
      activity: '.ui.splash.SplashActivity',
      detect: async () => true,
    });
    this.addState({
      name: 'popup-permission', // 系统权限弹窗（相册/相机等）
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
    };
    const udid = process.env.SCRIPT_ANDROID_UDID;
    if (udid) caps['appium:udid'] = udid;
    const deviceName = process.env.SCRIPT_ANDROID_DEVICE;
    if (deviceName) caps['appium:deviceName'] = deviceName;
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

  /** 进入"我的"tab 并等待登录态可知（logged-in / logged-out） */
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

    // 唯一文案，用于发布后校验与定位删除
    const text = `moment-auto-${Date.now()}`;

    await this.act('进入热门&关注（底部第 3 个 tab）', async () => {
      await this.closePopups();
      await this.driver.click(by.id(ID.tabMoment));
      await this.waitForElement(by.id(ID.hotTitleAllView), '热门标题', 10_000);
      await this.waitForElement(by.id(ID.newMomentIv), '发布动态按钮', 10_000);
    });

    await this.act('点击「关注」Tab', async () => {
      await this.driver.click(by.id(ID.followingTitleAllView));
      await sleep(1_000);
    });

    await this.act('点击右下角发布动态按钮，弹起选择弹窗', async () => {
      await this.closePopups();
      await this.waitForElement(by.id(ID.newMomentIv), '发布动态按钮', 10_000);
      await this.driver.click(by.id(ID.newMomentIv));
      await this.waitForElement(by.id(ID.commonFirstTv), '选择弹窗（来自图库）', 5_000);
    });

    await this.act('点击「来自图库」跳转系统图库', async () => {
      await this.clickSheetItem(by.id(ID.commonFirstTv), '「来自图库」');
      // API 33+ 首次访问相册会弹系统权限弹窗（Allow all），处理后再等相册页
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

    await this.act('输入内容并点击发布，跳转回关注动态页', async () => {
      await this.waitForElement(by.id(ID.momentEdit), '内容输入框', 5_000);
      await this.driver.input(by.id(ID.momentEdit), text);
      await this.driver.hideKeyboard();
      await this.driver.click(by.id(ID.momentSend));
      await this.waitForActivity(ACT.main, 15_000);
    });

    await this.act('下拉刷新页面', async () => {
      await this.pullToRefresh();
    });

    await this.check('发送的新动态在页面正常展示', async () => {
      const loc = momentDescByText(text);
      let shown = await this.driver.waitFor(loc, 8_000);
      // 新动态入库/列表刷新可能有延迟：未出现则再下拉刷新重试
      for (let i = 0; i < 3 && !shown; i++) {
        this.log(`未找到新动态，下拉刷新重试 (${i + 1}/3)`);
        await this.pullToRefresh();
        shown = await this.driver.waitFor(loc, 8_000);
      }
      return {
        expect: `动态列表展示新发布内容（${text}）`,
        real: shown ? '已展示' : '未找到新动态',
        pass: shown,
      };
    });

    await this.act('删除刚发布的动态（清理测试数据）', async () => {
      const more = momentItemMoreByText(text);
      if (!(await this.driver.waitFor(more, 8_000))) {
        throw new Error('未找到新动态的「…」按钮，无法删除');
      }
      await this.driver.click(more);
      // 更多菜单：删除（commonFirstTv）→ 确认弹窗：删除（positiveTv）
      await this.clickSheetItem(by.id(ID.commonFirstTv), '删除菜单');
      await this.waitForElement(by.id(ID.dialogPositive), '删除确认弹窗', 5_000);
      await this.driver.click(by.id(ID.dialogPositive));
      await sleep(2_000);
    });

    await this.check('新动态已删除（列表不再展示）', async () => {
      const loc = momentDescByText(text);
      const gone = !(await this.driver.exists(loc));
      return {
        expect: `动态已删除，列表不再展示（${text}）`,
        real: gone ? '已删除' : '仍存在',
        pass: gone,
      };
    });
  }

  /**
   * 点击底部选择弹窗中的选项：等弹窗出现 → 等弹出动画结束再点 → 选项消失视为成功，
   * 否则重试（慢设备/动画期首点易落空）。
   */
  private async clickSheetItem(locator: Locator, desc: string, timeoutMs = 5_000): Promise<void> {
    await this.waitForElement(locator, desc, timeoutMs);
    await sleep(600); // 等底部菜单弹出动画结束，避免点击落点偏移
    for (let i = 0; i < 3; i++) {
      await this.driver.click(locator);
      await sleep(800);
      if (!(await this.driver.exists(locator))) return; // 弹窗已关闭 = 点击生效
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

  /** 下拉刷新动态列表（SwipeRefreshLayout）：显式坐标向下拖动，触发更可靠 */
  private async pullToRefresh(): Promise<void> {
    const { width, height } = await this.driver.windowRect();
    const x = Math.round(width / 2);
    await this.driver.execute('mobile: dragGesture', [
      {
        startX: x,
        startY: Math.round(height * 0.3),
        endX: x,
        endY: Math.round(height * 0.75),
        speed: 1_200,
      },
    ]);
    await sleep(1_500);
  }
}

await new MomentPublishCheck().execute();
