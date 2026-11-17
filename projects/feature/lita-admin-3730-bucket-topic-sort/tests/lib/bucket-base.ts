/**
 * 项目 3730 分桶列表测试基类：在 AdminBase 之上提供 BD-01 数据就绪/清理与列表页专用读取。
 *
 * 数据纪律（R11）：仅页面级自建 qa-sort- 前缀数据；禁止 SQL/接口造数；禁止改动非自建数据。
 */
import { AdminBase, type BucketRow } from './admin-base.ts';
import { BD01, BD02, PREFIX, selfSubsequence } from './bucket-data.ts';

export abstract class BucketBase extends AdminBase {
  /** 当前页面搜索 qa-sort 后的行快照（不改变数据）。 */
  protected async qaSortRows(): Promise<BucketRow[]> {
    await this.fillKeyword(PREFIX);
    await this.clickSearch();
    const rows = await this.readSnapshot();
    return rows.filter((r) => r.topic.startsWith(PREFIX) || r.description.includes(PREFIX));
  }

  /**
   * 确保 BD-01 的 12 条自建数据就绪（页面构造，逐条新增缺失项），并做页面级就绪确认。
   * 造数是前置动作（act），不作为检查点；失败直接上抛，不静默继续。
   */
  protected async ensureBd01(): Promise<void> {
    await this.enterListForData();
    const existing = new Set((await this.readTopics()).filter((t) => t.startsWith(PREFIX)));
    const missing = BD01.filter((row) => !existing.has(row.topic));
    for (const row of missing) {
      await this.addTopic(row.topic, row.description);
      const topics = await this.readTopics();
      if (!topics.includes(row.topic)) throw new Error(`造数失败：${row.topic} 未出现在列表`);
    }
    await this.fillKeyword(PREFIX);
    await this.clickSearch();
    const rows = (await this.readSnapshot()).filter((r) => r.topic.startsWith(PREFIX));
    if (rows.length !== BD01.length) throw new Error(`BD-01 就绪确认失败：期望 ${BD01.length} 行，实际 ${rows.length} 行`);
    for (const row of BD01) {
      const hit = rows.find((r) => r.topic === row.topic);
      if (!hit) throw new Error(`BD-01 就绪确认失败：缺少 ${row.topic}`);
      if (hit.description !== row.description) throw new Error(`BD-01 就绪确认失败：${row.topic} 描述为「${hit.description}」`);
    }
    await this.clickReset();
    this.notes.push(`BD-01 就绪：新建 ${missing.length} 条，现有 ${rows.length} 条 qa-sort- 数据`);
  }

  /** 确保 BD-02（qa-sort-insert）当前不存在（用例 9 前置）。 */
  protected async ensureInsertAbsent(): Promise<void> {
    await this.fillKeyword(BD02.topic);
    await this.clickSearch();
    const hit = (await this.readTopics()).filter((t) => t === BD02.topic);
    if (hit.length > 0) throw new Error(`前置不满足：${BD02.topic} 已存在`);
    await this.clickReset();
    this.notes.push(`BD-02 前置确认：${BD02.topic} 搜索 0 行`);
  }

  /** 从菜单进入列表页（数据构造与常规用例统一起点）。 */
  protected async enterListForData(): Promise<void> {
    if (!this.page!.url().includes('/bucket-group/list')) {
      await this.openBucketListViaMenu();
    }
    await this.waitTableSettled();
  }
}
