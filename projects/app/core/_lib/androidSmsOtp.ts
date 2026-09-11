/**
 * Android Lite 短信 OTP：从 stats 库 sms_record_{yyyyMM} 查真实验证码。
 * 默认经 MySQLProdResource（PROD API + config userToken）只读查询（与 home.android.lite 一致）。
 * SCRIPT_ENV=test 且已安装 mysql2 时，可尝试直连 lita_stats，失败则回退 PROD API。
 *
 * 用法：确保 SCRIPT_CONFIG / LITA_CONFIG_PATH 指向含 userToken 的配置。
 */
import { MySQLProdResource } from '../../../../src/resources/MySQLProdResource.ts';
import { sleep } from '../../../../src/resources/AppiumResource.ts';

/** 把 SCRIPT_CONFIG 对齐到 LITA_CONFIG_PATH，便于 loadConfig() 读到同一份 userToken */
export function alignLiteConfigPath(): void {
  if (process.env.SCRIPT_CONFIG && !process.env.LITA_CONFIG_PATH) {
    process.env.LITA_CONFIG_PATH = process.env.SCRIPT_CONFIG;
  }
}

/** 格式化为 DB 比较用的本地时间字符串（yyyy-MM-dd HH:mm:ss） */
export function formatDateTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export interface QuerySmsCodeOptions {
  since: Date;
  phone: string;
  /** 国家前缀，如 86；会写入 phone_prefix / phone_number */
  countryCode: string;
  timeoutMs?: number;
  /**
   * prod=API 代理 stats（默认，冒烟推荐）；
   * test=尝试直连 lita_stats，失败回退 prod。
   */
  env?: 'test' | 'prod';
}

async function queryViaProd(sql: string): Promise<string | null> {
  const r = await MySQLProdResource.query('stats', sql);
  return r.data.length ? String(r.data[0][0] ?? '').trim() || null : null;
}

async function queryViaTest(sql: string): Promise<string | null> {
  try {
    const { MySQLTestResource } = await import('../../../../src/resources/MySQLTestResource.ts');
    const rows = await new MySQLTestResource().query(sql, 'lita_stats');
    return rows.length ? String(rows[0].code ?? '').trim() || null : null;
  } catch {
    return null;
  }
}

/**
 * 轮询查询最新短信验证码（type=1）。
 * phone_number = countryCode + phone（如 8618810242906）。
 */
export async function querySmsCode(opts: QuerySmsCodeOptions): Promise<string> {
  const phone = opts.phone.replace(/\D/g, '');
  const prefix = opts.countryCode.replace(/^\+/, '').replace(/\D/g, '');
  if (!phone || !prefix) {
    throw new Error(`querySmsCode: 无效 phone/countryCode（phone=${opts.phone}, countryCode=${opts.countryCode}）`);
  }
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const env =
    opts.env ?? ((process.env.SCRIPT_ENV ?? 'TEST').toUpperCase() === 'PROD' ? 'prod' : 'test');
  const ym = `${opts.since.getFullYear()}${String(opts.since.getMonth() + 1).padStart(2, '0')}`;
  const sql =
    `select code from sms_record_${ym} ` +
    `where phone_prefix='${prefix}' and phone_number='${prefix}${phone}' and type=1 ` +
    `and created_at > '${formatDateTime(opts.since)}' order by created_at desc limit 1`;

  const deadline = Date.now() + timeoutMs;
  do {
    let code: string | null = null;
    if (env === 'test') {
      code = await queryViaTest(sql);
      if (!code) code = await queryViaProd(sql);
    } else {
      code = await queryViaProd(sql);
    }
    if (code) return code;
    await sleep(3_000);
  } while (Date.now() < deadline);
  throw new Error(`查询短信验证码超时（${timeoutMs}ms）: phone=${prefix}${phone}`);
}

/**
 * 解析 OTP：SCRIPT_OTP > account.smsCode > 查库。
 * 查库需 phone + countryCode + since；默认走 PROD API（与 home 一致）。
 */
export async function resolveAndroidOtp(opts: {
  phone?: string;
  countryCode?: string;
  since?: Date;
  smsCode?: string;
  log?: (msg: string) => void;
}): Promise<string> {
  const fromEnv = (process.env.SCRIPT_OTP ?? '').trim();
  if (fromEnv) {
    opts.log?.(`使用 SCRIPT_OTP=${fromEnv}`);
    return fromEnv;
  }
  const fromAccount = String(opts.smsCode ?? '').trim();
  if (fromAccount) {
    opts.log?.(`使用 accounts.smsCode=${fromAccount}`);
    return fromAccount;
  }
  const phone = String(opts.phone ?? '').replace(/\D/g, '');
  const countryCode = String(opts.countryCode ?? '86').replace(/^\+/, '').replace(/\D/g, '') || '86';
  if (!phone) {
    throw new Error('缺少验证码：请设 SCRIPT_OTP，或配置 accounts.smsCode，或提供 phone 以便查库');
  }
  const since = opts.since ?? new Date(Date.now() - 5 * 60_000);
  opts.log?.(`从 stats 库查短信验证码（phone=${countryCode}${phone}）`);
  const code = await querySmsCode({ since, phone, countryCode, env: 'prod' });
  opts.log?.(`获取到验证码: ${code}`);
  return code;
}
