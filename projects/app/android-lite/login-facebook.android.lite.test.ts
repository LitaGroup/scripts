/**
 * Android Lite Facebook 登录冒烟：SM-LOGIN-06
 *
 * 前置：
 *   - 设备 Facebook App 或 Chrome 已登录 Facebook（不填账密）
 *   - 点击 App 内 Facebook 入口后，授权页点 Continue as / Continue 即可完成
 *
 * 可选配置（优先匹配展示名；不配则直接点 Continue）：
 *   SCRIPT_FACEBOOK_NAME=Your Name
 *   或 config.app.json → "facebook": { "name": "Your Name" }
 *   或 accounts.facebook.name / email
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json \
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   node --experimental-strip-types projects/app/android-lite/login-facebook.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { sleep } from '../../../src/resources/AppiumResource.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC, ANDROID_LOGIN_ENTRY } from '../core/_lib/androidLocators.ts';
import {
  androidLiteCapabilities,
  ensureAndroidLoginHome,
  loginWithFacebook,
  registerAndroidLoginStates,
} from '../core/_lib/androidLoginFlow.ts';

class AndroidFacebookLoginSmoke extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 6;
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

    await this.act('打开登录主页（已登录则先退出）', async () => {
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

    await this.act('执行 Facebook 登录（点入口 → Continue）', async () => {
      await loginWithFacebook(this);
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
        throw new Error('Facebook 登录后未出现我的页容器 / user_no');
      }
    });

    await this.check('Facebook 登录成功：可抓取用户 ID 或我的页', async () => {
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

await new AndroidFacebookLoginSmoke().execute();
