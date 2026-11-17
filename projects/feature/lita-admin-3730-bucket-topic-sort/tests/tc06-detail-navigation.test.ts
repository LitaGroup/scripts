/**
 * 项目 3730 / TK-0322 用例集：详情跳转回归（用例 #12）
 * 用例来源：TK-0322 HANDOFF v5；技术方案：/task/20261117/TK-0322/TECH_DESIGN
 * 覆盖：#12 点击自建行详情 → 跳转分桶详情页 → 返回列表顺序不变（①~④）
 * 数据隔离：仅页面级自建 qa-sort- 数据（BD-01），执行前就绪确认，全部用例结束后统一清理
 * 运行：ADMIN_USERNAME=… ADMIN_PASSWORD=… node projects/feature/lita-admin-3730-bucket-topic-sort/tests/tc06-detail-navigation.test.ts
 */
import { BucketBase } from './lib/bucket-base.ts';
import { BD01, BD01_ORDER, expectedOrder, selfSubsequence, seq } from './lib/bucket-data.ts';

class BucketDetailCase extends BucketBase {
  constructor() {
    super('bucket-topic-sort-tc06');
  }

  protected async run(): Promise<void> {
    this.total = 4;

    await this.act('qa-ai 真实登录 Admin', async () => {
      await this.login(process.env.ADMIN_USERNAME ?? '', process.env.ADMIN_PASSWORD ?? '');
    });
    await this.act('BD-01 数据集就绪', async () => {
      await this.openBucketListViaMenu();
      await this.ensureBd01();
    });
    await this.act('菜单进入列表并记录显示值基线', async () => {
      await this.openBucketListViaMenu();
      await this.readSnapshot();
    });
    const baseline = await this.readSnapshot();

    await this.act('点击 qa-sort-a1 行「详情」按钮', async () => {
      await this.clickDetail('qa-sort-a1');
      // 详情组件为路由懒加载：等待详情页可观察内容（「返回清单」）渲染完成后再观察。
      await this.page!.getByText('返回清单', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
    });

    const detailUrl = this.page!.url();
    const detailText = await this.bodyText();

    await this.check('用例#12-① 地址栏路由切换到分桶详情路由（含 bucket-group/detail）', async () => {
      await this.shot('case12-detail-url');
      return {
        expect: 'location 含 /system-cloud-control/bucket-group/detail',
        real: detailUrl,
        pass: detailUrl.includes('/system-cloud-control/bucket-group/detail')
      };
    });

    await this.check('用例#12-② 详情页渲染内容，无白屏、无错误提示', async () => {
      const detailMain = (await this.page!.locator('.app-main').innerText().catch(() => '')).replace(/\s*\n\s*/g, ' | ').trim();
      const hasTopic = detailText.includes('qa-sort-a1');
      const hasReturn = await this.page!.getByText('返回清单').first().isVisible().catch(() => false);
      const errors = this.errorMessages();
      await this.shot('case12-detail-content');
      return {
        expect: '详情页渲染内容（含 qa-sort-a1 与「返回清单」），无白屏与错误提示',
        real: `正文=${detailMain.slice(0, 200)}；含 topic=${hasTopic}；返回清单可见=${hasReturn}；错误提示=${errors.join(' / ') || '无'}`,
        pass: detailMain.length > 0 && hasTopic && hasReturn && errors.length === 0
      };
    });

    await this.act('点击左侧菜单「桶的清单」返回列表', async () => {
      const back = this.page!.locator('.el-menu-item', { hasText: '桶的清单' }).first();
      await back.waitFor({ state: 'visible', timeout: 15000 });
      await back.click();
      await this.page!.waitForFunction(() => location.hash.includes('/system-cloud-control/bucket-group/list'), undefined, { timeout: 30000 });
      await this.waitTableSettled();
      await this.waitRowsPresent();
    });

    const backTopics = await this.readTopics();
    const backSnapshot = await this.readSnapshot();

    await this.check('用例#12-③ 返回列表后 12 条自建行齐全且顺序与比较器一致', async () => {
      const self = selfSubsequence(backTopics);
      const expected = expectedOrder(backTopics);
      await this.shotEl('.el-table', 'case12-back-order');
      return {
        expect: `12 条自建行：${seq(BD01_ORDER)}；全量=${seq(expected)}`,
        real: `${self.length} 条自建行：${seq(self)}；全量=${seq(backTopics)}`,
        pass: self.length === BD01.length && JSON.stringify(self) === JSON.stringify(BD01_ORDER) && JSON.stringify(backTopics) === JSON.stringify(expected)
      };
    });

    await this.check('用例#12-④ 各行显示值与基线一致', async () => {
      const diffs: string[] = [];
      for (const base of baseline) {
        const now = backSnapshot.find((r) => r.topic === base.topic);
        if (!now) { diffs.push(`${base.topic}: 行丢失`); continue; }
        if (JSON.stringify(now) !== JSON.stringify(base)) diffs.push(`${base.topic}: ${JSON.stringify(base)}→${JSON.stringify(now)}`);
      }
      await this.shotEl('.el-table', 'case12-baseline-unchanged');
      return {
        expect: '全部行 Topic/描述/规则数/创建时间显示值与详情跳转前一致',
        real: diffs.length === 0 ? '全部行显示值未变化' : diffs.join('；'),
        pass: diffs.length === 0
      };
    });
  }
}

await new BucketDetailCase().execute();
