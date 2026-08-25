/**
 * Step 1：打开 APP，进入"我的"页（Android / Lite）
 *
 * 运行：
 *   node projects/app/sample/step-1-open-me.android.lite.test.ts
 */
import { AppBaseClass } from '../../../src/base/AppBaseClass.ts';
import { by, sleep, type AppiumCapabilities } from '../../../src/resources/AppiumResource.ts';

const APP_PACKAGE = 'com.litalite.android';

const ID = {
  tabHome: `${APP_PACKAGE}:id/navigation_home`, // 底部 tab - 首页（MainActivity 标记）
  tabMe: `${APP_PACKAGE}:id/navigation_user_center`, // 底部 tab - 我的
  meUid: `${APP_PACKAGE}:id/user_no`, // 我的页 - 用户ID（已登录标记）
  loginPage: `${APP_PACKAGE}:id/rl_facebook_login`, // 登录页标记（未登录时拉起 LoginActivity）
  popupActivity: `${APP_PACKAGE}:id/vp_banner`, // 冷启动活动弹窗
  popupActivityClose: `${APP_PACKAGE}:id/img_close`, // 活动弹窗 - 关闭按钮
};

class Step1OpenMe extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 3;

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
      name: 'logged-in', // 我的 tab：已登录（先比对 Activity，再做元素级判定）
      activity: '.MainActivity',
      detect: () => this.driver.exists(by.id(ID.meUid)),
    });
    this.addState({
      name: 'logged-out', // 登录页（Activity 级判定）
      activity: '.ui.login.LoginActivity',
      detect: async () => true,
    });
    this.addState({
      name: 'home', // MainActivity（首页/我的等 tab 容器，Activity 级判定）
      activity: '.MainActivity',
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
        // APP 启动后可能落在任意 tab / 有启动弹窗，等待任一已知状态出现
        await this.ensureAnyState(['home', 'logged-in', 'logged-out']);
      },
      { expectActivity: /\.(MainActivity|ui\.login\.LoginActivity)$/ }, // 操作后必须进入主页面或登录页，否则本步骤失败且跳过后续步骤
    );

    await this.act(
      '进入"我的"页',
      async () => {
        await this.enterMeTab();
      },
      { expectActivity: /\.(MainActivity|ui\.login\.LoginActivity)$/ },
    );

    await this.check('已在"我的"页（登录态可知）', async () => {
      const s = await this.currentState();
      this.log(`当前状态: ${s}`);
      return { expect: 'logged-in 或 logged-out', real: s, pass: s === 'logged-in' || s === 'logged-out' };
    });
  }

  /** 进入"我的"tab：先关弹窗再点击；初始化期间点击可能被吞掉，故在窗口内重试 */
  private async enterMeTab(timeoutMs = 15_000): Promise<string> {
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

await new Step1OpenMe().execute();
