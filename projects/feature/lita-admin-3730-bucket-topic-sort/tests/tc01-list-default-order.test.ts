/**
 * 项目 3730 / TK-0322 用例集：分桶列表默认排序（用例 #1、#2）
 * 用例来源：TK-0322 HANDOFF v5（任务 322）；技术方案：/task/20261117/TK-0322/TECH_DESIGN
 * 覆盖：#1 菜单进入默认字母序（①~⑤）；#2 表头无排序控件且点击后顺序不变（①~④）
 * 数据隔离：仅页面级自建 qa-sort- 数据（BD-01，12 条），执行前就绪确认，全部用例结束后统一清理
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-3730-bucket-topic-sort/tests/tc01-list-default-order.test.ts
 */
import { BUCKET_LIST_URL, UI_BASE } from './lib/admin-base.ts';
import { BucketBase } from './lib/bucket-base.ts';
import { BD01_ORDER, expectedOrder, selfSubsequence, seq } from './lib/bucket-data.ts';

class BucketDefaultOrderCase extends BucketBase {
  constructor() {
    super('bucket-topic-sort-tc01');
  }

  protected async run(): Promise<void> {
    this.total = 9;

    await this.act('qa-ai 真实登录 Admin', async () => {
      await this.login(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    });
    await this.act('BD-01 数据集就绪（页面新增缺失项 + 就绪确认）', async () => {
      await this.openBucketListViaMenu();
      await this.ensureBd01();
    });
    await this.act('经菜单「系统控制 - 分桶分群 - 桶的清单」进入列表并读取默认顺序', async () => {
      await this.openBucketListViaMenu();
      await this.readTopics();
    });

    const topics = await this.readTopics();
    const selfOrder = selfSubsequence(topics);
    const expectedFull = expectedOrder(topics);

    await this.check('用例#1-① 地址栏路由为分桶列表路由', async () => {
      const real = this.page!.url();
      await this.shot('case1-url');
      return { expect: BUCKET_LIST_URL, real, pass: real === BUCKET_LIST_URL };
    });

    await this.check('用例#1-② 表头依次显示 Topic、描述、规则数、创建时间、操作', async () => {
      const real = await this.readHeaders();
      await this.shotEl('.el-table__header-wrapper', 'case1-headers');
      return {
        expect: 'Topic | 描述 | 规则数 | 创建时间 | 操作',
        real: real.join(' | '),
        pass: JSON.stringify(real) === JSON.stringify(['Topic', '描述', '规则数', '创建时间', '操作'])
      };
    });

    await this.check('用例#1-③ 12 条自建行按锁定字母序升序展示', async () => {
      await this.shotEl('.el-table', 'case1-self-order');
      return {
        expect: seq(BD01_ORDER),
        real: seq(selfOrder),
        pass: JSON.stringify(selfOrder) === JSON.stringify(BD01_ORDER)
      };
    });

    await this.check('用例#1-④ 全量序列与锁定比较器期望顺序一致', async () => {
      await this.shotEl('.el-table', 'case1-full-order');
      return {
        expect: seq(expectedFull),
        real: seq(topics),
        pass: JSON.stringify(topics) === JSON.stringify(expectedFull)
      };
    });

    await this.check('用例#1-⑤ 顺序为默认展示结果，无需手动触发排序', async () => {
      const sortControls = await this.sortControlCount();
      await this.shotEl('.el-table__header-wrapper', 'case1-no-sort-control');
      return {
        expect: '无排序控件且未执行排序操作（sort 控件数=0），列表加载即为字母序',
        real: `sort 控件数=${sortControls}；页面顺序=${seq(topics)}；执行记录未点击任何表头排序`,
        pass: sortControls === 0 && JSON.stringify(topics) === JSON.stringify(expectedFull)
      };
    });

    const beforeClick = topics;

    await this.act('点击「Topic」表头文字并读取顺序', async () => {
      await this.clickHeader('Topic');
      await this.readTopics();
    });

    const afterClick = await this.readTopics();

    await this.check('用例#2-① 任一表头均无排序箭头、无排序触发器、无 sortable 样式', async () => {
      const controls = await this.sortControlCount();
      const activeSort = await this.page!.locator('.el-table__header-wrapper th.ascending, .el-table__header-wrapper th.descending').count();
      await this.shotEl('.el-table__header-wrapper', 'case2-no-sort-control');
      return {
        expect: 'caret-wrapper / sort-trigger / is-sortable 均为 0，无排序箭头与触发器',
        real: `caret/sort-trigger/is-sortable=${controls}；激活排序表头=${activeSort}`,
        pass: controls === 0 && activeSort === 0
      };
    });

    await this.check('用例#2-② 点击「Topic」表头后 12 条自建行相对顺序不变', async () => {
      const real = selfSubsequence(afterClick);
      await this.shotEl('.el-table', 'case2-order-after-click');
      return {
        expect: seq(BD01_ORDER),
        real: seq(real),
        pass: JSON.stringify(real) === JSON.stringify(BD01_ORDER)
      };
    });

    await this.check('用例#2-③ 点击表头后全量序列与锁定比较器期望顺序一致', async () => {
      const expected = expectedOrder(afterClick);
      await this.shotEl('.el-table', 'case2-full-after-click');
      return {
        expect: seq(expected),
        real: seq(afterClick),
        pass: JSON.stringify(afterClick) === JSON.stringify(expected)
      };
    });

    await this.check('用例#2-④ 表头点击无排序副作用，排序仍默认生效', async () => {
      const activeSort = await this.page!.locator('.el-table__header-wrapper th.ascending, .el-table__header-wrapper th.descending').count();
      await this.shotEl('.el-table__header-wrapper', 'case2-no-active-sort');
      return {
        expect: '点击后无升降序标记（ascending/descending=0）且顺序与点击前完全一致',
        real: `ascending/descending=${activeSort}；点击前=${seq(beforeClick)}；点击后=${seq(afterClick)}`,
        pass: activeSort === 0 && JSON.stringify(beforeClick) === JSON.stringify(afterClick)
      };
    });

    this.log(`UI_BASE=${UI_BASE}`);
  }
}

await new BucketDefaultOrderCase().execute();
