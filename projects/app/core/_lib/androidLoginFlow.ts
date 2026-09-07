/**
 * Android Lite 登录共用：capabilities / 状态 / 手机号密码（+OTP）流程。
 * 对照工程：lita-lite-android（package com.litalite.android）
 */
import type { AppBaseClass, AppAccount } from '../../../../src/base/AppBaseClass.ts';
import { by, sleep, type AppiumCapabilities } from '../../../../src/resources/AppiumResource.ts';
import { ANDROID_ACT, ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC } from './androidLocators.ts';

export function androidLiteCapabilities(): AppiumCapabilities {
  const caps: AppiumCapabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:appPackage': ANDROID_LITE_PACKAGE,
    'appium:appActivity': ANDROID_ACT.splash,
    'appium:noReset': true,
    'appium:newCommandTimeout': 300,
  };
  const udid = process.env.SCRIPT_ANDROID_UDID;
  if (udid) caps['appium:udid'] = udid;
  const deviceName = process.env.SCRIPT_ANDROID_DEVICE;
  if (deviceName) caps['appium:deviceName'] = deviceName;
  return caps;
}

export function registerAndroidLoginStates(app: AppBaseClass): void {
  app['addState']({
    name: 'popup-activity',
    kind: 'popup',
    detect: () => app['driver'].exists(LOC.popupActivity),
    handle: async () => {
      await app['driver'].click(LOC.popupActivityClose);
      await sleep(400);
    },
  });
  app['addState']({
    name: 'popup-whatsapp',
    kind: 'popup',
    detect: async () =>
      (await app['driver'].exists(LOC.noWhatsApp)) || (await app['driver'].exists(LOC.whatsAppClose)),
    handle: async () => {
      // 冒烟优先走短信：点「没有 WhatsApp」
      if (await app['driver'].exists(LOC.noWhatsApp)) {
        await app['driver'].click(LOC.noWhatsApp);
      } else {
        await app['driver'].click(LOC.whatsAppClose);
      }
      await sleep(500);
    },
  });
  app['addState']({
    name: 'logged-out',
    activity: ANDROID_ACT.login,
    detect: async () => true,
  });
  app['addState']({
    name: 'logged-in',
    activity: ANDROID_ACT.main,
    detect: async () =>
      (await app['driver'].exists(LOC.mePage)) || (await app['driver'].exists(LOC.meUid)),
  });
  app['addState']({
    name: 'home',
    activity: ANDROID_ACT.main,
    detect: async () => true,
  });
}

/** 点「我的」直到落到登录页或已登录的我的页 */
export async function enterAndroidMeGate(
  app: AppBaseClass,
  timeoutMs = 30_000,
): Promise<'logged-in' | 'logged-out'> {
  const deadline = Date.now() + timeoutMs;
  let last = 'unknown';
  while (Date.now() < deadline) {
    await app['closePopups']();
    last = await app['currentState']();
    if (last === 'logged-in' || last === 'logged-out') return last;

    if (await app['driver'].exists(LOC.passwordInput) || (await app['driver'].exists(LOC.phoneInput))) {
      return 'logged-out';
    }
    if (await app['driver'].exists(LOC.tabMe)) {
      await app['driver'].click(LOC.tabMe);
    }
    await sleep(1_000);
  }
  throw new Error(`进入「我的」超时，当前状态: ${last}`);
}

export async function enterAndroidOtp(app: AppBaseClass): Promise<void> {
  const otp = (process.env.SCRIPT_OTP ?? '1234').trim();
  app['log'](`使用验证码 ${otp}（可用 SCRIPT_OTP 覆盖）`);
  await app['assertExists'](LOC.otpInput, 'OTP 输入框 input_captcha_et');
  await app['driver'].input(LOC.otpInput, otp);
  await sleep(3_000);
}

async function tapPhoneLoginEntry(app: AppBaseClass): Promise<void> {
  const driver = app['driver'];
  if (await driver.exists(LOC.phoneLoginLow)) {
    await driver.click(LOC.phoneLoginLow);
    return;
  }
  if (await driver.exists(LOC.phoneLoginHigh)) {
    await driver.click(LOC.phoneLoginHigh);
    return;
  }
  const text = by.textContains('Sign in with Phone');
  if (await driver.exists(text)) {
    await driver.click(text);
    return;
  }
  throw new Error('未找到手机号登录入口（iv_low_phone_login / rl_phone_login）');
}

async function selectCountryCode(app: AppBaseClass, countryCode: string): Promise<void> {
  const code = countryCode.replace(/^\+/, '').trim();
  if (!code) return;
  const driver = app['driver'];
  await app['assertExists'](LOC.countryCode, '区号选择器');
  const current = (await driver.textOf(LOC.countryCode)).replace(/\D/g, '');
  if (current === code) {
    app['log'](`当前区号已是 +${code}，跳过选择`);
    return;
  }
  await driver.click(LOC.countryCode);
  await sleep(600);
  // 列表展示为 (+62)
  const target = by.textContains(`(+${code})`);
  for (let i = 0; i < 16 && !(await driver.exists(target)); i++) {
    if (await driver.exists(LOC.countryList)) {
      await driver.swipeInElement(LOC.countryList, 'up');
    } else {
      await driver.swipeUp(0.55);
    }
    await sleep(350);
  }
  if (!(await driver.exists(target))) {
    throw new Error(`国家列表未找到 (+${code})`);
  }
  await driver.click(target);
  await sleep(400);
}

/**
 * 手机号 + 密码登录（含 WhatsApp 弹窗、OTP）。
 * 结束时尽量停在 MainActivity「我的」页，便于 logged-in 判定。
 */
export async function loginWithPhonePassword(app: AppBaseClass, account: AppAccount): Promise<void> {
  const driver = app['driver'];
  await app['closePopups']();

  if (await driver.exists(LOC.otpInput)) {
    await enterAndroidOtp(app);
    await finishOnMeTab(app);
    return;
  }

  if (await driver.exists(LOC.passwordInput)) {
    await driver.input(LOC.passwordInput, account.password);
    await driver.hideKeyboard();
    await app['assertExists'](LOC.passwordSubmit, 'Login');
    await driver.click(LOC.passwordSubmit);
    await sleep(2_000);
    await app['closePopups']();
    if (await driver.exists(LOC.otpInput)) await enterAndroidOtp(app);
    await finishOnMeTab(app);
    return;
  }

  // 不在登录流程页：先通过「我的」拉起登录
  if (!(await driver.exists(LOC.phoneInput))) {
    const gate = await enterAndroidMeGate(app);
    if (gate === 'logged-in') {
      app['log']('已登录，跳过登录流程');
      return;
    }
    if (!(await driver.exists(LOC.phoneInput))) {
      await tapPhoneLoginEntry(app);
    }
  }

  await app['waitForElement'](LOC.phoneInput, '手机号输入框', 10_000);

  const countryCode = String(account.countryCode ?? '').trim();
  if (countryCode) await selectCountryCode(app, countryCode);

  await driver.input(LOC.phoneInput, account.username);
  await driver.hideKeyboard();
  await app['assertExists'](LOC.phoneNext, 'Next');
  await driver.click(LOC.phoneNext);
  await sleep(800);
  await app['closePopups']();

  const pwdOk = await driver.waitFor(LOC.passwordInput, 10_000);
  if (!pwdOk) {
    if (await driver.exists(LOC.otpInput)) {
      await enterAndroidOtp(app);
      await finishOnMeTab(app);
      return;
    }
    throw new Error('密码页与 OTP 页均未出现（检查 hspw / 发码）');
  }

  await driver.input(LOC.passwordInput, account.password);
  await driver.hideKeyboard();
  await app['assertExists'](LOC.passwordSubmit, 'Login');
  await driver.click(LOC.passwordSubmit);
  await sleep(2_000);
  await app['closePopups']();
  if (await driver.exists(LOC.otpInput)) await enterAndroidOtp(app);
  await finishOnMeTab(app);
}

async function finishOnMeTab(app: AppBaseClass): Promise<void> {
  await app['waitForActivity'](/\.MainActivity$/, 20_000);
  await sleep(800);
  await app['closePopups']();
  const gate = await enterAndroidMeGate(app, 20_000);
  if (gate !== 'logged-in') {
    throw new Error(`登录后未进入已登录「我的」页，状态=${gate}`);
  }
}

/** 确保已登录：未登录则走手机号密码；已登录则停留在我的页 */
export async function ensureAndroidLoggedIn(app: AppBaseClass, account: AppAccount): Promise<void> {
  await app['closePopups']();
  const gate = await enterAndroidMeGate(app);
  if (gate === 'logged-in') {
    app['log']('当前已登录');
    return;
  }
  app['log'](`当前未登录，使用账号 ${account.username} 执行登录`);
  await loginWithPhonePassword(app, account);
}
