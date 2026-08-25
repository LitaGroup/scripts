/**
 * Step 2：手机号 + 密码登录（Android / Lite）
 *
 * 前置：未登录状态（已登录会导致"拉起登录页"断言失败并跳过后续步骤）。
 * 流程：打开APP → 我的 tab（未登录则拉起登录页，已登录先退出）→ 手机号登录 → 选区号+86 → 输入手机号
 *       → Next → 输入密码 → 关闭软键盘 → 点击登录 → 校验登录成功
 * 约定：输入前先断言输入框存在，不存在则当前步骤直接失败。
 *
 * 运行：
 *   node projects/app/sample/step-2-phone-login.android.lite.test.ts
 */
import { AppBaseClass } from '../../../src/base/AppBaseClass.ts';
import { by, sleep, type AppiumCapabilities } from '../../../src/resources/AppiumResource.ts';

const APP_PACKAGE = 'com.litalite.android';

// 测试账号（真实脚本建议通过 SCRIPT_CONFIG 的 accounts 配置注入）
const TEST_PHONE = '18611755224';
const TEST_PASSWORD = '123456';

const ID = {
  tabMe: `${APP_PACKAGE}:id/navigation_user_center`, // 底部 tab - 我的
  mePage: `${APP_PACKAGE}:id/layout_options`, // 我的页 - 内容容器（已登录标记；比 user_no 稳定，渲染异常时仍可见）
  meUid: `${APP_PACKAGE}:id/user_no`, // 我的页 - 用户ID（渲染异常时可能被隐藏，抓不到需冷重启）
  settingEntry: `${APP_PACKAGE}:id/setting_layout`, // 我的页 - Settings 入口（需滚动）
  logout: `${APP_PACKAGE}:id/logout_tv`, // 设置页 - Log Out（需滚动）
  popupActivity: `${APP_PACKAGE}:id/vp_banner`, // 冷启动活动弹窗
  popupActivityClose: `${APP_PACKAGE}:id/img_close`, // 活动弹窗 - 关闭按钮
  phoneLoginEntry: `${APP_PACKAGE}:id/iv_low_phone_login`, // 登录页 - 手机号登录图标
  countryCode: `${APP_PACKAGE}:id/tv_country_code`, // 手机号页 - 区号选择器
  countryList: `${APP_PACKAGE}:id/rlCountryListView`, // 区号选择 - 国家列表
  phoneInput: `${APP_PACKAGE}:id/enter_phone_number`, // 手机号页 - 手机号输入框
  phoneNext: `${APP_PACKAGE}:id/send_sms_code_button`, // 手机号页 - Next 按钮
  passwordInput: `${APP_PACKAGE}:id/et_password`, // 密码页 - 密码输入框
  passwordSubmit: `${APP_PACKAGE}:id/tv_confirm`, // 密码页 - Login 按钮
};

const ACT = {
  login: '.ui.login.LoginActivity', // 登录流程各页（登录主页/手机号页/密码页）
  main: '.MainActivity', // 主页面（首页/我的等 tab 容器）
};

class Step2PhoneLogin extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 9;

    // 状态注册顺序 = 检测顺序：弹窗 → 登录态 → 页面
    this.addState({
      name: 'popup-activity',
      kind: 'popup',
      detect: () => this.driver.exists(by.id(ID.popupActivity)),
      handle: async () => {
        await this.driver.click(by.id(ID.popupActivityClose));
      },
    });
    this.addState({
      name: 'logged-in', // 我的 tab：已登录（先比对 Activity，再做元素级判定；用内容容器判定，比 user_no 稳定）
      activity: ACT.main,
      detect: () => this.driver.exists(by.id(ID.mePage)),
    });
    this.addState({
      name: 'logged-out', // 登录页（Activity 级判定）
      activity: ACT.login,
      detect: async () => true,
    });
    this.addState({
      name: 'home', // 主页面（Activity 级判定）
      activity: ACT.main,
      detect: async () => true,
    });
  }

  protected capabilities(): AppiumCapabilities {
    return {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:appPackage': APP_PACKAGE,
      'appium:appActivity': '.ui.splash.SplashActivity',
      'appium:noReset': true,
      'appium:newCommandTimeout': 300,
    };
  }

  protected async runCase(): Promise<void> {
    await this.act(
      '打开APP，等待就绪（关弹窗）',
      async () => {
        await this.ensureAnyState(['home', 'logged-in', 'logged-out']);
      },
      { expectActivity: /\.(MainActivity|ui\.login\.LoginActivity)$/ },
    );

    await this.act(
      '进入"我的"tab，处理登录状态为未登录',
      async () => {
        const state = await this.enterMeTab();
        if (state === 'logged-out') return;
        // 已登录 → 我的页滚动到 Settings → 设置页滚动到 Log Out → 退出 → 再进我的 tab 拉起登录页
        this.log('当前已登录，先退出登录');
        await this.scrollToVisible(by.id(ID.settingEntry));
        await this.driver.click(by.id(ID.settingEntry));
        await this.scrollToVisible(by.id(ID.logout));
        await this.driver.click(by.id(ID.logout)); // 实测无确认弹窗，点击即退出并回到首页
        await this.waitForActivity(/\.MainActivity$/); // 退出后回到主页面
        const after = await this.enterMeTab();
        if (after !== 'logged-out') throw new Error(`退出登录后状态异常: ${after}`);
      },
      { expectActivity: /\.ui\.login\.LoginActivity$/ },
    );

    await this.act('选择"手机号登录"，进入手机号输入页', async () => {
      // 会话恢复可能落在登录流程中间页：密码页 → 返回手机号页；手机号页 → 直接用
      if (await this.driver.exists(by.id(ID.passwordInput))) {
        await this.driver.back();
        await sleep(800);
      }
      if (!(await this.driver.exists(by.id(ID.phoneInput)))) {
        // 登录主页（可能仍在加载，先等待入口出现再点击）
        await this.waitForElement(by.id(ID.phoneLoginEntry), '手机号登录入口');
        await this.driver.click(by.id(ID.phoneLoginEntry));
      }
      // 等待进入手机号输入页（页面进入等待 ≤3s，超时则报错并跳过后续步骤）
      await this.waitForElement(by.id(ID.phoneInput), '手机号输入框');
    });

    await this.act(`选择区号 +86 并输入手机号（${TEST_PHONE}）`, async () => {
      await this.assertExists(by.id(ID.countryCode), '区号选择器');
      await this.driver.click(by.id(ID.countryCode));
      // 国家列表（底部弹层）中找到 China (+86)，必要时在列表内滑动
      const china = by.text('China');
      for (let i = 0; i < 6 && !(await this.driver.exists(china)); i++) {
        await this.driver.swipeInElement(by.id(ID.countryList), 'up');
        await sleep(500);
      }
      await this.assertExists(china, '国家列表中的 China (+86)');
      await this.driver.click(china);
      // 输入前判断元素是否存在，不存在直接失败
      await this.assertExists(by.id(ID.phoneInput), '手机号输入框');
      await this.driver.input(by.id(ID.phoneInput), TEST_PHONE);
      // 输入后校验内容真实写入
      const typed = await this.driver.textOf(by.id(ID.phoneInput));
      if (!typed.includes(TEST_PHONE)) throw new Error(`手机号输入失败，当前内容: "${typed}"`);
    });

    await this.act('点击 Next，进入密码输入页', async () => {
      await this.driver.hideKeyboard(); // 收起键盘，避免遮挡 Next 按钮
      await this.assertExists(by.id(ID.phoneNext), 'Next 按钮');
      await this.driver.click(by.id(ID.phoneNext));
      // 等待进入密码输入页（≤3s，超时则报错并跳过后续步骤）
      await this.waitForElement(by.id(ID.passwordInput), '密码输入框');
    });

    await this.act('输入密码', async () => {
      // 输入前判断元素是否存在，不存在直接失败
      await this.assertExists(by.id(ID.passwordInput), '密码输入框');
      await this.driver.input(by.id(ID.passwordInput), TEST_PASSWORD);
      const typed = await this.driver.textOf(by.id(ID.passwordInput));
      if (!typed || typed === 'Input password') throw new Error('密码输入失败（内容为空）');
    });

    await this.act('关闭软键盘', async () => {
      await this.driver.hideKeyboard();
    });

    await this.act('点击登录', async () => {
      await this.assertExists(by.id(ID.passwordSubmit), 'Login 按钮');
      await this.driver.click(by.id(ID.passwordSubmit));
      // 登录成功后应回到主页面（≤3s，超时则报错并跳过后续步骤）
      await this.waitForActivity(/\.MainActivity$/);
    });

    await this.check('登录成功：我的页可抓取到用户ID', async () => {
      // 登录后我的页可能渲染异常（用户区高度为 0，user_no 对 Appium 不可见），冷重启可恢复
      let uid = await this.grabMyUid();
      if (!uid) {
        this.log('用户ID不可见（渲染异常），冷重启APP后重试');
        await this.terminateApp();
        await sleep(1_500);
        await this.activateApp();
        await this.ensureAnyState(['home', 'logged-in', 'logged-out'], 30_000);
        uid = await this.grabMyUid();
      }
      if (uid) this.log(`抓取到用户ID: ${uid}`);
      return { expect: '数字用户ID', real: uid ? `ID=${uid}` : '抓取失败', pass: uid.length > 0 };
    });
  }

  /** 进入我的页并抓取用户ID；抓不到返回空串 */
  private async grabMyUid(): Promise<string> {
    const state = await this.enterMeTab();
    if (state !== 'logged-in') return '';
    const uidLocator = by.id(ID.meUid);
    for (let i = 0; i < 5; i++) {
      if (await this.driver.exists(uidLocator)) {
        const text = (await this.driver.textOf(uidLocator)).trim();
        if (/^\d+$/.test(text)) return text;
      }
      await sleep(1_000);
    }
    return '';
  }

  /** 滚动页面直到元素出现（用于我的页/设置页的长列表） */
  private async scrollToVisible(locator: ReturnType<typeof by.id>, maxSwipes = 8): Promise<void> {
    for (let i = 0; i <= maxSwipes; i++) {
      if (await this.driver.exists(locator)) return;
      await this.driver.swipeUp();
      await sleep(600);
    }
    throw new Error(`滚动后仍未找到元素: ${locator[0]}=${locator[1]}`);
  }

  /** 进入"我的"tab：先关弹窗再点击；初始化期间点击可能被吞掉，故在窗口内重试（资料接口较慢，默认等 30s） */
  private async enterMeTab(timeoutMs = 30_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let last = 'unknown';
    while (Date.now() < deadline) {
      await this.closePopups();
      last = await this.currentState();
      if (last === 'logged-in' || last === 'logged-out') return last;
      if (await this.driver.exists(by.id(ID.tabMe))) await this.driver.click(by.id(ID.tabMe));
      await sleep(1_000);
    }
    throw new Error(`进入"我的"tab超时，当前状态: ${last}`);
  }
}

await new Step2PhoneLogin().execute();
