/**
 * iOS Lita / LitaDev 登录相关定位符（中文包实测校准）。
 * bundleId: but.lita.ios
 */
import { by } from '../../../../src/resources/AppiumResource.ts';

export const IOS_BUNDLE_ID = 'but.lita.ios';

/** 登录页入口 accessibilityId / 文案（与 LoginButtonType 对应） */
export const IOS_LOGIN_ENTRY = {
  facebook: {
    type: 'facebook' as const,
    /** 高优大按钮文案 */
    highText: by.textContains('Facebook'),
    /** 低优图标 */
    lowId: by.accessibilityId('login other facebook'),
  },
  google: {
    type: 'google' as const,
    highText: by.textContains('Google'),
    lowId: by.accessibilityId('login other google'),
  },
  apple: {
    type: 'apple' as const,
    highText: by.textContains('Apple'),
    lowId: by.accessibilityId('login other apple'),
  },
  line: {
    type: 'line' as const,
    highText: by.textContains('Line'),
    lowId: by.accessibilityId('login other line'),
  },
  kakao: {
    type: 'kakao' as const,
    highText: by.textContains('Kakao'),
    lowId: by.accessibilityId('login other kakao'),
  },
  phone: {
    type: 'phone' as const,
    highText: by.textContains('手机'),
    lowId: by.accessibilityId('login other sms'),
  },
};

export const IOS_LOC = {
  /** 首次安装启动引导（LaunchGuide） */
  launchGuideImage: by.accessibilityId('ltlaunch_topImage_1'),
  launchGuideSkip: by.text('跳过'),
  launchGuideSkipEn: by.text('Skip'),
  launchGuideNext: by.text('下一个'),
  /** 首页活动/运营弹窗 */
  activityClose: by.accessibilityId('activity close'),
  activityNoMoreToday: by.text('今天内不再弹出'),
  notiClose: by.accessibilityId('lt noti close'),
  loginClose: by.accessibilityId('iconIconClose28'),
  loginTitle: by.text('登录以体验全部功能'),
  phoneLoginEntry: by.accessibilityId('login other sms'),
  phonePageTitle: by.text('输入您的电话号码'),
  countryCode: by.textContains('+'),
  phoneInput: by.xpath('//XCUIElementTypeTextField'),
  phoneNext: by.text('下一步'),
  passwordInput: by.xpath('//XCUIElementTypeSecureTextField'),
  passwordSubmit: by.text('登入'),
  passwordPageTitle: by.text('请输入该手机号密码'),
  forgotPassword: by.text('忘记密码'),
  noWhatsApp: by.text('我没有 WhatsApp'),
  whatsAppClose: by.accessibilityId('sentCloseX login'),
  whatsAppContinue: by.text('继续'),
  otpPageTitle: by.textContains('输入验证码'),
  homeLogo: by.accessibilityId('home_top_name_logo'),
  homeHotGames: by.text('热门游戏'),
  homeNewbieTask: by.text('新手任务'),
  tabMe: by.xpath('(//XCUIElementTypeButton[@visible="true" and @y>700])[last()]'),
  meSetting: by.text('设置'),
  backLight: by.accessibilityId('icon back lightMode'),
};
