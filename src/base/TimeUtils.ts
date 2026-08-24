const LOCALE_TZ: Record<string, number> = { in: 7, vi: 7, ph: 8, ko: 9, ar: 0 };

function formatOffset(offsetH: number): string {
  const sign = offsetH < 0 ? '-' : '+';
  const h = Math.abs(offsetH);
  return `${sign}${String(h).padStart(2, '0')}:00`;
}

/** 解析北京时间字符串（"2026-08-17 14:00:00"）为毫秒时间戳 */
export function beijingMs(dtStr: string): number {
  return Date.parse(dtStr.replace(' ', 'T') + '+08:00');
}

/** 解析 ISO 时间字符串（如 2026-08-17T14:00:00+08:00）为毫秒时间戳 */
export function isoMs(ts: string): number {
  return Date.parse(ts);
}

/** 返回该 locale 当日 00:00:00 的毫秒时间戳（dayStr 形如 20260817） */
export function localMs(locale: string, dayStr: string): number {
  const offset = LOCALE_TZ[locale] ?? 8;
  const y = dayStr.slice(0, 4);
  const m = dayStr.slice(4, 6);
  const d = dayStr.slice(6, 8);
  return Date.parse(`${y}-${m}-${d}T00:00:00${formatOffset(offset)}`);
}

/** 返回该 locale 当日 23:59:59 的毫秒时间戳 */
export function endOfDayMs(locale: string, dayStr: string): number {
  return localMs(locale, dayStr) + 24 * 3600 * 1000 - 1000;
}

/** 返回该 locale 的任意本地时间毫秒时间戳（dtStr 形如 "2026-08-19 23:30:00"） */
export function localAtMs(locale: string, dtStr: string): number {
  const offset = LOCALE_TZ[locale] ?? 8;
  return Date.parse(dtStr.replace(' ', 'T') + formatOffset(offset));
}

/** ISO 8601 duration 表达式（P5D/P125D）转秒数 */
export function expireSeconds(expr: string): number {
  const e = (expr ?? '').toUpperCase().replace(/^P/, '');
  if (e.endsWith('D')) return parseInt(e, 10) * 86400;
  if (e.endsWith('H')) return parseInt(e, 10) * 3600;
  if (e.endsWith('M')) return parseInt(e, 10) * 60;
  if (e.endsWith('S')) return parseInt(e, 10);
  return 0;
}
