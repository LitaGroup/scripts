/**
 * lite-all 单会话串联：把子模块挂到父脚本的 Appium 会话与 act/check 输出上。
 * 子模块只跑 runCase()，不 createSession / deleteSession。
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AppBaseClass } from '../../../src/base/AppBaseClass.ts';

/** 当前文件是否被 node 直接执行（而非被 import） */
export function isExecutedAsMain(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return metaUrl === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
}

export function isLiteAllChain(): boolean {
  return (process.env.SCRIPT_LITE_ALL ?? '').trim() === '1';
}

/**
 * 在已有会话上跑子模块 runCase：共享 driver，步骤计入父脚本。
 */
export async function runAttachedModule(
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

  // fail-fast 与父脚本同步，避免子模块内失败后仍继续点点点
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
