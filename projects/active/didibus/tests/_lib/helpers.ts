/** 通用小工具 */

export function int(v: unknown): number {
  return Number(v);
}

/** 轮询直到 fn 返回真值（应对异步落库，如账户变动日志），超时返回最后一次结果 */
export async function pollUntil<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 5000, intervalMs = 200): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = await fn();
  while (!ok(last) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await fn();
  }
  return last;
}

/** 断言调用抛错且错误信息包含 match；返回错误信息 */
export async function expectError(fn: () => Promise<unknown>, match?: string): Promise<string> {
  try {
    await fn();
  } catch (e) {
    const msg = (e as Error).message;
    if (match !== undefined && !msg.includes(match)) {
      throw new Error(`错误信息不匹配：期望包含「${match}」，实际「${msg}」`);
    }
    return msg;
  }
  throw new Error(`期望报错${match ? `（包含「${match}」）` : ''}，但调用成功`);
}

export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
