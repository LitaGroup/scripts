/**
 * Android Lite 三方+手机号串联登录：SM-LOGIN-14
 *
 * 顺序：Google →（设置退出 → 点「我的」登录页）→ Facebook →（同上）→ 手机号 →「我的」完成。
 * 切换登录方式时不重启 App（logoutAndroidThenOpenLoginPage）。
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC } from '../core/_lib/androidLocators.ts';
import {
  androidLiteCapabilities,
  assertAndroidLoggedInMe,
  isAndroidLoggedInMe,
  loginWithFacebook,
  loginWithGoogle,
  loginWithPhonePassword,
  logoutAndroidThenOpenLoginPage,
  registerAndroidLoginStates,
} from '../core/_lib/androidLoginFlow.ts';

class AndroidLoginAllSmoke extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 7;
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

    await this.act('① Google 登录并进入「我的」', async () => {
      await loginWithGoogle(this);
      await assertAndroidLoggedInMe(this, 20_000);
    });

    await this.act('退出登录后点「我的」弹出登录页', async () => {
      await logoutAndroidThenOpenLoginPage(this);
    });

    await this.act('② Facebook 登录并进入「我的」', async () => {
      await loginWithFacebook(this);
      await assertAndroidLoggedInMe(this, 20_000);
    });

    await this.act('再次退出登录后点「我的」弹出登录页', async () => {
      await logoutAndroidThenOpenLoginPage(this);
    });

    await this.act('③ 手机号登录并进入「我的」', async () => {
      await loginWithPhonePassword(this, this.account());
      await assertAndroidLoggedInMe(this, 20_000);
    });

    await this.check('串联完成：已在「我的」页', async () => {
      const pass = await isAndroidLoggedInMe(this);
      let uid = '';
      if (await this.driver.exists(LOC.meUid)) {
        uid = (await this.driver.textOf(LOC.meUid)).trim();
      }
      return {
        expect: '手机号登录后「我的」（mePage / user_no）',
        real: uid ? `uid=${uid}` : pass ? 'mePage' : 'missing',
        pass,
      };
    });
  }
}

await new AndroidLoginAllSmoke().execute();
