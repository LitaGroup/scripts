/**
 * Android Lite Google 登录冒烟：SM-LOGIN-07
 *
 * 成功标准：登录流程完成后到达已登录「我的」页（mePage / user_no）即通过。
 *
 * 可选：SCRIPT_GOOGLE_EMAIL / config.app.json google.email
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   node --experimental-strip-types projects/app/android-lite/login-google.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC, ANDROID_LOGIN_ENTRY } from '../core/_lib/androidLocators.ts';
import {
  androidLiteCapabilities,
  assertAndroidLoggedInMe,
  ensureAndroidLoginHome,
  isAndroidLoggedInMe,
  loginWithGoogle,
  registerAndroidLoginStates,
} from '../core/_lib/androidLoginFlow.ts';

class AndroidGoogleLoginSmoke extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 5;
    registerAndroidLoginStates(this);
  }

  protected capabilities() {
    return androidLiteCapabilities();
  }

  protected async login(_account: AppAccount): Promise<void> {
    await loginWithGoogle(this);
  }

  protected async runCase(): Promise<void> {
    await this.act('启动后关闭弹窗', async () => {
      const n = await this.closePopups();
      this.log(`关闭弹窗 ${n} 个；package=${ANDROID_LITE_PACKAGE}`);
    });

    await this.act('打开登录主页（未登录则进登录；已登录则先退出）', async () => {
      await ensureAndroidLoginHome(this);
    });

    await this.check('Google 登录入口可见', async () => {
      const e = ANDROID_LOGIN_ENTRY.google;
      const visible =
        (await this.driver.exists(e.low)) ||
        (await this.driver.exists(e.high)) ||
        (await this.driver.exists(e.text));
      return {
        expect: 'iv_low_google_login / rl_google_login',
        real: visible ? 'visible' : 'missing',
        pass: visible,
      };
    });

    await this.act('执行 Google 登录并进入「我的」', async () => {
      await loginWithGoogle(this);
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

await new AndroidGoogleLoginSmoke().execute();
