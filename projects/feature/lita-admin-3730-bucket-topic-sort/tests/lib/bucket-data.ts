/**
 * 项目 3730 分桶列表测试数据与排序规则（期望值唯一来源：TK-0322 HANDOFF 用例表「预期结果」列）。
 *
 * 锁定比较器（TECH_DESIGN §0.3）：
 *   new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
 *   空值置末尾；完全同名按原始下标稳定（本轮不构造）。
 */
export const PREFIX = 'qa-sort-';

export interface BdRow {
  topic: string;
  description: string;
}

/** BD-01：12 条自建基础数据（TECH_DESIGN §3.1）。 */
export const BD01: BdRow[] = [
  { topic: 'qa-sort-1num', description: '数字开头边界样本' },
  { topic: 'qa-sort-9tail', description: '数字9开头样本' },
  { topic: 'qa-sort-a-b', description: '连字符边界样本' },
  { topic: 'qa-sort-a1', description: '小写字母数字样本' },
  { topic: 'qa-sort-ab', description: '连字符对照样本' },
  { topic: 'qa-sort-B2', description: 'sortdesc-only-token' },
  { topic: 'qa-sort-ABC', description: '全大写样本' },
  { topic: 'qa-sort-mid', description: '中部锚点样本' },
  { topic: 'qa-sort-topic2', description: '自然序样本2' },
  { topic: 'qa-sort-Topic3', description: '自然序样本3' },
  { topic: 'qa-sort-topic10', description: '自然序样本10' },
  { topic: 'qa-sort-zzz', description: '末尾锚点样本' }
];

/** BD-01 锁定比较器期望相对序（用例 #1③/#2②/#3②/#11③ 原文序列）。 */
export const BD01_ORDER = [
  'qa-sort-1num', 'qa-sort-9tail', 'qa-sort-a-b', 'qa-sort-a1', 'qa-sort-ab', 'qa-sort-ABC',
  'qa-sort-B2', 'qa-sort-mid', 'qa-sort-topic2', 'qa-sort-Topic3', 'qa-sort-topic10', 'qa-sort-zzz'
];

/** BD-02：新增回归插入条（用例 9）。 */
export const BD02: BdRow = { topic: 'qa-sort-insert', description: '新增回归插入样本' };

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function norm(t: string | null | undefined): string {
  return String(t ?? '').trim();
}

export function compareTopic(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 0;
  if (!na) return 1;
  if (!nb) return -1;
  const p = collator.compare(na, nb);
  if (p !== 0) return p;
  return na < nb ? -1 : 1;
}

/** 按锁定比较器计算期望顺序（相同名称保持原始下标稳定）。 */
export function expectedOrder(topics: string[]): string[] {
  return topics
    .map((topic, index) => ({ topic, index }))
    .sort((a, b) => compareTopic(a.topic, b.topic) || a.index - b.index)
    .map((item) => item.topic);
}

/** 自建数据子序列（仅 qa-sort- 前缀行，保持页面显示顺序）。 */
export function selfSubsequence(topics: string[]): string[] {
  return topics.filter((t) => t.startsWith(PREFIX));
}

/** 序列化为便于阅读与比对的字符串。 */
export function seq(topics: string[]): string {
  return topics.join(' → ');
}
