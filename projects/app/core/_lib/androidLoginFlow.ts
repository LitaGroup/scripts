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
  ANDROID_FACEBOOK_PICKER as FB,
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
    // API 35 上 Google/GMS 账号页 XPath 易触发 mSealed；强制 XPath1
    'appium:settings[enforceXPath1]': true,
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
  // 首启地区/语言选择：先点一项再 Confirm，否则会卡在 LocationConfigActivity
  app['addState']({
    name: 'popup-location-config',
    kind: 'popup',
    activity: ANDROID_ACT.locationConfig,
    detect: async () =>
      (await app['driver'].exists(LOC.locationConfigConfirm)) ||
      (await app['driver'].exists(LOC.locationConfigList)),
    handle: async () => {
      const options = await app['driver'].findElements(LOC.locationConfigOption);
      if (options.length > 0) {
        await app['driver'].click(LOC.locationConfigOption);
        await sleep(400);
      } else if (await app['driver'].exists(LOC.locationConfigList)) {
        // 兜底：点列表第一项可点击子节点
        await app['driver'].click(
          by.xpath(
            `(//*[@resource-id='${ANDROID_LITE_PACKAGE}:id/rl_question_list']//*[@clickable='true' or @resource-id='${ANDROID_LITE_PACKAGE}:id/tv_title_view'])[1]`,
          ),
        );
        await sleep(400);
      }
      if (await app['driver'].exists(LOC.locationConfigConfirm)) {
        await app['driver'].click(LOC.locationConfigConfirm);
        await sleep(1_500);
      }
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
    // 仅「我的」页标记；首页 homeRootLayout 访客/已登录都有，不能当 logged-in
    detect: async () =>
      (await app['driver'].exists(LOC.mePage)) || (await app['driver'].exists(LOC.meUid)),
  });
  app['addState']({
    name: 'home',
    activity: ANDROID_ACT.main,
    detect: async () => true,
  });
}

/**
 * 从手机号/密码等登录中间页退回登录主页（入口按钮可见）。
 * 优先点 iv_back；失败再 driver.back()。遗留中间页会卡在 MainActivity+enter_phone_number。
 */
export async function escapeAndroidLoginSubpages(app: AppBaseClass, maxSteps = 5): Promise<void> {
  const driver = app['driver'];
  for (let i = 0; i < maxSteps; i++) {
    const onPhone = await driver.exists(LOC.phoneInput);
    const onPassword = await driver.exists(LOC.passwordInput);
    const onOtp = await driver.exists(LOC.otpInput);
    if (!onPhone && !onPassword && !onOtp) return;
    app['log'](`检测到登录中间页（phone=${onPhone} password=${onPassword} otp=${onOtp}），返回上一层`);
    if (await driver.exists(LOC.loginBack)) {
      await driver.click(LOC.loginBack);
    } else {
      await driver.back();
    }
    await sleep(700);
  }
}

/**
 * 退出 Chrome / Facebook Custom Tab、GMS 等外部授权页，回到 Lite。
 *  residual Custom Tab 会导致「我的」门控超时（Activity 不在 App 内）。
 */
export async function dismissForeignAuthUi(app: AppBaseClass, maxBacks = 8): Promise<void> {
  for (let i = 0; i < maxBacks; i++) {
    await app['refreshActivity']();
    const act = app['activity'] ?? '';
    const foreign =
      /chrome|chromium|CustomTab|facebook\.|accounts\.google|gms\.|PermissionController|ErrorActivity/i.test(
        act,
      ) ||
      (/CustomTabMainActivity|CustomTabActivity|chrome\.Main/i.test(act) &&
        !/litalite\.android/i.test(act));
    const inLite =
      /litalite\.android/i.test(act) ||
      /\.MainActivity$/i.test(act) ||
      /\.LoginActivity$/i.test(act) ||
      /\.SplashActivity$/i.test(act) ||
      /\.LocationConfigActivity$/i.test(act) ||
      /\.Onboarding/i.test(act);
    if (!foreign && inLite) break;
    if (!foreign && !act) break;
    if (!foreign) {
      // 未知非 Lite：尝试拉回前台
      break;
    }
    app['log'](`检测到外部授权/浏览器页 Activity=${act}，按返回退出`);
    await app['driver'].back();
    await sleep(700);
  }
  try {
    await app['activateApp']();
  } catch {
    /* ignore */
  }
  await sleep(500);
  await app['refreshActivity']();
}

/** 点「我的」直到落到登录页或已登录的我的页（退出后常停在访客首页，需再点一次「我的」） */
export async function enterAndroidMeGate(
  app: AppBaseClass,
  timeoutMs = 30_000,
): Promise<'logged-in' | 'logged-out'> {
  const deadline = Date.now() + timeoutMs;
  let last = 'unknown';
  let lastTapAt = 0;

  await dismissForeignAuthUi(app);

  // 已在聊天页（上次用例残留）→ 能聊就说明已登录，勿硬闯「我的」
  await app['refreshActivity']();
  if (/\.ui\.chat\.ChatActivity$/i.test(app['activity'] ?? '')) {
    const chatInput = by.id(`${ANDROID_LITE_PACKAGE}:id/input_message`);
    if (await softExists(app, chatInput)) {
      app['log']('当前已在 ChatActivity（输入框可见）→ 视为已登录，跳过进「我的」');
      return 'logged-in';
    }
  }

  const onLoginHome = async (): Promise<boolean> => {
    if (await softExists(app, LOC.loginClose)) return true;
    if (await softExists(app, ANDROID_LOGIN_ENTRY.facebook.high)) return true;
    if (await softExists(app, ANDROID_LOGIN_ENTRY.google.high)) return true;
    if (await softExists(app, ANDROID_LOGIN_ENTRY.facebook.low)) return true;
    if (await softExists(app, ANDROID_LOGIN_ENTRY.google.low)) return true;
    if (await softExists(app, ANDROID_LOGIN_ENTRY.phone.high)) return true;
    if (await softExists(app, ANDROID_LOGIN_ENTRY.phone.low)) return true;
    return false;
  };

  const onLoginPage = async (): Promise<boolean> => {
    await app['refreshActivity']();
    if (/\.LoginActivity$/i.test(app['activity'] ?? '')) return true;
    if (await onLoginHome()) return true;
    // 中间页也算已进入登录链路，调用方（ensureAndroidLoginHome）会再退回主页
    if (await softExists(app, LOC.passwordInput)) return true;
    if (await softExists(app, LOC.phoneInput)) return true;
    if (await softExists(app, LOC.otpInput)) return true;
    return false;
  };

  const onLoggedInMe = async (): Promise<boolean> =>
    (await softExists(app, LOC.mePage)) || (await softExists(app, LOC.meUid));

  while (Date.now() < deadline) {
    await app['closePopups']();
    if (await onLoginPage()) return 'logged-out';
    if (await onLoggedInMe()) return 'logged-in';

    last = await app['currentState']();
    if (last === 'logged-in' || last === 'logged-out') return last;

    await app['refreshActivity']();
    const onMain = /\.MainActivity$/i.test(app['activity'] ?? '');
    // 退出后停在首页时 tabMe exists 常因动画偏慢 —— MainActivity 上直接坐标点，勿空转等待
    const canTapMe = onMain || last === 'home' || (await softExists(app, LOC.tabMe));
    if (canTapMe && Date.now() - lastTapAt >= 700) {
      app['log'](
        onMain
          ? '当前在首页 MainActivity（勿停留）→ 立即点「我的」'
          : '当前在首页类页面（勿停留）→ 点击底部「我的」',
      );
      await tapAndroidMeTab(app);
      lastTapAt = Date.now();
      const settleUntil = Date.now() + 6_000;
      while (Date.now() < settleUntil) {
        await sleep(300);
        await app['closePopups']();
        await app['refreshActivity']();
        if (/\.LoginActivity$/i.test(app['activity'] ?? '')) return 'logged-out';
        if (await onLoginPage()) return 'logged-out';
        if (await onLoggedInMe()) return 'logged-in';
      }
      continue;
    }
    await sleep(300);
  }
  throw new Error(`进入「我的」超时，当前状态: ${last}，Activity: ${app['activity'] || '(未知)'}`);
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
    // 等国家列表浮层真正关闭再返回：浮层打开时手机号输入框(enter_phone_number)不在可访问层级，
    // 而 tv_country_code 在浮层打开时仍可读（readSelectedCountryCode 会误判已切换）。慢设备上
    // 紧接着的 input(phoneInput) 会报 "An element could not be located"。
    for (let i = 0; i < 25 && (await driver.exists(LOC.countryList)); i++) {
      await sleep(200);
    }
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
 * 统一门控：先 ensureAndroidLoginHome（未登录页→我的→必要时退出），再走手机号流程；
 * 结束停在已登录「我的」页。
 */
export async function loginWithPhonePassword(app: AppBaseClass, account: AppAccount): Promise<void> {
  const driver = app['driver'];
  await ensureAndroidLoginHome(app);
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

  // 登录主页：点手机号入口进入输入页
  if (!(await driver.exists(LOC.phoneInput))) {
    await tapPhoneLoginEntry(app);
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

async function softExists(app: AppBaseClass, locator: Locator): Promise<boolean> {
  try {
    return await app['driver'].exists(locator);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    // API 35 / Custom Tab：mSealed、AccessibilityNodeInfo 等，不当存在也不中断
    if (/mSealed|AccessibilityNodeInfo|UiAutomator2Exception|enforceXPath1|xpath|stale/i.test(msg)) {
      app['log'](`定位忽略异常: ${msg.slice(0, 160)}`);
      return false;
    }
    throw e;
  }
}

async function softClick(app: AppBaseClass, locator: Locator): Promise<boolean> {
  try {
    if (!(await softExists(app, locator))) return false;
    await app['driver'].click(locator);
    return true;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    if (
      /mSealed|AccessibilityNodeInfo|UiAutomator2Exception|enforceXPath1|xpath|stale|not found|could not be located/i.test(
        msg,
      )
    ) {
      app['log'](`点击忽略异常: ${msg.slice(0, 160)}`);
      return false;
    }
    throw e;
  }
}

/** 是否已在已登录「我的」页（登录成功的唯一判定） */
export async function isAndroidLoggedInMe(app: AppBaseClass): Promise<boolean> {
  return (
    (await softExists(app, LOC.mePage)) || (await softExists(app, LOC.meUid))
  );
}

/**
 * 断言已登录「我的」页 —— 到达此处即视为登录成功。
 * 若停在首页会先点底部「我的」。
 */
export async function assertAndroidLoggedInMe(app: AppBaseClass, timeoutMs = 20_000): Promise<void> {
  await app['closePopups']();
  if (await softExists(app, LOC.tabMe) && !(await isAndroidLoggedInMe(app))) {
    await app['driver'].click(LOC.tabMe);
    await sleep(1_000);
    await app['closePopups']();
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isAndroidLoggedInMe(app)) {
      app['log']('已到达「我的」页 → 登录成功');
      return;
    }
    if (await softExists(app, LOC.tabMe)) {
      await app['driver'].click(LOC.tabMe);
      await sleep(800);
      await app['closePopups']();
    }
    await sleep(400);
  }
  throw new Error('登录后未进入「我的」页（无 mePage / user_no）');
}

async function finishOnMeTab(app: AppBaseClass): Promise<void> {
  await app['waitForActivity'](/\.MainActivity$/, 20_000);
  await sleep(800);
  await assertAndroidLoggedInMe(app, 20_000);
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

/** 登录主页入口是否可见（手机号 / Google / Facebook 任一） */
async function androidLoginEntriesVisible(app: AppBaseClass): Promise<boolean> {
  return (
    (await softExists(app, ANDROID_LOGIN_ENTRY.facebook.high)) ||
    (await softExists(app, ANDROID_LOGIN_ENTRY.facebook.low)) ||
    (await softExists(app, ANDROID_LOGIN_ENTRY.google.high)) ||
    (await softExists(app, ANDROID_LOGIN_ENTRY.google.low)) ||
    (await softExists(app, ANDROID_LOGIN_ENTRY.phone.high)) ||
    (await softExists(app, ANDROID_LOGIN_ENTRY.phone.low)) ||
    (await softExists(app, LOC.loginClose))
  );
}

/** 是否已在未登录的登录页（含 LoginActivity / 入口页；不含已登录「我的」） */
async function isAndroidUnauthenticatedLoginScreen(app: AppBaseClass): Promise<boolean> {
  await app['refreshActivity']();
  if (/\.LoginActivity$/i.test(app['activity'] ?? '')) return true;
  if (await androidLoginEntriesVisible(app)) return true;
  return false;
}

async function waitAndroidLoginEntries(app: AppBaseClass, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await androidLoginEntriesVisible(app)) return;
    await sleep(400);
  }
  // 不硬失败：部分机型入口挂载慢，后续 tap 会再断言
  app['log']('登录入口尚未全部可见，继续后续点击');
}

/** dumpsys 焦点 Activity，纠偏 Facebook Custom Tab 后 Appium getCurrentActivity 过期 */
async function dumpsysFocusedActivity(app: AppBaseClass): Promise<string> {
  try {
    const out = await app['driver'].execute('mobile: shell', [
      {
        command: 'dumpsys',
        args: ['window'],
        timeout: 6_000,
      },
    ]);
    const text = typeof out === 'string' ? out : String(out ?? '');
    const line =
      text.split('\n').find((l) => /mCurrentFocus=/.test(l)) ||
      text.split('\n').find((l) => /mFocusedApp=/.test(l)) ||
      '';
    const m = line.match(/\/([A-Za-z0-9_.]+)/);
    return m?.[1] ?? '';
  } catch {
    return '';
  }
}

async function clickAndroidLogoutIfVisible(app: AppBaseClass): Promise<boolean> {
  if (await softExists(app, LOC.logoutLayout)) {
    await app['driver'].click(LOC.logoutLayout);
    return true;
  }
  if (await softExists(app, LOC.logout)) {
    await app['driver'].click(LOC.logout);
    return true;
  }
  return false;
}

/**
 * 点完退出后：进登录页即返回。
 * Facebook 退出常停在 Settings 转圈，且 getCurrentActivity 可能仍报 Settings 而画面已是首页。
 */
async function afterLogoutOpenAndroidLoginPage(
  app: AppBaseClass,
  opts: { restartIfStuck?: boolean } = {},
): Promise<void> {
  const deadline = Date.now() + 40_000;
  let lastAct = '';
  let lastLogAt = 0;
  let lastTapAt = 0;
  let lastLogoutRetry = Date.now();
  let lastDumpsysAt = 0;
  let dumpsysAct = '';

  const isLoginAct = (act: string): boolean =>
    /(?:^|[./])LoginActivity$/i.test(act);
  const isHomeAct = (act: string): boolean =>
    /(?:^|[./])MainActivity$/i.test(act) && !/CustomTabMainActivity/i.test(act);

  const onLogin = async (act: string): Promise<boolean> =>
    isLoginAct(act) || (await isAndroidUnauthenticatedLoginScreen(app));

  const looksLikeHome = async (act: string): Promise<boolean> => {
    if (isHomeAct(act)) return true;
    if (await softExists(app, LOC.tabMe)) return true;
    if (await softExists(app, LOC.tabHome)) return true;
    return false;
  };

  while (Date.now() < deadline) {
    lastAct = await app['refreshActivity']();
    if (/\.SettingsActivity$/i.test(lastAct) && Date.now() - lastDumpsysAt > 1_500) {
      dumpsysAct = await dumpsysFocusedActivity(app);
      lastDumpsysAt = Date.now();
      if (dumpsysAct) app['log'](`dumpsys 焦点: ${dumpsysAct}（Appium=${lastAct}）`);
    }
    // Appium 报 Settings 时以 dumpsys 为准；dumpsys 已是首页/登录则覆盖过期的 Settings
    let act = lastAct;
    if (isHomeAct(dumpsysAct) || isLoginAct(dumpsysAct)) act = dumpsysAct;
    else if (/\.SettingsActivity$/i.test(lastAct) && dumpsysAct) act = dumpsysAct;

    if (await onLogin(act)) {
      app['log']('已进入登录页，可继续下一登录方式');
      await escapeAndroidLoginSubpages(app);
      await waitAndroidLoginEntries(app);
      return;
    }

    if (await looksLikeHome(act)) {
      if (Date.now() - lastTapAt >= 700) {
        app['log'](`已回首页（Appium=${lastAct || '(空)'} dumpsys=${dumpsysAct || '-'}）→ 立即点「我的」`);
        await tapAndroidMeTab(app);
        lastTapAt = Date.now();
        await sleep(400);
        await app['closePopups']();
      } else {
        await sleep(200);
      }
      continue;
    }

    if (/\.SettingsActivity$/i.test(lastAct) || /SettingsActivity/i.test(dumpsysAct)) {
      // Facebook LoginManager.logOut 可能卡住进度圈：隔几秒再点一次退出
      if (Date.now() - lastLogoutRetry > 3_000) {
        app['log']('仍在设置页 → 再点一次退出登录');
        await app['closePopups']();
        if (await clickAndroidLogoutIfVisible(app)) {
          lastLogoutRetry = Date.now();
        } else if (Date.now() - lastTapAt >= 700) {
          // UiAutomator 可能已失效：坐标点底栏「我的」，万一其实已在首页
          app['log']('设置页看不到退出按钮 → 坐标点「我的」试探是否已在首页');
          await tapAndroidMeTab(app);
          lastTapAt = Date.now();
        }
      }
    }

    if (Date.now() - lastLogAt > 2_000) {
      app['log'](`等待退出完成… Activity=${lastAct || '(空)'} dumpsys=${dumpsysAct || '-'}`);
      lastLogAt = Date.now();
    }
    await sleep(250);
  }

  app['log'](
    `退出等待结束（Appium=${lastAct || '(空)'} dumpsys=${dumpsysAct || '-'}）→ 强制点「我的」进登录`,
  );
  if (await isAndroidUnauthenticatedLoginScreen(app)) {
    await escapeAndroidLoginSubpages(app);
    await waitAndroidLoginEntries(app);
    return;
  }
  try {
    const gate = await enterAndroidMeGate(app, 15_000);
    if (gate === 'logged-out') {
      await escapeAndroidLoginSubpages(app);
      await waitAndroidLoginEntries(app);
      return;
    }
  } catch (e) {
    app['log'](`enterAndroidMeGate: ${((e as Error).message || String(e)).slice(0, 160)}`);
  }

  if (opts.restartIfStuck) {
    app['log']('仍未进登录 → 重启 App（terminate + activate）');
    await app['terminateApp']();
    await sleep(800);
    await app['activateApp']();
    await sleep(1_500);
    await app['closePopups']();
    await dismissForeignAuthUi(app);
    if (await isAndroidUnauthenticatedLoginScreen(app)) return;
    const gate = await enterAndroidMeGate(app, 20_000);
    if (gate === 'logged-out') return;
  }

  throw new Error(
    `退出登录后未能打开登录页，Activity: ${lastAct || '(未知)'} dumpsys=${dumpsysAct || '-'}`,
  );
}

/** 立即点底部「我的」：优先坐标（免首页动画 exists 等待），再回退 id 点击 */
async function tapAndroidMeTab(app: AppBaseClass): Promise<void> {
  const driver = app['driver'];
  try {
    const { width, height } = await driver.windowRect();
    const x = Math.round(width * 0.9);
    // 底栏可能略偏上/下，连点两档提高命中
    for (const ratio of [0.94, 0.97, 0.91]) {
      const y = Math.round(height * ratio);
      app['log'](`立即点击「我的」tab (${x},${y})`);
      try {
        await driver.execute('mobile: clickGesture', [{ x, y }]);
      } catch {
        /* 下一档 */
      }
      await sleep(200);
      await app['refreshActivity']();
      if (/\.LoginActivity$/i.test(app['activity'] ?? '')) return;
      if (await softExists(app, LOC.loginClose)) return;
      if (await softExists(app, ANDROID_LOGIN_ENTRY.google.low)) return;
      if (await softExists(app, ANDROID_LOGIN_ENTRY.phone.low)) return;
    }
  } catch (e) {
    app['log'](`坐标点击失败，改 id: ${((e as Error).message || String(e)).slice(0, 100)}`);
  }
  if (await softExists(app, LOC.tabMe)) {
    await driver.click(LOC.tabMe);
  }
}

/**
 * 已登录「我的」：设置 → 退出 → 一回首页就立刻点「我的」弹出登录页。
 * 用于串联多种登录方式切换（不重启 App）。
 * 关键点：退出后绝不能空等在访客首页；MainActivity 出现即坐标点「我的」。
 */
export async function logoutAndroidThenOpenLoginPage(app: AppBaseClass): Promise<void> {
  const driver = app['driver'];
  if (!(await isAndroidLoggedInMe(app))) {
    app['log']('当前不在「我的」，先进入「我的」再退出');
    await assertAndroidLoggedInMe(app, 15_000);
  }

  app['log']('设置页退出登录');
  if (!(await scrollUntilExists(app, LOC.settingEntry))) {
    throw new Error('我的页未找到设置入口 setting_layout');
  }
  await driver.click(LOC.settingEntry);
  await sleep(800);
  const logoutTarget = (await softExists(app, LOC.logoutLayout))
    ? LOC.logoutLayout
    : (await scrollUntilExists(app, LOC.logout))
      ? LOC.logout
      : null;
  if (!logoutTarget) {
    throw new Error('设置页未找到退出登录 logoutLayout / logout_tv');
  }
  await driver.click(logoutTarget);
  app['log']('已点退出：等回首页后立刻点「我的」（不在首页空等；设置页会 dumpsys 纠偏）');
  await afterLogoutOpenAndroidLoginPage(app, { restartIfStuck: true });
}

/**
 * 在已登录「我的」页：设置 → 退出登录 → 等自动回首页 → 重启 App → 点「我的」进登录页。
 *
 * - 不等待 postLogout 回调本身，只轮询 Activity 直到 MainActivity / LoginActivity
 * - 到首页后 terminate+activate 重启，再点「我的」拉起登录
 * - 不 clearApp / 不卸载
 * - 串联多登录方式请用 logoutAndroidThenOpenLoginPage（不重启）
 */
async function logoutAndroidFromMe(app: AppBaseClass): Promise<void> {
  const driver = app['driver'];
  app['log']('已在「我的」且未弹出登录页 → 设置页退出登录');
  if (!(await scrollUntilExists(app, LOC.settingEntry))) {
    throw new Error('我的页未找到设置入口 setting_layout');
  }
  await driver.click(LOC.settingEntry);
  await sleep(800);
  const logoutTarget = (await softExists(app, LOC.logoutLayout))
    ? LOC.logoutLayout
    : (await scrollUntilExists(app, LOC.logout))
      ? LOC.logout
      : null;
  if (!logoutTarget) {
    throw new Error('设置页未找到退出登录 logoutLayout / logout_tv');
  }
  await driver.click(logoutTarget);
  app['log']('已点退出登录：不等 postLogout；回首页后立刻点「我的」或再重启');
  await afterLogoutOpenAndroidLoginPage(app, { restartIfStuck: true });
}

/**
 * 打开登录主页，供手机号 / Google / Facebook 共用。
 *
 * 规则：
 * 1. 已在登录页（未登录）→ 直接走登录流程
 * 2. 不在登录页 → 先去「我的」
 *    - 弹出登录页 → 走登录流程
 *    - 未弹出（已登录「我的」）→ 设置退出 → 回首页立刻点「我的」→（必要时再重启）→ LoginActivity
 * 3. 成功标准：最终进已登录「我的」页
 */
export async function ensureAndroidLoginHome(app: AppBaseClass): Promise<void> {
  await dismissForeignAuthUi(app);
  await escapeAndroidLoginSubpages(app);
  await app['closePopups']();

  if (await isAndroidUnauthenticatedLoginScreen(app)) {
    app['log']('当前已在登录页（未登录），直接走登录流程');
    await escapeAndroidLoginSubpages(app);
    await waitAndroidLoginEntries(app);
    return;
  }

  app['log']('当前不在登录页 → 先点「我的」判断是否弹出登录');
  const gate = await enterAndroidMeGate(app);

  if (gate === 'logged-out') {
    app['log']('点「我的」后已弹出登录页，准备登录');
    await escapeAndroidLoginSubpages(app);
    await waitAndroidLoginEntries(app);
    return;
  }

  // gate === logged-in：设置退出；logoutAndroidFromMe 内会处理「首页 → 点我的 → 登录页」
  await logoutAndroidFromMe(app);
  await escapeAndroidLoginSubpages(app);
  await waitAndroidLoginEntries(app);
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
  if (await softExists(app, GGL.accountName)) return true;
  if (await softExists(app, GGL.accountDisplayName)) return true;
  if (await softExists(app, GGL.accountParticle)) return true;
  if (await softExists(app, GGL.emailLikeClickable)) return true;
  if (await softExists(app, by.textContains('Choose an account'))) return true;
  if (await softExists(app, by.textContains('选择账号'))) return true;
  if (await softExists(app, by.textContains('选择一个帐号'))) return true;
  return false;
}

async function tapContinueIfPresent(app: AppBaseClass): Promise<boolean> {
  for (const loc of GGL.continueButtons) {
    if (await softClick(app, loc)) {
      app['log'](`点 Google 确认按钮: ${loc[0]}=${loc[1]}`);
      await sleep(1_000);
      return true;
    }
  }
  return false;
}

/**
 * 在 Google 账号页点选已登录账号（不跳转三方 App）。
 * @param preferredEmail 优先匹配该邮箱；空则点列表第一个账号
 */
export async function confirmGoogleAccountOnPicker(
  app: AppBaseClass,
  preferredEmail = '',
  timeoutMs = 25_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let tappedAccount = false;

  while (Date.now() < deadline) {
    await app['refreshActivity']();
    // 已回到 App：授权完成（到达「我的」由 finishOnMeTab 再确认）
    if (/\.MainActivity$/i.test(app['activity'] ?? '')) {
      if ((await softExists(app, LOC.tabMe)) || (await isAndroidLoggedInMe(app))) {
        app['log']('已回到 MainActivity，视为 Google 授权完成');
        return;
      }
    }

    if (await tapContinueIfPresent(app)) {
      tappedAccount = true;
      await sleep(800);
      continue;
    }

    if (!tappedAccount) {
      if (preferredEmail) {
        const byEmail = by.textContains(preferredEmail);
        if (await softExists(app, byEmail)) {
          app['log'](`点选 Google 账号: ${preferredEmail}`);
          // 优先点邮箱文案本身，避免 API35 XPath mSealed
          if (!(await softClick(app, byEmail))) {
            const clickable = by.xpath(
              `//*[contains(@text,${JSON.stringify(preferredEmail)})]/ancestor-or-self::*[@clickable='true'][1]`,
            );
            await softClick(app, clickable);
          }
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
        if (await softClick(app, loc)) {
          app['log'](`点选 Google 列表账号: ${loc[0]}=${loc[1]}`);
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
  if (await isAndroidLoggedInMe(app)) return;

  if (!tappedAccount && !(await softExists(app, LOC.tabMe))) {
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
    if (/\.MainActivity$/i.test(app['activity'] ?? '') && (await softExists(app, LOC.tabMe))) {
      app['log']('点 Google 后已直接进入主页（可能已有授权缓存）');
      await finishOnMeTab(app);
      return;
    }
    await tapContinueIfPresent(app);
    await sleep(500);
  }

  try {
    await confirmGoogleAccountOnPicker(app, email);
  } catch (e) {
    // 选账号阶段 XPath 异常时，若已回主页则以「我的」为准
    await app['refreshActivity']();
    if (
      /\.MainActivity$/i.test(app['activity'] ?? '') ||
      (await isAndroidLoggedInMe(app)) ||
      (await softExists(app, LOC.tabMe))
    ) {
      app['log'](`Google 选账号异常但已回 App，按「我的」页判定: ${(e as Error).message.slice(0, 120)}`);
    } else {
      throw e;
    }
  }
  await app['closePopups']();
  await finishOnMeTab(app);
}

export async function tapFacebookLoginEntry(app: AppBaseClass): Promise<void> {
  const driver = app['driver'];
  const e = ANDROID_LOGIN_ENTRY.facebook;
  // 与 Google 入口一致：高优 / 低优 / 文案，再轻滑重试
  if (await softExists(app, e.high)) {
    await driver.click(e.high);
    return;
  }
  if (await softExists(app, e.low)) {
    await driver.click(e.low);
    return;
  }
  if (await softExists(app, e.text)) {
    await driver.click(e.text);
    return;
  }
  await driver.swipeUp(0.35);
  await sleep(500);
  if (await softExists(app, e.high)) {
    await driver.click(e.high);
    return;
  }
  if (await softExists(app, e.low)) {
    await driver.click(e.low);
    return;
  }
  throw new Error('未找到 Facebook 登录入口（rl_facebook_login / iv_low_facebook_login）');
}

function resolveFacebookName(app: AppBaseClass, account?: AppAccount): string {
  const fromEnv = (process.env.SCRIPT_FACEBOOK_NAME ?? '').trim();
  if (fromEnv) return fromEnv;
  const root = (app['scriptConfig'].facebook ?? {}) as { name?: string; email?: string };
  if (root.name?.trim()) return root.name.trim();
  if (root.email?.trim()) return root.email.trim();
  const accounts = (app['scriptConfig'].accounts ?? {}) as Record<string, AppAccount | undefined>;
  const fromAccounts = accounts.facebook;
  if (fromAccounts) {
    const name = String(fromAccounts.name ?? fromAccounts.email ?? fromAccounts.username ?? '').trim();
    if (name) return name;
  }
  if (account) {
    const name = String(
      (account as { name?: string }).name ?? account.email ?? account.username ?? '',
    ).trim();
    if (name) return name;
  }
  return '';
}

async function tapFacebookContinueIfPresent(app: AppBaseClass): Promise<boolean> {
  for (const loc of FB.continueButtons) {
    if (!(await softExists(app, loc))) continue;
    app['log'](`点 Facebook 确认按钮: ${loc[0]}=${loc[1]}`);
    if (await softClick(app, loc)) {
      await sleep(1_200);
      return true;
    }
    await app['refreshActivity']();
    if (/\.MainActivity$/i.test(app['activity'] ?? '')) {
      app['log']('Continue 点击时页面已回主页，视为授权完成');
      return true;
    }
  }
  return false;
}

/**
 * Facebook 授权页：优先点「Continue as / Continue」；可选按展示名匹配。
 * 前置：设备 Facebook App 或浏览器已登录 FB 账号。
 */
export async function confirmFacebookOnPicker(
  app: AppBaseClass,
  preferredName = '',
  timeoutMs = 35_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let tapped = false;

  while (Date.now() < deadline) {
    await app['refreshActivity']();
    if (/\.MainActivity$/i.test(app['activity'] ?? '')) {
      if ((await softExists(app, LOC.tabMe)) || (await softExists(app, LOC.mePage))) {
        app['log']('已回到 MainActivity，视为 Facebook 授权完成');
        return;
      }
    }

    if (preferredName && !tapped) {
      const byName = by.textContains(preferredName);
      if (await softExists(app, byName)) {
        app['log'](`点选 Facebook 账号/文案: ${preferredName}`);
        const clickable = by.xpath(
          `//*[contains(@text,${JSON.stringify(preferredName)})]/ancestor-or-self::*[@clickable='true'][1]`,
        );
        if ((await softClick(app, clickable)) || (await softClick(app, byName))) {
          tapped = true;
          await sleep(1_200);
          continue;
        }
        await app['refreshActivity']();
        if (/\.MainActivity$/i.test(app['activity'] ?? '')) return;
      }
    }

    if (await tapFacebookContinueIfPresent(app)) {
      tapped = true;
      await app['refreshActivity']();
      if (/\.MainActivity$/i.test(app['activity'] ?? '')) return;
      await sleep(800);
      continue;
    }

    if (!tapped && (await softExists(app, FB.accountClickable))) {
      app['log']('点选 Facebook 可点账号行');
      if (await softClick(app, FB.accountClickable)) {
        tapped = true;
        await sleep(1_200);
        continue;
      }
      await app['refreshActivity']();
      if (/\.MainActivity$/i.test(app['activity'] ?? '')) return;
    }

    await sleep(500);
  }

  await app['refreshActivity']();
  if (/\.MainActivity$/i.test(app['activity'] ?? '')) return;

  throw new Error(
    preferredName
      ? `Facebook 授权页未完成（未找到「Continue」或账号 ${preferredName}；请确认设备已登录 Facebook）`
      : 'Facebook 授权页未完成（未找到 Continue as / Continue；请确认设备 Facebook App 或 Chrome 已登录）',
  );
}

/**
 * Facebook 三方登录：登录主页 → 点 Facebook → 授权页 Continue → 回「我的」。
 * 结构对齐 loginWithGoogle（等待循环内不主动 dismiss Custom Tab，否则会退回登录页点不到 Continue）。
 * 前置：设备已登录 Facebook（App 或浏览器会话）；优先点 Continue，不填账密。
 */
export async function loginWithFacebook(app: AppBaseClass, account?: AppAccount): Promise<void> {
  const name = resolveFacebookName(app, account);
  if (name) app['log'](`Facebook 优先账号名: ${name}`);
  else app['log']('未配置 SCRIPT_FACEBOOK_NAME / facebook.name，将点 Continue as / Continue');

  await ensureAndroidLoginHome(app);
  await tapFacebookLoginEntry(app);
  await sleep(1_000);

  // 等授权页或直接回主页（对齐 Google：此处不要 dismissForeignAuthUi，FB 走 Custom Tab）
  const waitPickerDeadline = Date.now() + 20_000;
  while (Date.now() < waitPickerDeadline) {
    await app['refreshActivity']();
    if (/\.MainActivity$/i.test(app['activity'] ?? '') && (await softExists(app, LOC.tabMe))) {
      app['log']('点 Facebook 后已直接进入主页（可能已有授权缓存）');
      await finishOnMeTab(app);
      return;
    }
    let hasContinue = false;
    for (const loc of FB.continueButtons) {
      if (await softExists(app, loc)) {
        hasContinue = true;
        break;
      }
    }
    if (hasContinue || (name && (await softExists(app, by.textContains(name))))) break;
    await tapFacebookContinueIfPresent(app);
    await sleep(500);
  }

  try {
    await confirmFacebookOnPicker(app, name);
  } catch (e) {
    await app['refreshActivity']();
    if (
      /\.MainActivity$/i.test(app['activity'] ?? '') ||
      (await isAndroidLoggedInMe(app)) ||
      (await softExists(app, LOC.tabMe))
    ) {
      app['log'](`Facebook 授权异常但已回 App，按「我的」页判定: ${(e as Error).message.slice(0, 120)}`);
    } else {
      throw e;
    }
  }
  await app['closePopups']();
  await finishOnMeTab(app);
}

