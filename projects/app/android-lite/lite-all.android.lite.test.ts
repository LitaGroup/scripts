/**
 * Android Lite 全量串联入口（lite-all）
 *
 * 按业务顺序依次执行各模块独立脚本（各自创建/销毁 Appium 会话，保留原脚本完整覆盖）：
 *   1. 登录（手机号密码）
 *   2. 首页（游戏 + 交友）
 *   3. 语音房
 *   4. 直播间
 *   5. 热门&关注（moment）
 *   6. 消息（会话列表 → 私聊 → 群聊）
 *   7. 我的
 *
 * 每个模块的 stdout 实时透传；本脚本再以 act/check 汇总模块级结果，最后输出总 done。
 *
 * 可选参数：
 *   --modules=login,home,voice,live,moment,im,me   只跑指定模块（逗号分隔）
 *   --continue-on-fail                              某模块 fail 后继续后续模块（默认 fail-fast）
 *
 * 运行：
 *   SCRIPT_APPIUM_URL=http://127.0.0.1:4723/ SCRIPT_ENV=TEST \
 *     SCRIPT_CONFIG=config.app.json \
 *     node projects/app/android-lite/lite-all.android.lite.test.ts
 *
 * 说明：
 *   - 首页 / 热门&关注 / 我的 默认用 config.home.android.lite.json（含 accounts.game/friend）
 *   - 登录 / 语音房 / 直播 / 消息 默认用 SCRIPT_CONFIG 或 config.app.json
 *   - 单模块调试仍用原 `*.android.lite.test.ts`
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CheckBaseClass } from '../../../src/base/CheckBaseClass.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');

type ModuleId = 'login' | 'home' | 'voice' | 'live' | 'moment' | 'im' | 'me';

interface ModuleSpec {
  id: ModuleId;
  title: string;
  /** 相对 android-lite/ 的脚本；im 为多脚本 */
  scripts: string[];
  /** 默认配置文件（相对仓库根）；空则沿用进程 SCRIPT_CONFIG */
  defaultConfig?: string;
}

const ALL_MODULES: ModuleSpec[] = [
  {
    id: 'login',
    title: '① 登录（手机号密码）',
    scripts: ['login-phone-password.android.lite.test.ts'],
    defaultConfig: 'config.app.json',
  },
  {
    id: 'home',
    title: '② 首页（游戏 + 交友）',
    scripts: ['home.android.lite.test.ts'],
    defaultConfig: 'config.home.android.lite.json',
  },
  {
    id: 'voice',
    title: '③ 语音房',
    scripts: ['voice-room.android.lite.test.ts'],
    defaultConfig: 'config.app.json',
  },
  {
    id: 'live',
    title: '④ 直播间',
    scripts: ['live.android.lite.test.ts'],
    defaultConfig: 'config.app.json',
  },
  {
    id: 'moment',
    title: '⑤ 热门&关注',
    scripts: ['moment.android.lite.test.ts'],
    defaultConfig: 'config.home.android.lite.json',
  },
  {
    id: 'im',
    title: '⑥ 消息（列表 / 私聊 / 群聊）',
    scripts: [
      'im-conversation-list.android.lite.test.ts',
      'im-private-chat.android.lite.test.ts',
      'im-group-chat.android.lite.test.ts',
    ],
    defaultConfig: 'config.app.json',
  },
  {
    id: 'me',
    title: '⑦ 我的',
    scripts: ['me.android.lite.test.ts'],
    defaultConfig: 'config.home.android.lite.json',
  },
];

function parseModulesArg(): ModuleId[] | null {
  const raw = process.argv.find((a) => a.startsWith('--modules='));
  if (!raw) return null;
  const ids = raw
    .slice('--modules='.length)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as ModuleId[];
  const known = new Set(ALL_MODULES.map((m) => m.id));
  for (const id of ids) {
    if (!known.has(id)) {
      throw new Error(`未知模块 "${id}"，可选: ${[...known].join(',')}`);
    }
  }
  return ids;
}

function continueOnFail(): boolean {
  return process.argv.includes('--continue-on-fail');
}

interface ScriptResult {
  script: string;
  exitCode: number;
  doneStatus: 'success' | 'fail' | 'unknown';
  donePayload: Record<string, unknown> | null;
}

function resolveConfigPath(defaultConfig?: string): string | undefined {
  const fromEnv = (process.env.SCRIPT_CONFIG || '').trim();
  if (fromEnv) {
    const abs = resolve(process.cwd(), fromEnv);
    if (existsSync(abs)) return abs;
  }
  if (defaultConfig) {
    const abs = resolve(REPO_ROOT, defaultConfig);
    if (existsSync(abs)) return abs;
  }
  return fromEnv || undefined;
}

/** 跑单个 .test.ts，透传 stdout/stderr，解析最后一条 [done] */
function runScript(scriptRel: string, configPath?: string): Promise<ScriptResult> {
  const scriptAbs = join(HERE, scriptRel);
  if (!existsSync(scriptAbs)) {
    return Promise.resolve({
      script: scriptRel,
      exitCode: 1,
      doneStatus: 'fail',
      donePayload: { message: `脚本不存在: ${scriptAbs}` },
    });
  }

  const env = { ...process.env };
  if (configPath) env.SCRIPT_CONFIG = configPath;

  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptAbs, ...process.argv.slice(2).filter((a) => !a.startsWith('--modules') && a !== '--continue-on-fail')], {
      cwd: REPO_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let lastDone: Record<string, unknown> | null = null;
    let doneStatus: 'success' | 'fail' | 'unknown' = 'unknown';

    const onChunk = (buf: Buffer, stream: NodeJS.WriteStream) => {
      const text = buf.toString('utf8');
      stream.write(text);
      for (const line of text.split(/\r?\n/)) {
        if (!line.startsWith('[done] ')) continue;
        try {
          const payload = JSON.parse(line.slice('[done] '.length)) as Record<string, unknown>;
          lastDone = payload;
          const st = String(payload.status ?? '');
          doneStatus = st === 'success' || st === 'fail' ? st : 'unknown';
        } catch {
          // ignore parse errors
        }
      }
    };

    child.stdout?.on('data', (b: Buffer) => onChunk(b, process.stdout));
    child.stderr?.on('data', (b: Buffer) => onChunk(b, process.stderr));

    child.on('error', (err) => {
      resolvePromise({
        script: scriptRel,
        exitCode: 1,
        doneStatus: 'fail',
        donePayload: { message: err.message },
      });
    });

    child.on('close', (code) => {
      const exitCode = code ?? 1;
      if (doneStatus === 'unknown') {
        doneStatus = exitCode === 0 ? 'success' : 'fail';
      }
      resolvePromise({
        script: scriptRel,
        exitCode,
        doneStatus,
        donePayload: lastDone,
      });
    });
  });
}

class LiteAllAndroidLiteSuite extends CheckBaseClass {
  private readonly modules: ModuleSpec[];
  private readonly keepGoing: boolean;

  constructor() {
    super();
    const filter = parseModulesArg();
    this.modules = filter
      ? ALL_MODULES.filter((m) => filter.includes(m.id))
      : ALL_MODULES;
    if (this.modules.length === 0) {
      throw new Error('未选中任何模块');
    }
    this.keepGoing = continueOnFail();
    // 每个模块 1 个 act + 1 个 check
    this.total = this.modules.length * 2;
  }

  protected async run(): Promise<void> {
    this.log(
      `lite-all 模块顺序: ${this.modules.map((m) => m.id).join(' → ')}` +
        `；continue-on-fail=${this.keepGoing}`,
    );

    for (const mod of this.modules) {
      const configPath = resolveConfigPath(mod.defaultConfig);
      this.log(
        `── 开始模块 ${mod.id}: ${mod.title}（scripts=${mod.scripts.join(', ')}` +
          ` config=${configPath ?? '(沿用环境)'}）──`,
      );

      const results: ScriptResult[] = [];
      let moduleFailed = false;
      let failMessage = '';

      await this.act(mod.title, async () => {
        for (const script of mod.scripts) {
          this.log(`▶ 运行 ${script}`);
          const r = await runScript(script, configPath);
          results.push(r);
          const ok = r.doneStatus === 'success' && r.exitCode === 0;
          if (!ok) {
            moduleFailed = true;
            const msg =
              (r.donePayload?.message as string) ||
              `exit=${r.exitCode} done=${r.doneStatus}`;
            failMessage = `${script}: ${msg}`;
            this.log(`✖ ${script} 未通过: ${failMessage}`);
            if (!this.keepGoing) {
              throw new Error(failMessage);
            }
          } else {
            this.log(`✔ ${script} 完成`);
          }
        }
        if (moduleFailed && this.keepGoing) {
          throw new Error(failMessage || '模块内有脚本失败');
        }
      });

      await this.check(`${mod.title} — 模块结果`, async () => {
        const failed = results.filter((r) => !(r.doneStatus === 'success' && r.exitCode === 0));
        const summary = results
          .map((r) => {
            const s = r.donePayload?.status ?? r.doneStatus;
            const fail = r.donePayload?.fail ?? '?';
            const skip = r.donePayload?.skip ?? '?';
            return `${r.script.split('/').pop()}=${s}(fail=${fail},skip=${skip})`;
          })
          .join('; ');
        return {
          expect: '模块内全部脚本 done.status=success',
          real: summary || '(无脚本结果)',
          pass: failed.length === 0,
          message: failed.length ? failMessage : undefined,
        };
      });

      if (moduleFailed && !this.keepGoing) {
        this.log('fail-fast：停止后续模块');
        break;
      }
    }
  }
}

await new LiteAllAndroidLiteSuite().execute();
