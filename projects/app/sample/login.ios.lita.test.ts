/**
 * iOS 登录样例（Lita / LitaDev，bundleId = but.lita.ios）
 * 逻辑已抽到 core/_lib；本文件保持 sample 入口兼容。
 *
 * 正式冒烟请用：
 *   projects/app/core/login-phone-password.ios.lita.test.ts
 *   projects/app/core/LOGIN_SMOKE.md
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json \
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   SCRIPT_IOS_DEVICE="iPhone 17" \
 *   node --experimental-strip-types projects/app/sample/login.ios.lita.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import { IOS_BUNDLE_ID } from '../core/_lib/iosLocators.ts';
import { iosLitaCapabilities, loginWithPhonePassword, registerIosLoginStates } from '../core/_lib/iosLoginFlow.ts';

class IosLoginSample extends AppBaseClass {
  constructor() {
    super('ios', 'lita');
    this.total = 5;
    registerIosLoginStates(this);
  }

  protected capabilities() {
    return iosLitaCapabilities();
  }

  protected async login(account: AppAccount): Promise<void> {
    await loginWithPhonePassword(this, account);
  }

  protected async runCase(): Promise<void> {
    await this.act('启动后关闭弹窗', async () => {
      const n = await this.closePopups();
      this.log(`关闭弹窗 ${n} 个；bundleId=${IOS_BUNDLE_ID}`);
    });

    await this.act('识别登录态', async () => {
      this.log(`当前状态: ${await this.currentState()}`);
    });

    await this.act('确保已登录（未登录则走手机号+密码）', async () => {
      await this.closePopups();
      await this.ensureLoggedIn(90_000);
    });

    await this.act('确认已进入首页（已登录）', async () => {
      await this.closePopups();
      await this.ensureState('logged-in', 15_000);
      this.log('已登录并停留在首页');
    });

    await this.check('登录状态为已登录', async () => {
      const s = await this.currentState();
      return { expect: 'logged-in', real: s, pass: s === 'logged-in' };
    });
  }
}

await new IosLoginSample().execute();
