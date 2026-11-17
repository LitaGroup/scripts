/**
 * 项目 3730 数据清理工具（非测试用例，不登记为平台用例）：页面级删除全部 qa-sort- 自建数据。
 *
 * 用例来源：TK-0322 HANDOFF v5 / TECH_DESIGN §3.1 清理要求
 * 数据隔离：仅删除 Topic 以 qa-sort- 开头的自建行，逐条页面删除，禁止接口/SQL 删除，禁止触碰非自建数据
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node tests/tools/cleanup-bd01.ts
 */
import { AdminBase } from '../lib/admin-base.ts';
import { PREFIX } from '../lib/bucket-data.ts';

class Cleanup extends AdminBase {
  constructor() {
    super('bucket-topic-sort-cleanup');
  }

  protected async run(): Promise<void> {
    await this.act('qa-ai 真实登录 Admin', async () => {
      await this.login(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    });
    await this.act('进入分桶列表', async () => {
      await this.openBucketListViaMenu();
    });

    let guard = 0;
    let remaining: string[] = [];
    do {
      await this.fillKeyword(PREFIX);
      await this.clickSearch();
      const rows = (await this.readSnapshot()).filter((r) => r.topic.startsWith(PREFIX));
      remaining = rows.map((r) => r.topic);
      if (remaining.length === 0) break;
      const target = remaining[0]!;
      await this.act(`页面删除自建数据 ${target}`, async () => {
        await this.clickDelete(target);
        await this.confirmDelete();
        await this.waitTableSettled();
      });
      const after = await this.readTopics();
      if (after.includes(target)) throw new Error(`清理失败：${target} 仍存在`);
      guard += 1;
      if (guard > 40) throw new Error('清理循环超过上限，终止');
    } while (remaining.length > 0);

    await this.act('确认搜索 qa-sort 结果 0 行', async () => {
      await this.fillKeyword(PREFIX);
      await this.clickSearch();
      const rows = (await this.readRows()).length;
      const empty = await this.emptyText();
      await this.shot('cleanup-final');
      if (rows !== 0) throw new Error(`清理后仍有 ${rows} 行`);
      this.log(`清理完成：qa-sort 搜索 ${rows} 行，空态文案「${empty}」`);
    });
  }
}

await new Cleanup().execute();
