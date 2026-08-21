import type { PkFamilyService } from './PkFamilyService.ts';
import type { MysqlRow } from '../resources/MySQLTestResource.ts';

export const LITA_TEAM_SENDER = 2;
export const BTN_KEY = 'annual_festival25_notification28';
export const GENERIC_CONTENT = 'New Message from Lita Team';
export const LITA_TEAM_SHEET = 'Activity$pk-260817';

export const TITLE_FAMILY_PASS = 'annual_festival25_family_litateam_title_1';
export const TITLE_FAMILY_FINAL = 'annual_festival25_family_litateam_title_2';
export const CONTENT_FAMILY_PASS = 'annual_festival25_family_litateam_text_1';
export const CONTENT_FAMILY_FINAL_TOP1 = 'annual_festival25_family_litateam_text_2';
export const CONTENT_FAMILY_FINAL_TOP23 = 'annual_festival25_family_litateam_text_3';

export type MessageParams = Record<number, number | string>;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 翻译模板转正则：{n} 占位符有值则精确匹配，否则 .*? 通配；%n%s 通配；<br/> 视为空白 */
export function templateToRegex(template: string, params: MessageParams = {}): RegExp {
  const out: string[] = [];
  let i = 0;
  const n = template.length;
  while (i < n) {
    const m = /^\{(\d+)\}/.exec(template.slice(i));
    if (m) {
      const idx = Number(m[1]);
      const val = params[idx];
      out.push(val !== undefined && val !== null ? escapeRegExp(String(val)) : '.*?');
      i += m[0].length;
      continue;
    }
    const m2 = /^%\d+%s/.exec(template.slice(i));
    if (m2) {
      out.push('.*?');
      i += m2[0].length;
      continue;
    }
    const m3 = /^<br\s*\/?>/i.exec(template.slice(i));
    if (m3) {
      out.push('\\s*');
      i += m3[0].length;
      continue;
    }
    out.push(escapeRegExp(template[i]));
    i += 1;
  }
  return new RegExp('^' + out.join('') + '$', 's');
}

function parseExtra(row: MysqlRow): Record<string, unknown> {
  try {
    const v = JSON.parse(String(row['extra'] ?? '{}'));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 该消息是否满足标题/内容模板（含 extra.title / extra.btn）；正文为通用占位文案时跳过正文匹配 */
export function matchMessage(
  row: MysqlRow,
  translations: Record<string, string>,
  titleKey: string,
  contentKey: string,
  params?: MessageParams,
): boolean {
  const contentRe = templateToRegex(translations[contentKey] ?? '', params);
  const titleRe = templateToRegex(translations[titleKey] ?? '', params);
  const btnText = (translations[BTN_KEY] ?? '').trim();
  const extra = parseExtra(row);
  if (!titleRe.test(String(extra.title ?? '').trim())) return false;
  if (String(extra.btn ?? '').trim() !== btnText) return false;
  const content = String(row.content ?? '').trim();
  if (content === GENERIC_CONTENT) return true;
  return contentRe.test(content);
}

function dumpCandidates(rows: MysqlRow[]): string {
  if (rows.length === 0) return '  （无当天消息）';
  return rows.slice(0, 10).map((r) => `  - content=${JSON.stringify(r.content)} extra=${JSON.stringify(r.extra)}`).join('\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * LitaTeam 站内信校验服务。
 * checkAnyUser：groups 中每组（如一个家族的家族长/管理员）至少一人收到匹配消息即通过。
 */
export class LitaTeamMessageService {
  private readonly svc: PkFamilyService;

  constructor(svc: PkFamilyService) {
    this.svc = svc;
  }

  async checkAnyUser(
    groups: number[][],
    titleKey: string,
    contentKey: string,
    paramsList?: MessageParams[],
    opts: { locale?: string; date?: string; wait?: number } = {},
  ): Promise<void> {
    const wait = opts.wait ?? 3;
    if (wait > 0) await sleep(wait * 1000);
    const groups2 = groups.filter((g) => g.length).map((g) => g.map(Number));
    if (groups2.length === 0) return;
    const allUsers = groups2.flat();
    const translations = await this.svc.translate([titleKey, contentKey, BTN_KEY], opts.locale ?? 'in');
    const rows = await this.svc.queryLitaTeamMessages(allUsers, { date: opts.date });
    for (let idx = 0; idx < groups2.length; idx++) {
      const group = groups2[idx];
      const params = paramsList ? paramsList[idx] : undefined;
      const candidates = rows.filter((r) => group.includes(Number(r['receive_user_id'])));
      const matched = candidates.some((r) => matchMessage(r, translations, titleKey, contentKey, params));
      if (!matched) {
        throw new Error(
          `LitaTeam 消息缺失：用户组 ${JSON.stringify(group)} 中无人收到 ${titleKey}/${contentKey}（参数=${JSON.stringify(params)}）的消息。\n` +
          `候选消息：\n${dumpCandidates(candidates)}`,
        );
      }
    }
  }
}
