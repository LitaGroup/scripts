/**
 * Android Lite Facebook 登录冒烟：SM-LOGIN-06
 *
 * 成功标准：登录流程完成后到达已登录「我的」页（mePage / user_no）即通过。
 *
 * 可选：SCRIPT_FACEBOOK_NAME / config.app.json facebook.name
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   node --experimental-strip-types projects/app/android-lite/login-facebook.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC, ANDROID_LOGIN_ENTRY } from '../core/_lib/androidLocators.ts';
import {
  androidLiteCapabilities,
  assertAndroidLoggedInMe,
  ensureAndroidLoginHome,
  isAndroidLoggedInMe,
  loginWithFacebook,
  registerAndroidLoginStates,
} from '../core/_lib/androidLoginFlow.ts';

class AndroidFacebookLoginSmoke extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 5;
    registerAndroidLoginStates(this);
  }

  protected capabilities() {
    return androidLiteCapabilities();
  }

  protected async login(_account: AppAccount): Promise<void> {
    await loginWithFacebook(this);
  }

  protected async runCase(): Promise<void> {
    await this.act('启动后关闭弹窗', async () => {
      const n = await this.closePopups();
      this.log(`关闭弹窗 ${n} 个；package=${ANDROID_LITE_PACKAGE}`);
    });

    await this.act('打开登录主页（未登录则进登录；已登录则先退出）', async () => {
      await ensureAndroidLoginHome(this);
    });

    await this.check('Facebook 登录入口可见', async () => {
      const e = ANDROID_LOGIN_ENTRY.facebook;
      const visible =
        (await this.driver.exists(e.high)) ||
        (await this.driver.exists(e.low)) ||
        (await this.driver.exists(e.text));
      return {
        expect: 'rl_facebook_login / iv_low_facebook_login',
        real: visible ? 'visible' : 'missing',
        pass: visible,
      };
    });

    await this.act('执行 Facebook 登录并进入「我的」', async () => {
      await loginWithFacebook(this);
      await assertAndroidLoggedInMe(this, 20_000);
    });

    await this.check('登录成功：已进入「我的」页', async () => {
      const pass = await isAndroidLoggedInMe(this);
      let uid = '';
      if (await this.driver.exists(LOC.meUid)) {
        uid = (await this.driver.textOf(LOC.meUid)).trim();
      }
      return {
        expect: '已登录「我的」（mePage / user_no）',
        real: uid ? `uid=${uid}` : pass ? 'mePage' : 'missing',
        pass,
      };
    });
  }
}

await new AndroidFacebookLoginSmoke().execute();
