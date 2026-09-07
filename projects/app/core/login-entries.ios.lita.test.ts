/**
 * iOS 登录冒烟 P0：登录页各方式入口可见（不完成三方 OAuth）
 *
 * 用例：SM-LOGIN-01
 * 说明：projects/app/core/LOGIN_SMOKE.md
 *
 * 运行：
 *   SCRIPT_CONFIG=config.app.json \
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ \
 *   SCRIPT_IOS_DEVICE="iPhone 17" \
 *   node --experimental-strip-types projects/app/core/login-entries.ios.lita.test.ts
 *
 * 可选：SCRIPT_FORCE_LOGOUT=1 时若已登录则尝试关登录页失败后跳过入口检查并报 fail（需人工退登）
 */
import { AppBaseClass } from '../../../src/base/AppBaseClass.ts';
import { sleep } from '../../../src/resources/AppiumResource.ts';
import { IOS_BUNDLE_ID, IOS_LOC as LOC, IOS_LOGIN_ENTRY } from './_lib/iosLocators.ts';
import { iosLitaCapabilities, registerIosLoginStates } from './_lib/iosLoginFlow.ts';

type EntryKey = keyof typeof IOS_LOGIN_ENTRY;

async function isEntryVisible(app: AppBaseClass, key: EntryKey): Promise<boolean> {
  const e = IOS_LOGIN_ENTRY[key];
  const driver = app['driver'];
  if ('lowId' in e && (await driver.isDisplayed(e.lowId))) return true;
  if ('highText' in e && (await driver.isDisplayed(e.highText))) return true;
  return false;
}

class IosLoginEntriesSmoke extends AppBaseClass {
  constructor() {
    super('ios', 'lita');
    this.total = 4;
    registerIosLoginStates(this);
  }

  protected capabilities() {
    return iosLitaCapabilities();
  }

  /** 本脚本不自动登录；占位满足基类 */
  protected async login(): Promise<void> {
    throw new Error('login-entries 用例不应触发自动登录');
  }

  /** 尽量打开登录页；已登录则无法验入口 */
  private async openLoginSheet(): Promise<boolean> {
    await this.closePopups();
    if (await this.driver.isDisplayed(LOC.loginTitle)) return true;
    if (await this.driver.isDisplayed(LOC.phoneLoginEntry)) return true;

    // 已登录：点我的无法得到登录页
    const state = await this.currentState();
    if (state === 'logged-in') {
      this.log('当前已登录，无法展示登录入口；请先退出登录后再跑本用例');
      return false;
    }

    if (await this.driver.isDisplayed(LOC.tabMe)) {
      await this.driver.click(LOC.tabMe);
      await sleep(1000);
      await this.closePopups();
    }

    // 首页未登录时常直接出登录 sheet
    await sleep(800);
    return (
      (await this.driver.isDisplayed(LOC.loginTitle)) ||
      (await this.driver.isDisplayed(LOC.phoneLoginEntry))
    );
  }

  protected async runCase(): Promise<void> {
    await this.act('启动并尝试打开登录页', async () => {
      const n = await this.closePopups();
      this.log(`关闭弹窗 ${n}；bundleId=${IOS_BUNDLE_ID}`);
      const ok = await this.openLoginSheet();
      if (!ok) throw new Error('未处于未登录登录页，跳过入口检查（请退出登录后重跑）');
    });

    await this.check('手机号登录入口可见（P0）', async () => {
      const pass = await isEntryVisible(this, 'phone');
      return { expect: 'phone entry visible', real: pass ? 'visible' : 'missing', pass };
    });

    await this.act('扫描三方入口（按当前区配置，缺失不 fail）', async () => {
      const keys: EntryKey[] = ['facebook', 'google', 'apple', 'line', 'kakao'];
      const found: string[] = [];
      const missing: string[] = [];
      for (const k of keys) {
        if (await isEntryVisible(this, k)) found.push(k);
        else missing.push(k);
      }
      this.log(`三方可见: ${found.join(', ') || '(无)'}`);
      this.log(`三方未出现(可能被区配置隐藏): ${missing.join(', ') || '(无)'}`);
      if (found.length === 0) {
        throw new Error('未发现任何三方登录入口，请确认登录页已打开且语言/区配置正常');
      }
    });

    await this.check('至少一个三方入口可见', async () => {
      const keys: EntryKey[] = ['facebook', 'google', 'apple', 'line', 'kakao'];
      let n = 0;
      for (const k of keys) if (await isEntryVisible(this, k)) n++;
      return { expect: '>=1 oauth entry', real: String(n), pass: n >= 1 };
    });
  }
}

await new IosLoginEntriesSmoke().execute();
