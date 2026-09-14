/**
 * 与 android-lite/login-google.android.lite.test.ts 同逻辑（core 入口副本）。
 * 成功标准：到达已登录「我的」页即通过。
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC, ANDROID_LOGIN_ENTRY } from './_lib/androidLocators.ts';
import {
  androidLiteCapabilities,
  assertAndroidLoggedInMe,
  ensureAndroidLoginHome,
  isAndroidLoggedInMe,
  loginWithGoogle,
  registerAndroidLoginStates,
} from './_lib/androidLoginFlow.ts';

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
