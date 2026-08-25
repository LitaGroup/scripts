/**
 * 登录核心检查（Android / Lita）
 *
 * 命名规范：{脚本名称}.{ios|android}.{lita|lite}.{check|test}.ts
 *
 * 运行：
 *   node projects/app/core/login.android.lita.check.ts
 *   SCRIPT_APPIUM_URL=http://172.20.1.79:4723/ SCRIPT_ENV=TEST \
 *   SCRIPT_CONFIG=config.app.json node projects/app/core/login.android.lita.check.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { by, type AppiumCapabilities } from '../../../src/resources/AppiumResource.ts';

// TODO: 按实际应用填写包名与元素定位符
const APP_PACKAGE = 'com.lita.XXX';
const APP_ACTIVITY = '.MainActivity';
const ID_TAB_ME = `${APP_PACKAGE}:id/tab_me`;
const ID_LOGIN_ENTRY = `${APP_PACKAGE}:id/btn_login`;
const ID_USERNAME = `${APP_PACKAGE}:id/et_username`;
const ID_PASSWORD = `${APP_PACKAGE}:id/et_password`;
const ID_SUBMIT = `${APP_PACKAGE}:id/btn_submit`;
const ID_POPUP_CLOSE = `${APP_PACKAGE}:id/iv_close`;

class LoginCheck extends AppBaseClass {
  constructor() {
    super('android', 'lita');
    this.total = 3;

    // 状态注册顺序 = 检测顺序，建议：弹窗 → 登录态 → 其它页面

    // 弹窗状态（可能有多层，closePopups 会循环关闭）
    this.addState({
      name: 'popup-update',
      kind: 'popup',
      detect: () => this.driver.exists(by.text('立即更新')),
      handle: async () => {
        await this.driver.click(by.id(ID_POPUP_CLOSE));
      },
    });
    this.addState({
      name: 'popup-ad',
      kind: 'popup',
      detect: () => this.driver.exists(by.id(ID_POPUP_CLOSE)),
      handle: async () => {
        await this.driver.click(by.id(ID_POPUP_CLOSE));
      },
    });

    // 登录态（ensureLoggedIn 依赖这两个状态名）
    this.addState({
      name: 'logged-in',
      detect: async () => (await this.driver.exists(by.id(ID_TAB_ME))) && !(await this.driver.exists(by.text('登录'))),
    });
    this.addState({
      name: 'logged-out',
      detect: () => this.driver.exists(by.id(ID_LOGIN_ENTRY)),
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

  protected async login(account: AppAccount): Promise<void> {
    await this.driver.click(by.id(ID_LOGIN_ENTRY));
    if (!(await this.driver.waitFor(by.id(ID_USERNAME)))) throw new Error('登录页未出现（账号输入框）');
    // 1. 输入手机号 2. 收起软键盘 3. 点击下一步 4. 输入密码 5. 收起软键盘 6. 点击登录
    await this.driver.input(by.id(ID_USERNAME), account.username);
    await this.driver.hideKeyboard();
    await this.driver.click(by.id(ID_SUBMIT)); // 手机号页「下一步」
    if (!(await this.driver.waitFor(by.id(ID_PASSWORD)))) throw new Error('密码输入页未出现');
    await this.driver.input(by.id(ID_PASSWORD), account.password);
    await this.driver.hideKeyboard();
    await this.driver.click(by.id(ID_SUBMIT)); // 密码页「登录」
  }

  protected async runCase(): Promise<void> {
    await this.act('启动后关闭弹窗', async () => {
      const n = await this.closePopups();
      this.log(`关闭弹窗 ${n} 个`);
    });

    await this.act('确保已登录（未登录则自动登录）', async () => {
      await this.ensureLoggedIn();
    });

    await this.check('登录状态为已登录', async () => {
      const s = await this.currentState();
      return { expect: 'logged-in', real: s };
    });
  }
}

await new LoginCheck().execute();
