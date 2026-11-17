/**
 * 项目 3730 / TK-0322 用例集：单页全量有序与分页口径（用例 #4）
 * 用例来源：TK-0322 HANDOFF v5；技术方案：/task/20261117/TK-0322/TECH_DESIGN
 * 覆盖：#4 12 行超过名义页大小 10，单页全量有序展示、分页条隐藏、无截断（①~⑤）
 * 数据隔离：仅页面级自建 qa-sort- 数据（BD-01），执行前就绪确认，全部用例结束后统一清理
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-3730-bucket-topic-sort/tests/tc03-single-page-pagination.test.ts
 */
import { BucketBase } from './lib/bucket-base.ts';
import { BD01, BD01_ORDER, expectedOrder, selfSubsequence, seq } from './lib/bucket-data.ts';

class BucketPaginationCase extends BucketBase {
  constructor() {
    super('bucket-topic-sort-tc03');
  }

  protected async run(): Promise<void> {
    this.total = 5;

    await this.act('qa-ai 真实登录 Admin', async () => {
      await this.login(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    });
    await this.act('BD-01 数据集就绪', async () => {
      await this.openBucketListViaMenu();
      await this.ensureBd01();
    });
    await this.act('菜单进入列表并读取全量行', async () => {
      await this.openBucketListViaMenu();
      await this.waitTableSettled();
      await this.readTopics();
    });

    const topics = await this.readTopics();
    const selfOrder = selfSubsequence(topics);

    await this.check('用例#4-① 12 条自建行全部在当前页表格展示，无截断', async () => {
      const missing = BD01_ORDER.filter((t) => !topics.includes(t));
      await this.shotEl('.el-table', 'case4-all-rows');
      return {
        expect: `12 条自建行全部展示（QA-SORT 行数=12），无截断`,
        real: `自建行数=${selfOrder.length}；缺失=${missing.join(',') || '无'}；表格总行数=${topics.length}`,
        pass: selfOrder.length === BD01.length && missing.length === 0
      };
    });

    await this.check('用例#4-② 自建行相对序为 BD-01 序列，全量序列与比较器期望序一致', async () => {
      const expected = expectedOrder(topics);
      await this.shotEl('.el-table', 'case4-order');
      return {
        expect: `自建子序列=${seq(BD01_ORDER)}；全量=${seq(expected)}`,
        real: `自建子序列=${seq(selfOrder)}；全量=${seq(topics)}`,
        pass: JSON.stringify(selfOrder) === JSON.stringify(BD01_ORDER) && JSON.stringify(topics) === JSON.stringify(expected)
      };
    });

    await this.check('用例#4-③ 分页条不展示（无页码、上一页/下一页、总数等可见分页内容）', async () => {
      const count = await this.paginationCount();
      const visible = await this.paginationVisible();
      const text = count > 0 ? ((await this.page!.locator('.el-pagination').first().innerText().catch(() => '')) || '') : '';
      await this.shotEl('.el-table', 'case4-no-pagination');
      return {
        expect: '分页条不可见（无页码/上一页/下一页/总数）',
        real: `el-pagination 节点数=${count}；可见=${visible}；文本=${text.replace(/\s+/g, ' ').trim() || '无'}`,
        pass: !visible
      };
    });

    await this.check('用例#4-④ 页面无任何可点击的翻页操作路径', async () => {
      const controls = await this.pagerControlCount();
      const pagerText = controls > 0 ? ((await this.page!.locator('.el-pager').innerText().catch(() => '')) || '') : '';
      await this.shot('case4-no-pager-controls');
      return {
        expect: '页码/上一页/下一页可点击控件数量=0',
        real: `分页控件数=${controls}；页码文本=${pagerText.trim() || '无'}`,
        pass: controls === 0
      };
    });

    await this.check('用例#4-⑤ 无真实翻页路径：全量单页有序、数据未截断', async () => {
      const count = await this.paginationCount();
      const rendered = (await this.readRows()).length;
      await this.shot('case4-single-page');
      return {
        expect: '无分页控件且全部数据行单页渲染（无真实翻页路径，本用例不判定为「真实翻页通过」）',
        real: `分页节点=${count}；当前页渲染行数=${rendered}（含 12 条自建行）；全量序列=${seq(topics)}`,
        pass: count === 0 && rendered === topics.length && selfOrder.length === BD01.length
      };
    });
  }
}

await new BucketPaginationCase().execute();
