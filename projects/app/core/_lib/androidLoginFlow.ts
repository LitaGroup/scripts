/**
 * Android Lite 登录共用：capabilities / 状态 / 手机号密码（+OTP）流程。
 * 对照工程：lita-lite-android（package com.litalite.android）
 *
 * OTP：默认从 stats 库 sms_record_* 查真实验证码（需 config userToken）；
 * 可用 SCRIPT_OTP / accounts.smsCode 覆盖。
 */
import type { AppBaseClass, AppAccount } from '../../../../src/base/AppBaseClass.ts';
import { by, sleep, type AppiumCapabilities } from '../../../../src/resources/AppiumResource.ts';
import { ANDROID_ACT, ANDROID_LITE_PACKAGE, ANDROID_LOC as LOC } from './androidLocators.ts';
import { alignLiteConfigPath, resolveAndroidOtp } from './androidSmsOtp.ts';

alignLiteConfigPath();

export function androidLiteCapabilities(): AppiumCapabilities {
  const caps: AppiumCapabilities = {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:appPackage': ANDROID_LITE_PACKAGE,
    'appium:appActivity': ANDROID_ACT.splash,
    'appium:noReset': true,
    'appium:autoGrantPermissions': true,
    'appium:newCommandTimeout': 300,
  };
  const udid = process.env.SCRIPT_ANDROID_UDID;
  if (udid) caps['appium:udid'] = udid;
  const deviceName = process.env.SCRIPT_ANDROID_DEVICE;
  if (deviceName) caps['appium:deviceName'] = deviceName;
  return caps;
}

export function registerAndroidLoginStates(app: AppBaseClass): void {
  // 系统权限弹窗需最先处理（Release 首启常挡主界面）
  app['addState']({
    name: 'popup-permission',
    kind: 'popup',
    detect: async () => {
      for (const loc of LOC.permissionAllowIds) {
        if (await app['driver'].exists(loc)) return true;
      }
      return false;
    },
    handle: async () => {
      for (const loc of LOC.permissionAllowIds) {
        if (await app['driver'].exists(loc)) {
          await app['driver'].click(loc);
          await sleep(400);
          return;
        }
      }
    },
  });
  app['addState']({
    name: 'popup-onboarding',
    kind: 'popup',
    detect: () => app['driver'].exists(LOC.onboardingSkip),
    handle: async () => {
      await app['driver'].click(LOC.onboardingSkip);
      await sleep(600);
    },
  });
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
      (await app['driver'].exists(LOC.mePage)) ||
      (await app['driver'].exists(LOC.meUid)) ||
      // 登录成功先进首页；me 页需再点「我的」才出现
      (await app['driver'].exists(by.id(`${ANDROID_LITE_PACKAGE}:id/homeRootLayout`))),
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

export type AndroidOtpContext = {
  phone?: string;
  countryCode?: string;
  since?: Date;
  smsCode?: string;
};

export async function enterAndroidOtp(app: AppBaseClass, ctx: AndroidOtpContext = {}): Promise<void> {
  const otp = await resolveAndroidOtp({
    phone: ctx.phone,
    countryCode: ctx.countryCode,
    since: ctx.since,
    smsCode: ctx.smsCode,
    log: (m) => app['log'](m),
  });
  const driver = app['driver'];

  const leftOtpPage = async (): Promise<boolean> => {
    if (await driver.exists(LOC.otpInput)) return false;
    // 验证码提交后常直接进主页
    if (/\.MainActivity$/i.test(app['activity'] ?? '')) return true;
    if (await driver.exists(LOC.tabMe) || (await driver.exists(LOC.mePage))) return true;
    return false;
  };

  if (await leftOtpPage()) {
    app['log']('已不在 OTP 页，跳过填码');
    return;
  }
  await app['assertExists'](LOC.otpInput, 'OTP 输入框 input_captcha_et');

  try {
    await driver.execute('mobile: shell', [{ command: 'ime', args: ['set', 'io.appium.settings/.AppiumIME'] }]);
  } catch {
    /* ignore */
  }

  const digitCount = async (): Promise<number> => {
    let n = 0;
    for (let i = 1; i <= 4; i++) {
      const loc = by.id(`${ANDROID_LITE_PACKAGE}:id/input_captcha_tv${i}`);
      try {
        if (!(await driver.exists(loc))) continue;
        const t = (await driver.textOf(loc)).trim();
        if (t) n += 1;
      } catch {
        /* 页面已跳走 */
      }
    }
    return n;
  };

  const clearOtp = async (): Promise<void> => {
    if (!(await driver.exists(LOC.otpInput))) return;
    await driver.click(LOC.otpInput);
    await sleep(200);
    for (let i = 0; i < 8; i++) {
      try {
        await driver.execute('mobile: pressKey', [{ keycode: 67 }]); // DEL
      } catch {
        try {
          await driver.execute('mobile: shell', [{ command: 'input', args: ['keyevent', '67'] }]);
        } catch {
          /* ignore */
        }
      }
    }
  };

  /** 最稳：KEYCODE_0=7 … KEYCODE_9=16 逐位注入 */
  const typeByKeycode = async (): Promise<void> => {
    if (!(await driver.exists(LOC.otpInput))) return;
    await driver.click(LOC.otpInput);
    await sleep(200);
    for (const ch of otp) {
      if (ch < '0' || ch > '9') continue;
      const keycode = 7 + (ch.charCodeAt(0) - '0'.charCodeAt(0));
      await driver.execute('mobile: pressKey', [{ keycode }]);
      await sleep(120);
    }
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await leftOtpPage()) {
      app['log']('OTP 提交后已离开验证码页');
      return;
    }
    try {
      await clearOtp();
      await typeByKeycode();
      let filled = await digitCount();
      if (filled < otp.length && (await driver.exists(LOC.otpInput))) {
        // 回退：AppiumIME mobile:type / sendKeys
        await clearOtp();
        await driver.click(LOC.otpInput);
        await sleep(200);
        try {
          await driver.execute('mobile: type', [{ text: otp }]);
        } catch {
          await driver.sendKeys(LOC.otpInput, otp);
        }
        await sleep(400);
        filled = await digitCount();
      }
      app['log'](`OTP 已填入 ${filled}/${otp.length} 位（第 ${attempt + 1} 次）`);
      if (filled >= otp.length || (await leftOtpPage())) {
        await sleep(2_500);
        return;
      }
    } catch (e) {
      if (await leftOtpPage()) {
        app['log'](`OTP 页已跳走（${e instanceof Error ? e.message : e}），视为填码完成`);
        return;
      }
      throw e;
    }
  }
  if (await leftOtpPage()) return;
  throw new Error(`OTP 未能完整填入（期望 ${otp.length} 位）`);
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

/** 区号行：精确匹配 (+62)，点可点击父节点（纯 TextView 往往不可点） */
function countryCodeRow(code: string) {
  const label = `(+${code})`;
  return by.xpath(`//*[@text=${JSON.stringify(label)}]/ancestor::*[@clickable='true'][1]`);
}

/** 常用区号：语言无关兜底 */
function countryNameFallbacks(code: string) {
  if (code === '62') {
    return [
      by.textContains('Indonesia'),
      by.textContains('印度尼西亚'),
      by.textContains('인도네시아'),
    ];
  }
  if (code === '86') {
    return [
      by.textContains('China'),
      by.textContains('中国'),
      by.textContains('中国大陆'),
      by.textContains('중국'),
    ];
  }
  return [];
}

function otpCtxFromAccount(account: AppAccount, since?: Date): AndroidOtpContext {
  return {
    phone: account.username,
    countryCode: String(account.countryCode ?? '86').replace(/^\+/, '').trim() || '86',
    since,
    smsCode: account.smsCode != null ? String(account.smsCode) : undefined,
  };
}


async function readSelectedCountryCode(app: AppBaseClass): Promise<string> {
  const raw = await app['driver'].textOf(LOC.countryCode);
  return raw.replace(/\D/g, '');
}

async function selectCountryCode(app: AppBaseClass, countryCode: string): Promise<void> {
  const code = countryCode.replace(/^\+/, '').trim();
  if (!code) return;
  const driver = app['driver'];
  await app['assertExists'](LOC.countryCode, '区号选择器');
  if ((await readSelectedCountryCode(app)) === code) {
    app['log'](`当前区号已是 +${code}，跳过选择`);
    return;
  }

  const trySelectOnce = async (): Promise<boolean> => {
    await driver.click(LOC.countryCode);
    await sleep(600);
    if (!(await driver.waitFor(LOC.countryList, 5_000))) {
      app['log']('国家列表未出现');
      return false;
    }

    const candidates = [countryCodeRow(code), ...countryNameFallbacks(code)];
    const findVisible = async () => {
      for (const loc of candidates) {
        if (await driver.exists(loc)) return loc;
      }
      return null;
    };

    let target = await findVisible();
    // 先向下再向上扫，避免只 swipe up 漏掉列表上方的热门区号
    const directions: Array<'up' | 'down'> = ['up', 'down', 'up', 'down'];
    for (let i = 0; i < 20 && !target; i++) {
      const dir = directions[i % directions.length]!;
      if (await driver.exists(LOC.countryList)) {
        await driver.swipeInElement(LOC.countryList, dir);
      } else {
        if (dir === 'up') await driver.swipeUp(0.55);
        else await driver.swipeDown(0.55);
      }
      await sleep(350);
      target = await findVisible();
    }
    if (!target) {
      app['log'](`国家列表未找到 (+${code})`);
      await driver.back();
      await sleep(400);
      return false;
    }
    await driver.click(target);
    await sleep(500);
    return (await readSelectedCountryCode(app)) === code;
  };

  let ok = await trySelectOnce();
  if (!ok) {
    app['log'](`选区号 +${code} 未确认，重试一次`);
    ok = await trySelectOnce();
  }
  if (!ok) throw new Error(`未能确认区号 +${code}（tv_country_code 仍为 +${await readSelectedCountryCode(app)}）`);
  app['log'](`已选择区号 +${code}`);
}

/**
 * 手机号 + 密码登录（含 WhatsApp 弹窗、OTP）。
 * 结束时尽量停在 MainActivity「我的」页，便于 logged-in 判定。
 */
export async function loginWithPhonePassword(app: AppBaseClass, account: AppAccount): Promise<void> {
  const driver = app['driver'];
  await app['closePopups']();
  let smsSince = new Date(Date.now() - 5 * 60_000);

  if (await driver.exists(LOC.otpInput)) {
    await enterAndroidOtp(app, otpCtxFromAccount(account, smsSince));
    await finishOnMeTab(app);
    return;
  }

  if (await driver.exists(LOC.passwordInput)) {
    await driver.input(LOC.passwordInput, account.password);
    await driver.hideKeyboard();
    await app['assertExists'](LOC.passwordSubmit, 'Login');
    smsSince = new Date();
    await driver.click(LOC.passwordSubmit);
    await sleep(2_000);
    await app['closePopups']();
    if (await driver.exists(LOC.otpInput)) {
      await enterAndroidOtp(app, otpCtxFromAccount(account, smsSince));
    }
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

  const countryCode = String(account.countryCode ?? '86').replace(/^\+/, '').trim() || '86';
  await selectCountryCode(app, countryCode);

  await driver.input(LOC.phoneInput, account.username);
  await driver.hideKeyboard();
  await app['assertExists'](LOC.phoneNext, 'Next');

  // Next 后可能先出 WhatsApp 引导；关闭后偶发仍停在手机号页，需再点一次
  const afterPhoneNext = async (): Promise<'password' | 'otp' | 'phone' | 'unknown'> => {
    await app['closePopups']();
    if (await driver.exists(LOC.passwordInput)) return 'password';
    if (await driver.exists(LOC.otpInput)) return 'otp';
    if (await driver.exists(LOC.phoneInput) && (await driver.exists(LOC.phoneNext))) return 'phone';
    return 'unknown';
  };

  smsSince = new Date();
  let stage: 'password' | 'otp' | 'phone' | 'unknown' = 'unknown';
  for (let attempt = 0; attempt < 3 && stage !== 'password' && stage !== 'otp'; attempt++) {
    await driver.click(LOC.phoneNext);
    await sleep(1_200);
    // 最多等 12s：密码 / OTP / WhatsApp 弹窗
    for (let i = 0; i < 24; i++) {
      stage = await afterPhoneNext();
      if (stage === 'password' || stage === 'otp') break;
      // WhatsApp 可能刚弹出：优先点「没有 WhatsApp」发短信，不依赖是否已 register 弹窗状态
      if (await driver.exists(LOC.noWhatsApp)) {
        await driver.click(LOC.noWhatsApp);
        await sleep(800);
        continue;
      }
      if (await driver.exists(LOC.whatsAppClose)) {
        await driver.click(LOC.whatsAppClose);
        await sleep(800);
        continue;
      }
      await app['closePopups']();
      await sleep(500);
    }
    if (stage === 'phone') app['log'](`点 Next 后仍在手机号页，重试 (${attempt + 1}/3)`);
  }

  if (stage === 'otp') {
    await enterAndroidOtp(app, otpCtxFromAccount(account, smsSince));
    await finishOnMeTab(app);
    return;
  }
  if (stage !== 'password') {
    throw new Error('密码页与 OTP 页均未出现（检查 hspw / 发码 / WhatsApp 弹窗）');
  }

  await driver.input(LOC.passwordInput, account.password);
  await driver.hideKeyboard();
  await app['assertExists'](LOC.passwordSubmit, 'Login');
  smsSince = new Date();
  await driver.click(LOC.passwordSubmit);
  await sleep(2_000);
  await app['closePopups']();
  if (await driver.exists(LOC.otpInput)) {
    await enterAndroidOtp(app, otpCtxFromAccount(account, smsSince));
  }
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
  // 尽量点到「我的」以便抓 user_no（首页也被视为 logged-in）
  if (!(await app['driver'].exists(LOC.mePage)) && (await app['driver'].exists(LOC.tabMe))) {
    await app['driver'].click(LOC.tabMe);
    await sleep(1_000);
    await app['closePopups']();
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
