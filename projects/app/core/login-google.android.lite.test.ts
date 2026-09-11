/**
 * Android Lite Google 登录冒烟：SM-LOGIN-07（core 入口，与 android-lite 同逻辑）
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json \
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   node --experimental-strip-types projects/app/core/login-google.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { sleep } from '../../../src/resources/AppiumResource.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC, ANDROID_LOGIN_ENTRY } from './_lib/androidLocators.ts';
import {
  androidLiteCapabilities,
  ensureAndroidLoginHome,
  loginWithGoogle,
  registerAndroidLoginStates,
} from './_lib/androidLoginFlow.ts';

class AndroidGoogleLoginSmoke extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 6;
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

    await this.act('打开登录主页（已登录则先退出）', async () => {
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

    await this.act('执行 Google 登录（点入口 → 选已登账号）', async () => {
      await loginWithGoogle(this);
    });

    await this.act('确认停留在已登录「我的」页', async () => {
      await this.closePopups();
      if (await this.driver.exists(LOC.tabMe)) {
        await this.driver.click(LOC.tabMe);
        await sleep(1_000);
        await this.closePopups();
      }
      await this.ensureState('logged-in', 20_000);
      if (!(await this.driver.exists(LOC.mePage)) && !(await this.driver.exists(LOC.meUid))) {
        throw new Error('Google 登录后未出现我的页容器 / user_no');
      }
    });

    await this.check('Google 登录成功：可抓取用户 ID 或我的页', async () => {
      const hasPage = await this.driver.exists(LOC.mePage);
      let uid = '';
      if (await this.driver.exists(LOC.meUid)) {
        uid = (await this.driver.textOf(LOC.meUid)).trim();
      }
      const pass = hasPage || /^\d+$/.test(uid);
      return {
        expect: 'mePage 或数字 user_no',
        real: uid ? `uid=${uid}` : hasPage ? 'mePage' : 'missing',
        pass,
      };
    });
  }
}

await new AndroidGoogleLoginSmoke().execute();
