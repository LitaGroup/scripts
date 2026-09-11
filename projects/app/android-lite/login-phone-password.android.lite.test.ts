/**
 * Android Lite 登录冒烟 P0：手机号 + 密码（含 OTP）
 *
 * 用例：SM-LOGIN-02 / SM-LOGIN-03 / SM-LOGIN-11（见 LOGIN_SMOKE.md）
 * 工程：lita-lite-android，package com.litalite.android
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json \
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   SCRIPT_OTP=1234 \
 *   node --experimental-strip-types projects/app/core/login-phone-password.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC } from './_lib/androidLocators.ts';
import {
  androidLiteCapabilities,
  ensureAndroidLoggedIn,
  loginWithPhonePassword,
  registerAndroidLoginStates,
} from './_lib/androidLoginFlow.ts';

class AndroidPhonePasswordLoginSmoke extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 5;
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

    await this.act('识别登录态（经「我的」门控）', async () => {
      this.log(`当前状态: ${await this.currentState()}`);
    });

    await this.act('确保已登录（未登录则走手机号+密码）', async () => {
      await ensureAndroidLoggedIn(this, this.account());
    });

    await this.act('确认停留在已登录「我的」页', async () => {
      await this.closePopups();
      await this.ensureState('logged-in', 15_000);
    });

    await this.check('登录成功：可抓取用户 ID 或我的页容器', async () => {
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

await new AndroidPhonePasswordLoginSmoke().execute();
