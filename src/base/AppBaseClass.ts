import { readFileSync } from 'node:fs';
import { CheckBaseClass, type CheckResult } from './CheckBaseClass.ts';
import { AppiumResource, sleep, type AppiumCapabilities, type Locator } from '../resources/AppiumResource.ts';

export type AppPlatform = 'android' | 'ios';
export type AppFlavor = 'lita' | 'lite';
export type ScriptEnv = 'test' | 'prod';

/**
 * 页面状态定义：APP 脚本基于状态驱动 —— 先检测状态，再操作与检查。
 */
export interface AppState {
  /** 状态名。约定 'logged-in' / 'logged-out' 用于登录态检测（ensureLoggedIn 依赖） */
  name: string;
  /** popup=弹窗状态（closePopups 自动循环关闭，可能有多层）；page=页面状态（默认） */
  kind?: 'page' | 'popup';
  /**
   * 该状态所在的预期 Activity（字符串支持精确/后缀匹配，兼容 '.ui.xxx' 与完整包名形式）。
   * 设置后检测逻辑为：先比对当前 Activity，不匹配则直接跳过，不再执行元素检测（detect）。
   */
  activity?: string | RegExp;
  /** 检测当前是否处于该状态（元素级判定；仅在 activity 匹配或未设置时执行） */
  detect: () => Promise<boolean>;
  /** popup: 关闭该弹窗；page: 从该状态向目标状态迁移的动作（ensureState 时调用） */
  handle?: () => Promise<void>;
}

export interface AppAccount {
  username: string;
  password: string;
  [key: string]: unknown;
}

/**
 * APP 脚本基类（基于 Appium，状态驱动）。
 *
 * - 会话生命周期由基类托管：run() 内先创建会话，再执行子类 runCase()，最后销毁会话。
 * - 环境变量：
 *   - SCRIPT_APPIUM_URL  Appium 服务地址，默认 http://127.0.0.1:4723/
 *   - SCRIPT_ENV         TEST（默认）/ PROD
 *   - SCRIPT_CONFIG      数据配置文件地址（JSON，提供账号密码等），默认为空
 * - 写法约定：通过 addState() 注册状态（登录态、弹窗、关键页面），
 *   用 closePopups() / ensureState() / ensureLoggedIn() 保证前置状态，再 act/check。
 */
export abstract class AppBaseClass extends CheckBaseClass {
  protected readonly driver = new AppiumResource();
  /** 运行环境：SCRIPT_ENV，默认 TEST */
  protected readonly env: ScriptEnv = (process.env.SCRIPT_ENV ?? 'TEST').toUpperCase() === 'PROD' ? 'prod' : 'test';

  private _states: AppState[] = [];
  private _scriptConfig: Record<string, unknown> | null = null;
  private failFastReason: string | null = null; // 非空 = 已发生致命失败，后续步骤全部跳过
  protected readonly platform: AppPlatform;
  protected readonly flavor: AppFlavor;
  /** 当前页面 Activity（状态检测前自动刷新；每次 act 完成后也会刷新并打印） */
  protected activity = '';

  constructor(platform: AppPlatform, flavor: AppFlavor) {
    super();
    this.platform = platform;
    this.flavor = flavor;
  }

  /** Appium capabilities（由子类按 platform/flavor/env 给出） */
  protected abstract capabilities(): AppiumCapabilities;

  /** 用例主体：此时会话已建立。先保证状态，再操作与检查 */
  protected abstract runCase(): Promise<void>;

  /** 登录流程：仅当 ensureLoggedIn() 判定为 'logged-out' 时调用，子类按需重写 */
  protected async login(_account: AppAccount): Promise<void> {
    throw new Error('未实现 login()：请重写该方法完成登录流程');
  }

  /** 'unknown' 状态时的恢复动作，默认返回上一页，子类可重写（如重启 App） */
  protected async onUnknownState(): Promise<void> {
    await this.driver.back();
  }

  /** 当前 App 的 appId（取自 capabilities 的 appPackage / bundleId） */
  protected appId(): string {
    const caps = this.capabilities();
    const id = caps['appium:appPackage'] ?? caps['appium:bundleId'];
    if (!id) throw new Error('capabilities() 需提供 appium:appPackage 或 appium:bundleId');
    return String(id);
  }

  /** 激活（打开）App */
  protected async activateApp(): Promise<void> {
    const key = this.platform === 'android' ? 'appId' : 'bundleId';
    await this.driver.execute('mobile: activateApp', [{ [key]: this.appId() }]);
  }

  /** 彻底关闭 App */
  protected async terminateApp(): Promise<void> {
    const key = this.platform === 'android' ? 'appId' : 'bundleId';
    await this.driver.execute('mobile: terminateApp', [{ [key]: this.appId() }]);
  }

  /** 每次 act 操作完成后，打印当前页面 Activity（便于观察页面流转） */
  private async logCurrentActivity(): Promise<void> {
    if (!this.driver.isActive) return;
    const activity = await this.refreshActivity();
    this.log(`当前 Activity: ${activity || '(未知)'}`);
  }

  async execute(): Promise<void> {
    this.total += 1; // 创建会话占用一个 act 步骤
    await super.execute();
  }

  protected async run(): Promise<void> {
    await this.act(`创建 Appium 会话 (${this.platform}/${this.flavor}/${this.env})`, async () => {
      await this.driver.createSession(this.capabilities());
      await this.activateApp(); // 确保 APP 在前台（异常退出/会话复用后可能在后台）
    });
    try {
      await this.runCase();
    } finally {
      try {
        await this.driver.deleteSession();
      } catch {
        // 会话可能已断开，忽略销毁异常
      }
    }
  }

  // ---------- 数据配置（SCRIPT_CONFIG） ----------

  protected get scriptConfig(): Record<string, unknown> {
    if (this._scriptConfig === null) {
      const path = process.env.SCRIPT_CONFIG;
      this._scriptConfig = path ? (JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>) : {};
    }
    return this._scriptConfig;
  }

  /** 读取账号：SCRIPT_CONFIG 文件中的 accounts.{name} = { username, password, ... } */
  protected account(name = 'default'): AppAccount {
    const accounts = (this.scriptConfig.accounts ?? {}) as Record<string, AppAccount>;
    const acc = accounts[name];
    if (!acc?.username || !acc?.password) {
      throw new Error(`未配置账号 accounts.${name}（username/password），请通过 SCRIPT_CONFIG 指定数据配置文件`);
    }
    return acc;
  }

  // ---------- 状态机 ----------

  /** 注册状态。检测顺序 = 注册顺序，建议：弹窗 → 登录态 → 其它页面 */
  protected addState(state: AppState): void {
    this._states.push(state);
  }

  /** 刷新并返回当前页面 Activity */
  protected async refreshActivity(): Promise<string> {
    if (this.driver.isActive) {
      this.activity = await this.driver.currentActivity();
    }
    return this.activity;
  }

  /** Activity 匹配：字符串支持精确或后缀匹配（兼容 '.ui.xxx' 与完整包名形式） */
  private matchActivity(cur: string, expect: string | RegExp): boolean {
    if (!cur) return false;
    return typeof expect === 'string' ? cur === expect || cur.endsWith(expect) : expect.test(cur);
  }

  /**
   * 判断当前是否进入了指定 Activity 页面（基于 activity 状态变量，判断前自动刷新）。
   * 字符串支持精确或后缀匹配（兼容 '.ui.xxx' 与完整包名形式）。
   */
  protected async isActivity(activity: string | RegExp): Promise<boolean> {
    const cur = await this.refreshActivity();
    return this.matchActivity(cur, activity);
  }

  /**
   * 断言元素存在；不存在则直接抛出异常（当前步骤失败）。
   * 用于输入/点击等操作前的前置校验。
   */
  protected async assertExists(locator: Locator, desc = ''): Promise<void> {
    if (!(await this.driver.exists(locator))) {
      throw new Error(`元素不存在${desc ? `: ${desc}` : ''}（${locator[0]}=${locator[1]}）`);
    }
  }

  /**
   * 等待元素出现（页面进入判定）；超时则报错（错误信息附带当前 Activity），
   * 并触发 fail-fast：后续所有 act/check 步骤自动 skip。
   */
  protected async waitForElement(locator: Locator, desc = '', timeoutMs = this.pageTimeoutMs): Promise<void> {
    if (!(await this.driver.waitFor(locator, timeoutMs))) {
      await this.refreshActivity();
      this.failFastReason = `等待元素超时（${timeoutMs}ms）: ${desc || `${locator[0]}=${locator[1]}`}，当前 Activity: ${this.activity || '(未知)'}`;
      throw new Error(this.failFastReason);
    }
  }

  /**
   * 等待进入指定 Activity（页面进入判定）；超时则报错（错误信息附带当前 Activity），
   * 并触发 fail-fast：后续所有 act/check 步骤自动 skip。
   */
  protected async waitForActivity(expect: string | RegExp, timeoutMs = this.pageTimeoutMs): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    do {
      if (await this.isActivity(expect)) return;
      await sleep(this.statePollMs);
    } while (Date.now() < deadline);
    this.failFastReason = `等待页面超时（${timeoutMs}ms）：期望 Activity ${String(expect)}，实际 ${this.activity || '(未知)'}`;
    throw new Error(this.failFastReason);
  }

  /**
   * 断言当前已进入指定 Activity 页面；不一致则抛出异常（当前步骤失败），
   * 并触发 fail-fast：后续所有 act/check 步骤自动 skip。
   */
  protected async assertActivity(expect: string | RegExp): Promise<void> {
    if (!(await this.isActivity(expect))) {
      this.failFastReason = `Activity 与预期不一致：期望 ${String(expect)}，实际 ${this.activity || '(未知)'}`;
      throw new Error(this.failFastReason);
    }
  }

  /**
   * act 步骤（APP 版）：
   * - 支持 opts.expectActivity：操作完成后校验当前 Activity，不一致则本步骤 fail 且后续步骤全部 skip
   * - 已发生致命失败（fail-fast）时，后续步骤不执行，直接标记 skip
   */
  protected async act(
    title: string,
    fn: () => unknown | Promise<unknown>,
    opts?: { expectActivity?: string | RegExp },
  ): Promise<void> {
    if (this.failFastReason) {
      await super.act(title, () => this.skip(`前序步骤失败，跳过（${this.failFastReason}）`));
      return;
    }
    await super.act(title, async () => {
      await fn();
      if (opts?.expectActivity !== undefined) await this.assertActivity(opts.expectActivity);
    });
    await this.logCurrentActivity();
  }

  /** check 步骤（APP 版）：fail-fast 后不执行，直接标记 skip */
  protected async check(title: string, fn: () => CheckResult | Promise<CheckResult>): Promise<void> {
    if (this.failFastReason) {
      await super.check(title, () => this.skip(`前序步骤失败，跳过（${this.failFastReason}）`));
      return;
    }
    await super.check(title, fn);
  }

  /**
   * 检测当前状态：按注册顺序取第一个 detect 命中的状态名，全部未命中返回 'unknown'。
   * 检测逻辑：先比对状态声明的 activity（如有），不匹配直接跳过；匹配后才执行元素检测。
   */
  protected async currentState(): Promise<string> {
    const cur = await this.refreshActivity();
    for (const s of this._states) {
      if (s.activity !== undefined && !this.matchActivity(cur, s.activity)) continue;
      try {
        if (await s.detect()) return s.name;
      } catch {
        // 单个状态检测失败不影响其它状态检测
      }
    }
    return 'unknown';
  }

  /** 循环关闭弹窗（可能有多层），返回关闭的弹窗数量 */
  protected async closePopups(maxRounds = 10): Promise<number> {
    const popups = this._states.filter((s) => s.kind === 'popup');
    let closed = 0;
    for (let round = 0; round < maxRounds; round++) {
      const cur = await this.refreshActivity();
      let hit = false;
      for (const p of popups) {
        if (p.activity !== undefined && !this.matchActivity(cur, p.activity)) continue;
        let detected = false;
        try {
          detected = await p.detect();
        } catch {
          // 忽略单个弹窗检测异常
        }
        if (!detected) continue;
        this.log(`检测到弹窗 [${p.name}]，执行关闭`);
        if (p.handle) await p.handle();
        closed++;
        hit = true;
        await sleep(this.statePollMs);
        break; // 可能还有下一层弹窗，重新从头检测
      }
      if (!hit) break;
    }
    return closed;
  }

  /** 'unknown' 状态宽限期：启动 splash 等场景先等待，持续 unknown 超过该时长才执行 onUnknownState() */
  protected unknownGraceMs = 5_000;

  /** 页面进入的等待时间上限（页面跳转/元素出现等待均不超过该值） */
  protected pageTimeoutMs = 3_000;

  /** 状态等待（ensureState/ensureAnyState/ensureLoggedIn）的默认超时；特殊情况可单独设置 */
  protected stateTimeoutMs = 5_000;

  /** 状态检测/轮询的默认间隔；特殊情况可单独设置 */
  protected statePollMs = 200;

  /**
   * 确保进入目标状态：每轮先 closePopups，再检测状态；命中目标即返回；
   * 'unknown' 时先宽限等待（splash/启动中），超过 unknownGraceMs 才调用 onUnknownState() 恢复；
   * 其它页面状态有 handle 时执行 handle 迁移。
   * 注意：目标状态需能被 currentState() 命中（注册顺序 = 检测顺序，登录态等前置状态可能遮蔽页面状态）。
   */
  protected async ensureState(name: string, timeoutMs = this.stateTimeoutMs): Promise<void> {
    await this.ensureAnyState([name], timeoutMs);
  }

  /** 确保进入任一目标状态，返回命中的状态名（适用于「首页/登录态」等并存场景） */
  protected async ensureAnyState(names: string[], timeoutMs = this.stateTimeoutMs): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let last = 'unknown';
    let unknownSince = 0; // 连续 unknown 的起始时间（0=当前非 unknown）
    while (Date.now() < deadline) {
      await this.closePopups();
      last = await this.currentState();
      if (names.includes(last)) return last;
      if (last === 'unknown') {
        if (unknownSince === 0) unknownSince = Date.now();
        if (Date.now() - unknownSince >= this.unknownGraceMs) {
          await this.onUnknownState();
          unknownSince = Date.now(); // 恢复动作后重新计宽限期
        }
      } else {
        unknownSince = 0;
        const st = this._states.find((s) => s.name === last);
        if (st?.handle) await st.handle();
        else await sleep(this.statePollMs);
      }
      await sleep(this.statePollMs);
    }
    throw new Error(`等待状态 [${names.join('|')}] 超时（${timeoutMs}ms），当前状态: ${last}`);
  }

  /** 确保已登录：依赖 'logged-in' / 'logged-out' 两个状态；未登录时使用 account() 执行 login() */
  protected async ensureLoggedIn(timeoutMs = this.stateTimeoutMs): Promise<void> {
    const state = await this.currentState();
    if (state === 'logged-in') return;
    if (state !== 'logged-out') {
      throw new Error(`无法确认登录状态（当前: ${state}），请检查 'logged-in'/'logged-out' 状态定义`);
    }
    const acc = this.account();
    this.log(`当前未登录，使用账号 ${acc.username} 执行登录`);
    await this.login(acc);
    await this.ensureState('logged-in', timeoutMs);
  }
}
