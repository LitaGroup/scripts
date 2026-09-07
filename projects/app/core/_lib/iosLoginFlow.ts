/**
 * iOS 登录共用：capabilities / 状态注册 / 手机号密码登录流程。
 */
import type { AppBaseClass, AppAccount } from '../../../../src/base/AppBaseClass.ts';
import { by, sleep, type AppiumCapabilities } from '../../../../src/resources/AppiumResource.ts';
import { IOS_BUNDLE_ID, IOS_LOC as LOC } from './iosLocators.ts';

export function iosLitaCapabilities(): AppiumCapabilities {
  const caps: AppiumCapabilities = {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:bundleId': IOS_BUNDLE_ID,
    'appium:noReset': true,
    'appium:newCommandTimeout': 300,
    'appium:wdaLaunchTimeout': 120_000,
    'appium:autoAcceptAlerts': true,
  };
  const deviceName = process.env.SCRIPT_IOS_DEVICE;
  if (deviceName) caps['appium:deviceName'] = deviceName;
  const platformVersion = process.env.SCRIPT_IOS_VERSION;
  if (platformVersion) caps['appium:platformVersion'] = platformVersion;
  const udid = process.env.SCRIPT_IOS_UDID;
  if (udid) caps['appium:udid'] = udid;

  // 真机必须签 WebDriverAgent；可用环境变量覆盖
  // SCRIPT_XCODE_ORG_ID / SCRIPT_XCODE_SIGNING_ID / SCRIPT_WDA_BUNDLE_ID
  if (udid) {
    caps['appium:xcodeOrgId'] = process.env.SCRIPT_XCODE_ORG_ID ?? '9E3TH8D48X';
    caps['appium:xcodeSigningId'] = process.env.SCRIPT_XCODE_SIGNING_ID ?? 'Apple Development';
    caps['appium:updatedWDABundleId'] =
      process.env.SCRIPT_WDA_BUNDLE_ID ?? 'com.cuizhangqiang.wda.WebDriverAgentRunner';
    caps['appium:allowProvisioningUpdates'] = true;
    caps['appium:allowProvisioningDeviceRegistration'] = true;
    caps['appium:showXcodeLog'] = true;
    // 若已手动 build-for-testing 成功，可跳过重编
    if (process.env.SCRIPT_USE_PREBUILT_WDA === '1') {
      caps['appium:usePrebuiltWDA'] = true;
    }
  }
  return caps;
}

/** 注册弹窗 + logged-in / logged-out（供 ensureLoggedIn 使用） */
export function registerIosLoginStates(app: AppBaseClass): void {
  // 重装/清数据后会出现启动引导，必须先于登录态检测关闭
  app['addState']({
    name: 'popup-launch-guide',
    kind: 'popup',
    detect: async () =>
      (await app['driver'].isDisplayed(LOC.launchGuideImage)) ||
      (await app['driver'].isDisplayed(LOC.launchGuideSkip)) ||
      (await app['driver'].isDisplayed(LOC.launchGuideSkipEn)),
    handle: async () => {
      if (await app['driver'].isDisplayed(LOC.launchGuideSkip)) {
        await app['driver'].click(LOC.launchGuideSkip);
      } else if (await app['driver'].isDisplayed(LOC.launchGuideSkipEn)) {
        await app['driver'].click(LOC.launchGuideSkipEn);
      } else if (await app['driver'].isDisplayed(LOC.launchGuideNext)) {
        // 兜底：连点「下一个」最多 5 次
        for (let i = 0; i < 5 && (await app['driver'].isDisplayed(LOC.launchGuideNext)); i++) {
          await app['driver'].click(LOC.launchGuideNext);
          await sleep(400);
        }
      }
      await sleep(800);
    },
  });
  app['addState']({
    name: 'popup-noti',
    kind: 'popup',
    detect: () => app['driver'].isDisplayed(LOC.notiClose),
    handle: async () => {
      await app['driver'].click(LOC.notiClose);
      await sleep(400);
    },
  });
  app['addState']({
    name: 'popup-activity',
    kind: 'popup',
    detect: async () =>
      (await app['driver'].isDisplayed(LOC.activityClose)) ||
      (await app['driver'].isDisplayed(LOC.activityNoMoreToday)),
    handle: async () => {
      if (await app['driver'].isDisplayed(LOC.activityClose)) {
        await app['driver'].click(LOC.activityClose);
      } else {
        await app['driver'].click(LOC.activityNoMoreToday);
      }
      await sleep(500);
    },
  });
  app['addState']({
    name: 'popup-whatsapp',
    kind: 'popup',
    detect: async () =>
      (await app['driver'].isDisplayed(LOC.noWhatsApp)) || (await app['driver'].isDisplayed(LOC.whatsAppClose)),
    handle: async () => {
      if (await app['driver'].isDisplayed(LOC.noWhatsApp)) {
        await app['driver'].click(LOC.noWhatsApp);
      } else {
        await app['driver'].click(LOC.whatsAppClose);
      }
      await sleep(500);
    },
  });
  app['addState']({
    name: 'logged-out',
    detect: async () =>
      (await app['driver'].isDisplayed(LOC.loginTitle)) ||
      (await app['driver'].isDisplayed(LOC.phoneLoginEntry)) ||
      (await app['driver'].isDisplayed(LOC.phonePageTitle)) ||
      (await app['driver'].isDisplayed(LOC.phoneInput)) ||
      (await app['driver'].isDisplayed(LOC.passwordPageTitle)) ||
      (await app['driver'].isDisplayed(LOC.passwordInput)) ||
      (await app['driver'].isDisplayed(LOC.otpPageTitle)),
  });
  app['addState']({
    name: 'logged-in',
    detect: async () =>
      ((await app['driver'].isDisplayed(LOC.homeLogo)) ||
        (await app['driver'].isDisplayed(LOC.homeHotGames)) ||
        (await app['driver'].isDisplayed(LOC.homeNewbieTask)) ||
        (await app['driver'].isDisplayed(LOC.meSetting))) &&
      !(await app['driver'].isDisplayed(LOC.loginTitle)) &&
      !(await app['driver'].isDisplayed(LOC.phoneLoginEntry)) &&
      !(await app['driver'].isDisplayed(LOC.otpPageTitle)),
  });
}

export async function enterOtp(app: AppBaseClass): Promise<void> {
  const driver = app['driver'];
  const otp = (process.env.SCRIPT_OTP ?? '1234').trim();
  app['log'](`使用验证码 ${otp}（可用 SCRIPT_OTP 覆盖）`);
  if (await driver.exists(by.xpath('//XCUIElementTypeCollectionView'))) {
    await driver.click(by.xpath('//XCUIElementTypeCollectionView/XCUIElementTypeCell[1]'));
    await sleep(300);
  }
  for (const ch of otp) {
    const key = by.accessibilityId(ch);
    if (await driver.exists(key)) await driver.click(key);
    else throw new Error(`键盘上未找到数字键 ${ch}`);
    await sleep(150);
  }
  await sleep(3_000);
}

/**
 * 手机号 + 密码登录（含区号、WhatsApp 弹窗、新设备 OTP）。
 * 对应 iOS：SMSInput → LTCheckPassword →（可选）VerificationCode OTP
 */
export async function loginWithPhonePassword(app: AppBaseClass, account: AppAccount): Promise<void> {
  const driver = app['driver'];
  await app['closePopups']();

  if (await driver.isDisplayed(LOC.otpPageTitle)) {
    // 上次失败可能停在错误区号的 OTP 页：先返回重走选区号，避免盲填验证码
    app['log']('当前在验证码页，返回后重新走手机号登录');
    if (await driver.exists(LOC.backLight)) await driver.click(LOC.backLight);
    else await driver.back();
    await sleep(800);
    await app['closePopups']();
  }

  if ((await driver.isDisplayed(LOC.passwordInput)) || (await driver.isDisplayed(LOC.passwordPageTitle))) {
    await driver.input(LOC.passwordInput, account.password);
    await driver.hideKeyboard();
    await app['assertExists'](LOC.passwordSubmit, '登入');
    await driver.click(LOC.passwordSubmit);
    await sleep(2_000);
    await app['closePopups']();
    await sleep(1_000);
    if (await driver.isDisplayed(LOC.otpPageTitle)) await enterOtp(app);
    return;
  }

  if (!(await driver.isDisplayed(LOC.phonePageTitle)) && !(await driver.isDisplayed(LOC.phoneInput))) {
    if (!(await driver.isDisplayed(LOC.phoneLoginEntry))) {
      if (await driver.isDisplayed(LOC.tabMe)) {
        await driver.click(LOC.tabMe);
        await sleep(1000);
        await app['closePopups']();
      }
    }
    await app['waitForElement'](LOC.phoneLoginEntry, '手机号登录入口 login other sms', 10_000);
    await driver.click(LOC.phoneLoginEntry);
  }

  await app['waitForElement'](LOC.phoneInput, '手机号输入框', 10_000);

  const countryCode = String(account.countryCode ?? '').trim().replace(/^\+/, '');
  if (countryCode && (await driver.exists(LOC.countryCode))) {
    // 注意：textContains("+62") 会误匹配 +962；必须用精确 name=="+62"
    const codeExact = by.iosPredicate(`name == "+${countryCode}" OR label == "+${countryCode}"`);
    const flagExact = by.iosPredicate(
      `name ENDSWITH "+${countryCode}" OR label ENDSWITH "+${countryCode}"`,
    );
    const nameCandidates =
      countryCode === '62'
        ? [
            by.iosPredicate('name CONTAINS "Indonesia" OR label CONTAINS "Indonesia"'),
            by.iosPredicate('name CONTAINS "인도네시아" OR label CONTAINS "인도네시아"'),
            by.iosPredicate('name CONTAINS "印度尼西亚" OR label CONTAINS "印度尼西亚"'),
          ]
        : [];

    const selectCountry = async (): Promise<boolean> => {
      await driver.click(LOC.countryCode);
      await sleep(900);
      const findTarget = async () => {
        if (await driver.exists(codeExact)) return codeExact;
        for (const loc of nameCandidates) {
          if (await driver.exists(loc)) return loc;
        }
        return null;
      };
      let target = await findTarget();
      for (let i = 0; i < 32 && !target; i++) {
        await driver.swipeUp(0.55);
        await sleep(280);
        target = await findTarget();
      }
      if (!target) {
        app['log'](`区号列表未找到 +${countryCode}`);
        if (await driver.exists(LOC.backLight)) await driver.click(LOC.backLight);
        else await driver.back();
        await sleep(500);
        return false;
      }
      await driver.click(target);
      await sleep(1000);
      return true;
    };

    const onPhonePage = async () =>
      (await driver.isDisplayed(LOC.phoneInput)) || (await driver.isDisplayed(LOC.phonePageTitle));

    let ok = await selectCountry();
    if (ok) {
      for (let i = 0; i < 15 && !(await onPhonePage()); i++) await sleep(300);
      if (!(await driver.exists(flagExact))) {
        app['log'](`选区号后 Flag 未显示 +${countryCode}，重试`);
        ok = await selectCountry();
        for (let i = 0; i < 15 && !(await onPhonePage()); i++) await sleep(300);
      }
    }
    if (ok && (await driver.exists(flagExact))) {
      app['log'](`已选择区号 +${countryCode}`);
    } else {
      throw new Error(`未能确认区号 +${countryCode}`);
    }
  }

  await driver.input(LOC.phoneInput, account.username);
  await driver.hideKeyboard();
  await app['assertExists'](LOC.phoneNext, '下一步');
  await driver.click(LOC.phoneNext);
  await sleep(800);
  await app['closePopups']();

  const pwdAppeared = await driver.waitFor(LOC.passwordInput, 10_000);
  if (!pwdAppeared) {
    // 无密码账号可能直接进短信/WhatsApp 验证码页
    if (await driver.isDisplayed(LOC.otpPageTitle)) {
      await enterOtp(app);
      return;
    }
    const src = await driver.source();
    app['log'](`密码页未出现\n${src.slice(0, 2000)}`);
    throw new Error('密码输入框未出现（账号可能未设密码或进入短信验证码流）');
  }

  await driver.input(LOC.passwordInput, account.password);
  await driver.hideKeyboard();
  await app['assertExists'](LOC.passwordSubmit, '登入');
  await driver.click(LOC.passwordSubmit);
  await sleep(2_000);
  await app['closePopups']();
  await sleep(1_000);
  if (await driver.isDisplayed(LOC.otpPageTitle)) await enterOtp(app);
}
