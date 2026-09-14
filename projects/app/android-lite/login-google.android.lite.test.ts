/**
 * Android Lite Google 登录冒烟：SM-LOGIN-07
 *
 * 通过标准：到达已登录「我的」页（mePage / user_no）即整单通过。
 * 门控与选账号均在「执行登录」步骤内完成，避免前置步骤 fail 导致最终已进「我的」仍判未通过。
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC } from '../core/_lib/androidLocators.ts';
import {
  androidLiteCapabilities,
  assertAndroidLoggedInMe,
  isAndroidLoggedInMe,
  loginWithGoogle,
  registerAndroidLoginStates,
} from '../core/_lib/androidLoginFlow.ts';

class AndroidGoogleLoginSmoke extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 3;
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
