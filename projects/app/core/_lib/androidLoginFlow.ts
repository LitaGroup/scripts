/**
 * Android Lite 登录共用：capabilities / 状态 / 手机号密码（+OTP）流程。
 * 对照工程：lita-lite-android（package com.litalite.android；debug/release 同包名，需按环境装对应包）
 *
 * 环境：SCRIPT_ENV=PROD（默认，release）/ TEST（debug）
 * 账号：PROD → accounts.prod|default（+86 查库 OTP）；TEST → accounts.test|default（+62，OTP 1234）
 * OTP：SCRIPT_OTP > accounts.smsCode > TEST 固定 1234 > PROD 查 stats.sms_record_*
 */
import type { AppBaseClass, AppAccount } from '../../../../src/base/AppBaseClass.ts';
import { by, sleep, type AppiumCapabilities, type Locator } from '../../../../src/resources/AppiumResource.ts';
import {
  ANDROID_ACT,
  ANDROID_GOOGLE_PICKER as GGL,
  ANDROID_LITE_PACKAGE,
  ANDROID_LOC as LOC,
  ANDROID_LOGIN_ENTRY,
} from './androidLocators.ts';
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

async function scrollUntilExists(app: AppBaseClass, locator: Locator, maxSwipes = 8): Promise<boolean> {
  for (let i = 0; i <= maxSwipes; i++) {
    if (await app['driver'].exists(locator)) return true;
    await app['driver'].swipeUp(0.5);
    await sleep(400);
  }
  return false;
}

/** 已登录则退出，并打开登录主页（三方入口可见） */
export async function ensureAndroidLoginHome(app: AppBaseClass): Promise<void> {
  await app['closePopups']();
  let gate = await enterAndroidMeGate(app);
  if (gate === 'logged-in') {
    app['log']('已登录，先退出以便 Google 登录');
    if (!(await scrollUntilExists(app, LOC.settingEntry))) {
      throw new Error('我的页未找到设置入口 setting_layout');
    }
    await app['driver'].click(LOC.settingEntry);
    await sleep(800);
    if (!(await scrollUntilExists(app, LOC.logout))) {
      throw new Error('设置页未找到退出登录 logout_tv');
    }
    await app['driver'].click(LOC.logout);
    await app['waitForActivity'](/\.MainActivity$/, 15_000);
    await sleep(800);
    await app['closePopups']();
    gate = await enterAndroidMeGate(app);
  }
  if (gate !== 'logged-out') {
    throw new Error(`未能打开登录页，状态=${gate}`);
  }
  // 若落在手机号/密码中间页则 back 到登录主页
  for (let i = 0; i < 3; i++) {
    if (await app['driver'].exists(LOC.passwordInput) || (await app['driver'].exists(LOC.phoneInput))) {
      await app['driver'].back();
      await sleep(600);
      continue;
    }
    break;
  }
}

export async function tapGoogleLoginEntry(app: AppBaseClass): Promise<void> {
  const driver = app['driver'];
  const e = ANDROID_LOGIN_ENTRY.google;
  if (await driver.exists(e.low)) {
    await driver.click(e.low);
    return;
  }
  if (await driver.exists(e.high)) {
    await driver.click(e.high);
    return;
  }
  if (await driver.exists(e.text)) {
    await driver.click(e.text);
    return;
  }
  // 低优入口可能在底部，轻滑一次再试
  await driver.swipeUp(0.35);
  await sleep(500);
  if (await driver.exists(e.low)) {
    await driver.click(e.low);
    return;
  }
  if (await driver.exists(e.high)) {
    await driver.click(e.high);
    return;
  }
  throw new Error('未找到 Google 登录入口（iv_low_google_login / rl_google_login）');
}

function resolveGoogleEmail(app: AppBaseClass, account?: AppAccount): string {
  const fromEnv = (process.env.SCRIPT_GOOGLE_EMAIL ?? '').trim();
  if (fromEnv) return fromEnv;
  const root = (app['scriptConfig'].google ?? {}) as { email?: string };
  if (root.email?.trim()) return root.email.trim();
  const accounts = (app['scriptConfig'].accounts ?? {}) as Record<string, AppAccount | undefined>;
  const fromAccounts = accounts.google;
  if (fromAccounts) {
    const email = String(fromAccounts.email ?? fromAccounts.username ?? '').trim();
    if (email.includes('@')) return email;
  }
  if (account) {
    const email = String(account.email ?? account.username ?? '').trim();
    if (email.includes('@')) return email;
  }
  return '';
}

async function googlePickerVisible(app: AppBaseClass): Promise<boolean> {
  const driver = app['driver'];
  if (await driver.exists(GGL.accountName)) return true;
  if (await driver.exists(GGL.accountDisplayName)) return true;
  if (await driver.exists(GGL.accountParticle)) return true;
  if (await driver.exists(GGL.emailLikeClickable)) return true;
  // 文案启发式：Choose an account / 选择账号
  if (await driver.exists(by.textContains('Choose an account'))) return true;
  if (await driver.exists(by.textContains('选择账号'))) return true;
  if (await driver.exists(by.textContains('选择一个帐号'))) return true;
  return false;
}

async function tapContinueIfPresent(app: AppBaseClass): Promise<boolean> {
  for (const loc of GGL.continueButtons) {
    if (await app['driver'].exists(loc)) {
      app['log'](`点 Google 确认按钮: ${loc[0]}=${loc[1]}`);
      await app['driver'].click(loc);
      await sleep(1_000);
      return true;
    }
  }
  return false;
}

/**
 * 在 Google 账号页点选已登录账号（不跳转三方 App）。
 * @param preferredEmail 优先匹配该邮箱；空则点第一个可见账号
 */
export async function confirmGoogleAccountOnPicker(
  app: AppBaseClass,
  preferredEmail = '',
  timeoutMs = 25_000,
): Promise<void> {
  const driver = app['driver'];
  const deadline = Date.now() + timeoutMs;
  let tappedAccount = false;

  while (Date.now() < deadline) {
    await app['refreshActivity']();
    // 已回到 App 主页：可能自动用上次账号完成
    if (/\.MainActivity$/i.test(app['activity'] ?? '')) {
      if ((await driver.exists(LOC.tabMe)) || (await driver.exists(LOC.mePage))) {
        app['log']('已回到 MainActivity，视为 Google 授权完成');
        return;
      }
    }

    // 仅剩 Continue / 同意（账号已选）
    if (await tapContinueIfPresent(app)) {
      tappedAccount = true;
      await sleep(800);
      continue;
    }

    if (!tappedAccount) {
      if (preferredEmail) {
        const byEmail = by.textContains(preferredEmail);
        if (await driver.exists(byEmail)) {
          app['log'](`点选 Google 账号: ${preferredEmail}`);
          // 优先点可点击祖先
          const clickable = by.xpath(
            `//*[contains(@text,${JSON.stringify(preferredEmail)})]/ancestor-or-self::*[@clickable='true'][1]`,
          );
          if (await driver.exists(clickable)) await driver.click(clickable);
          else await driver.click(byEmail);
          tappedAccount = true;
          await sleep(1_200);
          continue;
        }
      }

      const candidates: Locator[] = [
        GGL.accountName,
        GGL.accountDisplayName,
        GGL.accountRow,
        GGL.emailLikeClickable,
        GGL.accountParticle,
      ];
      for (const loc of candidates) {
        if (await driver.exists(loc)) {
          app['log'](`点选 Google 列表账号: ${loc[0]}=${loc[1]}`);
          await driver.click(loc);
          tappedAccount = true;
          await sleep(1_200);
          break;
        }
      }
      if (tappedAccount) continue;
    }

    if (!(await googlePickerVisible(app)) && tappedAccount) {
      await sleep(800);
    } else {
      await sleep(500);
    }
  }

  await app['refreshActivity']();
  if (/\.MainActivity$/i.test(app['activity'] ?? '')) return;

  if (!tappedAccount && !(await driver.exists(LOC.tabMe))) {
    throw new Error(
      preferredEmail
        ? `Google 账号页未出现或未找到邮箱 ${preferredEmail}（请确认设备已登录该 Google 账号）`
        : 'Google 账号页未出现可点账号（请确认设备已登录 Google，且弹窗未被遮挡）',
    );
  }
}

/**
 * Google 三方登录：登录主页 → 点 Google → 账号页点已登账号 → 回「我的」。
 * 前置：设备系统已登录 Google；不会跳转独立 Google App。
 */
export async function loginWithGoogle(app: AppBaseClass, account?: AppAccount): Promise<void> {
  const email = resolveGoogleEmail(app, account);
  if (email) app['log'](`Google 优先账号: ${email}`);
  else app['log']('未配置 SCRIPT_GOOGLE_EMAIL / google.email，将点选列表第一个账号');

  await ensureAndroidLoginHome(app);
  await tapGoogleLoginEntry(app);
  await sleep(1_000);

  // 等账号选择页或直接回主页
  const waitPickerDeadline = Date.now() + 20_000;
  while (Date.now() < waitPickerDeadline) {
    if (await googlePickerVisible(app)) break;
    if (/\.MainActivity$/i.test(app['activity'] ?? '') && (await app['driver'].exists(LOC.tabMe))) {
      app['log']('点 Google 后已直接进入主页（可能已有授权缓存）');
      await finishOnMeTab(app);
      return;
    }
    await tapContinueIfPresent(app);
    await sleep(500);
  }

  await confirmGoogleAccountOnPicker(app, email);
  await app['closePopups']();
  await finishOnMeTab(app);
}

