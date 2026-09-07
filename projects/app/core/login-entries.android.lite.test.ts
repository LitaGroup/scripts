/**
 * Android Lite 登录冒烟 P0：登录页各方式入口可见（不完成三方 OAuth）
 *
 * 用例：SM-LOGIN-01
 * 工程：lita-lite-android
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json \
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   node --experimental-strip-types projects/app/core/login-entries.android.lite.test.ts
 *
 * 注意：需未登录；若已登录脚本会尝试退出后再验入口。
 */
import { AppBaseClass } from '../../../src/base/AppBaseClass.ts';
import { by, sleep, type Locator } from '../../../src/resources/AppiumResource.ts';
import { ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC, ANDROID_LOGIN_ENTRY } from './_lib/androidLocators.ts';
import {
  androidLiteCapabilities,
  enterAndroidMeGate,
  registerAndroidLoginStates,
} from './_lib/androidLoginFlow.ts';

type EntryKey = keyof typeof ANDROID_LOGIN_ENTRY;

async function isEntryVisible(app: AppBaseClass, key: EntryKey): Promise<boolean> {
  const e = ANDROID_LOGIN_ENTRY[key];
  const driver = app['driver'];
  if (await driver.exists(e.low)) return true;
  if (await driver.exists(e.high)) return true;
  if (await driver.exists(e.text)) return true;
  return false;
}

async function scrollToVisible(app: AppBaseClass, locator: Locator, maxSwipes = 8): Promise<void> {
  for (let i = 0; i <= maxSwipes; i++) {
    if (await app['driver'].exists(locator)) return;
    await app['driver'].swipeUp();
    await sleep(500);
  }
  throw new Error(`滚动后仍未找到: ${locator[0]}=${locator[1]}`);
}

class AndroidLoginEntriesSmoke extends AppBaseClass {
  constructor() {
    super('android', 'lite');
    this.total = 5;
    registerAndroidLoginStates(this);
  }

  protected capabilities() {
    return androidLiteCapabilities();
  }

  protected async login(): Promise<void> {
    throw new Error('login-entries 不应触发自动登录');
  }

  private async forceLoginHome(): Promise<void> {
    await this.closePopups();
    let gate = await enterAndroidMeGate(this);
    if (gate === 'logged-in') {
      this.log('已登录，先退出以便检查登录入口');
      await scrollToVisible(this, LOC.settingEntry);
      await this.driver.click(LOC.settingEntry);
      await scrollToVisible(this, LOC.logout);
      await this.driver.click(LOC.logout);
      await this.waitForActivity(/\.MainActivity$/, 15_000);
      await sleep(800);
      gate = await enterAndroidMeGate(this);
    }
    if (gate !== 'logged-out') throw new Error(`未能打开登录页，状态=${gate}`);
    // 回到登录主页：若落在手机号/密码中间页则 back
    if (await this.driver.exists(LOC.passwordInput) || (await this.driver.exists(LOC.phoneInput))) {
      await this.driver.back();
      await sleep(600);
    }
    if (await this.driver.exists(LOC.passwordInput) || (await this.driver.exists(LOC.phoneInput))) {
      await this.driver.back();
      await sleep(600);
    }
  }

  protected async runCase(): Promise<void> {
    await this.act('启动并打开登录主页', async () => {
      const n = await this.closePopups();
      this.log(`关闭弹窗 ${n}；package=${ANDROID_LITE_PACKAGE}`);
      await this.forceLoginHome();
    });

    await this.check('手机号登录入口可见（P0）', async () => {
      const pass = await isEntryVisible(this, 'phone');
      return { expect: 'phone entry', real: pass ? 'visible' : 'missing', pass };
    });

    await this.act('扫描三方入口（按区配置，缺失仅记录）', async () => {
      const keys: EntryKey[] = ['facebook', 'google', 'line', 'kakao'];
      const found: string[] = [];
      const missing: string[] = [];
      for (const k of keys) {
        if (await isEntryVisible(this, k)) found.push(k);
        else missing.push(k);
      }
      this.log(`三方可见: ${found.join(', ') || '(无)'}`);
      this.log(`三方未出现: ${missing.join(', ') || '(无)'}`);
      if (found.length === 0) {
        throw new Error('未发现任何三方登录入口');
      }
    });

    await this.check('至少一个三方入口可见', async () => {
      const keys: EntryKey[] = ['facebook', 'google', 'line', 'kakao'];
      let n = 0;
      for (const k of keys) if (await isEntryVisible(this, k)) n++;
      return { expect: '>=1 oauth', real: String(n), pass: n >= 1 };
    });

    await this.check('无 Apple 入口（Android Lite 不提供）', async () => {
      const appleText = await this.driver.exists(by.textContains('Apple'));
      return { expect: 'no Apple button', real: appleText ? 'found' : 'absent', pass: !appleText };
    });
  }
}

await new AndroidLoginEntriesSmoke().execute();
