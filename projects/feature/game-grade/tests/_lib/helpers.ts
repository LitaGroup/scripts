/** 通用小工具 */

export function int(v: unknown): number {
  return Number(v);
}

/** 轮询直到 fn 返回真值（应对异步落库），超时返回最后一次结果 */
export async function pollUntil<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 5000, intervalMs = 200): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T = await fn();
  while (!ok(last) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await fn();
  }
  return last;
}

/** 北京时间可读格式（诊断输出用） */
export function bj(ms: number | unknown): string {
  if (ms === null || ms === undefined) return 'null';
  return new Date(Number(ms)).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

/** 短随机后缀（transNo 防跨轮重复） */
export function randSuffix(): string {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/** 按 id 差集取新增轮次 */
export function newRounds(before: { id: number }[], after: { id: number }[]): { id: number }[] {
  const ids = new Set(before.map((r) => r.id));
  return after.filter((r) => !ids.has(r.id));
}
