/**
 * Android Lite（lita-lite-android）登录定位符。
 * package: com.litalite.android
 */
import { by } from '../../../../src/resources/AppiumResource.ts';

export const ANDROID_LITE_PACKAGE = 'com.litalite.android';

export const ANDROID_ACT = {
  splash: '.ui.splash.SplashActivity',
  locationConfig: '.ui.splash.LocationConfigActivity',
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

/**
 * Google 账号选择 / 确认页（系统 GMS，设备已登录 Google 时点账号即可）。
 * 常见包：com.google.android.gms；不跳转独立 Google App。
 */
export const ANDROID_GOOGLE_PICKER = {
  /** 账号邮箱 / 展示名（旧版 AccountPicker） */
  accountName: by.id('com.google.android.gms:id/account_name'),
  accountDisplayName: by.id('com.google.android.gms:id/account_display_name'),
  accountParticle: by.id('com.google.android.gms:id/account_particle_disc'),
  /** 列表项容器 */
  accountRow: by.xpath(
    "//*[contains(@resource-id,'account_name') or contains(@resource-id,'account_display_name') or contains(@resource-id,'account_particle')]/ancestor::*[@clickable='true'][1]",
  ),
  /** 任意含 @ 的可点节点（邮箱行兜底） */
  emailLikeClickable: by.xpath(
    "//*[contains(@text,'@')]/ancestor-or-self::*[@clickable='true'][1]",
  ),
  /** 选账号后的继续 / 同意 */
  continueButtons: [
    by.text('Continue'),
    by.text('CONTINUE'),
    by.text('继续'),
    by.text('同意并继续'),
    by.textContains('Continue as'),
    by.textContains('继续使用'),
    by.text('Allow'),
    by.text('ALLOW'),
    by.text('允许'),
    by.text('OK'),
    by.text('确定'),
    by.id('com.google.android.gms:id/continue_button'),
    by.id('com.google.android.gms:id/accept_button'),
  ],
} as const;

/**
 * Facebook 授权页（设备已登录 Facebook / Chrome 有 FB 会话时，点 Continue as / Continue 即可）。
 * 可能出现在：Facebook App、Chrome Custom Tab、Facebook SDK WebDialog。
 */
export const ANDROID_FACEBOOK_PICKER = {
  /** 继续使用已登录账号 */
  continueButtons: [
    by.textContains('Continue as'),
    by.textContains('继续使用'),
    by.text('Continue'),
    by.text('CONTINUE'),
    by.text('继续'),
    by.text('Log In'),
    by.text('Log in'),
    by.text('LOGIN'),
    by.text('登录'),
    by.text('Allow'),
    by.text('ALLOW'),
    by.text('允许'),
    by.text('OK'),
    by.text('确定'),
    by.accessibilityId('Continue'),
    by.accessibilityId('Log In'),
  ],
  /** 账号名 / 展示名（点选列表项） */
  accountClickable: by.xpath(
    "//*[contains(@text,'@') or contains(@text,'Continue as') or contains(@text,'继续')]/ancestor-or-self::*[@clickable='true'][1]",
  ),
} as const;

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
  /** 首启地区/语言选择（LocationConfigActivity） */
  locationConfigConfirm: id('tv_confirm_view'),
  locationConfigList: id('rl_question_list'),
  locationConfigOption: id('tv_title_view'),
  /** 系统权限弹窗 Allow（不同 API 文案/id 不一） */
  permissionAllowIds: [
    by.id('com.android.permissioncontroller:id/permission_allow_button'),
    by.id('com.android.permissioncontroller:id/permission_allow_foreground_only_button'),
    by.id('com.android.packageinstaller:id/permission_allow_button'),
    by.text('Allow'),
    by.text('ALLOW'),
    by.text('允许'),
    by.text('While using the app'),
  ],
};
