/**
 * Sample：手机号+密码登录流程（Android / Lite）
 *
 * 基础环境：模拟器已完成 Lita Lite App 的安装（com.litalite.android）。
 *
 * 步骤：
 *   1. 处理登录状态为未登录：打开 APP 进入首页，若已登录则退出登录，彻底关闭 APP
 *   2. 验证手机号+密码登录：再次打开 APP，进入"我的" tab，使用 18611755224 / 123456 登录；
 *      如触发短信验证码，则查询 stats 库短信记录（按 SCRIPT_ENV 区分测试/生产库）
 *   3. 判断登录成功：我的页可抓取到用户 ID
 *
 * 运行：
 *   node projects/app/sample/sample.android.lite.test.ts
 *   SCRIPT_APPIUM_URL=http://172.20.1.79:4723/ SCRIPT_ENV=TEST node projects/app/sample/sample.android.lite.test.ts
 */
import { AppBaseClass } from '../../../src/base/AppBaseClass.ts';
import { by, sleep, type AppiumCapabilities, type Locator } from '../../../src/resources/AppiumResource.ts';
import { MySQLTestResource } from '../../../src/resources/MySQLTestResource.ts';
import { MySQLProdResource } from '../../../src/resources/MySQLProdResource.ts';

// 模拟器实测应用信息
const APP_PACKAGE = 'com.litalite.android';
const APP_ACTIVITY = '.ui.splash.SplashActivity';

// 测试账号（真实脚本建议通过 SCRIPT_CONFIG 的 accounts 配置注入）
const TEST_PHONE = '18611755224';
const TEST_PASSWORD = '123456';
const PHONE_PREFIX = '86';

// 元素定位符（基于 com.litalite.android 1.324 实测）
const ID = {
  tabHome: `${APP_PACKAGE}:id/navigation_home`, // 底部 tab - 首页（MainActivity 标记）
  tabMe: `${APP_PACKAGE}:id/navigation_user_center`, // 底部 tab - 我的
  meUid: `${APP_PACKAGE}:id/user_no`, // 我的页 - 用户ID（已登录标记）
  settingEntry: `${APP_PACKAGE}:id/setting_layout`, // 我的页 - Settings 入口（需滚动）
  logout: `${APP_PACKAGE}:id/logout_tv`, // 设置页 - Log Out（需滚动）
  loginPage: `${APP_PACKAGE}:id/rl_facebook_login`, // 登录页标记（LoginActivity）
  loginClose: `${APP_PACKAGE}:id/close_button`, // 登录页 - 关闭按钮
  phoneLoginEntry: `${APP_PACKAGE}:id/iv_low_phone_login`, // 登录页 - 手机号登录图标
  countryCode: `${APP_PACKAGE}:id/tv_country_code`, // 手机号页 - 区号选择器
  countryList: `${APP_PACKAGE}:id/rlCountryListView`, // 区号选择 - 国家列表
  phoneInput: `${APP_PACKAGE}:id/enter_phone_number`, // 手机号页 - 手机号输入框
  phoneNext: `${APP_PACKAGE}:id/send_sms_code_button`, // 手机号页 - Next 按钮
  passwordInput: `${APP_PACKAGE}:id/et_password`, // 密码页 - 密码输入框
  passwordSubmit: `${APP_PACKAGE}:id/tv_confirm`, // 密码页 - Login 按钮
  popupActivity: `${APP_PACKAGE}:id/vp_banner`, // 启动活动弹窗（今日不再弹出）
  popupActivityClose: `${APP_PACKAGE}:id/img_close`, // 启动活动弹窗 - 关闭按钮
};

function formatDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

class SampleTest extends AppBaseClass {
  private _mysql: MySQLTestResource | null = null;

  constructor() {
    super('android', 'lite');
    this.total = 6;

    // 状态注册顺序 = 检测顺序：弹窗 → 登录态 → 页面
    // 冷启动活动弹窗（实测：可能遮挡整个首页，需优先关闭）
    this.addState({
      name: 'popup-activity',
      kind: 'popup',
      detect: () => this.driver.exists(by.id(ID.popupActivity)),
      handle: async () => {
        await this.driver.click(by.id(ID.popupActivityClose));
      },
    });
    // TODO: 如遇到其它弹窗（更新/通知权限等），按实际元素继续注册 kind:'popup' 状态
    this.addState({
      name: 'logged-in',
      activity: '.MainActivity', // 先比对 Activity，匹配后才做元素检测
      detect: () => this.driver.exists(by.id(ID.meUid)), // 我的 tab 展示用户ID
    });
    this.addState({
      name: 'logged-out', // 登录相关页面（登录主页/手机号页/密码页）
      activity: '.ui.login.LoginActivity',
      detect: async () =>
        (await this.driver.exists(by.id(ID.loginPage))) ||
        (await this.driver.exists(by.id(ID.phoneInput))) ||
        (await this.driver.exists(by.id(ID.passwordInput))),
    });
    this.addState({
      name: 'home', // MainActivity（首页/我的等 tab 容器）
      activity: '.MainActivity',
      detect: () => this.driver.exists(by.id(ID.tabHome)),
    });
  }

  protected capabilities(): AppiumCapabilities {
    return {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:appPackage': APP_PACKAGE,
      'appium:appActivity': APP_ACTIVITY,
      'appium:noReset': true,
      'appium:newCommandTimeout': 300,
    };
  }

  protected async runCase(): Promise<void> {
    // ---------- 1. 处理登录状态为未登录 ----------
    await this.act('打开APP进入首页，处理弹窗', async () => {
      // APP 启动后可能落在任意 tab，等待就绪即可（home=MainActivity，登录态会先命中）
      await this.ensureAnyState(['home', 'logged-in', 'logged-out']);
    });

    await this.act('检查登录状态，已登录则退出登录', async () => {
      const state = await this.enterMeTab(); // 进入我的 tab 才能判定登录态
      this.log(`当前登录状态: ${state}`);
      if (state === 'logged-out') {
        this.log('当前未登录，关闭登录页即可');
        // 登录页为冷启动落地页时没有关闭按钮（无处可返回），此时保持当前页面即可
        if (await this.driver.waitFor(by.id(ID.loginClose), 5_000)) {
          await this.driver.click(by.id(ID.loginClose));
        } else {
          this.log('登录页无关闭按钮（冷启动落地页），保持当前页面');
        }
        return;
      }
      // 已登录 → 我的页滚动到 Settings → 设置页滚动到 Log Out → 退出
      await this.scrollToVisible(by.id(ID.settingEntry));
      await this.driver.click(by.id(ID.settingEntry));
      await this.scrollToVisible(by.id(ID.logout));
      await this.driver.click(by.id(ID.logout)); // 实测无确认弹窗，点击即退出并回到首页
      await this.ensureState('home', 15_000);
      // 再进我的 tab 验证确实已退出（应拉起登录页）
      const after = await this.enterMeTab();
      if (after !== 'logged-out') throw new Error(`退出登录后状态异常: ${after}`);
      this.log('已退出登录');
      if (!(await this.driver.waitFor(by.id(ID.loginClose), 5_000))) throw new Error('登录页关闭按钮未出现');
      await this.driver.click(by.id(ID.loginClose));
    });

    await this.act('彻底关闭APP', async () => {
      await this.terminateApp();
      // 验证 APP 已关闭：页面元素应全部消失
      await sleep(1_000);
      if (await this.driver.exists(by.id(ID.tabHome))) throw new Error('terminateApp 后 APP 界面仍可见');
    });

    // ---------- 2. 验证 手机号+密码 登录 ----------
    await this.act('再次打开APP，进入"我的"tab', async () => {
      await this.activateApp();
      await this.ensureAnyState(['home', 'logged-in', 'logged-out']); // APP 就绪
      const state = await this.enterMeTab();
      if (state !== 'logged-out') throw new Error(`期望未登录(拉起登录页)，实际: ${state}`);
    });

    await this.act(`手机号+密码登录（${TEST_PHONE}）`, async () => {
      await this.driver.click(by.id(ID.phoneLoginEntry)); // 手机号登录图标
      if (!(await this.driver.waitFor(by.id(ID.phoneInput)))) throw new Error('手机号输入页未出现');
      // 选择中国区号 +86（底部弹出的国家列表，必要时在列表内滑动查找）
      await this.driver.click(by.id(ID.countryCode));
      const china = by.text('China');
      for (let i = 0; i < 6 && !(await this.driver.exists(china)); i++) {
        await this.driver.swipeInElement(by.id(ID.countryList), 'up');
        await sleep(500);
      }
      if (!(await this.driver.exists(china))) throw new Error('国家列表中未找到 China (+86)');
      await this.driver.click(china);
      await this.driver.input(by.id(ID.phoneInput), TEST_PHONE);
      // 输入后校验：确认内容真实写入
      const typedPhone = await this.driver.textOf(by.id(ID.phoneInput));
      if (!typedPhone.includes(TEST_PHONE)) throw new Error(`手机号输入失败，当前内容: "${typedPhone}"`);
      const since = new Date(); // 验证码查询的时间基线
      await this.driver.hideKeyboard(); // 收起软键盘，避免遮挡 Next 按钮
      await this.driver.click(by.id(ID.phoneNext)); // Next

      if (await this.driver.waitFor(by.id(ID.passwordInput), 8_000)) {
        // 该账号已设置密码 → 直接密码登录
        await this.driver.input(by.id(ID.passwordInput), TEST_PASSWORD);
        const typedPwd = await this.driver.textOf(by.id(ID.passwordInput));
        if (!typedPwd || typedPwd === 'Input password') throw new Error(`密码输入失败，当前内容: "${typedPwd}"`);
        await this.driver.hideKeyboard(); // 收起软键盘，避免遮挡 Login 按钮
        await this.driver.click(by.id(ID.passwordSubmit)); // Login
      } else {
        // 触发短信验证码 → 从 stats 库查询
        // TODO: 验证码页元素 ID 待实测补充（当前按常见命名探测）
        const codeInput = await this.detectCodeInput();
        if (!codeInput) throw new Error('出现验证码页但未识别到验证码输入框，请补充元素ID');
        this.log('触发短信验证码，开始查询 stats 库');
        const code = await this.querySmsCode(since);
        this.log(`获取到验证码: ${code}`);
        await this.driver.input(codeInput, code);
        await this.driver.hideKeyboard(); // 收起软键盘，避免遮挡提交按钮
        await this.driver.click(by.id(ID.passwordSubmit)); // 提交按钮同为 tv_confirm
      }
      await this.ensureState('logged-in', 30_000);
    });

    // ---------- 3. 判断是否登录成功 ----------
    await this.check('登录成功：我的页可抓取到用户ID', async () => {
      await this.enterMeTab(); // 登录后回到我的页（重复点击无副作用）
      if (!(await this.driver.waitFor(by.id(ID.meUid), 15_000))) {
        return { expect: '我的页展示数字用户ID', real: '未找到用户ID元素', pass: false };
      }
      const uid = (await this.driver.textOf(by.id(ID.meUid))).trim();
      this.log(`抓取到用户ID: ${uid}`);
      return { expect: '我的页展示数字用户ID', real: `ID=${uid}`, pass: /^\d+$/.test(uid) };
    });
  }

  // ---------- 通用工具 ----------

  /**
   * 进入"我的"tab，并等待登录态可知（logged-in / logged-out）。
   * 每轮先关弹窗（弹窗会遮挡底部 tab 的点击）；App 初始化期间 tab 点击可能被吞掉，故重试点击。
   */
  private async enterMeTab(timeoutMs = 15_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let last = 'unknown';
    while (Date.now() < deadline) {
      await this.closePopups();
      last = await this.currentState();
      if (last === 'logged-in' || last === 'logged-out') return last;
      if (await this.driver.exists(by.id(ID.tabMe))) await this.driver.click(by.id(ID.tabMe));
      await sleep(1_000);
    }
    throw new Error(`进入"我的"tab超时，当前状态: ${last}`);
  }

  /** 滚动页面直到元素出现（用于我的页/设置页的长列表） */
  private async scrollToVisible(locator: Locator, maxSwipes = 8): Promise<void> {
    for (let i = 0; i <= maxSwipes; i++) {
      if (await this.driver.exists(locator)) return;
      await this.driver.swipeUp();
      await sleep(600);
    }
    throw new Error(`滚动后仍未找到元素: ${locator[0]}=${locator[1]}`);
  }

  /** 探测验证码输入框（候选元素 ID，命中即返回） */
  private async detectCodeInput(): Promise<Locator | null> {
    const candidates = ['et_code', 'et_sms_code', 'et_verify_code', 'edit_code'].map(
      (id) => by.id(`${APP_PACKAGE}:id/${id}`) as Locator,
    );
    for (const c of candidates) {
      if (await this.driver.exists(c)) return c;
    }
    return null;
  }

  // ---------- 短信验证码查询（stats 库） ----------

  private get mysqlTest(): MySQLTestResource {
    return (this._mysql ??= new MySQLTestResource());
  }

  /**
   * 轮询查询最新短信验证码。
   * 表：sms_record_{yyyyMM}（stats 库），按 SCRIPT_ENV 区分：
   *   - test: MySQLTestResource 直连 lita_stats 库
   *   - prod: MySQLProdResource 经 API 代理查询 stats 库（只读）
   */
  private async querySmsCode(since: Date, timeoutMs = 30_000): Promise<string> {
    const ym = `${since.getFullYear()}${String(since.getMonth() + 1).padStart(2, '0')}`;
    const sql =
      `select code from sms_record_${ym} ` +
      `where phone_prefix='${PHONE_PREFIX}' and phone_number='${PHONE_PREFIX}${TEST_PHONE}' and type=1 ` +
      `and created_at > '${formatDateTime(since)}' order by created_at desc limit 1`;
    const deadline = Date.now() + timeoutMs;
    do {
      let code: string | null = null;
      if (this.env === 'prod') {
        const r = await MySQLProdResource.query('stats', sql);
        code = r.data.length ? String(r.data[0][0] ?? '') || null : null;
      } else {
        const rows = await this.mysqlTest.query(sql, 'lita_stats');
        code = rows.length ? String(rows[0].code ?? '') || null : null;
      }
      if (code) return code;
      await sleep(3_000);
    } while (Date.now() < deadline);
    throw new Error(`查询短信验证码超时（${timeoutMs}ms）: phone=${PHONE_PREFIX}${TEST_PHONE}`);
  }
}

await new SampleTest().execute();
