/**
 * Android Lite（lita-lite-android）登录定位符。
 * package: com.litalite.android
 */
import { by } from '../../../../src/resources/AppiumResource.ts';

export const ANDROID_LITE_PACKAGE = 'com.litalite.android';

export const ANDROID_ACT = {
  splash: '.ui.splash.SplashActivity',
  onboarding: '.ui.onboarding.OnboardingNewActivity',
  login: '.ui.login.LoginActivity',
  main: '.MainActivity',
} as const;

const id = (name: string) => by.id(`${ANDROID_LITE_PACKAGE}:id/${name}`);

/** 登录页入口（高优大按钮 / 低优图标） */
export const ANDROID_LOGIN_ENTRY = {
  phone: {
    high: id('rl_phone_login'),
    low: id('iv_low_phone_login'),
    text: by.textContains('Sign in with Phone'),
  },
  facebook: {
    high: id('rl_facebook_login'),
    low: id('iv_low_facebook_login'),
    text: by.textContains('Facebook'),
  },
  google: {
    high: id('rl_google_login'),
    low: id('iv_low_google_login'),
    text: by.textContains('Google'),
  },
  line: {
    high: id('rl_line_login'),
    low: id('iv_low_line_login'),
    text: by.textContains('Line'),
  },
  kakao: {
    high: id('rl_kakao_login'),
    low: id('iv_low_kakao_login'),
    text: by.textContains('Kakao'),
  },
};

export const ANDROID_LOC = {
  tabMe: id('navigation_user_center'),
  tabHome: id('navigation_home'),
  tabView: id('tabView'),
  mePage: id('layout_options'),
  meUid: id('user_no'),
  meName: id('user_name'),
  settingEntry: id('setting_layout'),
  logout: id('logout_tv'),

  loginClose: id('close_button'),
  phoneLoginHigh: ANDROID_LOGIN_ENTRY.phone.high,
  phoneLoginLow: ANDROID_LOGIN_ENTRY.phone.low,

  countryCode: id('tv_country_code'),
  countryList: id('rlCountryListView'),
  phoneInput: id('enter_phone_number'),
  phoneNext: id('send_sms_code_button'),

  passwordInput: id('et_password'),
  passwordSubmit: id('tv_confirm'),

  otpInput: id('input_captcha_et'),
  otpTitle: id('tv_title'),

  whatsAppClose: id('iv_close'),
  whatsAppContinue: id('tv_continue'),
  noWhatsApp: id('tv_not_have_whatsapp'),

  popupActivity: id('vp_banner'),
  popupActivityClose: id('img_close'),

  /** 首启引导 Skip */
  onboardingSkip: id('skipTv'),
  /** 系统权限弹窗 Allow（不同 API 文案/id 不一） */
  permissionAllowIds: [
    by.id('com.android.permissioncontroller:id/permission_allow_button'),
    by.id('com.android.permissioncontroller:id/permission_allow_foreground_only_button'),
    by.id('com.android.packageinstaller:id/permission_allow_button'),
    by.text('Allow'),
    by.text('ALLOW'),
    by.text('允许'),
  ],
};
