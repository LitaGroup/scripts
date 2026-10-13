/** 失败请求排查工具：构建可复现的 curl 命令并附加到错误信息 */

const SENSITIVE_HEADERS = new Set(['l-user-token', 'accesstoken', 'access_token', 'authorization', 'cookie']);

/** 单引号安全包裹（shell） */
function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** 构建可复现的 curl 命令；敏感头（token/authorization/cookie）值脱敏为 *** */
export function buildCurl(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): string {
  const parts = [`curl -sS -m ${Math.max(1, Math.ceil(timeoutMs / 1000))}`, `-X ${method}`, shellQuote(url)];
  for (const [name, value] of Object.entries(headers)) {
    const v = SENSITIVE_HEADERS.has(name.toLowerCase()) ? '***' : value;
    parts.push(`-H ${shellQuote(`${name}: ${v}`)}`);
  }
  if (body !== undefined) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    parts.push(`-d ${shellQuote(payload)}`);
  }
  return parts.join(' ');
}

/** 将 curl 附加到错误信息（避免重复追加） */
export function attachCurl(e: unknown, curl: string): Error {
  const err = e instanceof Error ? e : new Error(String(e));
  if (err.message.includes('curl:')) return err;
  return new Error(`${err.message} | curl: ${curl}`);
}
