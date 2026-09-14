/**
 * Android Lite 登录冒烟 P0：手机号 + 密码（含 OTP）
 *
 * 成功标准：登录流程完成后到达已登录「我的」页（mePage / user_no）即通过。
 * 门控与 Google / Facebook 相同（ensureAndroidLoginHome）。
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   node --experimental-strip-types projects/app/android-lite/login-phone-password.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC } from '../core/_lib/androidLocators.ts';
import {
  androidLiteCapabilities,
  assertAndroidLoggedInMe,
  ensureAndroidLoginHome,
  isAndroidLoggedInMe,
  loginWithPhonePassword,
  registerAndroidLoginStates,
} from '../core/_lib/androidLoginFlow.ts';

class AndroidPhonePasswordLoginSmoke extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 4;
    registerAndroidLoginStates(this);
  }

  protected capabilities() {
    return androidLiteCapabilities();
  }

  protected async login(account: AppAccount): Promise<void> {
    await loginWithPhonePassword(this, account);
  }

  protected async runCase(): Promise<void> {
    await this.act('启动后关闭弹窗', async () => {
      const n = await this.closePopups();
      this.log(`关闭弹窗 ${n} 个；package=${ANDROID_LITE_PACKAGE}`);
    });

    await this.act('打开登录主页（未登录则进登录；已登录则先退出）', async () => {
      await ensureAndroidLoginHome(this);
    });

    await this.act('执行手机号+密码登录并进入「我的」', async () => {
      await loginWithPhonePassword(this, this.account());
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

await new AndroidPhonePasswordLoginSmoke().execute();
