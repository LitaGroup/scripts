/**
 * Android Lite 全量串联（单 Appium 会话，模拟真实用户连贯操作）
 *
 * 顺序：
 *   1. 登录一次（手机号密码）
 *   2. 首页（游戏段；不登出、不切号）
 *   3. 语音房 → 结束退出回主页
 *   4. 直播间
 *   5. 热门&关注
 *   6. 消息（列表 → 私聊 → 群聊）
 *   7. 我的（末尾登出）
 *
 * 全程同一会话、同一登录态：子模块只跑 runCase，禁止再 logout / 重建会话。
 *
 * 可选：
 *   --modules=login,home,voice,live,moment,im,me
 *   --continue-on-fail
 *
 * 运行：
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
 *     SCRIPT_CONFIG=config.app.json \
 *     node projects/app/android-lite/lite-all.android.lite.test.ts
 */
import { AppBaseClass, type AppAccount } from '../../../src/base/AppBaseClass.ts';
import {
  androidLiteCapabilities,
  assertAndroidLoggedInMe,
  ensureAndroidLoggedIn,
  isAndroidLoggedInMe,
  loginWithPhonePassword,
  registerAndroidLoginStates,
} from '../core/_lib/androidLoginFlow.ts';
import { ANDROID_LOC as LOC } from '../core/_lib/androidLocators.ts';
import { HomeCheck } from './home.android.lite.test.ts';
import { VoiceRoomTest } from './voice-room.android.lite.test.ts';
import { LiveAndroidLiteTest } from './live.android.lite.test.ts';
import { MomentPublishCheck } from './moment.android.lite.test.ts';
import { AndroidImConversationListSmoke } from './im-conversation-list.android.lite.test.ts';
import { AndroidImPrivateChatSmoke } from './im-private-chat.android.lite.test.ts';
import { AndroidImGroupChatSmoke } from './im-group-chat.android.lite.test.ts';
import { MeCheck } from './me.android.lite.test.ts';

process.env.SCRIPT_LITE_ALL = '1';

/**
 * 在已有会话上跑子模块 runCase（内联，避免平台不同步独立 helper 文件）
 */
async function runAttachedModule(
  parent: AppBaseClass,
  label: string,
  createModule: () => AppBaseClass,
): Promise<void> {
  const mod = createModule();

  Object.defineProperty(mod, 'driver', {
    configurable: true,
    enumerable: true,
    get: () => parent['driver'],
  });

  Object.defineProperty(mod, 'failFastReason', {
    configurable: true,
    enumerable: true,
    get: () => (parent as unknown as { failFastReason: string | null }).failFastReason,
    set: (v: string | null) => {
      (parent as unknown as { failFastReason: string | null }).failFastReason = v;
    },
  });

  const p = parent as unknown as {
    act: (title: string, fn: () => unknown | Promise<unknown>) => Promise<void>;
    check: (
      title: string,
      fn: () =>
        | { expect: string; real: string; pass?: boolean; message?: string }
        | Promise<{ expect: string; real: string; pass?: boolean; message?: string }>,
    ) => Promise<void>;
    log: (msg: string) => void;
    skip: (msg?: string) => never;
  };

  (mod as unknown as { act: typeof p.act }).act = (title, fn) => p.act(`${label} · ${title}`, fn);
  (mod as unknown as { check: typeof p.check }).check = (title, fn) => p.check(`${label} · ${title}`, fn);
  (mod as unknown as { log: typeof p.log }).log = (msg) => p.log(`[${label}] ${msg}`);
  (mod as unknown as { skip: typeof p.skip }).skip = (msg) => p.skip(msg);

  parent['log'](`── 开始模块 ${label}（同会话，保持登录）──`);
  await (mod as unknown as { runCase: () => Promise<void> }).runCase();
  parent['log'](`── 结束模块 ${label} ──`);
}

type ModuleId = 'login' | 'home' | 'voice' | 'live' | 'moment' | 'im' | 'me';

function parseModulesArg(): Set<ModuleId> | null {
  const raw = process.argv.find((a) => a.startsWith('--modules='));
  if (!raw) return null;
  const ids = raw
    .slice('--modules='.length)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as ModuleId[];
  const known: ModuleId[] = ['login', 'home', 'voice', 'live', 'moment', 'im', 'me'];
  for (const id of ids) {
    if (!known.includes(id)) throw new Error(`未知模块 "${id}"，可选: ${known.join(',')}`);
  }
  return new Set(ids);
}

function continueOnFail(): boolean {
  return process.argv.includes('--continue-on-fail');
}

class LiteAllAndroidLiteTest extends AppBaseClass {
  private readonly enabled: Set<ModuleId>;
  private readonly keepGoing: boolean;

  constructor() {
    super('android', 'lite');
    this.enabled = parseModulesArg() ?? new Set(['login', 'home', 'voice', 'live', 'moment', 'im', 'me']);
    this.keepGoing = continueOnFail();
    // 各模块步骤很多，给足总量；实际以 act/check 计数为准
    this.total = 220;
    registerAndroidLoginStates(this);
  }

  protected capabilities() {
    return androidLiteCapabilities();
  }

  protected async login(account: AppAccount): Promise<void> {
    await loginWithPhonePassword(this, account);
  }

  private want(id: ModuleId): boolean {
    return this.enabled.has(id);
  }

  /** 跑一块模块；失败时按 fail-fast / continue-on-fail 处理 */
  private async section(id: ModuleId, title: string, fn: () => Promise<void>): Promise<boolean> {
    if (!this.want(id)) {
      this.log(`跳过模块 ${id}（--modules 未包含）`);
      return true;
    }
    const counters = this as unknown as {
      failCount: number;
      failFastReason: string | null;
    };
    const failsBefore = counters.failCount;
    try {
      await fn();
      const failed =
        counters.failCount > failsBefore || !!counters.failFastReason;
      if (failed) {
        this.log(
          `模块 ${title} 未通过（fail+=${counters.failCount - failsBefore}` +
            `${counters.failFastReason ? `，fail-fast=${counters.failFastReason}` : ''}）`,
        );
        if (this.keepGoing) counters.failFastReason = null;
        return false;
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log(`模块 ${title} 异常: ${msg}`);
      if (this.keepGoing) {
        counters.failFastReason = null;
        return false;
      }
      throw e;
    }
  }

  /** 模块失败且非 continue-on-fail 时停止整条链路 */
  private async runOrStop(id: ModuleId, title: string, fn: () => Promise<void>): Promise<void> {
    const ok = await this.section(id, title, fn);
    if (!ok && !this.keepGoing) {
      throw new Error(`模块 ${title} 失败，lite-all 中止（去掉 --continue-on-fail 即为 fail-fast）`);
    }
  }

  protected async runCase(): Promise<void> {
    this.log(
      `lite-all 单会话串联: ${[...this.enabled].join(' → ')}；continue-on-fail=${this.keepGoing}`,
    );

    // ---------- 1. 登录一次 ----------
    await this.runOrStop('login', '① 登录', async () => {
      await this.act('启动后关闭弹窗', async () => {
        const n = await this.closePopups();
        this.log(`关闭弹窗 ${n} 个`);
      });
      await this.act('手机号密码登录（全流程只登录一次）', async () => {
        await ensureAndroidLoggedIn(this, this.account());
        await assertAndroidLoggedInMe(this, 20_000);
      });
      await this.check('已登录「我的」页', async () => {
        const pass = await isAndroidLoggedInMe(this);
        let uid = '';
        if (await this.driver.exists(LOC.meUid)) {
          uid = (await this.driver.textOf(LOC.meUid)).trim();
        }
        return {
          expect: '已登录',
          real: uid ? `uid=${uid}` : pass ? 'mePage' : 'missing',
          pass,
        };
      });
    });

    // ---------- 2. 首页（串联模式：不 logout） ----------
    await this.runOrStop('home', '② 首页', async () => {
      await runAttachedModule(this, '首页', () => new HomeCheck());
    });

    // ---------- 3. 语音房（结束会退房回主页） ----------
    await this.runOrStop('voice', '③ 语音房', async () => {
      await runAttachedModule(this, '语音房', () => new VoiceRoomTest());
    });

    // ---------- 4. 直播 ----------
    await this.runOrStop('live', '④ 直播间', async () => {
      await runAttachedModule(this, '直播间', () => new LiveAndroidLiteTest());
    });

    // ---------- 5. 热门&关注 ----------
    await this.runOrStop('moment', '⑤ 热门&关注', async () => {
      await runAttachedModule(this, '热门&关注', () => new MomentPublishCheck());
    });

    // ---------- 6. 消息 ----------
    await this.runOrStop('im', '⑥ 消息', async () => {
      await runAttachedModule(this, '消息-列表', () => new AndroidImConversationListSmoke());
      await runAttachedModule(this, '消息-私聊', () => new AndroidImPrivateChatSmoke());
      await runAttachedModule(this, '消息-群聊', () => new AndroidImGroupChatSmoke());
    });

    // ---------- 7. 我的（末尾登出） ----------
    await this.runOrStop('me', '⑦ 我的', async () => {
      await runAttachedModule(this, '我的', () => new MeCheck());
    });
  }
}

await new LiteAllAndroidLiteTest().execute();
