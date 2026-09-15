/**
 * Android 多语言文案：用 strings.xml 的 name（key）解析当前/各语言文案，避免脚本写死各语言文本。
 *
 * 优先 Appium mobile:getStrings（安装包内当前语言）；
 * 失败时回退解析 sibling lita-lite-android 的 res/values(-xx)/strings.xml（该 key 下全部语言）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppBaseClass } from '../../../../src/base/AppBaseClass.ts';

type StringMap = Record<string, string>;

const getStringsCache = new WeakMap<object, StringMap>();
let xmlAllLocalesCache: Map<string, string[]> | null = null;

function normalizeCopy(s: string): string {
  return s
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/%(\d+\$)?[sdif]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchableForms(raw: string): string[] {
  const full = normalizeCopy(raw);
  const out = new Set<string>();
  if (full) out.add(full);
  // 带格式参数的文案：也用去掉占位后的片段做 contains
  const noFmt = raw.replace(/%(\d+\$)?[sdif]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noFmt && noFmt !== full) out.add(normalizeCopy(noFmt));
  return [...out].filter((t) => t.length >= 2);
}

function defaultAndroidResDir(): string {
  const fromEnv = process.env.LITA_ANDROID_RES?.trim();
  if (fromEnv) return fromEnv;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../../../../lita-lite-android/app/src/main/res');
}

function loadXmlAllLocales(resDir: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!fs.existsSync(resDir)) return map;
  const dirs = fs
    .readdirSync(resDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('values'))
    .map((d) => path.join(resDir, d.name));
  for (const dir of dirs) {
    const file = path.join(dir, 'strings.xml');
    if (!fs.existsSync(file)) continue;
    let xml = '';
    try {
      xml = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const re = /<string\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const key = m[1];
      // 跳过带 translatable="false" 且空的；保留有内容的
      let body = m[2]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<\/?[^>]+>/g, '')
        .trim();
      if (!body) continue;
      const list = map.get(key) ?? [];
      for (const form of matchableForms(body)) {
        if (!list.includes(form)) list.push(form);
      }
      map.set(key, list);
    }
  }
  return map;
}

function xmlStringsForKey(key: string): string[] {
  if (!xmlAllLocalesCache) {
    xmlAllLocalesCache = loadXmlAllLocales(defaultAndroidResDir());
  }
  return xmlAllLocalesCache.get(key) ?? [];
}

async function loadGetStrings(app: AppBaseClass): Promise<StringMap> {
  const driver = app['driver'] as object;
  const cached = getStringsCache.get(driver);
  if (cached) return cached;
  let map: StringMap = {};
  try {
    const raw = await app['driver'].execute('mobile: getStrings', [{}]);
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      map = raw as StringMap;
    }
  } catch {
    try {
      const raw = await app['driver'].execute('mobile:getStrings', []);
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        map = raw as StringMap;
      }
    } catch {
      map = {};
    }
  }
  getStringsCache.set(driver, map);
  return map;
}

/** 按 key 解析文案（当前语言优先；再合并 XML 全语言兜底） */
export async function resolveAndroidString(app: AppBaseClass, key: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    for (const form of matchableForms(raw)) {
      if (seen.has(form)) continue;
      seen.add(form);
      out.push(form);
    }
  };

  const live = await loadGetStrings(app);
  if (live[key]) push(live[key]);
  for (const v of xmlStringsForKey(key)) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export async function resolveAndroidStrings(app: AppBaseClass, keys: string[]): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    for (const t of await resolveAndroidString(app, key)) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** haystack（如 page source）是否包含任一 key 对应文案 */
export async function sourceHasAndroidStringKeys(
  app: AppBaseClass,
  keys: string[],
  haystack?: string,
): Promise<boolean> {
  const texts = await resolveAndroidStrings(app, keys);
  if (texts.length === 0) return false;
  let src = haystack;
  if (src == null) {
    try {
      src = await app['driver'].source();
    } catch {
      return false;
    }
  }
  for (const t of texts) {
    if (t && src.includes(t)) return true;
  }
  return false;
}

/** 用 key 解析出的文案构造 text / textContains locator 候选（调用方依次 exists） */
export async function androidStringTextCandidates(
  app: AppBaseClass,
  key: string,
): Promise<string[]> {
  return resolveAndroidString(app, key);
}
